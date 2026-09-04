import { type ElementNode, Text, View } from "@solidtv/solid";
import { useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { createEffect, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { history } from "@/lib/storage";
import { theme } from "@/styles";
import { createLogger } from "@/shared/logging/logger";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "@/shared/layout";
import api, { ApiError, type Episode, type PlaybackTelemetryEvent } from "@/lib/api";
import { authState } from "@/features/auth/auth";
import PlayerManager, { type PlayerCallbacks, type PlayerState } from "./core/playerManager";
import { createInitialPlayerState } from "./core/playerState";
import { playbackErrorMessage } from "./playbackError";
import { findNextEpisode, type PlayerType, resolvePlayerSource } from "./stream";
import {
  defaultTrackIndex,
  fetchMediaTracks,
  hasSelectableTracks,
  type MediaTrack,
  splitByKind,
} from "./tracks";

const logger = createLogger("PlayerPage");
const SEEK_BAR_WIDTH = 1800;
const RESUME_MIN_SECONDS = 30;
const RESUME_END_PADDING_SECONDS = 20;
const STALLED_CHECK_INTERVAL_MS = 5000;
const STALLED_CHECK_LIMIT = 3;
const STALLED_RECOVERY_COOLDOWN_MS = 30000;
const SEEK_COMMIT_DELAY_MS = 900;
const SEEK_ACCELERATION_WINDOW_MS = 1400;
const SEEK_STEPS_SECONDS = [10, 30, 60, 180, 300, 600] as const;
const NEXT_EPISODE_COUNTDOWN_SECONDS = 5;
type PlayerControl = "timeline" | "back" | "play" | "forward" | "tracks";
type PlaybackTelemetrySignal = "start" | "progress" | "pause" | "resume" | "complete" | "error";

const TELEMETRY_OUTCOMES: Record<PlaybackTelemetrySignal, PlaybackTelemetryEvent["outcome"]> = {
  start: "started",
  progress: "playing",
  pause: "cancelled",
  resume: "restarted",
  complete: "completed",
  error: "error",
};

function streamTypeFromUrl(url: string | null): PlaybackTelemetryEvent["stream_type"] {
  if (!url) return "unknown";
  const path = url.split("?", 1)[0].toLowerCase();
  if (path.endsWith(".m3u8")) return "hls";
  if (path.endsWith(".mpd")) return "dash";
  if (path.endsWith(".mp4")) return "mp4";
  if (path.endsWith(".mkv")) return "mkv";
  if (path.endsWith(".flv")) return "flv";
  if (path.endsWith(".ts")) return "ts";
  return "unknown";
}

const PlayerPage = () => {
  const params = useParams<{ type: PlayerType; id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [state, setState] = createSignal<PlayerState>(createInitialPlayerState());
  const [controlsVisible, setControlsVisible] = createSignal(true);
  const [title, setTitle] = createSignal("");
  const [posterUrl, setPosterUrl] = createSignal<string | undefined>();
  const [seekFeedback, setSeekFeedback] = createSignal<string | null>(null);
  const [accumulatedSeek, setAccumulatedSeek] = createSignal(0);
  const [syncMessage, setSyncMessage] = createSignal<string | null>(null);
  const [selectedControl, setSelectedControl] = createSignal<PlayerControl>("play");
  const [tracks, setTracks] = createSignal<MediaTrack[]>([]);
  const [trackPickerOpen, setTrackPickerOpen] = createSignal(false);
  const [trackCursor, setTrackCursor] = createSignal(0);
  const [activeAudioTrack, setActiveAudioTrack] = createSignal<number | null>(null);
  const [nextUp, setNextUp] = createSignal<Episode | null>(null);
  const [nextUpSeconds, setNextUpSeconds] = createSignal(NEXT_EPISODE_COUNTDOWN_SECONDS);
  let nextUpInterval: number | null = null;
  let retryButton: ElementNode | undefined;
  let backButton: ElementNode | undefined;

  let controlsTimeout: number | null = null;
  let seekFeedbackTimeout: number | null = null;
  let historyInterval: number | null = null;
  let playbackWatchdogInterval: number | null = null;
  let syncMessageTimeout: number | null = null;
  let destroyed = false;
  let loadedUrl: string | null = null;
  let telemetryStarted = false;
  let lastTelemetryPosition = -1;
  let playbackRequestedAt = 0;
  let playbackSessionStartedAt = 0;
  let telemetryErrorCount = 0;
  let telemetryFallbackCount = 0;
  let historySyncWarningShown = false;
  let pendingResumePosition: number | null = null;
  let lastWatchdogPosition = 0;
  let stalledWatchdogChecks = 0;
  let lastWatchdogRecoveryAt = 0;
  let recoveryInFlight = false;
  let seekDirection: -1 | 1 | null = null;
  let seekStepIndex = 0;
  let lastSeekInputAt = 0;

  const [streamData] = createResource(
    () => ({ type: params.type, id: params.id }),
    async ({ type, id }) => {
      const source = await resolvePlayerSource(type, id);
      setTitle(source.title);
      setPosterUrl(source.posterUrl);
      return source;
    },
  );

  // Probed server-side, independent of the stream resource: a failure here must
  // never delay or block playback, so the picker simply stays hidden.
  createResource(
    () => ({ type: params.type, id: params.id }),
    async ({ type, id }) => {
      setTracks([]);
      setActiveAudioTrack(null);
      const result = await fetchMediaTracks(type, id);
      if (result.status === "ready") {
        setTracks(result.tracks);
        // Whatever the container marks default is what already started playing.
        setActiveAudioTrack(defaultTrackIndex(result.tracks, "audio"));
      }
      return result.status;
    },
  );

  // Auto-next: resolved from the (cached) series detail when the episode
  // playback was opened with a `?series=<id>` context. Without the context
  // (deep link) the feature simply stays off.
  const [nextEpisode] = createResource(
    () =>
      params.type === "series" && searchParams.series
        ? { seriesId: String(searchParams.series), episodeId: params.id }
        : null,
    async ({ seriesId, episodeId }) => {
      try {
        return findNextEpisode(await api.getSeriesDetail(seriesId), episodeId);
      } catch {
        return null;
      }
    },
  );

  function cancelNextUp() {
    if (nextUpInterval) {
      clearInterval(nextUpInterval);
      nextUpInterval = null;
    }
    setNextUp(null);
  }

  function playNextEpisode() {
    const next = nextUp();
    cancelNextUp();
    if (!next || destroyed) {
      return;
    }

    // Flush the finished episode into history (completed) before the route
    // param swap re-targets saveHistory at the new episode id.
    saveHistory();
    lastTelemetryPosition = -1;
    // Same route, new param: the page does NOT remount — streamData refetches
    // and the load effect feeds the already-initialized PlayerManager.
    navigate(`/player/series/${next.id}?series=${String(searchParams.series)}`, { replace: true });
  }

  function startNextEpisodeCountdown() {
    setNextUpSeconds(NEXT_EPISODE_COUNTDOWN_SECONDS);
    setNextUp(nextEpisode() ?? null);
    if (!nextUp()) {
      return false;
    }

    nextUpInterval = window.setInterval(() => {
      setNextUpSeconds(seconds => {
        if (seconds <= 1) {
          playNextEpisode();
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
    return true;
  }

  function clearTimers() {
    if (controlsTimeout) {
      clearTimeout(controlsTimeout);
      controlsTimeout = null;
    }
    if (seekFeedbackTimeout) {
      clearTimeout(seekFeedbackTimeout);
      seekFeedbackTimeout = null;
    }
    if (historyInterval) {
      clearInterval(historyInterval);
      historyInterval = null;
    }
    if (playbackWatchdogInterval) {
      clearInterval(playbackWatchdogInterval);
      playbackWatchdogInterval = null;
    }
    if (syncMessageTimeout) {
      clearTimeout(syncMessageTimeout);
      syncMessageTimeout = null;
    }
    if (nextUpInterval) {
      clearInterval(nextUpInterval);
      nextUpInterval = null;
    }
  }

  function resetControlsTimeout() {
    if (destroyed) {
      return;
    }

    if (controlsTimeout) {
      clearTimeout(controlsTimeout);
    }

    setControlsVisible(true);
    controlsTimeout = window.setTimeout(() => {
      if (state().playing && !destroyed) {
        setControlsVisible(false);
      }
    }, 4500);
  }

  function saveHistory() {
    const { currentTime, duration } = state();
    if (duration <= 0) {
      return;
    }

    const episodeMeta = params.type === "series" ? streamData()?.episode : undefined;
    history.update({
      id: params.id,
      type: params.type,
      title: title(),
      posterUrl: posterUrl(),
      progress: Math.min(100, (currentTime / duration) * 100),
      currentTime,
      duration,
      episodeId: params.type === "series" ? params.id : undefined,
      seriesId: params.type === "series" && searchParams.series ? String(searchParams.series) : undefined,
      seasonNumber: episodeMeta?.seasonNumber,
      episodeNumber: episodeMeta?.episodeNumber,
      episodeTitle: episodeMeta?.title,
    });

    if (!authState.isAuthenticated()) {
      return;
    }

    const remoteType =
      params.type === "channel" ? "live_channel" : params.type === "series" ? "episode" : "movie";
    void api
      .upsertHistory({
        type: remoteType,
        content_id: params.id,
        progress_seconds: Math.floor(currentTime),
        duration_seconds: Math.floor(duration),
        completed: currentTime / duration >= 0.95,
      })
      .then(() => {
        historySyncWarningShown = false;
      })
      .catch(error => {
        if (historySyncWarningShown) {
          return;
        }

        historySyncWarningShown = true;

        if (error instanceof ApiError && error.isUnauthorized()) {
          showSyncMessage("Sessão expirada. Progresso salvo só nesta TV.");
          return;
        }

        showSyncMessage("Não foi possível sincronizar seu progresso agora.");
      });
  }

  function sendTelemetry(signal: PlaybackTelemetrySignal) {
    if (!authState.isAuthenticated()) {
      return;
    }

    const now = Date.now();
    if (signal === "error") telemetryErrorCount += 1;
    if (signal === "start" && playbackSessionStartedAt === 0) playbackSessionStartedAt = now;

    const metric: PlaybackTelemetryEvent = {
      kind: "playback",
      event: signal === "error" ? "player_error" : "playback_session",
      outcome: TELEMETRY_OUTCOMES[signal],
      engine: PlayerManager.getBackend() === "avplay" ? "avplayer" : "native",
      content_type: params.type === "channel" ? "channel" : params.type === "series" ? "episode" : "movie",
      stream_type: streamTypeFromUrl(loadedUrl),
      surface: "other",
      session_duration_ms:
        playbackSessionStartedAt > 0 ? Math.max(0, now - playbackSessionStartedAt) : undefined,
      error_count: telemetryErrorCount,
      fallback_count: telemetryFallbackCount,
    };

    if (signal === "start" && playbackRequestedAt > 0) {
      metric.time_to_first_frame_ms = Math.max(0, now - playbackRequestedAt);
    }

    void api.sendPlaybackTelemetry(metric).catch(error => {
      logger.warn("Failed to send playback telemetry", error);
    });
  }

  function showSyncMessage(message: string) {
    setSyncMessage(message);

    if (syncMessageTimeout) {
      clearTimeout(syncMessageTimeout);
    }

    syncMessageTimeout = window.setTimeout(() => {
      setSyncMessage(null);
      syncMessageTimeout = null;
    }, 3200);
  }

  function cleanupPlayer() {
    if (destroyed) {
      return;
    }

    destroyed = true;
    clearTimers();
    saveHistory();
    void PlayerManager.destroy();
  }

  function handleClose(event?: KeyboardEvent) {
    // Mark the synthetic Back keydown as consumed so the Capacitor
    // backButton listener doesn't fall through to its own history.back()
    // and double-pop the route.
    event?.preventDefault();
    cancelNextUp();
    cleanupPlayer();
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
    return true;
  }

  function formatTime(seconds: number) {
    if (!seconds || !Number.isFinite(seconds)) {
      return "0:00";
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
    }

    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }

  function getSavedResumePosition() {
    if (params.type === "channel") {
      return null;
    }

    // Explicit "watch from the beginning" request from a detail page.
    if (searchParams.restart) {
      return null;
    }

    const saved = history.getProgress(
      params.id,
      params.type,
      params.type === "series" ? params.id : undefined,
    );
    if (!saved || saved.duration <= 0 || saved.currentTime < RESUME_MIN_SECONDS || saved.progress >= 95) {
      return null;
    }

    return Math.max(0, Math.min(saved.currentTime, saved.duration - RESUME_END_PADDING_SECONDS));
  }

  function applyPendingResume() {
    const position = pendingResumePosition;
    const current = state();
    if (!position || !current.ready || current.duration <= 0) {
      return;
    }

    pendingResumePosition = null;
    PlayerManager.seekTo(position);
    showSyncMessage(`Retomando de ${formatTime(position)}`);
  }

  function handlePlayPause() {
    resetControlsTimeout();
    PlayerManager.togglePlayPause();
    sendTelemetry(state().playing ? "pause" : "resume");
    return true;
  }

  function handlePrimaryAction() {
    if (state().error) {
      return retryPlayback();
    }

    return handlePlayPause();
  }

  function handleSelectedControl() {
    if (nextUp()) {
      playNextEpisode();
      return true;
    }

    switch (selectedControl()) {
      case "timeline":
        if (accumulatedSeek() !== 0) {
          commitSeek();
          return true;
        }
        return handlePlayPause();
      case "back":
        handleSeek(-1);
        return true;
      case "forward":
        handleSeek(1);
        return true;
      case "tracks":
        setTrackCursor(
          Math.max(
            0,
            audioTracks().findIndex(t => t.index === activeAudioTrack()),
          ),
        );
        setTrackPickerOpen(true);
        resetControlsTimeout();
        return true;
      case "play":
      default:
        return handlePrimaryAction();
    }
  }

  function retryPlayback() {
    if (recoveryInFlight) {
      return true;
    }

    const current = state();
    recoveryInFlight = true;
    telemetryFallbackCount += 1;
    resetControlsTimeout();
    setState({ ...current, error: null, buffering: true });
    pendingResumePosition = current.currentTime > 5 ? current.currentTime : getSavedResumePosition();

    void resolvePlayerSource(params.type, params.id, { refreshStream: true })
      .then(source => {
        if (destroyed) return;
        loadedUrl = source.streamUrl;
        setTitle(source.title);
        setPosterUrl(source.posterUrl);
        playbackRequestedAt = Date.now();
        const ensurePlayer = PlayerManager.isInitialized()
          ? Promise.resolve()
          : PlayerManager.init(playerCallbacks());
        return ensurePlayer.then(() => PlayerManager.load(source.streamUrl));
      })
      .catch(error => {
        logger.error("Failed to retry playback", error);
        if (!destroyed && !state().error) {
          const message = error instanceof Error ? error.message : "Could not refresh playback source";
          setState({ ...state(), error: message, buffering: false });
          sendTelemetry("error");
        }
      })
      .finally(() => {
        recoveryInFlight = false;
      });

    return true;
  }

  function handlePlay() {
    resetControlsTimeout();
    PlayerManager.play();
    sendTelemetry("resume");
    return true;
  }

  function handlePause() {
    resetControlsTimeout();
    PlayerManager.pause();
    sendTelemetry("pause");
    return true;
  }

  function formatSeekDelta(seconds: number) {
    const direction = seconds >= 0 ? "+" : "-";
    const absolute = Math.abs(seconds);
    const minutes = Math.floor(absolute / 60);
    const remainingSeconds = absolute % 60;

    if (minutes > 0) {
      return `${direction}${minutes}m${remainingSeconds > 0 ? ` ${remainingSeconds}s` : ""}`;
    }

    return `${direction}${remainingSeconds}s`;
  }

  function commitSeek() {
    if (seekFeedbackTimeout) {
      clearTimeout(seekFeedbackTimeout);
      seekFeedbackTimeout = null;
    }

    const delta = accumulatedSeek();
    if (delta !== 0) {
      PlayerManager.seek(delta);
    }

    setSeekFeedback(null);
    setAccumulatedSeek(0);
    seekDirection = null;
    seekStepIndex = 0;
  }

  function handleSeek(direction: -1 | 1, forcedStepSeconds?: number) {
    resetControlsTimeout();

    const now = Date.now();
    const isSameBurst =
      seekDirection === direction &&
      seekFeedbackTimeout !== null &&
      now - lastSeekInputAt <= SEEK_ACCELERATION_WINDOW_MS;
    const stepSeconds =
      forcedStepSeconds ??
      SEEK_STEPS_SECONDS[isSameBurst ? Math.min(seekStepIndex + 1, SEEK_STEPS_SECONDS.length - 1) : 0];

    seekDirection = direction;
    seekStepIndex = SEEK_STEPS_SECONDS.indexOf(stepSeconds as (typeof SEEK_STEPS_SECONDS)[number]);
    lastSeekInputAt = now;

    const nextAccumulatedSeek = accumulatedSeek() + direction * stepSeconds;
    setAccumulatedSeek(nextAccumulatedSeek);
    setSeekFeedback(formatSeekDelta(nextAccumulatedSeek));

    if (seekFeedbackTimeout) {
      clearTimeout(seekFeedbackTimeout);
    }

    seekFeedbackTimeout = window.setTimeout(commitSeek, SEEK_COMMIT_DELAY_MS);
  }

  const audioTracks = () => splitByKind(tracks()).audio;
  const canPickTracks = () => hasSelectableTracks(tracks());

  /** Left-to-right order of the control row, minus anything not offered. */
  const controlOrder = (): PlayerControl[] =>
    canPickTracks() ? ["back", "play", "forward", "tracks"] : ["back", "play", "forward"];

  function stepControl(direction: -1 | 1) {
    const order = controlOrder();
    const at = order.indexOf(selectedControl());
    if (at < 0) return;
    const next = order[at + direction];
    if (next) setSelectedControl(next);
  }

  function applyAudioTrack(track: MediaTrack) {
    // The backend cannot switch tracks for us — selection is a player call, and
    // on a progressive MKV in a Chromium WebView there is no API at all. Report
    // that instead of leaving the viewer thinking the choice took effect.
    if (!PlayerManager.selectTrack("audio", track.index)) {
      showSyncMessage("Esta TV não permite trocar o áudio deste vídeo");
      return;
    }
    setActiveAudioTrack(track.index);
    showSyncMessage(`Áudio: ${track.label}`);
  }

  function closeTrackPicker() {
    setTrackPickerOpen(false);
    resetControlsTimeout();
    return true;
  }

  function moveTrackCursor(direction: -1 | 1) {
    const list = audioTracks();
    if (list.length === 0) return true;
    const next = trackCursor() + direction;
    if (next < 0 || next >= list.length) return true;
    setTrackCursor(next);
    return true;
  }

  function confirmTrackChoice() {
    const chosen = audioTracks()[trackCursor()];
    if (chosen) applyAudioTrack(chosen);
    return closeTrackPicker();
  }

  function selectPreviousControl() {
    const current = selectedControl();
    if (current === "timeline") {
      handleSeek(-1);
      return true;
    }

    stepControl(-1);

    resetControlsTimeout();
    return true;
  }

  function selectNextControl() {
    const current = selectedControl();
    if (current === "timeline") {
      handleSeek(1);
      return true;
    }

    stepControl(1);

    resetControlsTimeout();
    return true;
  }

  function selectTimeline() {
    setSelectedControl("timeline");
    resetControlsTimeout();
    return true;
  }

  function selectControls() {
    setSelectedControl("play");
    resetControlsTimeout();
    return true;
  }

  const progress = () => {
    const { currentTime, duration } = state();
    return duration > 0 ? (currentTime / duration) * 100 : 0;
  };

  const seekTarget = () => {
    const current = state();
    if (current.duration <= 0) {
      return current.currentTime + accumulatedSeek();
    }

    return Math.max(0, Math.min(current.duration, current.currentTime + accumulatedSeek()));
  };

  const remainingTime = () => {
    const current = state();
    if (current.duration <= 0) {
      return "Ao vivo";
    }

    return `Restam ${formatTime(Math.max(0, current.duration - current.currentTime))}`;
  };

  const primaryControlIcon = () =>
    state().playing ? "/assets/icons/player-pause.svg" : "/assets/icons/player-play.svg";

  const controlColor = (control: PlayerControl, activeColor = 0x15151dee) =>
    selectedControl() === control ? 0x2a0f14ee : activeColor;

  const controlIconColor = (control: PlayerControl) =>
    selectedControl() === control ? 0xffffffff : 0xd8d8e6ff;

  const controlBorder = (control: PlayerControl) => ({
    color: selectedControl() === control ? theme.primary : 0xffffff1a,
    width: selectedControl() === control ? 3 : 1,
  });

  function recoverIfPlaybackStalled() {
    if (destroyed || recoveryInFlight || !loadedUrl) {
      return;
    }

    const current = state();
    if (!current.ready || current.error || current.buffering || !current.playing || current.duration <= 0) {
      stalledWatchdogChecks = 0;
      lastWatchdogPosition = current.currentTime;
      return;
    }

    if (Math.abs(current.currentTime - lastWatchdogPosition) > 0.5) {
      stalledWatchdogChecks = 0;
      lastWatchdogPosition = current.currentTime;
      return;
    }

    stalledWatchdogChecks += 1;
    if (
      stalledWatchdogChecks < STALLED_CHECK_LIMIT ||
      Date.now() - lastWatchdogRecoveryAt < STALLED_RECOVERY_COOLDOWN_MS
    ) {
      return;
    }

    stalledWatchdogChecks = 0;
    lastWatchdogRecoveryAt = Date.now();
    recoveryInFlight = true;
    telemetryFallbackCount += 1;
    pendingResumePosition = current.currentTime > 5 ? Math.max(0, current.currentTime - 2) : null;
    showSyncMessage("A reprodução parece travada. Recarregando...");

    void PlayerManager.load(loadedUrl)
      .catch(error => {
        logger.error("Failed to recover stalled playback", error);
        if (!destroyed && !state().error) {
          const message = error instanceof Error ? error.message : "Could not recover playback";
          setState(previous => ({ ...previous, error: message, buffering: false }));
          sendTelemetry("error");
        }
      })
      .finally(() => {
        recoveryInFlight = false;
      });
  }

  function playerCallbacks(): PlayerCallbacks {
    return {
      onStateChange: nextState => {
        if (!destroyed) {
          setState(nextState);
          if (!telemetryStarted && nextState.ready && nextState.playing && !nextState.error) {
            telemetryStarted = true;
            sendTelemetry("start");
          }
        }
      },
      onComplete: () => {
        logger.debug("Playback completed");
        sendTelemetry("complete");
        if (destroyed) {
          return;
        }
        if (!startNextEpisodeCountdown()) {
          handleClose();
        }
      },
      onError: error => {
        logger.error("Playback callback error", error);
        sendTelemetry("error");
      },
    };
  }

  createEffect(() => {
    if (streamData.error) return;
    const source = streamData();
    if (!source?.streamUrl || destroyed || loadedUrl === source.streamUrl) {
      return;
    }

    loadedUrl = source.streamUrl;
    telemetryStarted = false;
    lastTelemetryPosition = -1;
    playbackRequestedAt = Date.now();
    playbackSessionStartedAt = 0;
    telemetryErrorCount = 0;
    telemetryFallbackCount = 0;
    pendingResumePosition = getSavedResumePosition();
    void PlayerManager.init(playerCallbacks())
      .then(() => {
        if (!destroyed) {
          return PlayerManager.load(source.streamUrl);
        }
      })
      .catch(error => {
        logger.error("Failed to initialize player", error);
        if (!destroyed && !state().error) {
          const message = error instanceof Error ? error.message : "Could not initialize playback";
          setState(previous => ({ ...previous, error: message, buffering: false }));
          sendTelemetry("error");
        }
      });
  });

  createEffect(() => {
    const error = streamData.error;
    if (!error || destroyed) return;
    const message = error instanceof Error ? error.message : "Could not resolve playback source";
    logger.error("Failed to resolve playback source", error);
    setState(previous => ({ ...previous, error: message, buffering: false }));
    sendTelemetry("error");
  });

  createEffect(applyPendingResume);

  createEffect(() => {
    const current = state();
    const position = Math.floor(current.currentTime);

    if (
      !telemetryStarted ||
      !authState.isAuthenticated() ||
      !current.playing ||
      current.duration <= 0 ||
      position <= 0
    ) {
      return;
    }

    if (lastTelemetryPosition < 0 || position - lastTelemetryPosition >= 30) {
      lastTelemetryPosition = position;
      sendTelemetry("progress");
    }
  });

  onMount(() => {
    resetControlsTimeout();
    historyInterval = window.setInterval(saveHistory, 10000);
    playbackWatchdogInterval = window.setInterval(recoverIfPlaybackStalled, STALLED_CHECK_INTERVAL_MS);

    let wasHidden = false;
    const onVisibilityChange = () => {
      const backend = PlayerManager.getBackend();

      if (document.visibilityState === "hidden") {
        wasHidden = true;
        saveHistory();
        if (backend === "avplay") {
          PlayerManager.suspend();
        }
        return;
      }

      if (!wasHidden || document.visibilityState !== "visible" || destroyed || backend !== "avplay") {
        wasHidden = false;
        return;
      }

      wasHidden = false;
      void PlayerManager.restore()
        .then(restored => {
          if (restored || destroyed || !loadedUrl) {
            return;
          }

          logger.warn("AVPlay restore failed; reloading source");
          return PlayerManager.load(loadedUrl);
        })
        .catch(error => {
          logger.error("Failed to reload AVPlay after resume", error);
          if (!destroyed && !state().error) {
            const message = error instanceof Error ? error.message : "Could not restore playback";
            setState(previous => ({ ...previous, error: message, buffering: false }));
            sendTelemetry("error");
          }
        });
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    onCleanup(() => document.removeEventListener("visibilitychange", onVisibilityChange));
  });

  onCleanup(() => {
    cleanupPlayer();
  });

  return (
    <View
      x={0}
      y={0}
      width={SCREEN_WIDTH}
      height={SCREEN_HEIGHT}
      color={0x00000000}
      onEnter={() => (trackPickerOpen() ? confirmTrackChoice() : handleSelectedControl())}
      onLast={handleClose}
      onBack={() => (trackPickerOpen() ? closeTrackPicker() : handleClose())}
      onLeft={() => (trackPickerOpen() ? true : selectPreviousControl())}
      onRight={() => (trackPickerOpen() ? true : selectNextControl())}
      onUp={() => (trackPickerOpen() ? moveTrackCursor(-1) : selectTimeline())}
      onDown={() => (trackPickerOpen() ? moveTrackCursor(1) : selectControls())}
      onPlay={handlePlay}
      onPause={handlePause}
      onPlayPause={handlePlayPause}
      onStop={handleClose}
      onFastForward={() => {
        handleSeek(1, 60);
        return true;
      }}
      onRewind={() => {
        handleSeek(-1, 60);
        return true;
      }}
      onAny={resetControlsTimeout}
      autofocus
    >
      <Show when={state().buffering && !state().error}>
        <View
          width={SCREEN_WIDTH}
          height={SCREEN_HEIGHT}
          display="flex"
          justifyContent="center"
          alignItems="center"
        >
          <Text fontSize={36} color={0xffffffff}>
            Carregando...
          </Text>
        </View>
      </Show>

      <Show when={state().error}>
        <View width={SCREEN_WIDTH} height={SCREEN_HEIGHT} color={0x05060bf2} zIndex={150}>
          <View
            x={(SCREEN_WIDTH - 1000) / 2}
            y={(SCREEN_HEIGHT - 560) / 2}
            width={1000}
            height={560}
            color={0x141520ff}
            borderRadius={24}
            onBack={handleClose}
            onLast={handleClose}
          >
            <View
              x={(1000 - 120) / 2}
              y={56}
              width={120}
              height={120}
              color={theme.primary}
              borderRadius={60}
              display="flex"
              justifyContent="center"
              alignItems="center"
            >
              <Text fontSize={80} fontWeight={700} color={0xffffffff}>
                !
              </Text>
            </View>

            <Text
              x={0}
              y={208}
              width={1000}
              fontSize={40}
              fontWeight={700}
              color={0xffffffff}
              textAlign="center"
              contain="width"
              maxLines={1}
            >
              Não foi possível reproduzir
            </Text>

            <Text
              x={140}
              y={278}
              width={720}
              fontSize={24}
              color={0xb8b8c8ff}
              textAlign="center"
              contain="width"
              maxLines={3}
              lineHeight={34}
            >
              {playbackErrorMessage(state().error)}
            </Text>

            {/* Buttons — same focus pattern as components/Hero.tsx:
                display:flex + gap, refs + setFocus() on onLeft/onRight. */}
            <View x={(1000 - 580) / 2} y={392} display="flex" gap={20}>
              <View
                ref={retryButton}
                width={280}
                height={64}
                borderRadius={32}
                display="flex"
                justifyContent="center"
                alignItems="center"
                color={0x333344ff}
                forwardStates
                autofocus
                onEnter={() => {
                  retryPlayback();
                  return true;
                }}
                onRight={() => {
                  backButton?.setFocus();
                  return true;
                }}
                transition={{
                  color: { duration: 150, easing: "ease-out" },
                  scale: { duration: 150, easing: "ease-out" },
                }}
                $focus={{ color: theme.primary, scale: 1.06 }}
              >
                <Text fontSize={22} fontWeight={700} color={0xffffffff}>
                  Tentar de novo
                </Text>
              </View>
              <View
                ref={backButton}
                width={280}
                height={64}
                borderRadius={32}
                display="flex"
                justifyContent="center"
                alignItems="center"
                color={0x333344ff}
                forwardStates
                onEnter={() => {
                  handleClose();
                  return true;
                }}
                onLeft={() => {
                  retryButton?.setFocus();
                  return true;
                }}
                transition={{
                  color: { duration: 150, easing: "ease-out" },
                  scale: { duration: 150, easing: "ease-out" },
                }}
                $focus={{ color: theme.primary, scale: 1.06 }}
              >
                <Text fontSize={22} fontWeight={700} color={0xffffffff}>
                  Voltar
                </Text>
              </View>
            </View>

            <Text
              x={0}
              y={502}
              width={1000}
              fontSize={16}
              color={0x6f7088ff}
              textAlign="center"
              contain="width"
              maxLines={1}
            >
              Esquerda/direita para escolher · OK confirma · Voltar sai
            </Text>
          </View>
        </View>
      </Show>

      <Show when={nextUp()}>
        <View
          width={SCREEN_WIDTH}
          height={SCREEN_HEIGHT}
          color={0x05060bd9}
          zIndex={140}
          display="flex"
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          gap={18}
          skipFocus
        >
          <Text fontSize={22} fontWeight={700} color={theme.gold}>
            Próximo episódio
          </Text>
          <Text
            width={1200}
            fontSize={44}
            fontWeight={700}
            color={0xffffffff}
            textAlign="center"
            contain="width"
            maxLines={1}
          >
            {`E${nextUp()?.episode_num ?? nextUp()?.number ?? ""} · ${nextUp()?.title ?? ""}`}
          </Text>
          <Text fontSize={26} color={theme.textSecondary}>
            {`Começando em ${nextUpSeconds()}s`}
          </Text>
          <Text fontSize={18} color={theme.textMuted}>
            OK assistir agora · Voltar sair
          </Text>
        </View>
      </Show>

      <Show when={seekFeedback()}>
        <View
          width={SCREEN_WIDTH}
          height={SCREEN_HEIGHT}
          display="flex"
          justifyContent="center"
          alignItems="center"
          zIndex={100}
        >
          <View
            width={300}
            height={134}
            color={0x101018ee}
            border={{ color: 0xffffff26, width: 1 }}
            borderRadius={8}
            display="flex"
            flexDirection="column"
            justifyContent="center"
            alignItems="center"
            gap={10}
          >
            <Text fontSize={42} fontWeight={700} color={theme.primary}>
              {seekFeedback() ?? ""}
            </Text>
            <Text fontSize={22} color={0xffffffff}>
              {formatTime(seekTarget())}
            </Text>
          </View>
        </View>
      </Show>

      <Show when={syncMessage()}>
        <View width={SCREEN_WIDTH} height={SCREEN_HEIGHT} zIndex={90} skipFocus>
          <View
            x={SCREEN_WIDTH - 560}
            y={32}
            width={500}
            height={48}
            color={0x1d1e28ee}
            borderRadius={24}
            border={{ color: 0x38394aff, width: 1 }}
          >
            <Text y={15} width={500} fontSize={16} color={0xffd7d7ff} textAlign="center" maxLines={1}>
              {syncMessage() || ""}
            </Text>
          </View>
        </View>
      </Show>

      <Show when={!state().error}>
        {/* Top gradient + title */}
        <View
          y={0}
          width={SCREEN_WIDTH}
          height={200}
          zIndex={120}
          alpha={controlsVisible() ? 1 : 0}
          transition={{ alpha: { duration: 250, easing: "ease-out" } }}
          skipFocus
          shader={{
            type: "linearGradient",
            colors: [0x000000d9, 0x00000080, 0x00000000],
            angle: 180,
          }}
        >
          <Text
            x={60}
            y={52}
            fontSize={38}
            fontWeight={700}
            color={0xffffffff}
            contain="width"
            width={1800}
            textOverflow="ellipsis"
            maxLines={1}
          >
            {title()}
          </Text>
          <Text x={60} y={104} fontSize={18} color={0xbbbbccff}>
            {state().playing ? "Reproduzindo" : state().buffering ? "Carregando..." : "Pausado"}
          </Text>
        </View>

        {/* Bottom gradient + controls */}
        <View
          y={760}
          width={SCREEN_WIDTH}
          height={320}
          zIndex={120}
          alpha={controlsVisible() ? 1 : 0}
          transition={{ alpha: { duration: 250, easing: "ease-out" } }}
          skipFocus
          shader={{
            type: "linearGradient",
            colors: [0x00000000, 0x00000080, 0x000000e6],
            angle: 180,
          }}
        >
          {/* Scrub bar — tall, with hover track + filled portion */}
          <View
            x={60}
            y={124}
            width={SEEK_BAR_WIDTH}
            height={selectedControl() === "timeline" ? 14 : 10}
            color={selectedControl() === "timeline" ? 0x565665dd : 0x3a3a44cc}
            border={{ color: selectedControl() === "timeline" ? theme.primary : 0x00000000, width: 2 }}
            borderRadius={7}
          >
            <View
              width={Math.max(0, (SEEK_BAR_WIDTH * progress()) / 100)}
              height={selectedControl() === "timeline" ? 14 : 10}
              color={0xe50914ff}
              borderRadius={7}
            />
            <View
              x={Math.max(0, (SEEK_BAR_WIDTH * progress()) / 100) - 12}
              y={selectedControl() === "timeline" ? -9 : -7}
              width={selectedControl() === "timeline" ? 32 : 24}
              height={selectedControl() === "timeline" ? 32 : 24}
              color={0xffffffff}
              border={{ color: theme.primary, width: 5 }}
              borderRadius={selectedControl() === "timeline" ? 16 : 12}
            />
          </View>

          {/* Time readout */}
          <Text x={60} y={158} fontSize={22} fontWeight={700} color={0xffffffff}>
            {formatTime(state().currentTime)}
          </Text>
          <Text
            x={1760}
            y={158}
            fontSize={22}
            color={0xbbbbccff}
            textAlign="right"
            contain="width"
            width={100}
          >
            {formatTime(state().duration)}
          </Text>

          <View
            x={60}
            y={202}
            width={56}
            height={56}
            color={controlColor("back", 0x0f1018cc)}
            border={controlBorder("back")}
            borderRadius={28}
          >
            <View
              x={12}
              y={12}
              width={32}
              height={32}
              src="/assets/icons/player-back.svg"
              color={controlIconColor("back")}
            />
          </View>

          <View
            x={136}
            y={192}
            width={76}
            height={76}
            color={controlColor("play", state().playing ? 0x181923dd : 0x2a0f14ee)}
            border={controlBorder("play")}
            borderRadius={38}
          >
            <View
              x={18}
              y={18}
              width={40}
              height={40}
              src={primaryControlIcon()}
              color={controlIconColor("play")}
            />
          </View>

          <View
            x={232}
            y={202}
            width={56}
            height={56}
            color={controlColor("forward", 0x0f1018cc)}
            border={controlBorder("forward")}
            borderRadius={28}
          >
            <View
              x={12}
              y={12}
              width={32}
              height={32}
              src="/assets/icons/player-forward.svg"
              color={controlIconColor("forward")}
            />
          </View>

          <Show when={canPickTracks()}>
            <View
              x={308}
              y={202}
              width={56}
              height={56}
              color={controlColor("tracks", 0x0f1018cc)}
              border={controlBorder("tracks")}
              borderRadius={28}
              display="flex"
              justifyContent="center"
              alignItems="center"
            >
              <Text fontSize={20} fontWeight={700} color={controlIconColor("tracks")}>
                CC
              </Text>
            </View>
          </Show>

          <Text x={canPickTracks() ? 396 : 320} y={218} fontSize={18} color={0xc6c6d6ff}>
            {remainingTime()}
          </Text>
        </View>
      </Show>

      {/* Track picker. Vertical list because a TV remote's Up/Down is the only
          axis free while the transport controls own Left/Right. */}
      <Show when={trackPickerOpen()}>
        <View x={0} y={0} width={1920} height={1080} color={0x000000b8} zIndex={400} />
        <View
          x={660}
          y={280}
          width={600}
          height={Math.min(520, 116 + audioTracks().length * 64)}
          color={theme.panel}
          borderRadius={20}
          border={{ color: theme.panelBorder, width: 2 }}
          zIndex={401}
        >
          <Text x={32} y={28} fontSize={26} fontWeight={700} color={theme.textPrimary}>
            Faixa de áudio
          </Text>

          <For each={audioTracks()}>
            {(track, index) => (
              <View
                x={24}
                y={76 + index() * 64}
                width={552}
                height={56}
                borderRadius={12}
                color={trackCursor() === index() ? theme.surfaceHover : 0x00000000}
                border={{
                  color: trackCursor() === index() ? theme.primary : 0x00000000,
                  width: trackCursor() === index() ? 2 : 0,
                }}
              >
                <Text x={20} y={16} fontSize={20} color={theme.textPrimary} contain="width" width={440}>
                  {track.label}
                </Text>
                <Show when={activeAudioTrack() === track.index}>
                  <Text x={484} y={16} fontSize={20} color={theme.primary}>
                    ATUAL
                  </Text>
                </Show>
              </View>
            )}
          </For>

          <Text
            x={32}
            y={Math.min(520, 116 + audioTracks().length * 64) - 40}
            fontSize={16}
            color={theme.textMuted}
          >
            Cima/baixo escolhe · OK aplica · Voltar fecha
          </Text>
        </View>
      </Show>
    </View>
  );
};

export default PlayerPage;
