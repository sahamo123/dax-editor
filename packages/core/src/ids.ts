// Id generation shared by the edit operations.

let counter = 0;

/** Generate a short id such as `clip_lx3k2a1`. Unique within a process; not meant to be unguessable. */
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}
