/**
 * All user-facing playback copy lives here.
 *
 * The backends produce two kinds of error: a technical string from the video
 * element or AVPlay, and a message they have already written for the viewer
 * (the proxy told us why it refused). PlayerPage renders every error through
 * playbackErrorMessage, so a message that is already user-facing has to survive
 * that pass — otherwise it is silently replaced by the generic fallback, which
 * is what used to happen to every entry in these catalogs.
 */

/** Backend served a placeholder because the upstream source is unusable. */
export const FALLBACK_MESSAGES: Record<string, string> = {
  channel_unavailable: "Conteúdo indisponível no momento. Tente novamente em alguns instantes.",
  provider_unavailable: "Serviço de stream indisponível. Tente novamente em alguns instantes.",
  account_expired: "Sua assinatura expirou. Atualize na página de perfil para continuar.",
  stream_blocked: "Conteúdo bloqueado na sua região.",
  rate_limited: "Muitas requisições agora. Aguarde um momento e tente de novo.",
};

/** Proxy refused outright. Not transient, so the copy must not invite a retry. */
export const REFUSAL_MESSAGES: Record<string, string> = {
  torrent_playback_required: "Este título só reproduz pelo fluxo de torrent, ainda não disponível nesta TV.",
};

export const GENERIC_REFUSAL = "Este conteúdo não pode ser reproduzido nesta TV.";
export const GENERIC_FALLBACK = "Stream indisponível no momento";

const AUTHORED_MESSAGES: ReadonlySet<string> = new Set([
  ...Object.values(FALLBACK_MESSAGES),
  ...Object.values(REFUSAL_MESSAGES),
  GENERIC_REFUSAL,
  GENERIC_FALLBACK,
]);

const CONNECTION_ERROR_PATTERN =
  /PLAYER_ERROR_CONNECTION_FAILED|connection|network|failed to fetch|stream proxy|resolve failed/i;
const TIMEOUT_ERROR_PATTERN = /timeout|timed out|PLAYER_ERROR_CONNECTION_TIMEOUT/i;
const FORMAT_ERROR_PATTERN = /not supported|unsupported|codec|format|PLAYER_ERROR_NOT_SUPPORTED/i;
const SOURCE_ERROR_PATTERN = /no stream url|source.*unavailable|404|not found/i;

/** Keep backend/AVPlay details in logs while presenting useful TV copy. */
export function playbackErrorMessage(error?: string | null): string {
  if (!error) return "A reprodução falhou. Tente novamente em instantes.";
  // Already written for the viewer by the backend — pass it through untouched.
  if (AUTHORED_MESSAGES.has(error)) return error;
  if (TIMEOUT_ERROR_PATTERN.test(error)) {
    return "O servidor demorou demais para responder. Tente novamente.";
  }
  if (CONNECTION_ERROR_PATTERN.test(error)) {
    return "O servidor deste conteúdo não respondeu como esperado. Tente novamente.";
  }
  if (FORMAT_ERROR_PATTERN.test(error)) {
    return "Este formato de vídeo não é compatível com a sua TV.";
  }
  if (SOURCE_ERROR_PATTERN.test(error)) {
    return "Este conteúdo está temporariamente sem uma fonte de reprodução.";
  }
  return "A reprodução falhou. Tente novamente em instantes.";
}
