#![allow(dead_code)]
use keyring::Entry;

pub struct SecureStorage;

impl SecureStorage {
    fn get_entry(service: &str, username: &str) -> Entry {
        Entry::new(service, username).unwrap()
    }

    pub fn save_token(service: &str, username: &str, token: &str) -> Result<(), String> {
        let entry = Self::get_entry(service, username);
        entry.set_password(token).map_err(|e| e.to_string())
    }

    pub fn get_token(service: &str, username: &str) -> Result<String, String> {
        let entry = Self::get_entry(service, username);
        entry.get_password().map_err(|e| e.to_string())
    }

    pub fn delete_token(service: &str, username: &str) -> Result<(), String> {
        let entry = Self::get_entry(service, username);
        entry.delete_password().map_err(|e| e.to_string())
    }
}
