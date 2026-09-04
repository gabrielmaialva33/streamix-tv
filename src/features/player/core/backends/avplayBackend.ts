import { createLogger } from "@/shared/logging/logger";
import { getTizen, isTizenRuntime } from "@/platform/runtime";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "@/shared/layout";
import type { PlayerCallbacks, PlayerState } from "../playerState";

const logger = createLogger("AVPlay");
export const AVPLAY_PREPARE_TIMEOUT_MS = 20_000;

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
  /**
   * Older firmware predates these, hence optional. `setSelectTrack` takes
   * Tizen's own type names ("AUDIO" / "TEXT"), not our track kinds.
   */
  setSelectTrack?(type: "AUDIO" | "TEXT", index: number): void;
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
let cancelActivePrepare: (() => void) | null = null;

function getAVPlay(): AVPlayHandle | null {
  return (globalThis as WebApisRuntime).webapis?.avplay ?? null;
}

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function reportLoadFailure(error: unknown, fallback: string, deps: AVPlayBackendDeps, prefix?: string) {
  const detail = toErrorMessage(error, fallback);
  const message = prefix ? `${prefix}: ${detail}` : detail;
  logger.error("Failed to load AVPlay source", error);
  deps.updateState({ error: message, buffering: false, ready: false, playing: false });
  deps.callbacks.onError?.(message);
  return new Error(message);
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
  cancelActivePrepare?.();
  cancelActivePrepare = null;
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
  } catch (error) {
    throw reportLoadFailure(error, "AVPlay load error", deps);
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const clearAttempt = () => {
      clearTimeout(timeout);
      if (cancelActivePrepare === cancel) cancelActivePrepare = null;
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      clearAttempt();
      resolve();
    };
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      clearAttempt();
      reject(
        reportLoadFailure(
          new Error(`AVPlay prepare timed out after ${AVPLAY_PREPARE_TIMEOUT_MS / 1000} seconds`),
          "AVPlay prepare timeout",
          deps,
        ),
      );
    }, AVPLAY_PREPARE_TIMEOUT_MS);

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearAttempt();
      reject(reportLoadFailure(error, "unknown", deps, "Prepare error"));
    };

    cancelActivePrepare = cancel;

    try {
      avplay.prepareAsync(() => {
        if (settled) return;

        try {
          avplay.play();
          deps.updateState({
            duration: avplay.getDuration() / 1000,
            buffering: false,
            error: null,
            ready: true,
            playing: true,
          });
          try {
            getTizen()?.power?.request("SCREEN", "SCREEN_NORMAL");
          } catch (error) {
            logger.warn("Failed to acquire wake lock", error);
          }

          settled = true;
          clearAttempt();
          resolve();
        } catch (error) {
          fail(error);
        }
      }, fail);
    } catch (error) {
      fail(error);
    }
  });
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

/**
 * Switch the audio or subtitle track on the native player.
 *
 * AVPlay is the only backend on which this is possible for progressive files:
 * Chromium never shipped `HTMLMediaElement.audioTracks`, so the HTML5 path can
 * only do this for HLS, where hls.js keeps its own track list.
 */
export function selectAVPlayTrack(kind: "audio" | "subtitle", index: number): boolean {
  const avplay = getAVPlay();
  if (!avplay?.setSelectTrack) {
    logger.debug("AVPlay build has no setSelectTrack; ignoring track change");
    return false;
  }

  try {
    avplay.setSelectTrack(kind === "audio" ? "AUDIO" : "TEXT", index);
    return true;
  } catch (error) {
    logger.warn("AVPlay refused the track change", { kind, index, error });
    return false;
  }
}

export function destroyAVPlayBackend() {
  cancelActivePrepare?.();
  cancelActivePrepare = null;

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
