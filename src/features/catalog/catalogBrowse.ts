import type { CatalogProviderContentType, CategoryFilter } from "@/lib/api";

export interface CatalogBrowseConfig {
  path: "/movies" | "/series" | "/channels";
  title: string;
  contentType: CatalogProviderContentType;
  categoryType: CategoryFilter;
  allCategoriesLabel: string;
}

export type CatalogSidebarMode = "navigation" | "catalog" | "providers";

const CATALOG_BROWSE_CONFIGS: Record<CatalogBrowseConfig["path"], CatalogBrowseConfig> = {
  "/movies": {
    path: "/movies",
    title: "Filmes",
    contentType: "movies",
    categoryType: "vod",
    allCategoriesLabel: "Todos",
  },
  "/series": {
    path: "/series",
    title: "Séries",
    contentType: "series",
    categoryType: "series",
    allCategoriesLabel: "Todas",
  },
  "/channels": {
    path: "/channels",
    title: "Canais",
    contentType: "channels",
    categoryType: "live",
    allCategoriesLabel: "Todos",
  },
};

/** Detail/player routes keep the compact global sidebar; only browse roots use the catalog rail. */
export function catalogBrowseConfigForPath(pathname: string): CatalogBrowseConfig | undefined {
  return CATALOG_BROWSE_CONFIGS[pathname as CatalogBrowseConfig["path"]];
}

/** Back drills out one sidebar level before allowing router history to run. */
export function catalogSidebarModeAfterBack(mode: CatalogSidebarMode): CatalogSidebarMode | undefined {
  if (mode === "providers") return "catalog";
  if (mode === "catalog") return "navigation";
  return undefined;
}

/** Keeps a focused item centered without ever leaving empty space at either edge. */
export function centeredWindowStart(index: number, itemCount: number, windowSize: number): number {
  if (itemCount <= windowSize || windowSize <= 0) return 0;
  const safeIndex = Math.min(Math.max(index, 0), itemCount - 1);
  const centered = safeIndex - Math.floor(windowSize / 2);
  return Math.min(Math.max(centered, 0), itemCount - windowSize);
}

/** A left press may leave a grid only from its visual first column. */
export function isGridRowStart(cursor: unknown, columns: number): cursor is number {
  return (
    typeof cursor === "number" &&
    Number.isInteger(cursor) &&
    cursor >= 0 &&
    columns > 0 &&
    cursor % columns === 0
  );
}
