import { createLogger } from "../../../../shared/logging/logger";
import type { PlayerCallbacks, PlayerState } from "../playerState";

const logger = createLogger("HTML5Player");

interface HTML5BackendDeps {
  callbacks: PlayerCallbacks;
  updateState: (updates: Partial<PlayerState>) => void;
}

let videoElement: HTMLVideoElement | null = null;
let hlsInstance: { destroy(): void } | null = null;

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
  video.addEventListener("error", error => {
    const message = "Playback error";
    logger.error("Video element raised an error", error);
    deps.updateState({ error: message, buffering: false });
    deps.callbacks.onError?.(message);
  });
}

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
const FALLBACK_MESSAGES: Record<string, string> = {
  channel_unavailable: "Canal indisponível no momento",
  provider_unavailable: "Serviço de stream indisponível, tente novamente",
  account_expired: "Sua assinatura expirou — atualize na página de perfil",
  stream_blocked: "Conteúdo bloqueado na sua região",
  rate_limited: "Muitas requisições — aguarde um momento e tente de novo",
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
      hls.on(Hls.Events.ERROR, (_event: unknown, data: { fatal?: boolean; type?: string }) => {
        logger.error("HLS playback error", data);
        if (!data.fatal) {
          return;
        }

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
