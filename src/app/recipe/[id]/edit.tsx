import { SymbolView } from "expo-symbols";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colorTokens } from "@/shared/design-system";

export default function EditRecipeRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const recipeId = Array.isArray(params.id) ? params.id[0] : params.id;

  // NOTE: Fetching and update CRUD belong to the future persistence connection.
  // This route exposes the requested ID without fabricating editable recipe data.
  const close = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="min-h-16 flex-row items-center gap-3 border-b border-border bg-surface px-4 py-2">
        <Pressable
          accessibilityLabel="Close recipe editor"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary-strong active:bg-surface-subtle"
          onPress={close}
        >
          <SymbolView
            accessible={false}
            name={{ ios: "xmark", android: "close", web: "close" }}
            size={22}
            tintColor={colorTokens.textPrimary}
          />
        </Pressable>
        <Text
          accessibilityRole="header"
          className="shrink flex-1 text-xl font-bold leading-7 text-text-primary"
        >
          Edit recipe
        </Text>
      </View>

      <View className="flex-1 items-center justify-center px-5 py-10">
        <View className="w-full max-w-[440px] items-center rounded-2xl border border-border bg-surface px-5 py-8">
          <View
            accessible={false}
            className="mb-5 h-14 w-14 items-center justify-center rounded-2xl bg-surface-subtle"
          >
            <SymbolView
              name={{
                ios: "doc.text",
                android: "description",
                web: "description",
              }}
              size={26}
              tintColor={colorTokens.primaryStrong}
            />
          </View>
          <Text
            accessibilityRole="header"
            className="text-center text-xl font-bold leading-7 text-text-primary"
          >
            Recipe loading isn’t connected yet
          </Text>
          <Text className="mt-2 text-center text-base font-normal leading-6 text-text-secondary">
            Connect your recipe fetch to load this saved recipe into the shared
            editor.
          </Text>
          <Text className="mt-4 text-center text-sm font-medium leading-5 text-text-secondary">
            Recipe ID: {recipeId || "Missing"}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
