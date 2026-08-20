// update onboarding first to navigate to home since onboarding is still null

import { apiConfig } from "@/config/api";
import { useSession } from "@/shared/providers/session-providers";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

type CreateHousehold = {
  name: string;
};

export default function CreateHousehold() {
  const queryClient = useQueryClient();
  const [household, onChangeHousehold] = useState<string>("");
  // const [isDisabled, setIsDisabled] = useState<boolean>(true);
  const { refreshUserState } = useSession();

  const isDisabled = household.trim() === "";

  const createHouseholdName = async (householdName: CreateHousehold) => {
    const res = await fetch(
      `${apiConfig.backendUrl}${apiConfig.endpoints.households}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(householdName),
      },
    );

    if (!res.ok) {
      throw new Error(`Server returned status code: ${res.status}`);
    }

    return res.json();
  };

  const { mutate, isPending, isError, error } = useMutation({
    mutationFn: createHouseholdName,
    onSuccess: async (data) => {
      console.log(`Household is set ${data}`);
      // await Promise.all([
      //   queryClient.invalidateQueries({
      //     queryKey: ["household"],
      //   }),

      //   queryClient.invalidateQueries({
      //     queryKey: ["profile"],
      //   }),
      // ]);

      await refreshUserState();
    },
  });

  const handleHouseholdName = () => {
    if (!household.trim()) return;

    mutate({ name: household });
  };

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

          <TouchableOpacity
            className="px-2 py-4 w-full mt-3 rounded-lg bg-[#B95E40]"
            disabled={isDisabled}
            onPress={handleHouseholdName}
            activeOpacity={0.7}
          >
            {isPending ? (
              <>
                <ActivityIndicator size="small" />
              </>
            ) : (
              <Text className="text-[#F6F1E8] text-center">
                Create Household
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View>
          {isError && <Text className="text-red-500">{error.message}</Text>}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
