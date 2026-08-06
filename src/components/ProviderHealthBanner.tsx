import { Text, View } from "@solidtv/solid";
import { Show } from "solid-js";
import { type ProviderHealthResponse, type ProviderHealthStatus } from "@/lib/api";
import { SCREEN_WIDTH } from "@/shared/layout";
import { theme } from "@/styles";

const BANNER_WIDTH = 720;

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

  return (
    <Show when={notice()}>
      {current => (
        <View
          x={SCREEN_WIDTH - BANNER_WIDTH - 20}
          y={20}
          width={BANNER_WIDTH}
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
            width={BANNER_WIDTH - 40}
            fontSize={18}
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
