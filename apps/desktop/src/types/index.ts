export interface Project {
  id: string;
  name: string;
  path: string;
  color?: string | null;
  logoPath?: string | null;
  pinned?: boolean;
  sessions: Session[];
}

export interface Session {
  id: string;
  name: string;
  parentSessionId?: string | null;
  shell: string;
  cliTool?: string | null;
  pendingLaunchCommand?: string | null;
  pinned?: boolean;
  createdAt?: number | null;
  lastActiveAt?: number | null;
  commandCount?: number | null;
  startupDurationMs?: number | null;
}

export interface CliTool {
  id: string;
  label: string;
  iconKey: string;
  default: boolean;
  priority: number;
  installed: boolean;
  resolvedPath: string | null;
  matchedCommand: string | null;
  installCommand: string;
}
