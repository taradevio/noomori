import { useTheme } from "@/shared/design-system";
import { Image, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** Authentication entry screen. */
export default function AuthScreen() {
  const theme = useTheme();

  return (
    <SafeAreaView className="">
      <View>
        <Image className="" />
      </View>
      <View className="w-32 border-2 border-red-500">
        <Text className="text-5xl" style={{ color: theme.textPrimary }}>
          Hello World
        </Text>
      </View>
    </SafeAreaView>
  );
}
