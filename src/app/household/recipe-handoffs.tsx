import { RecipeDetailView } from "@/shared/components/recipe/recipe-detail-view";
import {
  toRecipeDetail,
  type ApiRecipe,
} from "@/shared/components/recipe/recipe-response";
import { colorTokens, MaxContentWidth } from "@/shared/design-system";
import {
  getRecipeHandoffs,
  HouseholdApiError,
  resolveRecipeHandoff,
  type RecipeHandoffItem,
} from "@/shared/household-api";
import { useSession } from "@/shared/providers/session-providers";
import { toast } from "@/shared/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { AppIcon } from "@/shared/ui/app-icon";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const handoffKey = ["household", "recipe-handoffs"] as const;

function handoffRecipe(item: RecipeHandoffItem) {
  const snapshot = item.snapshot;
  return toRecipeDetail({
    id: item.id,
    owner_user_id: "",
    is_shared: false,
    image_path: item.image_path,
    image_url: item.image_url,
    ...snapshot,
    ingredients: snapshot.ingredients as ApiRecipe["ingredients"],
    instructions: snapshot.instructions as ApiRecipe["instructions"],
    nutrition_per_serving:
      snapshot.nutrition_per_serving as ApiRecipe["nutrition_per_serving"],
  });
}

type DecisionInput = {
  handoffId: string;
  decision: "keep" | "remove";
  itemIds: string[] | null;
};

function decisionFailureMessage(error: unknown, input?: DecisionInput) {
  if (error instanceof HouseholdApiError && error.status === 409) {
    return "Things changed while you were here. Refresh the recipes and try again.";
  }
  const oneRecipe = input?.itemIds?.length === 1;
  if (input?.decision === "remove") {
    return oneRecipe
      ? "Couldn’t remove this recipe. Try again."
      : "Couldn’t remove these recipes. Try again.";
  }
  return oneRecipe
    ? "Couldn’t keep this recipe. Try again."
    : "Couldn’t keep these recipes. Try again.";
}

export default function RecipeHandoffsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const accessToken = session?.access_token ?? "";
  const [selected, setSelected] = useState<{
    handoffId: string;
    item: RecipeHandoffItem;
  } | null>(null);

  const handoffsQuery = useQuery({
    enabled: Boolean(accessToken),
    queryKey: handoffKey,
    queryFn: () => getRecipeHandoffs(accessToken),
  });
  const decisionMutation = useMutation({
    mutationFn: ({ handoffId, decision, itemIds }: DecisionInput) =>
      resolveRecipeHandoff(accessToken, handoffId, decision, itemIds),
    onSuccess: async (_result, input) => {
      setSelected(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: handoffKey }),
        queryClient.invalidateQueries({ queryKey: ["household"] }),
        queryClient.invalidateQueries({ queryKey: ["recipes"] }),
      ]);
      toast.success(
        input.decision === "keep"
          ? input.itemIds?.length === 1
            ? "Recipe kept"
            : "Recipes kept"
          : input.itemIds?.length === 1
            ? "Recipe removed"
            : "Recipes removed",
      );
    },
    onError: async (error) => {
      if (!(error instanceof HouseholdApiError) || error.status !== 409) return;
      setSelected(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: handoffKey }),
        queryClient.invalidateQueries({ queryKey: ["household"] }),
        queryClient.invalidateQueries({ queryKey: ["recipes"] }),
      ]);
    },
  });

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/household");
  };

  const decide = (
    handoffId: string,
    decision: "keep" | "remove",
    itemIds: string[] | null,
  ) => decisionMutation.mutate({ handoffId, decision, itemIds });

  const confirmRemoveAll = (handoffId: string, count: number) => {
    Alert.alert(
      `Remove all ${count} ${count === 1 ? "recipe" : "recipes"}?`,
      "They’ll be removed from this household. The original recipes won’t be affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove all",
          style: "destructive",
          onPress: () => decide(handoffId, "remove", null),
        },
      ],
    );
  };

  if (selected) {
    const recipe = handoffRecipe(selected.item);
    return (
      <View className="flex-1 bg-background">
        <RecipeDetailView onBack={() => setSelected(null)} recipe={recipe} />
        <View className="gap-2 border-t border-border bg-surface px-5 py-3">
          {decisionMutation.isError ? (
            <Text
              accessibilityRole="alert"
              className="text-sm font-medium leading-5 text-error"
            >
              {decisionFailureMessage(
                decisionMutation.error,
                decisionMutation.variables,
              )}
            </Text>
          ) : null}
          <View className="flex-row gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: decisionMutation.isPending }}
              className="min-h-[52px] flex-1 items-center justify-center rounded-lg border-2 border-error px-3 focus:border-text-primary disabled:opacity-50"
              disabled={decisionMutation.isPending}
              onPress={() =>
                decide(selected.handoffId, "remove", [selected.item.id])
              }
            >
              <Text className="text-base font-bold leading-6 text-error">
                Remove
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: decisionMutation.isPending }}
              className="min-h-[52px] flex-1 items-center justify-center rounded-lg bg-primary px-3 focus:border-2 focus:border-text-primary disabled:opacity-50"
              disabled={decisionMutation.isPending}
              onPress={() =>
                decide(selected.handoffId, "keep", [selected.item.id])
              }
            >
              {decisionMutation.isPending ? (
                <ActivityIndicator color={colorTokens.onPrimary} />
              ) : (
                <Text className="text-base font-bold leading-6 text-on-primary">
                  Keep
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <StatusBar style="dark" />
      <View className="min-h-16 flex-row items-center gap-3 border-b border-border bg-surface px-4 py-2">
        <Pressable
          accessibilityLabel="Back to household"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary active:bg-surface-subtle"
          onPress={close}
        >
          <AppIcon
            accessible={false}
            name="back"
            size={22}
            color={colorTokens.textPrimary}
          />
        </Pressable>
        <Text
          accessibilityRole="header"
          className="min-w-0 flex-1 text-xl font-bold leading-7 text-text-primary"
        >
          Recipes from someone who left
        </Text>
      </View>

      {handoffsQuery.isPending ? (
        <View className="flex-1 items-center justify-center gap-3">
          <ActivityIndicator color={colorTokens.primaryStrong} size="large" />
          <Text className="text-base text-text-secondary">
            Loading recipes…
          </Text>
        </View>
      ) : handoffsQuery.isError ? (
        <View className="flex-1 items-center justify-center gap-4 px-5">
          <Text className="text-center text-xl font-bold text-text-primary">
            Couldn’t load these recipes
          </Text>
          <Pressable
            accessibilityRole="button"
            className="min-h-[52px] rounded-lg bg-primary px-5 py-3"
            onPress={() => void handoffsQuery.refetch()}
          >
            <Text className="text-base font-bold text-on-primary">
              Try again
            </Text>
          </Pressable>
        </View>
      ) : handoffsQuery.data.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3 px-5">
          <AppIcon
            accessible={false}
            name="check-circle"
            accented
            size={42}
            color={colorTokens.success}
          />
          <Text className="text-xl font-bold text-text-primary">
            All done
          </Text>
          <Text className="text-center text-base leading-6 text-text-secondary">
            You’ve taken care of all the recipes.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerClassName="items-center px-5 pb-12 pt-6">
          <View className="w-full gap-10" style={{ maxWidth: MaxContentWidth }}>
            {handoffsQuery.data.map((handoff) => (
              <View key={handoff.id} className="gap-4">
                <View className="gap-1">
                  <Text
                    accessibilityRole="header"
                    className="text-xl font-bold leading-7 text-text-primary"
                  >
                    Recipes from {handoff.departed_user_display_name}
                  </Text>
                  <Text className="text-sm leading-5 text-text-secondary">
                    {handoff.departed_user_display_name} left the household.
                    Choose which of their shared recipes you’d like to keep here.
                  </Text>
                </View>

                <View className="border-t border-border">
                  {handoff.items.map((item) => (
                    <View
                      key={item.id}
                      className="min-h-[72px] flex-row items-center gap-3 border-b border-border py-3"
                    >
                      <Pressable
                        accessibilityHint="Opens the recipe."
                        accessibilityRole="button"
                        className="min-w-0 flex-1 rounded-lg border-2 border-transparent py-2 focus:border-primary active:opacity-60"
                        onPress={() =>
                          setSelected({ handoffId: handoff.id, item })
                        }
                      >
                        <Text className="text-base font-bold leading-6 text-text-primary">
                          {item.snapshot.title}
                        </Text>
                        <Text className="text-sm leading-5 text-text-secondary">
                          View recipe
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`Remove ${item.snapshot.title}`}
                        accessibilityRole="button"
                        className="h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-error active:bg-surface-subtle"
                        disabled={decisionMutation.isPending}
                        onPress={() => decide(handoff.id, "remove", [item.id])}
                      >
                        <AppIcon
                          accessible={false}
                          name="delete"
                          size={21}
                          color={colorTokens.error}
                        />
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`Keep ${item.snapshot.title}`}
                        accessibilityRole="button"
                        className="h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary active:bg-surface-subtle"
                        disabled={decisionMutation.isPending}
                        onPress={() => decide(handoff.id, "keep", [item.id])}
                      >
                        <AppIcon
                          accessible={false}
                          name="check"
                          size={22}
                          color={colorTokens.success}
                        />
                      </Pressable>
                    </View>
                  ))}
                </View>

                <View className="flex-row gap-3">
                  <Pressable
                    accessibilityRole="button"
                    className="min-h-[52px] flex-1 items-center justify-center rounded-lg border-2 border-error px-3 focus:border-text-primary active:bg-surface-subtle disabled:opacity-50"
                    disabled={decisionMutation.isPending}
                    onPress={() =>
                      confirmRemoveAll(handoff.id, handoff.items.length)
                    }
                  >
                    <Text className="text-center text-base font-bold leading-6 text-error">
                      Remove all
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    className="min-h-[52px] flex-1 items-center justify-center rounded-lg bg-primary px-3 focus:border-2 focus:border-text-primary active:opacity-80 disabled:opacity-50"
                    disabled={decisionMutation.isPending}
                    onPress={() => decide(handoff.id, "keep", null)}
                  >
                    <Text className="text-center text-base font-bold leading-6 text-on-primary">
                      Keep all
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}
            {decisionMutation.isError ? (
              <Text
                accessibilityRole="alert"
                className="text-sm font-medium leading-5 text-error"
              >
                {decisionFailureMessage(
                  decisionMutation.error,
                  decisionMutation.variables,
                )}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
