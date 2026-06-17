use reqwest::blocking::Client;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TorrentResult {
    pub title: String,
    pub magnet: String,
    pub seeders: i64,
    pub leechers: i64,
    pub size: String,
    pub source: String,
    pub url: String,
    pub category: Option<String>,
}

fn client() -> Client {
    Client::builder()
        .user_agent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
        .timeout(Duration::from_secs(15))
        .build()
        .unwrap_or_default()
}

// ═══ 1337X ═══
fn fetch_1337x(query: &str) -> Vec<TorrentResult> {
    let c = client();
    let url = format!("https://1337x.to/search/{}/1/", urlencoding::encode(query));
    let Ok(body) = c.get(&url).send().and_then(|r| r.text()) else { return vec![] };
    let doc = Html::parse_document(&body);
    let row_sel = Selector::parse("tbody tr").unwrap();
    let name_sel = Selector::parse("td.name a:nth-child(2)").unwrap();
    let seeds_sel = Selector::parse("td.seeds").unwrap();
    let leech_sel = Selector::parse("td.leeches").unwrap();
    let size_sel = Selector::parse("td.size").unwrap();
    let mut out = vec![];
    for row in doc.select(&row_sel) {
        let Some(name_el) = row.select(&name_sel).next() else { continue };
        let title = name_el.text().collect::<String>().trim().to_string();
        if title.is_empty() { continue }
        let path = name_el.value().attr("href").unwrap_or("");
        let detail_url = format!("https://1337x.to{}", path);
        let seeds = row.select(&seeds_sel).next().and_then(|e| e.text().collect::<String>().trim().parse().ok()).unwrap_or(0);
        let leech = row.select(&leech_sel).next().and_then(|e| e.text().collect::<String>().trim().parse().ok()).unwrap_or(0);
        let size = row.select(&size_sel).next().map(|e| e.text().collect::<String>().trim().to_string()).unwrap_or_default();
        let magnet = fetch_1337x_magnet(&detail_url);
        out.push(TorrentResult { title, magnet, seeders: seeds, leechers: leech, size, source: "1337x".into(), url: detail_url, category: None });
        if out.len() >= 20 { break }
    }
    out
}

fn fetch_1337x_magnet(url: &str) -> String {
    let c = client();
    let Ok(body) = c.get(url).send().and_then(|r| r.text()) else { return String::new() };
    let doc = Html::parse_document(&body);
    for a in doc.select(&Selector::parse("a[href]").unwrap()) {
        let href = a.value().attr("href").unwrap_or("");
        if href.starts_with("magnet:") { return href.into() }
    }
    String::new()
}

// ═══ TPB (apibay) ═══
fn fetch_tpb(query: &str) -> Vec<TorrentResult> {
    let c = client();
    let url = format!("https://apibay.org/q.php?q={}&cat=", urlencoding::encode(query));
    let Ok(body) = c.get(&url).send().and_then(|r| r.text()) else { return vec![] };
    let Ok(items) = serde_json::from_str::<Vec<serde_json::Value>>(&body) else { return vec![] };
    items.iter().take(25).filter_map(|item| {
        let name = item["name"].as_str()?;
        let hash = item["info_hash"].as_str()?;
        if name.is_empty() || hash.is_empty() { return None }
        let seeds = item["seeders"].as_str().unwrap_or("0").parse().unwrap_or(0);
        let leech = item["leechers"].as_str().unwrap_or("0").parse().unwrap_or(0);
        let size_b = item["size"].as_str().unwrap_or("0").parse().unwrap_or(0u64);
        let magnet = format!("magnet:?xt=urn:btih:{}&dn={}", hash, urlencoding::encode(name));
        Some(TorrentResult {
            title: name.into(), magnet, seeders: seeds, leechers: leech,
            size: fmt_size(size_b), source: "TPB".into(),
            url: format!("https://thepiratebay.org/description.php?id={}", item["id"].as_str().unwrap_or("")),
            category: None,
        })
    }).collect()
}

// ═══ YTS ═══
fn fetch_yts(query: &str) -> Vec<TorrentResult> {
    let c = client();
    let url = format!("https://yts.mx/api/v2/list_movies.json?query_term={}&limit=25", urlencoding::encode(query));
    let Ok(body) = c.get(&url).send().and_then(|r| r.text()) else { return vec![] };
    let Ok(data) = serde_json::from_str::<serde_json::Value>(&body) else { return vec![] };
    let mut out = vec![];
    if let Some(movies) = data["data"]["movies"].as_array() {
        for m in movies {
            let t = format!("{} ({})", m["title"].as_str().unwrap_or(""), m["year"].as_i64().unwrap_or(0));
            for tor in m["torrents"].as_array().unwrap_or(&vec![]) {
                let qual = tor["quality"].as_str().unwrap_or("");
                let hash = tor["hash"].as_str().unwrap_or("");
                if hash.is_empty() { continue }
                out.push(TorrentResult {
                    title: format!("{} [{}]", t, qual),
                    magnet: format!("magnet:?xt=urn:btih:{}&dn={}", hash, urlencoding::encode(&t)),
                    seeders: tor["seeds"].as_i64().unwrap_or(0),
                    leechers: tor["peers"].as_i64().unwrap_or(0),
                    size: tor["size"].as_str().unwrap_or("").into(),
                    source: "YTS".into(),
                    url: format!("https://yts.mx{}", tor["url"].as_str().unwrap_or("")),
                    category: Some("Movies".into()),
                });
            }
        }
    }
    out.truncate(25);
    out
}

// ═══ TorrentGalaxy ═══
fn fetch_tgx(query: &str) -> Vec<TorrentResult> {
    let c = client();
    let url = format!("https://torrentgalaxy.to/torrents.php?search={}&sort=seeders&order=desc", urlencoding::encode(query));
    let Ok(body) = c.get(&url).send().and_then(|r| r.text()) else { return vec![] };
    let doc = Html::parse_document(&body);
    let row_sel = Selector::parse("div.tgxtablerow").unwrap();
    let name_sel = Selector::parse("div.tgxtablecell.clickable-row a[title]").unwrap();
    let seeds_sel = Selector::parse("div.tgxtablecell span[title='Seeders/Leechers']").unwrap();
    let size_sel = Selector::parse("div.tgxtablecell span.badge-secondary").unwrap();
    let mut out = vec![];
    for row in doc.select(&row_sel) {
        let Some(name_el) = row.select(&name_sel).next() else { continue };
        let title = name_el.value().attr("title").unwrap_or("").to_string();
        if title.is_empty() { continue }
        let path = name_el.value().attr("href").unwrap_or("");
        let detail = format!("https://torrentgalaxy.to{}", path);
        let seeds = row.select(&seeds_sel).next()
            .and_then(|e| e.text().collect::<String>().trim().split('/').next()?.trim().parse().ok())
            .unwrap_or(0);
        let size = row.select(&size_sel).next()
            .map(|e| e.text().collect::<String>().trim().to_string()).unwrap_or_default();
        let magnet = fetch_tgx_magnet(&detail);
        out.push(TorrentResult { title, magnet, seeders: seeds, leechers: 0, size, source: "TorrentGalaxy".into(), url: detail, category: None });
        if out.len() >= 20 { break }
    }
    out
}

fn fetch_tgx_magnet(url: &str) -> String {
    let c = client();
    let Ok(body) = c.get(url).send().and_then(|r| r.text()) else { return String::new() };
    let doc = Html::parse_document(&body);
    for a in doc.select(&Selector::parse("a[href]").unwrap()) {
        let href = a.value().attr("href").unwrap_or("");
        if href.starts_with("magnet:") { return href.into() }
    }
    String::new()
}

// ═══ Aggregator ═══
pub async fn search_all(query: &str) -> Vec<TorrentResult> {
    let q = query.trim().to_string();
    if q.is_empty() { return vec![]; }

    let (r1, r2, r3, r4) = tokio::task::spawn_blocking(move || {
        let a = fetch_1337x(&q);
        let b = fetch_tpb(&q);
        let c = fetch_yts(&q);
        let d = fetch_tgx(&q);
        (a, b, c, d)
    }).await.unwrap_or_default();

    let mut all: Vec<TorrentResult> = r1.into_iter().chain(r2).chain(r3).chain(r4).collect();
    all.sort_by(|a, b| b.seeders.cmp(&a.seeders));
    all.truncate(100);
    all
}

fn fmt_size(b: u64) -> String {
    if b == 0 { return "?".into() }
    let u = ["B","KB","MB","GB","TB"];
    let i = ((b.ilog2().min(50))/10) as usize;
    let i = i.min(u.len() - 1);
    format!("{:.1}{}", b as f64 / (1u64 << (i*10)) as f64, u[i])
}
