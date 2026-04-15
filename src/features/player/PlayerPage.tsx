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

  let controlsTimeout: number | null = null;
  let seekFeedbackTimeout: number | null = null;
  let historyInterval: number | null = null;
  let syncMessageTimeout: number | null = null;
  let destroyed = false;
  let loadedUrl: string | null = null;
  let telemetryStarted = false;
  let lastTelemetryPosition = -1;
  let historySyncWarningShown = false;

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

  function handlePlayPause() {
    resetControlsTimeout();
    PlayerManager.togglePlayPause();
    sendTelemetry(state().playing ? "pause" : "resume");
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

  function handleSeek(delta: number) {
    resetControlsTimeout();

    const nextAccumulatedSeek = accumulatedSeek() + delta;
    setAccumulatedSeek(nextAccumulatedSeek);

    const sign = nextAccumulatedSeek >= 0 ? "+" : "";
    if (Math.abs(nextAccumulatedSeek) >= 60) {
      const minutes = Math.floor(Math.abs(nextAccumulatedSeek) / 60);
      const seconds = Math.abs(nextAccumulatedSeek) % 60;
      setSeekFeedback(
        `${sign}${nextAccumulatedSeek >= 0 ? "" : "-"}${minutes}m${seconds > 0 ? ` ${seconds}s` : ""}`,
      );
    } else {
      setSeekFeedback(`${sign}${nextAccumulatedSeek}s`);
    }

    if (seekFeedbackTimeout) {
      clearTimeout(seekFeedbackTimeout);
    }

    seekFeedbackTimeout = window.setTimeout(() => {
      PlayerManager.seek(accumulatedSeek());
      setSeekFeedback(null);
      setAccumulatedSeek(0);
    }, 800);
  }

  const progress = () => {
    const { currentTime, duration } = state();
    return duration > 0 ? (currentTime / duration) * 100 : 0;
  };

  createEffect(() => {
    const source = streamData();
    if (!source?.streamUrl || destroyed || loadedUrl === source.streamUrl) {
      return;
    }

    loadedUrl = source.streamUrl;
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
      onEnter={handlePlayPause}
      onLast={handleClose}
      onBack={handleClose}
      onLeft={() => {
        handleSeek(-10);
        return true;
      }}
      onRight={() => {
        handleSeek(10);
        return true;
      }}
      onUp={() => {
        handleSeek(60);
        return true;
      }}
      onDown={() => {
        handleSeek(-60);
        return true;
      }}
      onPlay={handlePlay}
      onPause={handlePause}
      onPlayPause={handlePlayPause}
      onStop={handleClose}
      onFastForward={() => {
        handleSeek(30);
        return true;
      }}
      onRewind={() => {
        handleSeek(-30);
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
            Erro de Reproducao
          </Text>
          <Text fontSize={24} color={0x888888ff}>
            {state().error ?? ""}
          </Text>
          <Text fontSize={20} color={0x666666ff} y={40}>
            Pressione Voltar para sair
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
            width={200}
            height={100}
            color={0x000000aa}
            borderRadius={16}
            display="flex"
            justifyContent="center"
            alignItems="center"
          >
            <Text fontSize={42} fontWeight={700} color={theme.primary}>
              {seekFeedback() ?? ""}
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
        <View
          y={0}
          width={SCREEN_WIDTH}
          height={120}
          color={0x000000cc}
          zIndex={120}
          alpha={controlsVisible() ? 1 : 0}
          transition={{ alpha: { duration: 250, easing: "ease-out" } }}
          skipFocus={!controlsVisible()}
        >
          <Text
            x={60}
            y={40}
            fontSize={36}
            fontWeight={700}
            color={0xffffffff}
            contain="width"
            width={1800}
            textOverflow="ellipsis"
            maxLines={1}
          >
            {title()}
          </Text>
        </View>

        <View
          y={880}
          width={SCREEN_WIDTH}
          height={200}
          color={0x000000cc}
          zIndex={120}
          alpha={controlsVisible() ? 1 : 0}
          transition={{ alpha: { duration: 250, easing: "ease-out" } }}
          skipFocus={!controlsVisible()}
        >
          <View x={60} y={40} width={1800} height={8} color={0x444444ff} borderRadius={4}>
            <View
              width={Math.max(0, (1800 * progress()) / 100)}
              height={8}
              color={0xe50914ff}
              borderRadius={4}
            />
          </View>

          <View x={60} y={60}>
            <Text fontSize={24} color={0xffffffff}>
              {formatTime(state().currentTime)} / {formatTime(state().duration)}
            </Text>
          </View>

          <View x={1760} y={60}>
            <Text fontSize={24} color={0xccccccff}>
              {state().playing ? "II Pause" : "> Play"}
            </Text>
          </View>

          <View x={60} y={110} display="flex" gap={50}>
            <Text fontSize={18} color={0x888888ff}>
              {"<"} -10s
            </Text>
            <Text fontSize={18} color={0x888888ff}>
              {">"} +10s
            </Text>
            <Text fontSize={18} color={0x888888ff}>
              ^ +1min
            </Text>
            <Text fontSize={18} color={0x888888ff}>
              v -1min
            </Text>
            <Text fontSize={18} color={0x888888ff}>
              OK Play/Pause
            </Text>
            <Text fontSize={18} color={0x888888ff}>
              Voltar Sair
            </Text>
          </View>
        </View>
      </Show>
    </View>
  );
};

export default PlayerPage;
