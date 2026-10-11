use meridian_executor_core::capability::{Capability, Output, Tier};
use serde_json::{Value, json};

/// Who this device is. Cheap, and it works on every OS, so it is the first thing to call to see a device is alive.
pub struct DeviceInfo;

pub fn hostname() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .or_else(|_| std::fs::read_to_string("/etc/hostname").map(|s| s.trim().to_string()))
        .unwrap_or_else(|_| "unknown".into())
}

impl Capability for DeviceInfo {
    fn name(&self) -> &'static str {
        "device_info"
    }
    fn tier(&self) -> Tier {
        Tier::Observe
    }
    fn description(&self) -> &'static str {
        "Host name, operating system and executor version of this device"
    }
    fn input_schema(&self) -> Value {
        json!({ "type": "object", "additionalProperties": false, "properties": {} })
    }
    fn run(&self, _input: Value) -> Result<Output, String> {
        Ok(Output::text(format!("{} ({} {}), executor {}", hostname(), std::env::consts::OS, std::env::consts::ARCH, env!("CARGO_PKG_VERSION"))))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn says_who_it_is_in_one_line() {
        let out = DeviceInfo.run(json!({})).unwrap().text;
        assert!(out.contains(std::env::consts::OS) && out.contains("executor 0.1.0") && !out.contains('\n'));
    }

    #[test]
    fn is_a_read() {
        assert_eq!(DeviceInfo.tier(), Tier::Observe);
    }
}
