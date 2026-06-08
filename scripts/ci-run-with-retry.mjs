import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const separatorIndex = args.indexOf("--");

if (separatorIndex === -1 || separatorIndex === args.length - 1) {
  console.error("Usage: node scripts/ci-run-with-retry.mjs [options] -- <command> [args...]");
  process.exit(1);
}

const options = args.slice(0, separatorIndex);
const command = args[separatorIndex + 1];
const commandArgs = args.slice(separatorIndex + 2);

let attempts = 1;
let timeoutSeconds = 0;
let delayStepSeconds = 0;

for (let index = 0; index < options.length; index += 1) {
  const option = options[index];
  const value = options[index + 1];

  if (option === "--attempts") {
    attempts = parsePositiveInteger(value, option);
    index += 1;
  } else if (option === "--timeout") {
    timeoutSeconds = parsePositiveInteger(value, option);
    index += 1;
  } else if (option === "--delay-step") {
    delayStepSeconds = parsePositiveInteger(value, option);
    index += 1;
  } else {
    console.error(`Unknown option: ${option}`);
    process.exit(1);
  }
}

let lastExitCode = 1;

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  console.log(`Running attempt ${attempt}/${attempts}: ${[command, ...commandArgs].join(" ")}`);
  const result = await runCommand(command, commandArgs, timeoutSeconds);

  if (result.ok) {
    process.exit(0);
  }

  lastExitCode = result.exitCode ?? 1;

  if (attempt === attempts) {
    break;
  }

  const delaySeconds = delayStepSeconds * attempt;
  if (delaySeconds > 0) {
    console.log(`Attempt ${attempt} failed; retrying in ${delaySeconds}s...`);
    await sleep(delaySeconds * 1000);
  } else {
    console.log(`Attempt ${attempt} failed; retrying...`);
  }
}

console.error(`Command failed after ${attempts} attempts.`);
process.exit(lastExitCode);

function parsePositiveInteger(value, option) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error(`${option} expects a positive integer.`);
    process.exit(1);
  }
  return parsed;
}

function runCommand(command, commandArgs, timeoutSeconds) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      detached: process.platform !== "win32",
      stdio: "inherit",
      windowsHide: true,
    });

    let settled = false;
    let timedOut = false;
    let killTimer;
    const timeoutTimer =
      timeoutSeconds > 0
        ? setTimeout(() => {
            timedOut = true;
            console.error(`Command timed out after ${timeoutSeconds}s.`);
            terminateProcessTree(child);
          }, timeoutSeconds * 1000)
        : undefined;

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);
      console.error(error);
      resolve({ ok: false, exitCode: 1 });
    });

    child.on("exit", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);
      if (timedOut) {
        resolve({ ok: false, exitCode: 124 });
      } else if (code === 0) {
        resolve({ ok: true, exitCode: 0 });
      } else {
        console.error(`Command exited with ${code ?? signal}.`);
        resolve({ ok: false, exitCode: code ?? 1 });
      }
    });

    function terminateProcessTree(childProcess) {
      if (!childProcess.pid) {
        return;
      }

      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(childProcess.pid), "/t", "/f"], {
          stdio: "inherit",
          windowsHide: true,
        });
        return;
      }

      try {
        process.kill(-childProcess.pid, "SIGTERM");
      } catch {
        return;
      }

      killTimer = setTimeout(() => {
        try {
          process.kill(-childProcess.pid, "SIGKILL");
        } catch {
          // Process already exited.
        }
      }, 5000);
    }
  });
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
