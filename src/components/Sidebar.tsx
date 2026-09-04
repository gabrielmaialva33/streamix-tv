import {
  ElementNode,
  type IntrinsicNodeStyleProps,
  type IntrinsicTextNodeStyleProps,
  type NodeProps,
  Text,
  View,
} from "@solidtv/solid";
import { Column, type NavigableElement } from "@solidtv/solid/primitives";
import { useLocation, useNavigate } from "@solidjs/router";
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Match,
  onCleanup,
  Show,
  Switch,
} from "solid-js";
import { authState } from "@/features/auth/auth";
import { preloadNavigationPage } from "@/app/pageLoaders";
import {
  catalogBrowseConfigForPath,
  catalogSidebarModeAfterBack,
  centeredWindowStart,
  type CatalogSidebarMode,
} from "@/features/catalog/catalogBrowse";
import {
  catalogRouteWithProvider,
  parsePositiveCatalogId,
  useCatalogBrowseFilters,
} from "@/features/catalog/catalogFilters";
import { combinedProviderHealthStatus } from "@/features/catalog/providerHealth";
import api, {
  type CatalogProvider,
  type CategoryFilter,
  type ProviderHealthResponse,
  type ProviderHealthStatus,
} from "@/lib/api";
import { CATALOG_SIDEBAR_WIDTH, SIDEBAR_WIDTH } from "@/shared/layout";
import { isElementAttached } from "@/shared/focus";
import { createLogger } from "@/shared/logging/logger";
import { bumpNavReset } from "@/shared/navReset";
import { theme } from "@/styles";

const PROVIDER_AWARE_ROUTES = new Set(["/movies", "/series", "/channels"]);
const CATEGORY_WINDOW_SIZE = 9;
// `notation: "compact"` needs Chrome 77. Tizen 6.0 ships Chromium M76 and every
// older set is further behind, and there the option is silently ignored rather
// than throwing — so those TVs rendered raw counts ("12345") while newer ones
// rendered "12,3 mil". Detect support once and fall back to an equivalent
// manual form so the rail reads the same on every model.
const compactFormatter = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const plainFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const supportsCompactNotation = compactFormatter.format(12345) !== plainFormatter.format(12345);

const COMPACT_UNITS = [
  { limit: 1e9, suffix: " bi" },
  { limit: 1e6, suffix: " mi" },
  { limit: 1e3, suffix: " mil" },
] as const;

function formatCompactNumber(value: number): string {
  if (supportsCompactNotation) return compactFormatter.format(value);
  const magnitude = Math.abs(value);
  for (const unit of COMPACT_UNITS) {
    if (magnitude >= unit.limit) return plainFormatter.format(value / unit.limit) + unit.suffix;
  }
  return plainFormatter.format(value);
}
const logger = createLogger("Sidebar");
const NAVIGATION_PRELOAD_DELAY_MS = 180;

const NavigationColumnStyle = {
  display: "flex",
  flexDirection: "column",
  height: 760,
  y: 120,
  gap: 8,
  zIndex: 200,
  x: 20,
} satisfies IntrinsicNodeStyleProps;

const NavButtonStyle = {
  zIndex: 201,
  height: 52,
  borderRadius: 8,
  color: theme.surfaceMuted,
  border: { color: theme.borderSubtle, width: 1 },
  $focus: {
    border: { color: theme.borderLight, width: 1 },
  },
} satisfies IntrinsicNodeStyleProps;

const NavButtonActiveStyle = {
  ...NavButtonStyle,
  color: theme.surfaceMuted,
  border: { color: theme.border, width: 1 },
  $focus: {
    border: { color: theme.primary, width: 1 },
  },
} satisfies IntrinsicNodeStyleProps;

const NavButtonTextStyle = {
  // Android TV sizes browse menu categories at 20sp; the sidebar is the most
  // read text in the app and 18 sat under that from a 3m viewing distance.
  fontSize: 20,
  x: 16,
  y: 14,
  height: 50,
  color: theme.textMuted,
  $focus: { color: 0xffffffff },
} satisfies IntrinsicTextNodeStyleProps;

const NavButtonActiveTextStyle = {
  ...NavButtonTextStyle,
  color: 0xd8d8e2ff,
  $focus: { color: theme.textPrimary },
} satisfies IntrinsicTextNodeStyleProps;

const ActiveIndicatorStyle = {
  width: 4,
  height: 24,
  x: 0,
  y: 14,
  color: theme.primary,
  borderRadius: 1,
} satisfies IntrinsicNodeStyleProps;

const DividerStyle = {
  width: 140,
  height: 20,
  x: 20,
  color: 0x00000000,
} satisfies IntrinsicNodeStyleProps;

const RailOptionStyle = {
  width: 300,
  height: 62,
  color: theme.surfaceMuted,
  borderRadius: 9,
  border: { color: theme.border, width: 1 },
  $focus: {
    border: { color: theme.primary, width: 2 },
  },
} satisfies IntrinsicNodeStyleProps;

const RailOptionActiveStyle = {
  ...RailOptionStyle,
  color: theme.surfaceActive,
  border: { color: 0xe5091455, width: 1 },
} satisfies IntrinsicNodeStyleProps;

const ProviderButtonStyle = {
  color: theme.surfaceMuted,
  borderRadius: 10,
  border: { color: theme.border, width: 1 },
  $focus: {
    border: { color: theme.primary, width: 2 },
  },
} satisfies IntrinsicNodeStyleProps;

interface NavButtonProps extends NodeProps {
  children: string;
  isActive?: boolean;
  route: string;
  width: number;
}

function NavButton(props: NavButtonProps) {
  return (
    <View
      {...props}
      width={props.width}
      forwardStates
      style={props.isActive ? NavButtonActiveStyle : NavButtonStyle}
    >
      {props.isActive && <View style={ActiveIndicatorStyle} />}
      <Text
        width={props.width - 32}
        contain="width"
        maxLines={1}
        style={props.isActive ? NavButtonActiveTextStyle : NavButtonTextStyle}
      >
        {props.children}
      </Text>
    </View>
  );
}

interface CategoryOption {
  id?: number;
  name: string;
}

interface ProviderOption {
  id?: number;
  name: string;
  provider?: CatalogProvider;
}

interface RailOptionProps extends NodeProps {
  label: string;
  active: boolean;
  item: CategoryOption | ProviderOption;
  meta?: string;
  status?: ProviderHealthStatus;
}

function providerStatusColor(status?: ProviderHealthStatus): number {
  if (status === "healthy") return theme.success;
  if (status === "degraded") return theme.warning;
  if (status === "unhealthy") return theme.primaryLight;
  return theme.textDisabled;
}

function providerStatusLabel(status?: ProviderHealthStatus): string {
  if (status === "healthy") return "Disponível";
  if (status === "degraded") return "Instável";
  if (status === "unhealthy") return "Indisponível";
  return "Status desconhecido";
}

function RailOption(props: RailOptionProps) {
  const textX = () => (props.status ? 38 : 18);
  const textWidth = () => 282 - textX() - (props.meta ? 68 : 0);

  return (
    <View
      {...props}
      item={props.item}
      forwardStates
      style={props.active ? RailOptionActiveStyle : RailOptionStyle}
    >
      <Show when={props.active}>
        <View x={0} y={19} width={4} height={24} color={theme.primary} borderRadius={2} skipFocus />
      </Show>
      <Show when={props.status}>
        <View
          x={18}
          y={26}
          width={10}
          height={10}
          color={providerStatusColor(props.status)}
          borderRadius={5}
          skipFocus
        />
      </Show>
      <Text
        x={textX()}
        y={20}
        width={textWidth()}
        height={28}
        fontSize={18}
        fontWeight={props.active ? 700 : 500}
        color={props.active ? theme.textPrimary : theme.textSecondary}
        contain="width"
        textOverflow="ellipsis"
        maxLines={1}
      >
        {props.label}
      </Text>
      <Show when={props.meta}>
        <Text
          x={222}
          y={22}
          width={58}
          height={24}
          fontSize={14}
          color={theme.textMuted}
          contain="width"
          maxLines={1}
          textAlign="right"
        >
          {props.meta}
        </Text>
      </Show>
    </View>
  );
}

export interface SidebarProps extends NodeProps {
  ref?: any;
  onExit?: () => boolean;
  health?: ProviderHealthResponse | null;
}

const Sidebar = (props: SidebarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    providerId: selectedProvider,
    categoryId: selectedCategory,
    selectProvider,
    selectCategory,
  } = useCatalogBrowseFilters();
  const [mode, setMode] = createSignal<CatalogSidebarMode>("navigation");

  let navigationColumn: ElementNode | undefined;
  let providerButton: ElementNode | undefined;
  let categoryRetryButton: ElementNode | undefined;
  let categoryColumn: NavigableElement | undefined;
  let providerColumn: NavigableElement | undefined;
  let navigationPreloadTimer: ReturnType<typeof setTimeout> | undefined;

  const browseConfig = createMemo(() => catalogBrowseConfigForPath(location.pathname));
  const railWidth = () => (browseConfig() ? CATALOG_SIDEBAR_WIDTH : SIDEBAR_WIDTH);
  const navigationButtonWidth = () => railWidth() - 40;

  const [providers] = createResource(
    () => browseConfig()?.contentType,
    () => api.getCatalogProviders(),
    { initialValue: [] },
  );
  const availableProviders = createMemo(() => {
    if (providers.error) return [];
    const contentType = browseConfig()?.contentType;
    return contentType ? providers().filter(provider => provider.content_types.includes(contentType)) : [];
  });

  const categoryRequestKey = () => {
    const config = browseConfig();
    const providerId = selectedProvider();
    return config && providerId !== undefined ? `${config.categoryType}:${providerId}` : undefined;
  };
  const [categories, { refetch: refetchCategories }] = createResource(
    categoryRequestKey,
    key => {
      const [type, providerId] = key.split(":");
      return api.getCategories(type as CategoryFilter, { provider_id: Number(providerId) });
    },
    { initialValue: [] },
  );

  const providerOptions = createMemo<ProviderOption[]>(() => [
    { name: "Todos os provedores" },
    ...availableProviders().map(provider => ({ id: provider.id, name: provider.name, provider })),
  ]);
  const categoryOptions = createMemo<CategoryOption[]>(() => {
    const config = browseConfig();
    if (!config || selectedProvider() === undefined || categories.error) return [];
    return [
      { name: config.allCategoriesLabel },
      ...categories().map(category => ({ id: category.id, name: category.name })),
    ];
  });
  const selectedProviderIndex = () => {
    const index = providerOptions().findIndex(option => option.id === selectedProvider());
    return index >= 0 ? index : 0;
  };
  const selectedCategoryIndex = () => {
    const index = categoryOptions().findIndex(option => option.id === selectedCategory());
    return index >= 0 ? index : 0;
  };
  const [categoryCursor, setCategoryCursor] = createSignal(0);
  const categoryWindowStart = createMemo(() =>
    centeredWindowStart(categoryCursor(), categoryOptions().length, CATEGORY_WINDOW_SIZE),
  );
  const visibleCategoryOptions = createMemo(() =>
    categoryOptions().slice(categoryWindowStart(), categoryWindowStart() + CATEGORY_WINDOW_SIZE),
  );
  const categoryRelativeIndex = () => categoryCursor() - categoryWindowStart();
  const currentProvider = () => availableProviders().find(provider => provider.id === selectedProvider());
  const currentProviderName = () => currentProvider()?.name ?? "Todos os provedores";
  const healthForProvider = (providerId?: number) => {
    if (providerId === undefined) return combinedProviderHealthStatus(props.health);
    return props.health?.providers.find(provider => provider.id === providerId)?.status;
  };
  const currentProviderStatus = () => healthForProvider(selectedProvider());
  const currentProviderStatusLabel = () => {
    if (selectedProvider() !== undefined) return providerStatusLabel(currentProviderStatus());
    if (currentProviderStatus() === "degraded") return "Algumas fontes estão indisponíveis";
    if (currentProviderStatus() === "healthy") return "Catálogo combinado disponível";
    return providerStatusLabel(currentProviderStatus());
  };

  const isActive = (path: string) => {
    const currentPath = location.pathname;
    if (path === "/") return currentPath === "/" || currentPath === "";
    return currentPath.startsWith(path);
  };

  function deferFocus(callback: () => void) {
    queueMicrotask(() => queueMicrotask(callback));
  }

  function scheduleNavigationPreload(path: string) {
    if (navigationPreloadTimer) clearTimeout(navigationPreloadTimer);
    navigationPreloadTimer = setTimeout(() => {
      navigationPreloadTimer = undefined;
      const provider_id = selectedProvider();
      const category_id = location.pathname === path ? selectedCategory() : undefined;
      const tasks: Promise<unknown>[] = [preloadNavigationPage(path)];

      switch (path) {
        case "/":
          tasks.push(api.getHome(20));
          break;
        case "/movies":
          tasks.push(
            api.getCatalogProviders(),
            api.getMovies({ provider_id, category_id, offset: 0, limit: 30 }),
          );
          break;
        case "/series":
          tasks.push(
            api.getCatalogProviders(),
            api.getSeries({ provider_id, category_id, offset: 0, limit: 30 }),
          );
          break;
        case "/channels":
          tasks.push(
            api.getCatalogProviders(),
            api.getChannels({ provider_id, category_id, offset: 0, limit: 48 }),
          );
          break;
        case "/guide":
          tasks.push(api.getChannels({ limit: 50 }));
          break;
      }

      void Promise.allSettled(tasks).then(results => {
        const failure = results.find(result => result.status === "rejected");
        if (failure?.status === "rejected") {
          logger.debug("Navigation preload deferred after failure", { path, error: failure.reason });
        }
      });
    }, NAVIGATION_PRELOAD_DELAY_MS);
  }

  onCleanup(() => {
    if (navigationPreloadTimer) clearTimeout(navigationPreloadTimer);
  });

  function focusNavigation() {
    if (!isElementAttached(navigationColumn)) return;
    const path = location.pathname;
    const index = navigationColumn.children.findIndex(child => {
      const route = (child as ElementNode & { route?: string }).route;
      if (!route) return false;
      if (route === "/") return path === "/" || path === "";
      return path.startsWith(route);
    });
    const target = index >= 0 ? index : navigationColumn.children.findIndex(child => !child.skipFocus);
    if (target >= 0) {
      navigationColumn.selected = target;
      navigationColumn.children[target]?.setFocus();
    }
  }

  function focusCatalog() {
    if (
      selectedProvider() !== undefined &&
      isElementAttached(categoryColumn) &&
      categoryOptions().length > 0
    ) {
      focusCategoryAt(selectedCategoryIndex());
      return;
    }
    if (isElementAttached(providerButton)) providerButton.setFocus();
  }

  function focusCategoryAt(index: number) {
    const itemCount = categoryOptions().length;
    if (!isElementAttached(categoryColumn) || itemCount === 0) return false;
    const nextIndex = Math.min(Math.max(index, 0), itemCount - 1);
    setCategoryCursor(nextIndex);
    deferFocus(() => {
      if (!isElementAttached(categoryColumn)) return;
      const relativeIndex = nextIndex - categoryWindowStart();
      categoryColumn.selected = relativeIndex;
      categoryColumn.children[relativeIndex]?.setFocus();
    });
    return true;
  }

  function focusProviders() {
    if (isElementAttached(providerColumn)) providerColumn.scrollToIndex?.(selectedProviderIndex());
  }

  function forwardSidebarFocus() {
    if (mode() === "providers") {
      focusProviders();
      return isElementAttached(providerColumn);
    }
    if (mode() === "catalog" && browseConfig()) {
      focusCatalog();
      return isElementAttached(providerButton) || isElementAttached(categoryColumn);
    }
    focusNavigation();
    return isElementAttached(navigationColumn);
  }

  function openCatalog() {
    if (!browseConfig()) return false;
    setMode("catalog");
    deferFocus(focusCatalog);
    return true;
  }

  function openProviders() {
    setMode("providers");
    deferFocus(focusProviders);
    return true;
  }

  function backOneLevel() {
    const nextMode = catalogSidebarModeAfterBack(mode());
    if (!nextMode) return false;
    setMode(nextMode);
    deferFocus(nextMode === "catalog" ? focusCatalog : focusNavigation);
    return true;
  }

  function onRight() {
    if (mode() === "providers") return true;
    if (mode() === "navigation" && browseConfig()) return openCatalog();
    props.onExit?.();
    return true;
  }

  function go(page: string) {
    const targetConfig = catalogBrowseConfigForPath(page);
    if (isActive(page)) {
      bumpNavReset();
      if (targetConfig) {
        setMode("catalog");
        deferFocus(focusCatalog);
      } else {
        deferFocus(() => props.onExit?.());
      }
      return true;
    }

    const providerId = parsePositiveCatalogId(new URLSearchParams(location.search).get("provider"));
    navigate(PROVIDER_AWARE_ROUTES.has(page) ? catalogRouteWithProvider(page, providerId) : page);
    if (targetConfig) {
      setMode("catalog");
      deferFocus(focusCatalog);
    } else {
      deferFocus(() => props.onExit?.());
    }
    return true;
  }

  function selectProviderOption(option: ProviderOption) {
    if (selectedProvider() !== option.id) selectProvider(option.id);
    setMode("catalog");
    deferFocus(() => providerButton?.setFocus());
    return true;
  }

  function selectCategoryOption(option: CategoryOption) {
    if (selectedCategory() !== option.id) selectCategory(option.id);
    return true;
  }

  function retryCategories() {
    void Promise.resolve(refetchCategories()).then(
      () =>
        deferFocus(() => {
          if (categories.error) categoryRetryButton?.setFocus();
          else focusCategoryAt(selectedCategoryIndex());
        }),
      () => deferFocus(() => categoryRetryButton?.setFocus()),
    );
    return true;
  }

  createEffect(() => {
    const pathname = location.pathname;
    if (catalogBrowseConfigForPath(pathname)) {
      setMode("catalog");
      deferFocus(focusCatalog);
    } else {
      setMode("navigation");
    }
  });

  createEffect(() => {
    const providerId = selectedProvider();
    if (!browseConfig() || providerId === undefined || providers.loading || providers.state !== "ready")
      return;
    if (!availableProviders().some(provider => provider.id === providerId)) selectProvider(undefined, true);
  });

  createEffect(() => {
    const categoryId = selectedCategory();
    if (!browseConfig() || categoryId === undefined || categories.loading || categories.state !== "ready")
      return;
    if (!categories().some(category => category.id === categoryId)) selectCategory(undefined, true);
  });

  createEffect(() => {
    const options = categoryOptions();
    const selectedIndex = selectedCategoryIndex();
    setCategoryCursor(options.length > 0 ? Math.min(selectedIndex, options.length - 1) : 0);
  });

  return (
    <View
      ref={props.ref}
      width={railWidth()}
      height={1080}
      zIndex={100}
      forwardFocus={forwardSidebarFocus}
      onLeft={backOneLevel}
      onRight={onRight}
      onBack={backOneLevel}
      onLast={backOneLevel}
    >
      <View skipFocus zIndex={100} width={railWidth()} height={1080} color={0x07080df8} />
      <View skipFocus zIndex={101} x={railWidth() - 2} width={1} height={1080} color={theme.border} />

      <View skipFocus y={40} x={20} width={railWidth() - 40} height={48} zIndex={105}>
        <View src="assets/streamix-logo.png" x={0} y={0} width={44} height={44} />
        <Text x={56} y={8} fontSize={24} fontWeight={700} color={theme.textPrimary}>
          STREAMIX
        </Text>
      </View>

      <View width={railWidth()} height={1010} zIndex={200}>
        <Switch>
          <Match when={mode() === "navigation"}>
            <Column
              ref={element => {
                navigationColumn = element;
                onCleanup(() => {
                  if (navigationColumn === element) navigationColumn = undefined;
                });
              }}
              onRight={onRight}
              style={{ ...NavigationColumnStyle, width: navigationButtonWidth() }}
              scroll="none"
            >
              <NavButton
                route="/"
                width={navigationButtonWidth()}
                onEnter={() => go("/")}
                onFocus={() => scheduleNavigationPreload("/")}
                isActive={isActive("/")}
              >
                Início
              </NavButton>
              <NavButton
                route="/movies"
                width={navigationButtonWidth()}
                onEnter={() => go("/movies")}
                onFocus={() => scheduleNavigationPreload("/movies")}
                isActive={isActive("/movies")}
              >
                Filmes
              </NavButton>
              <NavButton
                route="/series"
                width={navigationButtonWidth()}
                onEnter={() => go("/series")}
                onFocus={() => scheduleNavigationPreload("/series")}
                isActive={isActive("/series")}
              >
                Séries
              </NavButton>
              <NavButton
                route="/channels"
                width={navigationButtonWidth()}
                onEnter={() => go("/channels")}
                onFocus={() => scheduleNavigationPreload("/channels")}
                isActive={isActive("/channels")}
              >
                Canais
              </NavButton>
              <View style={DividerStyle} skipFocus />
              <NavButton
                route="/search"
                width={navigationButtonWidth()}
                onEnter={() => go("/search")}
                onFocus={() => scheduleNavigationPreload("/search")}
                isActive={isActive("/search")}
              >
                Buscar
              </NavButton>
              <NavButton
                route="/guide"
                width={navigationButtonWidth()}
                onEnter={() => go("/guide")}
                onFocus={() => scheduleNavigationPreload("/guide")}
                isActive={isActive("/guide")}
              >
                Guia TV
              </NavButton>
              <NavButton
                route="/favorites"
                width={navigationButtonWidth()}
                onEnter={() => go("/favorites")}
                onFocus={() => scheduleNavigationPreload("/favorites")}
                isActive={isActive("/favorites")}
              >
                Favoritos
              </NavButton>
              <Show when={authState.user()}>
                <View style={DividerStyle} skipFocus />
                <NavButton
                  route="/profile"
                  width={navigationButtonWidth()}
                  onEnter={() => go("/profile")}
                  onFocus={() => scheduleNavigationPreload("/profile")}
                  isActive={isActive("/profile")}
                >
                  Perfil
                </NavButton>
              </Show>
            </Column>
          </Match>

          <Match when={mode() === "catalog" && browseConfig()}>
            <Text x={20} y={116} fontSize={13} fontWeight={700} color={theme.primaryLight}>
              CATÁLOGO
            </Text>
            <Text x={20} y={138} width={300} fontSize={32} fontWeight={700} color={theme.textPrimary}>
              {browseConfig()?.title}
            </Text>

            <View
              ref={element => {
                providerButton = element;
                onCleanup(() => {
                  if (providerButton === element) providerButton = undefined;
                });
              }}
              x={20}
              y={190}
              width={300}
              height={78}
              style={ProviderButtonStyle}
              onEnter={openProviders}
              onDown={() => {
                if (isElementAttached(categoryColumn) && categoryOptions().length > 0) {
                  focusCategoryAt(selectedCategoryIndex());
                  return true;
                }
                if (categories.error && isElementAttached(categoryRetryButton)) {
                  categoryRetryButton.setFocus();
                  return true;
                }
                if (selectedProvider() !== undefined && categories.loading) return true;
                props.onExit?.();
                return true;
              }}
            >
              <Text x={16} y={9} fontSize={12} fontWeight={700} color={theme.textMuted}>
                PROVEDOR
              </Text>
              <View
                x={16}
                y={39}
                width={10}
                height={10}
                color={providerStatusColor(currentProviderStatus())}
                borderRadius={5}
                skipFocus
              />
              <Text
                x={36}
                y={29}
                width={248}
                height={28}
                fontSize={19}
                fontWeight={700}
                color={theme.textPrimary}
                contain="width"
                textOverflow="ellipsis"
                maxLines={1}
              >
                {currentProviderName()}
              </Text>
              <Text x={36} y={54} width={248} fontSize={12} color={theme.textMuted}>
                {currentProviderStatusLabel()}
              </Text>
            </View>

            <Text x={20} y={294} fontSize={13} fontWeight={700} color={theme.textMuted}>
              CATEGORIAS
            </Text>
            <Show
              when={selectedProvider() !== undefined}
              fallback={
                <View
                  x={20}
                  y={330}
                  width={300}
                  height={122}
                  color={theme.surfaceMuted}
                  borderRadius={10}
                  skipFocus
                >
                  <Text
                    x={18}
                    y={20}
                    width={264}
                    height={82}
                    fontSize={17}
                    lineHeight={24}
                    color={theme.textMuted}
                    contain="both"
                    maxLines={3}
                  >
                    Escolha um provedor para filtrar por categoria.
                  </Text>
                </View>
              }
            >
              <Show
                when={!categories.loading}
                fallback={
                  <Text x={20} y={340} width={300} fontSize={17} color={theme.textMuted}>
                    Carregando categorias…
                  </Text>
                }
              >
                <Show
                  when={!categories.error}
                  fallback={
                    <View
                      ref={element => {
                        categoryRetryButton = element;
                        onCleanup(() => {
                          if (categoryRetryButton === element) categoryRetryButton = undefined;
                        });
                      }}
                      x={20}
                      y={330}
                      width={300}
                      height={82}
                      style={RailOptionStyle}
                      forwardStates
                      onUp={() => {
                        providerButton?.setFocus();
                        return true;
                      }}
                      onRight={onRight}
                      onEnter={retryCategories}
                    >
                      <Text
                        x={16}
                        y={12}
                        width={268}
                        fontSize={16}
                        lineHeight={23}
                        color={theme.primaryLight}
                        contain="both"
                        textAlign="center"
                        maxLines={2}
                      >
                        Falha ao carregar categorias · OK para tentar novamente
                      </Text>
                    </View>
                  }
                >
                  <View x={16} y={322} width={308} height={678} clipping skipFocus>
                    <Column
                      ref={element => {
                        const column = element as NavigableElement;
                        categoryColumn = column;
                        onCleanup(() => {
                          if (categoryColumn === column) categoryColumn = undefined;
                        });
                      }}
                      x={4}
                      y={4}
                      width={300}
                      height={670}
                      selected={categoryRelativeIndex()}
                      gap={8}
                      scroll="none"
                      onUp={() => {
                        if (categoryCursor() === 0) {
                          providerButton?.setFocus();
                          return true;
                        }
                        focusCategoryAt(categoryCursor() - 1);
                        return true;
                      }}
                      onDown={() => {
                        if (categoryCursor() < categoryOptions().length - 1) {
                          focusCategoryAt(categoryCursor() + 1);
                        }
                        return true;
                      }}
                      onRight={onRight}
                    >
                      <For each={visibleCategoryOptions()}>
                        {option => (
                          <RailOption
                            item={option}
                            label={option.name}
                            active={selectedCategory() === option.id}
                            onEnter={() => selectCategoryOption(option)}
                          />
                        )}
                      </For>
                    </Column>
                  </View>
                </Show>
              </Show>
            </Show>
          </Match>

          <Match when={mode() === "providers" && browseConfig()}>
            <Text x={20} y={116} fontSize={13} fontWeight={700} color={theme.primaryLight}>
              {browseConfig()?.title.toUpperCase()}
            </Text>
            <Text x={20} y={138} width={300} fontSize={30} fontWeight={700} color={theme.textPrimary}>
              Provedores
            </Text>
            <Text x={20} y={184} width={300} fontSize={15} color={theme.textMuted}>
              Selecione a origem do catálogo
            </Text>

            <View x={16} y={220} width={308} height={780} clipping skipFocus>
              <Column
                ref={element => {
                  const column = element as NavigableElement;
                  providerColumn = column;
                  onCleanup(() => {
                    if (providerColumn === column) providerColumn = undefined;
                  });
                }}
                x={4}
                y={4}
                width={300}
                height={772}
                selected={selectedProviderIndex()}
                gap={8}
                scroll="none"
              >
                <For each={providerOptions()}>
                  {option => {
                    const count = () => {
                      const contentType = browseConfig()?.contentType;
                      const value = contentType && option.provider?.catalog_counts[contentType];
                      return typeof value === "number" ? formatCompactNumber(value) : undefined;
                    };
                    return (
                      <RailOption
                        item={option}
                        label={option.name}
                        meta={count()}
                        status={healthForProvider(option.id)}
                        active={selectedProvider() === option.id}
                        onEnter={() => selectProviderOption(option)}
                      />
                    );
                  }}
                </For>
              </Column>
            </View>
          </Match>
        </Switch>
      </View>

      <View skipFocus y={1020} x={20} zIndex={105}>
        <Text fontSize={12} color={theme.textDisabled}>
          {`v${__APP_VERSION__}`}
        </Text>
      </View>
    </View>
  );
};

export default Sidebar;
