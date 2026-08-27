import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Pressable, Text, View } from "react-native";

import { colorTokens } from "@/shared/design-system";

type LibraryFeedbackProps = {
  actionLabel?: string;
  body: string;
  icon: SymbolViewProps["name"];
  onAction?: () => void;
  testID: string;
  title: string;
};

function FeedbackAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const content = (
    <Text className="text-center text-base font-bold leading-6 text-on-primary">
      {label}
    </Text>
  );

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="mt-6 min-h-12 min-w-[176px] items-center justify-center rounded-xl border-2 border-primary-strong bg-primary-strong px-5 py-3 focus:border-text-primary active:opacity-[0.82]"
    >
      {content}
    </Pressable>
  );
}

/** Centered status treatment shared by empty, error, and no-result states. */
export function LibraryFeedback({
  actionLabel,
  body,
  icon,
  onAction,
  testID,
  title,
}: LibraryFeedbackProps) {
  return (
    <View
      className="min-h-[320px] items-center justify-center px-5 py-10"
      testID={testID}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="mb-6 h-24 w-24 items-center justify-center rounded-[28px] border border-border bg-surface-subtle"
      >
        <View className="absolute -right-1 -top-1 h-7 w-7 rounded-full bg-secondary opacity-20" />
        <View className="absolute -bottom-2 -left-2 h-9 w-9 rounded-full bg-primary opacity-10" />
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-surface">
          <SymbolView
            name={icon}
            size={30}
            tintColor={colorTokens.primaryStrong}
          />
        </View>
      </View>

      <Text
        accessibilityRole="header"
        className="max-w-[360px] text-center text-xl font-bold leading-[27px] text-text-primary"
      >
        {title}
      </Text>
      <Text className="mt-2 max-w-[340px] text-center text-base font-normal leading-6 text-text-secondary">
        {body}
      </Text>

      {actionLabel && onAction ? (
        <FeedbackAction label={actionLabel} onPress={onAction} />
      ) : null}
    </View>
  );
}

export function SkeletonCard({ width }: { width: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="overflow-hidden rounded-[14px] border border-border bg-surface"
      style={{ width }}
    >
      <View className="aspect-[4/3] bg-surface-subtle" />
      <View className="min-h-[100px] gap-3 px-4 pb-4 pt-4">
        <View className="h-4 w-5/6 rounded bg-border opacity-70" />
        <View className="h-4 w-2/3 rounded bg-border opacity-60" />
        <View className="mt-auto h-3 w-1/3 rounded bg-surface-subtle" />
      </View>
    </View>
  );
}
