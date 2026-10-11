//! One connection to the server, and the loop that keeps one alive. The executor dials out (the device needs no
//! inbound port), proves who it is, checks it is talking to the server it pinned, and then does what it is told.

use std::sync::Arc;
use std::time::Duration;

use ed25519_dalek::SigningKey;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

use crate::auth::{self, Bytes32};
use crate::capability::Registry;
use crate::protocol::{FromServer, PROTOCOL, ToServer};

const STEP_TIMEOUT: Duration = Duration::from_secs(15);
const CALL_TIMEOUT: Duration = Duration::from_secs(25);
const HEARTBEAT: Duration = Duration::from_secs(20);
/// Close codes the server uses to say "do not come back": revoked, or the proof was wrong.
const REFUSED: u16 = 4003;
/// What a result may carry as text; past this the model is paying for noise.
const MAX_TEXT: usize = 8000;

pub struct Config {
    pub url: String,
    /// The server's public key, pinned at install time: a fake server on the network cannot give orders.
    pub server_public_key: Bytes32,
    pub name: String,
    pub os: String,
    pub version: String,
}

#[derive(Debug)]
pub struct Ended {
    /// Why the connection ended, for the log.
    pub reason: String,
    /// It got as far as being let in, so the next attempt can start from the shortest wait.
    pub was_ready: bool,
    /// The server refused this device for good; trying again would only make noise.
    pub refused: bool,
}

fn ended(reason: impl Into<String>) -> Ended {
    Ended { reason: reason.into(), was_ready: false, refused: false }
}

#[derive(PartialEq, Clone, Copy)]
enum Stage {
    Challenge,
    Admission,
    Pending,
    Ready,
}

fn frame(f: &ToServer) -> Message {
    Message::Text(serde_json::to_string(f).expect("frames serialize").into())
}

fn cut(mut text: String) -> String {
    if text.len() > MAX_TEXT {
        let mut at = MAX_TEXT;
        while !text.is_char_boundary(at) {
            at -= 1;
        }
        text.truncate(at);
        text.push_str("\n[cut]");
    }
    text
}

fn result_frame(id: String, outcome: Result<crate::capability::Output, String>) -> String {
    let frame = match outcome {
        Ok(out) => ToServer::Result { id, ok: true, text: Some(cut(out.text)), error: None, image_png_base64: out.image_png.map(|png| auth::encode(&png)) },
        Err(error) => ToServer::Result { id, ok: false, text: None, error: Some(cut(error)), image_png_base64: None },
    };
    serde_json::to_string(&frame).expect("frames serialize")
}

/// Runs one capability off the async threads, with a limit, and always answers.
async fn run_call(registry: Arc<Registry>, id: String, capability: String, input: serde_json::Value) -> String {
    let work = tokio::task::spawn_blocking(move || registry.call(&capability, input));
    let outcome = match tokio::time::timeout(CALL_TIMEOUT, work).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err("the capability crashed".into()),
        Err(_) => Err(format!("timed out after {}s", CALL_TIMEOUT.as_secs())),
    };
    result_frame(id, outcome)
}

pub async fn serve(cfg: &Config, key: &SigningKey, registry: Arc<Registry>, log: &dyn Fn(&str)) -> Ended {
    let ws = match connect_async(cfg.url.as_str()).await {
        Ok((ws, _)) => ws,
        Err(e) => return ended(format!("could not connect: {e}")),
    };
    let (mut sink, mut stream) = ws.split();

    let device_public = key.verifying_key().to_bytes();
    let client_nonce = auth::new_nonce();
    let hello = ToServer::Hello { protocol: PROTOCOL, public_key: auth::encode(&device_public), client_nonce: auth::encode(&client_nonce), name: &cfg.name, os: &cfg.os, version: &cfg.version };
    if sink.send(frame(&hello)).await.is_err() {
        return ended("could not send hello");
    }

    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<String>();
    let mut beat = tokio::time::interval_at(tokio::time::Instant::now() + HEARTBEAT, HEARTBEAT);
    let mut stage = Stage::Challenge;

    loop {
        let wait = if matches!(stage, Stage::Challenge | Stage::Admission) { Some(STEP_TIMEOUT) } else { None };
        tokio::select! {
            incoming = async {
                match wait {
                    Some(limit) => tokio::time::timeout(limit, stream.next()).await.map_err(|_| ()),
                    None => Ok(stream.next().await),
                }
            } => {
                let message = match incoming {
                    Err(()) => return Ended { reason: "the server did not answer the handshake".into(), was_ready: false, refused: false },
                    Ok(None) => return Ended { reason: "the connection closed".into(), was_ready: stage == Stage::Ready, refused: false },
                    Ok(Some(Err(e))) => return Ended { reason: format!("connection error: {e}"), was_ready: stage == Stage::Ready, refused: false },
                    Ok(Some(Ok(m))) => m,
                };
                let text = match message {
                    Message::Text(t) => t,
                    Message::Close(c) => {
                        let (code, why) = c.map(|c| (u16::from(c.code), c.reason.to_string())).unwrap_or((0, String::new()));
                        return Ended { reason: format!("closed by the server ({code} {why})"), was_ready: stage == Stage::Ready, refused: code == REFUSED };
                    }
                    _ => continue,
                };
                let Ok(parsed) = serde_json::from_str::<FromServer>(&text) else { continue };
                match (stage, parsed) {
                    (Stage::Challenge, FromServer::Challenge { protocol, server_nonce, server_public_key, server_signature }) => {
                        let (Some(sn), Some(spk), Some(sig)) = (auth::decode32(&server_nonce), auth::decode32(&server_public_key), auth::decode64(&server_signature)) else {
                            return ended("malformed challenge");
                        };
                        if protocol != PROTOCOL || spk != cfg.server_public_key || !auth::verify_server(&cfg.server_public_key, &client_nonce, &sn, &device_public, &sig) {
                            return ended("the server is not the one pinned for this device; nothing was sent to it");
                        }
                        let proof = ToServer::Proof { signature: auth::encode(&auth::sign_device(key, &client_nonce, &sn, &cfg.server_public_key)) };
                        if sink.send(frame(&proof)).await.is_err() {
                            return ended("could not send the proof");
                        }
                        stage = Stage::Admission;
                    }
                    (Stage::Admission, FromServer::Pending) => {
                        log("waiting for the owner to approve this device");
                        stage = Stage::Pending;
                    }
                    (Stage::Admission | Stage::Pending, FromServer::Ready) => {
                        let caps = ToServer::Capabilities { items: registry.announce() };
                        if sink.send(frame(&caps)).await.is_err() {
                            return ended("could not announce capabilities");
                        }
                        log("connected");
                        stage = Stage::Ready;
                    }
                    (Stage::Ready, FromServer::Call { id, capability, input }) => {
                        let (registry, tx) = (registry.clone(), out_tx.clone());
                        tokio::spawn(async move {
                            let _ = tx.send(run_call(registry, id, capability, input).await);
                        });
                    }
                    _ => {}
                }
            }
            Some(out) = out_rx.recv() => {
                if sink.send(Message::Text(out.into())).await.is_err() {
                    return Ended { reason: "could not send a result".into(), was_ready: true, refused: false };
                }
            }
            _ = beat.tick(), if stage == Stage::Ready => {
                if sink.send(frame(&ToServer::Heartbeat)).await.is_err() {
                    return Ended { reason: "could not send a heartbeat".into(), was_ready: true, refused: false };
                }
            }
        }
    }
}

/// Keeps a connection up: waits a little longer after each failure, and stops for good if the server refuses it.
pub async fn run_forever(cfg: &Config, key: &SigningKey, registry: Arc<Registry>, log: &dyn Fn(&str)) -> String {
    let mut wait = Duration::from_secs(1);
    loop {
        let end = serve(cfg, key, registry.clone(), log).await;
        log(&format!("disconnected: {}", end.reason));
        if end.refused {
            return end.reason;
        }
        wait = if end.was_ready { Duration::from_secs(1) } else { (wait * 2).min(Duration::from_secs(30)) };
        tokio::time::sleep(wait).await;
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use ed25519_dalek::Signer;
    use serde_json::{Value, json};
    use tokio::net::TcpListener;
    use tokio_tungstenite::accept_async;
    use tokio_tungstenite::tungstenite::protocol::CloseFrame;
    use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;

    use super::*;
    use crate::capability::{Capability, Output, Tier};

    struct Hello;
    impl Capability for Hello {
        fn name(&self) -> &'static str {
            "greet"
        }
        fn tier(&self) -> Tier {
            Tier::Observe
        }
        fn description(&self) -> &'static str {
            "Greets"
        }
        fn input_schema(&self) -> Value {
            json!({ "type": "object", "properties": { "who": { "type": "string" } } })
        }
        fn run(&self, input: Value) -> Result<Output, String> {
            match input["who"].as_str() {
                Some("boom") => Err("no such person".into()),
                Some(who) => Ok(Output::text(format!("hello {who}"))),
                None => Ok(Output::text("hello")),
            }
        }
    }

    fn registry() -> Arc<Registry> {
        let mut r = Registry::new();
        r.register(Hello);
        Arc::new(r)
    }

    #[derive(Clone, Copy)]
    enum Script {
        /// Known device: ready at once, then one call, then done.
        Approved,
        /// Unknown device: pending, then approved, then one call.
        PendingThenApproved,
        /// Closes with 4003 right after the proof.
        Revoked,
    }

    fn server_message(cn: &Bytes32, sn: &Bytes32, device_pub: &Bytes32) -> Vec<u8> {
        [b"meridian-executor/v1/server\0".as_slice(), cn, sn, device_pub].concat()
    }

    /// A stand-in for the real server: the same challenge, signed with the server key given.
    async fn fake_server(server_key: SigningKey, script: Script, call_input: Value) -> (String, tokio::task::JoinHandle<Vec<Value>>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("ws://{}", listener.local_addr().unwrap());
        let handle = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut ws = accept_async(stream).await.unwrap();
            let mut seen = Vec::new();
            let next = async |ws: &mut tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>| -> Option<Value> {
                loop {
                    match ws.next().await? {
                        Ok(Message::Text(t)) => return serde_json::from_str(&t).ok(),
                        Ok(Message::Close(_)) | Err(_) => return None,
                        _ => {}
                    }
                }
            };
            let hello = next(&mut ws).await.unwrap();
            seen.push(hello.clone());
            let cn = auth::decode32(hello["client_nonce"].as_str().unwrap()).unwrap();
            let dp = auth::decode32(hello["public_key"].as_str().unwrap()).unwrap();
            let sn = [9u8; 32];
            let sig = server_key.sign(&server_message(&cn, &sn, &dp)).to_bytes();
            let challenge = json!({ "type": "challenge", "protocol": 1, "server_nonce": auth::encode(&sn), "server_public_key": auth::encode(server_key.verifying_key().as_bytes()), "server_signature": auth::encode(&sig) });
            ws.send(Message::Text(challenge.to_string().into())).await.unwrap();
            let Some(proof) = next(&mut ws).await else { return seen };
            seen.push(proof);
            match script {
                Script::Revoked => {
                    let _ = ws.send(Message::Close(Some(CloseFrame { code: CloseCode::from(4003), reason: "revoked".into() }))).await;
                    return seen;
                }
                Script::PendingThenApproved => {
                    ws.send(Message::Text(json!({ "type": "pending" }).to_string().into())).await.unwrap();
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
                Script::Approved => {}
            }
            ws.send(Message::Text(json!({ "type": "ready" }).to_string().into())).await.unwrap();
            seen.push(next(&mut ws).await.unwrap());
            ws.send(Message::Text(json!({ "type": "call", "id": "c-1", "capability": "greet", "input": call_input }).to_string().into())).await.unwrap();
            seen.push(next(&mut ws).await.unwrap());
            let _ = ws.close(None).await;
            seen
        });
        (url, handle)
    }

    fn config(url: String, pinned: &SigningKey) -> Config {
        Config { url, server_public_key: pinned.verifying_key().to_bytes(), name: "test-pc".into(), os: "testos".into(), version: "0.0.0".into() }
    }

    fn quiet() -> (Arc<Mutex<Vec<String>>>, impl Fn(&str)) {
        let lines = Arc::new(Mutex::new(Vec::new()));
        let sink = lines.clone();
        (lines, move |l: &str| sink.lock().unwrap().push(l.to_string()))
    }

    async fn run(script: Script, server_seed: u8, pinned_seed: u8, input: Value) -> (Ended, Vec<Value>, Vec<String>) {
        let server_key = SigningKey::from_bytes(&[server_seed; 32]);
        let (url, server) = fake_server(server_key, script, input).await;
        let key = SigningKey::from_bytes(&[2; 32]);
        let (lines, log) = quiet();
        let end = serve(&config(url, &SigningKey::from_bytes(&[pinned_seed; 32])), &key, registry(), &log).await;
        let seen = server.await.unwrap();
        let log = lines.lock().unwrap().clone();
        (end, seen, log)
    }

    #[tokio::test]
    async fn proves_itself_announces_what_it_can_do_and_answers_a_call() {
        let (end, seen, log) = run(Script::Approved, 1, 1, json!({ "who": "world" })).await;
        assert!(end.was_ready && !end.refused);
        assert_eq!(seen[0]["type"], "hello");
        assert_eq!(seen[0]["protocol"], 1);
        assert_eq!(seen[0]["name"], "test-pc");

        // The proof is a signature the server can check with the key in the hello, over this connection only.
        let device = SigningKey::from_bytes(&[2; 32]);
        let cn = auth::decode32(seen[0]["client_nonce"].as_str().unwrap()).unwrap();
        let server_pub = SigningKey::from_bytes(&[1; 32]).verifying_key().to_bytes();
        let signed = [b"meridian-executor/v1/device\0".as_slice(), &cn, &[9u8; 32], &server_pub].concat();
        let sig = ed25519_dalek::Signature::from_bytes(&auth::decode64(seen[1]["signature"].as_str().unwrap()).unwrap());
        assert!(device.verifying_key().verify_strict(&signed, &sig).is_ok());

        assert_eq!(seen[2]["type"], "capabilities");
        assert_eq!(seen[2]["items"][0]["name"], "greet");
        assert_eq!(seen[2]["items"][0]["tier"], "observe");
        assert_eq!(seen[3], json!({ "type": "result", "id": "c-1", "ok": true, "text": "hello world" }));
        assert!(log.contains(&"connected".to_string()));
    }

    #[tokio::test]
    async fn reports_a_failing_capability_instead_of_going_quiet() {
        let (_, seen, _) = run(Script::Approved, 1, 1, json!({ "who": "boom" })).await;
        assert_eq!(seen[3], json!({ "type": "result", "id": "c-1", "ok": false, "error": "no such person" }));
    }

    #[tokio::test]
    async fn waits_for_approval_and_then_carries_on_without_reconnecting() {
        let (end, seen, log) = run(Script::PendingThenApproved, 1, 1, json!({})).await;
        assert!(end.was_ready);
        assert_eq!(seen[3]["text"], "hello");
        assert!(log.iter().any(|l| l.contains("waiting for the owner")));
    }

    #[tokio::test]
    async fn sends_nothing_to_a_server_that_is_not_the_one_it_pinned() {
        let (end, seen, _) = run(Script::Approved, 1, 5, json!({})).await;
        assert!(end.reason.contains("not the one pinned"), "{}", end.reason);
        assert!(!end.was_ready && !end.refused);
        assert_eq!(seen.len(), 1, "only the hello, which holds no secret, was sent");
    }

    #[tokio::test]
    async fn stops_for_good_when_the_server_refuses_the_device() {
        let (end, _, _) = run(Script::Revoked, 1, 1, json!({})).await;
        assert!(end.refused, "{}", end.reason);
        let server_key = SigningKey::from_bytes(&[1; 32]);
        let (url, server) = fake_server(server_key.clone(), Script::Revoked, json!({})).await;
        let (_, log) = quiet();
        let reason = tokio::time::timeout(Duration::from_secs(5), run_forever(&config(url, &server_key), &SigningKey::from_bytes(&[2; 32]), registry(), &log)).await.expect("it must stop, not retry");
        assert!(reason.contains("4003"), "{reason}");
        server.await.unwrap();
    }

    #[tokio::test]
    async fn reports_a_server_that_is_not_there() {
        let key = SigningKey::from_bytes(&[2; 32]);
        let (_, log) = quiet();
        let end = serve(&config("ws://127.0.0.1:1".into(), &key), &key, registry(), &log).await;
        assert!(end.reason.starts_with("could not connect"), "{}", end.reason);
    }

    #[test]
    fn long_results_are_cut_on_a_character_boundary() {
        let long = "é".repeat(MAX_TEXT);
        let out = cut(long);
        assert!(out.ends_with("\n[cut]") && out.len() <= MAX_TEXT + 6);
    }
}
