//! The device key on Windows: a file only this user can decrypt. DPAPI ties the blob to the Windows account, so
//! the file is useless on another machine or to another user, and the key never sits on disk in the clear.

use std::path::PathBuf;

use meridian_executor_core::SigningKey;
use meridian_executor_core::keystore::KeyStore;
use windows::Win32::Foundation::{HLOCAL, LocalFree};
use windows::Win32::Security::Cryptography::{CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptProtectData, CryptUnprotectData};
use windows::core::w;

pub struct DpapiKeyStore(pub PathBuf);

fn blob(data: &[u8]) -> CRYPT_INTEGER_BLOB {
    CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 }
}

fn take(out: CRYPT_INTEGER_BLOB) -> Vec<u8> {
    let bytes = unsafe { std::slice::from_raw_parts(out.pbData, out.cbData as usize) }.to_vec();
    unsafe { LocalFree(Some(HLOCAL(out.pbData as *mut _))) };
    bytes
}

pub fn protect(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut out = CRYPT_INTEGER_BLOB::default();
    unsafe { CryptProtectData(&blob(data), w!("meridian-executor device key"), None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out) }.map_err(|e| format!("DPAPI could not protect the key: {e}"))?;
    Ok(take(out))
}

pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut out = CRYPT_INTEGER_BLOB::default();
    unsafe { CryptUnprotectData(&blob(data), None, None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out) }.map_err(|e| format!("DPAPI could not open the key (is this another Windows user?): {e}"))?;
    Ok(take(out))
}

impl KeyStore for DpapiKeyStore {
    fn load_or_create(&self) -> Result<SigningKey, String> {
        if let Ok(stored) = std::fs::read(&self.0) {
            let seed: [u8; 32] = unprotect(&stored)?.try_into().map_err(|_| format!("{} is not a key file", self.0.display()))?;
            return Ok(SigningKey::from_bytes(&seed));
        }
        let seed: [u8; 32] = meridian_executor_core::auth::new_nonce();
        if let Some(dir) = self.0.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        std::fs::write(&self.0, protect(&seed)?).map_err(|e| e.to_string())?;
        Ok(SigningKey::from_bytes(&seed))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_blob_on_disk_is_not_the_key_and_opens_back_to_it() {
        let seed = [7u8; 32];
        let blob = protect(&seed).unwrap();
        assert_ne!(blob, seed);
        assert!(!blob.windows(32).any(|w| w == seed));
        assert_eq!(unprotect(&blob).unwrap(), seed);
    }

    #[test]
    fn keeps_the_same_identity_across_runs() {
        let path = std::env::temp_dir().join(format!("meridian-dpapi-test-{}.key", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let first = DpapiKeyStore(path.clone()).load_or_create().unwrap();
        let again = DpapiKeyStore(path.clone()).load_or_create().unwrap();
        assert_eq!(first.verifying_key(), again.verifying_key());
        let _ = std::fs::remove_file(path);
    }
}
