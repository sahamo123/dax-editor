// The one open project: an engine Session that autosaves, tells the server when anything changes, and the new/open/save operations.
// Project files live under <data>/projects unless the user saves elsewhere; they never contain API keys (core's Project has no place for them).

import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { emptyProject, isPathInside, type Project, ProjectSchema, Session } from "@dax/core";
import type { ProjectNewRequest } from "@dax/protocol";
import type { Logger } from "./logger.js";
import { PathNotAllowedError, resolveInsideRoots } from "./paths.js";
import type { AppStateStore } from "./stores.js";
import { writeFileAtomic } from "./stores.js";

/** Project files larger than this are refused when opening (a real project is a few hundred KB at most). */
const MAX_PROJECT_BYTES = 50 * 1024 * 1024;
/** Required file ending for project files, so the picker and the server agree on what is a project. */
const PROJECT_EXTENSION = ".dax.json";

/**
 * A core {@link Session} that saves atomically to a path the server controls and calls `onChange`
 * after every history movement, whoever caused it (UI command, AI run, undo). Overrides are the
 * only way to observe changes made by code that holds the session, such as the agent.
 */
export class EngineSession extends Session {
  /** Identity of this open session; never reused after switching projects. */
  readonly projectId = randomUUID();
  /** Monotonic project revision, including undo/redo, for stale command detection. */
  revision = 0;
  /** Where the project is autosaved. */
  savePath: string;
  /** True once the user chose the location (open or save-as); false for scratch projects in the data folder. */
  userSaved: boolean;
  /** Set by the server; called after each change. */
  onChange: () => void = () => undefined;
  /** Set by the server; called with the error when an autosave after a change fails (the change itself is kept). */
  onSaveFailed: (err: unknown) => void = () => undefined;

  constructor(project: Project, savePath: string, userSaved: boolean) {
    super(project);
    this.savePath = savePath;
    this.userSaved = userSaved;
  }

  /** Write the current project to {@link EngineSession.savePath} atomically. */
  protected override async writeProjectFile(): Promise<void> {
    await writeFileAtomic(this.savePath, JSON.stringify(this.project, null, 2));
  }

  /**
   * "Save as": write the project to `path` and only then make it the autosave location. If the write fails
   * (read-only folder, name taken by a directory) the session keeps saving to where it was before.
   */
  async saveAs(path: string): Promise<void> {
    await writeFileAtomic(path, JSON.stringify(this.project, null, 2));
    this.savePath = path;
    this.userSaved = true;
    // The history follows the project to its new home.
    await this.saveHistory();
    this.markSaved();
  }

  protected override onAutosaveFailed(err: unknown): void {
    this.onSaveFailed(err);
  }

  /** See {@link Session.apply}; also notifies the server. */
  override async apply(...args: Parameters<Session["apply"]>): ReturnType<Session["apply"]> {
    const before = this.project;
    try {
      return await super.apply(...args);
    } finally {
      if (this.project !== before) this.revision++;
      this.onChange();
    }
  }

  /** See {@link Session.undo}; also notifies the server. */
  override async undo(): ReturnType<Session["undo"]> {
    const before = this.project;
    try {
      return await super.undo();
    } finally {
      if (this.project !== before) this.revision++;
      this.onChange();
    }
  }

  /** See {@link Session.redo}; also notifies the server. */
  override async redo(): ReturnType<Session["redo"]> {
    const before = this.project;
    try {
      return await super.redo();
    } finally {
      if (this.project !== before) this.revision++;
      this.onChange();
    }
  }

  /** See {@link Session.restore}; also notifies the server. */
  override async restore(id: number): ReturnType<Session["restore"]> {
    const before = this.project;
    try {
      return await super.restore(id);
    } finally {
      if (this.project !== before) this.revision++;
      this.onChange();
    }
  }

  /** History is kept beside the project file the user chose or the scratch file, so it follows the project. */
  protected override get historyFile(): string {
    return `${this.savePath}.history.json`;
  }

  /** Load the saved history for this project (ignored if it does not match the project on disk). Call once after construction. */
  async restoreHistory(): Promise<void> {
    await this.loadHistory();
  }

  /** See {@link Session.checkpoint}; also notifies the server (checkpoint names appear in the history list). */
  override checkpoint(name: string): void {
    super.checkpoint(name);
    this.onChange();
  }
}

/** Creates, opens and saves projects, and owns the current {@link EngineSession}. */
export class ProjectManager {
  private opened: EngineSession | undefined;
  private readonly projectsDir: string;

  constructor(
    private readonly cfg: {
      dataDir: string;
      allowedRoots: readonly string[];
      appState: AppStateStore;
      log: Logger;
      /** Called after any change to the session or when the session is replaced. */
      onChange: () => void;
    },
  ) {
    this.projectsDir = join(cfg.dataDir, "projects");
  }

  /** The open project's session. Valid after {@link ProjectManager.init}. */
  get session(): EngineSession {
    if (!this.opened) throw new Error("ProjectManager.init() has not been called");
    return this.opened;
  }

  /** Path of the project file if the user has chosen one (open or save-as); otherwise undefined. */
  get projectPath(): string | undefined {
    return this.session.userSaved ? this.session.savePath : undefined;
  }

  /** Reopen the project from the last run if it is still valid, otherwise start an empty one. */
  async init(): Promise<void> {
    await mkdir(this.projectsDir, { recursive: true });
    const last = await this.cfg.appState.lastProject();
    if (last) {
      try {
        const inData = isPathInside(this.projectsDir, last);
        if (!inData) await resolveInsideRoots(last, this.cfg.allowedRoots);
        await this.adopt(await this.load(last, !inData));
        return;
      } catch (err) {
        this.cfg.log.warn(`could not reopen the last project: ${String(err)}`);
      }
    }
    await this.createNew({ name: "Untitled" });
  }

  /** Start a new empty project saved under the data folder, replacing the open one. */
  async createNew(req: ProjectNewRequest): Promise<void> {
    const slug = req.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    const file = join(
      this.projectsDir,
      `${slug || "project"}-${randomBytes(3).toString("hex")}${PROJECT_EXTENSION}`,
    );
    const project = emptyProject(req.name, {
      ...(req.width !== undefined ? { width: req.width } : {}),
      ...(req.height !== undefined ? { height: req.height } : {}),
      ...(req.fps !== undefined ? { fps: req.fps } : {}),
    });
    const session = new EngineSession(project, file, false);
    await session.save();
    await this.adopt(session);
  }

  /** Open a project file chosen by the user. Throws a user-safe `Error` if the path is not allowed, is not a project, or is invalid. */
  async open(path: string): Promise<void> {
    if (
      (await this.cfg.appState.recentProjects()).includes(path) &&
      isPathInside(this.projectsDir, path)
    ) {
      await resolveInsideRoots(path, [this.projectsDir]);
      await this.adopt(await this.load(path, false));
      return;
    }
    const abs = await this.checkProjectPath(path);
    await this.adopt(await this.load(abs, true));
  }

  /** Return recently opened project locations, including autosaved scratch projects. */
  recentProjects(): Promise<string[]> {
    return this.cfg.appState.recentProjects();
  }

  /** Validate uploaded project data and open a private autosaved copy without overwriting its source. */
  async openCopy(value: unknown): Promise<void> {
    const project = ProjectSchema.parse(value);
    for (const asset of Object.values(project.assets))
      await resolveInsideRoots(asset.path, this.cfg.allowedRoots);
    const file = join(this.projectsDir, `import-${randomBytes(8).toString("hex")}.dax.json`);
    const session = new EngineSession(project, file, false);
    await session.save();
    await this.adopt(session);
  }

  /** Save the open project. With `path`, "save as": the project now lives there and autosaves to it. */
  async save(path?: string): Promise<void> {
    if (path !== undefined) {
      const abs = await this.checkProjectPath(path);
      // Commit the new location only after the file is really there, so a failed save-as changes nothing.
      await this.session.saveAs(abs);
      await this.cfg.appState.setLastProject(abs);
    } else {
      await this.session.save();
    }
    this.cfg.onChange();
  }

  /** Flush the current project to disk. Used on shutdown. */
  async flush(): Promise<void> {
    await this.session.save();
  }

  private async checkProjectPath(path: string): Promise<string> {
    const abs = await resolveInsideRoots(path, this.cfg.allowedRoots);
    if (!abs.toLowerCase().endsWith(PROJECT_EXTENSION)) {
      throw new Error(`Project files must end in ${PROJECT_EXTENSION}: ${abs}`);
    }
    return abs;
  }

  private async load(file: string, userSaved: boolean): Promise<EngineSession> {
    const st = await stat(file);
    if (!st.isFile() || st.size > MAX_PROJECT_BYTES)
      throw new Error(`Not a usable project file: ${file}`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(file, "utf8"));
    } catch {
      throw new Error(`${file} is not valid JSON`);
    }
    const result = ProjectSchema.safeParse(parsed);
    if (!result.success)
      throw new Error(
        `${file} is not a dax project: ${result.error.issues[0]?.message ?? "invalid"}`,
      );
    // A project file is untrusted input: its asset paths later reach FFmpeg (proxies, export). Refuse files
    // that point outside the folders the user allowed, instead of discovering that at render time.
    for (const asset of Object.values(result.data.assets)) {
      await resolveInsideRoots(asset.path, this.cfg.allowedRoots).catch(() => {
        throw new PathNotAllowedError(
          `${basename(file)} references a file outside the allowed folders: ${asset.path}`,
        );
      });
    }
    const session = new EngineSession(result.data, file, userSaved);
    await session.restoreHistory();
    return session;
  }

  private async adopt(session: EngineSession): Promise<void> {
    if (this.opened) await this.opened.save().catch(() => undefined);
    session.onChange = this.cfg.onChange;
    session.onSaveFailed = (err) => this.cfg.log.warn(`autosave failed: ${String(err)}`);
    this.opened = session;
    await this.cfg.appState.setLastProject(session.savePath);
    this.cfg.onChange();
  }
}
