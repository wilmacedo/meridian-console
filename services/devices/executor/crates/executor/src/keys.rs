use meridian_executor_core::keystore::{FileKeyStore, KeyStore};

use crate::config::default_dir;

pub fn store() -> impl KeyStore {
    FileKeyStore(default_dir().join("device.key"))
}
