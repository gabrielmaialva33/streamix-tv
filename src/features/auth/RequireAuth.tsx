import { Text, View } from "@lightningtv/solid";
import { useLocation, useNavigate } from "@solidjs/router";
import { children, createEffect, type JSX, onMount, Show } from "solid-js";
import { initializeAuth, authState } from "./auth";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "@/shared/layout";
import { theme } from "@/styles";

interface RequireAuthProps {
  children?: JSX.Element;
}

const RequireAuth = (props: RequireAuthProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const resolvedChildren = children(() => props.children);

  onMount(() => {
    void initializeAuth();
  });

  createEffect(() => {
    if (authState.status() === "anonymous" && location.pathname !== "/login") {
      navigate("/login", { replace: true });
    }
  });

  return (
    <Show
      when={authState.isAuthenticated()}
      fallback={
        <View
          width={SCREEN_WIDTH}
          height={SCREEN_HEIGHT}
          color={theme.background}
          display="flex"
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          gap={24}
        >
          <Text fontSize={42} fontWeight={700} color={0xffffffff}>
            STREAMIX
          </Text>
          <Text fontSize={22} color={0xb8b8c0ff}>
            {authState.status() === "checking"
              ? "Verificando sua sessão..."
              : "Redirecionando para o login..."}
          </Text>
        </View>
      }
    >
      {resolvedChildren()}
    </Show>
  );
};

export default RequireAuth;
