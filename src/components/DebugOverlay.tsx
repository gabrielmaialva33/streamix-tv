import { Text, View } from "@lightningtv/solid";
import { createSignal, For, onCleanup, onMount } from "solid-js";

// Overlay de logs visivel na TV. Toggle com a tecla "0" do controle remoto
// (ou "0" no teclado no dev). Mostra as ultimas N linhas de console.*
// e fetch() intercepted. Serve pra debugar sem DevTools em file:// Tizen.

export interface LogEntry {
  t: number;
  level: "log" | "info" | "warn" | "error";
  msg: string;
}

const MAX_LINES = 200;
const [entries, setEntries] = createSignal<LogEntry[]>([]);
const [visible, setVisible] = createSignal(false);

function push(level: LogEntry["level"], args: unknown[]) {
  const msg = args
    .map(a => {
      if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack ?? ""}`;
      if (typeof a === "object") {
        try {
          return JSON.stringify(a, null, 0);
        } catch {
          return String(a);
        }
      }
      return String(a);
    })
    .join(" ");
  const entry: LogEntry = { t: Date.now(), level, msg };
  setEntries(prev => {
    const next = [...prev, entry];
    if (next.length > MAX_LINES) next.splice(0, next.length - MAX_LINES);
    return next;
  });
  sendWs(entry);
}

// ---- WS remoto pro log-server ----
// Tenta conectar em varios hosts (o que funcionar primeiro fica).
// Emulador Tizen: 10.0.2.2 eh alias do host. TV real: precisa IP LAN do PC.
const LOG_HOSTS = [
  import.meta.env.VITE_LOG_HOST, // defina em .env se tu souber o IP
  "10.0.2.2", // emulador Tizen/Android -> host
  "192.168.1.100", // ajusta se teu PC tiver outro IP
  "localhost",
].filter(Boolean) as string[];

let ws: WebSocket | null = null;
let wsReady = false;
let wsAttempt = 0;
let wsReconnectTimer: number | null = null;
const wsBuffer: LogEntry[] = [];
const MAX_BUFFER = 500;

// Reconnect exponential backoff: 1s, 2s, 4s, 8s, 16s (cap). Nao fica tentando
// pra sempre quando nao tem log-server — mas reconecta automatico quando volta.
function scheduleReconnect() {
  if (wsReconnectTimer) return;
  const delay = Math.min(16000, 1000 * Math.pow(2, wsAttempt));
  wsReconnectTimer = window.setTimeout(() => {
    wsReconnectTimer = null;
    connectWs();
  }, delay);
  wsAttempt++;
}

function connectWs() {
  // Tenta cada host em paralelo — o primeiro que conectar fica, os outros fecham.
  for (const host of LOG_HOSTS) {
    try {
      const url = `ws://${host}:9999`;
      const sock = new WebSocket(url);
      sock.onopen = () => {
        if (ws && ws !== sock) ws.close();
        ws = sock;
        wsReady = true;
        wsAttempt = 0; // reset backoff em conexao bem sucedida
        while (wsBuffer.length) sock.send(JSON.stringify(wsBuffer.shift()));
      };
      sock.onerror = () => sock.close();
      sock.onclose = () => {
        if (ws === sock) {
          ws = null;
          wsReady = false;
          scheduleReconnect();
        }
      };
    } catch {
      /* tenta proximo */
    }
  }
}

function sendWs(entry: LogEntry) {
  if (wsReady && ws?.readyState === 1) {
    ws.send(JSON.stringify(entry));
  } else {
    wsBuffer.push(entry);
    if (wsBuffer.length > MAX_BUFFER) wsBuffer.shift(); // evita crescimento infinito
  }
}

let patched = false;
export function installDebugCapture() {
  if (patched) return;
  patched = true;
  connectWs();
  const orig = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  console.log = (...args) => {
    push("log", args);
    orig.log.apply(console, args);
  };
  console.info = (...args) => {
    push("info", args);
    orig.info.apply(console, args);
  };
  console.warn = (...args) => {
    push("warn", args);
    orig.warn.apply(console, args);
  };
  console.error = (...args) => {
    push("error", args);
    orig.error.apply(console, args);
  };
  window.addEventListener("error", e => {
    push("error", [`[window.error] ${e.message} @ ${e.filename}:${e.lineno}`]);
  });
  window.addEventListener("unhandledrejection", e => {
    const r = (e as PromiseRejectionEvent).reason;
    push("error", ["[unhandledrejection]", r]);
  });

  // Intercepta fetch pra logar URL + status + tempo
  const origFetch = window.fetch;
  window.fetch = async (...args) => {
    const url = typeof args[0] === "string" ? args[0] : (args[0] as Request).url;
    const start = Date.now();
    try {
      const r = await origFetch.apply(window, args);
      const dur = Date.now() - start;
      if (!r.ok) push("warn", [`fetch ${r.status} ${url} (${dur}ms)`]);
      else push("log", [`fetch ${r.status} ${url} (${dur}ms)`]);
      return r;
    } catch (err) {
      push("error", [`fetch FAIL ${url}`, err]);
      throw err;
    }
  };
}

export function toggleDebug() {
  setVisible(v => !v);
}

export function clearDebug() {
  setEntries([]);
}

const colorFor = (l: LogEntry["level"]) =>
  l === "error" ? 0xff5555ff : l === "warn" ? 0xffbb33ff : l === "info" ? 0x88ccffff : 0xdddddd_ff;

const DebugOverlay = () => {
  // Auto-scroll — mantem as ultimas linhas visiveis
  const visibleEntries = () => entries().slice(-35);

  onMount(() => {
    // Tecla "0" do controle remoto alterna o overlay.
    // Tizen: 48 = "0" no dpad numerico; browser dev: 48 tambem.
    const h = (e: KeyboardEvent) => {
      if (e.key === "0" || e.keyCode === 48 || e.keyCode === 96) {
        toggleDebug();
      }
    };
    document.addEventListener("keydown", h);
    onCleanup(() => document.removeEventListener("keydown", h));
  });

  return (
    <View
      skipFocus
      zIndex={99999}
      x={0}
      y={0}
      width={1920}
      height={800}
      color={0x000000dd}
      alpha={visible() ? 1 : 0}
      transition={{ alpha: { duration: 200, easing: "ease-out" } }}
      display="flex"
      flexDirection="column"
      padding={20}
    >
      <Text x={20} y={12} fontSize={20} color={0xffff00ff}>
        {`[DEBUG]  press 0 to close  —  ${entries().length} lines`}
      </Text>
      <View x={20} y={48} width={1880} height={740} clipping>
        <For each={visibleEntries()}>
          {(e, i) => (
            <Text
              y={i() * 20}
              fontSize={14}
              color={colorFor(e.level)}
              contain="width"
              width={1860}
              maxLines={1}
            >
              {`${new Date(e.t).toISOString().slice(11, 19)} ${e.level.toUpperCase().padEnd(5)} ${e.msg}`}
            </Text>
          )}
        </For>
      </View>
    </View>
  );
};

export default DebugOverlay;
