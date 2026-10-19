// The environment a spawned command-line agent receives: an allow-list, never a copy of our own environment.
// Anything credential-shaped (API keys, OAuth tokens, cloud keys) is absent unless it is on the list below.

/**
 * Variable names (upper-case) passed through unchanged. They cover "where is the user's home and config",
 * locale, temp folders, and the network settings corporate machines need (proxies and CA bundles).
 * Deliberately absent: `ANTHROPIC_*`, `CLAUDE_CODE_*` (this includes `CLAUDE_CODE_OAUTH_TOKEN`), `OPENAI_*`,
 * `CODEX_API_KEY`, `GEMINI_*`, `GOOGLE_*`, `AWS_*` and everything else, so a stray key in our environment can neither
 * change what the user is billed nor leak into the child.
 */
const PASS_THROUGH: ReadonlySet<string> = new Set([
  // Identity and shell basics.
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TERM",
  "TZ",
  "LANG",
  "LANGUAGE",
  // Temp folders.
  "TMPDIR",
  "TMP",
  "TEMP",
  // Where a CLI keeps its own settings and login. These are folder paths, not credentials.
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "XDG_STATE_HOME",
  "XDG_RUNTIME_DIR",
  "DBUS_SESSION_BUS_ADDRESS",
  "CLAUDE_CONFIG_DIR",
  "CODEX_HOME",
  // Windows equivalents.
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
  "USERPROFILE",
  "USERNAME",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "HOMEDRIVE",
  "HOMEPATH",
  // Networking: proxies and certificate bundles.
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "ALL_PROXY",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "NODE_EXTRA_CA_CERTS",
]);

/**
 * Build the child's environment from `source`: only allow-listed names (and `LC_*` locale names) are copied, then
 * `extra` is added on top. Names are matched case-insensitively because Windows environment names are.
 * @param source usually `process.env`.
 * @param extra values set by us for this child, for example the per-run MCP token. They win over copied values.
 * @returns a plain object with string values only.
 */
export function buildChildEnv(
  source: NodeJS.ProcessEnv,
  extra: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue;
    const upper = name.toUpperCase();
    if (PASS_THROUGH.has(upper) || upper.startsWith("LC_")) out[name] = value;
  }
  // No color codes or spinners in anything we parse or show.
  out.NO_COLOR = "1";
  // Our MCP endpoint is on the loopback interface. Exempting loopback from any user proxy is a precaution: in a
  // recorded run with proxy variables set and no NO_PROXY, the CLI reported our server as failed.
  const noProxy = [out.NO_PROXY ?? out.no_proxy, "127.0.0.1", "localhost", "::1"]
    .filter((v): v is string => typeof v === "string" && v !== "")
    .join(",");
  out.NO_PROXY = noProxy;
  out.no_proxy = noProxy;
  return { ...out, ...extra };
}
