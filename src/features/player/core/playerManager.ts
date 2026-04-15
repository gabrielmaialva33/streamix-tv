import { createLogger } from "../../../shared/logging/logger";
import { isTizenRuntime } from "../../../platform/runtime";
import {
  destroyAVPlayBackend,
  hasAVPlaySupport,
  initAVPlayBackend,
  loadAVPlay,
  pauseAVPlay,
  playAVPlay,
  restoreAVPlay,
  seekAVPlay,
  seekToAVPlay,
  suspendAVPlay,
} from "./backends/avplayBackend";
import {
  destroyHTML5Backend,
  initHTML5Backend,
  loadHTML5,
  pauseHTML5,
  playHTML5,
  seekHTML5,
  seekToHTML5,
} from "./backends/html5Backend";
import { prepareDomForAvplayPlayback, prepareDomForHtml5Playback, restorePlaybackDom } from "./playbackDom";
import {
  createInitialPlayerState,
  type PlayerBackend,
  type PlayerCallbacks,
  type PlayerState,
} from "./playerState";

const logger = createLogger("PlayerManager");

let callbacks: PlayerCallbacks = {};
let currentBackend: PlayerBackend | null = null;
let isInitialized = false;
let state = createInitialPlayerState();

const updateState = (updates: Partial<PlayerState>) => {
  state = { ...state, ...updates };
  callbacks.onStateChange?.({ ...state });
};

async function init(nextCallbacks: PlayerCallbacks = {}) {
  callbacks = nextCallbacks;
  currentBackend = hasAVPlaySupport() ? "avplay" : "html5";

  logger.debug("Initializing player manager", { backend: currentBackend, tizen: isTizenRuntime() });

  if (currentBackend === "avplay") {
    prepareDomForAvplayPlayback();
    initAVPlayBackend({ callbacks, updateState });
  } else {
    prepareDomForHtml5Playback();
    initHTML5Backend({ callbacks, updateState });
  }

  isInitialized = true;
}

async function load(url: string) {
  if (!isInitialized || !currentBackend) {
    throw new Error("PlayerManager is not initialized");
  }

  updateState({ buffering: true, error: null, ready: false });

  if (currentBackend === "avplay") {
    await loadAVPlay(url, { callbacks, updateState });
    return;
  }

  await loadHTML5(url, { callbacks, updateState });
}

function play() {
  if (currentBackend === "avplay") {
    playAVPlay(updateState);
    return;
  }

  void playHTML5();
}

function pause() {
  if (currentBackend === "avplay") {
    pauseAVPlay(updateState);
    return;
  }

  pauseHTML5();
}

function togglePlayPause() {
  if (state.playing) {
    pause();
  } else {
    play();
  }
}

function seek(deltaSeconds: number) {
  if (currentBackend === "avplay") {
    seekAVPlay(deltaSeconds);
    return;
  }

  seekHTML5(deltaSeconds, state.duration);
}

function seekTo(positionSeconds: number) {
  if (currentBackend === "avplay") {
    seekToAVPlay(positionSeconds);
    return;
  }

  seekToHTML5(positionSeconds, state.duration);
}

function suspend() {
  if (currentBackend !== "avplay") {
    return false;
  }

  return suspendAVPlay(updateState);
}

async function restore() {
  if (currentBackend !== "avplay") {
    return false;
  }

  return restoreAVPlay(updateState);
}

async function destroy() {
  destroyAVPlayBackend();
  destroyHTML5Backend();
  restorePlaybackDom();

  callbacks = {};
  currentBackend = null;
  isInitialized = false;
  state = createInitialPlayerState();
}

function getCurrentTime() {
  return state.currentTime;
}

function getDuration() {
  return state.duration;
}

function getState() {
  return { ...state };
}

function getBackend() {
  return currentBackend;
}

export const PlayerManager = {
  init,
  load,
  play,
  pause,
  togglePlayPause,
  seek,
  seekTo,
  suspend,
  restore,
  getCurrentTime,
  getDuration,
  getState,
  destroy,
  getBackend,
  isTizen: isTizenRuntime(),
  hasAVPlay: hasAVPlaySupport,
};

export default PlayerManager;
export type { PlayerBackend, PlayerCallbacks, PlayerState } from "./playerState";
