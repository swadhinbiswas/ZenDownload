use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct M3uEntry {
    pub name: String,
    pub url: String,
    pub duration: Option<i64>,
    pub group: Option<String>,
    pub logo: Option<String>,
    pub tvg_id: Option<String>,
    pub tvg_name: Option<String>,
    pub user_agent: Option<String>,
}

/// Parse M3U playlist content into entries, handling EXTVLCOPT lines
/// for extra stream attributes (http-referrer, http-user-agent, etc.)
pub fn parse_m3u(content: &str) -> Vec<M3uEntry> {
    let mut entries = Vec::new();
    let mut current: Option<M3uEntry> = None;
    // Track pending EXTVLCOPT attributes that apply to the next URL
    let mut pending_referrer: Option<String> = None;
    let mut pending_user_agent: Option<String> = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() { continue; }

        if trimmed.starts_with("#EXTM3U") {
            continue;
        }

        if trimmed.starts_with("#EXTVLCOPT:") {
            let opt = &trimmed[11..];
            if let Some(eq_pos) = opt.find('=') {
                let key = opt[..eq_pos].trim().to_lowercase();
                let val = opt[eq_pos + 1..].trim().to_string();
                match key.as_str() {
                    "http-referrer" => pending_referrer = Some(val),
                    "http-user-agent" => pending_user_agent = Some(val),
                    _ => {}
                }
            }
            continue;
        }

        if trimmed.starts_with("#KODIPROP:") {
            continue;
        }

        if trimmed.starts_with("#EXTINF:") {
            let after_prefix = &trimmed[8..];
            // Split on first comma: everything before is duration+attrs, everything after is the name
            let comma_pos = after_prefix.find(',');
            let (attrs_part, name_str) = match comma_pos {
                Some(p) => (&after_prefix[..p], after_prefix[p + 1..].trim().to_string()),
                None => (after_prefix, String::new()),
            };

            let duration = attrs_part.split(' ').next()
                .and_then(|d| d.parse::<f64>().ok())
                .map(|d| d as i64);

            // The part after the last comma (if any) is the display name
            // But we already set name_str above from the split.

            let mut entry = M3uEntry {
                name: name_str.clone(),
                url: String::new(),
                duration,
                group: None,
                logo: None,
                tvg_id: None,
                tvg_name: None,
                user_agent: pending_user_agent.clone(),
            };

            // Parse key="value" attributes from attrs_part (skip duration number)
            let attr_section = attrs_part.splitn(2, ' ').nth(1).unwrap_or("");
            let mut attr_name = String::new();
            let mut attr_value = String::new();
            let mut in_quote = false;
            let mut parsing_name = true;

            for c in attr_section.chars() {
                if parsing_name {
                    if c == '=' {
                        parsing_name = false;
                    } else if c.is_whitespace() {
                        if !attr_name.is_empty() {
                            // Bogus space in attribute name -> reset
                            attr_name.clear();
                        }
                    } else {
                        attr_name.push(c);
                    }
                } else if !in_quote {
                    if c == '"' {
                        in_quote = true;
                        attr_value.clear();
                    } else if c.is_whitespace() {
                        // Skip whitespace before next attribute
                        parsing_name = true;
                        attr_name.clear();
                    }
                } else {
                    // Inside quotes
                    if c == '"' {
                        in_quote = false;
                        // Apply attribute
                        match attr_name.trim() {
                            "tvg-logo" => entry.logo = Some(attr_value.clone()),
                            "tvg-id" => entry.tvg_id = Some(attr_value.clone()),
                            "tvg-name" => entry.tvg_name = Some(attr_value.clone()),
                            "group-title" => entry.group = Some(attr_value.clone()),
                            "http-user-agent" => entry.user_agent = Some(attr_value.clone()),
                            _ => {}
                        }
                        attr_name.clear();
                        attr_value.clear();
                        parsing_name = true;
                    } else {
                        attr_value.push(c);
                    }
                }
            }

            // Fallback: the name_str (text after last comma) might still have leading
            // whitespace from after the last attribute. Clean it.
            entry.name = entry.name.trim().to_string();

            current = Some(entry);
        } else if trimmed.starts_with('#') {
            continue;
        } else if !trimmed.is_empty() {
            // URL line
            if let Some(mut entry) = current.take() {
                entry.url = trimmed.to_string();
                if entry.name.is_empty() {
                    // Generate a name from the URL
                    entry.name = url_to_channel_name(&entry.url);
                }
                // Apply pending EXTVLCOPT attributes
                if entry.user_agent.is_none() {
                    entry.user_agent = pending_user_agent.take();
                }
                if pending_referrer.is_some() {
                    pending_referrer.take();
                }
                entries.push(entry);
            }
        }
    }

    entries
}

/// Generate a human-readable channel name from a URL
fn url_to_channel_name(url: &str) -> String {
    if let Ok(parsed) = url::Url::parse(url) {
        parsed.host_str()
            .and_then(|h| h.split('.').nth(0))
            .unwrap_or("Unknown")
            .to_string()
    } else {
        "Unknown".to_string()
    }
}

// ISO 639-3 to display name mapping for languages
pub static LANG_MAP: once_cell::sync::Lazy<std::collections::HashMap<&'static str, &'static str>> =
    once_cell::sync::Lazy::new(|| {
        let mut m = std::collections::HashMap::new();
        m.insert("eng", "English");
        m.insert("spa", "Spanish");
        m.insert("fra", "French");
        m.insert("fre", "French");
        m.insert("deu", "German");
        m.insert("ger", "German");
        m.insert("por", "Portuguese");
        m.insert("ara", "Arabic");
        m.insert("hin", "Hindi");
        m.insert("tur", "Turkish");
        m.insert("rus", "Russian");
        m.insert("ita", "Italian");
        m.insert("jpn", "Japanese");
        m.insert("kor", "Korean");
        m.insert("zho", "Chinese");
        m.insert("chi", "Chinese");
        m.insert("tha", "Thai");
        m.insert("vie", "Vietnamese");
        m.insert("ind", "Indonesian");
        m.insert("msa", "Malay");
        m.insert("may", "Malay");
        m.insert("pol", "Polish");
        m.insert("dut", "Dutch");
        m.insert("nld", "Dutch");
        m.insert("gre", "Greek");
        m.insert("ell", "Greek");
        m.insert("ron", "Romanian");
        m.insert("rum", "Romanian");
        m.insert("hun", "Hungarian");
        m.insert("ces", "Czech");
        m.insert("cze", "Czech");
        m.insert("swe", "Swedish");
        m.insert("nor", "Norwegian");
        m.insert("dan", "Danish");
        m.insert("fin", "Finnish");
        m.insert("heb", "Hebrew");
        m.insert("fas", "Persian");
        m.insert("per", "Persian");
        m.insert("urd", "Urdu");
        m.insert("ben", "Bengali");
        m.insert("tam", "Tamil");
        m.insert("tel", "Telugu");
        m.insert("cat", "Catalan");
        m.insert("eus", "Basque");
        m.insert("baq", "Basque");
        m.insert("glg", "Galician");
        m.insert("ukr", "Ukrainian");
        m.insert("srp", "Serbian");
        m.insert("hrv", "Croatian");
        m.insert("bul", "Bulgarian");
        m.insert("slk", "Slovak");
        m.insert("slo", "Slovak");
        m.insert("slv", "Slovenian");
        m.insert("lit", "Lithuanian");
        m.insert("lav", "Latvian");
        m.insert("est", "Estonian");
        m.insert("alb", "Albanian");
        m.insert("sqi", "Albanian");
        m.insert("mkd", "Macedonian");
        m.insert("mac", "Macedonian");
        m.insert("bos", "Bosnian");
        m.insert("mne", "Montenegrin");
        m.insert("swa", "Swahili");
        m.insert("amh", "Amharic");
        m.insert("som", "Somali");
        m.insert("hau", "Hausa");
        m.insert("yor", "Yoruba");
        m.insert("ibo", "Igbo");
        m.insert("zul", "Zulu");
        m.insert("xho", "Xhosa");
        m.insert("afr", "Afrikaans");
        m.insert("tat", "Tatar");
        m.insert("kaz", "Kazakh");
        m.insert("uzb", "Uzbek");
        m.insert("mon", "Mongolian");
        m.insert("khk", "Mongolian");
        m.insert("nep", "Nepali");
        m.insert("sin", "Sinhala");
        m.insert("mya", "Burmese");
        m.insert("bur", "Burmese");
        m.insert("khm", "Khmer");
        m.insert("lao", "Lao");
        m.insert("tgl", "Tagalog");
        m.insert("fil", "Filipino");
        m.insert("mlt", "Maltese");
        m.insert("isl", "Icelandic");
        m.insert("ice", "Icelandic");
        m.insert("epo", "Esperanto");
        m.insert("lat", "Latin");
        m.insert("san", "Sanskrit");
        m
    });

pub async fn import_m3u_from_url(app: &tauri::AppHandle, url: &str) -> Result<Vec<M3uEntry>, String> {
    use tauri::Emitter;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let content = client.get(url).send().await
        .map_err(|e| format!("Failed to fetch M3U: {}", e))?
        .text().await
        .map_err(|e| format!("Failed to read M3U: {}", e))?;

    let entries = parse_m3u(&content);
    let _ = app.emit("m3u-imported", serde_json::json!({
        "url": url,
        "count": entries.len(),
    }));
    Ok(entries)
}

pub fn m3u_to_m3u8(entries: &[M3uEntry]) -> String {
    let mut out = String::from("#EXTM3U\n");
    for entry in entries {
        out.push_str(&format!("#EXTINF:{},{}\n", entry.duration.unwrap_or(-1), entry.name));
        out.push_str(&format!("{}\n", entry.url));
    }
    out
}
