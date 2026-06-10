import { type IntrinsicNodeStyleProps, type NodeProps, Text, View } from "@lightningtv/solid";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { authState, persistFavoriteChange } from "@/features/auth/auth";
import { type FavoriteItem, favorites } from "@/lib/storage";
import { theme } from "@/styles";

const ButtonStyle = {
  borderRadius: 18,
  color: theme.surfaceLight,
  border: { color: theme.border, width: 2 },
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  transition: {
    color: { duration: 150 },
    scale: { duration: 150 },
  },
  scale: 1,
  $focus: {
    color: theme.surfaceHover,
    border: { color: theme.primary, width: 2 },
    scale: 1.03,
  },
} satisfies IntrinsicNodeStyleProps;

export interface FavoriteButtonProps extends NodeProps {
  item: Omit<FavoriteItem, "addedAt">;
  onToggle?: (isFavorite: boolean) => void;
  /** Match the sibling buttons in the action row. */
  width?: number;
  height?: number;
}

const FavoriteButton = (props: FavoriteButtonProps) => {
  const width = () => props.width ?? 220;
  const height = () => props.height ?? 58;
  const [isFavorite, setIsFavorite] = createSignal(favorites.isFavorite(props.item.id, props.item.type));
  const [feedbackTone, setFeedbackTone] = createSignal<"neutral" | "warning" | "success">("neutral");
  let feedbackTimeout: number | null = null;

  // Update when item changes
  createEffect(() => {
    setIsFavorite(favorites.isFavorite(props.item.id, props.item.type));
  });

  onCleanup(() => {
    if (feedbackTimeout) {
      clearTimeout(feedbackTimeout);
    }
  });

  // Flash the button border/colors for a moment to acknowledge the action.
  function showFeedback(tone: "neutral" | "warning" | "success") {
    setFeedbackTone(tone);

    if (feedbackTimeout) {
      clearTimeout(feedbackTimeout);
    }

    feedbackTimeout = window.setTimeout(() => {
      setFeedbackTone("neutral");
      feedbackTimeout = null;
    }, 2200);
  }

  const handleToggle = () => {
    const previousState = isFavorite();
    const newState = favorites.toggle(props.item);
    setIsFavorite(newState);
    props.onToggle?.(newState);

    if (!authState.isAuthenticated()) {
      // Saved locally only ("nesta TV") — no sync to acknowledge.
      showFeedback("neutral");
      return true;
    }

    void persistFavoriteChange(props.item, newState)
      .then(() => {
        showFeedback("success");
      })
      .catch(() => {
        // Unauthorized or transient failure — either way roll the toggle back.
        favorites.toggle(props.item);
        setIsFavorite(previousState);
        props.onToggle?.(previousState);
        showFeedback("warning");
      });

    return true;
  };

  return (
    <View
      {...props}
      width={width()}
      height={height()}
      style={ButtonStyle}
      color={
        feedbackTone() === "success"
          ? 0x15261cff
          : feedbackTone() === "warning"
            ? 0x2e171bff
            : theme.surfaceLight
      }
      border={{
        color:
          feedbackTone() === "success"
            ? 0x2d8f4eff
            : feedbackTone() === "warning"
              ? 0xb85c5cff
              : theme.border,
        width: 2,
      }}
      onEnter={handleToggle}
      forwardStates
    >
      <Text
        width={width() - 32}
        fontSize={20}
        fontWeight={700}
        color={
          feedbackTone() === "success"
            ? 0x9cf2b0ff
            : feedbackTone() === "warning"
              ? 0xffb4b4ff
              : isFavorite()
                ? theme.primary
                : theme.textPrimary
        }
        textAlign="center"
        contain="width"
        maxLines={1}
      >
        {isFavorite() ? "Na minha lista" : "Salvar"}
      </Text>
    </View>
  );
};

export default FavoriteButton;
