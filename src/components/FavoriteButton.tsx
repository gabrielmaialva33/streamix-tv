import { type IntrinsicNodeStyleProps, type NodeProps, Text, View } from "@lightningtv/solid";
import { createEffect, createSignal } from "solid-js";
import { type FavoriteItem, favorites } from "../lib/storage";
import { theme } from "../styles";
import { authState, persistFavoriteChange } from "@/features/auth/auth";
import { ApiError } from "@/lib/api";

const ButtonStyle = {
  width: 50,
  height: 50,
  borderRadius: 25,
  color: 0x33333399,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  transition: {
    color: { duration: 150 },
    scale: { duration: 150 },
  },
  $focus: {
    color: 0x444444ff,
    scale: 1.1,
  },
} satisfies IntrinsicNodeStyleProps;

export interface FavoriteButtonProps extends NodeProps {
  item: Omit<FavoriteItem, "addedAt">;
  onToggle?: (isFavorite: boolean) => void;
}

const FavoriteButton = (props: FavoriteButtonProps) => {
  const [isFavorite, setIsFavorite] = createSignal(favorites.isFavorite(props.item.id, props.item.type));
  const [feedbackMessage, setFeedbackMessage] = createSignal<string | null>(null);
  const [feedbackTone, setFeedbackTone] = createSignal<"neutral" | "warning" | "success">("neutral");
  let feedbackTimeout: number | null = null;

  // Update when item changes
  createEffect(() => {
    setIsFavorite(favorites.isFavorite(props.item.id, props.item.type));
  });

  function showFeedback(message: string, tone: "neutral" | "warning" | "success" = "neutral") {
    setFeedbackMessage(message);
    setFeedbackTone(tone);

    if (feedbackTimeout) {
      clearTimeout(feedbackTimeout);
    }

    feedbackTimeout = window.setTimeout(() => {
      setFeedbackMessage(null);
      feedbackTimeout = null;
    }, 2200);
  }

  function getFeedbackColor() {
    switch (feedbackTone()) {
      case "success":
        return 0x14311dff;
      case "warning":
        return 0x3a1b1eff;
      default:
        return 0x20202bff;
    }
  }

  function getFeedbackTextColor() {
    switch (feedbackTone()) {
      case "success":
        return 0x9cf2b0ff;
      case "warning":
        return 0xffb4b4ff;
      default:
        return 0xffffffff;
    }
  }

  const handleToggle = () => {
    const previousState = isFavorite();
    const newState = favorites.toggle(props.item);
    setIsFavorite(newState);
    props.onToggle?.(newState);

    if (!authState.isAuthenticated()) {
      showFeedback(newState ? "Salvo nesta TV" : "Removido desta TV");
      return true;
    }

    void persistFavoriteChange(props.item, newState)
      .then(() => {
        showFeedback(newState ? "Favorito sincronizado" : "Removido da sua conta", "success");
      })
      .catch(error => {
        favorites.toggle(props.item);
        setIsFavorite(previousState);
        props.onToggle?.(previousState);

        if (error instanceof ApiError && error.isUnauthorized()) {
          showFeedback("Faça login para sincronizar", "warning");
          return;
        }

        showFeedback("Não foi possível sincronizar agora", "warning");
      });

    return true;
  };

  return (
    <View {...props} width={220} height={76} color={0x00000000} skipFocus>
      <View x={0} y={12} style={ButtonStyle} onEnter={handleToggle} forwardStates>
        <Text fontSize={28} color={isFavorite() ? theme.primary : 0xaaaaaaff}>
          {isFavorite() ? "★" : "☆"}
        </Text>
      </View>

      {feedbackMessage() ? (
        <View
          x={64}
          y={14}
          width={152}
          height={40}
          color={getFeedbackColor()}
          borderRadius={20}
          border={{ color: 0x3a3a48ff, width: 1 }}
          skipFocus
        >
          <Text
            y={12}
            width={152}
            fontSize={14}
            color={getFeedbackTextColor()}
            textAlign="center"
            maxLines={1}
          >
            {feedbackMessage() || ""}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

export default FavoriteButton;
