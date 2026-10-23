// Split an existing installer into independently verifiable transport parts; never execute it.
import { createHash } from "node:crypto";
import { mkdir, open, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Copy a regular installer into at most 32 bounded parts and return content hashes, without executing it. */
export async function splitCandidate(source, directory, partBytes = 64 * 1024 * 1024) {
  if (!Number.isSafeInteger(partBytes) || partBytes < 1) throw new Error("Invalid part size");
  const metadata = await stat(source);
  if (!metadata.isFile() || metadata.size < 1 || metadata.size > partBytes * 32)
    throw new Error("Candidate must be a nonempty file within the 32-part transport limit");
  await mkdir(directory, { recursive: true });
  const input = await open(source, "r");
  const whole = createHash("sha256"),
    parts = [];
  try {
    let position = 0;
    while (position < metadata.size) {
      const index = parts.length,
        bytes = Math.min(partBytes, metadata.size - position);
      const buffer = Buffer.alloc(bytes);
      let filled = 0;
      while (filled < bytes) {
        const read = await input.read(buffer, filled, bytes - filled, position + filled);
        if (!read.bytesRead) throw new Error("Candidate ended before its recorded size");
        filled += read.bytesRead;
      }
      const folder = join(directory, `part-${index}`);
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, "installer.bin"), buffer);
      whole.update(buffer);
      parts.push({ index, bytes, sha256: createHash("sha256").update(buffer).digest("hex") });
      position += bytes;
    }
  } finally {
    await input.close();
  }
  return { bytes: metadata.size, sha256: whole.digest("hex"), parts };
}

async function installers(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await installers(path)));
    else if (entry.isFile() && entry.name.endsWith("-setup.exe")) found.push(path);
  }
  return found;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const input = resolve(process.argv[2] ?? "candidate-input");
  const output = resolve(process.argv[3] ?? "candidate-transfer");
  const sources = await installers(input);
  if (sources.length !== 1) throw new Error("Expected exactly one existing installer");
  const result = await splitCandidate(sources[0], output);
  const receipt = {
    ...result,
    installer: sources[0].split(/[\\/]/).at(-1),
    sourceRun: 39925892009,
    sourceCommit: "4e019ae9a2486bdcf1fce4c053704ce2f8bbd365",
  };
  await writeFile(join(output, "receipt.json"), JSON.stringify(receipt, null, 2));
  if (process.env.GITHUB_OUTPUT)
    await writeFile(process.env.GITHUB_OUTPUT, `parts=${result.parts.length}\n`, { flag: "a" });
  console.log(`Prepared ${result.parts.length} bounded transport parts; no installer executed.`);
}
