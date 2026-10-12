import { describe, expect, it } from "vitest";
import type { ProviderHealthResponse } from "@/lib/api";
import { providerHealthNotice } from "./ProviderHealthBanner";

const report = (statuses: Array<[string, "healthy" | "degraded" | "unhealthy" | "unknown"]>) =>
  ({
    overall: { status: "unhealthy", counts: {} },
    providers: statuses.map(([name, status], index) => ({
      id: index + 1,
      name,
      provider_type: "xtream",
      visibility: "public",
      is_active: true,
      status,
      circuit_state: null,
      last_error_at: null,
      last_success_at: null,
      error_count: 0,
      dimensions: {},
      capabilities: null,
      capacity: {},
      message: "",
    })),
  }) satisfies ProviderHealthResponse;

describe("provider health notice", () => {
  it("presents a partial outage as degraded when another provider is healthy", () => {
    expect(
      providerHealthNotice(
        report([
          ["Streamix Global", "unhealthy"],
          ["Streamix Fallback", "healthy"],
        ]),
      ),
    ).toEqual({
      // Counts, not backend product names, and the reassurance leads: the
      // banner is one line wide and truncation used to eat the second half.
      status: "degraded",
      message: "Parte do catálogo está fora do ar (1 de 2 fontes). O resto funciona normalmente.",
    });
  });

  it("keeps a full outage red", () => {
    expect(providerHealthNotice(report([["Streamix Global", "unhealthy"]]))).toEqual({
      status: "unhealthy",
      message: "Nenhum provedor de conteúdo está disponível no momento.",
    });
  });
});
