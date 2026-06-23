import { batch } from 'solid-js';
import { createStore } from 'solid-js/store';
import { nativeApi } from '../services/native';
import { api } from '../services/api';
import { STORAGE_KEYS } from '../constants/storage';
import {
  getStoredValue,
  setStoredValue,
  sanitizeSessionName,
  inferSessionCreatedAt,
  inferSessionLastActiveAt,
  normalizeSessionCounter,
  normalizeOptionalDuration,
} from '../utils';
import { CLI_CATALOG, DEFAULT_CLI_ID, type CliProbeResult } from '../config/check';
import type { Project, Session, CliTool } from '../types';
import { toLocalShobSession } from '@/utils/shob-session';
import type { WorkTerminal, TerminalLayout } from '../electron';

const SESSION_ACTIVITY_PERSIST_THROTTLE_MS = 15_000;
let launchSessionQueue: Promise<unknown> = Promise.resolve();

type ShobSession = {
  id: string;
  parentID?: string;
  title?: string;
  time?: {
    created?: number;
    updated?: number;
    archived?: number;
  };
};

const buildCatalogCliTools = (probeResults: CliProbeResult[] = []): CliTool[] => {
  const resultById = new Map(probeResults.map((result) => [result.id, result]));

  return CLI_CATALOG.map((item): CliTool => {
    const probe = resultById.get(item.id);

    return {
      id: item.id,
      label: item.label,
      iconKey: item.iconKey,
      default: item.default,
      priority: item.priority,
      installed: probe?.installed ?? false,
      resolvedPath: probe?.resolvedPath ?? null,
      matchedCommand: probe?.matchedCommand ?? null,
      installCommand: item.installCommand,
    };
  }).sort((left, right) => {
    if (left.installed !== right.installed) {
      return left.installed ? -1 : 1;
    }

    return left.priority - right.priority;
  });
};

const normalizeProjects = (projects: Project[]): Project[] =>
  projects.map((project) => ({
    ...project,
    color: project.color ?? null,
    logoPath: project.logoPath ?? null,
    pinned: Boolean(project.pinned),
    sessions: sortSessions(project.sessions.map((session) => ({
      ...session,
      name: sanitizeSessionName(session.name) || session.name,
      pinned: Boolean(session.pinned),
      createdAt: inferSessionCreatedAt(session),
      lastActiveAt: inferSessionLastActiveAt(session),
      commandCount: normalizeSessionCounter(session.commandCount),
      startupDurationMs: normalizeOptionalDuration(session.startupDurationMs),
    }))),
  }));

const sortProjects = (projects: Project[]): Project[] =>
  [...projects].sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    return 0;
  });

const sortSessions = (sessions: Session[]): Session[] =>
  [...sessions].sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    const leftUpdated = left.lastActiveAt ?? left.createdAt ?? 0;
    const rightUpdated = right.lastActiveAt ?? right.createdAt ?? 0;
    return rightUpdated - leftUpdated;
  });

const findProjectBySessionId = (projects: Project[], sessionId: string | null) => {
  if (!sessionId) return { project: null, session: null };

  for (const project of projects) {
    const session = project.sessions.find((item) => item.id === sessionId);
    if (session) {
      return { project, session };
    }
  }

  return { project: null, session: null };
};

export type CliLaunchMode = 'new-tab' | 'replace-current';
export type ThemeScheme = 'system' | 'light' | 'dark';

interface AppState {
  projects: Project[];
  currentProjectId: string | null;
  activeSessionId: string | null;
  preferredCliId: string | null;
  preferredShell: string | null;
  cliLaunchMode: CliLaunchMode;
  cliTools: CliTool[];
  availableShells: string[];
  themeId: string;
  colorScheme: ThemeScheme;
  isLoading: boolean;
  workTerminals: Record<string, WorkTerminal[]>;
  terminalLayouts: Record<string, TerminalLayout>;
}

interface AppActions {
  loadProjects: () => Promise<void>;
  addProject: (name: string, path: string) => Promise<Project>;
  updateProject: (projectId: string, updates: Partial<Project>) => Promise<void>;
  reorderProjects: (projectIds: string[]) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setCurrentProject: (id: string | null) => void;
  setCurrentProjectId: (id: string | null) => void;
  addSession: (projectId: string, shell: string) => Promise<Session>;
  addIsolatedSession: (projectId: string, shell: string) => Promise<Session>;
  launchCliSession: (projectId: string, cliId?: string | null) => Promise<Session>;
  renameSession: (projectId: string, sessionId: string, name: string) => Promise<void>;
  updateSession: (projectId: string, sessionId: string, updates: Partial<Session>) => Promise<void>;
  removeSession: (projectId: string, sessionId: string) => Promise<void>;
  syncShobSessions: (projectId: string, sessions: ShobSession[]) => Promise<void>;
  setActiveSession: (sessionId: string | null) => void;
  recordSessionActivity: (projectId: string, sessionId: string, at?: number) => Promise<void>;
  recordSessionCommand: (projectId: string, sessionId: string, at?: number) => Promise<void>;
  recordSessionStartup: (projectId: string, sessionId: string, startupDurationMs: number, at?: number) => Promise<void>;
  loadCliTools: () => Promise<void>;
  loadAvailableShells: () => Promise<void>;
  getDefaultCliTool: () => CliTool | null;
  getCurrentCliTool: () => CliTool | null;
  setPreferredCliTool: (cliId: string | null) => void;
  setPreferredShell: (shell: string | null) => void;
  setCliLaunchMode: (mode: CliLaunchMode) => void;
  setThemeId: (themeId: string) => void;
  setColorScheme: (scheme: ThemeScheme) => void;
  installCliTool: (cliId: string, installCommand?: string | null) => Promise<Session>;
  loadWorkTerminals: (projectId: string) => Promise<void>;
  createWorkTerminal: (projectId: string, shell: string, title?: string) => Promise<WorkTerminal>;
  updateWorkTerminal: (id: string, updates: Partial<WorkTerminal>) => Promise<void>;
  reorderWorkTerminals: (projectId: string, terminalIds: string[]) => Promise<void>;
  deleteWorkTerminal: (id: string) => Promise<void>;
  loadTerminalLayout: (projectId: string) => Promise<TerminalLayout>;
  saveTerminalLayout: (projectId: string, layout: Partial<TerminalLayout>) => Promise<void>;
}

const [store, setStore] = createStore<AppState>({
  projects: [],
  currentProjectId: getStoredValue(STORAGE_KEYS.currentProjectId),
  activeSessionId: getStoredValue(STORAGE_KEYS.activeSessionId),
  preferredCliId: getStoredValue(STORAGE_KEYS.preferredCliId),
  preferredShell: null,
  cliLaunchMode: getStoredValue(STORAGE_KEYS.cliLaunchMode) === 'replace-current' ? 'replace-current' : 'new-tab',
  cliTools: buildCatalogCliTools(),
  availableShells: [],
  themeId: getStoredValue(STORAGE_KEYS.themeId) ?? 'oc-2',
  colorScheme: (getStoredValue(STORAGE_KEYS.colorScheme) as ThemeScheme) ?? 'system',
  isLoading: true,
  workTerminals: {},
  terminalLayouts: {},
});

const pendingSaves = new Map<string, NodeJS.Timeout>();
function debouncedSaveProject(project: Project) {
  const existing = pendingSaves.get(project.id);
  if (existing) clearTimeout(existing);
  pendingSaves.set(project.id, setTimeout(() => {
    pendingSaves.delete(project.id);
    api.saveProject(project).catch(() => undefined);
  }, 2000));
}

export const actions: AppActions = {
  loadProjects: async () => {
    try {
      const normalizedProjects = normalizeProjects(await api.getProjects());
      const storedProjectId = getStoredValue(STORAGE_KEYS.currentProjectId);
      const storedSessionId = getStoredValue(STORAGE_KEYS.activeSessionId);
      const projects = sortProjects(normalizedProjects);

      const resolvedProjectId =
        storedProjectId && projects.some((project) => project.id === storedProjectId)
          ? storedProjectId
          : projects[0]?.id ?? null;
      const resolvedProject = projects.find((project) => project.id === resolvedProjectId);
      const resolvedSessionId =
        storedSessionId && resolvedProject?.sessions.some((session) => session.id === storedSessionId)
          ? storedSessionId
          : resolvedProject?.sessions[0]?.id ?? null;

      setStoredValue(STORAGE_KEYS.currentProjectId, resolvedProjectId);
      setStoredValue(STORAGE_KEYS.activeSessionId, resolvedSessionId);
      setStore({
        projects,
        currentProjectId: resolvedProjectId,
        activeSessionId: resolvedSessionId,
      });
    } catch (error) {
      console.error('Failed to load projects:', error);
      setStore({ projects: [], currentProjectId: null, activeSessionId: null });
    } finally {
      setStore({ isLoading: false });
    }
  },

  addProject: async (name: string, path: string) => {
    const project: Project = {
      id: crypto.randomUUID(),
      name,
      path,
      color: null,
      logoPath: null,
      sessions: [],
    };
    const saved = await api.saveProject(project);
    setStoredValue(STORAGE_KEYS.currentProjectId, saved.id);
    setStoredValue(STORAGE_KEYS.activeSessionId, null);
    setStore({
      projects: sortProjects([...store.projects, saved]),
      currentProjectId: saved.id,
      activeSessionId: null,
    });
    return saved;
  },

  deleteProject: async (id: string) => {
    const projectToDelete = store.projects.find((project) => project.id === id);
    await Promise.all(
      (projectToDelete?.sessions ?? []).map((session) =>
        nativeApi.terminal().kill(session.id).catch(() => undefined),
      ),
    );
    await api.deleteProject(id);
    const projects = sortProjects(store.projects.filter((p) => p.id !== id));
    const currentProjectId = store.currentProjectId === id ? projects[0]?.id ?? null : store.currentProjectId;
    const currentProject = projects.find((project) => project.id === currentProjectId);
    const activeSessionId =
      store.currentProjectId === id
        ? currentProject?.sessions[0]?.id ?? null
        : store.activeSessionId;

    setStoredValue(STORAGE_KEYS.currentProjectId, currentProjectId);
    setStoredValue(STORAGE_KEYS.activeSessionId, activeSessionId);

    setStore({
      projects,
      currentProjectId,
      activeSessionId,
    });
  },

  updateProject: async (projectId: string, updates: Partial<Project>) => {
    const project = store.projects.find((item) => item.id === projectId);
    if (!project) return;

    const updatedProject = {
      ...project,
      ...updates,
      id: project.id,
      sessions: project.sessions,
    };

    await api.saveProject(updatedProject);

    setStore('projects', (prev) =>
      sortProjects(prev.map((item) =>
        item.id === projectId ? updatedProject : item
      )),
    );
  },

  reorderProjects: async (projectIds: string[]) => {
    const previousProjects = [...store.projects];
    const projectById = new Map(previousProjects.map((project) => [project.id, project]));
    const seenIds = new Set<string>();
    const orderedProjects: Project[] = [];

    for (const projectId of projectIds) {
      const project = projectById.get(projectId);
      if (!project || seenIds.has(projectId)) continue;
      seenIds.add(projectId);
      orderedProjects.push(project);
    }

    for (const project of previousProjects) {
      if (seenIds.has(project.id)) continue;
      orderedProjects.push(project);
    }

    if (orderedProjects.length === 0) return;

    const nextProjects = sortProjects(orderedProjects);
    setStore({ projects: nextProjects });

    try {
      const savedProjects = sortProjects(normalizeProjects(await api.reorderProjects(nextProjects.map((project) => project.id))));
      setStore({ projects: savedProjects });
    } catch (error) {
      setStore({ projects: previousProjects });
      throw error;
    }
  },

  setCurrentProject: (id: string | null) => {
    if (store.currentProjectId === id) return;
    const project = store.projects.find((item) => item.id === id);
    const currentSessionInProject =
      project?.sessions.some((session) => session.id === store.activeSessionId) ?? false;
    const nextSessionId = currentSessionInProject ? store.activeSessionId : project?.sessions[0]?.id ?? null;
    setStoredValue(STORAGE_KEYS.currentProjectId, id);
    setStoredValue(STORAGE_KEYS.activeSessionId, nextSessionId);
    batch(() => {
      setStore({ currentProjectId: id, activeSessionId: nextSessionId });
    });
  },

  setCurrentProjectId: (id: string | null) => {
    if (store.currentProjectId === id) return;
    setStoredValue(STORAGE_KEYS.currentProjectId, id);
    setStore({ currentProjectId: id });
  },

  addSession: async (projectId: string, shell: string) => {
    const createdAt = Date.now();
    const project = store.projects.find((p) => p.id === projectId);
    if (!project) throw new Error('Project not found');

    const session: Session = {
      id: crypto.randomUUID(),
      name: 'Terminal',
      shell,
      cliTool: null,
      pendingLaunchCommand: null,
      createdAt,
      lastActiveAt: createdAt,
      commandCount: 0,
      startupDurationMs: null,
    };

    const updatedProject = {
      ...project,
      sessions: [...project.sessions, session],
    };

    setStoredValue(STORAGE_KEYS.currentProjectId, projectId);
    setStoredValue(STORAGE_KEYS.activeSessionId, session.id);

    setStore({
      projects: store.projects.map((p) =>
        p.id === projectId ? updatedProject : p
      ),
      currentProjectId: projectId,
      activeSessionId: session.id,
    });

    api.getGitBranch(project.path).then((branchInfo) => {
      const finalSessionName = branchInfo?.head || 'Terminal';
      const currentProject = store.projects.find(p => p.id === projectId);
      if (currentProject) {
        const finalProject = {
          ...currentProject,
          sessions: currentProject.sessions.map(s => 
            s.id === session.id ? { ...s, name: finalSessionName } : s
          ),
        };
        api.saveProject(finalProject).catch(() => {});
        setStore('projects', prev => prev.map(p => p.id === projectId ? finalProject : p));
      }
    }).catch(() => {
      const currentProject = store.projects.find(p => p.id === projectId);
      if (currentProject) api.saveProject(currentProject).catch(() => {});
    });

    return session;
  },

  addIsolatedSession: async (projectId: string, shell: string) => {
    const createdAt = Date.now();
    const project = store.projects.find((p) => p.id === projectId);
    if (!project) throw new Error('Project not found');

    const session: Session = {
      id: crypto.randomUUID(),
      name: 'Terminal',
      shell,
      cliTool: null,
      pendingLaunchCommand: null,
      createdAt,
      lastActiveAt: createdAt,
      commandCount: 0,
      startupDurationMs: null,
    };

    const updatedProject = {
      ...project,
      sessions: [...project.sessions, session],
    };

    setStore({
      projects: store.projects.map((p) =>
        p.id === projectId ? updatedProject : p
      ),
    });

    api.getGitBranch(project.path).then((branchInfo) => {
      const finalSessionName = branchInfo?.head || 'Terminal';
      const currentProject = store.projects.find(p => p.id === projectId);
      if (currentProject) {
        const finalProject = {
          ...currentProject,
          sessions: currentProject.sessions.map(s =>
            s.id === session.id ? { ...s, name: finalSessionName } : s
          ),
        };
        api.saveProject(finalProject).catch(() => {});
        setStore('projects', prev => prev.map(p => p.id === projectId ? finalProject : p));
      }
    }).catch(() => {
      const currentProject = store.projects.find(p => p.id === projectId);
      if (currentProject) api.saveProject(currentProject).catch(() => {});
    });

    return session;
  },

  launchCliSession: async (projectId: string, cliId?: string | null) => {
    const run = async () => {
      const createdAt = Date.now();
      const shell =
        store.availableShells.find((item) => item === store.preferredShell) ??
        store.availableShells[0] ??
        store.preferredShell ??
        nativeApi.defaultShell();
      const installedCliTools = store.cliTools.filter((tool) => tool.installed);
      const selectedCli =
        installedCliTools.find((tool) => tool.id === cliId) ??
        installedCliTools.find((tool) => tool.id === store.preferredCliId) ??
        installedCliTools.find((tool) => tool.id === DEFAULT_CLI_ID) ??
        installedCliTools[0] ??
        null;

      const project = store.projects.find((p) => p.id === projectId);
      if (!project) throw new Error('Project not found');

      const session: Session = {
        id: crypto.randomUUID(),
        name: 'Terminal',
        shell,
        cliTool: selectedCli?.id ?? null,
        pendingLaunchCommand: selectedCli?.matchedCommand ?? null,
        createdAt,
        lastActiveAt: createdAt,
        commandCount: 0,
        startupDurationMs: null,
      };

      const updatedProject = {
        ...project,
        sessions: [...project.sessions, session],
      };

      setStoredValue(STORAGE_KEYS.currentProjectId, projectId);
      setStoredValue(STORAGE_KEYS.activeSessionId, session.id);
      setStoredValue(STORAGE_KEYS.preferredCliId, selectedCli?.id ?? null);

      setStore({
        projects: store.projects.map((p) => p.id === projectId ? updatedProject : p),
        currentProjectId: projectId,
        activeSessionId: session.id,
        preferredCliId: selectedCli?.id ?? store.preferredCliId,
      });

      api.getGitBranch(project.path).then((branchInfo) => {
        const finalSessionName = branchInfo?.head || 'Terminal';
        const currentProject = store.projects.find(p => p.id === projectId);
        if (currentProject) {
          const finalProject = {
            ...currentProject,
            sessions: currentProject.sessions.map(s => 
              s.id === session.id ? { ...s, name: finalSessionName } : s
            ),
          };
          api.saveProject(finalProject).catch(() => {});
          setStore('projects', prev => prev.map(p => p.id === projectId ? finalProject : p));
        }
      }).catch(() => {
        const currentProject = store.projects.find(p => p.id === projectId);
        if (currentProject) api.saveProject(currentProject).catch(() => {});
      });

      return session;
    };

    const next = launchSessionQueue.then(run, run);
    launchSessionQueue = next.catch(() => undefined);
    return next;
  },

  renameSession: async (projectId: string, sessionId: string, name: string) => {
    const trimmedName = sanitizeSessionName(name);
    if (!trimmedName) return;

    const project = store.projects.find((p) => p.id === projectId);
    if (!project) return;
    const currentSession = project.sessions.find((session) => session.id === sessionId);
    if (!currentSession || currentSession.name === trimmedName) return;

    const updatedProject = {
      ...project,
      sessions: sortSessions(project.sessions.map((session) =>
        session.id === sessionId
          ? { ...session, name: trimmedName }
          : session
      )),
    };

    setStore('projects', (prev) =>
      prev.map((project) =>
        project.id === projectId ? updatedProject : project
      ),
    );

    api.saveProject(updatedProject).catch(() => undefined);
  },

  updateSession: async (projectId: string, sessionId: string, updates: Partial<Session>) => {
    const project = store.projects.find((p) => p.id === projectId);
    if (!project) return;
    const currentSession = project.sessions.find((session) => session.id === sessionId);
    if (!currentSession) return;

    const sanitizedUpdates =
      typeof updates.name === 'string'
        ? { ...updates, name: sanitizeSessionName(updates.name) || updates.name }
        : updates;
    const updateKeys = Object.keys(sanitizedUpdates) as (keyof Session)[];
    const hasChanges = updateKeys.some((key) => currentSession[key] !== sanitizedUpdates[key]);
    if (!hasChanges) return;

    const updatedProject = {
      ...project,
      sessions: sortSessions(project.sessions.map((session) =>
        session.id === sessionId
          ? { ...session, ...sanitizedUpdates }
          : session
      )),
    };

    setStore('projects', (prev) =>
      prev.map((project) =>
        project.id === projectId ? updatedProject : project
      ),
    );

    api.saveProject(updatedProject).catch(() => undefined);
  },

  removeSession: async (projectId: string, sessionId: string) => {
    const project = store.projects.find((p) => p.id === projectId);
    if (!project) return;
    if (!project.sessions.some((session) => session.id === sessionId)) return;

    const updatedProject = {
      ...project,
      sessions: sortSessions(project.sessions.filter((s) => s.id !== sessionId)),
    };

    const activeSessionId =
      store.activeSessionId === sessionId
        ? updatedProject.sessions[0]?.id ?? null
        : store.activeSessionId;

    setStoredValue(STORAGE_KEYS.activeSessionId, activeSessionId);

    setStore({
      projects: store.projects.map((p) =>
        p.id === projectId ? updatedProject : p
      ),
      activeSessionId,
    });

    nativeApi.terminal().kill(sessionId).catch(() => undefined);
    api.saveProject(updatedProject).catch(() => undefined);
  },

  syncShobSessions: async (projectId: string, sessions: ShobSession[]) => {
    const project = store.projects.find((p) => p.id === projectId);
    if (!project) return;

    const existingPinned = new Map(project.sessions.map((session) => [session.id, Boolean(session.pinned)]));
    const normalized = sessions
      .filter((session) => session.id?.startsWith('ses'))
      .filter((session) => !session.time?.archived)
        .map((session): Session => {
          return toLocalShobSession(session, {
            shell: store.preferredShell ?? nativeApi.defaultShell(),
            pinned: existingPinned.get(session.id) ?? false,
          });
      })
      .sort((left, right) => {
        if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
        return (right.lastActiveAt ?? 0) - (left.lastActiveAt ?? 0);
      });

    const same =
      project.sessions.length === normalized.length &&
      project.sessions.every((session, index) => {
        const next = normalized[index];
        return (
            session.id === next.id &&
            session.name === next.name &&
            Boolean(session.pinned) === Boolean(next.pinned) &&
            (session.parentSessionId ?? null) === (next.parentSessionId ?? null) &&
            session.createdAt === next.createdAt &&
            session.lastActiveAt === next.lastActiveAt
          );
      });
    if (same) return;

    const updatedProject = {
      ...project,
      sessions: normalized,
    };

    setStore(
      "projects",
      store.projects.map((item) => (item.id === projectId ? updatedProject : item)),
    );

    api.saveProject(updatedProject).catch(() => undefined);
  },

  setActiveSession: (sessionId: string | null) => {
    const { session: activeSession } = findProjectBySessionId(store.projects, sessionId);
    const resolvedSessionId = activeSession?.id ?? null;

    setStoredValue(STORAGE_KEYS.activeSessionId, resolvedSessionId);
    if (activeSession?.cliTool) {
      setStoredValue(STORAGE_KEYS.preferredCliId, activeSession.cliTool);
    }

    batch(() => {
      setStore({
        activeSessionId: resolvedSessionId,
        preferredCliId: activeSession?.cliTool ?? store.preferredCliId,
      });
    });
  },

  recordSessionActivity: async (projectId: string, sessionId: string, at?: number) => {
    const project = store.projects.find((item) => item.id === projectId);
    if (!project) return;
    const session = project.sessions.find((item) => item.id === sessionId);
    if (!session) return;

    const timestamp = typeof at === 'number' && Number.isFinite(at) ? Math.floor(at) : Date.now();
    const lastActiveAt = session.lastActiveAt ?? 0;
    if (lastActiveAt > 0 && timestamp - lastActiveAt < SESSION_ACTIVITY_PERSIST_THROTTLE_MS) {
      return;
    }

    const updatedProject: Project = {
      ...project,
      sessions: project.sessions.map((item) =>
        item.id === sessionId
          ? { ...item, lastActiveAt: timestamp }
          : item,
      ),
    };

    await api.saveProject(updatedProject);
    setStore('projects', (prev) =>
      prev.map((item) => (item.id === projectId ? updatedProject : item)),
    );
  },

  recordSessionCommand: async (projectId: string, sessionId: string, at?: number) => {
    const project = store.projects.find((item) => item.id === projectId);
    if (!project) return;
    const session = project.sessions.find((item) => item.id === sessionId);
    if (!session) return;

    const timestamp = typeof at === 'number' && Number.isFinite(at) ? Math.floor(at) : Date.now();
    const nextCount = normalizeSessionCounter(session.commandCount) + 1;

    const updatedProject: Project = {
      ...project,
      sessions: project.sessions.map((item) =>
        item.id === sessionId
          ? { ...item, commandCount: nextCount, lastActiveAt: timestamp }
          : item,
      ),
    };

    debouncedSaveProject(updatedProject);
    setStore('projects', (prev) =>
      prev.map((item) => (item.id === projectId ? updatedProject : item)),
    );
  },

  recordSessionStartup: async (projectId: string, sessionId: string, startupDurationMs: number, at?: number) => {
    const project = store.projects.find((item) => item.id === projectId);
    if (!project) return;
    const session = project.sessions.find((item) => item.id === sessionId);
    if (!session) return;
    const normalizedStartup = normalizeOptionalDuration(startupDurationMs);
    if (normalizedStartup === null) return;
    if (typeof session.startupDurationMs === 'number' && session.startupDurationMs >= 0) return;

    const timestamp = typeof at === 'number' && Number.isFinite(at) ? Math.floor(at) : Date.now();
    const updatedProject: Project = {
      ...project,
      sessions: project.sessions.map((item) =>
        item.id === sessionId
          ? { ...item, startupDurationMs: normalizedStartup, lastActiveAt: timestamp }
          : item,
      ),
    };

    await api.saveProject(updatedProject);
    setStore('projects', (prev) =>
      prev.map((item) => (item.id === projectId ? updatedProject : item)),
    );
  },

  loadCliTools: async () => {
    try {
      const probeResults = await api.probeCliTools(
        CLI_CATALOG.map((item) => ({
          id: item.id,
          commands: item.commands,
        })),
      );

      setStore({ cliTools: buildCatalogCliTools(probeResults) });
    } catch (error) {
      console.error('Failed to probe CLI tools:', error);
      setStore({ cliTools: buildCatalogCliTools() });
    }
  },

  loadAvailableShells: async () => {
    try {
      const availableShells = await api.getAvailableShells();
      const preferredShell = availableShells[0] ?? null;

      setStoredValue(STORAGE_KEYS.preferredShell, preferredShell);
      setStore({ availableShells, preferredShell });
    } catch (error) {
      console.error('Failed to load available shells:', error);
      setStore({ availableShells: [] });
    }
  },

  getDefaultCliTool: () => {
    const installedCliTools = store.cliTools.filter((tool) => tool.installed);
    return (
      installedCliTools.find((tool) => tool.id === DEFAULT_CLI_ID) ??
      store.cliTools.find((tool) => tool.id === DEFAULT_CLI_ID) ??
      installedCliTools[0] ??
      store.cliTools[0] ??
      null
    );
  },

  getCurrentCliTool: () => {
    const installedCliTools = store.cliTools.filter((tool) => tool.installed);
    return (
      installedCliTools.find((tool) => tool.id === store.preferredCliId) ??
      store.cliTools.find((tool) => tool.id === store.preferredCliId) ??
      installedCliTools.find((tool) => tool.id === DEFAULT_CLI_ID) ??
      store.cliTools.find((tool) => tool.id === DEFAULT_CLI_ID) ??
      installedCliTools[0] ??
      store.cliTools[0] ??
      null
    );
  },

  setPreferredCliTool: (cliId: string | null) => {
    setStoredValue(STORAGE_KEYS.preferredCliId, cliId);
    setStore({ preferredCliId: cliId });
  },

  setPreferredShell: (shell: string | null) => {
    setStoredValue(STORAGE_KEYS.preferredShell, shell);
    setStore({ preferredShell: shell });
  },

  setCliLaunchMode: (mode: CliLaunchMode) => {
    setStoredValue(STORAGE_KEYS.cliLaunchMode, mode);
    setStore({ cliLaunchMode: mode });
  },
  setThemeId: (themeId: string) => {
    setStoredValue(STORAGE_KEYS.themeId, themeId);
    setStore({ themeId });
  },
  setColorScheme: (scheme: ThemeScheme) => {
    setStoredValue(STORAGE_KEYS.colorScheme, scheme);
    setStore({ colorScheme: scheme });
  },

  installCliTool: async (cliId: string, installCommand?: string | null) => {
    const catalogItem = CLI_CATALOG.find((item) => item.id === cliId);
    if (!catalogItem) throw new Error(`CLI tool not found: ${cliId}`);

    let detectedPlatform: string | null = null;
    try {
      detectedPlatform = nativeApi.platform();
    } catch {
      detectedPlatform = null;
    }

    const detectedOs: 'windows' | 'macos' | 'linux' | null =
      detectedPlatform === 'windows' || detectedPlatform === 'macos' || detectedPlatform === 'linux'
        ? detectedPlatform
        : null;

    const installCommandForOs = detectedOs ? catalogItem.installCommandByOs?.[detectedOs] : null;
    const resolvedInstallCommand =
      installCommandForOs?.trim() || installCommand?.trim() || catalogItem.installCommand;

    const preferredInstallShellKeyword = detectedOs === 'windows' ? 'powershell' : 'bash';
    const preferredInstallShell =
      store.availableShells.find((item) => item.toLowerCase().includes(preferredInstallShellKeyword)) ?? null;

    const shell =
      preferredInstallShell ??
      store.availableShells.find((item) => item === store.preferredShell) ??
      store.availableShells[0] ??
      store.preferredShell ??
      (detectedOs === 'windows' ? 'powershell.exe' : 'bash');

    const projectId =
      store.currentProjectId ?? store.projects[0]?.id;

    if (!projectId) {
      throw new Error('No project available. Add a project first.');
    }

    const project = store.projects.find((p) => p.id === projectId);
    if (!project) throw new Error('Project not found');

    const createdAt = Date.now();
    const session: Session = {
      id: crypto.randomUUID(),
      name: `Install ${catalogItem.label}`,
      shell,
      cliTool: null,
      pendingLaunchCommand: resolvedInstallCommand,
      createdAt,
      lastActiveAt: createdAt,
      commandCount: 0,
      startupDurationMs: null,
    };

    const updatedProject = {
      ...project,
      sessions: [...project.sessions, session],
    };

    await api.saveProject(updatedProject);
    setStoredValue(STORAGE_KEYS.currentProjectId, projectId);
    setStoredValue(STORAGE_KEYS.activeSessionId, session.id);

    setStore({
      projects: store.projects.map((p) => (p.id === projectId ? updatedProject : p)),
      currentProjectId: projectId,
      activeSessionId: session.id,
    });

    return session;
  },

  loadWorkTerminals: async (projectId: string) => {
    try {
      const terminals = await api.listWorkTerminals(projectId);
      setStore('workTerminals', projectId, terminals);
    } catch (error) {
      console.error('Failed to load work terminals:', error);
    }
  },

  createWorkTerminal: async (projectId: string, shell: string, title?: string) => {
    const current = store.workTerminals[projectId] || [];
    const sortOrder = current.length;
    const term = await api.createWorkTerminal(projectId, shell, title, sortOrder);
    setStore('workTerminals', projectId, (prev) => [...(prev || []), term]);
    return term;
  },

  updateWorkTerminal: async (id: string, updates: Partial<WorkTerminal>) => {
    let projectId: string | null = null;
    for (const pid of Object.keys(store.workTerminals)) {
      if (store.workTerminals[pid]?.some((t) => t.id === id)) {
        projectId = pid;
        break;
      }
    }
    if (!projectId) return;

    await api.updateWorkTerminal(id, updates);

    setStore('workTerminals', projectId, (prev) =>
      (prev || []).map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
  },

  reorderWorkTerminals: async (projectId: string, terminalIds: string[]) => {
    const previous = store.workTerminals[projectId] || [];
    const terminalById = new Map(previous.map((t) => [t.id, t]));
    const nextTerms = terminalIds.map((id) => terminalById.get(id)).filter(Boolean) as WorkTerminal[];

    setStore('workTerminals', projectId, nextTerms);

    try {
      await api.reorderWorkTerminals(terminalIds);
    } catch (error) {
      setStore('workTerminals', projectId, previous);
      throw error;
    }
  },

  deleteWorkTerminal: async (id: string) => {
    let projectId: string | null = null;
    for (const pid of Object.keys(store.workTerminals)) {
      if (store.workTerminals[pid]?.some((t) => t.id === id)) {
        projectId = pid;
        break;
      }
    }
    if (!projectId) return;

    await api.deleteWorkTerminal(id);

    setStore('workTerminals', projectId, (prev) =>
      (prev || []).filter((t) => t.id !== id)
    );
  },

  loadTerminalLayout: async (projectId: string) => {
    try {
      const layout = await api.getTerminalLayout(projectId);
      setStore('terminalLayouts', projectId, layout);
      return layout;
    } catch (error) {
      console.error('Failed to load terminal layout:', error);
      const defaultLayout = {
        projectId,
        activeTerminalId: null,
        panelHeight: 280,
        panelOpened: false,
      };
      setStore('terminalLayouts', projectId, defaultLayout);
      return defaultLayout;
    }
  },

  saveTerminalLayout: async (projectId: string, updates: Partial<TerminalLayout>) => {
    const current = store.terminalLayouts[projectId] || {
      projectId,
      activeTerminalId: null,
      panelHeight: 280,
      panelOpened: false,
    };
    const nextLayout = { ...current, ...updates };
    setStore('terminalLayouts', projectId, nextLayout);
    await api.saveTerminalLayout(projectId, nextLayout);
  },
};

const combinedTarget = new Proxy({} as AppState & AppActions, {
  get(_, prop: string) {
    if (prop in actions) return (actions as any)[prop];
    return (store as any)[prop];
  },
});

export function useStore(): AppState & AppActions;
export function useStore<T>(
  selector: (state: AppState & AppActions) => T,
): T extends (...args: any[]) => any ? T : () => T;
export function useStore<T>(
  selector?: (state: AppState & AppActions) => T,
): (T extends (...args: any[]) => any ? T : () => T) | (AppState & AppActions) {
  if (!selector) {
    return combinedTarget;
  }

  return ((...args: unknown[]) => {
    const selected = selector(combinedTarget);
    if (typeof selected === 'function') {
      return (selected as (...fnArgs: unknown[]) => unknown)(...args);
    }
    return selected;
  }) as T extends (...args: any[]) => any ? T : () => T;
}

export { store, setStore };
