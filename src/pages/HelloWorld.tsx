import { Text, View } from "@lightningtv/solid";
import { $t } from "../translate";

const HelloWorld = () => {
  return (
    <>
      <View src="assets/solid.svg" width={800} height={600} x={1920 / 2 - 400} y={1080 / 2 - 300} />
      <Text autofocus fontSize={64} color={0xffffffff} x={100} y={100}>
        {$t("home.headLine")}
      </Text>
      <Text fontSize={28} color={0xb8b8c0ff} x={100} y={180}>
        T for Text pages, M for here
      </Text>
    </>
  );
};

export default HelloWorld;
