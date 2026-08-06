import { type IntrinsicNodeStyleProps, type NodeProps, Text, View } from "@solidtv/solid";
import { LazyRow } from "@solidtv/solid/primitives";
import { createSignal, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { history, type HistoryItem } from "@/lib/storage";
import { proxyImageUrl } from "@/lib/imageUrl";
import { theme } from "@/styles";

const CardStyle = {
  width: 320,
  height: 180,
  color: theme.surface,
  borderRadius: 10,
  border: { color: theme.border, width: 1 },
  scale: 1,
  transition: {
    scale: { duration: 150, easing: "ease-out" },
    color: { duration: 150, easing: "ease-out" },
  },
  $focus: {
    scale: 1.04,
    color: theme.surfaceHover,
    border: { color: theme.primary, width: 2 },
  },
} satisfies IntrinsicNodeStyleProps;

const ProgressBarStyle = {
  height: 4,
  color: theme.borderLight,
  borderRadius: 2,
} satisfies IntrinsicNodeStyleProps;

export interface ContinueWatchingRowProps extends NodeProps {
  limit?: number;
}

const ContinueWatchingRow = (props: ContinueWatchingRowProps) => {
  const navigate = useNavigate();
  const [items, setItems] = createSignal<HistoryItem[]>([]);

  // localStorage isn't reactive — read once on mount (the row remounts on
  // every Home visit, which keeps it fresh enough).
  onMount(() => {
    setItems(history.getContinueWatching(props.limit || 10));
  });

  const handleSelect = (item: HistoryItem) => {
    if (item.type === "movie") {
      navigate(`/player/movie/${item.id}`);
    } else if (item.type === "series" && item.episodeId) {
      const seriesContext = item.seriesId ? `?series=${item.seriesId}` : "";
      navigate(`/player/series/${item.episodeId}${seriesContext}`);
    } else if (item.type === "channel") {
      navigate(`/player/channel/${item.id}`);
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m restantes`;
    return `${m}m restantes`;
  };

  return (
    <View {...props} width={1700} height={280}>
      <Text x={20} fontSize={32} fontWeight={700} color={0xffffffff}>
        Continue Assistindo
      </Text>

      <Show when={items().length === 0}>
        <View
          x={20}
          y={50}
          width={320}
          height={180}
          color={theme.surface}
          borderRadius={10}
          border={{ color: theme.border, width: 1 }}
          display="flex"
          justifyContent="center"
          alignItems="center"
        >
          <Text fontSize={16} color={theme.textMuted}>
            Nenhum conteúdo em andamento
          </Text>
        </View>
      </Show>

      <Show when={items().length > 0}>
        <LazyRow
          x={20}
          y={50}
          width={1660}
          height={200}
          gap={20}
          scroll="auto"
          each={items()}
          upCount={6}
          buffer={1}
          delay={180}
          sync
        >
          {item => (
            <View item={item()} style={CardStyle} onEnter={() => handleSelect(item())} forwardStates>
              {/* Thumbnail/Poster */}
              <Show when={item().posterUrl}>
                <View
                  width={120}
                  height={180}
                  src={proxyImageUrl(item().posterUrl, 120)}
                  color={0xffffffff}
                  borderRadius={10}
                  textureOptions={{ resizeMode: { type: "cover", clipX: 0.5, clipY: 0.15 } }}
                />
              </Show>
              <Show when={!item().posterUrl}>
                <View width={120} height={180} color={theme.surfaceLight} borderRadius={10} />
              </Show>

              {/* Info */}
              <View x={130} y={10} width={180}>
                <Text
                  fontSize={16}
                  fontWeight={700}
                  color={theme.textPrimary}
                  contain="width"
                  width={180}
                  maxLines={2}
                >
                  {item().title}
                </Text>

                {/* Episode info for series */}
                <Show when={item().type === "series" && item().episodeTitle}>
                  <Text
                    y={45}
                    fontSize={13}
                    color={theme.textSecondary}
                    contain="width"
                    width={180}
                    maxLines={1}
                  >
                    {`S${item().seasonNumber}E${item().episodeNumber}`}
                  </Text>
                </Show>

                {/* Time remaining */}
                <Text y={item().type === "series" ? 70 : 50} fontSize={12} color={theme.textMuted}>
                  {formatTime(item().duration - item().currentTime)}
                </Text>
              </View>

              {/* Progress bar */}
              <View x={10} y={165} width={300}>
                <View width={300} style={ProgressBarStyle}>
                  <View
                    width={Math.max(0, (300 * item().progress) / 100)}
                    height={4}
                    color={theme.primary}
                    borderRadius={2}
                  />
                </View>
              </View>
            </View>
          )}
        </LazyRow>
      </Show>
    </View>
  );
};

export default ContinueWatchingRow;
