//! The engine-server handshake: the `ServerInfo` JSON line the server prints on stdout when it is
//! ready, and the per-launch secret token the shell hands to it.
//!
//! Everything here is pure (no processes, no I/O) so it can be unit-tested. The wire shape mirrors
//! `ServerInfo` in `packages/protocol/src/index.ts`; if one changes, change the other.

use std::fmt;

use serde::{Deserialize, Serialize};

/// What the engine server prints (one JSON line on stdout) once it is listening.
///
/// The page receives exactly this object from the `get_server_info` command and uses `url` and
/// `token` to talk to the server over HTTP and WebSocket.
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ServerInfo {
    /// Base URL of the server, always on the loopback interface, e.g. `http://127.0.0.1:41233`.
    pub url: String,
    /// Per-launch bearer token. A secret: never log it.
    pub token: String,
    /// TCP port the server listens on (equal to the port in `url`).
    pub port: u16,
    /// Server version string.
    pub version: String,
}

// A hand-written Debug so that `{:?}` in a log line or panic message can never print the token.
impl fmt::Debug for ServerInfo {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ServerInfo")
            .field("url", &self.url)
            .field("token", &"<redacted>")
            .field("port", &self.port)
            .field("version", &self.version)
            .finish()
    }
}

/// Why a stdout line was not accepted as a [`ServerInfo`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InfoError {
    /// The line is ordinary log output (not a JSON object); callers should just log it.
    NotInfo,
    /// The line looks like the handshake but is unusable (non-loopback URL, empty token, ...);
    /// callers must treat this as a failed start.
    Invalid(String),
}

impl fmt::Display for InfoError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            InfoError::NotInfo => write!(f, "not a ServerInfo line"),
            InfoError::Invalid(why) => write!(f, "invalid ServerInfo: {why}"),
        }
    }
}

/// Parse one stdout line of the server into a validated [`ServerInfo`].
///
/// Returns [`InfoError::NotInfo`] for anything that is not a JSON object carrying a `url` and a
/// `token`, so ordinary log lines pass through harmlessly. A line that *is* the handshake is
/// validated strictly: the URL must be `http://` on a loopback host, its port must equal `port`,
/// and the token must be non-empty. This stops a misbehaving server from pointing the UI (and the
/// token) at a remote host.
pub fn parse_server_info_line(line: &str) -> Result<ServerInfo, InfoError> {
    let line = line.trim();
    if !line.starts_with('{') {
        return Err(InfoError::NotInfo);
    }
    let value: serde_json::Value = serde_json::from_str(line).map_err(|_| InfoError::NotInfo)?;
    if value.get("url").is_none() || value.get("token").is_none() {
        return Err(InfoError::NotInfo);
    }
    let info: ServerInfo =
        serde_json::from_value(value).map_err(|e| InfoError::Invalid(e.to_string()))?;
    validate(&info)?;
    Ok(info)
}

fn validate(info: &ServerInfo) -> Result<(), InfoError> {
    if info.token.is_empty() {
        return Err(InfoError::Invalid("token is empty".into()));
    }
    let (host, port) = parse_http_url(&info.url).map_err(InfoError::Invalid)?;
    if !is_loopback_host(&host) {
        return Err(InfoError::Invalid(format!("host `{host}` is not loopback")));
    }
    if port != info.port {
        return Err(InfoError::Invalid(format!(
            "port {} in url does not match port field {}",
            port, info.port
        )));
    }
    Ok(())
}

/// Split a plain `http://host:port[/...]` URL into host and port. Only the shapes the server
/// produces are accepted (explicit port, no userinfo).
pub fn parse_http_url(url: &str) -> Result<(String, u16), String> {
    let rest = url
        .strip_prefix("http://")
        .ok_or_else(|| format!("url `{url}` must start with http://"))?;
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    if authority.contains('@') {
        return Err("url must not contain userinfo".into());
    }
    let (host, port) = authority
        .rsplit_once(':')
        .ok_or_else(|| "url has no explicit port".to_string())?;
    let port: u16 = port
        .parse()
        .map_err(|_| format!("bad port `{port}` in url"))?;
    if host.is_empty() {
        return Err("url has an empty host".into());
    }
    Ok((host.to_string(), port))
}

fn is_loopback_host(host: &str) -> bool {
    matches!(host, "127.0.0.1" | "localhost" | "[::1]")
}

/// Generate a fresh random token: 32 bytes from the operating system's CSPRNG, hex-encoded
/// (64 characters). Returns an error only if the OS random source fails.
pub fn generate_token() -> Result<String, getrandom::Error> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes)?;
    Ok(hex_encode(&bytes))
}

/// Lower-case hex encoding of `bytes`.
pub fn hex_encode(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(DIGITS[(b >> 4) as usize] as char);
        out.push(DIGITS[(b & 0x0f) as usize] as char);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const GOOD: &str =
        r#"{"url":"http://127.0.0.1:41233","token":"abc123","port":41233,"version":"0.0.1"}"#;

    #[test]
    fn parses_a_valid_line() {
        let info = parse_server_info_line(GOOD).unwrap();
        assert_eq!(info.url, "http://127.0.0.1:41233");
        assert_eq!(info.token, "abc123");
        assert_eq!(info.port, 41233);
        assert_eq!(info.version, "0.0.1");
    }

    #[test]
    fn tolerates_whitespace_and_extra_fields() {
        let line = format!(
            "  {}  \r\n",
            r#"{"url":"http://localhost:9","token":"t","port":9,"version":"1","extra":true}"#
        );
        assert!(parse_server_info_line(&line).is_ok());
    }

    #[test]
    fn plain_log_lines_are_not_info() {
        for line in [
            "",
            "listening on 127.0.0.1",
            "[warn] something",
            "{not json",
            r#"{"hello":"world"}"#,
        ] {
            assert_eq!(
                parse_server_info_line(line),
                Err(InfoError::NotInfo),
                "{line}"
            );
        }
    }

    #[test]
    fn rejects_non_loopback_hosts() {
        let line = r#"{"url":"http://evil.example:80","token":"t","port":80,"version":"1"}"#;
        assert!(matches!(
            parse_server_info_line(line),
            Err(InfoError::Invalid(_))
        ));
        let lan = r#"{"url":"http://192.168.1.5:80","token":"t","port":80,"version":"1"}"#;
        assert!(matches!(
            parse_server_info_line(lan),
            Err(InfoError::Invalid(_))
        ));
    }

    #[test]
    fn rejects_userinfo_tricks_and_https() {
        for url in [
            "http://127.0.0.1:80@evil.example:80",
            "https://127.0.0.1:80",
            "http://127.0.0.1",
        ] {
            let line = format!(r#"{{"url":"{url}","token":"t","port":80,"version":"1"}}"#);
            assert!(
                matches!(parse_server_info_line(&line), Err(InfoError::Invalid(_))),
                "{url}"
            );
        }
    }

    #[test]
    fn rejects_port_mismatch_and_empty_token() {
        let mismatch = r#"{"url":"http://127.0.0.1:81","token":"t","port":80,"version":"1"}"#;
        assert!(matches!(
            parse_server_info_line(mismatch),
            Err(InfoError::Invalid(_))
        ));
        let empty = r#"{"url":"http://127.0.0.1:80","token":"","port":80,"version":"1"}"#;
        assert!(matches!(
            parse_server_info_line(empty),
            Err(InfoError::Invalid(_))
        ));
    }

    #[test]
    fn rejects_wrongly_typed_fields() {
        let line = r#"{"url":"http://127.0.0.1:80","token":"t","port":"80","version":"1"}"#;
        assert!(matches!(
            parse_server_info_line(line),
            Err(InfoError::Invalid(_))
        ));
    }

    #[test]
    fn debug_output_never_contains_the_token() {
        let info = parse_server_info_line(GOOD).unwrap();
        let shown = format!("{info:?}");
        assert!(!shown.contains("abc123"));
        assert!(shown.contains("redacted"));
    }

    #[test]
    fn tokens_are_64_hex_chars_and_unique() {
        let a = generate_token().unwrap();
        let b = generate_token().unwrap();
        assert_eq!(a.len(), 64);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b);
    }

    #[test]
    fn hex_encoding_is_lowercase_and_padded() {
        assert_eq!(hex_encode(&[0x00, 0x0f, 0xa5, 0xff]), "000fa5ff");
    }

    #[test]
    fn url_parsing_extracts_host_and_port() {
        assert_eq!(
            parse_http_url("http://127.0.0.1:8080/api/x?y=1").unwrap(),
            ("127.0.0.1".to_string(), 8080)
        );
        assert!(parse_http_url("ftp://127.0.0.1:1").is_err());
        assert!(parse_http_url("http://:1").is_err());
    }
}
