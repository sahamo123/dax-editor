#!/usr/bin/env node
// A stand-in for whisper-cli used by the default (offline) tests. It understands the flags the real
// program gets, writes JSON in the real shape, prints real-looking progress lines, and can misbehave
// on demand. Behaviour is chosen with environment variables:
//   FAKE_MODE   ok | fail | hang | nojson | badjson | killed | modelerr | wordspersec | loadlib | sigill
//   FAKE_JSON   path of a captured whisper-cli JSON file to copy to the output (mode ok)
//   FAKE_LOG    file to append one JSON line per run: { args, audioSec }
//   FAKE_PID    file to write the process id into (to prove the process is gone after cancel)
//   FAKE_SLEEP  milliseconds to wait between progress lines (default 0)

import { appendFileSync, copyFileSync, statSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
if (args.includes("--help") || args.includes("-h")) {
  console.log("usage: whisper-cli [options] file0 file1 ...");
  process.exit(0);
}

const mode = process.env.FAKE_MODE ?? "ok";
const wav = arg("-f");
const out = arg("-of");
let audioSec = 0;
try {
  audioSec = (statSync(wav).size - 44) / 32000;
} catch {
  // Not a WAV we can size; modes that need it will say so.
}
if (process.env.FAKE_LOG) {
  appendFileSync(process.env.FAKE_LOG, `${JSON.stringify({ args, audioSec })}\n`);
}
if (process.env.FAKE_PID) writeFileSync(process.env.FAKE_PID, String(process.pid));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const progress = async () => {
  for (const p of [5, 50, 100, 137]) {
    process.stderr.write(`whisper_print_progress_callback: progress = ${String(p).padStart(3)}%\n`);
    if (process.env.FAKE_SLEEP) await sleep(Number(process.env.FAKE_SLEEP));
  }
};

if (mode === "fail") {
  process.stderr.write("something went wrong inside the decoder\n");
  process.exit(3);
}
if (mode === "modelerr") {
  process.stderr.write(
    `whisper_init_from_file_with_params_no_state: failed to open '${arg("-m")}'\n`,
  );
  process.exit(2);
}
if (mode === "loadlib") {
  process.stderr.write(
    "whisper-cli: error while loading shared libraries: libgomp.so.1: cannot open shared object file\n",
  );
  process.exit(127);
}
if (mode === "sigill") process.kill(process.pid, "SIGILL");
if (mode === "killed") process.kill(process.pid, "SIGKILL");
if (mode === "hang") {
  await progress();
  await sleep(60_000);
  process.exit(0);
}

await progress();
if (mode === "nojson") process.exit(0);
if (mode === "badjson") {
  writeFileSync(`${out}.json`, "{ not json");
  process.exit(0);
}
if (mode === "wordspersec") {
  // One word per second of audio, each lasting 0.5 s: makes chunk offsets easy to verify.
  const n = Math.floor(audioSec);
  const tokens = [];
  for (let i = 0; i < n; i++) {
    tokens.push({ text: ` w${i}`, offsets: { from: i * 1000, to: i * 1000 + 500 }, p: 0.9 });
  }
  const json = {
    result: { language: arg("-l") === "auto" ? "de" : arg("-l") },
    transcription: [
      {
        offsets: { from: 0, to: Math.round(audioSec * 1000) },
        text: tokens.map((t) => t.text).join(""),
        tokens,
      },
    ],
  };
  writeFileSync(`${out}.json`, JSON.stringify(json));
  process.exit(0);
}
copyFileSync(process.env.FAKE_JSON, `${out}.json`);
process.exit(0);
