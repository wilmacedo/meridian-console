use std::io::Write;

use crate::config::default_dir;

const MAX_BYTES: u64 = 512 * 1024;

/// One line per event, in a file next to the config (the executor runs with no console). Never holds a secret:
/// only what happened.
pub fn line(message: &str) {
    let dir = default_dir();
    let _ = std::fs::create_dir_all(&dir);
    let file = dir.join("executor.log");
    if std::fs::metadata(&file).map(|m| m.len() > MAX_BYTES).unwrap_or(false) {
        let _ = std::fs::rename(&file, dir.join("executor.log.old"));
    }
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&file) {
        let _ = writeln!(f, "{} {message}", now());
    }
}

fn now() -> String {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    format!("{secs}")
}
