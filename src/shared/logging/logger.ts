const isDebugEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEBUG_LOGS === "true";

type LogMethod = "debug" | "info" | "warn" | "error";

function formatScope(scope: string) {
  return `[${scope}]`;
}

function write(method: LogMethod, scope: string, args: unknown[]) {
  if ((method === "debug" || method === "info") && !isDebugEnabled) {
    return;
  }

  const consoleMethod =
    method === "debug"
      ? console.log
      : method === "info"
        ? console.info
        : method === "warn"
          ? console.warn
          : console.error;

  consoleMethod(formatScope(scope), ...args);
}

export function createLogger(scope: string) {
  return {
    debug: (...args: unknown[]) => write("debug", scope, args),
    info: (...args: unknown[]) => write("info", scope, args),
    warn: (...args: unknown[]) => write("warn", scope, args),
    error: (...args: unknown[]) => write("error", scope, args),
  };
}
