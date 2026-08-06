import { afterEach, describe, expect, it, vi } from "vitest";
import { AVPLAY_PREPARE_TIMEOUT_MS, destroyAVPlayBackend, loadAVPlay } from "./avplayBackend";
import type { PlayerState } from "../playerState";

function createAVPlay(overrides: Record<string, unknown> = {}) {
  return {
    close: vi.fn(),
    open: vi.fn(),
    setDisplayMethod: vi.fn(),
    setDisplayRect: vi.fn(),
    setListener: vi.fn(),
    setStreamingProperty: vi.fn(),
    setTimeoutForBuffering: vi.fn(),
    setBufferingParam: vi.fn(),
    prepareAsync: vi.fn((onSuccess: () => void) => onSuccess()),
    getDuration: vi.fn(() => 90_000),
    getCurrentTime: vi.fn(() => 0),
    getState: vi.fn(() => "IDLE"),
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(),
    stop: vi.fn(),
    ...overrides,
  };
}

function installAVPlay(avplay: ReturnType<typeof createAVPlay>) {
  Object.defineProperty(globalThis, "webapis", {
    configurable: true,
    value: { avplay },
  });
}

function createDeps() {
  const updates: Array<Partial<PlayerState>> = [];
  const errors: string[] = [];
  return {
    updates,
    errors,
    deps: {
      callbacks: { onError: (message: string) => errors.push(message) },
      updateState: (update: Partial<PlayerState>) => updates.push(update),
    },
  };
}

afterEach(() => {
  destroyAVPlayBackend();
  Reflect.deleteProperty(globalThis, "webapis");
  vi.useRealTimers();
});

describe("loadAVPlay", () => {
  it("resolves only after prepare succeeds and playback starts", async () => {
    const avplay = createAVPlay();
    const { deps, updates, errors } = createDeps();
    installAVPlay(avplay);

    await expect(loadAVPlay("https://media.test/movie.m3u8", deps)).resolves.toBeUndefined();

    expect(avplay.play).toHaveBeenCalledOnce();
    expect(updates[updates.length - 1]).toMatchObject({ ready: true, playing: true, buffering: false });
    expect(errors).toEqual([]);
  });

  it("rejects and clears buffering when prepare reports an error", async () => {
    const avplay = createAVPlay({
      prepareAsync: vi.fn((_onSuccess: () => void, onError: (error: unknown) => void) =>
        onError("PLAYER_ERROR_CONNECTION_FAILED"),
      ),
    });
    const { deps, updates, errors } = createDeps();
    installAVPlay(avplay);

    await expect(loadAVPlay("https://media.test/movie", deps)).rejects.toThrow(
      "Prepare error: PLAYER_ERROR_CONNECTION_FAILED",
    );

    expect(updates[updates.length - 1]).toMatchObject({ ready: false, playing: false, buffering: false });
    expect(errors).toEqual(["Prepare error: PLAYER_ERROR_CONNECTION_FAILED"]);
  });

  it("times out when the Tizen callback never arrives", async () => {
    vi.useFakeTimers();
    const avplay = createAVPlay({ prepareAsync: vi.fn() });
    const { deps, updates, errors } = createDeps();
    installAVPlay(avplay);

    const load = loadAVPlay("https://media.test/hanging", deps);
    const rejection = expect(load).rejects.toThrow("AVPlay prepare timed out");
    await vi.advanceTimersByTimeAsync(AVPLAY_PREPARE_TIMEOUT_MS);
    await rejection;

    expect(updates[updates.length - 1]).toMatchObject({ ready: false, playing: false, buffering: false });
    expect(errors[errors.length - 1]).toContain("AVPlay prepare timed out");
  });

  it("cancels a pending prepare without surfacing an error during teardown", async () => {
    vi.useFakeTimers();
    const avplay = createAVPlay({ prepareAsync: vi.fn() });
    const { deps, errors } = createDeps();
    installAVPlay(avplay);

    const load = loadAVPlay("https://media.test/hanging", deps);
    destroyAVPlayBackend();

    await expect(load).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(AVPLAY_PREPARE_TIMEOUT_MS);
    expect(errors).toEqual([]);
  });
});
