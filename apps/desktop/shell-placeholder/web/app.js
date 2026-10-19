// Temporary page logic for the Tauri shell: shows the engine-server info, opens a video with the
// native dialog or by drag-and-drop, and plays it from the server. Uses only the IPC primitives
// that are always present (window.__TAURI_INTERNALS__), so it needs no bundler. The real UI uses
// the typed wrappers in apps/desktop/src/platform.ts instead.

const internals = window.__TAURI_INTERNALS__;
const $ = (id) => document.getElementById(id);
let server = null;

function log(message) {
  const line = `${new Date().toISOString().slice(11, 23)} ${message}`;
  $("log").textContent += `${line}\n`;
  $("log").scrollTop = $("log").scrollHeight;
  console.log(message);
}

function invoke(cmd, args) {
  if (!internals) return Promise.reject(new Error("not running inside Tauri"));
  return internals.invoke(cmd, args);
}

/** Subscribe to a Tauri event; the handler receives the event payload. */
function listen(event, handler) {
  const callback = internals.transformCallback((e) => handler(e.payload));
  return invoke("plugin:event|listen", { event, target: { kind: "Any" }, handler: callback });
}

function setStatus(text, kind) {
  const el = $("srv-status");
  el.textContent = text;
  el.className = `pill ${kind}`;
}

async function showServer(info) {
  server = info;
  setStatus("ready", "ok");
  $("srv-url").textContent = info.url;
  $("srv-version").textContent = info.version;
  // Never print the whole token: only enough to tell launches apart.
  $("srv-token").textContent = `${info.token.slice(0, 6)}... (${info.token.length} chars)`;
  try {
    // A real cross-origin request from the app origin: proves CSP, CORS and mixed-content rules.
    const res = await fetch(`${info.url}/api/health`, {
      headers: { Authorization: `Bearer ${info.token}` },
    });
    const body = await res.json();
    $("srv-health").textContent =
      `HTTP ${res.status} ${JSON.stringify(body)} (from ${location.origin})`;
    log(`health from page: ${res.status}`);
  } catch (err) {
    $("srv-health").textContent = `FAILED: ${err}`;
    log(`health from page failed: ${err}`);
  }
}

async function loadServerInfo() {
  try {
    await showServer(await invoke("get_server_info"));
  } catch (err) {
    setStatus("failed", "bad");
    $("srv-url").textContent = String(err);
    log(`get_server_info failed: ${err}`);
  }
}

function playPath(path) {
  $("picked").textContent = path;
  log(`chosen: ${path}`);
  if (!server) {
    log("server not ready, cannot play");
    return;
  }
  const url = `${server.url}/api/dev/file?path=${encodeURIComponent(path)}&token=${server.token}`;
  const player = $("player");
  player.src = url;
  $("player-status").textContent = "loading...";
  player.load();
}

function wirePlayer() {
  const player = $("player");
  const say = (text) => {
    $("player-status").textContent = text;
    log(`video: ${text}`);
  };
  player.addEventListener("loadedmetadata", () =>
    say(`metadata ok: ${player.videoWidth}x${player.videoHeight}, ${player.duration.toFixed(2)}s`),
  );
  player.addEventListener("canplay", () => {
    player
      .play()
      .then(() => say(`playing (readyState ${player.readyState})`))
      .catch((err) => say(`play() rejected: ${err.name}`));
  });
  player.addEventListener("timeupdate", () => {
    if (player.currentTime > 0.5 && !player.dataset.reported) {
      player.dataset.reported = "1";
      say(`PLAYBACK OK: advanced to ${player.currentTime.toFixed(2)}s`);
    }
  });
  player.addEventListener("loadstart", () => {
    delete player.dataset.reported;
  });
  player.addEventListener("error", () => {
    const code = player.error ? player.error.code : "?";
    const msg = player.error ? player.error.message : "";
    say(`ERROR code ${code} ${msg}`);
  });
}

function showEnvironment() {
  const probe = document.createElement("video");
  const types = {
    "H.264 + AAC (mp4)": 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
    "H.264 High (mp4)": 'video/mp4; codecs="avc1.640028"',
    "VP9 (webm)": 'video/webm; codecs="vp9"',
    "VP8 (webm)": 'video/webm; codecs="vp8"',
    "AV1 (mp4)": 'video/mp4; codecs="av01.0.05M.08"',
    "HEVC (mp4)": 'video/mp4; codecs="hvc1.1.6.L93.B0"',
  };
  for (const [label, type] of Object.entries(types)) {
    const li = document.createElement("li");
    li.textContent = `${label}: ${probe.canPlayType(type) || "no"}`;
    $("env").appendChild(li);
  }
  const ua = document.createElement("li");
  ua.textContent = `origin ${location.origin}; ${navigator.userAgent}`;
  $("env").appendChild(ua);
}

async function openDialog() {
  try {
    const picked = await invoke("plugin:dialog|open", {
      options: {
        multiple: false,
        directory: false,
        title: "Open video",
        filters: [{ name: "Video", extensions: ["mp4", "m4v", "mov", "webm", "mkv"] }],
      },
    });
    if (picked) playPath(picked);
    else log("dialog cancelled");
  } catch (err) {
    log(`dialog failed: ${err}`);
  }
}

/**
 * Checks that least privilege holds: allowed IPC calls succeed, everything else is refused by the
 * capability system or the CSP. Prints one PASS/FAIL line each to the log.
 */
async function selfTest() {
  const report = (name, expectOk, ok, detail) =>
    log(`${ok === expectOk ? "PASS" : "FAIL"} ${name}: ${ok ? "allowed" : "refused"} ${detail}`);
  const ipc = async (name, expectOk, cmd, args) => {
    try {
      await invoke(cmd, args);
      report(name, expectOk, true, "");
    } catch (err) {
      report(name, expectOk, false, `(${String(err).slice(0, 90)})`);
    }
  };
  await ipc("get_server_info", true, "get_server_info");
  await ipc("dialog save", false, "plugin:dialog|save", { options: {} });
  await ipc("dialog message", false, "plugin:dialog|message", { message: "x" });
  await ipc("window close", false, "plugin:window|close", { label: "main" });
  await ipc("window set_title", false, "plugin:window|set_title", { label: "main", value: "x" });
  await ipc("shell execute", false, "plugin:shell|execute", { program: "ls", args: [] });
  await ipc("fs read_file", false, "plugin:fs|read_file", { path: "/etc/passwd" });
  await ipc("app exit", false, "plugin:app|exit");
  try {
    new Function("return 1")();
    report("eval/new Function", false, true, "");
  } catch (err) {
    report("eval/new Function", false, false, `(${String(err).slice(0, 60)})`);
  }
  for (const [name, url, expectOk] of [
    ["fetch https://example.com", "https://example.com/", false],
    ["fetch http://example.com", "http://example.com/", false],
    ["fetch loopback server", `${server ? server.url : "http://127.0.0.1:1"}/api/health`, true],
  ]) {
    try {
      await fetch(url, { headers: { Authorization: `Bearer ${server ? server.token : ""}` } });
      report(name, expectOk, true, "");
    } catch (err) {
      report(name, expectOk, false, `(${String(err).slice(0, 60)})`);
    }
  }
}

async function main() {
  $("selftest").addEventListener("click", selfTest);
  showEnvironment();
  wirePlayer();
  $("open").addEventListener("click", openDialog);
  $("load").addEventListener("click", () => {
    const value = $("path").value.trim();
    if (value) playPath(value);
  });
  if (!internals) {
    setStatus("no Tauri", "bad");
    return;
  }
  const drop = $("drop");
  await listen("dax://server-status", (status) => {
    log(`server-status event: ${JSON.stringify(status)}`);
    if (status.state === "failed") {
      setStatus(`failed: ${status.message}`, "bad");
    }
  });
  await listen("tauri://drag-enter", () => drop.classList.add("over"));
  await listen("tauri://drag-leave", () => drop.classList.remove("over"));
  await listen("tauri://drag-drop", (event) => {
    drop.classList.remove("over");
    log(`dropped ${event.paths.length} path(s)`);
    if (event.paths.length > 0) playPath(event.paths[0]);
  });
  await loadServerInfo();
}

main();
