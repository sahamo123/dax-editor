// A Session holds the current project with a full edit history (undo, redo, jump to any earlier state, named checkpoints) and optional saving to disk.

import { readFile, writeFile } from "node:fs/promises";
import type { CutPlan } from "./cuts.js";
import { type Project, ProjectSchema } from "./schema.js";
import { emptyProject, mainClips, timelineDuration } from "./timeline.js";

/** Who made an edit, so the history can tell manual work, AI work and template runs apart. */
export type HistorySource = "manual" | "ai" | "template" | "system";

/** Optional description attached to an edit when it is applied. */
export interface EditMeta {
  /** Short human-readable description, e.g. "Remove silences". Defaults to "Edit". */
  label?: string;
  source?: HistorySource;
}

/** One row of the history as shown in a History panel. */
export interface HistoryItem {
  /** Stable id; pass to {@link Session.restore}. Ids grow with time. */
  id: number;
  /** Id of the state this one was made from, or null for the starting state. */
  parent: number | null;
  label: string;
  source: HistorySource;
  /** ISO 8601 time the edit was applied. */
  at: string;
  /** Checkpoint name if the user saved this state as a named version. */
  name?: string;
  /** True for the state the project is in right now. */
  current: boolean;
  /** Quick facts so the UI can show what each state looks like without loading it. */
  duration: number;
  clips: number;
  overlays: number;
}

/** Most states kept; older ones are pruned (checkpoints and the current state are always kept). */
const MAX_HISTORY = 400;

interface HistoryEntry {
  id: number;
  parent: number | null;
  label: string;
  source: HistorySource;
  at: string;
  name?: string;
  project: Project;
}

/**
 * A Session owns the current project and its history, and optionally persists
 * the current project to a `.dax.json` file so the CLI, MCP server and desktop
 * app can all look at the same project.
 *
 * History is a tree, not a stack: every edit creates a new state whose parent is
 * the state it was made from. Undoing and then editing keeps the old branch, so
 * no state is ever lost and any of them can be restored with {@link Session.restore}.
 * History lives in memory for the life of the session; only the current project is saved.
 */
export class Session {
  private entries = new Map<number, HistoryEntry>();
  private nextId = 1;
  private currentId = 0;
  /** For each state, the child that undo/redo should walk back to. */
  private lastChild = new Map<number, number>();
  /** Cut plans waiting for review, by id. Kept in memory only; applying one is a normal edit in the history. */
  readonly plans = new Map<string, CutPlan>();
  private lastSaveError: string | undefined;

  constructor(
    public project: Project,
    private readonly file?: string,
  ) {
    this.entries.set(0, {
      id: 0,
      parent: null,
      label: "Start",
      source: "system",
      at: new Date().toISOString(),
      project,
    });
  }

  /** Open a project file, creating an empty project named `fallbackName` if it does not exist yet. Throws if the file exists but is not a valid project. */
  static async open(file: string, fallbackName = "Untitled"): Promise<Session> {
    try {
      const raw = await readFile(file, "utf8");
      const session = new Session(ProjectSchema.parse(JSON.parse(raw)), file);
      await session.loadHistory();
      return session;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      const s = new Session(emptyProject(fallbackName), file);
      await s.save();
      return s;
    }
  }

  /**
   * Message of the most recent failed autosave, or undefined when the last save worked. An edit is applied in
   * memory before it is saved, so a failed save (disk full, folder removed) does not fail or undo the edit;
   * callers show this instead so the user knows their work is not on disk.
   */
  get saveError(): string | undefined {
    return this.lastSaveError;
  }

  /** Record that a save worked, clearing {@link Session.saveError}. Subclasses that override `save` call this after writing. */
  protected markSaved(): void {
    this.lastSaveError = undefined;
  }

  /** Called when an autosave after an edit fails, with the error. Does nothing by default; subclasses may log it. */
  protected onAutosaveFailed(_err: unknown): void {}

  /** Write the current project to disk. Does nothing for sessions without a backing file. Throws if the write fails. */
  async save(): Promise<void> {
    await this.writeProjectFile();
    await this.saveHistory();
    this.markSaved();
  }

  /**
   * Write the project itself. Subclasses that save somewhere else override this; the base writes {@link Session.file}
   * when there is one and does nothing otherwise.
   */
  protected async writeProjectFile(): Promise<void> {
    if (!this.file) return;
    await writeFile(this.file, JSON.stringify(this.project, null, 2));
  }

  /** Save after a change without letting a failure undo or hide the change: the error goes to {@link Session.saveError}. */
  private async autosave(): Promise<void> {
    try {
      await this.save();
    } catch (err) {
      this.lastSaveError = err instanceof Error ? err.message : String(err);
      this.onAutosaveFailed(err);
    }
  }

  /** Where the history is kept: beside the project file. */
  protected get historyFile(): string | undefined {
    return this.file ? `${this.file}.history.json` : undefined;
  }

  /** Keep the history from growing forever: drop the oldest states, but never the current one or a named checkpoint. */
  private prune(): void {
    if (this.entries.size <= MAX_HISTORY) return;
    const protectedIds = new Set<number>([this.currentId]);
    for (const e of this.entries.values()) if (e.name) protectedIds.add(e.id);
    const ids = [...this.entries.keys()].sort((a, b) => a - b);
    let excess = this.entries.size - MAX_HISTORY;
    for (const id of ids) {
      if (excess <= 0) break;
      if (protectedIds.has(id)) continue;
      this.entries.delete(id);
      this.lastChild.delete(id);
      excess--;
    }
    for (const e of this.entries.values()) {
      if (e.parent !== null && !this.entries.has(e.parent)) e.parent = null;
    }
    for (const [parent, child] of this.lastChild) {
      if (!this.entries.has(parent) || !this.entries.has(child)) this.lastChild.delete(parent);
    }
  }

  protected async saveHistory(): Promise<void> {
    const file = this.historyFile;
    if (!file) return;
    this.prune();
    const data = {
      version: 1,
      currentId: this.currentId,
      nextId: this.nextId,
      entries: [...this.entries.values()],
      lastChild: [...this.lastChild.entries()],
    };
    await writeFile(file, JSON.stringify(data));
  }

  /** Load a saved history if it belongs to the project on disk; otherwise start fresh. Never throws. */
  protected async loadHistory(): Promise<void> {
    const file = this.historyFile;
    if (!file) return;
    try {
      const data = JSON.parse(await readFile(file, "utf8")) as {
        version?: number;
        currentId?: number;
        nextId?: number;
        entries?: HistoryEntry[];
        lastChild?: [number, number][];
      };
      if (data.version !== 1 || !Array.isArray(data.entries) || typeof data.currentId !== "number")
        return;
      const entries = new Map(data.entries.map((e) => [e.id, e] as const));
      const current = entries.get(data.currentId);
      // Only trust the history if its current state is exactly the project on disk.
      if (!current || JSON.stringify(current.project) !== JSON.stringify(this.project)) return;
      for (const e of entries.values()) e.project = ProjectSchema.parse(e.project);
      this.entries = entries;
      this.currentId = data.currentId;
      this.nextId = Math.max(data.nextId ?? 0, ...entries.keys()) + 1;
      this.lastChild = new Map(data.lastChild ?? []);
    } catch {
      // Missing, unreadable or stale history is not an error: the project itself is what matters.
    }
  }

  private get current(): HistoryEntry {
    const e = this.entries.get(this.currentId);
    if (!e) throw new Error("History is corrupt: current state is missing");
    return e;
  }

  private async moveTo(id: number): Promise<Project> {
    const e = this.entries.get(id);
    if (!e) throw new Error(`Unknown history state ${id}`);
    this.currentId = id;
    this.project = e.project;
    // The state change is already real in memory; a failed save must not turn a done edit into a reported failure.
    await this.autosave();
    return e.project;
  }

  /** Apply a pure edit as a new history state. If the edit throws, nothing changes. */
  async apply(edit: (p: Project) => Project, meta: EditMeta = {}): Promise<Project> {
    const next = edit(this.project);
    const entry: HistoryEntry = {
      id: this.nextId++,
      parent: this.currentId,
      label: meta.label ?? "Edit",
      source: meta.source ?? "manual",
      at: new Date().toISOString(),
      project: next,
    };
    this.entries.set(entry.id, entry);
    this.lastChild.set(this.currentId, entry.id);
    return this.moveTo(entry.id);
  }

  /** Whether {@link Session.undo} has anything to revert. */
  get canUndo(): boolean {
    return this.current.parent !== null;
  }

  /** Whether {@link Session.redo} has anything to re-apply. */
  get canRedo(): boolean {
    return this.lastChild.has(this.currentId);
  }

  /** Step back to the state this one was made from. Throws if already at the start. */
  async undo(): Promise<Project> {
    const parent = this.current.parent;
    if (parent === null) throw new Error("Nothing to undo");
    this.lastChild.set(parent, this.currentId);
    return this.moveTo(parent);
  }

  /** Step forward along the branch most recently walked. Throws if there is nowhere to go. */
  async redo(): Promise<Project> {
    const child = this.lastChild.get(this.currentId);
    if (child === undefined) throw new Error("Nothing to redo");
    return this.moveTo(child);
  }

  /** Every state ever reached in this session, oldest first, with the current one flagged. */
  history(): HistoryItem[] {
    return [...this.entries.values()]
      .sort((a, b) => a.id - b.id)
      .map((e) => {
        const item: HistoryItem = {
          id: e.id,
          parent: e.parent,
          label: e.label,
          source: e.source,
          at: e.at,
          current: e.id === this.currentId,
          duration: timelineDuration(e.project),
          clips: mainClips(e.project).length,
          overlays: e.project.timeline.overlays.length,
        };
        if (e.name) item.name = e.name;
        return item;
      });
  }

  /** Jump to any earlier (or later) state by id. Nothing is discarded; you can jump back again. */
  async restore(id: number): Promise<Project> {
    if (!this.entries.has(id)) throw new Error(`Unknown history state ${id}`);
    // Make redo from every ancestor lead toward the restored state.
    let e: HistoryEntry | undefined = this.entries.get(id);
    while (e && e.parent !== null) {
      this.lastChild.set(e.parent, e.id);
      e = this.entries.get(e.parent);
    }
    return this.moveTo(id);
  }

  /** Save the current state as a named version. Reusing a name moves it to the current state. */
  checkpoint(name: string): void {
    const clean = name.trim();
    if (!clean) throw new Error("Checkpoint name cannot be empty");
    for (const e of this.entries.values()) if (e.name === clean) delete e.name;
    this.current.name = clean;
  }

  /** {@link Session.checkpoint} followed by an autosave, so the name reaches the history file. A failed save is reported in {@link Session.saveError}, not thrown. */
  async saveCheckpoint(name: string): Promise<void> {
    this.checkpoint(name);
    await this.autosave();
  }

  /** Jump back to a named version. Throws if no checkpoint has that name. */
  async restoreCheckpoint(name: string): Promise<Project> {
    const e = [...this.entries.values()].find((x) => x.name === name.trim());
    if (!e) throw new Error(`No checkpoint named "${name}"`);
    return this.restore(e.id);
  }
}
