use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::Duration;

#[derive(Serialize)]
pub struct GoogleTokens {
    access_token: String,
    refresh_token: Option<String>,
}

fn generate_pkce() -> (String, String) {
    let verifier: String = rand::rng()
        .sample_iter(rand::distr::Alphanumeric)
        .take(64)
        .map(char::from)
        .collect();
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let challenge = URL_SAFE_NO_PAD.encode(hasher.finalize());
    (verifier, challenge)
}

fn extract_code(request_line: &str) -> Option<String> {
    // e.g. "GET /callback?code=XYZ&scope=... HTTP/1.1"
    let path = request_line.split_whitespace().nth(1)?;
    let query = path.split('?').nth(1)?;
    query
        .split('&')
        .find_map(|pair| pair.strip_prefix("code="))
        .map(|s| s.to_string())
}

/// Runs the desktop OAuth "loopback" flow: opens the system browser for the
/// user to sign in, listens on a local port for the redirect, then exchanges
/// the resulting code for tokens. Blocking by design (single command, no
/// interactive state to keep between calls); Tauri runs sync commands off
/// the async runtime so this doesn't stall anything else.
#[tauri::command]
pub fn google_oauth_login(
    client_id: String,
    client_secret: String,
    scope: String,
) -> Result<GoogleTokens, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    listener
        .set_nonblocking(false)
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");

    let (verifier, challenge) = generate_pkce();

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent&code_challenge={}&code_challenge_method=S256",
        urlencoding::encode(&client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(&scope),
        challenge,
    );

    open::that(&auth_url).map_err(|e| e.to_string())?;

    let (mut stream, _) = listener.accept().map_err(|e| e.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(120)))
        .ok();
    let mut buf = [0u8; 4096];
    let n = stream.read(&mut buf).map_err(|e| e.to_string())?;
    let request = String::from_utf8_lossy(&buf[..n]);
    let request_line = request.lines().next().unwrap_or_default();
    let code = extract_code(request_line).ok_or("認証コードを取得できませんでした")?;

    let body = "<html><body>ログインが完了しました。このタブを閉じてアプリに戻ってください。</body></html>";
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes());

    let client = reqwest::blocking::Client::new();
    let res = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("code", code.as_str()),
            ("code_verifier", verifier.as_str()),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect_uri.as_str()),
        ])
        .send()
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().unwrap_or_default();
        return Err(format!("Google token exchange failed ({status}): {text}"));
    }

    #[derive(Deserialize)]
    struct TokenResponse {
        access_token: String,
        refresh_token: Option<String>,
    }
    let tokens: TokenResponse = res.json().map_err(|e| e.to_string())?;

    Ok(GoogleTokens {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
    })
}

fn refresh_access_token(
    client: &reqwest::blocking::Client,
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
) -> Result<String, String> {
    let res = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("refresh_token", refresh_token),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().unwrap_or_default();
        return Err(format!("Google token refresh failed ({status}): {text}"));
    }

    #[derive(Deserialize)]
    struct RefreshResponse {
        access_token: String,
    }
    let refreshed: RefreshResponse = res.json().map_err(|e| e.to_string())?;
    Ok(refreshed.access_token)
}

#[derive(Serialize)]
pub struct EmailSummary {
    from: String,
    subject: String,
    date: String,
    snippet: String,
}

#[derive(Deserialize)]
struct MessageListResponse {
    messages: Option<Vec<MessageId>>,
}

#[derive(Deserialize)]
struct MessageId {
    id: String,
}

#[derive(Deserialize)]
struct MessageDetail {
    snippet: Option<String>,
    payload: Option<MessagePayload>,
}

#[derive(Deserialize)]
struct MessagePayload {
    headers: Vec<MessageHeader>,
}

#[derive(Deserialize)]
struct MessageHeader {
    name: String,
    value: String,
}

#[tauri::command]
pub fn fetch_gmail_messages(
    client_id: String,
    client_secret: String,
    refresh_token: String,
    limit: u32,
) -> Result<Vec<EmailSummary>, String> {
    let client = reqwest::blocking::Client::new();
    let access_token = refresh_access_token(&client, &client_id, &client_secret, &refresh_token)?;

    let list_res = client
        .get("https://gmail.googleapis.com/gmail/v1/users/me/messages")
        .bearer_auth(&access_token)
        .query(&[("maxResults", limit.to_string())])
        .send()
        .map_err(|e| e.to_string())?;

    if !list_res.status().is_success() {
        let status = list_res.status();
        let text = list_res.text().unwrap_or_default();
        return Err(format!("Gmail API error ({status}): {text}"));
    }

    let list: MessageListResponse = list_res.json().map_err(|e| e.to_string())?;
    let ids = list.messages.unwrap_or_default();

    let mut summaries = Vec::new();
    for m in ids {
        let detail_res = client
            .get(format!(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}",
                m.id
            ))
            .bearer_auth(&access_token)
            .query(&[
                ("format", "metadata"),
                ("metadataHeaders", "From"),
                ("metadataHeaders", "Subject"),
                ("metadataHeaders", "Date"),
            ])
            .send()
            .map_err(|e| e.to_string())?;

        if !detail_res.status().is_success() {
            continue;
        }

        let detail: MessageDetail = match detail_res.json() {
            Ok(d) => d,
            Err(_) => continue,
        };

        let headers = detail.payload.map(|p| p.headers).unwrap_or_default();
        let header = |name: &str| {
            headers
                .iter()
                .find(|h| h.name.eq_ignore_ascii_case(name))
                .map(|h| h.value.clone())
                .unwrap_or_default()
        };

        summaries.push(EmailSummary {
            from: header("From"),
            subject: header("Subject"),
            date: header("Date"),
            snippet: detail.snippet.unwrap_or_default(),
        });
    }

    Ok(summaries)
}
