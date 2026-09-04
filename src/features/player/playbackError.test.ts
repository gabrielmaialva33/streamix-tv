import { describe, expect, it } from "vitest";
import {
  FALLBACK_MESSAGES,
  GENERIC_FALLBACK,
  GENERIC_REFUSAL,
  playbackErrorMessage,
  REFUSAL_MESSAGES,
} from "./playbackError";

describe("playbackErrorMessage", () => {
  it("turns AVPlay connection details into user-facing copy", () => {
    expect(playbackErrorMessage("Prepare error: PLAYER_ERROR_CONNECTION_FAILED")).toBe(
      "O servidor deste conteúdo não respondeu como esperado. Tente novamente.",
    );
  });

  it("distinguishes timeout and unsupported formats", () => {
    expect(playbackErrorMessage("PLAYER_ERROR_CONNECTION_TIMEOUT")).toContain("demorou demais");
    expect(playbackErrorMessage("PLAYER_ERROR_NOT_SUPPORTED_FILE")).toContain("não é compatível");
  });

  it("does not expose unknown implementation details", () => {
    expect(playbackErrorMessage("opaque-internal-player-detail")).toBe(
      "A reprodução falhou. Tente novamente em instantes.",
    );
  });
});

describe("authored messages survive the mapper", () => {
  // Regression: PlayerPage renders every error through playbackErrorMessage, so
  // the copy the backends write for the viewer used to be replaced by the
  // generic fallback — the whole FALLBACK_MESSAGES catalog never reached a TV.
  it("passes through every fallback-category message unchanged", () => {
    for (const message of Object.values(FALLBACK_MESSAGES)) {
      expect(playbackErrorMessage(message)).toBe(message);
    }
  });

  it("passes through every refusal message unchanged", () => {
    for (const message of Object.values(REFUSAL_MESSAGES)) {
      expect(playbackErrorMessage(message)).toBe(message);
    }
  });

  it("passes through the generic authored messages unchanged", () => {
    expect(playbackErrorMessage(GENERIC_REFUSAL)).toBe(GENERIC_REFUSAL);
    expect(playbackErrorMessage(GENERIC_FALLBACK)).toBe(GENERIC_FALLBACK);
  });

  it("still maps raw technical errors", () => {
    expect(playbackErrorMessage("PLAYER_ERROR_CONNECTION_FAILED")).not.toBe("PLAYER_ERROR_CONNECTION_FAILED");
    expect(playbackErrorMessage("PLAYER_ERROR_NOT_SUPPORTED")).toMatch(/não é compatível/);
  });
});
