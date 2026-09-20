import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { formatHouseholdActivityTime } from "@/shared/household-activity";
import {
  getHouseholdActivity,
  householdActivityKey,
  markHouseholdActivityRead,
  type HouseholdActivity,
  type HouseholdActivityResponse,
} from "@/shared/household-api";
import { colorTokens, MaxContentWidth } from "@/shared/design-system";
import { useSession } from "@/shared/providers/session-providers";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const actionLabels = {
  added: "added",
  edited: "updated",
  unshared: "removed",
} as const;

function ActivityRow({ activity }: { activity: HouseholdActivity }) {
  const router = useRouter();
  const canOpen = activity.recipe_id !== null;
  const action =
    activity.action === "unshared"
      ? `removed ${activity.recipe_title} from the household`
      : `${actionLabels[activity.action]} ${activity.recipe_title}`;
  const label = `${activity.actor_display_name} ${action}, ${formatHouseholdActivityTime(activity.created_at)}`;
  const content = (
    <>
      <View className="h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-subtle">
        <Text className="text-lg font-bold text-text-primary">
          {activity.actor_display_name.trim().charAt(0).toLocaleUpperCase() ||
            "?"}
        </Text>
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-base leading-6 text-text-primary">
          <Text className="font-bold">{activity.actor_display_name}</Text>{" "}
          {activity.action === "unshared" ? (
            <>removed “{activity.recipe_title}” from the household</>
          ) : (
            <>{actionLabels[activity.action]} “{activity.recipe_title}”</>
          )}
        </Text>
        <Text className="mt-1 text-sm leading-5 text-text-secondary">
          {formatHouseholdActivityTime(activity.created_at)}
        </Text>
      </View>
      {canOpen ? (
        <SymbolView
          accessible={false}
          name={{
            ios: "chevron.right",
            android: "chevron_right",
            web: "chevron_right",
          }}
          size={20}
          tintColor={colorTokens.textSecondary}
        />
      ) : null}
    </>
  );

  return canOpen ? (
    <Pressable
      accessibilityHint="Opens the shared recipe."
      accessibilityLabel={label}
      accessibilityRole="button"
      className="min-h-20 flex-row items-center gap-3 rounded-2xl border-2 border-border bg-surface px-4 py-3 focus:border-primary-strong active:bg-surface-subtle"
      onPress={() => router.push(`/recipe/${activity.recipe_id}` as Href)}
      testID={`activity-row-${activity.id}`}
    >
      {content}
    </Pressable>
  ) : (
    <View
      accessible
      accessibilityLabel={`${label}. Recipe unavailable.`}
      className="min-h-20 flex-row items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3"
      testID={`activity-row-${activity.id}`}
    >
      {content}
    </View>
  );
}

export default function HouseholdActivityScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const accessToken = session?.access_token ?? "";
  const markingActivityId = useRef<number | null>(null);
  const activityQuery = useQuery({
    enabled: Boolean(accessToken),
    queryKey: householdActivityKey,
    queryFn: () => getHouseholdActivity(accessToken),
    retry: false,
  });
  const refetchActivity = activityQuery.refetch;
  const { mutate: markActivityRead } = useMutation({
    mutationFn: (throughActivityId: number) =>
      markHouseholdActivityRead(accessToken, throughActivityId),
    onError: () => {
      markingActivityId.current = null;
    },
    onSuccess: (_, throughActivityId) => {
      queryClient.setQueryData<HouseholdActivityResponse>(
        householdActivityKey,
        (current) =>
          current?.latest_activity_id === throughActivityId
            ? { ...current, unread_count: 0 }
            : current,
      );
    },
  });

  const markLatestRead = useCallback(
    (data?: HouseholdActivityResponse) => {
      const latestId = data?.latest_activity_id ?? null;
      if (
        (data?.member_count ?? 0) >= 2 &&
        latestId !== null &&
        markingActivityId.current !== latestId
      ) {
        markingActivityId.current = latestId;
        markActivityRead(latestId);
      }
    },
    [markActivityRead],
  );

  useFocusEffect(
    useCallback(() => {
      let focused = true;
      if (accessToken) {
        void refetchActivity().then(({ data }) => {
          if (focused) markLatestRead(data);
        });
      }
      return () => {
        focused = false;
      };
    }, [accessToken, markLatestRead, refetchActivity]),
  );

  const memberCount = activityQuery.data?.member_count ?? 0;
  const activities = activityQuery.data?.activities ?? [];

  const refreshActivity = useCallback(() => {
    void refetchActivity().then(({ data }) => markLatestRead(data));
  }, [markLatestRead, refetchActivity]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)" as Href);
  };

  const content = activityQuery.isPending ? (
    <View className="flex-1 items-center justify-center gap-4 px-5">
      <ActivityIndicator color={colorTokens.primaryStrong} size="large" />
      <Text
        accessibilityLiveRegion="polite"
        className="text-base text-text-secondary"
      >
        Loading activity…
      </Text>
    </View>
  ) : activityQuery.isError ? (
    <View className="flex-1 items-center justify-center gap-4 px-5">
      <Text
        accessibilityRole="header"
        className="text-center text-xl font-bold text-text-primary"
      >
        Couldn’t load activity
      </Text>
      <Text className="text-center text-base leading-6 text-text-secondary">
        Try again in a moment.
      </Text>
      <Pressable
        accessibilityRole="button"
        className="min-h-12 rounded-xl border-2 border-border bg-surface px-5 py-3 focus:border-primary-strong active:bg-surface-subtle"
        onPress={() => activityQuery.refetch()}
      >
        <Text className="text-base font-bold text-text-primary">Try again</Text>
      </Pressable>
    </View>
  ) : (
    <FlatList
      data={activities}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => <ActivityRow activity={item} />}
      ItemSeparatorComponent={() => <View className="h-3" />}
      ListEmptyComponent={
        <View className="flex-1 items-center justify-center px-6">
          <Text
            accessibilityRole="header"
            className="text-center text-xl font-bold text-text-primary"
          >
            {memberCount < 2 ? "It’s quiet here for now" : "No updates yet"}
          </Text>
          <Text className="mt-2 max-w-[440px] text-center text-base leading-6 text-text-secondary">
            {memberCount < 2
              ? "Once someone joins your household, shared recipe updates will show up here."
              : "When someone shares or changes a recipe, you’ll see it here."}
          </Text>
        </View>
      }
      contentContainerStyle={{ flexGrow: 1, padding: 20, paddingBottom: 40 }}
      onRefresh={refreshActivity}
      refreshing={activityQuery.isRefetching}
      showsVerticalScrollIndicator={false}
      testID="household-activity-list"
    />
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      <StatusBar style="dark" />
      <View className="min-h-16 flex-row items-center border-b border-border bg-surface px-4 py-2">
        <Pressable
          accessibilityLabel="Back to recipes"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary-strong active:bg-surface-subtle"
          onPress={close}
        >
          <SymbolView
            accessible={false}
            name={{
              ios: "chevron.left",
              android: "arrow_back",
              web: "arrow_back",
            }}
            size={22}
            tintColor={colorTokens.textPrimary}
          />
        </Pressable>
        <Text
          accessibilityRole="header"
          className="min-w-0 flex-1 px-2 text-center text-xl font-bold text-text-primary"
        >
          Household activity
        </Text>
        <View className="h-12 w-12" />
      </View>
      <View
        className="flex-1 self-center"
        style={{ width: "100%", maxWidth: MaxContentWidth }}
      >
        {content}
      </View>
    </SafeAreaView>
  );
}
