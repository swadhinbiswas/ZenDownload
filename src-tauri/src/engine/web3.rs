// Decentralized Storage Gateway Router
// Resolves web3 protocols into accessible HTTP endpoints.

pub struct Web3Resolver;

impl Web3Resolver {
    /// Checks if a URL is a Web3 protocol
    pub fn is_web3_protocol(url: &str) -> bool {
        url.starts_with("ipfs://") || url.starts_with("ipns://") || url.starts_with("ar://")
    }

    /// Resolves a Web3 URL to a public HTTP gateway
    pub fn resolve_gateway(url: &str) -> String {
        if url.starts_with("ipfs://") {
            let cid = url.trim_start_matches("ipfs://");
            format!("https://ipfs.io/ipfs/{}", cid)
        } else if url.starts_with("ipns://") {
            let name = url.trim_start_matches("ipns://");
            format!("https://ipfs.io/ipns/{}", name)
        } else if url.starts_with("ar://") {
            let tx_id = url.trim_start_matches("ar://");
            format!("https://arweave.net/{}", tx_id)
        } else {
            url.to_string()
        }
    }
}
