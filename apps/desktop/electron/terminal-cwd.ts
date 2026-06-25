import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";

export interface TerminalCwdResolution {
  cwd: string;
  replaced: boolean;
  requested?: string;
}

export interface TerminalCwdDeps {
  homedir: () => string;
  cwd: () => string;
  statSync: (target: string) => { isDirectory: () => boolean; isFile: () => boolean };
}

const defaultDeps: TerminalCwdDeps = {
  homedir: () => os.homedir(),
  cwd: () => process.cwd(),
  statSync: (target) => fsSync.statSync(target),
};

function resolveFallbackCwd(deps: TerminalCwdDeps) {
  const home = deps.homedir();
  try {
    if (home && deps.statSync(home).isDirectory()) return home;
  } catch {
    // Fall through to the current process directory.
  }
  return deps.cwd();
}

export function resolveTerminalCwd(input: unknown, deps: TerminalCwdDeps = defaultDeps): TerminalCwdResolution {
  const requested = typeof input === "string" && input.trim() ? input : undefined;
  const fallback = resolveFallbackCwd(deps);

  if (!requested) {
    return { cwd: fallback, replaced: Boolean(input), requested: typeof input === "string" ? input : undefined };
  }

  try {
    const stat = deps.statSync(requested);
    if (stat.isDirectory()) return { cwd: requested, replaced: false, requested };
    if (stat.isFile()) return { cwd: path.dirname(requested), replaced: true, requested };
  } catch {
    // Missing or invalid paths fall back before they reach node-pty.
  }

  return { cwd: fallback, replaced: true, requested };
}
