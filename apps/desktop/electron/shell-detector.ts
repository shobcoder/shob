import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";

const resolveCommandCache = new Map<string, string | null>();

export function resolveCommand(command: string, envPath = process.env.PATH || "", platform = process.platform) {
  const cacheKey = `${command}:${envPath}:${platform}`;
  if (resolveCommandCache.has(cacheKey)) {
    return resolveCommandCache.get(cacheKey)!;
  }

  if (path.isAbsolute(command)) {
    if (fsSync.existsSync(command)) {
      resolveCommandCache.set(cacheKey, command);
      return command;
    }
  }

  // Probe path entries
  const pathEnv = envPath;
  const pathSeparator = platform === "win32" ? ";" : ":";
  const pathEntries = pathEnv.split(pathSeparator);

  const extensions = platform === "win32" ? [".exe", ".cmd", ".bat"] : [""];

  for (const entry of pathEntries) {
    for (const ext of extensions) {
      const candidate = path.join(entry, `${command}${ext}`);
      try {
        if (fsSync.existsSync(candidate) && fsSync.statSync(candidate).isFile()) {
          resolveCommandCache.set(cacheKey, candidate);
          return candidate;
        }
      } catch {
        // Ignore fs errors
      }
    }
  }

  resolveCommandCache.set(cacheKey, null);
  return null;
}

export interface ShellDetectionDeps {
  platform: string;
  homedir: string;
  env: Record<string, string>;
  existsSync: (p: string) => boolean;
  resolveCommand: (cmd: string) => string | null;
}

export function findGitBash(deps: ShellDetectionDeps): string | null {
  // 1. Try finding via resolveCommand of git.exe
  const gitPath = deps.resolveCommand("git.exe");
  if (gitPath) {
    const gitDir = path.dirname(gitPath); // usually C:\Program Files\Git\cmd
    const possibleBash1 = path.join(gitDir, "..", "bin", "bash.exe");
    const possibleBash2 = path.join(gitDir, "bin", "bash.exe");
    const possibleBash3 = path.join(gitDir, "..", "usr", "bin", "bash.exe");
    if (deps.existsSync(possibleBash1)) return possibleBash1;
    if (deps.existsSync(possibleBash2)) return possibleBash2;
    if (deps.existsSync(possibleBash3)) return possibleBash3;
  }

  // 2. Try finding via resolveCommand of bash.exe (excluding WSL)
  const bashPath = deps.resolveCommand("bash.exe");
  if (bashPath && bashPath.toLowerCase().includes("git") && !bashPath.toLowerCase().includes("system32")) {
    return bashPath;
  }

  // 3. System and per-user paths
  const appDataLocal = deps.env.LOCALAPPDATA || path.join(deps.homedir, "AppData", "Local");
  const programFiles = deps.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = deps.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";

  const candidates = [
    path.join(programFiles, "Git", "bin", "bash.exe"),
    path.join(programFilesX86, "Git", "bin", "bash.exe"),
    path.join(appDataLocal, "Programs", "Git", "bin", "bash.exe"),
    path.join(appDataLocal, "Programs", "Git", "usr", "bin", "bash.exe"),
    "C:\\Git\\bin\\bash.exe",
    // Fallbacks to sh just in case
    path.join(programFiles, "Git", "bin", "sh.exe"),
    path.join(programFilesX86, "Git", "bin", "sh.exe"),
  ];

  for (const c of candidates) {
    if (deps.existsSync(c)) return c;
  }
  return null;
}

export function findPowerShell7(deps: ShellDetectionDeps): string | null {
  const pwshPath = deps.resolveCommand("pwsh.exe");
  if (pwshPath) return pwshPath;

  const programFiles = deps.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = deps.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";

  const candidates = [
    path.join(programFiles, "PowerShell", "7", "pwsh.exe"),
    path.join(programFilesX86, "PowerShell", "7", "pwsh.exe"),
  ];

  for (const c of candidates) {
    if (deps.existsSync(c)) return c;
  }
  return null;
}

export function findWindowsPowerShell(deps: ShellDetectionDeps): string | null {
  const powershellPath = deps.resolveCommand("powershell.exe");
  if (powershellPath) return powershellPath;

  const systemRoot = deps.env.SystemRoot || "C:\\Windows";
  const candidate = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  if (deps.existsSync(candidate)) return candidate;
  return null;
}

export function findCmd(deps: ShellDetectionDeps): string {
  return deps.env.ComSpec || deps.resolveCommand("cmd.exe") || "cmd.exe";
}

export function detectShellsInternal(deps: ShellDetectionDeps): string[] {
  const shells: string[] = [];

  if (deps.platform === "win32") {
    // Windows order: Git Bash -> PowerShell 7 -> Windows PowerShell -> CMD
    const gitBash = findGitBash(deps);
    if (gitBash) shells.push(gitBash);

    const pwsh = findPowerShell7(deps);
    if (pwsh) shells.push(pwsh);

    const powershell = findWindowsPowerShell(deps);
    if (powershell) shells.push(powershell);

    const cmd = findCmd(deps);
    if (cmd) shells.push(cmd);
  } else {
    // Linux/macOS order: Bash -> login shell -> sh
    const bash = deps.resolveCommand("bash");
    if (bash) shells.push(bash);

    const loginShell = deps.env.SHELL;
    if (loginShell && deps.existsSync(loginShell)) {
      shells.push(loginShell);
    }

    const sh = deps.resolveCommand("sh");
    if (sh) shells.push(sh);

    // Common extras
    for (const command of ["zsh", "fish"]) {
      const resolved = deps.resolveCommand(command);
      if (resolved && !shells.includes(resolved)) {
        shells.push(resolved);
      }
    }
  }

  // Deduplicate and return
  return [...new Set(shells)];
}

export function detectShells(): string[] {
  const deps: ShellDetectionDeps = {
    platform: process.platform,
    homedir: os.homedir(),
    env: process.env as Record<string, string>,
    existsSync: (p) => fsSync.existsSync(p),
    resolveCommand: (cmd) => resolveCommand(cmd, process.env.PATH || "", process.platform),
  };
  return detectShellsInternal(deps);
}
