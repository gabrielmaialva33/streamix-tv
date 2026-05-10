#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_APP_ID = "EI8qhrd7xh.streamix";
export const DEFAULT_SDB_PORT = "26101";

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const [key, inlineValue] = token.slice(2).split("=", 2);
    const next = argv[i + 1];
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
    } else if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

export function findExecutable(name, extraCandidates = []) {
  const candidates = [
    process.env[`${name.toUpperCase()}_BIN`],
    ...extraCandidates,
    path.join(os.homedir(), "tizen-studio", "tools", name),
    name,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes("/") && !existsSync(candidate)) continue;
    const result = spawnSync(candidate, ["version"], { stdio: "ignore" });
    if (result.status === 0 || result.status === 1) return candidate;
  }

  throw new Error(`Could not find ${name}. Set ${name.toUpperCase()}_BIN or add it to PATH.`);
}

export function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    ...options,
  });
}

export function connectDevice(sdb, ip) {
  if (!ip) return;
  const target = ip.includes(":") ? ip : `${ip}:${DEFAULT_SDB_PORT}`;
  console.log(`Connecting SDB target ${target}`);
  run(sdb, ["connect", target], { stdio: "pipe" });
}

export function listDevices(sdb) {
  const output = run(sdb, ["devices"]);
  return output
    .split("\n")
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("List of devices"))
    .map(line => {
      const [serial, status, ...name] = line.split(/\s+/);
      return { serial, status, name: name.join(" ") };
    })
    .filter(device => device.status === "device");
}

export function resolveTarget(sdb, args) {
  const ip = args.ip || process.env.TIZEN_DEVICE_IP || process.env.SAMSUNG_DEVICE_IP;
  connectDevice(sdb, ip);

  const explicitTarget = args.target || args.serial || process.env.TIZEN_TARGET || process.env.TIZEN_SERIAL;
  if (explicitTarget) return explicitTarget;

  const devices = listDevices(sdb);
  if (devices.length === 0) {
    throw new Error("No SDB devices found. Set TIZEN_DEVICE_IP=<ip> or start the emulator first.");
  }
  if (devices.length > 1) {
    console.log("Multiple SDB targets detected; using the first one. Set TIZEN_TARGET to override:");
    for (const device of devices) console.log(`- ${device.serial} ${device.name}`);
  }
  return devices[0].serial;
}

export function sdbTargetArgs(target) {
  return target ? ["-s", target] : [];
}
