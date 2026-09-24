import { colorTokens } from "@/shared/design-system";
import { StatusBar } from "expo-status-bar";
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AuthHeroIllustration } from "./auth-hero-illustration";
import { GoogleSignInButton } from "./google-sign-in-button";

/** Welcome and authentication entry screen. */
export default function AuthScreen() {
  const { fontScale, height } = useWindowDimensions();
  const compact = height < 720 || fontScale > 1.15;

  return (
    <SafeAreaView
      edges={["top", "bottom", "left", "right"]}
      style={styles.safeArea}
    >
      <StatusBar style="dark" />
      <ScrollView
        bounces={false}
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.content,
            compact ? styles.contentCompact : styles.contentComfortable,
          ]}
        >
          <View style={[styles.hero, compact && styles.heroCompact]}>
            <AuthHeroIllustration compact={compact} />
            <View style={styles.copyBlock}>
              <Text accessibilityRole="header" style={styles.heading}>
                Your recipes.{"\n"}A little more home.
              </Text>
              <Text style={styles.supportingCopy}>
                Save the dishes you love, make them your own, and share them
                with your household.
              </Text>
            </View>
          </View>

          <View style={styles.actionSection}>
            <GoogleSignInButton />
            <Text style={styles.legalCopy}>
              By continuing, you agree to Noomori’s Privacy Policy.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colorTokens.background,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
  },
  content: {
    width: "100%",
    maxWidth: 520,
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  contentComfortable: {
    paddingTop: 20,
    paddingBottom: 20,
  },
  contentCompact: {
    paddingTop: 12,
    paddingBottom: 12,
  },
  hero: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    paddingVertical: 24,
  },
  heroCompact: {
    gap: 14,
    paddingVertical: 12,
  },
  copyBlock: {
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    gap: 24,
  },
  heading: {
    color: colorTokens.textPrimary,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "700",
    textAlign: "center",
  },
  supportingCopy: {
    maxWidth: 350,
    color: colorTokens.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400",
    textAlign: "center",
  },
  actionSection: {
    width: "100%",
    alignItems: "center",
    paddingTop: 4,
    gap: 12,
  },
  legalCopy: {
    maxWidth: 310,
    color: colorTokens.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "400",
    textAlign: "center",
  },
});
