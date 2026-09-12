use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct RakutenSearchResponse {
    #[serde(rename = "Items")]
    items: Vec<RakutenItemWrapper>,
}

#[derive(Deserialize)]
struct RakutenItemWrapper {
    #[serde(rename = "Item")]
    item: RakutenItemRaw,
}

#[derive(Deserialize)]
struct RakutenItemRaw {
    #[serde(rename = "itemName")]
    item_name: String,
    #[serde(rename = "itemPrice")]
    item_price: i64,
    #[serde(rename = "itemUrl")]
    item_url: String,
    #[serde(rename = "shopName")]
    shop_name: String,
}

#[derive(Serialize)]
pub struct RakutenItem {
    name: String,
    price: i64,
    url: String,
    shop: String,
}

#[tauri::command]
pub async fn search_rakuten(application_id: String, query: String) -> Result<Vec<RakutenItem>, String> {
    let client = reqwest::Client::builder()
        .user_agent("qwen-local-app")
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get("https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601")
        .query(&[
            ("applicationId", application_id.as_str()),
            ("keyword", query.as_str()),
            ("hits", "5"),
            ("sort", "standard"),
            ("format", "json"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Rakuten API error ({status}): {text}"));
    }

    let parsed: RakutenSearchResponse = res.json().await.map_err(|e| e.to_string())?;

    Ok(parsed
        .items
        .into_iter()
        .map(|w| RakutenItem {
            name: w.item.item_name,
            price: w.item.item_price,
            url: w.item.item_url,
            shop: w.item.shop_name,
        })
        .collect())
}
