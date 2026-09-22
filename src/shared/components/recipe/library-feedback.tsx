import { Image, type ImageSource } from "expo-image";
import { AppIcon, type AppIconProps } from "@/shared/ui/app-icon";
import { Pressable, Text, View } from "react-native";

import { colorTokens } from "@/shared/design-system";

type LibraryFeedbackProps = {
  actionLabel?: string;
  actionFullWidth?: boolean;
  body: string;
  icon?: AppIconProps["name"];
  illustration?: ImageSource;
  onAction?: () => void;
  testID: string;
  title: string;
};

function FeedbackAction({
  label,
  onPress,
  fullWidth,
}: {
  label: string;
  onPress: () => void;
  fullWidth: boolean;
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
      className={`min-h-12 min-w-[176px] items-center justify-center rounded-xl border-2 border-primary-strong bg-primary-strong px-5 py-3 focus:border-text-primary active:opacity-[0.82] ${fullWidth ? "mt-4 w-full" : "mt-6"}`}
    >
      {content}
    </Pressable>
  );
}

/** Centered status treatment shared by empty, error, and no-result states. */
export function LibraryFeedback({
  actionLabel,
  actionFullWidth = false,
  body,
  icon,
  illustration,
  onAction,
  testID,
  title,
}: LibraryFeedbackProps) {
  return (
    <View
      className={`min-h-[320px] items-center justify-center ${illustration || actionFullWidth ? "px-4" : "px-5"} ${illustration ? "py-6" : "py-10"}`}
      testID={testID}
    >
      {illustration ? (
        <Image
          source={illustration}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          contentFit="contain"
          style={{
            width: "100%",
            maxWidth: 230,
            aspectRatio: 230 / 153,
            marginBottom: 16,
          }}
          testID={`${testID}-illustration`}
        />
      ) : icon ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="mb-6 h-20 w-20 items-center justify-center rounded-2xl bg-surface-subtle"
        >
          <AppIcon accented name={icon} size={30} color={colorTokens.primary} />
        </View>
      ) : null}

      <Text
        accessibilityRole="header"
        className={`max-w-[360px] text-center font-bold text-text-primary ${illustration ? "text-2xl leading-[30px]" : "text-xl leading-[27px]"}`}
      >
        {title}
      </Text>
      <Text
        className={`${illustration ? "mt-4" : "mt-2"} max-w-[340px] text-center text-base font-normal leading-6 text-text-secondary`}
      >
        {body}
      </Text>

      {actionLabel && onAction ? (
        <FeedbackAction
          label={actionLabel}
          onPress={onAction}
          fullWidth={actionFullWidth}
        />
      ) : null}
    </View>
  );
}

export function SkeletonCard({ width }: { width: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="overflow-hidden rounded-2xl border border-border bg-surface"
      style={{ width }}
      testID="library-skeleton-card"
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
