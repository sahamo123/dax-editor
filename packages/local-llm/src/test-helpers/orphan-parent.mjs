// Test helper: acts as "the app". Starts a LlamaServer (backed by the fake server script) using a
// compiled copy of the package, prints one JSON line with the process ids, then idles until it is
// killed. The test kills it with SIGKILL and checks that the server does not survive.
//
//   node orphan-parent.mjs <path/to/compiled/index.js> <path/to/fake-llama-server.mjs>
import { pathToFileURL } from "node:url";

const [, , indexPath, fakeServer] = process.argv;
const { LlamaServer } = await import(pathToFileURL(indexPath).href);

const server = new LlamaServer({
  binaryPath: fakeServer,
  modelPath: "unused.gguf",
  launcher: { command: process.execPath, args: [fakeServer] },
  env: { FAKE_SPAWN_GRANDCHILD: "1", FAKE_LOAD_MS: "50" },
  healthPollMs: 50,
});
await server.start();
const grandchild = server.logs().find((l) => l.startsWith("grandchild-pid="));
console.log(
  JSON.stringify({
    pid: server.pid,
    serverPid: server.serverPid,
    grandchildPid: grandchild ? Number(grandchild.split("=")[1]) : undefined,
  }),
);
setInterval(() => {}, 1 << 30);
