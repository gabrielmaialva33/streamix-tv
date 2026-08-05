/**
 * Local Storage Service for Streamix TV App
 * Handles favorites, watch history, and user preferences
 */

import type { AuthUser } from "./api";
import { createLogger } from "@/shared/logging/logger";

const logger = createLogger("Storage");

const STORAGE_KEYS = {
  FAVORITES: "streamix_favorites",
  HISTORY: "streamix_history",
  PREFERENCES: "streamix_preferences",
  AUTH_SESSION: "streamix_auth_session",
} as const;

// Types
export interface FavoriteItem {
  id: string | number;
  type: "movie" | "series" | "channel";
  title: string;
  posterUrl?: string;
  addedAt: number;
}

export interface HistoryItem {
  id: string | number;
  type: "movie" | "series" | "channel";
  title: string;
  posterUrl?: string;
  progress: number; // 0-100 percentage
  currentTime: number; // seconds
  duration: number; // seconds
  watchedAt: number;
  // For series — `id` mirrors the episode id; `seriesId` points at the show.
  seriesId?: string;
  episodeId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
}

export interface UserPreferences {
  announcer: boolean;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

// Helper functions
function safeGetItem<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function safeSetItem(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    logger.error("Failed to persist value", e);
  }
}

// Favorites
export const favorites = {
  getAll(): FavoriteItem[] {
    return safeGetItem<FavoriteItem[]>(STORAGE_KEYS.FAVORITES, []);
  },

  add(item: Omit<FavoriteItem, "addedAt">): void {
    const items = this.getAll();
    const exists = items.find(f => String(f.id) === String(item.id) && f.type === item.type);
    if (!exists) {
      items.unshift({ ...item, addedAt: Date.now() });
      safeSetItem(STORAGE_KEYS.FAVORITES, items);
    }
  },

  remove(id: string | number, type: string): void {
    const items = this.getAll().filter(f => !(String(f.id) === String(id) && f.type === type));
    safeSetItem(STORAGE_KEYS.FAVORITES, items);
  },

  isFavorite(id: string | number, type: string): boolean {
    return this.getAll().some(f => String(f.id) === String(id) && f.type === type);
  },

  toggle(item: Omit<FavoriteItem, "addedAt">): boolean {
    if (this.isFavorite(item.id, item.type)) {
      this.remove(item.id, item.type);
      return false;
    } else {
      this.add(item);
      return true;
    }
  },

  replaceAll(items: FavoriteItem[]): void {
    safeSetItem(STORAGE_KEYS.FAVORITES, items);
  },
};

// Watch History
export const history = {
  getAll(): HistoryItem[] {
    return safeGetItem<HistoryItem[]>(STORAGE_KEYS.HISTORY, []);
  },

  getContinueWatching(limit = 10): HistoryItem[] {
    return this.getAll()
      .filter(h => h.progress < 95) // Not finished
      .sort((a, b) => b.watchedAt - a.watchedAt)
      .slice(0, limit);
  },

  update(item: Omit<HistoryItem, "watchedAt">): void {
    const items = this.getAll();
    const existingIndex = items.findIndex(
      h =>
        String(h.id) === String(item.id) &&
        h.type === item.type &&
        (item.type !== "series" || String(h.episodeId) === String(item.episodeId)),
    );

    const newItem: HistoryItem = { ...item, watchedAt: Date.now() };

    if (existingIndex >= 0) {
      items.splice(existingIndex, 1);
    }

    items.unshift(newItem);

    // Keep only last 100 items
    if (items.length > 100) {
      items.pop();
    }

    safeSetItem(STORAGE_KEYS.HISTORY, items);
  },

  getProgress(id: string | number, type: string, episodeId?: string): HistoryItem | undefined {
    return this.getAll().find(
      h =>
        String(h.id) === String(id) &&
        h.type === type &&
        (type !== "series" || String(h.episodeId) === String(episodeId)),
    );
  },

  mergeRemote(remoteItems: HistoryItem[]): void {
    const keyFor = (item: HistoryItem) =>
      `${item.type}:${String(item.id)}:${item.type === "series" ? String(item.episodeId ?? item.id) : ""}`;
    const merged = new Map(this.getAll().map(item => [keyFor(item), item]));

    for (const remote of remoteItems) {
      const key = keyFor(remote);
      const local = merged.get(key);
      if (!local || remote.watchedAt >= local.watchedAt) {
        merged.set(key, local ? { ...local, ...remote } : remote);
      }
    }

    safeSetItem(
      STORAGE_KEYS.HISTORY,
      [...merged.values()].sort((a, b) => b.watchedAt - a.watchedAt).slice(0, 100),
    );
  },
};

// User Preferences
export const preferences = {
  get(): UserPreferences {
    return safeGetItem<UserPreferences>(STORAGE_KEYS.PREFERENCES, {
      announcer: true,
    });
  },

  update(updates: Partial<UserPreferences>): void {
    const current = this.get();
    safeSetItem(STORAGE_KEYS.PREFERENCES, { ...current, ...updates });
  },
};

export const authSession = {
  get(): AuthSession | null {
    return safeGetItem<AuthSession | null>(STORAGE_KEYS.AUTH_SESSION, null);
  },

  getToken(): string | null {
    return this.get()?.token ?? null;
  },

  getUser(): AuthUser | null {
    return this.get()?.user ?? null;
  },

  save(session: AuthSession): void {
    safeSetItem(STORAGE_KEYS.AUTH_SESSION, session);
  },

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
    } catch (e) {
      logger.error("Failed to clear auth session", e);
    }
  },
};
