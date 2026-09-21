import { Image } from "expo-image";

export function HouseholdIllustration({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <Image
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      contentFit="contain"
      source={require("@/assets/images/household.webp")}
      style={{ width: "100%", maxWidth: 350, height: compact ? 188 : 240 }}
    />
  );
}
