import { ElementNode, Text, View } from "@solidtv/solid";
import { useNavigate } from "@solidjs/router";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "@/shared/layout";
import { theme } from "@/styles";

export default () => {
  const navigate = useNavigate();
  let homeButton: ElementNode | undefined;

  const goHome = () => {
    navigate("/");
    return true;
  };

  return (
    <View
      width={SCREEN_WIDTH}
      height={SCREEN_HEIGHT}
      color={theme.background}
      display="flex"
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      gap={24}
      forwardFocus={() => {
        homeButton?.setFocus();
        return true;
      }}
      onBack={goHome}
      onLast={goHome}
    >
      <Text fontSize={18} fontWeight={700} color={theme.primaryLight}>
        ERRO 404
      </Text>
      <Text fontSize={52} fontWeight={700} color={theme.textPrimary}>
        Essa tela não existe
      </Text>
      <Text fontSize={22} color={theme.textSecondary}>
        Volte ao início para continuar assistindo.
      </Text>
      <View
        ref={homeButton}
        width={260}
        height={64}
        color={theme.surfaceHover}
        border={{ color: theme.borderLight, width: 2 }}
        borderRadius={32}
        display="flex"
        justifyContent="center"
        alignItems="center"
        autofocus
        forwardStates
        transition={{ scale: { duration: 150 }, color: { duration: 150 } }}
        $focus={{ scale: 1.05, color: theme.primary, border: { color: theme.primaryLight, width: 2 } }}
        onEnter={goHome}
      >
        <Text fontSize={22} fontWeight={700} color={theme.textPrimary}>
          Ir para o início
        </Text>
      </View>
    </View>
  );
};
