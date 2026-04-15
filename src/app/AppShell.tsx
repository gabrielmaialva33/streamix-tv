import { ElementNode, View } from "@lightningtv/solid";
import { useAnnouncer, useFocusManager, useMouse } from "@lightningtv/solid/primitives";
import { preferences } from "../lib/storage";
import { DebugOverlay, toggleDebug } from "../components";
import { activeKeyHoldOptions, activeKeys, type AppChildren } from "../platform/keys";

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
      width={1920}
      height={1080}
      color={0x0d0d12ff}
      onAnnouncer={() => {
        announcer.enabled = !announcer.enabled;
        preferences.update({ announcer: announcer.enabled });
      }}
      onKey0={() => {
        toggleDebug();
        return true;
      }}
    >
      {props.children}
      <DebugOverlay />
    </View>
  );
};

export default AppShell;
