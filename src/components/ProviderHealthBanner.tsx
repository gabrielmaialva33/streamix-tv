import { Text, View } from "@solidtv/solid";
import { createResource, onCleanup, onMount, Show } from "solid-js";
import api, { type ProviderHealthStatus } from "@/lib/api";
import { CONTENT_WIDTH, SIDEBAR_WIDTH } from "@/shared/layout";
import { createLogger } from "@/shared/logging/logger";
import { theme } from "@/styles";

const logger = createLogger("ProviderHealthBanner");
const POLL_INTERVAL_MS = 60_000;

const ProviderHealthBanner = () => {
  const [health, { refetch }] = createResource(async () => {
    try {
      return await api.getProviderStatus();
    } catch (error) {
      logger.warn("Could not refresh provider health", error);
      return null;
    }
  });

  const visibleStatus = (): ProviderHealthStatus | null => {
    const status = health.latest?.overall.status;
    return status === "degraded" || status === "unhealthy" ? status : null;
  };

  const message = () => {
    const status = visibleStatus();
    if (!status) return "";
    const provider = health.latest?.providers.find(item => item.status === status);
    if (provider?.message) return provider.message;
    return status === "unhealthy"
      ? "O provedor de conteúdo está indisponível no momento."
      : "O provedor de conteúdo está instável; alguns itens podem falhar.";
  };

  onMount(() => {
    const interval = window.setInterval(() => void refetch(), POLL_INTERVAL_MS);
    onCleanup(() => clearInterval(interval));
  });

  return (
    <Show when={visibleStatus()}>
      {status => (
        <View
          x={SIDEBAR_WIDTH + 250}
          y={20}
          width={CONTENT_WIDTH - 500}
          height={48}
          color={status() === "unhealthy" ? 0x5c161bf2 : 0x54420df2}
          borderRadius={10}
          border={{ color: status() === "unhealthy" ? theme.primaryLight : theme.warning, width: 2 }}
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
            {message()}
          </Text>
        </View>
      )}
    </Show>
  );
};

export default ProviderHealthBanner;
