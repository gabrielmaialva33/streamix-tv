#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();

// Auto-load environments/.env so toolchain vars (TIZEN_*, ANDROID_*, JAVA_*)
// work without the caller having to export them. Shell-exported vars win.
const envFile = path.resolve(root, "environments/.env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}
const tizenSerial =
  process.env.TIZEN_TARGET ??
  (process.env.TIZEN_DEVICE_IP
    ? process.env.TIZEN_DEVICE_IP.includes(":")
      ? process.env.TIZEN_DEVICE_IP
      : `${process.env.TIZEN_DEVICE_IP}:26101`
    : "192.168.1.4:26101");
const tizenAppId = process.env.TIZEN_APP_ID ?? "EI8qhrd7xh.streamix";
const tizenEmulator = process.env.TIZEN_EMULATOR ?? "T-samsung-10.0-x86_64";

const targets = {
  browser: {
    buildEnv: {},
    distDir: "dist",
  },
  tizen: {
    buildEnv: { TARGET_DEVICE: "tizen" },
    distDir: "dist/tizen",
    manifestFiles: [{ from: "platforms/tizen/config.xml", to: "config.xml" }],
    preparePackageCommand: ["tizen", ["build-web", "--", "."], "dist/tizen"],
    packageCommand: [
      "tizen",
      ["package", "-t", "wgt", "-s", "StreamixTV", "-o", ".", "--", ".buildResult"],
      "dist/tizen",
    ],
    installCommand: ["tizen", ["install", "-n", "Streamix.wgt", "-s", tizenSerial], "dist/tizen"],
    runCommand: ["tizen", ["run", "-p", tizenAppId, "-s", tizenSerial], root],
    installEmuCommand: ["tizen", ["install", "-n", "Streamix.wgt", "-t", tizenEmulator], "dist/tizen"],
    runEmuCommand: ["tizen", ["run", "-p", tizenAppId, "-t", tizenEmulator], root],
    killCommand: ["tizen", ["kill", "-p", tizenAppId, "-s", tizenSerial], root],
    uninstallCommand: ["tizen", ["uninstall", "-p", tizenAppId, "-s", tizenSerial], root],
  },
  webos: {
    buildEnv: { TARGET_DEVICE: "lg" },
    distDir: "dist/lg",
    manifestFiles: [{ from: "platforms/webos/appinfo.json", to: "appinfo.json" }],
    packageCommand: ["ares-package", [".", "-o", "../packages", "--no-minify"], "dist/lg"],
  },
  lg: {
    alias: "webos",
  },
  firetv: {
    buildEnv: { TARGET_DEVICE: "firetv" },
    distDir: "dist/firetv",
    syncCommand: ["npx", ["cap", "sync", "android"], root],
    apkCommand: ["./gradlew", ["assembleDebug"], "android"],
    installCommand: ["adb", ["install", "-r", "android/app/build/outputs/apk/debug/app-debug.apk"], root],
  },
  androidtv: {
    alias: "firetv",
  },
};

function resolveTarget(name) {
  const target = targets[name];
  if (!target) {
    fail(`Unknown target "${name}". Expected one of: ${Object.keys(targets).join(", ")}`);
  }
  if (target.alias) return resolveTarget(target.alias);
  return target;
}

function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, {
    cwd: path.resolve(root, cwd),
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function copyManifestFiles(target) {
  if (!target.manifestFiles) return;

  const distDir = path.resolve(root, target.distDir);
  mkdirSync(distDir, { recursive: true });

  for (const file of target.manifestFiles) {
    const source = path.resolve(root, file.from);
    const destination = path.join(distDir, file.to);

    if (!existsSync(source)) {
      fail(`Missing platform manifest: ${file.from}`);
    }

    copyFileSync(source, destination);
  }
}

function build(targetName) {
  const target = resolveTarget(targetName);
  run("vite", ["build", "--mode", "production"], root, target.buildEnv);
  copyManifestFiles(target);
}

function packageTarget(targetName) {
  const target = resolveTarget(targetName);
  copyManifestFiles(target);

  if (!target.packageCommand) {
    fail(`Target "${targetName}" does not define a package command.`);
  }

  if (target.preparePackageCommand) {
    run(...target.preparePackageCommand);
  }

  if (targetName === "webos" || targetName === "lg") {
    mkdirSync(path.resolve(root, "dist/packages"), { recursive: true });
  }

  run(...target.packageCommand);
}

function sync(targetName) {
  const target = resolveTarget(targetName);
  if (!target.syncCommand) fail(`Target "${targetName}" does not define a sync command.`);
  build(targetName);
  run(...target.syncCommand);
}

function apk(targetName) {
  const target = resolveTarget(targetName);
  if (!target.apkCommand) fail(`Target "${targetName}" does not define an APK command.`);
  sync(targetName);
  run(target.apkCommand[0], target.apkCommand[1], target.apkCommand[2], {
    // ANDROID_JAVA_HOME wins over the shell's JAVA_HOME on purpose: Gradle 8.14
    // and AGP 8.13 reject Java 25 ("Unsupported class file major version 69"),
    // so a machine whose default toolchain is newer still needs to point the
    // Android build at a supported JDK without changing that default.
    JAVA_HOME: process.env.ANDROID_JAVA_HOME ?? process.env.JAVA_HOME ?? "/usr/lib/jvm/java-21-openjdk",
    ANDROID_HOME: process.env.ANDROID_HOME ?? path.join(process.env.HOME ?? "", "Android/Sdk"),
  });
}

function install(targetName, variant) {
  const target = resolveTarget(targetName);
  const command = variant === "emu" ? target.installEmuCommand : target.installCommand;
  if (!command) fail(`Target "${targetName}" does not define an install command.`);
  run(...command);
}

function runTarget(targetName, variant) {
  const target = resolveTarget(targetName);
  const command = variant === "emu" ? target.runEmuCommand : target.runCommand;
  if (!command) fail(`Target "${targetName}" does not define a run command.`);
  run(...command);
}

function kill(targetName) {
  const target = resolveTarget(targetName);
  if (!target.killCommand) fail(`Target "${targetName}" does not define a kill command.`);
  run(...target.killCommand);
}

function uninstall(targetName) {
  const target = resolveTarget(targetName);
  if (!target.uninstallCommand) fail(`Target "${targetName}" does not define an uninstall command.`);
  run(...target.uninstallCommand);
}

function deploy(targetName, variant) {
  if (targetName === "firetv" || targetName === "androidtv") {
    apk(targetName);
    install(targetName);
    return;
  }

  build(targetName);
  packageTarget(targetName);
  install(targetName, variant);
  runTarget(targetName, variant);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [action, targetName = "browser", variant] = process.argv.slice(2);

switch (action) {
  case "build":
    build(targetName);
    break;
  case "package":
    packageTarget(targetName);
    break;
  case "sync":
    sync(targetName);
    break;
  case "apk":
    apk(targetName);
    break;
  case "install":
    install(targetName, variant);
    break;
  case "run":
    runTarget(targetName, variant);
    break;
  case "kill":
    kill(targetName);
    break;
  case "uninstall":
    uninstall(targetName);
    break;
  case "deploy":
    deploy(targetName, variant);
    break;
  default:
    fail(
      "Usage: node scripts/platform.mjs <build|package|sync|apk|install|run|kill|uninstall|deploy> <target> [emu]",
    );
}
