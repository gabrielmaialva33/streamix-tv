import { ElementNode, type IntrinsicNodeStyleProps, Text, View } from "@solidtv/solid";
import { Show } from "solid-js";
import { theme } from "@/styles";

const PANEL_WIDTH = 760;
const PANEL_HEIGHT = 320;
const BUTTON_WIDTH = 250;

const ButtonStyle = {
  height: 60,
  borderRadius: 30,
  color: theme.surfaceLight,
  border: { color: theme.borderLight, width: 2 },
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  scale: 1,
  transition: {
    color: { duration: 150, easing: "ease-out" },
    scale: { duration: 150, easing: "ease-out" },
  },
  $focus: {
    color: theme.primary,
    border: { color: theme.primaryLight, width: 2 },
    scale: 1.05,
  },
} satisfies IntrinsicNodeStyleProps;

export interface LoadErrorProps {
  width: number;
  height: number;
  x?: number;
  y?: number;
  title?: string;
  message: string;
  retryLabel?: string;
  onRetry: () => unknown;
  onBack?: () => unknown;
}

const LoadError = (props: LoadErrorProps) => {
  let retryButton: ElementNode | undefined;
  let backButton: ElementNode | undefined;

  const panelWidth = () => Math.min(PANEL_WIDTH, Math.max(400, props.width - 80));
  const panelX = () => (props.width - panelWidth()) / 2;
  const panelY = () => Math.max(0, (props.height - PANEL_HEIGHT) / 2);
  const buttonRowWidth = () => (props.onBack ? BUTTON_WIDTH * 2 + 20 : BUTTON_WIDTH);

  function retry() {
    void props.onRetry();
    return true;
  }

  function back() {
    if (!props.onBack) return false;
    void props.onBack();
    return true;
  }

  return (
    <View
      x={props.x ?? 0}
      y={props.y ?? 0}
      width={props.width}
      height={props.height}
      forwardFocus={() => {
        retryButton?.setFocus();
        return retryButton !== undefined;
      }}
      onBack={back}
      onLast={back}
    >
      <View
        x={panelX()}
        y={panelY()}
        width={panelWidth()}
        height={PANEL_HEIGHT}
        color={theme.panel}
        border={{ color: theme.panelBorder, width: 1 }}
        borderRadius={24}
      >
        <View
          x={(panelWidth() - 64) / 2}
          y={34}
          width={64}
          height={64}
          color={theme.surfaceActive}
          border={{ color: theme.primary, width: 2 }}
          borderRadius={32}
          display="flex"
          justifyContent="center"
          alignItems="center"
          skipFocus
        >
          <Text fontSize={40} fontWeight={700} color={theme.primaryLight}>
            !
          </Text>
        </View>

        <Text
          x={40}
          y={116}
          width={panelWidth() - 80}
          fontSize={30}
          fontWeight={700}
          color={theme.textPrimary}
          textAlign="center"
          contain="width"
          maxLines={1}
        >
          {props.title ?? "Não foi possível carregar"}
        </Text>
        <Text
          x={60}
          y={162}
          width={panelWidth() - 120}
          fontSize={19}
          lineHeight={27}
          color={theme.textSecondary}
          textAlign="center"
          contain="both"
          maxLines={2}
        >
          {props.message}
        </Text>

        <View
          x={(panelWidth() - buttonRowWidth()) / 2}
          y={232}
          width={buttonRowWidth()}
          height={60}
          display="flex"
          flexDirection="row"
          gap={20}
        >
          <View
            ref={retryButton}
            width={BUTTON_WIDTH}
            style={ButtonStyle}
            forwardStates
            autofocus
            onEnter={retry}
            onRight={() => {
              if (!backButton) return false;
              backButton.setFocus();
              return true;
            }}
          >
            <Text fontSize={20} fontWeight={700} color={theme.textPrimary}>
              {props.retryLabel ?? "Tentar novamente"}
            </Text>
          </View>
          <Show when={props.onBack}>
            <View
              ref={backButton}
              width={BUTTON_WIDTH}
              style={ButtonStyle}
              forwardStates
              onEnter={back}
              onLeft={() => {
                retryButton?.setFocus();
                return true;
              }}
            >
              <Text fontSize={20} fontWeight={700} color={theme.textPrimary}>
                Voltar
              </Text>
            </View>
          </Show>
        </View>
      </View>
    </View>
  );
};

export default LoadError;
