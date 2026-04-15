import { createLogger } from "../../../../shared/logging/logger";
import { getTizen, isTizenRuntime } from "../../../../platform/runtime";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "../../../../shared/layout";
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
  setTimeoutForBuffering?(seconds: number): void;
  setBufferingParam?(option: string, unit: string, amount: number): void;
  prepareAsync(onSuccess: () => void, onError: (error: unknown) => void): void;
  getDuration(): number;
  getCurrentTime(): number;
  getState(): AVPlayStateValue;
  getSubState?(): AVPlayStateValue;
  play(): void;
  pause(): void;
  seekTo(positionMs: number): void;
  stop(): void;
  suspend?(): void;
  restoreAsync?(
    url?: string,
    resumeTime?: number,
    prepare?: boolean,
    onSuccess?: () => void,
    onError?: (error: unknown) => void,
  ): void;
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
let activeDeps: AVPlayBackendDeps | null = null;
let activeUrl: string | null = null;
let suspendedAtMs = 0;
let shouldResumePlayback = false;
let isSuspended = false;

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

function applyDisplaySettings(avplay: AVPlayHandle) {
  try {
    avplay.setDisplayMethod("PLAYER_DISPLAY_MODE_FULL_SCREEN");
  } catch (error) {
    logger.warn("Failed to set display method", error);
  }

  avplay.setDisplayRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
}

function applyBufferingPolicy(avplay: AVPlayHandle) {
  try {
    avplay.setTimeoutForBuffering?.(12);
  } catch (error) {
    logger.warn("Failed to set buffering timeout", error);
  }

  try {
    avplay.setBufferingParam?.("PLAYER_BUFFER_FOR_PLAY", "PLAYER_BUFFER_SIZE_IN_SECOND", 3);
    avplay.setBufferingParam?.("PLAYER_BUFFER_FOR_RESUME", "PLAYER_BUFFER_SIZE_IN_SECOND", 2);
  } catch (error) {
    logger.warn("Failed to set buffering parameters", error);
  }
}

export function hasAVPlaySupport() {
  return isTizenRuntime() && !!getAVPlay();
}

export function initAVPlayBackend(deps: AVPlayBackendDeps) {
  activeDeps = deps;

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

  activeDeps = deps;
  activeUrl = url;
  suspendedAtMs = 0;
  shouldResumePlayback = false;
  isSuspended = false;

  try {
    try {
      avplay.close();
    } catch {
      // Closing an idle player is safe to ignore.
    }

    avplay.open(url);
    applyDisplaySettings(avplay);
    avplay.setListener(createListener(deps));
    applyBufferingPolicy(avplay);

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
      shouldResumePlayback = true;
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
      shouldResumePlayback = false;
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

export function suspendAVPlay(updateState: (updates: Partial<PlayerState>) => void) {
  try {
    const avplay = getAVPlay();
    if (!avplay?.suspend || !activeUrl) {
      return false;
    }

    const currentState = avplay.getState();
    if (currentState !== "READY" && currentState !== "PLAYING" && currentState !== "PAUSED") {
      return false;
    }

    suspendedAtMs = avplay.getCurrentTime();
    shouldResumePlayback = currentState === "PLAYING";
    avplay.suspend();
    isSuspended = true;
    updateState({ playing: false, buffering: false });

    try {
      getTizen()?.power?.release("SCREEN");
    } catch (error) {
      logger.warn("Failed to release wake lock during suspend", error);
    }

    return true;
  } catch (error) {
    logger.error("Failed to suspend AVPlay", error);
    return false;
  }
}

export async function restoreAVPlay(updateState: (updates: Partial<PlayerState>) => void) {
  const avplay = getAVPlay();
  if (!avplay?.restoreAsync || !activeUrl || !isSuspended) {
    return false;
  }

  const restoreAsync = avplay.restoreAsync;
  const activeSourceUrl = activeUrl;

  return new Promise<boolean>(resolve => {
    try {
      restoreAsync.call(
        avplay,
        activeSourceUrl,
        suspendedAtMs,
        true,
        () => {
          applyDisplaySettings(avplay);
          applyBufferingPolicy(avplay);

          if (activeDeps) {
            avplay.setListener(createListener(activeDeps));
          }

          if (shouldResumePlayback && avplay.getState() !== "PLAYING") {
            avplay.play();
          }

          isSuspended = false;
          updateState({
            duration: avplay.getDuration() / 1000,
            currentTime: suspendedAtMs / 1000,
            ready: true,
            buffering: false,
            error: null,
            playing: shouldResumePlayback,
          });

          try {
            getTizen()?.power?.request("SCREEN", "SCREEN_NORMAL");
          } catch (error) {
            logger.warn("Failed to reacquire wake lock", error);
          }

          resolve(true);
        },
        error => {
          logger.error("Failed to restore AVPlay session", error);
          isSuspended = false;
          resolve(false);
        },
      );
    } catch (error) {
      logger.error("Failed to call AVPlay restoreAsync", error);
      isSuspended = false;
      resolve(false);
    }
  });
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

  activeDeps = null;
  activeUrl = null;
  suspendedAtMs = 0;
  shouldResumePlayback = false;
  isSuspended = false;

  try {
    getTizen()?.power?.release("SCREEN");
  } catch {
    // Wake lock release can fail after teardown.
  }
}
