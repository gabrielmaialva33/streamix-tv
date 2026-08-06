const CONNECTION_ERROR_PATTERN =
  /PLAYER_ERROR_CONNECTION_FAILED|connection|network|failed to fetch|stream proxy|resolve failed/i;
const TIMEOUT_ERROR_PATTERN = /timeout|timed out|PLAYER_ERROR_CONNECTION_TIMEOUT/i;
const FORMAT_ERROR_PATTERN = /not supported|unsupported|codec|format|PLAYER_ERROR_NOT_SUPPORTED/i;
const SOURCE_ERROR_PATTERN = /no stream url|source.*unavailable|404|not found/i;

/** Keep backend/AVPlay details in logs while presenting useful TV copy. */
export function playbackErrorMessage(error?: string | null): string {
  if (!error) return "A reprodução falhou. Tente novamente em instantes.";
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
