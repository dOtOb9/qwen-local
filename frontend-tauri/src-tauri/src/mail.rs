use native_tls::TlsConnector;
use serde::Serialize;

#[derive(Serialize)]
pub struct EmailSummary {
    from: String,
    subject: String,
    date: String,
    unread: bool,
}

/// Fetches the most recent emails from a Vivaldi.net (or any standard IMAP)
/// mailbox. Vivaldi.net exposes plain IMAP over TLS with no OAuth needed:
/// imap.vivaldi.net:993. Use an app-specific password if 2FA is enabled.
#[tauri::command]
pub fn fetch_recent_emails(
    username: String,
    password: String,
    limit: u32,
) -> Result<Vec<EmailSummary>, String> {
    let tls = TlsConnector::builder().build().map_err(|e| e.to_string())?;
    let client = imap::connect(("imap.vivaldi.net", 993), "imap.vivaldi.net", &tls)
        .map_err(|e| e.to_string())?;

    let mut session = client
        .login(&username, &password)
        .map_err(|(e, _)| e.to_string())?;

    let mailbox = session.select("INBOX").map_err(|e| e.to_string())?;
    let total = mailbox.exists;
    if total == 0 {
        return Ok(vec![]);
    }

    let start = total.saturating_sub(limit.saturating_sub(1)).max(1);
    let range = format!("{start}:{total}");

    let messages = session
        .fetch(&range, "(FLAGS ENVELOPE)")
        .map_err(|e| e.to_string())?;

    let mut summaries: Vec<EmailSummary> = messages
        .iter()
        .filter_map(|msg| {
            let envelope = msg.envelope()?;
            let subject = envelope
                .subject
                .map(|s| decode_header(s))
                .unwrap_or_default();
            let from = envelope
                .from
                .as_ref()
                .and_then(|addrs| addrs.first())
                .map(|a| {
                    let name = a.name.map(decode_header);
                    let mailbox = a.mailbox.map(|m| String::from_utf8_lossy(m).into_owned());
                    let host = a.host.map(|h| String::from_utf8_lossy(h).into_owned());
                    match (name, mailbox, host) {
                        (Some(n), _, _) if !n.is_empty() => n,
                        (_, Some(m), Some(h)) => format!("{m}@{h}"),
                        _ => "unknown".to_string(),
                    }
                })
                .unwrap_or_else(|| "unknown".to_string());
            let date = envelope
                .date
                .map(|d| String::from_utf8_lossy(d).into_owned())
                .unwrap_or_default();
            let unread = !msg.flags().iter().any(|f| matches!(f, imap::types::Flag::Seen));

            Some(EmailSummary {
                from,
                subject,
                date,
                unread,
            })
        })
        .collect();

    summaries.reverse();
    let _ = session.logout();

    Ok(summaries)
}

fn decode_header(bytes: &[u8]) -> String {
    let raw = String::from_utf8_lossy(bytes).into_owned();
    rfc2047_decoder::decode(raw.as_bytes()).unwrap_or(raw)
}
