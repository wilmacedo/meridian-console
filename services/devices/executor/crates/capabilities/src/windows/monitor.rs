use std::ffi::c_void;

use meridian_executor_core::capability::{Capability, Output, Tier};
use serde_json::{Value, json};
use windows::Win32::Foundation::{LPARAM, RECT, TRUE};
use windows::Win32::Graphics::Gdi::{EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO};
use windows::core::BOOL;

#[derive(Clone, Copy)]
pub struct Screen {
    pub index: usize,
    pub rect: RECT,
    pub work: RECT,
    pub primary: bool,
}

pub fn screens() -> Vec<Screen> {
    unsafe extern "system" fn each(monitor: HMONITOR, _: HDC, _: *mut RECT, data: LPARAM) -> BOOL {
        let list = unsafe { &mut *(data.0 as *mut Vec<Screen>) };
        let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        if unsafe { GetMonitorInfoW(monitor, &mut info) }.as_bool() {
            list.push(Screen { index: 0, rect: info.rcMonitor, work: info.rcWork, primary: info.dwFlags & 1 == 1 });
        }
        TRUE
    }
    let mut list: Vec<Screen> = Vec::new();
    unsafe {
        let _ = EnumDisplayMonitors(None, None, Some(each), LPARAM(&mut list as *mut _ as *mut c_void as isize));
    }
    // The primary monitor is number 1, then left to right: the order a person counts them in.
    list.sort_by_key(|s| (!s.primary, s.rect.left, s.rect.top));
    for (i, s) in list.iter_mut().enumerate() {
        s.index = i + 1;
    }
    list
}

pub struct List;

impl Capability for List {
    fn name(&self) -> &'static str {
        "monitor_list"
    }
    fn tier(&self) -> Tier {
        Tier::Observe
    }
    fn description(&self) -> &'static str {
        "The monitors, numbered from 1 (the primary first): size in pixels, orientation, and the work area (the screen without the taskbar) that window_place measures from"
    }
    fn input_schema(&self) -> Value {
        json!({ "type": "object", "additionalProperties": false, "properties": {} })
    }
    fn run(&self, _: Value) -> Result<Output, String> {
        let lines: Vec<String> = screens()
            .iter()
            .map(|s| {
                let (w, h) = (s.rect.right - s.rect.left, s.rect.bottom - s.rect.top);
                format!(
                    "{}: {w}x{h} {} at ({},{}), work area {}x{}{}",
                    s.index,
                    if h > w { "portrait" } else { "landscape" },
                    s.rect.left,
                    s.rect.top,
                    s.work.right - s.work.left,
                    s.work.bottom - s.work.top,
                    if s.primary { ", primary" } else { "" }
                )
            })
            .collect();
        Ok(Output::text(lines.join("\n")))
    }
}
