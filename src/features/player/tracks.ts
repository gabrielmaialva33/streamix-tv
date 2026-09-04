import api, { ApiError, type GindexTrack, type GindexTracks } from "@/lib/api";
import { createLogger } from "@/shared/logging/logger";
import type { PlayerType } from "./stream";

const logger = createLogger("PlayerTracks");

/** A selectable audio or subtitle track, normalised for the picker. */
export interface MediaTrack {
  /** Stream index inside the container — what the player selects by. */
  index: number;
  kind: "audio" | "subtitle";
  /** What the viewer sees, e.g. "Português 5.1". */
  label: string;
  language: string | null;
  /** The track the container marks as default, preselected on open. */
  isDefault: boolean;
}

export type TrackListResult =
  /** Backend enumerated the file. May legitimately be a single track. */
  | { status: "ready"; tracks: MediaTrack[] }
  /** Not GIndex content — the backend has nothing to probe. */
  | { status: "unavailable" }
  /** Probe still running, or the request failed. */
  | { status: "unknown" };

/**
 * ISO-639-2 is what the container declares, and it is not something to show a
 * viewer. Only the languages this catalog actually carries are worth naming;
 * anything else falls back to the raw code so an unmapped track is still
 * distinguishable rather than becoming an anonymous "Faixa 2".
 */
const LANGUAGE_NAMES: Record<string, string> = {
  por: "Português",
  pob: "Português (BR)",
  eng: "Inglês",
  spa: "Espanhol",
  jpn: "Japonês",
  fre: "Francês",
  fra: "Francês",
  ger: "Alemão",
  deu: "Alemão",
  ita: "Italiano",
  kor: "Coreano",
  chi: "Chinês",
  zho: "Chinês",
  rus: "Russo",
};

const CHANNEL_LAYOUTS: Record<number, string> = {
  1: "Mono",
  2: "2.0",
  6: "5.1",
  8: "7.1",
};

/**
 * Release groups stuff their own branding into the track title, so a title is
 * only worth showing when the container declared no usable language.
 */
function looksLikeBranding(title: string): boolean {
  return /www\.|\.com|\.net|\.org|torrent|bludv|comando/i.test(title);
}

function labelFor(track: GindexTrack, kind: MediaTrack["kind"], position: number): string {
  const language = (track.language ?? "").trim().toLowerCase();
  const named = LANGUAGE_NAMES[language] ?? (language && language !== "und" ? language.toUpperCase() : "");
  const title = (track.title ?? "").trim();

  const base = named || (title && !looksLikeBranding(title) ? title : "") || `Faixa ${position + 1}`;

  if (kind === "audio" && typeof track.channels === "number") {
    const layout = CHANNEL_LAYOUTS[track.channels];
    if (layout) return `${base} · ${layout}`;
  }
  if (track.forced) return `${base} (forçada)`;
  return base;
}

function normaliseKind(entries: GindexTrack[] | undefined, kind: MediaTrack["kind"]): MediaTrack[] {
  return (entries ?? []).flatMap((track, position) => {
    if (!Number.isInteger(track.index)) return [];
    return [
      {
        index: track.index,
        kind,
        label: labelFor(track, kind, position),
        language: typeof track.language === "string" ? track.language : null,
        isDefault: track.default === true,
      },
    ];
  });
}

function normalise(payload: GindexTracks): MediaTrack[] {
  return [...normaliseKind(payload.audio, "audio"), ...normaliseKind(payload.subtitle, "subtitle")];
}

/**
 * The backend answers 202 while a background `ffprobe` populates its cache. The
 * probe often outlasts the `retry_after` it suggests — the GIndex upstream can
 * be rate limited for hours — so this waits only briefly and then gives up.
 *
 * Giving up is the right outcome, not a failure: the request itself scheduled
 * the probe, so a later visit finds it cached. Playback continues on the
 * container's default track and the picker simply stays hidden meanwhile.
 */
const MAX_ATTEMPTS = 4;
const MAX_RETRY_DELAY_SECONDS = 8;

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

      if ("status" in response && response.status === "probing") {
        await sleep(response.retry_after);
        continue;
      }

      return { status: "ready", tracks: normalise(response as GindexTracks) };
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

/** The track the container marks as default, which is what starts playing. */
export function defaultTrackIndex(tracks: MediaTrack[], kind: MediaTrack["kind"]): number | null {
  const candidates = tracks.filter(track => track.kind === kind);
  return candidates.find(track => track.isDefault)?.index ?? candidates[0]?.index ?? null;
}
