import { Stack } from "expo-router";

export default function RootNavigator() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="create-household"
        options={{ title: "Create Household" }}
      />
      <Stack.Screen
        name="join-household"
        options={{ title: "Join Household" }}
      />
    </Stack>
  );
}
