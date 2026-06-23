import { app } from "electron";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_SHELL = process.platform === "win32" ? "powershell.exe" : "/bin/sh";

interface StoredProject {
  id: string;
  name: string;
  path: string;
  color?: string | null;
  logoPath?: string | null;
  pinned?: boolean;
  sessions: StoredSession[];
}

interface StoredSession {
  id: string;
  name: string;
  shell: string;
  cliTool?: string | null;
  pendingLaunchCommand?: string | null;
  pinned?: boolean;
  createdAt?: number | null;
  lastActiveAt?: number | null;
  commandCount?: number | null;
  startupDurationMs?: number | null;
}

type ProjectRow = {
  id: string;
  name: string;
  path: string;
  color: string | null;
  logo_path: string | null;
  pinned: number;
  sort_order: number;
  time_created: number;
  time_updated: number;
};

type SessionRow = {
  id: string;
  project_id: string;
  name: string;
  shell: string;
  cli_tool: string | null;
  pending_launch_command: string | null;
  pinned: number;
  created_at: number | null;
  last_active_at: number | null;
  command_count: number | null;
  startup_duration_ms: number | null;
  sort_order: number;
};

const MAX_SESSION_OUTPUT_CHARS = 8 * 1024 * 1024;

let client: DatabaseSync | null = null;

function userDataPath(...parts: string[]) {
  return path.join(app.getPath("userData"), ...parts);
}

function databasePath() {
  return userDataPath("shob.db");
}

function projectsJsonPath() {
  return userDataPath("projects.json");
}

function legacySessionOutputPath(sessionId: string) {
  const safeId = String(sessionId).replace(/[^a-zA-Z0-9._-]/g, "_");
  return userDataPath("sessions", `${safeId}.log`);
}

function now() {
  return Date.now();
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.floor(value);
}

function counter(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function tailText(value: string) {
  if (value.length <= MAX_SESSION_OUTPUT_CHARS) return value;
  return value.slice(value.length - MAX_SESSION_OUTPUT_CHARS);
}

function readLegacyProjects(): StoredProject[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(projectsJsonPath(), "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readLegacyOutput(sessionId: string) {
  try {
    return fs.readFileSync(legacySessionOutputPath(sessionId), "utf8");
  } catch {
    return "";
  }
}

function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function createSchema(db: DatabaseSync) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      color TEXT,
      logo_path TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      shell TEXT NOT NULL,
      cli_tool TEXT,
      pending_launch_command TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER,
      last_active_at INTEGER,
      command_count INTEGER NOT NULL DEFAULT 0,
      startup_duration_ms INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      time_updated INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_output (
      session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
      output TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS work_terminals (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      shell TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS terminal_layouts (
      project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      active_terminal_id TEXT,
      panel_height INTEGER NOT NULL DEFAULT 280,
      panel_opened INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS projects_sort_idx ON projects(sort_order, time_updated);
    CREATE INDEX IF NOT EXISTS sessions_project_sort_idx ON sessions(project_id, sort_order, created_at);
    CREATE INDEX IF NOT EXISTS sessions_project_activity_idx ON sessions(project_id, last_active_at);
    CREATE INDEX IF NOT EXISTS work_terminals_project_sort_idx ON work_terminals(project_id, sort_order, time_created);
  `);
}

function ensureProjectColumns(db: DatabaseSync) {
  const columns = db.prepare("PRAGMA table_info(projects)").all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));
  if (!names.has("pinned")) {
    db.exec("ALTER TABLE projects ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0");
  }
  if (!names.has("sort_order")) {
    db.exec("ALTER TABLE projects ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
  }
}

function ensureSessionColumns(db: DatabaseSync) {
  const columns = db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));
  if (!names.has("pinned")) {
    db.exec("ALTER TABLE sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0");
  }
}

function projectCount(db: DatabaseSync) {
  const row = db.prepare("SELECT COUNT(*) AS count FROM projects").get() as { count: number } | undefined;
  return Number(row?.count ?? 0);
}

function sessionExists(db: DatabaseSync, sessionId: string) {
  const row = db.prepare("SELECT 1 FROM sessions WHERE id = ?").get(sessionId) as { "1": number } | undefined;
  return Boolean(row);
}

function insertProject(db: DatabaseSync, project: StoredProject, sortOrder: number) {
  const timestamp = now();
  db.prepare(`
    INSERT INTO projects (
      id, name, path, color, logo_path, pinned, sort_order, time_created, time_updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      path = excluded.path,
      color = excluded.color,
      logo_path = excluded.logo_path,
      pinned = excluded.pinned,
      sort_order = excluded.sort_order,
      time_updated = excluded.time_updated
  `).run(
    project.id,
    project.name || path.basename(project.path || "") || "Project",
    project.path || "",
    optionalString(project.color),
    optionalString(project.logoPath),
    project.pinned ? 1 : 0,
    sortOrder,
    timestamp,
    timestamp,
  );
}

function insertSession(db: DatabaseSync, projectId: string, session: StoredSession, sortOrder: number) {
  const timestamp = now();
  const createdAt = optionalNumber(session.createdAt) ?? timestamp;
  const lastActiveAt = optionalNumber(session.lastActiveAt) ?? createdAt;

  db.prepare(`
    INSERT INTO sessions (
      id,
      project_id,
      name,
      shell,
      cli_tool,
      pending_launch_command,
      pinned,
      created_at,
      last_active_at,
      command_count,
      startup_duration_ms,
      sort_order,
      time_updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      project_id = excluded.project_id,
      name = excluded.name,
      shell = excluded.shell,
      cli_tool = excluded.cli_tool,
      pending_launch_command = excluded.pending_launch_command,
      pinned = excluded.pinned,
      created_at = excluded.created_at,
      last_active_at = excluded.last_active_at,
      command_count = excluded.command_count,
      startup_duration_ms = excluded.startup_duration_ms,
      sort_order = excluded.sort_order,
      time_updated = excluded.time_updated
  `).run(
    session.id,
    projectId,
    session.name || 'Terminal',
    session.shell || DEFAULT_SHELL,
    optionalString(session.cliTool),
    optionalString(session.pendingLaunchCommand),
    session.pinned ? 1 : 0,
    createdAt,
    lastActiveAt,
    counter(session.commandCount),
    optionalNumber(session.startupDurationMs),
    sortOrder,
    timestamp,
  );
}

function migrateLegacyJson(db: DatabaseSync) {
  if (projectCount(db) > 0) return;

  const projects = readLegacyProjects();
  if (projects.length === 0) return;

  withTransaction(db, () => {
    projects.forEach((project, projectIndex) => {
      if (!project?.id) return;

      insertProject(db, project, projectIndex);

      const sessions = Array.isArray(project.sessions) ? project.sessions : [];
      sessions.forEach((session, sessionIndex) => {
        if (!session?.id) return;
        insertSession(db, project.id, session, sessionIndex);

        const output = readLegacyOutput(session.id);
        if (output) {
          db.prepare(`
            INSERT INTO session_output (session_id, output, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
              output = excluded.output,
              updated_at = excluded.updated_at
          `).run(session.id, tailText(output), now());
        }
      });
    });
  });
}

export function initSessionDatabase() {
  if (client) return client;

  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.mkdirSync(userDataPath("sessions"), { recursive: true });

  const db = new DatabaseSync(databasePath());
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
  `);
  createSchema(db);
  ensureProjectColumns(db);
  ensureSessionColumns(db);
  migrateLegacyJson(db);
  client = db;
  return db;
}

function db() {
  return client ?? initSessionDatabase();
}

export function loadProjects(): StoredProject[] {
  const database = db();
  const projectRows = database
    .prepare("SELECT * FROM projects ORDER BY sort_order ASC, time_updated DESC")
    .all() as ProjectRow[];
  const sessionRows = database
    .prepare("SELECT * FROM sessions ORDER BY project_id ASC, sort_order ASC, created_at ASC")
    .all() as SessionRow[];

  const sessionsByProject = new Map<string, StoredSession[]>();
  for (const row of sessionRows) {
    const sessions = sessionsByProject.get(row.project_id) ?? [];
    sessions.push({
      id: row.id,
      name: row.name,
      shell: row.shell,
      cliTool: row.cli_tool,
      pendingLaunchCommand: row.pending_launch_command,
      pinned: Boolean(row.pinned),
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
      commandCount: row.command_count,
      startupDurationMs: row.startup_duration_ms,
    });
    sessionsByProject.set(row.project_id, sessions);
  }

  return projectRows.map((row) => ({
    id: row.id,
    name: row.name,
    path: row.path,
    color: row.color,
    logoPath: row.logo_path,
    pinned: Boolean(row.pinned),
    sessions: sessionsByProject.get(row.id) ?? [],
  }));
}

export function saveProject(project: StoredProject): StoredProject {
  const database = db();
  const existing = database
    .prepare("SELECT sort_order FROM projects WHERE id = ?")
    .get(project.id) as { sort_order: number } | undefined;
  const maxRow = database
    .prepare("SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM projects")
    .get() as { max_sort: number } | undefined;
  const sortOrder = existing?.sort_order ?? Number(maxRow?.max_sort ?? -1) + 1;

  withTransaction(database, () => {
    insertProject(database, project, sortOrder);

    const nextSessionIds = new Set((project.sessions ?? []).map((session) => session.id));
    const existingSessionRows = database
      .prepare("SELECT id FROM sessions WHERE project_id = ?")
      .all(project.id) as Array<{ id: string }>;

    for (const row of existingSessionRows) {
      if (!nextSessionIds.has(row.id)) {
        database.prepare("DELETE FROM sessions WHERE id = ?").run(row.id);
      }
    }

    (project.sessions ?? []).forEach((session, index) => {
      insertSession(database, project.id, session, index);
    });
  });

  return loadProjects().find((item) => item.id === project.id) ?? project;
}

export function reorderProjects(projectIds: string[] = []): StoredProject[] {
  const database = db();
  const rows = database
    .prepare("SELECT id FROM projects ORDER BY sort_order ASC, time_updated DESC")
    .all() as Array<{ id: string }>;
  const knownIds = new Set(rows.map((row) => row.id));
  const seenIds = new Set<string>();
  const orderedIds: string[] = [];

  for (const projectId of projectIds) {
    if (typeof projectId !== "string" || !knownIds.has(projectId) || seenIds.has(projectId)) continue;
    seenIds.add(projectId);
    orderedIds.push(projectId);
  }

  for (const row of rows) {
    if (seenIds.has(row.id)) continue;
    orderedIds.push(row.id);
  }

  withTransaction(database, () => {
    const update = database.prepare("UPDATE projects SET sort_order = ? WHERE id = ?");
    orderedIds.forEach((projectId, index) => {
      update.run(index, projectId);
    });
  });

  return loadProjects();
}

export function deleteProject(projectId: string) {
  db().prepare("DELETE FROM projects WHERE id = ?").run(projectId);
}

export function saveSessionOutput(sessionId: string, output: string) {
  const database = db();
  if (!sessionExists(database, sessionId)) return;

  database.prepare(`
    INSERT INTO session_output (session_id, output, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      output = excluded.output,
      updated_at = excluded.updated_at
  `).run(sessionId, tailText(output || ""), now());
}

export function appendSessionOutput(sessionId: string, output: string) {
  if (!output) return;

  const database = db();
  if (!sessionExists(database, sessionId)) return;

  database.prepare(`
    INSERT INTO session_output (session_id, output, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      output = substr(session_output.output || excluded.output, -?),
      updated_at = excluded.updated_at
  `).run(sessionId, output, now(), MAX_SESSION_OUTPUT_CHARS);
}

export function loadSessionOutput(sessionId: string) {
  const row = db()
    .prepare("SELECT output FROM session_output WHERE session_id = ?")
    .get(sessionId) as { output: string } | undefined;
  if (row?.output) return row.output;

  const legacyOutput = readLegacyOutput(sessionId);
  if (legacyOutput) {
    try {
      saveSessionOutput(sessionId, legacyOutput);
    } catch {
      // The session may have already been deleted; still return the legacy log.
    }
  }

  return legacyOutput;
}

export function closeSessionDatabase() {
  if (!client) return;
  client.close();
  client = null;
}

export function loadWorkTerminals(projectId: string) {
  const rows = db()
    .prepare("SELECT * FROM work_terminals WHERE project_id = ? ORDER BY sort_order ASC, time_created ASC")
    .all(projectId) as any[];
  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    shell: row.shell,
    sortOrder: row.sort_order,
    timeCreated: row.time_created,
    timeUpdated: row.time_updated,
  }));
}

export function saveWorkTerminal(terminal: any) {
  const timestamp = Date.now();
  db().prepare(`
    INSERT INTO work_terminals (id, project_id, title, shell, sort_order, time_created, time_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      shell = excluded.shell,
      sort_order = excluded.sort_order,
      time_updated = excluded.time_updated
  `).run(
    terminal.id,
    terminal.projectId,
    terminal.title,
    terminal.shell,
    terminal.sortOrder ?? 0,
    terminal.timeCreated ?? timestamp,
    timestamp
  );
}

export function deleteWorkTerminal(id: string) {
  db().prepare("DELETE FROM work_terminals WHERE id = ?").run(id);
}

export function reorderWorkTerminals(terminalIds: string[]) {
  const database = db();
  withTransaction(database, () => {
    const update = database.prepare("UPDATE work_terminals SET sort_order = ? WHERE id = ?");
    terminalIds.forEach((id, index) => {
      update.run(index, id);
    });
  });
}

export function loadTerminalLayout(projectId: string) {
  const row = db()
    .prepare("SELECT * FROM terminal_layouts WHERE project_id = ?")
    .get(projectId) as any;
  if (row) {
    return {
      projectId: row.project_id,
      activeTerminalId: row.active_terminal_id,
      panelHeight: row.panel_height,
      panelOpened: Boolean(row.panel_opened),
    };
  }
  return {
    projectId,
    activeTerminalId: null,
    panelHeight: 280,
    panelOpened: false,
  };
}

export function saveTerminalLayout(layout: any) {
  db().prepare(`
    INSERT INTO terminal_layouts (project_id, active_terminal_id, panel_height, panel_opened)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      active_terminal_id = excluded.active_terminal_id,
      panel_height = excluded.panel_height,
      panel_opened = excluded.panel_opened
  `).run(
    layout.projectId,
    layout.activeTerminalId,
    layout.panelHeight,
    layout.panelOpened ? 1 : 0
  );
}
