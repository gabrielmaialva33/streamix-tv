import { ElementNode, View } from "@lightningtv/solid";
import { useAnnouncer, useFocusManager, useMouse } from "@lightningtv/solid/primitives";
import { lazy, Show } from "solid-js";
import { Suspense } from "@lightningtv/solid/primitives";
import { preferences } from "@/lib/storage";
import { isDebugOverlayEnabled, toggleDebugOverlay } from "@/debug/overlayState";
import { activeKeyHoldOptions, activeKeys, type AppChildren } from "@/platform/keys";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "@/shared/layout";

const DebugOverlay = lazy(() => import("../components/DebugOverlay"));

declare global {
  interface Window {
    APP: ElementNode;
  }
}

interface AppShellProps {
  children?: AppChildren;
}

const AppShell = (props: AppShellProps) => {
  useFocusManager(activeKeys, activeKeyHoldOptions);
  useMouse();

  const announcer = useAnnouncer();
  announcer.debug = false;
  announcer.enabled = preferences.get().announcer;

  return (
    <View
      ref={element => {
        window.APP = element;
      }}
      width={SCREEN_WIDTH}
      height={SCREEN_HEIGHT}
      color={0x0d0d12ff}
      onAnnouncer={() => {
        announcer.enabled = !announcer.enabled;
        preferences.update({ announcer: announcer.enabled });
      }}
      onKey0={() => {
        toggleDebugOverlay();
        return true;
      }}
    >
      <Suspense fallback={<View width={SCREEN_WIDTH} height={SCREEN_HEIGHT} color={0x0d0d12ff} />}>
        {props.children}
      </Suspense>
      <Show when={isDebugOverlayEnabled}>
        <DebugOverlay />
      </Show>
    </View>
  );
};

export default AppShell;
