// Manual reqwest smoke test for Range-request debugging.
// Hits a real public CDN - flaky in CI, run with: cargo test --test crash_test -- --ignored
use reqwest::Client;

#[tokio::test]
#[ignore = "requires network access; run manually with --ignored"]
async fn test_req() {
    let client = Client::new();
    let res = client
        .get("https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4")
        .send()
        .await
        .expect("network request failed");
    println!("Status: {}", res.status());
    assert!(res.status().is_success());
}
