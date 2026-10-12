/**
 * The catalogue's titles are release names, and release names are not titles.
 *
 * Upstream sources name files the way their uploaders do — "10000 Anos Depois
 * 2017 1080p BluRay x264 DUAL", "1 Bordadeira [LEG]" — and the app was showing
 * that verbatim as the biggest text on the detail page and under every poster.
 * It reads like a pirate index rather than a catalogue. The year and the audio
 * version are already shown separately as metadata, so this only removes them
 * from the *name*.
 *
 * Conservative by design: a wrong cut turns a real title into a wrong one,
 * which is worse than leaving noise in. So it only cuts at a token that is
 * unambiguously technical, only strips a year when such a token followed it,
 * and returns the input untouched if cleaning would leave nothing.
 */

/** Tokens that only ever appear in release names, never in a real title. */
const RELEASE_TOKEN =
  /\b(?:BDRip|BRRip|BluRay|Blu-Ray|WEB-?DL|WEBRip|HDTV|HDRip|DVDRip|DVDScr|HDCAM|[0-9]{3,4}p|4K|UHD|HDR10?|DUAL|Dublado|Legendado|Nacional|x26[45]|H\.?26[45]|HEVC|AAC|AC3|DDP?5\.1|REPACK|PROPER|Hybrid|IMAX)\b/i;

/** Bracketed audio markers: [L], [LEG], [DUB], [Hybrid], [Dual Áudio]... */
const BRACKET_TAG = /\s*\[(?:L|LEG|LEGENDADO|DUB|DUBLADO|DUAL[^\]]*|NACIONAL|Hybrid|HD|4K)\]\s*/gi;

/** A trailing year, bare or in parentheses, left behind once the tail is gone. */
const TRAILING_YEAR = /[\s.\-_]*\(?(?:19|20)\d{2}\)?\s*$/;

export function displayTitle(raw: string | null | undefined): string {
  const original = (raw ?? "").trim();
  if (!original) return original;

  let title = original.replace(BRACKET_TAG, " ").trim();

  const token = RELEASE_TOKEN.exec(title);
  if (token && token.index > 0) {
    title = title.slice(0, token.index).trim();
    // The year sits just before the technical tail in a release name; once
    // that tail is cut, the year is metadata, not part of the name. Without a
    // tail it is left alone — "Blade Runner 2049", "Queria Você Aqui (2025)".
    title = title.replace(TRAILING_YEAR, "").trim();
  }

  title = title.replace(/[\s.\-_]+$/, "").trim();
  return title.length > 0 ? title : original;
}
