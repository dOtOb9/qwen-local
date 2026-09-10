use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct CreateIssueResponse {
    html_url: String,
}

#[derive(Serialize)]
struct CreateIssueBody<'a> {
    title: &'a str,
    body: &'a str,
}

/// Creates a GitHub issue via the REST API and returns its URL.
/// `repo` is in "owner/name" form (e.g. "dOtOb9/qwen-local").
#[tauri::command]
pub async fn create_github_issue(
    token: String,
    repo: String,
    title: String,
    body: String,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("qwen-local-app")
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("https://api.github.com/repos/{repo}/issues");

    let res = client
        .post(&url)
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .json(&CreateIssueBody {
            title: &title,
            body: &body,
        })
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("GitHub API error ({status}): {text}"));
    }

    let created: CreateIssueResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(created.html_url)
}
