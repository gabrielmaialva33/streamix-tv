import {
  ElementNode,
  type IntrinsicNodeStyleProps,
  type IntrinsicTextNodeStyleProps,
  type NodeProps,
  Text,
  View,
} from "@lightningtv/solid";
import { Column } from "@lightningtv/solid/primitives";
import { useLocation, useNavigate } from "@solidjs/router";
import { bumpNavReset } from "@/shared/navReset";
import { Show } from "solid-js";
import { theme } from "@/styles";
import { authState } from "@/features/auth/auth";

// Menu column positioning.
const ColumnStyle = {
  display: "flex",
  flexDirection: "column",
  width: 200,
  height: 760,
  y: 120,
  gap: 6,
  zIndex: 200,
  x: 20,
} satisfies IntrinsicNodeStyleProps;

const NavButtonStyle = {
  zIndex: 201,
  height: 50,
  width: 180,
  borderRadius: 10,
  color: 0x00000000,
  $focus: {
    color: theme.primary,
  },
} satisfies IntrinsicNodeStyleProps;

const NavButtonActiveStyle = {
  zIndex: 201,
  height: 50,
  width: 180,
  borderRadius: 10,
  color: theme.surface,
  $focus: {
    color: theme.primary,
  },
} satisfies IntrinsicNodeStyleProps;

const NavButtonTextStyle = {
  fontSize: 18,
  x: 16,
  y: 13,
  height: 50,
  color: theme.textMuted,
  $focus: {
    color: theme.textPrimary,
  },
} satisfies IntrinsicTextNodeStyleProps;

const NavButtonActiveTextStyle = {
  fontSize: 18,
  x: 16,
  y: 13,
  height: 50,
  color: theme.textSecondary,
  $focus: {
    color: theme.textPrimary,
  },
} satisfies IntrinsicTextNodeStyleProps;

const ActiveIndicatorStyle = {
  width: 4,
  height: 24,
  x: 0,
  y: 13,
  color: theme.primary,
  borderRadius: 2,
} satisfies IntrinsicNodeStyleProps;

const DividerStyle = {
  width: 140,
  height: 20,
  x: 20,
  color: 0x00000000,
} satisfies IntrinsicNodeStyleProps;

interface NavButtonProps extends NodeProps {
  children: string;
  isActive?: boolean;
  route: string;
}

// Store the route on the node so sidebar focus can resolve the active item.
function NavButton(props: NavButtonProps) {
  return (
    <View {...props} forwardStates style={props.isActive ? NavButtonActiveStyle : NavButtonStyle}>
      {props.isActive && <View style={ActiveIndicatorStyle} />}
      <Text style={props.isActive ? NavButtonActiveTextStyle : NavButtonTextStyle}>{props.children}</Text>
    </View>
  );
}

export interface SidebarProps extends NodeProps {
  ref?: any;
  onExit?: () => boolean;
}

const Sidebar = (props: SidebarProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    const currentPath = location.pathname;
    if (path === "/") return currentPath === "/" || currentPath === "";
    return currentPath.startsWith(path);
  };

  // When the sidebar gains focus, forward it to the active route button.
  function onFocus(this: ElementNode) {
    const path = location.pathname;
    const idx = this.children.findIndex(c => {
      const r = (c as any).route as string | undefined;
      if (!r) return false;
      if (r === "/") return path === "/" || path === "";
      return path.startsWith(r);
    });
    const fallback = this.children.findIndex(c => !(c as any).skipFocus);
    const target = idx >= 0 ? idx : fallback;
    if (target >= 0) {
      this.selected = target;
      this.children[target]?.setFocus();
    }
  }

  function onRight() {
    // Always swallow the key so the parent's onRight (focusContent) doesn't
    // fire a second time. The provided onExit either moved focus or no-op'd.
    props.onExit?.();
    return true;
  }

  function go(page: string) {
    if (isActive(page)) {
      // Same route: tell the page to reset scroll/focus to the top, otherwise
      // tapping "Início" while already on "Início" looks like a dead button.
      bumpNavReset();
    } else {
      navigate(page);
    }
    // Wait for the router tree to settle before returning focus to content.
    queueMicrotask(() => queueMicrotask(() => props.onExit?.()));
  }

  return (
    <>
      {/* Sidebar background and divider. */}
      <View skipFocus zIndex={100} width={220} height={1080} color={theme.background} />
      <View skipFocus zIndex={101} x={218} width={2} height={1080} color={theme.border} />

      {/* The logo image already ships with the final colors, so avoid tinting it. */}
      <View skipFocus y={40} x={20} width={180} height={48} zIndex={105}>
        <View src="assets/streamix-logo.png" x={0} y={0} width={44} height={44} />
        <Text x={56} y={8} fontSize={24} fontWeight={700} color={theme.primary}>
          STREAMIX
        </Text>
      </View>

      {/* Menu Column */}
      <Column {...props} onFocus={onFocus} onRight={onRight} style={ColumnStyle} scroll="none">
        <NavButton route="/" onEnter={() => go("/")} isActive={isActive("/")}>
          Início
        </NavButton>
        <NavButton route="/movies" onEnter={() => go("/movies")} isActive={isActive("/movies")}>
          Filmes
        </NavButton>
        <NavButton route="/series" onEnter={() => go("/series")} isActive={isActive("/series")}>
          Séries
        </NavButton>
        <NavButton route="/channels" onEnter={() => go("/channels")} isActive={isActive("/channels")}>
          Canais
        </NavButton>
        <View style={DividerStyle} skipFocus />
        <NavButton route="/search" onEnter={() => go("/search")} isActive={isActive("/search")}>
          Buscar
        </NavButton>
        <NavButton route="/guide" onEnter={() => go("/guide")} isActive={isActive("/guide")}>
          Guia TV
        </NavButton>
        <NavButton route="/favorites" onEnter={() => go("/favorites")} isActive={isActive("/favorites")}>
          Favoritos
        </NavButton>
        <Show when={authState.user()}>
          <View style={DividerStyle} skipFocus />
          <NavButton route="/profile" onEnter={() => go("/profile")} isActive={isActive("/profile")}>
            Perfil
          </NavButton>
        </Show>
      </Column>

      {/* Version */}
      <View skipFocus y={1020} x={20} zIndex={105}>
        <Text fontSize={12} color={theme.textDisabled}>
          v1.0.0
        </Text>
      </View>
    </>
  );
};

export default Sidebar;
