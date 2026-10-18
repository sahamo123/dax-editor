//! A tiny dependency-free HTTP probe used to confirm the engine server really answers requests
//! before the UI is told it is ready.
//!
//! We only ever talk to the loopback server we just started, so a few lines over
//! `std::net::TcpStream` are enough and keep an HTTP client crate out of the shell.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::time::Duration;

use crate::server_info::{parse_http_url, ServerInfo};

/// Path of the health endpoint (mirrors `API.health` in `@dax/protocol`).
pub const HEALTH_PATH: &str = "/api/health";

/// Send `GET /api/health` with the bearer token and require an HTTP 200 answer.
///
/// `timeout` bounds each of connect, write and read. Returns a short human-readable reason on
/// failure. The token is sent but never included in an error message.
pub fn probe_health(info: &ServerInfo, timeout: Duration) -> Result<(), String> {
    let (host, port) = parse_http_url(&info.url)?;
    let addr: SocketAddr = (host.as_str(), port)
        .to_socket_addrs()
        .map_err(|e| format!("cannot resolve {host}: {e}"))?
        .next()
        .ok_or_else(|| format!("no address for {host}"))?;
    let mut stream = TcpStream::connect_timeout(&addr, timeout)
        .map_err(|e| format!("cannot connect to {addr}: {e}"))?;
    stream
        .set_read_timeout(Some(timeout))
        .and_then(|_| stream.set_write_timeout(Some(timeout)))
        .map_err(|e| format!("cannot set timeouts: {e}"))?;
    let request = format!(
        "GET {HEALTH_PATH} HTTP/1.1\r\nHost: {host}:{port}\r\nAuthorization: Bearer {}\r\n\
         Accept: application/json\r\nConnection: close\r\n\r\n",
        info.token
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|e| format!("write failed: {e}"))?;
    // The response is tiny; cap what we read so a broken server cannot make us buffer forever.
    let mut response = Vec::new();
    stream
        .take(64 * 1024)
        .read_to_end(&mut response)
        .map_err(|e| format!("read failed: {e}"))?;
    match status_code(&String::from_utf8_lossy(&response)) {
        Some(200) => Ok(()),
        Some(code) => Err(format!("health endpoint answered HTTP {code}")),
        None => Err("health endpoint sent a malformed response".into()),
    }
}

/// Extract the numeric status code from the first line of an HTTP/1.x response.
pub fn status_code(response: &str) -> Option<u16> {
    let first = response.lines().next()?;
    let mut parts = first.split_whitespace();
    let version = parts.next()?;
    if !version.starts_with("HTTP/1.") {
        return None;
    }
    parts.next()?.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader};
    use std::net::TcpListener;
    use std::thread;

    /// Serve exactly one request with `reply`, returning the request head the client sent.
    fn serve_once(reply: &'static str) -> (u16, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let handle = thread::spawn(move || {
            let (mut conn, _) = listener.accept().unwrap();
            let mut head = String::new();
            let mut reader = BufReader::new(conn.try_clone().unwrap());
            loop {
                let mut line = String::new();
                if reader.read_line(&mut line).unwrap() == 0 || line == "\r\n" {
                    break;
                }
                head.push_str(&line);
            }
            conn.write_all(reply.as_bytes()).unwrap();
            head
        });
        (port, handle)
    }

    fn info(port: u16) -> ServerInfo {
        ServerInfo {
            url: format!("http://127.0.0.1:{port}"),
            token: "secret-token".into(),
            port,
            version: "0".into(),
        }
    }

    #[test]
    fn healthy_server_passes_and_receives_the_token() {
        let (port, handle) = serve_once("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}");
        probe_health(&info(port), Duration::from_secs(2)).unwrap();
        let head = handle.join().unwrap();
        assert!(head.starts_with("GET /api/health HTTP/1.1"));
        assert!(head.contains("Authorization: Bearer secret-token"));
        assert!(head.contains(&format!("Host: 127.0.0.1:{port}")));
    }

    #[test]
    fn non_200_fails_without_leaking_the_token() {
        let (port, handle) = serve_once("HTTP/1.1 503 Service Unavailable\r\n\r\n");
        let err = probe_health(&info(port), Duration::from_secs(2)).unwrap_err();
        handle.join().unwrap();
        assert!(err.contains("503"));
        assert!(!err.contains("secret-token"));
    }

    #[test]
    fn closed_port_fails() {
        // Bind then drop to get a port that is very likely closed.
        let port = TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port();
        assert!(probe_health(&info(port), Duration::from_millis(300)).is_err());
    }

    #[test]
    fn status_line_parsing() {
        assert_eq!(status_code("HTTP/1.1 200 OK\r\n"), Some(200));
        assert_eq!(status_code("HTTP/1.0 404 Not Found"), Some(404));
        assert_eq!(status_code("garbage"), None);
        assert_eq!(status_code("HTTP/2 200"), None);
        assert_eq!(status_code(""), None);
    }
}
