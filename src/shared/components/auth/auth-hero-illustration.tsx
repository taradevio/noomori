import { Image } from "expo-image";

export function AuthHeroIllustration({ compact = false }: { compact?: boolean }) {
  return (
    <Image
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      contentFit="contain"
      source={require("@/assets/images/cookbook.png")}
      style={{ width: "100%", maxWidth: 350, height: compact ? 188 : 240 }}
    />
  );
}
