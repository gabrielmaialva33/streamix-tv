import { ElementNode, type NodeProps, Text, View } from "@solidtv/solid";
import { LazyRow } from "@solidtv/solid/primitives";
import { type Accessor, type JSX, Show } from "solid-js";

export interface ContentRowProps<T> extends Omit<NodeProps, "children" | "ref" | "onFocus"> {
  /** Ref to the actual navigable LazyRow, never to the transparent wrapper. */
  ref?: ElementNode | ((element: ElementNode) => void);
  onFocus?: ElementNode["onFocus"];
  title?: string;
  items: readonly T[] | null | undefined;
  renderItem: (item: Accessor<T>, index: number) => JSX.Element;
  onSelectedChanged?: (selected: number) => void;
  onItemSelected?: (item: T) => void;
  autofocus?: boolean;
  /** Forwarded to the inner LazyRow. */
  onUpRequest?: () => boolean;
}

/**
 * Reusable, data-driven content rail. LazyRow keeps the initial WebGL node and
 * texture burst bounded, then mounts the remaining cards while the renderer is
 * idle so D-pad navigation never has to create the next card synchronously.
 */
const ContentRow = <T,>(props: ContentRowProps<T>) => {
  function handleEnter(this: ElementNode) {
    const focused = this.children.find(child => child.states?.has("$focus")) as ElementNode | undefined;
    if (focused?.item !== undefined) {
      props.onItemSelected?.(focused.item as T);
      return true;
    }
    return false;
  }

  return (
    <View
      width={1700}
      height={props.title ? 520 : 460}
      // Forward focus to the LazyRow instead of the wrapper View.
      forwardFocus={props.title ? 1 : 0}
    >
      <Show when={props.title}>
        <Text x={40} fontSize={32} fontWeight={700} color={0xffffffff} y={0} zIndex={10}>
          {props.title}
        </Text>
      </Show>

      <LazyRow
        ref={props.ref}
        onFocus={props.onFocus}
        x={40}
        y={props.title ? 50 : 0}
        width={1620}
        height={460}
        gap={24}
        scroll="always"
        plinko
        each={props.items}
        upCount={7}
        buffer={2}
        delay={180}
        sync
        eagerLoad
        autofocus={props.autofocus}
        onEnter={handleEnter}
        onUp={props.onUpRequest}
        onSelectedChanged={index => props.onSelectedChanged?.(index)}
      >
        {props.renderItem}
      </LazyRow>
    </View>
  );
};

export default ContentRow;
