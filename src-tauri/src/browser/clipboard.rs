use crate::utils::classifier::{classify_url, DownloadType};
use arboard::Clipboard;
use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use url::Url;

#[derive(Serialize, Clone)]
pub struct ClipboardPayload {
    pub url: String,
    pub detected_type: String,
}

pub fn start_clipboard_monitor(app: AppHandle) {
    std::thread::spawn(move || {
        let mut clipboard = match Clipboard::new() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Failed to initialize clipboard: {}", e);
                return;
            }
        };

        let mut last_copied_text = String::new();

        loop {
            // Polling interval
            std::thread::sleep(Duration::from_millis(1500));

            if let Ok(text) = clipboard.get_text() {
                let trimmed = text.trim();

                // Must be new and a reasonable single-line URL length
                if trimmed != last_copied_text
                    && trimmed.len() > 6
                    && trimmed.len() < 2000
                    && !trimmed.contains('\n')
                    && !trimmed.contains('\r')
                {
                    last_copied_text = trimmed.to_string();

                    // Only treat as URL if the entire text is a valid URL
                    // (not random text containing a URL somewhere in the middle)
                    let is_valid_url = Url::parse(trimmed).is_ok();
                    let d_type = classify_url(trimmed);

                    if is_valid_url && d_type != DownloadType::Unknown {
                        let type_str = format!("{:?}", d_type);

                        // Fire Tauri IPC Intercept Event hitting front-end
                        let _ = app.emit(
                            "clipboard-url-detected",
                            ClipboardPayload {
                                url: trimmed.to_string(),
                                detected_type: type_str,
                            },
                        );

                        println!("OS Clipboard Extracted Valid URL: {}", trimmed);
                    }
                }
            }
        }
    });
}
