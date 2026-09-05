import {
  ElementNode,
  type IntrinsicNodeStyleProps,
  type IntrinsicTextNodeStyleProps,
  Text,
  View,
} from "@solidtv/solid";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "@/shared/layout";
import { theme } from "@/styles";

// Full-screen dim overlay behind the dialog.
const OverlayStyle = {
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
  color: 0x000000cc,
  zIndex: 1000,
} satisfies IntrinsicNodeStyleProps;

// Center the dialog with fixed dimensions to keep layout stable.
const DIALOG_W = 560;
const DIALOG_H = 320;
const DIALOG_X = (SCREEN_WIDTH - DIALOG_W) / 2;
const DIALOG_Y = (SCREEN_HEIGHT - DIALOG_H) / 2;

const DialogStyle = {
  width: DIALOG_W,
  height: DIALOG_H,
  x: DIALOG_X,
  y: DIALOG_Y,
  color: 0x1a1a2eff,
  borderRadius: 16,
  zIndex: 1001,
  border: { color: theme.primary, width: 2 },
} satisfies IntrinsicNodeStyleProps;

const ButtonStyle = {
  width: 220,
  height: 56,
  borderRadius: 28,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  color: 0x333333ff,
  scale: 1,
  transition: {
    color: { duration: 150, easing: "ease-out" },
    scale: { duration: 150, easing: "ease-out" },
  },
  $focus: {
    color: theme.primary,
    scale: 1.06,
  },
} satisfies IntrinsicNodeStyleProps;

const ButtonTextStyle = {
  fontSize: 22,
  fontWeight: 700,
  color: 0xffffffff,
} satisfies IntrinsicTextNodeStyleProps;

export interface ExitDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

const ExitDialog = (props: ExitDialogProps) => {
  let confirmButton: ElementNode | undefined;
  let cancelButton: ElementNode | undefined;

  function focusConfirm() {
    confirmButton?.setFocus();
    return true;
  }

  function focusCancel() {
    cancelButton?.setFocus();
    return true;
  }

  return (
    <View id="exitDialog" style={OverlayStyle}>
      <View
        style={DialogStyle}
        forwardFocus={() => focusCancel()}
        onBack={props.onCancel}
        onLast={props.onCancel}
        onLeft={focusConfirm}
        onRight={focusCancel}
      >
        <Text
          x={0}
          y={48}
          width={DIALOG_W}
          fontSize={28}
          fontWeight={700}
          color={0xffffffff}
          textAlign="center"
          contain="width"
        >
          Sair do Streamix?
        </Text>

        <Text
          x={0}
          y={100}
          width={DIALOG_W}
          fontSize={18}
          color={0xaaaaaaff}
          textAlign="center"
          contain="width"
        >
          Deseja realmente sair do aplicativo?
        </Text>

        <View x={48} y={200} width={464} height={56} display="flex" flexDirection="row" gap={24}>
          <View
            ref={confirmButton}
            style={ButtonStyle}
            forwardStates
            onEnter={props.onConfirm}
            onRight={focusCancel}
          >
            <Text style={ButtonTextStyle}>Sair</Text>
          </View>

          <View
            ref={cancelButton}
            style={ButtonStyle}
            forwardStates
            autofocus
            onEnter={props.onCancel}
            onLeft={focusConfirm}
          >
            <Text style={ButtonTextStyle}>Cancelar</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

export default ExitDialog;
