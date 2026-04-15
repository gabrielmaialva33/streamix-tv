import { activeElement, ElementNode, View } from "@lightningtv/solid";
import { useLocation, useNavigate } from "@solidjs/router";
import { createSignal, type JSX, onCleanup, onMount, Show } from "solid-js";
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

    const nextTarget = lastFocused && lastFocused !== sidebar ? lastFocused : pageContainer;
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
        {props.children}
      </View>
      <Show when={showExitDialog()}>
        <ExitDialog onConfirm={handleExit} onCancel={() => setShowExitDialog(false)} />
      </Show>
    </View>
  );
};

export default MainLayout;
