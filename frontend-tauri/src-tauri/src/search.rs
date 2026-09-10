use scraper::{Html, Selector};
use serde::Serialize;

#[derive(Serialize)]
pub struct SearchResult {
    title: String,
    url: String,
    snippet: String,
}

#[tauri::command]
pub async fn search_web(query: String) -> Result<Vec<SearchResult>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    // DuckDuckGo's HTML endpoint returns a bot-check page for simple GET requests;
    // it expects a form POST with browser-like headers, mirroring what the real
    // search form on html.duckduckgo.com/html/ sends.
    let res = client
        .post("https://html.duckduckgo.com/html/")
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "ja,en-US;q=0.9,en;q=0.8")
        .header("Referer", "https://duckduckgo.com/")
        .form(&[("q", query.as_str())])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let body = res.text().await.map_err(|e| e.to_string())?;

    let document = Html::parse_document(&body);
    // Only organic web results; excludes the "result--ad" sponsored block.
    let result_sel = Selector::parse("div.result.web-result").unwrap();
    let title_sel = Selector::parse("a.result__a").unwrap();
    let snippet_sel = Selector::parse("a.result__snippet, div.result__snippet").unwrap();

    let mut results = Vec::new();
    for el in document.select(&result_sel) {
        let Some(title_el) = el.select(&title_sel).next() else {
            continue;
        };

        let title = title_el.text().collect::<String>().trim().to_string();
        if title.is_empty() {
            continue;
        }

        let raw_href = title_el.value().attr("href").unwrap_or("");
        let url = extract_real_url(raw_href);
        let snippet = el
            .select(&snippet_sel)
            .next()
            .map(|s| s.text().collect::<String>().trim().to_string())
            .unwrap_or_default();

        results.push(SearchResult { title, url, snippet });

        if results.len() >= 5 {
            break;
        }
    }

    Ok(results)
}

/// DuckDuckGo's HTML results wrap links in a redirect like
/// `//duckduckgo.com/l/?uddg=<url-encoded target>&rut=...`; unwrap it.
fn extract_real_url(href: &str) -> String {
    if let Some(idx) = href.find("uddg=") {
        let after = &href[idx + "uddg=".len()..];
        let end = after.find('&').unwrap_or(after.len());
        if let Ok(decoded) = urlencoding::decode(&after[..end]) {
            return decoded.into_owned();
        }
    }
    href.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn search_returns_results() {
        let results = search_web("RTX 4070".to_string()).await.unwrap();
        eprintln!("got {} results", results.len());
        for r in &results {
            eprintln!("- {} | {} | {}", r.title, r.url, r.snippet);
        }
        assert!(!results.is_empty(), "expected at least one search result");
    }
}
