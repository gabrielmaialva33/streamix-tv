#!/usr/bin/env node
// WS server que escuta logs do app Tizen. Roda com: pnpm logs
// Cada mensagem eh uma linha JSON { t, level, msg, ua } enviada pelo DebugOverlay.

import { WebSocketServer } from "ws";
import { networkInterfaces } from "os";
import fs from "fs";
import path from "path";

const PORT = Number(process.env.STREAMIX_LOG_PORT) || 9999;
const LOG_FILE = path.resolve(process.cwd(), "streamix.log");

const colors = {
  reset: "\x1b[0m",
  gray: "\x1b[90m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

const levelColor = l =>
  l === "error" ? colors.red : l === "warn" ? colors.yellow : l === "info" ? colors.cyan : colors.gray;

const ips = () => {
  const list = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === "IPv4" && !a.internal) list.push(`${a.address} (${name})`);
    }
  }
  return list;
};

const wss = new WebSocketServer({ port: PORT, host: "0.0.0.0" });

console.log(`${colors.green}streamix log server listening on :${PORT}${colors.reset}`);
console.log(`LAN IPs: ${ips().join(", ") || "none detected"}`);
console.log(`Logs also persisted to ${LOG_FILE}`);
console.log("waiting for clients...\n");

const stream = fs.createWriteStream(LOG_FILE, { flags: "a" });
stream.write(`\n=== session start ${new Date().toISOString()} ===\n`);

wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress;
  const tag = `${colors.magenta}[+] ${ip}${colors.reset}`;
  console.log(tag);
  stream.write(`[connect] ${ip}\n`);

  ws.on("message", data => {
    let entry;
    try {
      entry = JSON.parse(data.toString());
    } catch {
      entry = { t: Date.now(), level: "log", msg: data.toString() };
    }
    const ts = new Date(entry.t || Date.now()).toISOString().slice(11, 23);
    const lv = (entry.level || "log").toUpperCase().padEnd(5);
    const color = levelColor(entry.level || "log");
    const line = `${colors.gray}${ts}${colors.reset} ${color}${lv}${colors.reset} ${entry.msg ?? ""}`;
    console.log(line);
    stream.write(`${ts} ${lv} ${entry.msg ?? ""}\n`);
  });

  ws.on("close", () => {
    console.log(`${colors.magenta}[-] ${ip}${colors.reset}`);
    stream.write(`[disconnect] ${ip}\n`);
  });
});
