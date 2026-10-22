// Locate app-local release redistributables without assuming one laptop's Visual Studio version.
import { readdir } from "node:fs/promises";
import { join } from "node:path";

/** Return release CRT/OpenMP component names under an x64 redist directory, or undefined. Never accepts debug components. */
export async function redistComponents(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const names = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const crt = names.find((name) => /^Microsoft\.VC\d+\.CRT$/i.test(name));
  const openmp = names.find((name) => /^Microsoft\.VC\d+\.OpenMP$/i.test(name));
  return crt && openmp ? [crt, openmp] : undefined;
}

/** Find the newest complete x64 release CRT/OpenMP layout under ordered MSVC redist roots; never downloads or executes anything. */
export async function findRedist(roots) {
  for (const root of roots) {
    const direct = await redistComponents(root);
    if (direct) return { directory: root, components: direct };
    const versions = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const version of versions
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => b.localeCompare(a, "en", { numeric: true }))) {
      const directory = join(root, version, "x64");
      const components = await redistComponents(directory);
      if (components) return { directory, components };
    }
  }
  return undefined;
}
