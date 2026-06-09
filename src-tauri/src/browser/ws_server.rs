use std::net::SocketAddr;
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::accept_async;
use futures_util::{StreamExt, SinkExt};
use tauri::{AppHandle, Emitter};
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Debug)]
#[allow(dead_code)]
struct ExtensionPayload {
    url: String,
    filename: Option<String>,
    headers: Option<serde_json::Value>,
    cookies: Option<String>,
    referer: Option<String>,
    user_agent: Option<String>,
}

#[derive(Serialize, Clone)]
struct AppMessagePayload {
    url: String,
    detected_type: String,
}

pub async fn start_ws_server(app: AppHandle) {
    let addr = "127.0.0.1:6800".parse::<SocketAddr>().unwrap();
    
    // Bind the listener to the address
    let listener = match TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Failed to bind WebSocket server: {}", e);
            return;
        }
    };
    
    println!("WebSocket Native Messaging Host listening on: {}", addr);

    while let Ok((stream, _)) = listener.accept().await {
        let app_handle = app.clone();
        tokio::spawn(handle_connection(stream, app_handle));
    }
}

async fn handle_connection(raw_stream: TcpStream, app: AppHandle) {
    let ws_stream = match accept_async(raw_stream).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Error during WebSocket handshake: {}", e);
            return;
        }
    };
    
    // Split the stream to handle reading and writing independently
    let (mut write, mut read) = ws_stream.split();

    while let Some(msg) = read.next().await {
        match msg {
            Ok(tokio_tungstenite::tungstenite::Message::Text(text)) => {
                if let Ok(payload) = serde_json::from_str::<ExtensionPayload>(&text) {
                    println!("Tauri Intercepted Extension Web Request: {:?}", payload.url);
                    
                    // Emit to React FrontEnd directly bypassing basic clipboards
                    if let Err(e) = app.emit("browser-intercept-detected", AppMessagePayload {
                        url: payload.url,
                        detected_type: "BrowserExtension".to_string(),
                    }) {
                        eprintln!("Failed to emit frontend intercept event: {}", e);
                    }
                    
                    // Send ACK back to the extension
                    let _ = write.send(tokio_tungstenite::tungstenite::Message::Text(
                        r#"{"status": "captured"}"#.into()
                    )).await;
                }
            }
            Ok(tokio_tungstenite::tungstenite::Message::Close(_)) => {
                break;
            }
            _ => (),
        }
    }
}
