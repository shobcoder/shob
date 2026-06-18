import net from "node:net";
import fs from "node:fs";
import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureElectronInstalled } from "./ensure-electron.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const appDir = path.join(rootDir, "apps", "desktop");

const host = "127.0.0.1";
const startPort = 5173;
const maxPort = 5300;
const electronMain = path.join(appDir, "electron-dist", "main.js");
const tscBin = path.join(rootDir, "node_modules", "typescript", "bin", "tsc");
const viteBin = path.join(rootDir, "node_modules", "vite", "bin", "vite.js");
const electronCli = path.join(rootDir, "node_modules", "electron", "cli.js");

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function findFreePort() {
  for (let port = startPort; port <= maxPort; port += 1) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port found between ${startPort} and ${maxPort}`);
}

function waitForFile(filePath, timeoutMs = 60000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (fs.existsSync(filePath)) return resolve(true);
      if (Date.now() - started > timeoutMs) return reject(new Error(`Timeout waiting for ${filePath}`));
      setTimeout(tick, 200);
    };
    tick();
  });
}

function waitForHttp(url, timeoutMs = 60000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryRequest = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) return resolve(true);
        retry();
      });
      req.on("error", retry);
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) return reject(new Error(`Timeout waiting for ${url}`));
      setTimeout(tryRequest, 300);
    };
    tryRequest();
  });
}

function spawnNodeScript(scriptPath, args, extraEnv = {}) {
  const child = spawn(process.execPath, [scriptPath, ...args], {
    cwd: appDir,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });
  return child;
}

function assertLocalBin(name, binPath) {
  if (!fs.existsSync(binPath)) {
    throw new Error(`Missing ${name}. Run "bun i" before "bun run dev".`);
  }
}

async function main() {
  assertLocalBin("TypeScript", tscBin);
  assertLocalBin("Vite", viteBin);
  assertLocalBin("Electron", electronCli);
  await ensureElectronInstalled();

  const port = await findFreePort();
  const devUrl = `http://${host}:${port}`;
  console.log(`[dev] using port ${port}`);

  const children = [];
  let shuttingDown = false;

  const shutdown = (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) {
      if (!child.killed) child.kill("SIGTERM");
    }
    setTimeout(() => process.exit(code), 200);
  };

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  const tsc = spawnNodeScript(tscBin, ["-p", "tsconfig.electron.json", "--watch", "--preserveWatchOutput"]);
  children.push(tsc);
  tsc.on("exit", (code) => {
    if (!shuttingDown && code !== 0) shutdown(code || 1);
  });

  const vite = spawnNodeScript(viteBin, ["--host", host, "--port", String(port)]);
  children.push(vite);
  vite.on("exit", (code) => {
    if (!shuttingDown && code !== 0) shutdown(code || 1);
  });

  await waitForFile(electronMain);
  await waitForHttp(devUrl);

  const electron = spawnNodeScript(electronCli, ["."], {
    VITE_DEV_SERVER_URL: devUrl,
  });
  children.push(electron);

  electron.on("exit", (code) => {
    if (!shuttingDown) shutdown(code || 0);
  });
}

main().catch((error) => {
  console.error("[dev] failed:", error.message);
  process.exit(1);
});
