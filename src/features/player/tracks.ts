import api, { ApiError, type GindexTrack } from "@/lib/api";
import { createLogger } from "@/shared/logging/logger";
import type { PlayerType } from "./stream";

const logger = createLogger("PlayerTracks");

/** A selectable audio or subtitle track, normalised for the picker. */
export interface MediaTrack {
  /** Index the player backend selects by. */
  index: number;
  kind: "audio" | "subtitle";
  /** What the viewer sees, e.g. "Português" or "Faixa 2". */
  label: string;
  language: string | null;
}

export type TrackListResult =
  /** Backend enumerated the file. May legitimately be a single track. */
  | { status: "ready"; tracks: MediaTrack[] }
  /** Not GIndex content — the backend has nothing to probe. */
  | { status: "unavailable" }
  /** Probe never finished within the budget, or the request failed. */
  | { status: "unknown" };

const TRACK_TYPES: Record<string, MediaTrack["kind"]> = {
  audio: "audio",
  subtitle: "subtitle",
};

/**
 * The backend answers 202 while a background `ffprobe` populates its cache, and
 * asks us to come back after `retry_after` seconds. Bound both the wait and the
 * number of attempts: a viewer staring at a spinner is worse than a picker that
 * quietly stays closed, and the upstream this probes can be rate limited for
 * hours at a time.
 */
const MAX_ATTEMPTS = 4;
const MAX_RETRY_DELAY_SECONDS = 8;

function labelFor(track: GindexTrack, position: number): string {
  const named = typeof track.title === "string" ? track.title.trim() : "";
  if (named) return named;
  const language = typeof track.language === "string" ? track.language.trim() : "";
  if (language) return language;
  return `Faixa ${position + 1}`;
}

function normalise(tracks: GindexTrack[]): MediaTrack[] {
  return tracks.flatMap((track, position) => {
    const kind = TRACK_TYPES[String(track.type ?? "").toLowerCase()];
    if (!kind) return [];
    if (!Number.isInteger(track.index)) return [];
    return [
      {
        index: track.index,
        kind,
        label: labelFor(track, position),
        language: typeof track.language === "string" ? track.language : null,
      },
    ];
  });
}

function sleep(seconds: number): Promise<void> {
  const bounded = Math.min(Math.max(seconds, 1), MAX_RETRY_DELAY_SECONDS);
  return new Promise(resolve => setTimeout(resolve, bounded * 1000));
}

/** GIndex titles only; anything else resolves to `unavailable`. */
export async function fetchMediaTracks(type: PlayerType, id: string | number): Promise<TrackListResult> {
  if (type === "channel") return { status: "unavailable" };
  const probeType = type === "series" ? "episode" : "movie";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await api.getGindexTracks(probeType, id);

      if (Array.isArray(response)) {
        return { status: "ready", tracks: normalise(response) };
      }

      // 202: probe scheduled server-side, come back after retry_after.
      await sleep(response.retry_after);
    } catch (error) {
      // The backend answers 404 `tracks_not_available` for non-GIndex content,
      // which is an answer rather than a failure — the picker just stays shut.
      if (error instanceof ApiError && error.status === 404) {
        return { status: "unavailable" };
      }
      logger.warn("Could not read media tracks", error);
      return { status: "unknown" };
    }
  }

  logger.debug("Track probe still running after the attempt budget", { type, id });
  return { status: "unknown" };
}

/** Group a flat list into the two pickers the UI offers. */
export function splitByKind(tracks: MediaTrack[]): { audio: MediaTrack[]; subtitle: MediaTrack[] } {
  return {
    audio: tracks.filter(track => track.kind === "audio"),
    subtitle: tracks.filter(track => track.kind === "subtitle"),
  };
}

/** Only worth showing a control when there is a real choice to make. */
export function hasSelectableTracks(tracks: MediaTrack[]): boolean {
  const { audio, subtitle } = splitByKind(tracks);
  return audio.length > 1 || subtitle.length > 0;
}
