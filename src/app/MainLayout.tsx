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
import { focusElement, isElementAttached } from "@/shared/focus";
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
  let lastAttachedFocus: ElementNode | undefined;
  let focusBeforeExitDialog: ElementNode | undefined;

  function focusSidebar() {
    if (sidebar?.states.has("$focus")) {
      return false;
    }

    const current = activeElement();
    if (isElementAttached(current)) lastFocused = current;
    return focusElement(sidebar);
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
      lastFocused && lastFocused !== sidebar && isElementAttached(lastFocused) ? lastFocused : pageContainer;
    return focusElement(nextTarget) || focusElement(pageContainer);
  }

  function closeExitDialog() {
    setShowExitDialog(false);
    const returnTarget = isElementAttached(focusBeforeExitDialog) ? focusBeforeExitDialog : pageContainer;
    focusBeforeExitDialog = undefined;
    queueMicrotask(() => {
      const target = isElementAttached(returnTarget) ? returnTarget : pageContainer;
      if (!focusElement(target)) focusElement(pageContainer);
    });
    return true;
  }

  // SolidTV applies a directional focus change in its post-mutation
  // microtask. A resource/route update can remove that node in the same turn,
  // leaving activeElement() pointing at something that no longer renders. Run
  // immediately after that pass and restore a known attached target. This is
  // deliberately a safety net; normal navigation still owns its focus graph.
  function guardFocusAfterInput() {
    const beforeInput = activeElement();

    queueMicrotask(() => {
      queueMicrotask(() => {
        const current = activeElement();
        if (isElementAttached(current) && !current.skipFocus) return;

        if (focusElement(beforeInput)) return;
        if (focusElement(lastAttachedFocus)) return;
        if (focusElement(pageContainer)) return;
        focusElement(sidebar);
      });
    });

    return false;
  }

  function handleBack(event?: KeyboardEvent) {
    // Mark the synthetic Back keydown as consumed so the Capacitor
    // backButton listener doesn't fall through to its own history.back()
    // and double-pop the route.
    event?.preventDefault();
    const isHomeRoute = location.pathname === "/" || location.pathname === "";
    if (isHomeRoute) {
      if (!showExitDialog()) focusBeforeExitDialog = activeElement();
      setShowExitDialog(true);
      return true;
    }

    history.back();
    return true;
  }

  function handleExit() {
    if (!exitCurrentApp()) {
      closeExitDialog();
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
      if (!isElementAttached(current)) {
        if (!focusElement(pageContainer)) focusElement(sidebar);
      }
    });
  });

  createEffect(() => {
    const current = activeElement();
    if (isElementAttached(current) && !current.skipFocus) {
      lastAttachedFocus = current;
    }
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
      onCaptureKey={guardFocusAfterInput}
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
        <ExitDialog onConfirm={handleExit} onCancel={closeExitDialog} />
      </Show>
    </View>
  );
};

export default MainLayout;
