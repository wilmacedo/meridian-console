use std::path::PathBuf;

use serde::Deserialize;

/// The only thing the owner configures: where the server is and which server to trust.
#[derive(Deserialize)]
pub struct File {
    /// wss://host/api/services/devices/executor
    pub url: String,
    /// The server's public key, copied from the server (`device_enroll`) when the executor is installed.
    pub server_public_key: String,
    /// What this device is called on the server; the host name when absent.
    pub name: Option<String>,
}

pub fn default_dir() -> PathBuf {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from))
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("meridian-executor")
}

pub fn load(path: Option<PathBuf>) -> Result<File, String> {
    let path = path.unwrap_or_else(|| default_dir().join("config.json"));
    let text = std::fs::read_to_string(&path).map_err(|e| format!("cannot read {}: {e}", path.display()))?;
    serde_json::from_str(&text).map_err(|e| format!("{} is not a valid config: {e}", path.display()))
}
