/**
 * Finds which processes hold a TCP port in the LISTEN state. Used to confirm that whatever answers
 * on the port we chose is the llama-server we spawned, before the API key is handed out. No
 * network I/O: it reads the local socket tables and asks the OS tools that list them.
 */
import { execFile } from "node:child_process";
import { readdir, readFile, readlink } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * The process ids that hold `port` in LISTEN state on this machine. Returns `undefined` when this
 * machine cannot tell (no readable socket table, or the OS tool is missing or failed). Callers
 * must treat `undefined` as "not verified", never as "no owner".
 */
export async function listeningPids(port: number): Promise<number[] | undefined> {
  switch (process.platform) {
    case "linux":
      return linuxListeningPids(port);
    case "darwin":
      return lsofListeningPids(port);
    case "win32":
      return netstatListeningPids(port);
    default:
      return undefined;
  }
}

/**
 * Linux: the socket table in `/proc/net/tcp*` gives the inode of each listening socket; a process
 * owns the socket when one of its file descriptors links to `socket:[inode]`. Processes whose
 * descriptors this user cannot read are skipped, which can only make the answer smaller, so a
 * port held by an unreadable process is reported as not ours.
 */
async function linuxListeningPids(port: number): Promise<number[] | undefined> {
  // The kernel writes ports as upper-case hex in the local address column.
  const hexPort = port.toString(16).toUpperCase().padStart(4, "0");
  const inodes = new Set<string>();
  let readOne = false;
  for (const table of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let text: string;
    try {
      text = await readFile(table, "utf8");
    } catch {
      continue; // IPv6 disabled: the IPv4 table alone is still an answer
    }
    readOne = true;
    for (const line of text.split("\n").slice(1)) {
      const columns = line.trim().split(/\s+/);
      const local = columns[1];
      const state = columns[3];
      const inode = columns[9];
      // State 0A is TCP_LISTEN.
      if (local?.endsWith(`:${hexPort}`) && state === "0A" && inode) inodes.add(inode);
    }
  }
  if (!readOne) return undefined;

  let entries: string[];
  try {
    entries = await readdir("/proc");
  } catch {
    return undefined;
  }
  const pids: number[] = [];
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    let descriptors: string[];
    try {
      descriptors = await readdir(`/proc/${entry}/fd`);
    } catch {
      continue; // a process we may not inspect
    }
    for (const descriptor of descriptors) {
      let target: string;
      try {
        target = await readlink(`/proc/${entry}/fd/${descriptor}`);
      } catch {
        continue; // closed while we looked
      }
      if (target.startsWith("socket:[") && inodes.has(target.slice(8, -1))) {
        pids.push(Number(entry));
        break;
      }
    }
  }
  return pids;
}

/** macOS: `lsof` lists the pids with the port in LISTEN state, one per line. Exit 1 means none. */
async function lsofListeningPids(port: number): Promise<number[] | undefined> {
  try {
    const { stdout } = await execFileAsync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
    return parsePids(stdout.split("\n"));
  } catch (error) {
    // lsof exits 1 when nothing matches; any other failure means we cannot tell.
    return (error as { code?: unknown }).code === 1 ? [] : undefined;
  }
}

/** Windows: `netstat -ano` prints the owning pid as the last column of each LISTENING row. */
async function netstatListeningPids(port: number): Promise<number[] | undefined> {
  try {
    const { stdout } = await execFileAsync("netstat", ["-ano", "-p", "TCP"]);
    const pids: string[] = [];
    for (const line of stdout.split(/\r?\n/)) {
      const columns = line.trim().split(/\s+/);
      const local = columns[1];
      if (columns[3] === "LISTENING" && local?.endsWith(`:${port}`) && columns[4]) {
        pids.push(columns[4]);
      }
    }
    return parsePids(pids);
  } catch {
    return undefined;
  }
}

/** Keep the lines that are positive integers, as numbers. */
function parsePids(lines: string[]): number[] {
  return lines
    .map((l) => l.trim())
    .filter((l) => /^\d+$/.test(l))
    .map(Number);
}
