import { describe, expect, it } from "vitest";
import { playbackErrorMessage } from "./playbackError";

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
