import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export default function CreateHousehold() {
  const [household, onChangeHousehold] = useState("");

  return (
    <SafeAreaProvider>
      <SafeAreaView className="p-2">
        <View>
          <Text className="text-4xl">Create your household</Text>
          <Text>
            You'll be the owner. You can invite people whenever you're ready.
          </Text>
        </View>

        <View className="mt-10">
          <Text className="font-semibold" nativeID="householdName">
            Household name
          </Text>
          <TextInput
            onChangeText={onChangeHousehold}
            value={household}
            className="w-full h-18 border p-2 "
            accessibilityLabel="Household name"
            aria-labelledby="householdName"
            placeholder="Your Household Name"
          />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
