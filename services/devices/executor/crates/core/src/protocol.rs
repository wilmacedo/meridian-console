//! Frames between the executor and the server (JSON text over WebSocket), protocol version 1. The server side is
//! `services/devices/server/executor/protocol.ts`; both describe the same sequence:
//! hello, challenge, proof, pending (until the owner approves) or ready, capabilities, then calls and results.

use serde::{Deserialize, Serialize};

use crate::capability::Tier;

pub const PROTOCOL: u32 = 1;

#[derive(Debug, Clone, Serialize)]
pub struct CapabilityInfo {
    pub name: String,
    pub tier: Tier,
    pub description: String,
    /// JSON Schema of the input object.
    pub input: serde_json::Value,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ToServer<'a> {
    Hello { protocol: u32, public_key: String, client_nonce: String, name: &'a str, os: &'a str, version: &'a str },
    Proof { signature: String },
    Capabilities { items: Vec<CapabilityInfo> },
    Result {
        id: String,
        ok: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        text: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        image_png_base64: Option<String>,
    },
    Heartbeat,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum FromServer {
    Challenge { protocol: u32, server_nonce: String, server_public_key: String, server_signature: String },
    Pending,
    Ready,
    Call { id: String, capability: String, #[serde(default)] input: serde_json::Value },
    #[serde(other)]
    Unknown,
}
