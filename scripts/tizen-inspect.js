#!/usr/bin/env node

import { spawn } from "node:child_process";

import {
  DEFAULT_APP_ID,
  findExecutable,
  parseArgs,
  resolveTarget,
  run,
  sdbTargetArgs,
} from "./tizen-tools.js";

function reportError(error) {
  console.error(error?.message || error);
  process.exit(1);
}

process.on("uncaughtException", reportError);
process.on("unhandledRejection", reportError);

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(`Usage: pnpm tizen:inspect -- [options]

Options:
  --ip <address>        Connect to a physical TV before debugging
  --target <serial>     Use an existing SDB target serial
  --app-id <id>         Override the Tizen app id
  --restart             Kill the app and retry if debug launch fails
  --no-open             Print DevTools URL without opening a browser

Environment:
  TIZEN_DEVICE_IP, TIZEN_TARGET, TIZEN_APP_ID, TIZEN_DEBUG_TIMEOUT_MS, SDB_BIN
`);
  process.exit(0);
}

const sdb = findExecutable("sdb");
const appId = args["app-id"] || process.env.TIZEN_APP_ID || DEFAULT_APP_ID;
const target = resolveTarget(sdb, args);
const targetArgs = sdbTargetArgs(target);

function parseDebugPort(output) {
  const match = output.match(/\bport\s*:\s*(\d+)/i) || output.match(/\bdebug\s+\d+\s+port\s*[:=]?\s*(\d+)/i);
  if (!match) {
    throw new Error(`Could not find debug port in SDB output:\n${output}`);
  }
  return match[1];
}

function buildTimeoutError(output) {
  return new Error(
    [
      "Timed out waiting for Tizen debug port.",
      "Some Samsung TV/emulator images do not allow `sdb shell 0 debug` from CLI.",
      "Try Tizen Studio Debug As > Tizen Web Application if this target keeps returning no output.",
      output,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

function launchDebug() {
  return new Promise((resolve, reject) => {
    const child = spawn(sdb, [...targetArgs, "shell", "0", "debug", appId], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let done = false;
    const timeout = setTimeout(
      () => {
        if (done) return;
        done = true;
        child.kill("SIGTERM");
        reject(buildTimeoutError(output));
      },
      Number(process.env.TIZEN_DEBUG_TIMEOUT_MS) || 30000,
    );

    const onData = chunk => {
      output += chunk.toString();
      try {
        const port = parseDebugPort(output);
        if (done) return;
        done = true;
        clearTimeout(timeout);
        child.kill("SIGTERM");
        resolve({ output, port });
      } catch {
        // Keep reading until the port appears.
      }
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", error => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", code => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      reject(new Error(`Tizen debug command exited with ${code} before printing a port.\n${output}`));
    });
  });
}

async function readDevtoolsUrl(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json`);
  const targets = await response.json();
  const page = targets.find(item => item.type === "page") || targets[0];
  if (!page?.devtoolsFrontendUrl) return null;
  return `http://127.0.0.1:${port}${page.devtoolsFrontendUrl}`;
}

function openBrowser(url) {
  if (args["no-open"] || process.env.CI) return;
  const browser = process.env.CHROME || process.env.CHROMIUM || process.env.GOOGLE_CHROME || "xdg-open";
  const child = spawn(browser, [url], { detached: true, stdio: "ignore" });
  child.unref();
}

console.log(`Launching ${appId} in Tizen debug mode on ${target}`);

let debugSession;
try {
  debugSession = await launchDebug();
} catch (error) {
  if (!args.restart) throw error;
  console.log("Debug launch failed; killing app and retrying because --restart was set.");
  run(sdb, [...targetArgs, "shell", "0", "was_kill", appId]);
  debugSession = await launchDebug();
}

const port = debugSession.port;

try {
  run(sdb, [...targetArgs, "forward", "--remove", `tcp:${port}`]);
} catch {
  // Forward may not exist yet.
}
run(sdb, [...targetArgs, "forward", `tcp:${port}`, `tcp:${port}`]);

console.log(`SDB debug port forwarded: tcp:${port} -> tcp:${port}`);
console.log(`Targets JSON: http://127.0.0.1:${port}/json`);

try {
  const devtoolsUrl = await readDevtoolsUrl(port);
  if (devtoolsUrl) {
    console.log(`DevTools: ${devtoolsUrl}`);
    openBrowser(devtoolsUrl);
  } else {
    console.log("Open chrome://inspect and add localhost target if DevTools does not appear automatically.");
  }
} catch (error) {
  console.log(`Could not read DevTools JSON yet: ${error.message}`);
  console.log(`Open chrome://inspect and configure localhost:${port}`);
}
