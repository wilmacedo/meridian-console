use meridian_executor_core::keystore::KeyStore;

use crate::config::default_dir;

/// Windows keeps the key under DPAPI; anywhere else it is a private file (that is what the Linux tests run on).
#[cfg(windows)]
pub fn store() -> impl KeyStore {
    crate::dpapi::DpapiKeyStore(default_dir().join("device.key"))
}

#[cfg(not(windows))]
pub fn store() -> impl KeyStore {
    meridian_executor_core::keystore::FileKeyStore(default_dir().join("device.key"))
}
