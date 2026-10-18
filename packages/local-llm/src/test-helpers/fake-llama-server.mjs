// A tiny stand-in for llama-server used by tests: speaks just enough HTTP (/health and an
// OpenAI-style /v1/chat/completions that always answers with one tool call) and understands the
// real server's flags. Behaviour is steered with FAKE_* environment variables.
import { spawn } from "node:child_process";
import { createServer } from "node:http";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const port = Number(flag("--port"));
const apiKey = flag("--api-key");
const loadMs = Number(process.env.FAKE_LOAD_MS ?? 200);
const startedAt = Date.now();

console.log(`fake-llama-server args: ${JSON.stringify(args)}`);

if (process.env.FAKE_FAIL_STARTUP) {
  console.error("error: failed to load model (fake)");
  process.exit(Number(process.env.FAKE_EXIT_CODE ?? 1));
}
if (process.env.FAKE_PORT_IN_USE_ONCE_FILE) {
  // Simulates losing the race for the free port, once.
  const { existsSync, writeFileSync } = await import("node:fs");
  if (!existsSync(process.env.FAKE_PORT_IN_USE_ONCE_FILE)) {
    writeFileSync(process.env.FAKE_PORT_IN_USE_ONCE_FILE, "x");
    console.error(`couldn't bind HTTP server socket, hostname: 127.0.0.1, port: ${port}`);
    process.exit(1);
  }
}
if (process.env.FAKE_IGNORE_SIGTERM) process.on("SIGTERM", () => console.log("ignoring SIGTERM"));
if (process.env.FAKE_SPAWN_GRANDCHILD) {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  console.log(`grandchild-pid=${child.pid}`);
}
if (process.env.FAKE_EXIT_AFTER_MS) {
  setTimeout(() => {
    console.error("fatal: simulated crash");
    process.exit(Number(process.env.FAKE_EXIT_CODE ?? 139));
  }, Number(process.env.FAKE_EXIT_AFTER_MS));
}

const server = createServer((req, res) => {
  const authorized = !apiKey || req.headers.authorization === `Bearer ${apiKey}`;
  if (req.url === "/health") {
    const ready = Date.now() - startedAt >= loadMs;
    res.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
    res.end(JSON.stringify(ready ? { status: "ok" } : { error: { message: "Loading model" } }));
    return;
  }
  if (!authorized) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "Invalid API Key" } }));
    return;
  }
  if (req.url === "/v1/chat/completions" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      const request = JSON.parse(body);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: {
                      name: request.tools?.[0]?.function?.name ?? "none",
                      arguments: "{}",
                    },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      );
    });
    return;
  }
  res.writeHead(404);
  res.end();
});
server.listen(port, "127.0.0.1", () => console.log(`listening on ${port}`));
setInterval(() => {}, 1 << 30); // keep the loop alive even if listen is slow
