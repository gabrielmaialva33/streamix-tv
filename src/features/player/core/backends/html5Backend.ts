import { createLogger } from "@/shared/logging/logger";
import type { PlayerCallbacks, PlayerState } from "../playerState";

const logger = createLogger("HTML5Player");

interface HTML5BackendDeps {
  callbacks: PlayerCallbacks;
  updateState: (updates: Partial<PlayerState>) => void;
}

let videoElement: HTMLVideoElement | null = null;
let hlsInstance: { destroy(): void } | null = null;
// Self-healing for fatal hls.js errors (IPTV streams hiccup a lot): retry
// with exponential backoff before surfacing the error modal. Counter resets
// once a fragment buffers again (stream is healthy).
const HLS_RECOVERY_LIMIT = 4;
let hlsRecoveryAttempts = 0;
let hlsRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
// Squelch duplicate error events from the same playback session — the
// HTMLMediaElement can fire `error` several times in a row for the same
// MediaError (transient buffer underruns, decoder hiccups), and each one
// was previously rebroadcast to the debug overlay and the React-style state.
let lastErrorAt = 0;

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function playVideo() {
  return videoElement?.play().catch(error => {
    logger.warn("Autoplay was blocked", error);
  });
}

function bindEvents(video: HTMLVideoElement, deps: HTML5BackendDeps) {
  video.addEventListener("play", () => deps.updateState({ playing: true }));
  video.addEventListener("pause", () => deps.updateState({ playing: false }));
  video.addEventListener("waiting", () => deps.updateState({ buffering: true }));
  video.addEventListener("playing", () => deps.updateState({ buffering: false, playing: true }));
  video.addEventListener("canplay", () => deps.updateState({ buffering: false, ready: true }));
  video.addEventListener("loadedmetadata", () => deps.updateState({ duration: video.duration || 0 }));
  video.addEventListener("timeupdate", () => deps.updateState({ currentTime: video.currentTime }));
  video.addEventListener("ended", () => deps.callbacks.onComplete?.());
  video.addEventListener("error", () => {
    const now = Date.now();
    // Drop bursts of error events fired within 2s of each other —
    // HTMLMediaElement can flood errors during transient network or codec
    // hiccups and there's nothing useful to surface beyond the first one.
    if (now - lastErrorAt < 2000) return;
    lastErrorAt = now;

    const mediaError = video.error;
    const codeName = mediaError ? MEDIA_ERROR_NAMES[mediaError.code] : "UNKNOWN";
    const message = mediaError?.message
      ? `Playback error: ${codeName}${mediaError.message ? ` (${mediaError.message})` : ""}`
      : "Playback error";
    logger.error("Video element raised an error", { code: mediaError?.code, codeName, message });
    deps.updateState({ error: message, buffering: false });
    deps.callbacks.onError?.(message);
  });
}

const MEDIA_ERROR_NAMES: Record<number, string> = {
  1: "MEDIA_ERR_ABORTED",
  2: "MEDIA_ERR_NETWORK",
  3: "MEDIA_ERR_DECODE",
  4: "MEDIA_ERR_SRC_NOT_SUPPORTED",
};

export function initHTML5Backend(deps: HTML5BackendDeps) {
  if (videoElement || typeof document === "undefined") {
    return;
  }

  videoElement = document.createElement("video");
  videoElement.id = "player-video";
  // Video sits behind the Lightning canvas so overlay UI (title, scrub bar,
  // hints) can render on top. The canvas is transparent where the app doesn't
  // draw, so the video shows through the empty areas.
  videoElement.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: #000;
    z-index: 0;
  `;
  videoElement.playsInline = true;
  videoElement.autoplay = true;
  bindEvents(videoElement, deps);
  document.body.insertBefore(videoElement, document.body.firstChild);
}

/**
 * The catalog API returns proxied stream URLs without file extensions, so
 * we can't decide between native <video> and HLS.js by looking at the URL
 * alone — we have to ask the server. A small HEAD request is enough:
 *  - "video/mp2t" or "application/vnd.apple.mpegurl" → MPEG-TS / HLS, must
 *    go through hls.js even in browsers that natively play HLS, since the
 *    proxy never serves a manifest extension.
 *  - "video/mp4" with x-streamix-fallback: <category> → backend returned a
 *    pre-rendered placeholder MP4 because the upstream is unreachable.
 *    Surface a category-specific message instead of a generic playback error.
 *  - anything else → progressive playback via <video src=…>.
 */
type SourceProbe = {
  contentType: string;
  fallback: string | null;
};

async function probeSource(url: string): Promise<SourceProbe> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return {
      contentType: response.headers.get("content-type") ?? "",
      fallback: response.headers.get("x-streamix-fallback"),
    };
  } catch (error) {
    logger.warn("Stream HEAD probe failed; falling back to URL extension", error);
    return { contentType: "", fallback: null };
  }
}

// Categories defined server-side in
// `streamix/lib/streamix/iptv/streaming/fallback_video.ex`.
// Backend uses "channel" in the category name even for movies/series — it's
// the streaming-pipeline category, not the content type. The message stays
// content-neutral so it makes sense in any of the three players.
const FALLBACK_MESSAGES: Record<string, string> = {
  channel_unavailable: "Conteúdo indisponível no momento. Tente novamente em alguns instantes.",
  provider_unavailable: "Serviço de stream indisponível. Tente novamente em alguns instantes.",
  account_expired: "Sua assinatura expirou. Atualize na página de perfil para continuar.",
  stream_blocked: "Conteúdo bloqueado na sua região.",
  rate_limited: "Muitas requisições agora. Aguarde um momento e tente de novo.",
};

function shouldUseHls(url: string, contentType: string) {
  if (url.includes(".m3u8")) return true;
  const ct = contentType.toLowerCase();
  return ct.includes("mp2t") || ct.includes("mpegurl") || ct.includes("application/x-mpegurl");
}

export async function loadHTML5(url: string, deps: HTML5BackendDeps) {
  if (!videoElement) {
    throw new Error("HTML5 backend is not initialized");
  }

  // Fresh playback session: allow the next error event through the throttle.
  lastErrorAt = 0;
  hlsRecoveryAttempts = 0;
  if (hlsRecoveryTimer) {
    clearTimeout(hlsRecoveryTimer);
    hlsRecoveryTimer = null;
  }

  try {
    const probe = await probeSource(url);

    if (probe.fallback) {
      const message = FALLBACK_MESSAGES[probe.fallback] ?? "Stream indisponível no momento";
      logger.warn("Backend returned fallback stream", { url, category: probe.fallback });
      deps.updateState({ error: message, buffering: false });
      deps.callbacks.onError?.(message);
      return;
    }

    if (shouldUseHls(url, probe.contentType)) {
      const Hls = (await import("hls.js/light")).default;
      if (!Hls.isSupported()) {
        // Last-ditch: try native HLS (Safari / iOS WebView).
        if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
          logger.debug("Using native HLS playback");
          videoElement.src = url;
          await playVideo();
        } else {
          deps.updateState({ error: "HLS is not supported", buffering: false });
          deps.callbacks.onError?.("HLS is not supported");
        }
        return;
      }

      const hls = new Hls({
        enableWorker: false,
        lowLatencyMode: false,
        backBufferLength: -1,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 60 * 1000 * 1000,
        startLevel: -1,
        autoStartLoad: true,
        liveSyncDurationCount: 3,
        fragLoadingMaxRetry: 6,
        manifestLoadingMaxRetry: 4,
        levelLoadingMaxRetry: 4,
      });
      hls.loadSource(url);
      hls.attachMedia(videoElement);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        logger.debug("HLS manifest parsed");
        void playVideo();
      });
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        // Stream is delivering again — future fatal errors start fresh.
        hlsRecoveryAttempts = 0;
      });
      hls.on(Hls.Events.ERROR, (_event: unknown, data: { fatal?: boolean; type?: string }) => {
        if (!data.fatal) {
          return;
        }

        // Network errors resume the loader; media errors re-sync the decoder.
        // Anything else (mux/other) has no recovery path in hls.js.
        const recover =
          data.type === Hls.ErrorTypes.NETWORK_ERROR
            ? () => hls.startLoad()
            : data.type === Hls.ErrorTypes.MEDIA_ERROR
              ? () => hls.recoverMediaError()
              : null;

        if (recover && hlsRecoveryAttempts < HLS_RECOVERY_LIMIT) {
          hlsRecoveryAttempts += 1;
          const delay = Math.min(8000, 500 * 2 ** hlsRecoveryAttempts);
          logger.warn(
            `HLS fatal ${data.type}; recovery ${hlsRecoveryAttempts}/${HLS_RECOVERY_LIMIT} in ${delay}ms`,
          );
          deps.updateState({ buffering: true });
          hlsRecoveryTimer = setTimeout(() => {
            hlsRecoveryTimer = null;
            recover();
          }, delay);
          return;
        }

        logger.error("HLS playback error", data);
        const message = `HLS error: ${data.type ?? "unknown"}`;
        deps.updateState({ error: message, buffering: false });
        deps.callbacks.onError?.(message);
      });
      hlsInstance = hls;
    } else {
      videoElement.src = url;
    }

    await playVideo();
  } catch (error) {
    const message = getErrorMessage(error, "Playback error");
    logger.error("Failed to load playback source", error);
    deps.updateState({ error: message, buffering: false });
    deps.callbacks.onError?.(message);
  }
}

export function playHTML5() {
  return playVideo();
}

export function pauseHTML5() {
  videoElement?.pause();
}

export function seekHTML5(delta: number, duration: number) {
  if (!videoElement) {
    return;
  }

  videoElement.currentTime = Math.max(0, Math.min(duration, videoElement.currentTime + delta));
}

export function seekToHTML5(position: number, duration: number) {
  if (!videoElement) {
    return;
  }

  videoElement.currentTime = Math.max(0, Math.min(duration, position));
}

export function destroyHTML5Backend() {
  if (hlsRecoveryTimer) {
    clearTimeout(hlsRecoveryTimer);
    hlsRecoveryTimer = null;
  }
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }

  if (!videoElement) {
    return;
  }

  videoElement.pause();
  videoElement.src = "";
  videoElement.remove();
  videoElement = null;
}
