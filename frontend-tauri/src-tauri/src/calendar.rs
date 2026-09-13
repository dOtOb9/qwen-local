use crate::gmail::refresh_access_token;
use chrono::{Duration, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct CalendarEvent {
    summary: String,
    start: String,
    end: String,
    location: Option<String>,
}

#[derive(Deserialize)]
struct EventListResponse {
    items: Option<Vec<EventRaw>>,
}

#[derive(Deserialize)]
struct EventRaw {
    summary: Option<String>,
    location: Option<String>,
    start: EventDateTime,
    end: EventDateTime,
}

#[derive(Deserialize)]
struct EventDateTime {
    #[serde(rename = "dateTime")]
    date_time: Option<String>,
    date: Option<String>,
}

/// 直近7日以内の予定を取得する。認可には既存の`google_oauth_login`
/// (`gmail.rs`)で取得したrefresh_tokenを、Calendarスコープで認可した
/// ものを使う想定(Gmail用のrefresh_tokenとはスコープが異なるため別物)。
#[tauri::command]
pub fn list_calendar_events(
    client_id: String,
    client_secret: String,
    refresh_token: String,
) -> Result<Vec<CalendarEvent>, String> {
    let client = reqwest::blocking::Client::new();
    let access_token = refresh_access_token(&client, &client_id, &client_secret, &refresh_token)?;

    let now = Utc::now();
    let time_min = now.to_rfc3339_opts(SecondsFormat::Secs, true);
    let time_max = (now + Duration::days(7)).to_rfc3339_opts(SecondsFormat::Secs, true);

    let res = client
        .get("https://www.googleapis.com/calendar/v3/calendars/primary/events")
        .bearer_auth(&access_token)
        .query(&[
            ("timeMin", time_min.as_str()),
            ("timeMax", time_max.as_str()),
            ("singleEvents", "true"),
            ("orderBy", "startTime"),
            ("maxResults", "20"),
        ])
        .send()
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().unwrap_or_default();
        return Err(format!("Google Calendar API error ({status}): {text}"));
    }

    let parsed: EventListResponse = res.json().map_err(|e| e.to_string())?;

    Ok(parsed
        .items
        .unwrap_or_default()
        .into_iter()
        .map(|e| CalendarEvent {
            summary: e.summary.unwrap_or_else(|| "(タイトルなし)".to_string()),
            start: e.start.date_time.or(e.start.date).unwrap_or_default(),
            end: e.end.date_time.or(e.end.date).unwrap_or_default(),
            location: e.location,
        })
        .collect())
}
