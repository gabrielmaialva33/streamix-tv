import { createSignal } from "solid-js";
import api, { ApiError, type AuthResponse, type AuthUser, type FavoriteRecord } from "@/lib/api";
import { authSession, type FavoriteItem, favorites } from "@/lib/storage";
import { createLogger } from "@/shared/logging/logger";

export type AuthStatus = "checking" | "authenticated" | "anonymous";

const logger = createLogger("Auth");

const [status, setStatus] = createSignal<AuthStatus>(authSession.getToken() ? "checking" : "anonymous");
const [user, setUser] = createSignal<AuthUser | null>(authSession.getUser());
const [token, setToken] = createSignal<string | null>(authSession.getToken());

let initPromise: Promise<void> | null = null;

function toLocalFavoriteType(type: FavoriteRecord["content_type"]): FavoriteItem["type"] {
  switch (type) {
    case "live_channel":
      return "channel";
    case "series":
      return "series";
    default:
      return "movie";
  }
}

function toRemoteFavoriteType(type: FavoriteItem["type"]): FavoriteRecord["content_type"] {
  switch (type) {
    case "channel":
      return "live_channel";
    case "series":
      return "series";
    default:
      return "movie";
  }
}

function applySession(session: AuthResponse) {
  authSession.save(session);
  setToken(session.token);
  setUser(session.user);
}

async function syncFavoritesFromRemote() {
  if (!token()) {
    return;
  }

  try {
    const response = await api.getFavorites(undefined, token() ?? undefined);
    const nextItems: FavoriteItem[] = response.favorites.map(item => ({
      id: item.content_id,
      type: toLocalFavoriteType(item.content_type),
      title: item.content_name || "Untitled",
      posterUrl: item.content_icon,
      addedAt: item.created_at ? new Date(item.created_at).getTime() : Date.now(),
    }));
    favorites.replaceAll(nextItems);
  } catch (error) {
    logger.warn("Failed to sync remote favorites", error);
  }
}

function clearSession() {
  authSession.clear();
  setToken(null);
  setUser(null);
  setStatus("anonymous");
  api.clearCache();
}

export async function initializeAuth() {
  if (initPromise) {
    return initPromise;
  }

  // Already authenticated in this runtime — skip re-validation. Otherwise
  // remounts (LoginPage + RequireAuth + MainLayout) stack /auth/me calls
  // that hit rate limits right after a fresh login.
  if (status() === "authenticated" && token()) {
    return;
  }

  initPromise = (async () => {
    const session = authSession.get();
    if (!session?.token) {
      clearSession();
      return;
    }

    setStatus("checking");
    setToken(session.token);
    setUser(session.user);

    try {
      const response = await api.me(session.token);
      const nextSession = { token: session.token, user: response.user };
      authSession.save(nextSession);
      setUser(response.user);
      await syncFavoritesFromRemote();
      setStatus("authenticated");
    } catch (error) {
      // Only drop the stored session on real auth failures. Rate limits,
      // network blips and 5xx are transient — keep the optimistic session
      // so the user stays logged in.
      if (error instanceof ApiError && error.isUnauthorized()) {
        logger.warn("Stored session is no longer valid", error);
        clearSession();
      } else {
        logger.warn("Session validation deferred (transient)", error);
        setStatus("authenticated");
      }
    }
  })().finally(() => {
    initPromise = null;
  });

  return initPromise;
}

export async function signIn(email: string, password: string) {
  setStatus("checking");
  try {
    const response = await api.login({ email, password });
    applySession(response);
    await syncFavoritesFromRemote();
    setStatus("authenticated");
  } catch (error) {
    clearSession();
    throw error;
  }
}

export async function registerAccount(name: string, email: string, password: string) {
  setStatus("checking");
  try {
    const response = await api.register({ name, email, password });
    applySession(response);
    await syncFavoritesFromRemote();
    setStatus("authenticated");
  } catch (error) {
    clearSession();
    throw error;
  }
}

export async function signOut() {
  try {
    await api.logout(token() ?? undefined);
  } catch (error) {
    logger.warn("Logout request failed", error);
  } finally {
    clearSession();
  }
}

export async function persistFavoriteChange(item: Omit<FavoriteItem, "addedAt">, isFavorite: boolean) {
  if (!token()) {
    return;
  }

  const remoteType = toRemoteFavoriteType(item.type);
  if (isFavorite) {
    await api.addFavorite(remoteType, item.id, token() ?? undefined);
  } else {
    await api.removeFavorite(remoteType, item.id, token() ?? undefined);
  }
}

export const authState = {
  status,
  user,
  token,
  isAuthenticated: () => status() === "authenticated" && !!token(),
};
