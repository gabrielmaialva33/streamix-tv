import { Text, View } from "@solidtv/solid";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { type ProviderHealthResponse, type ProviderHealthStatus } from "@/lib/api";
import { SCREEN_WIDTH } from "@/shared/layout";
import { theme } from "@/styles";

const BANNER_WIDTH = 720;

interface ProviderHealthNotice {
  status: Extract<ProviderHealthStatus, "degraded" | "unhealthy">;
  message: string;
}

/**
 * Counts, not names. "Streamix Fallback" and "Embedplay" are backend
 * identifiers; to the viewer they are words that have never appeared anywhere
 * else in the app, and reading two unknown names fail reads as "the app is
 * broken" even when the catalogue is working.
 */
function affectedCount(count: number, total: number): string {
  return total > 0 ? `${count} de ${total} fontes` : `${count} fontes`;
}

export function providerHealthNotice(health?: ProviderHealthResponse | null): ProviderHealthNotice | null {
  // A 200 with a missing `providers` array is a real shape this endpoint has
  // returned; without this the filter below throws inside a reactive getter.
  if (!health || !Array.isArray(health.providers)) return null;

  const unhealthy = health.providers.filter(provider => provider.status === "unhealthy");
  const degraded = health.providers.filter(provider => provider.status === "degraded");
  const hasHealthyProvider = health.providers.some(provider => provider.status === "healthy");

  if (unhealthy.length > 0 && hasHealthyProvider) {
    // The reassuring half goes first: truncation used to cut it off, so all the
    // viewer ever read was the alarm.
    return {
      status: "degraded",
      message: `Parte do catálogo está fora do ar (${affectedCount(unhealthy.length, health.providers.length)}). O resto funciona normalmente.`,
    };
  }

  if (unhealthy.length > 0 || health.overall?.status === "unhealthy") {
    return {
      status: "unhealthy",
      message: "Nenhum provedor de conteúdo está disponível no momento.",
    };
  }

  if (degraded.length > 0) {
    return {
      status: "degraded",
      message: `Parte do catálogo está instável (${affectedCount(degraded.length, health.providers.length)}). Alguns títulos podem falhar.`,
    };
  }

  if (health.overall?.status === "degraded") {
    return {
      status: "degraded",
      message: "Alguns provedores estão instáveis; parte do catálogo pode falhar.",
    };
  }

  return null;
}

interface ProviderHealthBannerProps {
  health?: ProviderHealthResponse | null;
  /** Catalog pages already expose partial failures beside each provider. */
  suppressDegraded?: boolean;
}

const ProviderHealthBanner = (props: ProviderHealthBannerProps) => {
  const notice = () => {
    const current = providerHealthNotice(props.health);
    if (props.suppressDegraded && current?.status === "degraded") return null;
    return current;
  };

  // Informative, not actionable: there is nothing the viewer can do about a
  // provider being down, so it announces itself and leaves. As a permanent
  // fixture it read as a standing alarm on every screen, and it sat on top of
  // real UI — in Favoritos it covered the account pill and the item count
  // outright.
  const [dismissed, setDismissed] = createSignal(false);
  createEffect(() => {
    if (!notice()) return;
    setDismissed(false);
    const timer = setTimeout(() => setDismissed(true), 9000);
    onCleanup(() => clearTimeout(timer));
  });

  return (
    <Show when={notice() && !dismissed()}>
      <View
        x={SCREEN_WIDTH - BANNER_WIDTH - 20}
        y={20}
        width={BANNER_WIDTH}
        height={76}
        color={notice()?.status === "unhealthy" ? 0x5c161bf2 : 0x54420df2}
        borderRadius={10}
        border={{ color: notice()?.status === "unhealthy" ? theme.primaryLight : theme.warning, width: 2 }}
        zIndex={900}
        skipFocus
      >
        {/* Two lines: an error message truncated mid-sentence loses exactly
              the half that tells the viewer they can keep watching. */}
        <Text
          x={20}
          y={14}
          width={BANNER_WIDTH - 40}
          fontSize={18}
          fontWeight={700}
          color={theme.textPrimary}
          contain="width"
          maxLines={2}
          textAlign="center"
        >
          {notice()?.message ?? ""}
        </Text>
      </View>
    </Show>
  );
};

export default ProviderHealthBanner;
