use rusqlite::Connection;
use serde::Serialize;
use std::env;
use std::fs;
use std::path::PathBuf;

#[derive(Serialize)]
pub struct EbookEntry {
    source: String,
    external_id: String,
    title: String,
    authors: String,
    purchase_date: i64,
}

/// Reads Kindle for PC's local library sync cache. This file is written by
/// the official app itself (no login or network access needed here) at
/// %LOCALAPPDATA%\Amazon\Kindle\Cache\KindleSyncMetadataCache.xml
#[tauri::command]
pub fn sync_kindle_library() -> Result<Vec<EbookEntry>, String> {
    let local_appdata = env::var("LOCALAPPDATA").map_err(|e| e.to_string())?;
    let path = PathBuf::from(local_appdata).join("Amazon/Kindle/Cache/KindleSyncMetadataCache.xml");

    if !path.exists() {
        return Ok(vec![]);
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let doc = roxmltree::Document::parse(&content).map_err(|e| e.to_string())?;

    let mut entries = Vec::new();
    for meta in doc.descendants().filter(|n| n.has_tag_name("meta_data")) {
        let asin = child_text(meta, "ASIN").unwrap_or_default();
        let title = child_text(meta, "title").unwrap_or_default();
        if title.is_empty() {
            continue;
        }
        let authors = meta
            .children()
            .find(|n| n.has_tag_name("authors"))
            .map(|authors_node| {
                authors_node
                    .children()
                    .filter(|n| n.has_tag_name("author"))
                    .filter_map(|n| n.text())
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_default();
        let purchase_date = child_text(meta, "purchase_date")
            .and_then(|s| chrono_to_epoch(&s))
            .unwrap_or(0);

        entries.push(EbookEntry {
            source: "kindle".to_string(),
            external_id: asin,
            title,
            authors,
            purchase_date,
        });
    }

    Ok(entries)
}

fn child_text<'a>(node: roxmltree::Node<'a, 'a>, tag: &str) -> Option<String> {
    node.children()
        .find(|n| n.has_tag_name(tag))
        .and_then(|n| n.text())
        .map(|s| s.to_string())
}

/// Parses an ISO-8601-ish timestamp like 2026-06-15T13:53:32+0000 into a unix
/// epoch (seconds). Falls back gracefully since this is only used for sorting.
fn chrono_to_epoch(s: &str) -> Option<i64> {
    // Minimal parser: YYYY-MM-DDTHH:MM:SS, ignoring timezone offset (data is UTC anyway).
    let date_part = s.get(0..19)?;
    let year: i64 = date_part.get(0..4)?.parse().ok()?;
    let month: i64 = date_part.get(5..7)?.parse().ok()?;
    let day: i64 = date_part.get(8..10)?.parse().ok()?;
    let hour: i64 = date_part.get(11..13)?.parse().ok()?;
    let min: i64 = date_part.get(14..16)?.parse().ok()?;
    let sec: i64 = date_part.get(17..19)?.parse().ok()?;

    // Days since epoch via a simple civil-to-days algorithm (Howard Hinnant's).
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as i64;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;

    Some(days * 86400 + hour * 3600 + min * 60 + sec)
}

/// Reads Kinoppy's local library databases. Kinoppy stores its library as
/// plain (unencrypted) SQLite files with a `.dat` extension under
/// %APPDATA%\Kinokuniya\Kinoppy3\ - no login needed.
#[tauri::command]
pub fn sync_kinoppy_library() -> Result<Vec<EbookEntry>, String> {
    let appdata = env::var("APPDATA").map_err(|e| e.to_string())?;
    let dir = PathBuf::from(appdata).join("Kinokuniya/Kinoppy3");

    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut entries = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("dat") {
            continue;
        }
        if !is_sqlite_file(&path) {
            continue;
        }

        let conn = match Connection::open_with_flags(
            &path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        ) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let mut stmt = match conn.prepare(
            "SELECT product_id, title, author_display, purchase_date FROM Book",
        ) {
            Ok(s) => s,
            Err(_) => continue,
        };

        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<i64>>(3)?,
            ))
        });

        let Ok(rows) = rows else { continue };

        for row in rows.flatten() {
            let (product_id, title, authors, purchase_date) = row;
            if title.is_empty() || !seen.insert(product_id.clone()) {
                continue;
            }
            entries.push(EbookEntry {
                source: "kinoppy".to_string(),
                external_id: product_id,
                title,
                authors: authors.unwrap_or_default(),
                purchase_date: purchase_date.unwrap_or(0),
            });
        }
    }

    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kindle_library_parses() {
        let entries = sync_kindle_library().unwrap();
        eprintln!("kindle: {} entries", entries.len());
        for e in entries.iter().take(5) {
            eprintln!("- {} | {} | {}", e.title, e.authors, e.purchase_date);
        }
        assert!(!entries.is_empty());
    }

    #[test]
    fn kinoppy_library_parses() {
        let entries = sync_kinoppy_library().unwrap();
        eprintln!("kinoppy: {} entries", entries.len());
        for e in entries.iter().take(5) {
            eprintln!("- {} | {} | {}", e.title, e.authors, e.purchase_date);
        }
        assert!(!entries.is_empty());
    }
}

fn is_sqlite_file(path: &PathBuf) -> bool {
    use std::io::Read;
    let Ok(mut file) = fs::File::open(path) else {
        return false;
    };
    let mut header = [0u8; 16];
    if file.read_exact(&mut header).is_err() {
        return false;
    }
    &header == b"SQLite format 3\0"
}
