import { invokeNative } from './native';
import type { Project } from '../types';
import type { CliProbeResult } from '../config/check';
import type { ElectronGitBranchInfo, WorkTerminal, TerminalLayout } from '../electron';

const toSerializableProject = (project: Project): Project =>
  JSON.parse(JSON.stringify(project)) as Project;

export const api = {
  getProjects: () => invokeNative('get_projects'),
  
  saveProject: (project: Project) =>
    invokeNative('save_project', { project: toSerializableProject(project) }),

  reorderProjects: (projectIds: string[]) =>
    invokeNative('reorder_projects', { projectIds }),
  
  deleteProject: (projectId: string) => invokeNative('delete_project', { projectId }),

  saveSessionOutput: (sessionId: string, output: string) => invokeNative('save_session_output', { sessionId, output }),

  loadSessionOutput: (sessionId: string) => invokeNative('load_session_output', { sessionId }),
  
  getAvailableShells: () => invokeNative('get_available_shells'),

  listSkillStore: () => invokeNative('list_skill_store'),

  installSkill: (skillId: string) => invokeNative('install_skill', { skillId }),

  uninstallSkill: (skillId: string) => invokeNative('uninstall_skill', { skillId }),
  
  probeCliTools: (items: { id: string; commands: string[] }[]) =>
    invokeNative('probe_cli_tools', { items }) as Promise<CliProbeResult[]>,

  getGitBranch: (cwd: string) => invokeNative('get_git_branch', { path: cwd }) as Promise<ElectronGitBranchInfo>,

  listWorkTerminals: (projectId: string) => invokeNative('list_work_terminals', { projectId }),

  createWorkTerminal: (projectId: string, shell: string, title?: string, sortOrder?: number) =>
    invokeNative('create_work_terminal', { projectId, shell, title, sortOrder }) as Promise<WorkTerminal>,

  updateWorkTerminal: (id: string, updates: Partial<WorkTerminal>) =>
    invokeNative('update_work_terminal', { id, updates }),

  reorderWorkTerminals: (terminalIds: string[]) =>
    invokeNative('reorder_work_terminals', { terminalIds }),

  deleteWorkTerminal: (id: string) =>
    invokeNative('delete_work_terminal', { id }),

  getTerminalLayout: (projectId: string) =>
    invokeNative('get_terminal_layout', { projectId }) as Promise<TerminalLayout>,

  saveTerminalLayout: (projectId: string, layout: Partial<TerminalLayout>) =>
    invokeNative('save_terminal_layout', { projectId, layout }),
};
