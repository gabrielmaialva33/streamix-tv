import { type ElementNode, type IntrinsicNodeStyleProps, Text, View } from "@lightningtv/solid";
import { Column, Row } from "@lightningtv/solid/primitives";
import { createSignal, For } from "solid-js";
import { theme } from "@/styles";

export type KeyboardMode = "lower" | "upper" | "symbols";

const LAYOUTS: Record<KeyboardMode, string[][]> = {
  lower: [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l", "@"],
    ["z", "x", "c", "v", "b", "n", "m", ".", "_", "-"],
    ["ABC", "123", "SPC", "DEL", "OK"],
  ],
  upper: [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L", "@"],
    ["Z", "X", "C", "V", "B", "N", "M", ".", "_", "-"],
    ["abc", "123", "SPC", "DEL", "OK"],
  ],
  symbols: [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["!", "?", "#", "$", "%", "&", "*", "+", "=", "/"],
    ["(", ")", "[", "]", "{", "}", "<", ">", ":", ";"],
    [",", ".", "_", "-", "'", '"', "@", "|", "~", "^"],
    ["abc", "SPC", "DEL", "OK"],
  ],
};

const KEY_STYLE = {
  height: 64,
  borderRadius: 12,
  color: theme.surface,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  scale: 1,
  transition: { scale: { duration: 100 }, color: { duration: 100 } },
  $focus: {
    color: theme.primary,
    scale: 1.08,
  },
} satisfies IntrinsicNodeStyleProps;

export interface VirtualKeyboardProps {
  value: string;
  password?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onUp?: () => boolean;
  autofocus?: boolean;
  ref?: ElementNode;
}

const VirtualKeyboard = (props: VirtualKeyboardProps) => {
  const [mode, setMode] = createSignal<KeyboardMode>("lower");

  function handle(key: string) {
    if (key === "DEL") {
      props.onChange(props.value.slice(0, -1));
      return;
    }
    if (key === "OK") {
      props.onSubmit();
      return;
    }
    if (key === "SPC") {
      props.onChange(props.value + " ");
      return;
    }
    if (key === "ABC") {
      setMode("upper");
      return;
    }
    if (key === "abc") {
      setMode("lower");
      return;
    }
    if (key === "123") {
      setMode("symbols");
      return;
    }
    // Regular char
    props.onChange(props.value + key);
    if (mode() === "upper") setMode("lower");
  }

  const layout = () => LAYOUTS[mode()];

  return (
    <Column ref={props.ref} width={860} gap={10} scroll="none" autofocus={props.autofocus} onUp={props.onUp}>
      <For each={layout()}>
        {row => (
          <Row width={860} height={64} gap={10} scroll="none">
            <For each={row}>
              {key => {
                const isAction = ["ABC", "abc", "123", "SPC", "DEL", "OK"].includes(key);
                const isSubmit = key === "OK";
                const width = key === "SPC" ? 220 : isAction ? 110 : 70;
                return (
                  <View
                    width={width}
                    style={KEY_STYLE}
                    color={isSubmit ? theme.primary : theme.surface}
                    onEnter={() => {
                      handle(key);
                      return true;
                    }}
                  >
                    <Text
                      fontSize={22}
                      fontWeight={isAction ? 700 : 400}
                      color={0xffffffff}
                      textAlign="center"
                      contain="width"
                      width={width}
                    >
                      {key}
                    </Text>
                  </View>
                );
              }}
            </For>
          </Row>
        )}
      </For>
    </Column>
  );
};

export default VirtualKeyboard;
