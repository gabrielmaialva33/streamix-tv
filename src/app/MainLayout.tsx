import { activeElement, ElementNode, View } from "@lightningtv/solid";
import { useLocation, useNavigate } from "@solidjs/router";
import { children, createEffect, createSignal, type JSX, onCleanup, onMount, Show } from "solid-js";
import { Suspense } from "@lightningtv/solid/primitives";
import { ExitDialog, Sidebar } from "../components";
import { addForegroundResumeListener, exitCurrentApp } from "@/platform/tizen";
import { CONTENT_HEIGHT, CONTENT_WIDTH, SCREEN_HEIGHT, SCREEN_WIDTH, SIDEBAR_WIDTH } from "@/shared/layout";

interface MainLayoutProps {
  children?: JSX.Element;
}

const MainLayout = (props: MainLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showExitDialog, setShowExitDialog] = createSignal(false);
  const resolvedChildren = children(() => props.children);

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

  function handleBack() {
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
      color={0x0d0d12ff}
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
      <Sidebar ref={sidebar} onExit={focusContent} />
      <View
        id="pageContainer"
        ref={pageContainer}
        x={SIDEBAR_WIDTH}
        width={CONTENT_WIDTH}
        height={CONTENT_HEIGHT}
        color={0x0d0d12ff}
        clipping
        forwardFocus={0}
      >
        <Suspense fallback={<View width={CONTENT_WIDTH} height={CONTENT_HEIGHT} color={0x0d0d12ff} />}>
          {resolvedChildren()}
        </Suspense>
      </View>
      <Show when={showExitDialog()}>
        <ExitDialog onConfirm={handleExit} onCancel={() => setShowExitDialog(false)} />
      </Show>
    </View>
  );
};

export default MainLayout;
