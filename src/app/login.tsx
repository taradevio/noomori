import GoogleSignInButton from "@/shared/components/social-auth-buttons/google-sign-in";
import { ThemedView } from "@/shared/ui";
import { Stack } from "expo-router";

export default function LoginScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Login" }} />
      <ThemedView className="flex-1 items-center justify-center px-4">
        <GoogleSignInButton />
      </ThemedView>
    </>
  );
}
