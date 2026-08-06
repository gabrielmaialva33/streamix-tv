import { activeElement, ElementNode, View } from "@solidtv/solid";
import { useLocation, useNavigate } from "@solidjs/router";
import {
  children,
  createEffect,
  createMemo,
  createSignal,
  type JSX,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Suspense } from "@solidtv/solid/primitives";
import { ExitDialog, ProviderHealthBanner, Sidebar } from "@/components";
import { LayoutFocusContext } from "@/app/layoutFocus";
import { catalogBrowseConfigForPath } from "@/features/catalog/catalogBrowse";
import { createProviderHealthPolling } from "@/features/catalog/providerHealth";
import { addForegroundResumeListener, exitCurrentApp } from "@/platform/tizen";
import {
  CATALOG_SIDEBAR_WIDTH,
  CONTENT_HEIGHT,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  SIDEBAR_WIDTH,
} from "@/shared/layout";
import { theme } from "@/styles";

interface MainLayoutProps {
  children?: JSX.Element;
}

const MainLayout = (props: MainLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showExitDialog, setShowExitDialog] = createSignal(false);
  const resolvedChildren = children(() => props.children);
  const providerHealth = createProviderHealthPolling();
  const catalogBrowse = createMemo(() => catalogBrowseConfigForPath(location.pathname));
  const currentSidebarWidth = () => (catalogBrowse() ? CATALOG_SIDEBAR_WIDTH : SIDEBAR_WIDTH);
  const currentContentWidth = () => SCREEN_WIDTH - currentSidebarWidth();

  let sidebar: ElementNode | undefined;
  let pageContainer: ElementNode | undefined;
  let lastFocused: ElementNode | undefined;

  function focusSidebar() {
    if (sidebar?.states.has("$focus")) {
      return false;
    }

    lastFocused = activeElement();
    sidebar?.setFocus();
    return true;
  }

  function focusContent() {
    if (!sidebar?.states.has("$focus")) {
      return false;
    }

    // Stale-ref guard: lastFocused can point to a node unmounted by a route
    // swap or a <Show>/<For> flip. setFocus() on a detached node is a silent
    // no-op on real TVs — that's how the D-pad ends up "stuck". Only reuse
    // the ref if it's still attached to the tree.
    const nextTarget =
      lastFocused && lastFocused !== sidebar && lastFocused.parent ? lastFocused : pageContainer;
    nextTarget?.setFocus();
    return true;
  }

  function handleBack(event?: KeyboardEvent) {
    // Mark the synthetic Back keydown as consumed so the Capacitor
    // backButton listener doesn't fall through to its own history.back()
    // and double-pop the route.
    event?.preventDefault();
    const isHomeRoute = location.pathname === "/" || location.pathname === "";
    if (isHomeRoute) {
      setShowExitDialog(true);
      return true;
    }

    history.back();
    return true;
  }

  function handleExit() {
    if (!exitCurrentApp()) {
      setShowExitDialog(false);
    }
  }
  // Route change invalidates any lastFocused reference from the prior page.
  // Otherwise returning from the sidebar setFocus-es a stale node and the
  // page scroll snaps to that node's position on remount. The skipInitial flag
  // ensures we don't fight the initial mount (before pageContainer is ready).
  let navCount = 0;
  createEffect(() => {
    // Track the route signal so this effect re-runs on navigation.
    void location.pathname;
    lastFocused = undefined;
    const count = ++navCount;
    if (count === 1) return;
    // After a navigation, defer one microtask so the new page can mount. If the
    // old focused node was disposed and nothing grabbed focus, recover into
    // pageContainer so the D-pad never dies on real TVs.
    queueMicrotask(() => {
      const current = activeElement();
      if (!current || !current.parent) {
        pageContainer?.setFocus();
      }
    });
  });

  onMount(() => {
    const unsubscribe = addForegroundResumeListener(() => {
      setShowExitDialog(false);
      if (location.pathname !== "/") {
        navigate("/");
      }
    });

    onCleanup(unsubscribe);
  });

  return (
    <View
      width={SCREEN_WIDTH}
      height={SCREEN_HEIGHT}
      color={theme.background}
      onLast={handleBack}
      onBack={handleBack}
      onBackspace={focusSidebar}
      onMenu={() => {
        navigate("/");
        return true;
      }}
      onLeft={focusSidebar}
      onRight={focusContent}
    >
      <Sidebar ref={sidebar} onExit={focusContent} health={providerHealth()} />
      <View
        id="pageContainer"
        ref={pageContainer}
        x={currentSidebarWidth()}
        width={currentContentWidth()}
        height={CONTENT_HEIGHT}
        color={theme.background}
        clipping
        forwardFocus={0}
      >
        <LayoutFocusContext.Provider value={{ focusSidebar }}>
          <Suspense
            fallback={<View width={currentContentWidth()} height={CONTENT_HEIGHT} color={theme.background} />}
          >
            {resolvedChildren()}
          </Suspense>
        </LayoutFocusContext.Provider>
      </View>
      <ProviderHealthBanner health={providerHealth()} suppressDegraded={catalogBrowse() !== undefined} />
      <Show when={showExitDialog()}>
        <ExitDialog onConfirm={handleExit} onCancel={() => setShowExitDialog(false)} />
      </Show>
    </View>
  );
};

export default MainLayout;
