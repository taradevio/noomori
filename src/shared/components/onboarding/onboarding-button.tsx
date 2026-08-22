import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { colorTokens } from "@/shared/design-system";

type OnboardingButtonProps = {
  accessibilityHint?: string;
  disabled?: boolean;
  label: string;
  loading?: boolean;
  loadingLabel?: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
};

/** Token-driven button with stable pressed, focus, disabled, and loading states. */
export function OnboardingButton({
  accessibilityHint,
  disabled = false,
  label,
  loading = false,
  loadingLabel,
  onPress,
  variant = "primary",
}: OnboardingButtonProps) {
  const [isFocused, setIsFocused] = useState(false);
  const isInactive = disabled || loading;
  const visibleLabel = loading ? (loadingLabel ?? label) : label;
  const buttonColors = isInactive
    ? "border-border bg-surface-subtle"
    : variant === "primary"
      ? "border-primary-strong bg-primary-strong"
      : "border-text-secondary bg-surface";
  const focusColors = isFocused
    ? variant === "primary"
      ? "border-text-primary"
      : "border-primary-strong"
    : "";
  const labelColor =
    disabled && !loading
      ? "text-text-secondary"
      : variant === "primary"
        ? "text-on-primary"
        : "text-text-primary";

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={visibleLabel}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: isInactive }}
      disabled={isInactive}
      onBlur={() => setIsFocused(false)}
      onFocus={() => setIsFocused(true)}
      onPress={onPress}
      className={`min-h-[52px] w-full items-center justify-center rounded-xl border-2 px-5 py-3 active:opacity-[0.82] ${buttonColors} ${focusColors} ${loading ? "opacity-90" : ""}`}
    >
      <View className="flex-row items-center justify-center gap-2.5">
        {loading ? (
          <ActivityIndicator
            accessible={false}
            color={
              variant === "primary"
                ? colorTokens.onPrimary
                : colorTokens.textPrimary
            }
            size="small"
          />
        ) : null}
        <Text
          className={`text-center text-[19px] font-bold leading-6 ${labelColor}`}
        >
          {visibleLabel}
        </Text>
      </View>
    </Pressable>
  );
}
