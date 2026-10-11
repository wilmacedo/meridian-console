//! The mutual challenge. Both sides sign a context string followed by three 32-byte fields, so the messages are
//! unambiguous and a proof made for one connection, server or device cannot be replayed to another. These must
//! match `services/devices/server/executor/handshake.ts` byte for byte; the tests below use the vector it asserts.

use base64::{Engine, engine::general_purpose::STANDARD};
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};

const SERVER_CONTEXT: &[u8] = b"meridian-executor/v1/server\0";
const DEVICE_CONTEXT: &[u8] = b"meridian-executor/v1/device\0";

pub type Bytes32 = [u8; 32];

fn message(context: &[u8], a: &Bytes32, b: &Bytes32, c: &Bytes32) -> Vec<u8> {
    [context, a, b, c].concat()
}

pub fn encode(bytes: &[u8]) -> String {
    STANDARD.encode(bytes)
}

pub fn decode32(value: &str) -> Option<Bytes32> {
    STANDARD.decode(value).ok()?.try_into().ok()
}

pub fn decode64(value: &str) -> Option<[u8; 64]> {
    STANDARD.decode(value).ok()?.try_into().ok()
}

pub fn new_nonce() -> Bytes32 {
    rand::random()
}

/// Did the server we pinned just prove it is that server, for this connection and this device?
pub fn verify_server(pinned: &Bytes32, client_nonce: &Bytes32, server_nonce: &Bytes32, device_public: &Bytes32, signature: &[u8; 64]) -> bool {
    let Ok(key) = VerifyingKey::from_bytes(pinned) else { return false };
    key.verify_strict(&message(SERVER_CONTEXT, client_nonce, server_nonce, device_public), &Signature::from_bytes(signature)).is_ok()
}

/// Our proof that we hold the private key, bound to this connection and to the server we pinned.
pub fn sign_device(key: &SigningKey, client_nonce: &Bytes32, server_nonce: &Bytes32, server_public: &Bytes32) -> [u8; 64] {
    key.sign(&message(DEVICE_CONTEXT, client_nonce, server_nonce, server_public)).to_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    // The shared vector: seeds 1 (server) and 2 (device), nonces 3 (client) and 4 (server).
    const SERVER_PUB: &str = "iojj3XQJ8ZX9UtstPLpdcspnCb8dlBIb83SIAbQPb1w=";
    const DEVICE_PUB: &str = "gTl3Dqh9F19Wo1Rmw0x+zMuNipG07jeiXfYPW4/Js5Q=";
    const SERVER_SIG: &str = "wrkHS78fzfMF0ykI8e7ZM07mI5+1WV3pPlQxZiEI2bOSagz3QWjmPY31pQFYP9CAGgcMGVuYZmP6lfCjJGf8DQ==";
    const DEVICE_SIG: &str = "Nl2FdvuyVueWaS4AZogL5O3knOEiuTPBQm7uOCL2qd6HP3l3lCWGySa4NyM/7ZdkjmCLLhsO/LZG6Mlrg1JUDw==";

    fn fixtures() -> (SigningKey, Bytes32, Bytes32, Bytes32, Bytes32) {
        let device = SigningKey::from_bytes(&[2; 32]);
        (device, [3; 32], [4; 32], decode32(SERVER_PUB).unwrap(), decode32(DEVICE_PUB).unwrap())
    }

    #[test]
    fn our_keys_are_the_ones_the_server_tests_use() {
        let (device, ..) = fixtures();
        assert_eq!(encode(device.verifying_key().as_bytes()), DEVICE_PUB);
        assert_eq!(encode(SigningKey::from_bytes(&[1; 32]).verifying_key().as_bytes()), SERVER_PUB);
    }

    #[test]
    fn signs_the_device_proof_exactly_as_the_server_expects() {
        let (device, cn, sn, server_pub, _) = fixtures();
        assert_eq!(encode(&sign_device(&device, &cn, &sn, &server_pub)), DEVICE_SIG);
    }

    #[test]
    fn accepts_the_server_proof_the_server_makes() {
        let (_, cn, sn, server_pub, device_pub) = fixtures();
        assert!(verify_server(&server_pub, &cn, &sn, &device_pub, &decode64(SERVER_SIG).unwrap()));
    }

    #[test]
    fn refuses_a_server_that_is_not_the_one_pinned_or_a_replayed_proof() {
        let (_, cn, sn, server_pub, device_pub) = fixtures();
        let sig = decode64(SERVER_SIG).unwrap();
        let other = SigningKey::from_bytes(&[9; 32]).verifying_key().to_bytes();
        assert!(!verify_server(&other, &cn, &sn, &device_pub, &sig));
        assert!(!verify_server(&server_pub, &[5; 32], &sn, &device_pub, &sig));
        assert!(!verify_server(&server_pub, &cn, &[5; 32], &device_pub, &sig));
        assert!(!verify_server(&server_pub, &cn, &sn, &other, &sig));
    }

    #[test]
    fn decoding_rejects_the_wrong_length() {
        assert!(decode32(&encode(&[0; 31])).is_none());
        assert!(decode64(&encode(&[0; 63])).is_none());
        assert!(decode32("not base64!").is_none());
    }
}
