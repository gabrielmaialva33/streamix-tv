import { type IntrinsicNodeStyleProps, type NodeProps, Text, View } from "@lightningtv/solid";
import { createEffect, createSignal } from "solid-js";
import { type FavoriteItem, favorites } from "../lib/storage";
import { theme } from "../styles";
import { authState, persistFavoriteChange } from "@/features/auth/auth";

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

  // Update when item changes
  createEffect(() => {
    setIsFavorite(favorites.isFavorite(props.item.id, props.item.type));
  });

  const handleToggle = () => {
    const previousState = isFavorite();
    const newState = favorites.toggle(props.item);
    setIsFavorite(newState);
    props.onToggle?.(newState);

    if (!authState.isAuthenticated()) {
      return true;
    }

    void persistFavoriteChange(props.item, newState).catch(() => {
      favorites.toggle(props.item);
      setIsFavorite(previousState);
      props.onToggle?.(previousState);
    });

    return true;
  };

  return (
    <View {...props} style={ButtonStyle} onEnter={handleToggle} forwardStates>
      <Text fontSize={28} color={isFavorite() ? theme.primary : 0xaaaaaaff}>
        {isFavorite() ? "★" : "☆"}
      </Text>
    </View>
  );
};

export default FavoriteButton;
