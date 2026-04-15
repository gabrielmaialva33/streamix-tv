import { type IntrinsicNodeStyleProps, type NodeProps, Text, View } from "@lightningtv/solid";
import { createEffect, createSignal } from "solid-js";
import { type FavoriteItem, favorites } from "../lib/storage";
import { theme } from "../styles";
import { authState, persistFavoriteChange } from "@/features/auth/auth";
import { ApiError } from "@/lib/api";

const ButtonStyle = {
  width: 220,
  height: 58,
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
}

const FavoriteButton = (props: FavoriteButtonProps) => {
  const [isFavorite, setIsFavorite] = createSignal(favorites.isFavorite(props.item.id, props.item.type));
  const [feedbackTone, setFeedbackTone] = createSignal<"neutral" | "warning" | "success">("neutral");
  let feedbackTimeout: number | null = null;

  // Update when item changes
  createEffect(() => {
    setIsFavorite(favorites.isFavorite(props.item.id, props.item.type));
  });

  function showFeedback(_message: string, tone: "neutral" | "warning" | "success" = "neutral") {
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
    <View
      {...props}
      width={220}
      height={58}
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
        width={188}
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
