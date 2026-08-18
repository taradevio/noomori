import { colorTokens } from "@/shared/design-system";
import { StyleSheet, View } from "react-native";

type AuthHeroIllustrationProps = {
  compact?: boolean;
};

const ILLUSTRATION_WIDTH = 260;
const ILLUSTRATION_HEIGHT = 188;

/** A quiet, token-driven recipe illustration for the authentication screen. */
export function AuthHeroIllustration({
  compact = false,
}: AuthHeroIllustrationProps) {
  const scale = compact ? 0.78 : 1;

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.frame,
        {
          width: ILLUSTRATION_WIDTH * scale,
          height: ILLUSTRATION_HEIGHT * scale,
        },
      ]}
    >
      <View style={[styles.canvas, { transform: [{ scale }] }]}>
        <View style={styles.halo} />

        <View style={styles.recipeCard}>
          <View style={styles.foodPanel}>
            <View style={styles.plateWash} />
            <View style={styles.plate} />
            <View style={styles.foodBase} />
            <View style={styles.garnishOne} />
            <View style={styles.garnishTwo} />
            <View style={styles.garnishThree} />
          </View>

          <View style={styles.recipeCopy}>
            <View style={styles.titleLine} />
            <View style={styles.copyLineLong} />
            <View style={styles.copyLineShort} />
            <View style={styles.metadataRow}>
              <View style={styles.metadataDot} />
              <View style={styles.metadataLine} />
            </View>
          </View>
        </View>

        <View style={styles.recipeTab}>
          <View style={styles.tabMark} />
          <View style={styles.tabLineLong} />
          <View style={styles.tabLineShort} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: "center",
    justifyContent: "center",
  },
  canvas: {
    width: ILLUSTRATION_WIDTH,
    height: ILLUSTRATION_HEIGHT,
  },
  halo: {
    position: "absolute",
    left: 8,
    top: 30,
    width: 244,
    height: 144,
    borderRadius: 72,
    backgroundColor: colorTokens.surfaceSubtle,
    opacity: 0.72,
  },
  recipeCard: {
    position: "absolute",
    left: 39,
    top: 8,
    width: 182,
    height: 158,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colorTokens.border,
    backgroundColor: colorTokens.surface,
    overflow: "hidden",
    shadowColor: colorTokens.textPrimary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  foodPanel: {
    height: 96,
    backgroundColor: colorTokens.background,
    overflow: "hidden",
  },
  plateWash: {
    position: "absolute",
    left: 25,
    top: 9,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colorTokens.primary,
    opacity: 0.16,
  },
  plate: {
    position: "absolute",
    left: 33,
    top: 17,
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 7,
    borderColor: colorTokens.surface,
    backgroundColor: colorTokens.surfaceSubtle,
  },
  foodBase: {
    position: "absolute",
    left: 48,
    top: 36,
    width: 36,
    height: 24,
    borderRadius: 12,
    backgroundColor: colorTokens.primary,
    transform: [{ rotate: "-8deg" }],
  },
  garnishOne: {
    position: "absolute",
    left: 60,
    top: 29,
    width: 8,
    height: 24,
    borderRadius: 6,
    backgroundColor: colorTokens.secondary,
    transform: [{ rotate: "38deg" }],
  },
  garnishTwo: {
    position: "absolute",
    left: 70,
    top: 28,
    width: 8,
    height: 22,
    borderRadius: 6,
    backgroundColor: colorTokens.success,
    transform: [{ rotate: "-24deg" }],
  },
  garnishThree: {
    position: "absolute",
    left: 55,
    top: 52,
    width: 24,
    height: 7,
    borderRadius: 5,
    backgroundColor: colorTokens.onPrimary,
    opacity: 0.76,
    transform: [{ rotate: "12deg" }],
  },
  recipeCopy: {
    gap: 6,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  titleLine: {
    width: 104,
    height: 8,
    borderRadius: 4,
    backgroundColor: colorTokens.textPrimary,
    opacity: 0.88,
  },
  copyLineLong: {
    width: 140,
    height: 5,
    borderRadius: 3,
    backgroundColor: colorTokens.border,
  },
  copyLineShort: {
    width: 96,
    height: 5,
    borderRadius: 3,
    backgroundColor: colorTokens.border,
  },
  metadataRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingTop: 1,
  },
  metadataDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colorTokens.secondary,
  },
  metadataLine: {
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: colorTokens.surfaceSubtle,
  },
  recipeTab: {
    position: "absolute",
    right: 6,
    top: 48,
    width: 76,
    height: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colorTokens.border,
    backgroundColor: colorTokens.surface,
    padding: 11,
    gap: 7,
    shadowColor: colorTokens.textPrimary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  tabMark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colorTokens.secondary,
    opacity: 0.86,
  },
  tabLineLong: {
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: colorTokens.surfaceSubtle,
  },
  tabLineShort: {
    width: 34,
    height: 5,
    borderRadius: 3,
    backgroundColor: colorTokens.surfaceSubtle,
  },
});
