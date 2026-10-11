use std::path::Path;

use meridian_executor_core::capability::{Capability, Output, Tier};
use serde_json::{Value, json};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
use windows::core::{PCWSTR, w};

use super::util::wide;

/// Opening these would run code, not show a document.
const PROGRAMS: &[&str] = &["exe", "com", "bat", "cmd", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "msi", "msp", "scr", "pif", "lnk", "url", "reg", "hta", "jar", "cpl", "dll", "appref-ms", "application", "gadget"];

fn openable(target: &str) -> Result<(), String> {
    let t = target.trim();
    if let Some(rest) = t.strip_prefix("https://").or_else(|| t.strip_prefix("http://")) {
        return if rest.is_empty() || rest.contains(char::is_whitespace) { Err("that is not a valid link".into()) } else { Ok(()) };
    }
    if t.contains("://") || t.starts_with("\\\\") {
        return Err("only http(s) links and files on this PC can be opened".into());
    }
    let path = Path::new(t);
    if !path.is_absolute() {
        return Err("give the full path of the file, or an http(s) link".into());
    }
    // Windows ignores trailing dots and spaces in a file name, and ":" after the drive names an alternate stream:
    // both would hide a script's extension from a plain check.
    if t[2..].contains(':') {
        return Err("alternate data streams cannot be opened".into());
    }
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").trim_end_matches(['.', ' ']);
    let ext = Path::new(name).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    if PROGRAMS.contains(&ext.as_str()) {
        return Err(format!(".{ext} files run code; this only opens documents. Use process_start for a program"));
    }
    if !path.exists() {
        return Err(format!("{t} does not exist"));
    }
    Ok(())
}

/// The first 80 characters, cut on a character boundary.
fn preview(target: &str) -> String {
    let shown: String = target.chars().take(80).collect();
    if target.chars().count() > 80 { format!("{shown}…") } else { shown }
}

pub struct Open;

impl Capability for Open {
    fn name(&self) -> &'static str {
        "open"
    }
    fn tier(&self) -> Tier {
        Tier::Act
    }
    fn description(&self) -> &'static str {
        "Open an http(s) link in the default browser, or a document or folder (full path) in its default program. Programs and scripts are refused"
    }
    fn input_schema(&self) -> Value {
        json!({ "type": "object", "additionalProperties": false, "required": ["target"], "properties": { "target": { "type": "string", "maxLength": 2000 } } })
    }
    fn run(&self, input: Value) -> Result<Output, String> {
        let target = input["target"].as_str().ok_or("target is required")?.trim().to_string();
        openable(&target)?;
        let w_target = wide(&target);
        let result = unsafe { ShellExecuteW(None, w!("open"), PCWSTR(w_target.as_ptr()), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL) };
        if result.0 as usize <= 32 {
            return Err(format!("Windows could not open it (code {})", result.0 as usize));
        }
        Ok(Output::text(format!("Asked Windows to open {}.", preview(&target))))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opens_links_and_existing_documents_only() {
        assert!(openable("https://example.com/a?b=1").is_ok());
        assert!(openable("http://example.com").is_ok());
        assert!(openable("C:\\Windows").is_ok());
        for bad in ["file:///C:/x.txt", "ftp://x", "javascript:alert(1)", "\\\\server\\share\\a.txt", "notes.txt", "https://", "https://a b", "C:\\Windows\\notepad.exe", "C:\\x\\run.ps1", "C:\\x\\a.LNK", "C:\\nope\\missing.txt", "C:\\x\\run.bat.", "C:\\x\\run.bat ", "C:\\x\\run.ps1...", "C:\\x\\a.txt:evil.exe"] {
            assert!(openable(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn a_script_extension_cannot_hide_behind_a_dot_a_space_or_a_stream() {
        for hidden in ["C:\\x\\run.bat.", "C:\\x\\run.bat ", "C:\\x\\run.ps1...", "C:\\x\\RUN.CMD. ."] {
            assert!(openable(hidden).unwrap_err().contains("run code"), "{hidden}");
        }
        assert!(openable("C:\\x\\a.txt:evil.exe").unwrap_err().contains("alternate data streams"));
    }

    #[test]
    fn the_preview_never_cuts_inside_a_character() {
        let long = format!("https://x.test/{}", "é".repeat(100));
        assert!(preview(&long).ends_with('…'));
        assert_eq!(preview("https://x.test/"), "https://x.test/");
    }
}
