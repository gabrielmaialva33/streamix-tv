import api, { ApiError } from "@/lib/api";
import { createLogger } from "@/shared/logging/logger";

const logger = createLogger("PlaybackSources");

/**
 * One place a title can be played from.
 *
 * The same film usually exists in several providers as separate catalogue
 * entries, each with its own id — a GIndex release, an IPTV copy, an embed.
 * They differ in what the viewer actually cares about (dubbed or subtitled,
 * 4K or 720p, which provider is up right now), and the web app already lets
 * the viewer choose. These are those entries, in the order the backend would
 * try them.
 */
export interface PlaybackSource {
  /** The content id to play: /player/movie/:id plays exactly this copy. */
  id: number;
  providerId: number | null;
  providerName: string;
  providerStatus: ProviderStatus;
  /** Raw release name — noise as a title, but it is what tells copies apart. */
  rawTitle: string;
  badges: string[];
  recommended: boolean;
  current: boolean;
  /** Series copies only: what this provider's entry of the show actually has. */
  seasonCount: number | null;
  episodeCount: number | null;
}

export type SourceKind = "movie" | "episode" | "series";

export type ProviderStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

export type SourceListResult =
  | { status: "ready"; sources: PlaybackSource[] }
  /** The endpoint does not exist on this backend yet: behave exactly as before. */
  | { status: "unavailable" }
  | { status: "error" };

interface RawSource {
  id?: number;
  provider_id?: number | null;
  provider_name?: string | null;
  provider_status?: string | null;
  title?: string | null;
  name?: string | null;
  container_extension?: string | null;
  badges?: string[] | null;
  recommended?: boolean | null;
  current?: boolean | null;
  season_count?: number | null;
  episode_count?: number | null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

const STATUSES: ReadonlySet<string> = new Set(["healthy", "degraded", "unhealthy", "unknown"]);

// Letters and digits that make a match part of a longer word: "4Kids" is not
// 4K, "Legendary" is not "legendado". Latin-1 is spelled out instead of
// \p{L}, which the legacy bundle for older TV engines cannot rely on.
const WORD_CHAR = "0-9A-Za-zÀ-ÖØ-öø-ÿ";

function hasWord(text: string, pattern: string): boolean {
  return new RegExp(`(?:^|[^${WORD_CHAR}])(?:${pattern})(?=$|[^${WORD_CHAR}])`, "i").test(text);
}

/**
 * The version badges the web app shows, for when the server sends none.
 *
 * The server owns this rule (`StreamixWeb.Content.SourceBadges`, shared with the
 * web pages), and this mirrors it exactly so the two never disagree about what
 * a copy is: whole words only, case-insensitive, read from name and title.
 * Order: container, resolution, HDR, audio.
 *
 * - container: the extension, except m3u8 and txt, which tell a viewer nothing
 * - resolution: only the highest — 4K (2160p, 4k, uhd), else 1080p, else 720p
 * - HDR: hdr, hdr10, hdr10+
 * - audio: "dual" alone gives DUAL; otherwise LEG ([L], [LEG], [LEGENDADO],
 *   legendado/a/s) and DUB ([D], [DUB], [DUBLADO], dublado/a/s), both if both
 */
export function versionBadges(text: string, containerExtension?: string | null): string[] {
  const badges: string[] = [];

  const ext = (containerExtension ?? "").trim().toUpperCase();
  if (ext && ext !== "M3U8" && ext !== "TXT") badges.push(ext);

  if (hasWord(text, "2160p|4k|uhd")) badges.push("4K");
  else if (hasWord(text, "1080p")) badges.push("1080p");
  else if (hasWord(text, "720p")) badges.push("720p");

  if (hasWord(text, "hdr|hdr10")) badges.push("HDR");

  if (hasWord(text, "dual")) {
    badges.push("DUAL");
  } else {
    if (/\[(l|leg|legendado)\]/i.test(text) || hasWord(text, "legendad[oa]s?")) badges.push("LEG");
    if (/\[(d|dub|dublado)\]/i.test(text) || hasWord(text, "dublad[oa]s?")) badges.push("DUB");
  }

  return badges;
}

function normalise(raw: RawSource): PlaybackSource | null {
  if (typeof raw.id !== "number" || !Number.isFinite(raw.id)) return null;
  const rawTitle = (raw.title || raw.name || "").trim();
  const status = (raw.provider_status ?? "unknown").toLowerCase();
  return {
    id: raw.id,
    providerId: typeof raw.provider_id === "number" ? raw.provider_id : null,
    providerName: (raw.provider_name ?? "").trim() || "Provedor",
    providerStatus: (STATUSES.has(status) ? status : "unknown") as ProviderStatus,
    rawTitle,
    badges:
      Array.isArray(raw.badges) && raw.badges.length > 0
        ? raw.badges.filter((badge): badge is string => typeof badge === "string" && badge.length > 0)
        : versionBadges(`${raw.name ?? ""} ${raw.title ?? ""}`, raw.container_extension),
    recommended: raw.recommended === true,
    current: raw.current === true,
    seasonCount: count(raw.season_count),
    episodeCount: count(raw.episode_count),
  };
}

/**
 * The backend's order is the recommendation, so it is kept — with one
 * exception: a provider that is down goes last. Offering it first would make
 * the viewer's first choice the one most likely to fail.
 *
 * The order is otherwise left alone even where it looks wrong: the server
 * ranks by playback signals, and may put a "healthy" provider below an
 * "unknown" one on purpose. Only "unhealthy" means "try the next one".
 *
 * The server only lists a provider that is down when it is the copy that was
 * asked for, because /stream still signs it. Such a copy can never keep the
 * RECOMENDADA label while it sits at the end of the row; the label moves to
 * the first copy that is up.
 */
function rank(sources: PlaybackSource[]): PlaybackSource[] {
  const usable = sources.filter(source => source.providerStatus !== "unhealthy");
  const down = sources.filter(source => source.providerStatus === "unhealthy");
  if (usable.length === 0) {
    return down.some(source => source.recommended)
      ? down
      : down.map((source, index) => (index === 0 ? { ...source, recommended: true } : source));
  }
  const recommendedId = usable.find(source => source.recommended)?.id ?? usable[0].id;
  return [...usable, ...down].map(source => {
    const recommended = source.id === recommendedId;
    return source.recommended === recommended ? source : { ...source, recommended };
  });
}

export async function fetchPlaybackSources(type: SourceKind, id: string | number): Promise<SourceListResult> {
  try {
    const raw = await api.getPlaybackSources(type, id);
    const sources = raw.flatMap(entry => {
      const source = normalise(entry as RawSource);
      return source ? [source] : [];
    });
    return { status: "ready", sources: rank(sources) };
  } catch (error) {
    // 404 means this backend has no sources endpoint yet, or that the title is
    // not visible to it; 400 that the id is malformed. Those are answers, not
    // failures: the detail page keeps its single Play button.
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      return { status: "unavailable" };
    }
    logger.warn("Could not list playback sources", error);
    return { status: "error" };
  }
}

/**
 * A choice exists when the list holds any copy other than the one on screen.
 *
 * Usually that means more than one entry, but a series list can leave out the
 * copy that was asked for — one copy per provider, and another copy from the
 * same provider may outrank it, or it may have no playable episode — so a
 * single entry that is not this page is still somewhere else to go.
 */
export function hasSourceChoice(result: SourceListResult, currentId: string | number): boolean {
  if (result.status !== "ready") return false;
  return result.sources.some(source => String(source.id) !== String(currentId));
}

/**
 * The copy the main Play button should start instead of the one on screen.
 *
 * A search can land the viewer on a copy whose provider is down — the server
 * still lists it, marked "unhealthy", because /stream still signs it. Playing
 * it anyway means a spinner and an error screen; the backend's own advice is
 * to treat "unhealthy" as "try the next one", so Play does exactly that.
 *
 * Only when there is no saved position on the copy on screen: "Continuar"
 * promises that position, and it lives under that copy's id.
 */
export function fallbackSource(
  result: SourceListResult | undefined,
  currentId: string | number,
): PlaybackSource | null {
  if (!result || result.status !== "ready") return null;
  const current = result.sources.find(source => String(source.id) === String(currentId));
  if (!current || current.providerStatus !== "unhealthy") return null;
  return result.sources.find(source => source.providerStatus !== "unhealthy") ?? null;
}

/**
 * What tells this copy apart, as one line: the version badges, and for a
 * series how much of the show this provider has — one copy may stop two
 * seasons short of another.
 */
export function sourceDetails(source: PlaybackSource): string {
  const episodes =
    source.episodeCount === null
      ? null
      : `${source.episodeCount} ${source.episodeCount === 1 ? "episódio" : "episódios"}`;
  const seasons =
    source.seasonCount === null
      ? null
      : `${source.seasonCount} ${source.seasonCount === 1 ? "temporada" : "temporadas"}`;
  // Badges first; the season count only when there is room for it.
  const parts = source.badges.length > 0 ? [...source.badges, episodes] : [seasons, episodes];
  return parts.filter((part): part is string => Boolean(part)).join("  ·  ");
}

/** The words of a release name, compared without case. */
function nameWords(rawTitle: string): string[] {
  return rawTitle.split(/\s+/).filter(Boolean);
}

/**
 * The details line of every card, with copies that would still read the same
 * told apart by what actually differs between them.
 *
 * One provider often holds several copies of a title. When badges do not
 * separate two of them, their release names usually do — a year, an edition,
 * a tag the badges do not cover — so the words only that copy's name has are
 * added to its line. Only when the names say nothing either is the copy
 * numbered: "cópia 2" is the last resort, never a substitute for the difference.
 */
export function distinctDetails(sources: PlaybackSource[]): string[] {
  const details = sources.map(sourceDetails);
  const groups = new Map<string, number[]>();
  sources.forEach((source, index) => {
    const key = JSON.stringify([source.providerName, details[index]]);
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });

  const join = (...parts: string[]) => parts.filter(Boolean).join("  ·  ");
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const names = members.map(index => nameWords(sources[index].rawTitle));
    const shared = (word: string) =>
      names.every(words => words.some(other => other.toLowerCase() === word.toLowerCase()));
    const extras = names.map(words => words.filter(word => !shared(word)).join(" "));
    const used = new Set<string>();
    members.forEach((index, position) => {
      const extra = extras[position];
      if (extra && !used.has(extra.toLowerCase())) {
        used.add(extra.toLowerCase());
        details[index] = join(details[index], extra);
      } else if (position > 0) {
        details[index] = join(details[index], `cópia ${position + 1}`);
      }
    });
  }
  return details;
}
