//! Windows capabilities, through the `windows` crate. Every one returns short text that says what happened, so the
//! server never needs a picture to know it worked.

mod clipboard;
mod monitor;
mod notify;
mod open;
mod process;
mod screenshot;
mod util;
mod window;

use meridian_executor_core::capability::Registry;

pub fn register(r: &mut Registry) {
    util::init();
    r.register(window::List);
    r.register(window::Act::Focus);
    r.register(window::Act::Maximize);
    r.register(window::Act::Minimize);
    r.register(window::Act::Restore);
    r.register(window::Act::Close);
    r.register(window::Move);
    r.register(monitor::List);
    r.register(process::List);
    r.register(process::Start);
    r.register(process::Kill);
    r.register(clipboard::Read);
    r.register(clipboard::Write);
    r.register(open::Open);
    r.register(notify::Notify);
    r.register(screenshot::Screenshot);
}
