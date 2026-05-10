#!/usr/bin/env node

import { spawn } from "node:child_process";

import { findExecutable, parseArgs, resolveTarget, sdbTargetArgs } from "./tizen-tools.js";

function reportError(error) {
  console.error(error?.message || error);
  process.exit(1);
}

process.on("uncaughtException", reportError);

const args = parseArgs(process.argv.slice(2));
const sdb = findExecutable("sdb");
const target = resolveTarget(sdb, args);
const filters = (args.filters || process.env.TIZEN_LOG_FILTERS || "WebCore:* ConsoleMessage:* *:E").split(
  /\s+/,
);
const clear = args.clear !== false && args.clear !== "false";

if (clear) {
  spawn(sdb, [...sdbTargetArgs(target), "dlog", "-c"], { stdio: "ignore" });
}

console.log(`Streaming Tizen logs from ${target}`);
console.log(`Filters: ${filters.join(" ")}`);

const child = spawn(sdb, [...sdbTargetArgs(target), "dlog", ...filters], { stdio: "inherit" });
child.on("exit", code => process.exit(code ?? 0));
