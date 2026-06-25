import { describe, expect, test } from "bun:test";
import { resolveTerminalCwd, type TerminalCwdDeps } from "../electron/terminal-cwd.ts";

function dir() {
  return { isDirectory: () => true, isFile: () => false };
}

function file() {
  return { isDirectory: () => false, isFile: () => true };
}

function missing() {
  return { isDirectory: () => false, isFile: () => false };
}

function deps(entries: Record<string, ReturnType<typeof dir> | ReturnType<typeof file>>, home = "C:\\Users\\test"): TerminalCwdDeps {
  return {
    homedir: () => home,
    cwd: () => "/fallback/cwd",
    statSync: (target) => {
      const entry = entries[target];
      if (!entry) throw new Error(`ENOENT: ${target}`);
      return entry;
    },
  };
}

describe("terminal cwd resolver", () => {
  test("preserves an existing directory", () => {
    const resolved = resolveTerminalCwd("/workspace", deps({
      "C:\\Users\\test": dir(),
      "/workspace": dir(),
    }));

    expect(resolved).toEqual({
      cwd: "/workspace",
      replaced: false,
      requested: "/workspace",
    });
  });

  test("uses a file's parent directory", () => {
    const resolved = resolveTerminalCwd("/workspace/README.md", deps({
      "C:\\Users\\test": dir(),
      "/workspace/README.md": file(),
    }));

    expect(resolved).toEqual({
      cwd: "/workspace",
      replaced: true,
      requested: "/workspace/README.md",
    });
  });

  test("falls back to home when the requested path is missing", () => {
    const resolved = resolveTerminalCwd("/missing", deps({
      "C:\\Users\\test": dir(),
    }));

    expect(resolved).toEqual({
      cwd: "C:\\Users\\test",
      replaced: true,
      requested: "/missing",
    });
  });

  test("falls back to home for empty or undefined paths", () => {
    const mockDeps = deps({
      "C:\\Users\\test": dir(),
    });

    expect(resolveTerminalCwd("", mockDeps)).toEqual({
      cwd: "C:\\Users\\test",
      replaced: false,
      requested: "",
    });
    expect(resolveTerminalCwd(undefined, mockDeps)).toEqual({
      cwd: "C:\\Users\\test",
      replaced: false,
      requested: undefined,
    });
  });

  test("falls back without throwing for invalid path strings", () => {
    const mockDeps: TerminalCwdDeps = {
      homedir: () => "C:\\Users\\test",
      cwd: () => "/fallback/cwd",
      statSync: (target) => {
        if (target === "C:\\Users\\test") return dir();
        throw new TypeError("path contains invalid characters");
      },
    };

    expect(() => resolveTerminalCwd("bad\0path", mockDeps)).not.toThrow();
    expect(resolveTerminalCwd("bad\0path", mockDeps)).toEqual({
      cwd: "C:\\Users\\test",
      replaced: true,
      requested: "bad\0path",
    });
  });

  test("falls back to process cwd when home is not a directory", () => {
    const resolved = resolveTerminalCwd("/missing", deps({
      "C:\\Users\\test": missing(),
    }));

    expect(resolved.cwd).toBe("/fallback/cwd");
  });
});
