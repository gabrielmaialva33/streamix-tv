import { Text, View } from "@solidtv/solid";
import { ErrorBoundary, type JSX } from "solid-js";
import { createLogger } from "@/shared/logging/logger";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "@/shared/layout";
import { theme } from "@/styles";

const logger = createLogger("AppErrorBoundary");

/**
 * Last line of defence for a render-time throw.
 *
 * On a TV there is no reload: an uncaught error in a reactive getter leaves the
 * last painted frame on screen with no focus and no Back, and the session is
 * simply over. One malformed field reaching a card renderer is enough — a
 * rating arriving as a string, a provider payload missing `providers`.
 *
 * So this trades a blank set for a screen that at least says what happened and
 * offers the only recovery a TV app has: restarting the view.
 */
export default function AppErrorBoundary(props: { children: JSX.Element }): JSX.Element {
  return (
    <ErrorBoundary
      fallback={(error, reset) => {
        logger.error("Unhandled render error", error);
        return (
          <View width={SCREEN_WIDTH} height={SCREEN_HEIGHT} color={theme.background}>
            <View
              x={360}
              y={380}
              width={1200}
              height={320}
              color={theme.panel}
              borderRadius={20}
              border={{ color: theme.panelBorder, width: 2 }}
            >
              <Text x={48} y={48} fontSize={34} fontWeight={700} color={theme.textPrimary}>
                Algo deu errado
              </Text>
              <Text x={48} y={104} width={1100} fontSize={20} color={theme.textSecondary} contain="width">
                O aplicativo encontrou um problema inesperado nesta tela.
              </Text>

              <View
                x={48}
                y={176}
                width={280}
                height={64}
                borderRadius={12}
                color={theme.surfaceLight}
                border={{ color: theme.border, width: 2 }}
                autofocus
                onEnter={() => {
                  reset();
                  return true;
                }}
                $focus={{ color: theme.primary, border: { color: theme.primary, width: 3 }, scale: 1.03 }}
              >
                <Text
                  x={0}
                  y={18}
                  width={280}
                  fontSize={22}
                  fontWeight={700}
                  color={theme.textPrimary}
                  textAlign="center"
                  contain="width"
                >
                  Tentar de novo
                </Text>
              </View>
            </View>
          </View>
        );
      }}
    >
      {props.children}
    </ErrorBoundary>
  );
}
