import { Text, View } from "@solidtv/solid";
import { createResource, onCleanup, onMount, Show } from "solid-js";
import api, { type ProviderHealthResponse, type ProviderHealthStatus } from "@/lib/api";
import { CONTENT_WIDTH, SIDEBAR_WIDTH } from "@/shared/layout";
import { createLogger } from "@/shared/logging/logger";
import { theme } from "@/styles";

const logger = createLogger("ProviderHealthBanner");
const POLL_INTERVAL_MS = 60_000;

interface ProviderHealthNotice {
  status: Extract<ProviderHealthStatus, "degraded" | "unhealthy">;
  message: string;
}

function affectedProviderLabel(providers: ProviderHealthResponse["providers"]): string {
  const names = providers.map(provider => provider.name);
  if (names.length <= 2) return names.join(" e ");
  return `${names.slice(0, 2).join(", ")} e mais ${names.length - 2}`;
}

export function providerHealthNotice(health?: ProviderHealthResponse | null): ProviderHealthNotice | null {
  if (!health) return null;

  const unhealthy = health.providers.filter(provider => provider.status === "unhealthy");
  const degraded = health.providers.filter(provider => provider.status === "degraded");
  const hasHealthyProvider = health.providers.some(provider => provider.status === "healthy");

  if (unhealthy.length > 0 && hasHealthyProvider) {
    const label = affectedProviderLabel(unhealthy);
    const verb = unhealthy.length === 1 ? "está indisponível" : "estão indisponíveis";
    return {
      status: "degraded",
      message: `${label} ${verb}; outros provedores continuam disponíveis.`,
    };
  }

  if (unhealthy.length > 0 || health.overall.status === "unhealthy") {
    return {
      status: "unhealthy",
      message: "Nenhum provedor de conteúdo está disponível no momento.",
    };
  }

  if (degraded.length > 0) {
    const label = affectedProviderLabel(degraded);
    const verb = degraded.length === 1 ? "está instável" : "estão instáveis";
    return { status: "degraded", message: `${label} ${verb}; alguns itens podem falhar.` };
  }

  if (health.overall.status === "degraded") {
    return {
      status: "degraded",
      message: "Alguns provedores estão instáveis; parte do catálogo pode falhar.",
    };
  }

  return null;
}

const ProviderHealthBanner = () => {
  const [health, { refetch }] = createResource(async () => {
    try {
      return await api.getProviderStatus();
    } catch (error) {
      logger.warn("Could not refresh provider health", error);
      return null;
    }
  });

  const notice = () => providerHealthNotice(health.latest);

  onMount(() => {
    const interval = window.setInterval(() => void refetch(), POLL_INTERVAL_MS);
    onCleanup(() => clearInterval(interval));
  });

  return (
    <Show when={notice()}>
      {current => (
        <View
          x={SIDEBAR_WIDTH + 250}
          y={20}
          width={CONTENT_WIDTH - 500}
          height={48}
          color={current().status === "unhealthy" ? 0x5c161bf2 : 0x54420df2}
          borderRadius={10}
          border={{ color: current().status === "unhealthy" ? theme.primaryLight : theme.warning, width: 2 }}
          zIndex={900}
          skipFocus
        >
          <Text
            x={20}
            y={13}
            width={CONTENT_WIDTH - 540}
            fontSize={19}
            fontWeight={700}
            color={theme.textPrimary}
            contain="width"
            maxLines={1}
            textAlign="center"
          >
            {current().message}
          </Text>
        </View>
      )}
    </Show>
  );
};

export default ProviderHealthBanner;
