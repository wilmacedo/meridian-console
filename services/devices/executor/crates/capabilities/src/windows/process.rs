use meridian_executor_core::capability::{Capability, Output, Tier};
use serde_json::{Value, json};
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW, TH32CS_SNAPPROCESS};
use windows::Win32::System::Threading::{OpenProcess, PROCESS_TERMINATE, TerminateProcess};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
use windows::core::{PCWSTR, w};

use super::util::{from_wide, wide};

const MAX_PROCESSES: usize = 40;

fn running() -> Result<Vec<(u32, String)>, String> {
    let mut out = Vec::new();
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).map_err(|e| e.to_string())?;
        let mut entry = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        let mut more = Process32FirstW(snap, &mut entry).is_ok();
        while more {
            out.push((entry.th32ProcessID, from_wide(&entry.szExeFile)));
            more = Process32NextW(snap, &mut entry).is_ok();
        }
        let _ = CloseHandle(snap);
    }
    Ok(out)
}

pub struct List;

impl Capability for List {
    fn name(&self) -> &'static str {
        "process_list"
    }
    fn tier(&self) -> Tier {
        Tier::Observe
    }
    fn description(&self) -> &'static str {
        "Running programs by name and pid. Pass name to look for one (part of the executable name); without it only a count is given, since there are hundreds"
    }
    fn input_schema(&self) -> Value {
        json!({ "type": "object", "additionalProperties": false, "properties": { "name": { "type": "string", "maxLength": 100 } } })
    }
    fn run(&self, input: Value) -> Result<Output, String> {
        let all = running()?;
        let Some(needle) = input["name"].as_str().filter(|n| !n.is_empty()).map(str::to_lowercase) else {
            return Ok(Output::text(format!("{} processes are running. Pass name to look for one.", all.len())));
        };
        let hits: Vec<&(u32, String)> = all.iter().filter(|(_, n)| n.to_lowercase().contains(&needle)).collect();
        if hits.is_empty() {
            return Ok(Output::text(format!("No process matches \"{needle}\".")));
        }
        let mut lines: Vec<String> = hits.iter().take(MAX_PROCESSES).map(|(pid, n)| format!("{pid} {n}")).collect();
        if hits.len() > MAX_PROCESSES {
            lines.push(format!("[{} more not shown]", hits.len() - MAX_PROCESSES));
        }
        Ok(Output::text(lines.join("\n")))
    }
}

/// Programs that run whatever text they are handed: starting one of these is running a command, which is not what
/// this capability is for.
const INTERPRETERS: &[&str] = &["cmd", "powershell", "pwsh", "wscript", "cscript", "mshta", "rundll32", "regsvr32", "msiexec", "wsl", "bash", "python", "node", "reg", "regedit", "schtasks", "sc", "net", "curl", "certutil", "bitsadmin"];

fn startable(name: &str) -> Result<(), String> {
    let bare = name.trim();
    let stem = bare.strip_suffix(".exe").unwrap_or(bare).to_lowercase();
    if bare.is_empty() || bare.len() > 60 || !bare.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, ' ' | '.' | '_' | '-')) {
        return Err("name must be the plain name of an installed program, such as \"brave\" or \"notepad\": no path, no arguments".into());
    }
    if INTERPRETERS.contains(&stem.as_str()) {
        return Err(format!("{stem} runs commands; this only starts ordinary programs"));
    }
    Ok(())
}

pub struct Start;

impl Capability for Start {
    fn name(&self) -> &'static str {
        "process_start"
    }
    fn tier(&self) -> Tier {
        Tier::Act
    }
    fn description(&self) -> &'static str {
        "Start an installed program by its plain name (\"brave\", \"notepad\", \"code\"), with no path and no arguments. To open a file or a link use open. Shells and interpreters are refused"
    }
    fn input_schema(&self) -> Value {
        json!({ "type": "object", "additionalProperties": false, "required": ["name"], "properties": { "name": { "type": "string", "maxLength": 60 } } })
    }
    fn run(&self, input: Value) -> Result<Output, String> {
        let name = input["name"].as_str().ok_or("name is required")?;
        startable(name)?;
        // ShellExecute finds programs the way the Run box does (App Paths, PATH), which is how a person starts them.
        let target = wide(name.trim());
        let result = unsafe { ShellExecuteW(None, w!("open"), PCWSTR(target.as_ptr()), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL) };
        if result.0 as usize <= 32 {
            return Err(format!("Windows could not start \"{}\" (code {}); is it installed?", name.trim(), result.0 as usize));
        }
        Ok(Output::text(format!("Asked Windows to start \"{}\". It may take a moment to show a window; window_list shows when it has.", name.trim())))
    }
}

pub struct Kill;

impl Capability for Kill {
    fn name(&self) -> &'static str {
        "process_kill"
    }
    fn tier(&self) -> Tier {
        Tier::Irreversible
    }
    fn description(&self) -> &'static str {
        "End a process by pid at once, without letting it save. Unsaved work in it is lost. Find the pid with process_list"
    }
    fn input_schema(&self) -> Value {
        json!({ "type": "object", "additionalProperties": false, "required": ["pid"], "properties": { "pid": { "type": "integer", "minimum": 5, "maximum": 4294967295u64 } } })
    }
    fn run(&self, input: Value) -> Result<Output, String> {
        let pid = input["pid"].as_u64().ok_or("pid is required")? as u32;
        if pid == std::process::id() {
            return Err("that is this executor itself".into());
        }
        let name = running()?.into_iter().find(|(p, _)| *p == pid).map(|(_, n)| n).ok_or_else(|| format!("no process has pid {pid}"))?;
        unsafe {
            let handle = OpenProcess(PROCESS_TERMINATE, false, pid).map_err(|e| format!("cannot end {name} ({pid}): {e}"))?;
            let ended = TerminateProcess(handle, 1);
            let _ = CloseHandle(handle);
            ended.map_err(|e| format!("cannot end {name} ({pid}): {e}"))?;
        }
        Ok(Output::text(format!("Ended {name} (pid {pid}).")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_plain_program_names_only() {
        assert!(startable("brave").is_ok());
        assert!(startable("Notepad.exe").is_ok());
        assert!(startable("Google Chrome").is_ok());
        for bad in ["", "C:\\Windows\\notepad.exe", "..\\x", "notepad /c", "calc;calc", "cmd", "PowerShell.exe", "wscript", "https://x.test"] {
            assert!(startable(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn refuses_to_end_system_processes_and_itself() {
        assert!(Kill.run(json!({ "pid": std::process::id() })).unwrap_err().contains("this executor"));
        assert!(Kill.run(json!({ "pid": 4_000_000_000u64 })).unwrap_err().contains("no process"));
    }

    #[test]
    fn lists_by_name_and_counts_without_one() {
        let counted = List.run(json!({})).unwrap().text;
        assert!(counted.contains("processes are running"));
        let me = std::env::current_exe().unwrap().file_name().unwrap().to_string_lossy().to_string();
        let stem = me.split('.').next().unwrap().to_string();
        assert!(List.run(json!({ "name": stem })).unwrap().text.contains(&std::process::id().to_string()));
    }
}
