import { View, Text, type NodeProps, ElementNode } from "@lightningtv/solid";
import { Row as LightningRow } from "@lightningtv/solid/primitives";
import { Show, children as resolveChildren, type JSX } from "solid-js";

export interface ContentRowProps extends NodeProps {
  title?: string;
  children: JSX.Element;
  onSelectedChanged?: (selected: number) => void;
  onItemSelected?: (item: any) => void;
  autofocus?: boolean;
}

// ContentRow = Title (opcional) + LightningRow horizontal com plinko.
//
// IMPORTANTE: o `autofocus` chega so no LightningRow interno — nao no View
// outer. Se os 2 tiverem autofocus, o focus fica indefinido no Lightning.
// Mesmo motivo pra nao fazer `{...props}` no outer View: isso espalharia
// `autofocus`, `onSelectedChanged`, etc. em dois lugares.
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
      // Forward focus pro LightningRow (filho 1 se tiver title, 0 se nao).
      // Sem isso, o View tentaria receber foco ele mesmo.
      forwardFocus={props.title ? 1 : 0}
    >
      <Show when={props.title}>
        <Text x={20} fontSize={32} fontWeight="bold" color={0xffffffff} y={0} zIndex={10}>
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
