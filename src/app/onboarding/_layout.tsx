import { colorTokens } from "@/shared/design-system";
import { Stack } from "expo-router";

export default function RootNavigator() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colorTokens.background },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colorTokens.background },
        headerTintColor: colorTokens.textPrimary,
        headerTitleStyle: {
          color: colorTokens.textPrimary,
          fontSize: 16,
          fontWeight: "600",
        },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="create-household"
        options={{ headerBackTitle: "Back", title: "" }}
      />
      <Stack.Screen
        name="join-household"
        options={{ headerBackTitle: "Back", title: "" }}
      />
    </Stack>
  );
}
