import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  AccessibilityInfo,
  AppState,
  Platform,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  Keyframe,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { colorTokens } from "@/shared/design-system";

export type ToastId = number;
export type ToastTone = "success" | "error";

type ToastItem = {
  id: ToastId;
  message: string;
  tone: ToastTone;
};

type ToastListener = () => void;

const SUCCESS_DURATION_MS = 4_000;
const ERROR_DURATION_MS = 6_000;
const SWIPE_DISTANCE_RATIO = 0.35;
const SWIPE_VELOCITY_THRESHOLD = 700;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

const TOAST_ENTER = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: -12 }] },
  100: {
    opacity: 1,
    transform: [{ translateY: 0 }],
    easing: EASE_OUT,
  },
}).duration(220);

const TOAST_EXIT = new Keyframe({
  0: { opacity: 1, transform: [{ translateY: 0 }] },
  100: {
    opacity: 0,
    transform: [{ translateY: -12 }],
    easing: EASE_OUT,
  },
}).duration(150);

const TOAST_FADE_IN = new Keyframe({
  0: { opacity: 0 },
  100: { opacity: 1, easing: EASE_OUT },
}).duration(160);

const TOAST_FADE_OUT = new Keyframe({
  0: { opacity: 1 },
  100: { opacity: 0, easing: EASE_OUT },
}).duration(120);

const TOAST_CONTENT_ENTER = FadeIn.duration(120).easing(EASE_OUT);

let currentToast: ToastItem | null = null;
let nextToastId = 1;
const listeners = new Set<ToastListener>();

function emitToastChange() {
  for (const listener of listeners) listener();
}

function showToast(tone: ToastTone, message: string): ToastId {
  const normalizedMessage = message.trim();
  if (!normalizedMessage) return 0;

  // NOTE: This intentionally replaces the current item. Toasts represent the
  // latest completed operation rather than a queue of historical messages.
  const id = nextToastId++;
  currentToast = { id, message: normalizedMessage, tone };
  emitToastChange();
  return id;
}

function dismissToast(id?: ToastId) {
  // NOTE: Timers and swipe callbacks carry an ID so an older callback cannot
  // dismiss a newer toast that replaced it while the callback was pending.
  if (!currentToast || (id !== undefined && currentToast.id !== id)) return;
  currentToast = null;
  emitToastChange();
}

export const toast = {
  success: (message: string) => showToast("success", message),
  error: (message: string) => showToast("error", message),
  dismiss: dismissToast,
};

function subscribe(listener: ToastListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return currentToast;
}

function getServerSnapshot() {
  return null;
}

function dismissToastOnRN(id: ToastId) {
  toast.dismiss(id);
}

/** @internal Pure worklet kept exported for deterministic gesture tests. */
export function shouldDismissToast(
  offset: number,
  width: number,
  velocityX: number,
) {
  "worklet";
  return (
    Math.abs(offset) >= width * SWIPE_DISTANCE_RATIO ||
    Math.abs(velocityX) >= SWIPE_VELOCITY_THRESHOLD
  );
}

function useAutoDismiss(item: ToastItem | null) {
  useEffect(() => {
    if (!item) return;

    const duration =
      item.tone === "success" ? SUCCESS_DURATION_MS : ERROR_DURATION_MS;
    let remaining = duration;
    let deadline = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const scheduleTimer = () => {
      clearTimer();
      deadline = Date.now() + remaining;
      timer = setTimeout(() => toast.dismiss(item.id), remaining);
    };

    if (
      AppState.currentState !== "background" &&
      AppState.currentState !== "inactive"
    ) {
      scheduleTimer();
    }

    // NOTE: Background time does not count toward visibility. Preserve the
    // remaining duration and restart it only when the app becomes active.
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        if (remaining <= 0) toast.dismiss(item.id);
        else scheduleTimer();
        return;
      }

      if (timer) remaining = Math.max(0, deadline - Date.now());
      clearTimer();
    });

    return () => {
      clearTimer();
      subscription.remove();
    };
  }, [item]);
}

function ToastCard({ item }: { item: ToastItem }) {
  const reduceMotion = useReducedMotion();
  const translateX = useSharedValue(0);
  const gestureStartX = useSharedValue(0);
  const measuredWidth = useSharedValue(1);
  const toneForegroundColor =
    item.tone === "success" ? colorTokens.textPrimary : colorTokens.onPrimary;
  const accessibilityLabel = `${item.tone === "success" ? "Success" : "Error"}: ${item.message}`;

  useEffect(() => {
    cancelAnimation(translateX);
    translateX.set(0);

    // NOTE: Keep announcements here so CRUD screens do not announce the same
    // result twice; web uses the live-region setting on the toast container.
    if (Platform.OS !== "web") {
      AccessibilityInfo.announceForAccessibilityWithOptions(
        accessibilityLabel,
        item.tone === "success"
          ? { priority: "low", queue: true }
          : { priority: "high", queue: false },
      );
    }
  }, [accessibilityLabel, item.id, item.tone, translateX]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .withTestId("toast-pan")
        .maxPointers(1)
        .activeOffsetX([-10, 10])
        .failOffsetY([-24, 24])
        .onStart(() => {
          gestureStartX.set(translateX.get());
        })
        .onUpdate((event) => {
          translateX.set(gestureStartX.get() + event.translationX);
        })
        .onEnd((event) => {
          const width = measuredWidth.get();
          const shouldDismiss = shouldDismissToast(
            translateX.get(),
            width,
            event.velocityX,
          );

          if (shouldDismiss) {
            if (reduceMotion) {
              scheduleOnRN(dismissToastOnRN, item.id);
              return;
            }

            const direction = Math.sign(translateX.get() || event.velocityX);
            translateX.set(
              withTiming(
                direction * (width + 24),
                { duration: 150, easing: EASE_OUT },
                (finished) => {
                  if (finished) scheduleOnRN(dismissToastOnRN, item.id);
                },
              ),
            );
            return;
          }

          if (reduceMotion) {
            translateX.set(0);
            return;
          }

          translateX.set(
            withSpring(0, {
              dampingRatio: 0.8,
              duration: 400,
              velocity: event.velocityX,
            }),
          );
        }),
    [gestureStartX, item.id, measuredWidth, reduceMotion, translateX],
  );

  const gestureStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.get() }],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        accessibilityActions={[
          { label: "Dismiss notification", name: "dismiss" },
        ]}
        accessibilityHint="Swipe left or right to dismiss."
        accessibilityLabel={accessibilityLabel}
        accessibilityLiveRegion={
          Platform.OS === "web"
            ? item.tone === "success"
              ? "polite"
              : "assertive"
            : "none"
        }
        accessibilityRole="alert"
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "dismiss") {
            toast.dismiss(item.id);
          }
        }}
        onLayout={(event) => {
          measuredWidth.set(event.nativeEvent.layout.width);
        }}
        style={gestureStyle}
        testID="toast-card"
      >
        <View
          className="min-h-14 flex-row items-center rounded-[18px] bg-surface p-1.5 shadow-lg shadow-text-primary/10"
          testID="toast-surface"
        >
          <Animated.View
            className={`min-h-11 min-w-0 flex-1 flex-row items-center gap-2 rounded-xl px-3 ${item.tone === "success" ? "bg-success" : "bg-error"}`}
            entering={TOAST_CONTENT_ENTER}
            key={item.id}
            testID="toast-status"
          >
            <SymbolView
              accessible={false}
              name={
                item.tone === "success"
                  ? {
                      ios: "checkmark.circle.fill",
                      android: "check_circle",
                      web: "check_circle",
                    }
                  : {
                      ios: "exclamationmark.triangle.fill",
                      android: "error",
                      web: "error",
                    }
              }
              size={20}
              testID={`toast-icon-${item.tone}`}
              tintColor={toneForegroundColor}
            />
            <Text
              className={`min-w-0 flex-1 text-[15px] font-semibold leading-5 ${item.tone === "success" ? "text-text-primary" : "text-on-primary"}`}
            >
              {item.message}
            </Text>
          </Animated.View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

/** Global, route-stable host for transient operation feedback. */
export function ToastHost() {
  const item = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  useAutoDismiss(item);

  return (
    <View
      className="absolute inset-x-0 z-[1000] items-center px-3"
      pointerEvents="box-none"
      style={{ top: insets.top + 12 }}
      testID="toast-viewport"
    >
      {item ? (
        <Animated.View
          className="w-full max-w-[480px]"
          entering={reduceMotion ? TOAST_FADE_IN : TOAST_ENTER}
          exiting={reduceMotion ? TOAST_FADE_OUT : TOAST_EXIT}
        >
          <ToastCard item={item} />
        </Animated.View>
      ) : null}
    </View>
  );
}
