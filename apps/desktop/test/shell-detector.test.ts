import { describe, expect, test } from "bun:test";
import { detectShellsInternal, type ShellDetectionDeps } from "../electron/shell-detector.ts";

describe("shell detector", () => {
  test("resolves Windows shells in correct priority order", () => {
    const mockExists = new Set<string>([
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      "C:\\Windows\\System32\\cmd.exe",
    ]);

    const deps: ShellDetectionDeps = {
      platform: "win32",
      homedir: "C:\\Users\\test",
      env: {
        SystemRoot: "C:\\Windows",
        ProgramFiles: "C:\\Program Files",
        ComSpec: "C:\\Windows\\System32\\cmd.exe",
      },
      existsSync: (p) => mockExists.has(p),
      resolveCommand: (cmd) => {
        if (cmd === "git.exe") return null;
        if (cmd === "bash.exe") return null;
        if (cmd === "pwsh.exe") return "C:\\Program Files\\PowerShell\\7\\pwsh.exe";
        if (cmd === "powershell.exe") return "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
        if (cmd === "cmd.exe") return "C:\\Windows\\System32\\cmd.exe";
        return null;
      },
    };

    const detected = detectShellsInternal(deps);

    expect(detected).toEqual([
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      "C:\\Windows\\System32\\cmd.exe",
    ]);
  });

  test("resolves Windows shells when Git Bash is missing, fallback to others", () => {
    const mockExists = new Set<string>([
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      "C:\\Windows\\System32\\cmd.exe",
    ]);

    const deps: ShellDetectionDeps = {
      platform: "win32",
      homedir: "C:\\Users\\test",
      env: {
        SystemRoot: "C:\\Windows",
        ComSpec: "C:\\Windows\\System32\\cmd.exe",
      },
      existsSync: (p) => mockExists.has(p),
      resolveCommand: (cmd) => {
        if (cmd === "powershell.exe") return "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
        if (cmd === "cmd.exe") return "C:\\Windows\\System32\\cmd.exe";
        return null;
      },
    };

    const detected = detectShellsInternal(deps);

    expect(detected).toEqual([
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      "C:\\Windows\\System32\\cmd.exe",
    ]);
  });

  test("resolves Linux shells in correct priority order", () => {
    const mockExists = new Set<string>([
      "/bin/bash",
      "/bin/zsh",
      "/bin/sh",
    ]);

    const deps: ShellDetectionDeps = {
      platform: "linux",
      homedir: "/home/test",
      env: {
        SHELL: "/bin/zsh",
      },
      existsSync: (p) => mockExists.has(p),
      resolveCommand: (cmd) => {
        if (cmd === "bash") return "/bin/bash";
        if (cmd === "sh") return "/bin/sh";
        if (cmd === "zsh") return "/bin/zsh";
        return null;
      },
    };

    const detected = detectShellsInternal(deps);

    // Order should be: Bash -> login shell (/bin/zsh) -> sh
    expect(detected).toEqual([
      "/bin/bash",
      "/bin/zsh",
      "/bin/sh",
    ]);
  });

  test("resolves macOS shells correctly", () => {
    const mockExists = new Set<string>([
      "/bin/bash",
      "/bin/sh",
      "/bin/zsh",
      "/usr/local/bin/fish",
    ]);

    const deps: ShellDetectionDeps = {
      platform: "darwin",
      homedir: "/Users/test",
      env: {
        SHELL: "/usr/local/bin/fish",
      },
      existsSync: (p) => mockExists.has(p),
      resolveCommand: (cmd) => {
        if (cmd === "bash") return "/bin/bash";
        if (cmd === "sh") return "/bin/sh";
        if (cmd === "zsh") return "/bin/zsh";
        if (cmd === "fish") return "/usr/local/bin/fish";
        return null;
      },
    };

    const detected = detectShellsInternal(deps);

    expect(detected).toEqual([
      "/bin/bash",
      "/usr/local/bin/fish",
      "/bin/sh",
      "/bin/zsh",
    ]);
  });
});
