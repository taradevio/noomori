import { supabase } from "@/lib/supabase";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  Pressable,
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
const GENERIC_ERROR = "Couldn’t sign you in. Try again.";

const googleButtonSource = require("@/assets/images/google-logo.webp");

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
    <View className="w-full items-center">
      <View className="mb-2 min-h-[58px] w-full max-w-[340px] justify-center">
        {errorMessage ? (
          <View className="min-h-12 flex-row items-start gap-2.5 rounded-[10px] border border-error bg-surface px-3 py-2.5">
            <View className="mt-1.5 h-2 w-2 rounded-full bg-error" />
            <Text
              accessibilityLiveRegion="assertive"
              className="flex-1 text-sm font-medium leading-5 text-text-primary"
            >
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
        className="h-[52px] w-[220px] items-center justify-center rounded-lg border-2 border-transparent focus:border-primary active:scale-[0.99]"
        disabled={isSubmitting}
        onPress={() => void signInWithGoogle()}
      >
        <View
          className="h-14 w-[216px] flex-row items-center justify-center rounded-[5px] border border-[#747775] bg-white android:gap-[10px] android:px-3 ios:gap-3 ios:px-4 web:gap-[10px] web:px-3"
          testID="google-sign-in-surface"
        >
          {isSubmitting ? (
            <View className="flex-1 flex-row items-center justify-center gap-2.5">
              <ActivityIndicator color="#1F1F1F" size="small" />
              <Text className="text-lg font-medium leading-5 text-[#1F1F1F]">
                Signing you in…
              </Text>
            </View>
          ) : (
            <>
              <Image
                accessible={false}
                contentFit="contain"
                source={googleButtonSource}
                style={{ height: 24, width: 24 }}
                testID="google-sign-in-logo"
              />
              <Text className="text-lg font-medium leading-5 text-[#1F1F1F]">
                Sign in with Google
              </Text>
            </>
          )}
        </View>
      </Pressable>
    </View>
  );
}
