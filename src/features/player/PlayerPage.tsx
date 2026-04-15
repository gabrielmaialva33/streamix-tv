import { Text, View } from "@lightningtv/solid";
import { useNavigate, useParams } from "@solidjs/router";
import { createEffect, createResource, createSignal, onCleanup, onMount, Show } from "solid-js";
import { history } from "../../lib/storage";
import { theme } from "../../styles";
import { createLogger } from "../../shared/logging/logger";
import PlayerManager, { type PlayerState } from "./core/playerManager";
import { createInitialPlayerState } from "./core/playerState";
import { resolvePlayerSource, type PlayerType } from "./stream";

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

  let controlsTimeout: number | null = null;
  let seekFeedbackTimeout: number | null = null;
  let historyInterval: number | null = null;
  let destroyed = false;
  let loadedUrl: string | null = null;

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
    });
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
    return true;
  }

  function handlePlay() {
    resetControlsTimeout();
    PlayerManager.play();
    return true;
  }

  function handlePause() {
    resetControlsTimeout();
    PlayerManager.pause();
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
        if (!destroyed) {
          handleClose();
        }
      },
      onError: error => {
        logger.error("Playback callback error", error);
      },
    })
      .then(() => {
        if (!destroyed) {
          return PlayerManager.load(source.streamUrl);
        }
      })
      .catch(error => {
        logger.error("Failed to initialize player", error);
      });
  });

  onMount(() => {
    resetControlsTimeout();
    historyInterval = window.setInterval(saveHistory, 10000);
  });

  onCleanup(() => {
    cleanupPlayer();
  });

  return (
    <View
      x={0}
      y={0}
      width={1920}
      height={1080}
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
        <View width={1920} height={1080} display="flex" justifyContent="center" alignItems="center">
          <Text fontSize={36} color={0xffffffff}>
            Carregando...
          </Text>
        </View>
      </Show>

      <Show when={state().error}>
        <View
          width={1920}
          height={1080}
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
          width={1920}
          height={1080}
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
            <Text fontSize={42} fontWeight="bold" color={theme.primary}>
              {seekFeedback() ?? ""}
            </Text>
          </View>
        </View>
      </Show>

      <Show when={!state().error}>
        <View
          y={0}
          width={1920}
          height={120}
          color={0x333333ee}
          alpha={controlsVisible() ? 1 : 0}
          transition={{ alpha: { duration: 300, easing: "ease-out" } }}
          skipFocus={!controlsVisible()}
        >
          <Text
            x={60}
            y={40}
            fontSize={36}
            fontWeight="bold"
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
          width={1920}
          height={200}
          color={0x333333ee}
          alpha={controlsVisible() ? 1 : 0}
          transition={{ alpha: { duration: 300, easing: "ease-out" } }}
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
