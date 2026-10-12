import { type ElementNode, type IntrinsicNodeStyleProps, Text, View } from "@solidtv/solid";
import { Column, Row } from "@solidtv/solid/primitives";
import { createEffect, createSignal, For } from "solid-js";
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
  onChange: (value: string) => void;
  onSubmit: () => void;
  onLeft?: () => boolean;
  onRight?: () => boolean;
  onUp?: () => boolean;
  autofocus?: boolean;
  homeRow?: number;
  focusRequest?: number;
  resetKey?: string | number;
  ref?: ElementNode;
}

const VirtualKeyboard = (props: VirtualKeyboardProps) => {
  const [mode, setMode] = createSignal<KeyboardMode>("lower");
  const keyRefs: Record<string, ElementNode | undefined> = {};
  /**
   * The keyboard's own handle on its Column.
   *
   * `props.ref` cannot serve: the JSX compiler wraps a parent's `ref={let}` in a
   * setter, so inside this component the prop is a *function*, never a node.
   * Writing `props.ref.selected` landed on that function and did nothing, so the
   * Column's selected row never followed the key that focusAt had focused — and
   * the next arrow press resolved from a stale row. Visible as arrows jumping to
   * the wrong key after every field change on Login and after returning from the
   * suggestions on Search.
   */
  let columnRef: ElementNode | undefined;

  createEffect(() => {
    const resetKey = props.resetKey;

    if (resetKey !== undefined) {
      setMode("lower");
      focusHome();
    }
  });

  createEffect(() => {
    const focusRequest = props.focusRequest;

    if (focusRequest !== undefined) {
      focusHome();
    }
  });

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

  function focusAt(rowIndex: number, keyIndex: number) {
    const key = layout()[rowIndex]?.[keyIndex];
    const target = key ? keyRefs[key] : undefined;

    if (!target) return false;
    if (columnRef) {
      columnRef.selected = rowIndex;
      const row = columnRef.children?.[rowIndex];
      if (row) row.selected = keyIndex;
    }
    target.setFocus();
    return true;
  }

  function focusHome() {
    requestAnimationFrame(() => {
      if (!focusAt(props.homeRow ?? 0, 0)) {
        columnRef?.setFocus();
      }
    });
  }

  return (
    <Column
      ref={node => {
        columnRef = node;
        // Still honour the parent's ref, in either form the compiler hands us.
        const forward = props.ref as unknown;
        if (typeof forward === "function") (forward as (n: ElementNode) => void)(node);
      }}
      width={860}
      gap={10}
      scroll="none"
      autofocus={props.autofocus}
      selected={props.homeRow ?? 0}
      plinko
      onLeft={props.onLeft}
      onRight={props.onRight}
      onUp={props.onUp}
    >
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
                    ref={node => {
                      keyRefs[key] = node;
                    }}
                    width={width}
                    style={KEY_STYLE}
                    // Solid red is the focus signal on this grid, so the submit
                    // key cannot also own it: two identical red rectangles meant
                    // the viewer could not tell which one the remote was on.
                    // Outline marks it as primary without stealing the signal.
                    color={theme.surface}
                    border={isSubmit ? { color: theme.primary, width: 2 } : undefined}
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
