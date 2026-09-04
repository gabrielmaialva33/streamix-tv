import { ElementNode, View } from "@solidtv/solid";
import { useAnnouncer, useFocusManager, useMouse } from "@solidtv/solid/primitives";
import { lazy, Show } from "solid-js";
import { Suspense } from "@solidtv/solid/primitives";
import { hasPointerInput } from "#devices/common/capabilities";
import { preferences } from "@/lib/storage";
import { isDebugOverlayEnabled, toggleDebugOverlay } from "@/debug/overlayState";
import { noteBackReachedRoot } from "@/platform/backKey";
import { activeKeys, type AppChildren } from "@/platform/keys";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "@/shared/layout";

const DebugOverlay = lazy(() => import("@/components/DebugOverlay"));

declare global {
  interface Window {
    APP: ElementNode;
  }
}

interface AppShellProps {
  children?: AppChildren;
}

const AppShell = (props: AppShellProps) => {
  useFocusManager(activeKeys);
  // Only where a cursor exists: on a remote-only TV this turns every Enter into
  // two, because the browser's own activation click comes back as a second
  // Enter. See hasPointerInput.
  if (hasPointerInput()) useMouse();

  const announcer = useAnnouncer();
  announcer.debug = false;
  // Older Fire OS / Tizen WebViews ship without the Speech Synthesis API
  // entirely (SpeechSynthesisUtterance / speechSynthesis are undefined).
  // Force the announcer off there to avoid cascading "X is not defined"
  // rejections every time it tries to enqueue a phrase.
  const speechAvailable =
    typeof window !== "undefined" &&
    typeof window.SpeechSynthesisUtterance !== "undefined" &&
    typeof window.speechSynthesis !== "undefined";
  announcer.enabled = speechAvailable && preferences.get().announcer;

  return (
    <View
      ref={element => {
        window.APP = element;
      }}
      width={SCREEN_WIDTH}
      height={SCREEN_HEIGHT}
      color={0x00000000}
      // Above every route, so this runs only when no page claimed the Back
      // press. Recording that is what lets the Android bridge tell "a dialog
      // closed" from "nothing happened" — see platform/backKey.
      onBack={() => {
        noteBackReachedRoot();
        return false;
      }}
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
