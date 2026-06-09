// Can't easily construct AppHandle in tests. 
// We will test `reqwest` manually to see if Range requests fail.
use reqwest::Client;
#[tokio::test]
async fn test_req() {
    let client = Client::new();
    let res = client.get("https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4").send().await.unwrap();
    println!("Status: {}", res.status());
}