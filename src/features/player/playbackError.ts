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
/**
 * Every message names the next step the viewer can actually take on a remote.
 * Two rules learned from reading these out loud: no backend vocabulary
 * ("stream", "requisições", "fluxo de torrent" mean nothing on a sofa), and
 * never point at a screen that cannot solve the problem — `account_expired`
 * used to send people to Perfil, which offers only "Sair da conta".
 */
export const FALLBACK_MESSAGES: Record<string, string> = {
  channel_unavailable: "Este canal está fora do ar agora. Tente outro canal ou volte em alguns minutos.",
  provider_unavailable: "A fonte deste título está fora do ar. Troque de provedor na barra lateral.",
  account_expired: "Sua assinatura venceu. Renove no site ou no celular para voltar a assistir.",
  // No next step exists for this one, so it says so instead of implying a retry.
  stream_blocked: "Este título não está liberado na sua região. Escolha outro título.",
  rate_limited: "O servidor está ocupado. Espere alguns segundos e tente de novo.",
};

/** Proxy refused outright. Not transient, so the copy must not invite a retry. */
export const REFUSAL_MESSAGES: Record<string, string> = {
  torrent_playback_required: "Esta versão não roda nesta TV. Procure o mesmo título em outro provedor.",
};

export const GENERIC_REFUSAL = "Esta versão não roda nesta TV. Tente o mesmo título em outro provedor.";
export const GENERIC_FALLBACK = "Este título não está disponível agora. Tente outro provedor.";

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
  if (!error) return "Não conseguimos abrir o vídeo. Tente de novo ou troque de provedor.";
  // Already written for the viewer by the backend — pass it through untouched.
  if (AUTHORED_MESSAGES.has(error)) return error;
  if (TIMEOUT_ERROR_PATTERN.test(error)) {
    return "O servidor demorou demais para responder. Tente de novo.";
  }
  if (CONNECTION_ERROR_PATTERN.test(error)) {
    return "O servidor deste título não respondeu. Tente de novo ou troque de provedor.";
  }
  if (FORMAT_ERROR_PATTERN.test(error)) {
    return "Sua TV não reproduz este formato. Procure outra versão deste título em outro provedor.";
  }
  if (SOURCE_ERROR_PATTERN.test(error)) {
    return "Este título está sem fonte de reprodução agora. Tente outro provedor.";
  }
  return "Não conseguimos abrir o vídeo. Tente de novo ou troque de provedor.";
}
