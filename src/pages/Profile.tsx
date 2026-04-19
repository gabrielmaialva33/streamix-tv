import { type ElementNode, type IntrinsicNodeStyleProps, Text, View } from "@lightningtv/solid";
import { Column, Row } from "@lightningtv/solid/primitives";
import { createEffect, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { authState, signOut } from "@/features/auth/auth";
import { navResetTick } from "@/shared/navReset";
import { theme } from "@/styles";

const ActionButtonStyle = {
  width: 360,
  height: 64,
  borderRadius: 14,
  color: theme.surface,
  border: { color: theme.border, width: 1 },
  display: "flex",
  alignItems: "center",
  transition: {
    color: { duration: 150 },
    scale: { duration: 150 },
  },
  scale: 1,
  $focus: {
    color: theme.primary,
    border: { color: theme.primary, width: 2 },
    scale: 1.02,
  },
} satisfies IntrinsicNodeStyleProps;

const Profile = () => {
  const navigate = useNavigate();

  let actionsColumn: ElementNode | undefined;

  // Re-click "Perfil" in the sidebar → snap focus back to the first action.
  let navResetSeen = 0;
  createEffect(() => {
    const t = navResetTick();
    if (navResetSeen === 0) {
      navResetSeen = t;
      return;
    }
    navResetSeen = t;
    actionsColumn?.setFocus();
  });

  const initial = () => {
    const name = authState.user()?.name || authState.user()?.email || "";
    return name.trim().charAt(0).toUpperCase() || "?";
  };

  const handleSignOut = () => {
    void signOut().then(() => navigate("/login"));
    return true;
  };

  return (
    <View
      width={1700}
      height={1080}
      color={theme.background}
      forwardFocus={() => {
        actionsColumn?.setFocus();
        return true;
      }}
    >
      {/* Header */}
      <View x={60} y={60} width={1580} skipFocus>
        <Text fontSize={42} fontWeight={700} color={0xffffffff}>
          Perfil
        </Text>
        <Text y={52} fontSize={18} color={theme.textSecondary}>
          Gerencie sua conta Streamix.
        </Text>
      </View>

      {/* Avatar + identity */}
      <Row x={60} y={170} width={1580} height={180} gap={32} scroll="none" skipFocus>
        <View
          width={160}
          height={160}
          borderRadius={80}
          color={theme.primary}
          display="flex"
          justifyContent="center"
          alignItems="center"
          skipFocus
        >
          <Text fontSize={72} fontWeight={700} color={0xffffffff}>
            {initial()}
          </Text>
        </View>

        <View width={1380} skipFocus display="flex" flexDirection="column" justifyContent="center">
          <Show when={authState.user()?.name}>
            <Text fontSize={36} fontWeight={700} color={theme.textPrimary} maxLines={1} width={1380}>
              {authState.user()?.name || ""}
            </Text>
          </Show>
          <Text
            y={authState.user()?.name ? 48 : 0}
            fontSize={22}
            color={theme.textSecondary}
            maxLines={1}
            width={1380}
          >
            {authState.user()?.email || ""}
          </Text>
          <Text y={authState.user()?.name ? 84 : 36} fontSize={16} color={theme.textMuted}>
            v1.0.0
          </Text>
        </View>
      </Row>

      {/* Actions */}
      <Column ref={actionsColumn} x={60} y={420} width={360} height={500} gap={16} autofocus scroll="none">
        <View style={ActionButtonStyle} onEnter={handleSignOut}>
          <Text x={22} fontSize={20} fontWeight={700} color={theme.textPrimary}>
            Sair da conta
          </Text>
        </View>
      </Column>
    </View>
  );
};

export default Profile;
