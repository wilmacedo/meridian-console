use std::ffi::c_void;
use std::time::{Duration, Instant};

use meridian_executor_core::capability::{Capability, Output, Tier};
use serde_json::{Value, json};
use windows::Win32::Foundation::{HWND, LPARAM, RECT, TRUE, WPARAM};
use windows::Win32::Graphics::Dwm::{DWMWA_CLOAKED, DwmGetWindowAttribute};
use windows::Win32::Graphics::Gdi::{MONITOR_DEFAULTTONEAREST, MonitorFromWindow};
use windows::Win32::UI::Input::KeyboardAndMouse::{KEYEVENTF_KEYUP, VK_MENU, keybd_event};
use windows::Win32::UI::WindowsAndMessaging::*;
use windows::core::BOOL;

use super::monitor::screens;
use super::util::{from_wide, hwnd_id, id_schema, parse_hwnd, process_name, short};

const MAX_WINDOWS: usize = 40;

struct Info {
    hwnd: HWND,
    title: String,
    process: String,
    state: &'static str,
    monitor: usize,
}

fn state(h: HWND) -> &'static str {
    unsafe {
        if IsIconic(h).as_bool() {
            "minimized"
        } else if IsZoomed(h).as_bool() {
            "maximized"
        } else {
            "normal"
        }
    }
}

fn title(h: HWND) -> String {
    let mut buf = [0u16; 512];
    let n = unsafe { GetWindowTextW(h, &mut buf) };
    from_wide(&buf[..n.max(0) as usize])
}

fn monitor_of(h: HWND) -> usize {
    let at = unsafe { MonitorFromWindow(h, MONITOR_DEFAULTTONEAREST) };
    let mut info = windows::Win32::Graphics::Gdi::MONITORINFO { cbSize: std::mem::size_of::<windows::Win32::Graphics::Gdi::MONITORINFO>() as u32, ..Default::default() };
    if !unsafe { windows::Win32::Graphics::Gdi::GetMonitorInfoW(at, &mut info) }.as_bool() {
        return 0;
    }
    screens().iter().find(|s| s.rect.left == info.rcMonitor.left && s.rect.top == info.rcMonitor.top).map(|s| s.index).unwrap_or(0)
}

/// The windows a person would call "open": visible, titled, top-level, not a tool tip or a hidden UWP shell.
fn is_listed(h: HWND) -> bool {
    unsafe {
        if !IsWindowVisible(h).as_bool() || GetWindow(h, GW_OWNER).is_ok_and(|o| !o.0.is_null()) {
            return false;
        }
        if GetWindowLongW(h, GWL_EXSTYLE) as u32 & WS_EX_TOOLWINDOW.0 != 0 {
            return false;
        }
        let mut cloaked = 0u32;
        let _ = DwmGetWindowAttribute(h, DWMWA_CLOAKED, &mut cloaked as *mut u32 as *mut c_void, 4);
        cloaked == 0 && !title(h).is_empty()
    }
}

fn windows() -> Vec<Info> {
    unsafe extern "system" fn each(h: HWND, data: LPARAM) -> BOOL {
        let list = unsafe { &mut *(data.0 as *mut Vec<HWND>) };
        if is_listed(h) {
            list.push(h);
        }
        TRUE
    }
    let mut handles: Vec<HWND> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(each), LPARAM(&mut handles as *mut _ as *mut c_void as isize));
    }
    handles
        .into_iter()
        .map(|h| {
            let mut pid = 0u32;
            unsafe { GetWindowThreadProcessId(h, Some(&mut pid)) };
            Info { hwnd: h, title: title(h), process: process_name(pid), state: state(h), monitor: monitor_of(h) }
        })
        .collect()
}

pub struct List;

impl Capability for List {
    fn name(&self) -> &'static str {
        "window_list"
    }
    fn tier(&self) -> Tier {
        Tier::Observe
    }
    fn description(&self) -> &'static str {
        "The open windows, front to back: id, program, title, state and monitor. Pass contains to narrow by program or title"
    }
    fn input_schema(&self) -> Value {
        json!({ "type": "object", "additionalProperties": false, "properties": { "contains": { "type": "string", "maxLength": 100 } } })
    }
    fn run(&self, input: Value) -> Result<Output, String> {
        let needle = input["contains"].as_str().unwrap_or("").to_lowercase();
        let all: Vec<Info> = windows().into_iter().filter(|w| needle.is_empty() || w.process.to_lowercase().contains(&needle) || w.title.to_lowercase().contains(&needle)).collect();
        if all.is_empty() {
            return Ok(Output::text("No window matches."));
        }
        let mut lines: Vec<String> = all.iter().take(MAX_WINDOWS).map(|w| format!("{} | {} | \"{}\" | {} | monitor {}", hwnd_id(w.hwnd), w.process, short(&w.title, 70), w.state, w.monitor)).collect();
        if all.len() > MAX_WINDOWS {
            lines.push(format!("[{} more not shown; narrow with contains]", all.len() - MAX_WINDOWS));
        }
        Ok(Output::text(lines.join("\n")))
    }
}

pub enum Act {
    Focus,
    Maximize,
    Minimize,
    Restore,
    Close,
}

fn wait_for(mut done: impl FnMut() -> bool) -> bool {
    let start = Instant::now();
    while start.elapsed() < Duration::from_millis(1500) {
        if done() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    done()
}

fn describe(h: HWND) -> String {
    format!("{} \"{}\"", hwnd_id(h), short(&title(h), 50))
}

/// Windows only lets the foreground program take the focus. A tap on Alt makes it hand it over, a trick every
/// automation tool uses; the result is checked afterwards and reported either way.
fn bring_to_front(h: HWND) -> bool {
    unsafe {
        if IsIconic(h).as_bool() {
            let _ = ShowWindow(h, SW_RESTORE);
        }
        keybd_event(VK_MENU.0 as u8, 0, Default::default(), 0);
        let _ = SetForegroundWindow(h);
        keybd_event(VK_MENU.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        wait_for(|| GetForegroundWindow() == h)
    }
}

impl Capability for Act {
    fn name(&self) -> &'static str {
        match self {
            Act::Focus => "window_focus",
            Act::Maximize => "window_maximize",
            Act::Minimize => "window_minimize",
            Act::Restore => "window_restore",
            Act::Close => "window_close",
        }
    }
    fn tier(&self) -> Tier {
        match self {
            Act::Focus | Act::Restore | Act::Minimize | Act::Maximize | Act::Close => Tier::Act,
        }
    }
    fn description(&self) -> &'static str {
        match self {
            Act::Focus => "Bring a window to the front and give it the keyboard focus",
            Act::Maximize => "Maximize a window",
            Act::Minimize => "Minimize a window",
            Act::Restore => "Restore a minimized or maximized window to its normal size",
            Act::Close => "Ask a window to close, as its close button does; the program may ask to save first",
        }
    }
    fn input_schema(&self) -> Value {
        json!({ "type": "object", "additionalProperties": false, "required": ["id"], "properties": { "id": id_schema() } })
    }
    fn run(&self, input: Value) -> Result<Output, String> {
        let h = parse_hwnd(&input)?;
        if !unsafe { IsWindow(Some(h)) }.as_bool() {
            return Err("there is no such window any more; list the windows again".into());
        }
        let what = describe(h);
        let text = match self {
            Act::Focus => {
                if bring_to_front(h) { format!("{what} has the focus.") } else { format!("Asked for the focus on {what}, but Windows kept another window in front.") }
            }
            Act::Maximize => {
                unsafe { let _ = ShowWindow(h, SW_MAXIMIZE); }
                if wait_for(|| state(h) == "maximized") { format!("{what} is maximized.") } else { format!("{what} did not maximize (state: {}).", state(h)) }
            }
            Act::Minimize => {
                unsafe { let _ = ShowWindow(h, SW_MINIMIZE); }
                if wait_for(|| state(h) == "minimized") { format!("{what} is minimized.") } else { format!("{what} did not minimize (state: {}).", state(h)) }
            }
            Act::Restore => {
                unsafe { let _ = ShowWindow(h, SW_RESTORE); }
                if wait_for(|| state(h) == "normal") { format!("{what} is back to its normal size.") } else { format!("{what} did not restore (state: {}).", state(h)) }
            }
            Act::Close => {
                unsafe { PostMessageW(Some(h), WM_CLOSE, WPARAM(0), LPARAM(0)) }.map_err(|e| e.to_string())?;
                if wait_for(|| !unsafe { IsWindow(Some(h)) }.as_bool()) { format!("{what} closed.") } else { format!("Asked {what} to close, but it is still open; the program may be asking to save.") }
            }
        };
        Ok(Output::text(text))
    }
}

pub struct Move;

impl Capability for Move {
    fn name(&self) -> &'static str {
        "window_move"
    }
    fn tier(&self) -> Tier {
        Tier::Act
    }
    fn description(&self) -> &'static str {
        "Move a window to another monitor (numbered as monitor_list shows), keeping its size or its maximized state"
    }
    fn input_schema(&self) -> Value {
        json!({ "type": "object", "additionalProperties": false, "required": ["id", "monitor"], "properties": { "id": id_schema(), "monitor": { "type": "integer", "minimum": 1, "maximum": 16 } } })
    }
    fn run(&self, input: Value) -> Result<Output, String> {
        let h = parse_hwnd(&input)?;
        let target = input["monitor"].as_u64().ok_or("monitor is required")? as usize;
        let all = screens();
        let to = all.iter().find(|s| s.index == target).ok_or_else(|| format!("there is no monitor {target}; monitor_list shows {}", all.len()))?;
        if !unsafe { IsWindow(Some(h)) }.as_bool() {
            return Err("there is no such window any more; list the windows again".into());
        }
        unsafe {
            let was_max = IsZoomed(h).as_bool();
            if was_max || IsIconic(h).as_bool() {
                let _ = ShowWindow(h, SW_RESTORE);
            }
            let mut r = RECT::default();
            GetWindowRect(h, &mut r).map_err(|e| e.to_string())?;
            let (w, hgt) = ((r.right - r.left).min(to.work.right - to.work.left), (r.bottom - r.top).min(to.work.bottom - to.work.top));
            SetWindowPos(h, None, to.work.left + 40, to.work.top + 40, w, hgt, SWP_NOZORDER | SWP_NOACTIVATE).map_err(|e| e.to_string())?;
            if was_max {
                let _ = ShowWindow(h, SW_MAXIMIZE);
            }
        }
        let now = monitor_of(h);
        Ok(Output::text(if now == target { format!("{} is on monitor {target}.", describe(h)) } else { format!("{} did not land on monitor {target} (it is on {now}).", describe(h)) }))
    }
}
