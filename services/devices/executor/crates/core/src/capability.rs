//! What a device can do. A capability is one small module that declares its name, tier, description and input
//! schema, and runs. The registry announces them to the server on connect, so the server never hard-codes what a
//! device can do, and per-OS code sits behind this one interface.

use std::collections::BTreeMap;

use serde::Serialize;

use crate::protocol::CapabilityInfo;

/// How much the owner has to be asked. The server enforces it; the executor only declares it honestly.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Tier {
    /// Reads. Never asks.
    Observe,
    /// Changes something that can be undone.
    Act,
    /// Cannot be undone: always asks.
    Irreversible,
}

/// The result of one call: short text that confirms its own outcome, and optionally a PNG.
#[derive(Debug, Default, PartialEq)]
pub struct Output {
    pub text: String,
    pub image_png: Option<Vec<u8>>,
}

impl Output {
    pub fn text(text: impl Into<String>) -> Self {
        Self { text: text.into(), image_png: None }
    }
}

pub trait Capability: Send + Sync {
    /// snake_case, unique: it is the tool name on the server.
    fn name(&self) -> &'static str;
    fn tier(&self) -> Tier;
    fn description(&self) -> &'static str;
    /// JSON Schema of the input object. The server validates against it before it sends anything.
    fn input_schema(&self) -> serde_json::Value;
    fn run(&self, input: serde_json::Value) -> Result<Output, String>;
}

#[derive(Default)]
pub struct Registry {
    capabilities: BTreeMap<&'static str, Box<dyn Capability>>,
}

impl Registry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&mut self, capability: impl Capability + 'static) {
        let name = capability.name();
        let previous = self.capabilities.insert(name, Box::new(capability));
        assert!(previous.is_none(), "capability {name} registered twice");
    }

    pub fn announce(&self) -> Vec<CapabilityInfo> {
        self.capabilities
            .values()
            .map(|c| CapabilityInfo { name: c.name().into(), tier: c.tier(), description: c.description().into(), input: c.input_schema() })
            .collect()
    }

    pub fn call(&self, name: &str, input: serde_json::Value) -> Result<Output, String> {
        self.capabilities.get(name).ok_or_else(|| format!("unknown capability {name}"))?.run(input)
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    struct Echo;
    impl Capability for Echo {
        fn name(&self) -> &'static str {
            "echo"
        }
        fn tier(&self) -> Tier {
            Tier::Observe
        }
        fn description(&self) -> &'static str {
            "Says back what it is given"
        }
        fn input_schema(&self) -> serde_json::Value {
            json!({ "type": "object", "required": ["text"], "properties": { "text": { "type": "string" } } })
        }
        fn run(&self, input: serde_json::Value) -> Result<Output, String> {
            input["text"].as_str().map(Output::text).ok_or_else(|| "text is required".into())
        }
    }

    #[test]
    fn announces_name_tier_description_and_schema() {
        let mut r = Registry::new();
        r.register(Echo);
        let info = serde_json::to_value(r.announce()).unwrap();
        assert_eq!(info[0]["name"], "echo");
        assert_eq!(info[0]["tier"], "observe");
        assert_eq!(info[0]["input"]["required"][0], "text");
    }

    #[test]
    fn routes_a_call_by_name_and_reports_what_goes_wrong() {
        let mut r = Registry::new();
        r.register(Echo);
        assert_eq!(r.call("echo", json!({ "text": "hi" })), Ok(Output::text("hi")));
        assert_eq!(r.call("echo", json!({})), Err("text is required".into()));
        assert_eq!(r.call("nope", json!({})), Err("unknown capability nope".into()));
    }

    #[test]
    #[should_panic(expected = "registered twice")]
    fn refuses_two_capabilities_with_one_name() {
        let mut r = Registry::new();
        r.register(Echo);
        r.register(Echo);
    }

    #[test]
    fn tiers_serialize_the_way_the_server_reads_them() {
        assert_eq!(serde_json::to_string(&[Tier::Observe, Tier::Act, Tier::Irreversible]).unwrap(), r#"["observe","act","irreversible"]"#);
    }
}
