import type { ComponentRef, KeyboardEvent } from "react";
import { useRef } from "react";
import {
  AccessibilityInfo,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

export type ConfirmationDialogTone = "primary" | "destructive";

export type ConfirmationDialogProps = {
  cancelLabel: string;
  confirmLabel: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  tone: ConfirmationDialogTone;
  visible: boolean;
};

/** A branded confirmation surface for consequential in-app actions. */
export function ConfirmationDialog({
  cancelLabel,
  confirmLabel,
  message,
  onCancel,
  onConfirm,
  title,
  tone,
  visible,
}: ConfirmationDialogProps) {
  const headingRef = useRef<ComponentRef<typeof Text>>(null);
  const confirmClassName =
    tone === "destructive"
      ? "border-error bg-error"
      : "border-primary-strong bg-primary-strong";

  const focusHeading = () => {
    if (headingRef.current) {
      AccessibilityInfo.sendAccessibilityEvent(headingRef.current, "focus");
    }
  };

  return (
    <Modal
      animationType="fade"
      navigationBarTranslucent
      onRequestClose={onCancel}
      onShow={focusHeading}
      statusBarTranslucent
      testID="confirmation-dialog-modal"
      transparent
      visible={visible}
    >
      <View className="flex-1 items-center justify-center px-5 py-5">
        <Pressable
          accessible={false}
          className="absolute inset-0 bg-text-primary/50"
          focusable={false}
          onPress={onCancel}
          testID="confirmation-dialog-backdrop"
        />
        <View
          accessibilityRole="alert"
          accessibilityViewIsModal
          className="max-h-full w-full max-w-[400px] rounded-[20px] border border-border bg-surface p-5 shadow-lg shadow-text-primary/10"
          onAccessibilityEscape={onCancel}
          testID="confirmation-dialog"
          {...(Platform.OS === "web"
            ? {
                onKeyDown: (event: KeyboardEvent) => {
                  if (event.key !== "Escape") return;
                  event.preventDefault();
                  onCancel();
                },
              }
            : {})}
        >
          <Text
            ref={headingRef}
            accessible
            accessibilityRole="header"
            className="text-xl font-bold leading-7 text-text-primary"
          >
            {title}
          </Text>
          <ScrollView
            bounces={false}
            className="mt-2 shrink"
            showsVerticalScrollIndicator={false}
          >
            <Text className="text-base font-normal leading-6 text-text-secondary">
              {message}
            </Text>
          </ScrollView>
          <View className="mt-6 flex-row gap-3">
            <Pressable
              accessibilityLabel={cancelLabel}
              accessibilityRole="button"
              className="min-h-12 flex-1 items-center justify-center rounded-xl border-2 border-border bg-surface px-4 py-3 focus:border-primary-strong active:bg-surface-subtle"
              onPress={onCancel}
              testID="confirmation-dialog-cancel"
            >
              <Text className="text-center text-base font-bold leading-6 text-text-primary">
                {cancelLabel}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={confirmLabel}
              accessibilityRole="button"
              className={`min-h-12 flex-1 items-center justify-center rounded-xl border-2 px-4 py-3 focus:border-text-primary active:opacity-[0.82] ${confirmClassName}`}
              onPress={onConfirm}
              testID="confirmation-dialog-confirm"
            >
              <Text className="text-center text-base font-bold leading-6 text-on-primary">
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
