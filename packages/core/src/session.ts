import { readFile, writeFile } from "node:fs/promises";
import { ProjectSchema, type Project } from "./schema.js";
import { emptyProject } from "./timeline.js";

/**
 * A Session owns the current project plus its undo/redo history, and
 * optionally persists every change to a `.dax.json` file so the CLI, MCP
 * server and desktop app can all look at the same project.
 */
export class Session {
  private undoStack: Project[] = [];
  private redoStack: Project[] = [];

  constructor(
    public project: Project,
    private readonly file?: string,
  ) {}

  static async open(file: string, fallbackName = "Untitled"): Promise<Session> {
    try {
      const raw = await readFile(file, "utf8");
      return new Session(ProjectSchema.parse(JSON.parse(raw)), file);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      const s = new Session(emptyProject(fallbackName), file);
      await s.save();
      return s;
    }
  }

  async save(): Promise<void> {
    if (this.file) await writeFile(this.file, JSON.stringify(this.project, null, 2));
  }

  /** Apply a pure edit. If it throws, the project is unchanged. */
  async apply(edit: (p: Project) => Project): Promise<Project> {
    const next = edit(this.project);
    this.undoStack.push(this.project);
    this.redoStack = [];
    this.project = next;
    await this.save();
    return next;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  async undo(): Promise<Project> {
    const prev = this.undoStack.pop();
    if (!prev) throw new Error("Nothing to undo");
    this.redoStack.push(this.project);
    this.project = prev;
    await this.save();
    return prev;
  }

  async redo(): Promise<Project> {
    const next = this.redoStack.pop();
    if (!next) throw new Error("Nothing to redo");
    this.undoStack.push(this.project);
    this.project = next;
    await this.save();
    return next;
  }
}
