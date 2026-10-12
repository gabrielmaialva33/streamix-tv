import { type ElementNode, Text, View } from "@solidtv/solid";
import { Row } from "@solidtv/solid/primitives";
import { For, Show } from "solid-js";
import { theme } from "@/styles";
import { distinctDetails, type PlaybackSource, type ProviderStatus } from "./playbackSources";

const CARD_WIDTH = 320;
const CARD_HEIGHT = 128;
export const SOURCE_PICKER_HEIGHT = 56 + CARD_HEIGHT + 16;

/** Same mapping the sidebar uses, so a provider's colour means one thing app-wide. */
function statusColor(status: ProviderStatus): number {
  if (status === "healthy") return theme.success;
  if (status === "degraded") return theme.warning;
  if (status === "unhealthy") return theme.primaryLight;
  return theme.textDisabled;
}

function statusLabel(status: ProviderStatus): string | null {
  if (status === "degraded") return "Instável";
  if (status === "unhealthy") return "Fora do ar";
  return null;
}

// Focus follows the poster-card contract (Card.tsx): fill, 3px primary border
// and a small scale, so a focused source reads the same as a focused poster.
const CardStyle = {
  width: CARD_WIDTH,
  height: CARD_HEIGHT,
  borderRadius: 14,
  color: theme.surface,
  border: { color: theme.border, width: 1 },
  transition: { scale: { duration: 150, easing: "ease-out" } },
  scale: 1,
  $focus: {
    color: theme.surfaceHover,
    border: { color: theme.primary, width: 3 },
    scale: 1.04,
  },
} as const;

export interface SourcePickerProps {
  sources: PlaybackSource[];
  onPick: (source: PlaybackSource) => void;
  onUp?: () => boolean;
  onDown?: () => boolean;
  ref?: (node: ElementNode) => void;
}

/**
 * "Onde assistir": every copy of this title the viewer can play, one card each.
 *
 * The same film lives in several providers as separate entries that differ in
 * exactly what the viewer chooses by — dubbed or subtitled, 4K or 720p, which
 * provider is up right now. The web app shows this list; on the TV it used to
 * be invisible, so the only recovery when a copy failed was to go find the
 * film again under another provider by hand.
 *
 * A horizontal row because the action row above already owns Up, and Left and
 * Right are free here; OK plays that copy.
 */
export default function SourcePicker(props: SourcePickerProps) {
  const details = () => distinctDetails(props.sources);

  return (
    <View width={1620} height={SOURCE_PICKER_HEIGHT} x={40} forwardFocus={1}>
      <Text y={0} fontSize={26} fontWeight={700} color={theme.textPrimary}>
        Onde assistir
      </Text>
      <Text x={240} y={8} fontSize={18} color={theme.textMuted}>
        {`${props.sources.length} ${props.sources.length === 1 ? "fonte" : "fontes"}`}
      </Text>

      <Row
        ref={props.ref}
        y={56}
        width={1620}
        height={CARD_HEIGHT + 12}
        gap={20}
        scroll="auto"
        onUp={props.onUp}
        onDown={props.onDown}
      >
        <For each={props.sources}>
          {(source, index) => (
            <View
              style={CardStyle}
              onEnter={() => {
                props.onPick(source);
                return true;
              }}
            >
              <View
                x={20}
                y={24}
                width={12}
                height={12}
                borderRadius={6}
                color={statusColor(source.providerStatus)}
              />
              <Text
                x={42}
                y={16}
                width={CARD_WIDTH - (source.current ? 132 : 62)}
                fontSize={22}
                fontWeight={700}
                color={theme.textPrimary}
                contain="width"
                maxLines={1}
              >
                {source.providerName}
              </Text>

              {/* The copy this page is about. On a film it is what the main
                  button plays; on a series, picking it just goes back up. */}
              <Show when={source.current}>
                <Text
                  x={CARD_WIDTH - 20}
                  mountX={1}
                  y={21}
                  fontSize={16}
                  fontWeight={700}
                  color={theme.textMuted}
                >
                  ATUAL
                </Text>
              </Show>

              <Show when={source.recommended || statusLabel(source.providerStatus)}>
                <Text
                  x={20}
                  y={52}
                  fontSize={16}
                  fontWeight={700}
                  color={source.recommended ? theme.primaryLight : theme.warning}
                >
                  {source.recommended ? "RECOMENDADA" : (statusLabel(source.providerStatus) ?? "")}
                </Text>
              </Show>

              <Show when={details()[index()]}>
                <Text
                  x={20}
                  y={86}
                  width={CARD_WIDTH - 40}
                  fontSize={18}
                  color={theme.textSecondary}
                  contain="width"
                  maxLines={1}
                >
                  {details()[index()]}
                </Text>
              </Show>
            </View>
          )}
        </For>
      </Row>
    </View>
  );
}
