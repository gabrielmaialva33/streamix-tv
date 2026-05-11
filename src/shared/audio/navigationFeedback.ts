type NavigationFeedbackKind = "move" | "select" | "back";

const MOVE_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);
const MOVE_KEY_CODES = new Set([37, 38, 39, 40]);
const SELECT_KEYS = new Set(["Enter", "OK"]);
const SELECT_KEY_CODES = new Set([13]);
const BACK_KEYS = new Set(["Backspace", "Escape", "BrowserBack"]);
const BACK_KEY_CODES = new Set([8, 27, 461, 10009]);

const MIN_INTERVAL_MS = 42;
const PLAYER_ROUTE_PATTERN = /^#\/player\//;

let audioContext: AudioContext | undefined;
let lastPlayedAt = 0;

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

function resolveAudioContext() {
  const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextCtor) {
    return undefined;
  }

  audioContext ??= new AudioContextCtor();
  return audioContext;
}

function kindFromEvent(event: KeyboardEvent): NavigationFeedbackKind | undefined {
  if (MOVE_KEYS.has(event.key) || MOVE_KEY_CODES.has(event.keyCode)) {
    return "move";
  }

  if (SELECT_KEYS.has(event.key) || SELECT_KEY_CODES.has(event.keyCode)) {
    return "select";
  }

  if (BACK_KEYS.has(event.key) || BACK_KEY_CODES.has(event.keyCode)) {
    return "back";
  }

  return undefined;
}

function shouldPlay(event: KeyboardEvent) {
  return (
    !event.altKey && !event.ctrlKey && !event.metaKey && !PLAYER_ROUTE_PATTERN.test(window.location.hash)
  );
}

function play(kind: NavigationFeedbackKind) {
  const now = performance.now();
  if (now - lastPlayedAt < MIN_INTERVAL_MS) {
    return;
  }
  lastPlayedAt = now;

  const context = resolveAudioContext();
  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    void context.resume();
  }

  const start = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  const frequency = kind === "move" ? 740 : kind === "select" ? 960 : 520;
  const peak = kind === "select" ? 0.028 : 0.018;
  const duration = kind === "select" ? 0.055 : 0.035;

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.82, start + duration);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.01);
}

export function installNavigationFeedback() {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!shouldPlay(event)) {
      return;
    }

    const kind = kindFromEvent(event);
    if (kind) {
      play(kind);
    }
  };

  window.addEventListener("keydown", handleKeyDown, { capture: true });
  return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
}
