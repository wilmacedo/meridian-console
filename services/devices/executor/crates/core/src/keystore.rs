//! Where the device's private key lives. The key never travels: the server only ever sees the public half.

use std::fs;
use std::path::PathBuf;

use ed25519_dalek::SigningKey;

pub trait KeyStore {
    /// The key of this device, made on first use.
    fn load_or_create(&self) -> Result<SigningKey, String>;
}

/// A key in a file readable by its owner only. For platforms without a better store and for tests; on Windows the
/// executor binary uses DPAPI instead.
pub struct FileKeyStore(pub PathBuf);

impl KeyStore for FileKeyStore {
    fn load_or_create(&self) -> Result<SigningKey, String> {
        if let Ok(bytes) = fs::read(&self.0) {
            let seed: [u8; 32] = bytes.try_into().map_err(|_| format!("{} is not a key file", self.0.display()))?;
            return Ok(SigningKey::from_bytes(&seed));
        }
        let seed: [u8; 32] = rand::random();
        if let Some(dir) = self.0.parent() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        write_private(&self.0, &seed)?;
        Ok(SigningKey::from_bytes(&seed))
    }
}

#[cfg(unix)]
fn write_private(path: &std::path::Path, data: &[u8]) -> Result<(), String> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    let mut file = fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(path).map_err(|e| e.to_string())?;
    file.write_all(data).map_err(|e| e.to_string())
}

#[cfg(not(unix))]
fn write_private(path: &std::path::Path, data: &[u8]) -> Result<(), String> {
    fs::write(path, data).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("meridian-executor-test-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir.join("sub").join("device.key")
    }

    #[test]
    fn makes_a_key_once_and_loads_the_same_one_after() {
        let path = temp("once");
        let first = FileKeyStore(path.clone()).load_or_create().unwrap();
        let again = FileKeyStore(path).load_or_create().unwrap();
        assert_eq!(first.verifying_key(), again.verifying_key());
    }

    #[cfg(unix)]
    #[test]
    fn keeps_the_key_private_to_its_owner() {
        use std::os::unix::fs::PermissionsExt;
        let path = temp("private");
        FileKeyStore(path.clone()).load_or_create().unwrap();
        assert_eq!(fs::metadata(path).unwrap().permissions().mode() & 0o777, 0o600);
    }

    #[test]
    fn refuses_a_file_that_is_not_a_key() {
        let path = temp("bad");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, b"short").unwrap();
        assert!(FileKeyStore(path).load_or_create().unwrap_err().contains("not a key file"));
    }
}
