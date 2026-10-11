#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

//! The Meridian executor: a thin process on the owner's machine. It dials the server, proves who it is, and runs
//! the capabilities it announces. It makes no decisions: what NOX may do, and when the owner is asked, is decided
//! on the server.

mod config;
#[cfg(windows)]
mod dpapi;
mod keys;
mod log;

use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;

use meridian_executor_core::auth;
use meridian_executor_core::connection::{self, Config};
use meridian_executor_core::keystore::KeyStore;

const USAGE: &str = "usage: meridian-executor [--config <path>] [run | show-key | version]";

/// A release build on Windows has no console (it runs from a scheduled task); borrow the one it was started from,
/// if there is one, so `show-key` and `version` can print.
#[cfg(windows)]
fn console() {
    use windows::Win32::System::Console::{ATTACH_PARENT_PROCESS, AttachConsole};
    let _ = unsafe { AttachConsole(ATTACH_PARENT_PROCESS) };
}

#[cfg(not(windows))]
fn console() {}

fn main() -> ExitCode {
    console();
    let mut args = std::env::args().skip(1).peekable();
    let mut path: Option<PathBuf> = None;
    let mut command = "run".to_string();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--config" => path = args.next().map(PathBuf::from),
            "run" | "show-key" | "version" => command = arg,
            _ => {
                eprintln!("{USAGE}");
                return ExitCode::from(2);
            }
        }
    }
    match command.as_str() {
        "version" => {
            println!("meridian-executor {}", env!("CARGO_PKG_VERSION"));
            ExitCode::SUCCESS
        }
        "show-key" => match keys::store().load_or_create() {
            Ok(key) => {
                println!("{}", auth::encode(key.verifying_key().as_bytes()));
                ExitCode::SUCCESS
            }
            Err(e) => fail(&e),
        },
        _ => run(path),
    }
}

fn fail(message: &str) -> ExitCode {
    log::line(message);
    eprintln!("{message}");
    ExitCode::FAILURE
}

fn run(path: Option<PathBuf>) -> ExitCode {
    let file = match config::load(path) {
        Ok(f) => f,
        Err(e) => return fail(&e),
    };
    let key = match keys::store().load_or_create() {
        Ok(k) => k,
        Err(e) => return fail(&format!("cannot open the device key: {e}")),
    };
    let Some(server_public_key) = auth::decode32(&file.server_public_key) else {
        return fail("server_public_key in the config is not a 32-byte base64 key");
    };
    let cfg = Config {
        url: file.url,
        server_public_key,
        name: file.name.unwrap_or_else(meridian_executor_capabilities::hostname),
        os: std::env::consts::OS.into(),
        version: env!("CARGO_PKG_VERSION").into(),
    };
    let runtime = tokio::runtime::Builder::new_multi_thread().enable_all().build().expect("the async runtime starts");
    let registry = Arc::new(meridian_executor_capabilities::registry());
    log::line(&format!("starting as {} ({})", cfg.name, cfg.url));
    let reason = runtime.block_on(connection::run_forever(&cfg, &key, registry, &log::line));
    // Only a refusal ends the loop: the server revoked this device, so there is nothing left to do.
    log::line(&format!("stopped for good: {reason}"));
    ExitCode::from(3)
}
