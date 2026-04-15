import {
  type IntrinsicNodeStyleProps,
  type IntrinsicTextNodeStyleProps,
  Text,
  View,
} from "@lightningtv/solid";
import { createSignal } from "solid-js";
import { theme } from "../styles";

// Full-screen dim overlay behind the dialog.
const OverlayStyle = {
  width: 1920,
  height: 1080,
  color: 0x000000cc,
  zIndex: 1000,
} satisfies IntrinsicNodeStyleProps;

// Center the dialog with fixed dimensions to keep layout stable.
const DIALOG_W = 560;
const DIALOG_H = 320;
const DIALOG_X = (1920 - DIALOG_W) / 2;
const DIALOG_Y = (1080 - DIALOG_H) / 2;

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
  fontWeight: "bold",
  color: 0xffffffff,
} satisfies IntrinsicTextNodeStyleProps;

export interface ExitDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

const ExitDialog = (props: ExitDialogProps) => {
  const [selectedButton, setSelectedButton] = createSignal(1);

  return (
    <View style={OverlayStyle}>
      <View
        style={DialogStyle}
        autofocus
        onBack={props.onCancel}
        onLast={props.onCancel}
        onLeft={() => {
          setSelectedButton(0);
          return true;
        }}
        onRight={() => {
          setSelectedButton(1);
          return true;
        }}
      >
        <Text
          x={0}
          y={48}
          width={DIALOG_W}
          fontSize={28}
          fontWeight="bold"
          color={0xffffffff}
          textAlign="center"
        >
          Sair do Streamix?
        </Text>

        <Text x={0} y={100} width={DIALOG_W} fontSize={18} color={0xaaaaaaff} textAlign="center">
          Deseja realmente sair do aplicativo?
        </Text>

        <View x={48} y={200} width={464} height={56} display="flex" flexDirection="row" gap={24}>
          <View
            style={ButtonStyle}
            forwardStates
            autofocus={selectedButton() === 0}
            onEnter={props.onConfirm}
            onFocus={() => setSelectedButton(0)}
          >
            <Text style={ButtonTextStyle}>Sair</Text>
          </View>

          <View
            style={ButtonStyle}
            forwardStates
            autofocus={selectedButton() === 1}
            onEnter={props.onCancel}
            onFocus={() => setSelectedButton(1)}
          >
            <Text style={ButtonTextStyle}>Cancelar</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

export default ExitDialog;
