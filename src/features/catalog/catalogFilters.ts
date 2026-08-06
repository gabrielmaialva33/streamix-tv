import { useSearchParams } from "@solidjs/router";
import { createEffect } from "solid-js";

interface CatalogBrowseSearchParams extends Record<string, string | string[] | undefined> {
  provider?: string;
  category?: string;
}

export function parsePositiveCatalogId(value: string | string[] | null | undefined): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

export function catalogRouteWithProvider(path: string, providerId?: number): string {
  return providerId === undefined ? path : `${path}?provider=${providerId}`;
}

/** Keeps provider/category filters in router state so Back and tab changes stay deterministic. */
export function useCatalogBrowseFilters() {
  const [searchParams, setSearchParams] = useSearchParams<CatalogBrowseSearchParams>();
  const providerId = () => parsePositiveCatalogId(searchParams.provider);
  const categoryId = () =>
    providerId() === undefined ? undefined : parsePositiveCatalogId(searchParams.category);

  const selectProvider = (id?: number, replace = false) => {
    setSearchParams({ provider: id, category: undefined }, { replace });
  };

  const selectCategory = (id?: number, replace = false) => {
    setSearchParams({ category: providerId() === undefined ? undefined : id }, { replace });
  };

  createEffect(() => {
    if (providerId() === undefined && searchParams.category !== undefined) {
      setSearchParams({ category: undefined }, { replace: true });
    }
  });

  return {
    providerId,
    categoryId,
    selectProvider,
    selectCategory,
    hrefWithProvider: (path: string) => catalogRouteWithProvider(path, providerId()),
  };
}
