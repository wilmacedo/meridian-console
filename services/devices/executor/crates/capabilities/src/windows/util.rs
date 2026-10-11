use std::ffi::c_void;

use serde_json::Value;
use windows::Win32::Foundation::{CloseHandle, HWND};
use windows::Win32::System::Threading::{OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW};
use windows::Win32::UI::HiDpi::{DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, SetProcessDpiAwarenessContext};
use windows::core::PWSTR;

/// Pixels, not scaled units: window positions and screenshots must agree on every monitor.
pub fn init() {
    unsafe {
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }
}

pub fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

pub fn from_wide(buf: &[u16]) -> String {
    let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..end])
}

pub fn hwnd_id(h: HWND) -> String {
    format!("0x{:x}", h.0 as usize)
}

pub fn parse_hwnd(input: &Value) -> Result<HWND, String> {
    let text = input["id"].as_str().ok_or("id is required (from window_list)")?;
    let n = match text.strip_prefix("0x") {
        Some(hex) => usize::from_str_radix(hex, 16),
        None => text.parse::<usize>(),
    }
    .map_err(|_| format!("{text} is not a window id"))?;
    Ok(HWND(n as *mut c_void))
}

pub fn id_schema() -> Value {
    serde_json::json!({ "type": "string", "pattern": "^(0x[0-9a-fA-F]+|[0-9]+)$", "description": "A window id from window_list, like 0x1a2b." })
}

/// The executable name of a process ("brave.exe"), or "?" when it is not ours to look at.
pub fn process_name(pid: u32) -> String {
    unsafe {
        let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else { return "?".into() };
        let mut buf = [0u16; 520];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).is_ok();
        let _ = CloseHandle(handle);
        if !ok {
            return "?".into();
        }
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        path.rsplit('\\').next().unwrap_or("?").to_string()
    }
}

pub fn short(text: &str, max: usize) -> String {
    let flat: String = text.chars().map(|c| if c.is_control() { ' ' } else { c }).collect();
    if flat.chars().count() > max { format!("{}…", flat.chars().take(max).collect::<String>()) } else { flat }
}
