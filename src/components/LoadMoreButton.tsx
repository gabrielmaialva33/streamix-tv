import { Text, View } from "@solidtv/solid";
import { Row } from "@solidtv/solid/primitives";
import { theme } from "@/styles";

export interface LoadMoreButtonProps {
  /** Forwarded to the focusable button View so pages can restore focus after pagination. */
  ref?: any;
  /** Row width — matches the grid the button sits under. */
  width?: number;
  loading: boolean;
  onLoadMore: () => void;
}

const LoadMoreButton = (props: LoadMoreButtonProps) => {
  return (
    <Row width={props.width ?? 1640} height={60} justifyContent="center">
      <View
        ref={props.ref}
        width={200}
        height={50}
        borderRadius={8}
        display="flex"
        justifyContent="center"
        alignItems="center"
        style={{
          color: theme.surfaceLight,
          border: { color: theme.border, width: 1 },
          transition: { scale: { duration: 150 }, color: { duration: 150 } },
          $focus: { scale: 1.05, color: theme.primary, border: { color: theme.primary, width: 1 } },
        }}
        onEnter={() => {
          props.onLoadMore();
          return true;
        }}
      >
        <Text fontSize={18} color={0xffffffff}>
          {props.loading ? "Carregando..." : "Carregar Mais"}
        </Text>
      </View>
    </Row>
  );
};

export default LoadMoreButton;
