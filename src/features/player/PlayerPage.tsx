import { Text, View } from "@lightningtv/solid";
import { useNavigate, useParams } from "@solidjs/router";
import { createEffect, createResource, createSignal, onCleanup, onMount, Show } from "solid-js";
import { history } from "../../lib/storage";
import { theme } from "../../styles";
import { createLogger } from "../../shared/logging/logger";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "../../shared/layout";
import api, { ApiError, type PlaybackTelemetryEvent } from "@/lib/api";
import { authState } from "@/features/auth/auth";
import PlayerManager, { type PlayerState } from "./core/playerManager";
import { createInitialPlayerState } from "./core/playerState";
import { type PlayerType, resolvePlayerSource } from "./stream";

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
type PlayerControl = "timeline" | "back" | "play" | "forward";

const PlayerPage = () => {
  const params = useParams<{ type: PlayerType; id: string }>();
  const navigate = useNavigate();

  const [state, setState] = createSignal<PlayerState>(createInitialPlayerState());
  const [controlsVisible, setControlsVisible] = createSignal(true);
  const [title, setTitle] = createSignal("");
  const [posterUrl, setPosterUrl] = createSignal<string | undefined>();
  const [seekFeedback, setSeekFeedback] = createSignal<string | null>(null);
  const [accumulatedSeek, setAccumulatedSeek] = createSignal(0);
  const [syncMessage, setSyncMessage] = createSignal<string | null>(null);
  const [selectedControl, setSelectedControl] = createSignal<PlayerControl>("play");

  let controlsTimeout: number | null = null;
  let seekFeedbackTimeout: number | null = null;
  let historyInterval: number | null = null;
  let playbackWatchdogInterval: number | null = null;
  let syncMessageTimeout: number | null = null;
  let destroyed = false;
  let loadedUrl: string | null = null;
  let telemetryStarted = false;
  let lastTelemetryPosition = -1;
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

    history.update({
      id: params.id,
      type: params.type,
      title: title(),
      posterUrl: posterUrl(),
      progress: Math.min(100, (currentTime / duration) * 100),
      currentTime,
      duration,
      episodeId: params.type === "series" ? params.id : undefined,
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

  function sendTelemetry(
    event: PlaybackTelemetryEvent["event"],
    overrides: Partial<PlaybackTelemetryEvent> = {},
  ) {
    if (!authState.isAuthenticated()) {
      return;
    }

    const current = state();
    void api
      .sendPlaybackTelemetry({
        content_type:
          params.type === "channel" ? "live_channel" : params.type === "series" ? "episode" : "movie",
        content_id: params.id,
        event,
        position_seconds: Math.floor(current.currentTime),
        duration_seconds: current.duration > 0 ? Math.floor(current.duration) : undefined,
        ...overrides,
      })
      .catch(error => {
        logger.warn("Failed to send playback telemetry", error);
      });
  }

  function toErrorMessage(error: unknown) {
    return typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "Unknown error")
      : String(error);
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

  function handleClose() {
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
    if (state().error && loadedUrl) {
      return retryPlayback();
    }

    return handlePlayPause();
  }

  function handleSelectedControl() {
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
      case "play":
      default:
        return handlePrimaryAction();
    }
  }

  function retryPlayback() {
    if (!loadedUrl || recoveryInFlight) {
      return true;
    }

    recoveryInFlight = true;
    resetControlsTimeout();
    setState({ ...state(), error: null, buffering: true });
    pendingResumePosition = state().currentTime > 5 ? state().currentTime : getSavedResumePosition();

    void PlayerManager.load(loadedUrl)
      .catch(error => {
        logger.error("Failed to retry playback", error);
        sendTelemetry("error", {
          error_message: toErrorMessage(error),
        });
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

  function selectPreviousControl() {
    const current = selectedControl();
    if (current === "timeline") {
      handleSeek(-1);
      return true;
    }

    if (current === "forward") {
      setSelectedControl("play");
    } else if (current === "play") {
      setSelectedControl("back");
    }

    resetControlsTimeout();
    return true;
  }

  function selectNextControl() {
    const current = selectedControl();
    if (current === "timeline") {
      handleSeek(1);
      return true;
    }

    if (current === "back") {
      setSelectedControl("play");
    } else if (current === "play") {
      setSelectedControl("forward");
    }

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
    selectedControl() === control ? 0xffffffff : activeColor;

  const controlIconColor = (control: PlayerControl) =>
    selectedControl() === control ? 0x050508ff : 0xffffffff;

  const controlBorder = (control: PlayerControl) => ({
    color: selectedControl() === control ? theme.primary : 0xffffff1f,
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
    pendingResumePosition = current.currentTime > 5 ? Math.max(0, current.currentTime - 2) : null;
    showSyncMessage("A reprodução parece travada. Recarregando...");

    void PlayerManager.load(loadedUrl)
      .catch(error => {
        logger.error("Failed to recover stalled playback", error);
        sendTelemetry("error", {
          error_message: toErrorMessage(error),
        });
      })
      .finally(() => {
        recoveryInFlight = false;
      });
  }

  createEffect(() => {
    const source = streamData();
    if (!source?.streamUrl || destroyed || loadedUrl === source.streamUrl) {
      return;
    }

    loadedUrl = source.streamUrl;
    pendingResumePosition = getSavedResumePosition();
    void PlayerManager.init({
      onStateChange: nextState => {
        if (!destroyed) {
          setState(nextState);
        }
      },
      onComplete: () => {
        logger.debug("Playback completed");
        sendTelemetry("complete");
        if (!destroyed) {
          handleClose();
        }
      },
      onError: error => {
        logger.error("Playback callback error", error);
        sendTelemetry("error", {
          error_message: toErrorMessage(error),
        });
      },
    })
      .then(() => {
        if (!destroyed) {
          return PlayerManager.load(source.streamUrl).then(() => {
            telemetryStarted = true;
            sendTelemetry("start");
          });
        }
      })
      .catch(error => {
        logger.error("Failed to initialize player", error);
        sendTelemetry("error", {
          error_message: toErrorMessage(error),
        });
      });
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
      void PlayerManager.restore().then(restored => {
        if (restored || destroyed || !loadedUrl) {
          return;
        }

        logger.warn("AVPlay restore failed; reloading source");
        return PlayerManager.load(loadedUrl);
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
      onEnter={handleSelectedControl}
      onLast={handleClose}
      onBack={handleClose}
      onLeft={selectPreviousControl}
      onRight={selectNextControl}
      onUp={selectTimeline}
      onDown={selectControls}
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
        <View
          width={SCREEN_WIDTH}
          height={SCREEN_HEIGHT}
          display="flex"
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          gap={20}
        >
          <Text fontSize={32} color={0xe50914ff}>
            Erro de Reprodução
          </Text>
          <Text fontSize={24} color={0xd0d0dcff} textAlign="center" contain="width" width={1200} maxLines={2}>
            {state().error ?? ""}
          </Text>
          <Text fontSize={20} color={0x9999aaff} y={40}>
            OK tenta novamente · Voltar sai do player
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
            color={controlColor("back")}
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
            color={controlColor("play", state().playing ? 0x24242fee : theme.primary)}
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
            color={controlColor("forward")}
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

          <Text x={320} y={218} fontSize={18} color={0xc6c6d6ff}>
            {remainingTime()}
          </Text>
        </View>
      </Show>
    </View>
  );
};

export default PlayerPage;
