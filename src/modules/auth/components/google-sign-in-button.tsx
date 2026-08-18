import { supabase } from "@/lib/supabase";
import { colorTokens } from "@/shared/design-system";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

WebBrowser.maybeCompleteAuthSession();

type AuthErrorKind = "offline" | "generic";

type AuthActionState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; kind: AuthErrorKind; message: string };

const OFFLINE_ERROR = "You’re offline. Connect to the internet and try again.";
const GENERIC_ERROR = "We couldn’t sign you in. Try again.";

const googleButtonSource = Platform.select({
  ios: require("@/assets/images/auth/google-sign-in.ios.svg"),
  default: require("@/assets/images/auth/google-sign-in.android-web.svg"),
});

function isNetworkError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  return (
    error instanceof TypeError ||
    message.includes("network request failed") ||
    message.includes("network error") ||
    message.includes("failed to fetch") ||
    message.includes("offline")
  );
}

function extractSessionTokens(url: string) {
  const parsedUrl = new URL(url);
  const hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ""));

  return {
    accessToken:
      hashParams.get("access_token") ??
      parsedUrl.searchParams.get("access_token"),
    refreshToken:
      hashParams.get("refresh_token") ??
      parsedUrl.searchParams.get("refresh_token"),
  };
}

export function GoogleSignInButton() {
  const [state, setState] = useState<AuthActionState>({ status: "idle" });
  const [isFocused, setIsFocused] = useState(false);
  const inFlightRef = useRef(false);
  const isSubmitting = state.status === "submitting";
  const errorMessage = state.status === "error" ? state.message : null;

  useEffect(() => {
    if (Platform.OS !== "android") return;

    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  useEffect(() => {
    if (errorMessage) {
      AccessibilityInfo.announceForAccessibility(errorMessage);
    }
  }, [errorMessage]);

  async function signInWithGoogle() {
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    setState({ status: "submitting" });
    let completed = false;

    try {
      const redirectTo = Linking.createURL("");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: { prompt: "consent" },
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;
      if (!data.url)
        throw new Error("Google authentication URL was unavailable.");

      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectTo,
        {
          showInRecents: true,
        },
      );

      if (result.type === "cancel" || result.type === "dismiss") {
        setState({ status: "idle" });
        return;
      }

      if (result.type !== "success") {
        throw new Error("Google authentication did not complete.");
      }

      const { accessToken, refreshToken } = extractSessionTokens(result.url);
      if (!accessToken || !refreshToken) {
        throw new Error("Google authentication did not return a session.");
      }

      const { data: sessionData, error: sessionError } =
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

      if (sessionError) throw sessionError;
      if (!sessionData.session)
        throw new Error("Google session could not be created.");

      completed = true;
    } catch (error) {
      const kind: AuthErrorKind = isNetworkError(error) ? "offline" : "generic";
      setState({
        status: "error",
        kind,
        message: kind === "offline" ? OFFLINE_ERROR : GENERIC_ERROR,
      });
    } finally {
      if (!completed) {
        inFlightRef.current = false;
      }
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.feedbackSlot}>
        {errorMessage ? (
          <View style={styles.errorMessage}>
            <View style={styles.errorMarker} />
            <Text accessibilityLiveRegion="assertive" style={styles.errorText}>
              {errorMessage}
            </Text>
          </View>
        ) : null}
      </View>

      <Pressable
        accessibilityHint="Opens Google to sign in or create your Noomori account."
        accessibilityLabel={
          isSubmitting ? "Signing in with Google" : "Sign in with Google"
        }
        accessibilityRole="button"
        accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }}
        disabled={isSubmitting}
        onBlur={() => setIsFocused(false)}
        onFocus={() => setIsFocused(true)}
        onPress={signInWithGoogle}
        style={({ pressed }) => [
          styles.focusRing,
          isFocused && styles.focused,
          pressed && !isSubmitting && styles.pressed,
        ]}
      >
        {isSubmitting ? (
          <View style={styles.loadingButton}>
            <ActivityIndicator color="#1F1F1F" size="small" />
            <Text style={styles.loadingLabel}>Signing you in…</Text>
          </View>
        ) : (
          <Image
            accessible={false}
            contentFit="contain"
            source={googleButtonSource}
            style={styles.googleButtonImage}
          />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignItems: "center",
  },
  feedbackSlot: {
    width: "100%",
    maxWidth: 340,
    minHeight: 58,
    justifyContent: "center",
    marginBottom: 8,
  },
  errorMessage: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colorTokens.error,
    backgroundColor: colorTokens.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorMarker: {
    width: 8,
    height: 8,
    marginTop: 6,
    borderRadius: 4,
    backgroundColor: colorTokens.error,
  },
  errorText: {
    flex: 1,
    color: colorTokens.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  focusRing: {
    width: 220,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderRadius: 8,
    borderColor: "transparent",
  },
  focused: {
    borderColor: colorTokens.primary,
  },
  pressed: {
    opacity: 0.78,
  },
  googleButtonImage: {
    width: 216,
    height: 48,
  },
  loadingButton: {
    width: 216,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#747775",
    backgroundColor: "#FFFFFF",
  },
  loadingLabel: {
    color: "#1F1F1F",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "500",
  },
});
