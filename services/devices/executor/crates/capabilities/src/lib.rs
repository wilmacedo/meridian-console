//! What the executor can do on a device. Each capability is a module behind the core's `Capability` trait; the ones
//! that exist on every OS live here, and per-OS ones sit in a module selected by `cfg`.

mod device_info;

#[cfg(windows)]
pub mod windows;

pub use device_info::hostname;
use meridian_executor_core::capability::Registry;

pub fn registry() -> Registry {
    let mut r = Registry::new();
    r.register(device_info::DeviceInfo);
    #[cfg(windows)]
    windows::register(&mut r);
    r
}
