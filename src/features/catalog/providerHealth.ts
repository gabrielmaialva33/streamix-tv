import { createResource, onCleanup, onMount, type Accessor } from "solid-js";
import api, { type ProviderHealthResponse, type ProviderHealthStatus } from "@/lib/api";
import { createLogger } from "@/shared/logging/logger";

const logger = createLogger("ProviderHealth");
const POLL_INTERVAL_MS = 60_000;

/** The combined catalog remains usable while at least one provider is healthy. */
export function combinedProviderHealthStatus(
  health?: ProviderHealthResponse | null,
): ProviderHealthStatus | undefined {
  if (!health) return undefined;
  const active = health.providers.filter(provider => provider.is_active);
  const hasHealthy = active.some(provider => provider.status === "healthy");
  const hasProblem = active.some(
    provider => provider.status === "degraded" || provider.status === "unhealthy",
  );
  if (hasHealthy) return hasProblem ? "degraded" : "healthy";
  if (active.some(provider => provider.status === "degraded")) return "degraded";
  if (active.some(provider => provider.status === "unhealthy")) return "unhealthy";
  return health.overall.status;
}

/** One shared poller feeds both the catalog rail and the global outage banner. */
export function createProviderHealthPolling(): Accessor<ProviderHealthResponse | null> {
  const [health, { refetch }] = createResource(async () => {
    try {
      return await api.getProviderStatus();
    } catch (error) {
      logger.warn("Could not refresh provider health", error);
      return null;
    }
  });

  onMount(() => {
    const interval = window.setInterval(() => void refetch(), POLL_INTERVAL_MS);
    onCleanup(() => clearInterval(interval));
  });

  return () => health.latest ?? null;
}
