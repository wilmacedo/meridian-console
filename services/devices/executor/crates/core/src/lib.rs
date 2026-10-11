//! The core of the Meridian executor: everything that is the same on every device. What a device can actually do
//! lives in the capabilities crate, one module each, behind the [`capability::Capability`] trait.

pub mod auth;
pub mod capability;
pub mod connection;
pub mod keystore;
pub mod protocol;
