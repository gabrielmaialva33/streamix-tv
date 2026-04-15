import { ElementNode, type NodeProps, Text, View } from "@lightningtv/solid";
import { Row as LightningRow } from "@lightningtv/solid/primitives";
import { children as resolveChildren, type JSX, Show } from "solid-js";

export interface ContentRowProps extends NodeProps {
  title?: string;
  children: JSX.Element;
  onSelectedChanged?: (selected: number) => void;
  onItemSelected?: (item: any) => void;
  autofocus?: boolean;
  /** Forwarded to the inner Lightning Row. */
  onUpRequest?: () => boolean;
}

// ContentRow = optional title + horizontal LightningRow.
// Keep focus props on the inner row only to avoid conflicting focus targets.
const ContentRow = (props: ContentRowProps) => {
  const resolved = resolveChildren(() => props.children);

  function handleEnter(this: ElementNode) {
    const focused = this.children.find(c => c.states?.has("$focus")) as ElementNode | undefined;
    if (focused && focused.item) {
      props.onItemSelected?.(focused.item);
      return true;
    }
    return false;
  }

  return (
    <View
      width={1700}
      height={props.title ? 520 : 460}
      // Forward focus to the LightningRow instead of the wrapper View.
      forwardFocus={props.title ? 1 : 0}
    >
      <Show when={props.title}>
        <Text x={20} fontSize={32} fontWeight={700} color={0xffffffff} y={0} zIndex={10}>
          {props.title}
        </Text>
      </Show>

      <LightningRow
        x={20}
        y={props.title ? 50 : 0}
        width={1660}
        height={460}
        gap={24}
        scroll="always"
        plinko
        autofocus={props.autofocus}
        onEnter={handleEnter}
        onUp={props.onUpRequest}
        onSelectedChanged={(idx, _el, _child, _lastIdx) => {
          props.onSelectedChanged?.(idx);
        }}
      >
        {resolved()}
      </LightningRow>
    </View>
  );
};

export default ContentRow;
