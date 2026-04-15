import { createLogger } from "../../../../shared/logging/logger";
import { getTizen, isTizenRuntime } from "../../../../platform/runtime";
import type { PlayerCallbacks, PlayerState } from "../playerState";

const logger = createLogger("AVPlay");

type AVPlayStateValue = "NONE" | "IDLE" | "READY" | "PLAYING" | "PAUSED" | string;

interface AVPlayListener {
  onbufferingstart?(): void;
  onbufferingprogress?(percent: number): void;
  onbufferingcomplete?(): void;
  oncurrentplaytime?(currentTime: number): void;
  onstreamcompleted?(): void;
  onevent?(eventType: string, eventData: string): void;
  onerror?(eventType: string): void;
}

interface AVPlayHandle {
  close(): void;
  open(url: string): void;
  setDisplayMethod(method: string): void;
  setDisplayRect(x: number, y: number, width: number, height: number): void;
  setListener(listener: AVPlayListener): void;
  setStreamingProperty(name: string, value: string): void;
  prepareAsync(onSuccess: () => void, onError: (error: unknown) => void): void;
  getDuration(): number;
  getCurrentTime(): number;
  getState(): AVPlayStateValue;
  play(): void;
  pause(): void;
  seekTo(positionMs: number): void;
  stop(): void;
}

interface AVPlayBackendDeps {
  callbacks: PlayerCallbacks;
  updateState: (updates: Partial<PlayerState>) => void;
}

interface WebApisRuntime {
  webapis?: {
    avplay?: AVPlayHandle;
  };
}

let timeUpdateInterval: number | null = null;

function getAVPlay(): AVPlayHandle | null {
  return (globalThis as WebApisRuntime).webapis?.avplay ?? null;
}

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function createListener(deps: AVPlayBackendDeps): AVPlayListener {
  return {
    onbufferingstart: () => deps.updateState({ buffering: true }),
    onbufferingprogress: percent => logger.debug("Buffering progress", `${percent}%`),
    onbufferingcomplete: () => deps.updateState({ buffering: false }),
    oncurrentplaytime: currentTime => deps.updateState({ currentTime: currentTime / 1000 }),
    onstreamcompleted: () => deps.callbacks.onComplete?.(),
    onevent: (eventType, eventData) => logger.debug("AVPlay event", eventType, eventData),
    onerror: eventType => {
      const message = `Playback error: ${eventType}`;
      deps.updateState({ error: message, buffering: false });
      deps.callbacks.onError?.(message);
    },
  };
}

export function hasAVPlaySupport() {
  return isTizenRuntime() && !!getAVPlay();
}

export function initAVPlayBackend(deps: AVPlayBackendDeps) {
  if (timeUpdateInterval || typeof window === "undefined") {
    return;
  }

  timeUpdateInterval = window.setInterval(() => {
    try {
      const avplay = getAVPlay();
      if (!avplay) {
        return;
      }

      const currentState = avplay.getState();
      if (currentState === "PLAYING" || currentState === "PAUSED") {
        deps.updateState({ currentTime: avplay.getCurrentTime() / 1000 });
      }
    } catch {
      // AVPlay occasionally throws during teardown; polling should stay quiet.
    }
  }, 1000);
}

export async function loadAVPlay(url: string, deps: AVPlayBackendDeps) {
  const avplay = getAVPlay();
  if (!avplay) {
    throw new Error("AVPlay is not available");
  }

  try {
    try {
      avplay.close();
    } catch {
      // Closing an idle player is safe to ignore.
    }

    avplay.open(url);

    try {
      avplay.setDisplayMethod("PLAYER_DISPLAY_MODE_FULL_SCREEN");
    } catch (error) {
      logger.warn("Failed to set display method", error);
    }

    avplay.setDisplayRect(0, 0, 1920, 1080);
    avplay.setListener(createListener(deps));

    if (url.includes(".m3u8")) {
      try {
        avplay.setStreamingProperty("ADAPTIVE_INFO", "BITRATES=adaptive");
      } catch (error) {
        logger.warn("Failed to set adaptive streaming info", error);
      }
    }

    avplay.prepareAsync(
      () => {
        deps.updateState({
          duration: avplay.getDuration() / 1000,
          buffering: false,
          ready: true,
          playing: true,
        });
        avplay.play();
        try {
          getTizen()?.power?.request("SCREEN", "SCREEN_NORMAL");
        } catch (error) {
          logger.warn("Failed to acquire wake lock", error);
        }
      },
      error => {
        const message = `Prepare error: ${toErrorMessage(error, "unknown")}`;
        logger.error("Failed to prepare AVPlay source", error);
        deps.updateState({ error: message, buffering: false });
        deps.callbacks.onError?.(message);
      },
    );
  } catch (error) {
    const message = toErrorMessage(error, "AVPlay load error");
    logger.error("Failed to load AVPlay source", error);
    deps.updateState({ error: message, buffering: false });
    deps.callbacks.onError?.(message);
  }
}

export function playAVPlay(updateState: (updates: Partial<PlayerState>) => void) {
  try {
    const avplay = getAVPlay();
    if (!avplay) {
      return;
    }

    const currentState = avplay.getState();
    if (currentState === "PAUSED" || currentState === "READY") {
      avplay.play();
      updateState({ playing: true });
    }
  } catch (error) {
    logger.error("Failed to resume playback", error);
  }
}

export function pauseAVPlay(updateState: (updates: Partial<PlayerState>) => void) {
  try {
    const avplay = getAVPlay();
    if (!avplay) {
      return;
    }

    if (avplay.getState() === "PLAYING") {
      avplay.pause();
      updateState({ playing: false });
    }
  } catch (error) {
    logger.error("Failed to pause playback", error);
  }
}

export function seekAVPlay(deltaSeconds: number) {
  try {
    const avplay = getAVPlay();
    if (!avplay) {
      return;
    }

    const currentTime = avplay.getCurrentTime();
    const duration = avplay.getDuration();
    const nextTime = Math.max(0, Math.min(duration, currentTime + deltaSeconds * 1000));
    avplay.seekTo(nextTime);
  } catch (error) {
    logger.error("Failed to seek playback", error);
  }
}

export function seekToAVPlay(positionSeconds: number) {
  try {
    getAVPlay()?.seekTo(positionSeconds * 1000);
  } catch (error) {
    logger.error("Failed to seek to position", error);
  }
}

export function destroyAVPlayBackend() {
  if (timeUpdateInterval) {
    clearInterval(timeUpdateInterval);
    timeUpdateInterval = null;
  }

  try {
    const avplay = getAVPlay();
    if (!avplay) {
      return;
    }

    const currentState = avplay.getState();
    if (currentState !== "NONE" && currentState !== "IDLE") {
      avplay.stop();
    }
    avplay.close();
  } catch {
    // Best-effort cleanup.
  }

  try {
    getTizen()?.power?.release("SCREEN");
  } catch {
    // Wake lock release can fail after teardown.
  }
}
