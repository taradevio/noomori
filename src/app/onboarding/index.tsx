import { router } from "expo-router";
import { Button, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Onboarding() {
  return (
    <SafeAreaView>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="flex-1 items-center justify-center">
          <Text className="text-5xl font-semibold">
            Share recipes with the people you cook with.
          </Text>
          <Text className="text-xl">
            Your personal library stays yours. Choose exactly which recipes
            become part of your household.
          </Text>
        </View>

        <View className="gap-5 w-[20rem] flex-1 justify-center">
          <Button
            title="Create household"
            onPress={() => router.push("/onboarding/create-household")}
          />
          <Button
            title="Join household"
            onPress={() => router.push("/onboarding/join-household")}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
