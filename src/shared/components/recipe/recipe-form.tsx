import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  KeyboardTypeOptions,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colorTokens } from "@/shared/design-system";
import type {
  RecipeDraft,
  RecipeFormMode,
  RecipeIngredient,
  RecipeInstructionStep,
  RecipeNutrition,
  RecipeSourceType,
} from "@/shared/types";

import { nutritionFields } from "./recipe-calculations";
import {
  formatDuration,
  RecipeDurationPicker,
  RecipeUnitPicker,
} from "./recipe-form-pickers";
import {
  debugRecipeImage,
  prepareRecipeImage,
  type PreparedRecipePhoto,
} from "./recipe-image";
import {
  hasRecipeDraftErrors,
  parseRecipeAmount,
  validateRecipeDraft,
} from "./recipe-payload";

export { createBlankRecipeDraft } from "./recipe-draft";

type RecipeFormProps = {
  initialDraft: RecipeDraft;
  initialPreparedPhoto?: PreparedRecipePhoto | null;
  notice?: string | null;
  mode: RecipeFormMode;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSubmit: (
    draft: RecipeDraft,
    photo: PreparedRecipePhoto | null,
  ) => void | Promise<void>;
  isSubmitting?: boolean;
};

type AmountSnapshot = {
  baseAmount: number;
  baseRaw: string;
  baseServings: number;
};

let localId = 0;

function createLocalId(prefix: string) {
  localId += 1;
  return `${prefix}-${localId}`;
}

function cloneDraft(draft: RecipeDraft): RecipeDraft {
  return {
    ...draft,
    photo: draft.photo ? { ...draft.photo } : null,
    nutrition: { ...draft.nutrition },
    source: { ...draft.source },
    ingredientGroups: draft.ingredientGroups.map((group) => ({
      ...group,
      ingredients: group.ingredients.map((ingredient) => ({ ...ingredient })),
    })),
    instructionGroups: draft.instructionGroups.map((group) => ({
      ...group,
      steps: group.steps.map((step) => ({ ...step })),
    })),
  };
}

function formatScaledAmount(snapshot: AmountSnapshot, servings: number) {
  if (servings === snapshot.baseServings) return snapshot.baseRaw;
  const scaled = (snapshot.baseAmount * servings) / snapshot.baseServings;
  return Number(scaled.toFixed(4)).toString();
}

function FieldLabel({
  label,
  required,
}: {
  label: string;
  required?: boolean;
}) {
  return (
    <View className="mb-2 flex-row items-baseline justify-between gap-4">
      <Text className="shrink text-sm font-bold leading-5 text-text-primary">
        {label}
      </Text>
      {required ? (
        <Text className="text-[13px] font-medium leading-[18px] text-text-secondary">
          Required
        </Text>
      ) : null}
    </View>
  );
}

function FormInput({
  accessibilityLabel,
  compactMultiline,
  error,
  multiline,
  keyboardType,
  onBlur,
  onChangeText,
  placeholder,
  value,
}: {
  accessibilityLabel: string;
  compactMultiline?: boolean;
  error?: string | null;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  onBlur?: () => void;
  onChangeText: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  const [focused, setFocused] = useState(false);
  const wraps = multiline || compactMultiline;
  const border = error
    ? "border-error"
    : focused
      ? "border-primary-strong"
      : "border-border";

  return (
    <View>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        className={`${multiline ? "min-h-[112px]" : "min-h-[52px]"} rounded-xl border-2 bg-surface px-4 py-3 text-base font-normal leading-6 text-text-primary ${border}`}
        keyboardType={keyboardType}
        multiline={wraps}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        placeholderTextColor={colorTokens.textSecondary}
        scrollEnabled={compactMultiline ? false : undefined}
        selectionColor={colorTokens.primaryStrong}
        textAlignVertical={wraps ? "top" : "center"}
        value={value}
      />
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          className="mt-2 text-sm font-medium leading-5 text-error"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function ActionButton({
  disabled = false,
  label,
  onPress,
  tone = "secondary",
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  tone?: "secondary" | "danger";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={`min-h-12 items-center justify-center rounded-xl border-2 bg-surface px-4 py-3 focus:border-primary-strong active:bg-surface-subtle disabled:opacity-50 ${tone === "danger" ? "border-error" : "border-border"}`}
      disabled={disabled}
      onPress={onPress}
    >
      <Text
        className={`text-center text-sm font-bold leading-5 ${tone === "danger" ? "text-error" : "text-primary-strong"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SectionHeading({ body, title }: { body: string; title: string }) {
  return (
    <View className="gap-1.5">
      <Text
        accessibilityRole="header"
        className="text-xl font-bold leading-7 text-text-primary"
      >
        {title}
      </Text>
      <Text className="text-sm font-normal leading-5 text-text-secondary">
        {body}
      </Text>
    </View>
  );
}

export function RecipeForm({
  initialDraft,
  initialPreparedPhoto = null,
  notice = null,
  mode,
  onClose,
  onDirtyChange,
  onSubmit,
  isSubmitting = false,
}: RecipeFormProps) {
  const insets = useSafeAreaInsets();
  const [initialSignature] = useState(() => JSON.stringify(initialDraft));
  const amountSnapshots = useRef(new Map<string, AmountSnapshot>());
  const photoGeneration = useRef(0);
  // NOTE: Website imports seed bytes prepared before review, avoiding a second
  // conversion while keeping picker replacement and removal behavior unchanged.
  const preparedPhoto = useRef<PreparedRecipePhoto | null>(
    initialPreparedPhoto,
  );
  // PERFORMANCE: A synchronous ref closes the render-sized gap where rapid taps
  // could start duplicate POST/PUT requests before disabled state is painted.
  const submitLock = useRef(false);
  const photoPreparation = useRef<Promise<PreparedRecipePhoto | null> | null>(
    null,
  );
  const [draft, setDraft] = useState(() => cloneDraft(initialDraft));
  const [titleTouched, setTitleTouched] = useState(false);
  const [sourceNameTouched, setSourceNameTouched] = useState(false);
  const [sourceUrlTouched, setSourceUrlTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [ingredientAmountTouched, setIngredientAmountTouched] = useState<
    Record<string, boolean>
  >({});
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [nutritionTouched, setNutritionTouched] = useState<
    Partial<Record<keyof RecipeNutrition, boolean>>
  >({});
  const [durationField, setDurationField] = useState<"prep" | "cook" | null>(
    null,
  );
  const [unitIngredientId, setUnitIngredientId] = useState<string | null>(null);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== initialSignature,
    [draft, initialSignature],
  );

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(
    () => () => {
      photoGeneration.current += 1;
    },
    [],
  );

  const validationErrors = useMemo(() => validateRecipeDraft(draft), [draft]);
  const titleError =
    titleTouched || submitAttempted ? validationErrors.title : null;
  const sourceNameError =
    sourceNameTouched || submitAttempted ? validationErrors.sourceName : null;
  const sourceUrlError =
    sourceUrlTouched || submitAttempted ? validationErrors.sourceUrl : null;
  const nutritionError = (key: keyof RecipeNutrition) => {
    if (!nutritionTouched[key] && !submitAttempted) return null;
    return validationErrors.nutrition[key] ?? null;
  };

  const submit = async () => {
    if (submitLock.current || isSubmitting) return;
    setSubmitAttempted(true);
    if (hasRecipeDraftErrors(validationErrors)) return;

    // PERFORMANCE: One local state spans photo preparation, mutation, and route
    // handoff, preventing save-label flicker between asynchronous stages.
    submitLock.current = true;
    setIsSubmittingForm(true);
    try {
      const generation = photoGeneration.current;
      let photo = preparedPhoto.current;
      if (draft.photo && photoPreparation.current) {
        debugRecipeImage("save_waiting_for_preparation");
        photo = await photoPreparation.current;
      }
      if (generation !== photoGeneration.current) {
        debugRecipeImage("stale_preparation_ignored");
        return;
      }
      if (draft.photo && !draft.photo.imagePath && !photo) {
        debugRecipeImage("save_blocked_by_photo_error");
        setPhotoError(
          (current) =>
            current ?? "This photo couldn’t be used. Choose another photo.",
        );
        return;
      }

      await onSubmit(draft, photo);
    } catch {
      // The route-owned mutation exposes its normal error state.
    } finally {
      submitLock.current = false;
      setIsSubmittingForm(false);
    }
  };

  const pickPhoto = async () => {
    debugRecipeImage("picker_opened");
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        mediaTypes: ["images"],
        quality: 1,
      });
      if (result.canceled) {
        debugRecipeImage("picker_cancelled");
        return;
      }
      const asset = result.assets[0];
      if (!asset) return;
      debugRecipeImage("photo_selected", {
        width: asset.width,
        height: asset.height,
        mimeType: asset.mimeType ?? "unknown",
      });
      setPhotoError(null);
      const photo = {
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        fileName: asset.fileName ?? null,
        mimeType: asset.mimeType ?? null,
      };
      const generation = ++photoGeneration.current;
      preparedPhoto.current = null;
      setDraft((current) => ({
        ...current,
        photo,
      }));

      photoPreparation.current = prepareRecipeImage(photo)
        .then((prepared) => {
          if (generation !== photoGeneration.current) {
            debugRecipeImage("stale_preparation_ignored");
            return null;
          }
          preparedPhoto.current = prepared;
          return prepared;
        })
        .catch((error: unknown) => {
          if (generation !== photoGeneration.current) {
            debugRecipeImage("stale_preparation_error_ignored");
            return null;
          }
          preparedPhoto.current = null;
          setPhotoError(
            error instanceof Error
              ? error.message
              : "This photo couldn’t be used. Choose another photo.",
          );
          return null;
        });
    } catch (error) {
      debugRecipeImage("picker_failed", {
        message: error instanceof Error ? error.message : "Unknown error",
      });
      setPhotoError("Couldn’t open your photo library. Try again.");
    }
  };

  const removePhoto = () => {
    debugRecipeImage("photo_removed");
    photoGeneration.current += 1;
    preparedPhoto.current = null;
    photoPreparation.current = null;
    setPhotoError(null);
    setDraft((current) => ({ ...current, photo: null }));
  };

  const isSaving = isSubmitting || isSubmittingForm;

  const selectedUnitIngredient = draft.ingredientGroups
    .flatMap((group) => group.ingredients)
    .find((ingredient) => ingredient.id === unitIngredientId);

  const updateIngredient = (
    groupId: string,
    ingredientId: string,
    update: Partial<RecipeIngredient>,
  ) => {
    if (typeof update.amount === "string") {
      const parsed = parseRecipeAmount(update.amount);
      if (parsed === null) {
        amountSnapshots.current.delete(ingredientId);
      } else {
        amountSnapshots.current.set(ingredientId, {
          baseAmount: parsed,
          baseRaw: update.amount.trim(),
          baseServings: draft.servings,
        });
      }
    }

    setDraft((current) => ({
      ...current,
      ingredientGroups: current.ingredientGroups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              ingredients: group.ingredients.map((ingredient) =>
                ingredient.id === ingredientId
                  ? { ...ingredient, ...update }
                  : ingredient,
              ),
            }
          : group,
      ),
    }));
  };

  const addIngredient = (groupId?: string) => {
    const ingredient: RecipeIngredient = {
      id: createLocalId("ingredient"),
      amount: "",
      unit: "",
      name: "",
      note: "",
    };

    setDraft((current) => {
      if (!current.ingredientGroups.length) {
        return {
          ...current,
          ingredientGroups: [
            {
              id: createLocalId("ingredient-group"),
              title: null,
              ingredients: [ingredient],
            },
          ],
        };
      }

      const targetId = groupId ?? current.ingredientGroups.at(-1)?.id;
      return {
        ...current,
        ingredientGroups: current.ingredientGroups.map((group) =>
          group.id === targetId
            ? { ...group, ingredients: [...group.ingredients, ingredient] }
            : group,
        ),
      };
    });
  };

  const addIngredientSection = () => {
    setDraft((current) => ({
      ...current,
      ingredientGroups: [
        ...current.ingredientGroups,
        {
          id: createLocalId("ingredient-group"),
          title: "",
          ingredients: [],
        },
      ],
    }));
  };

  const removeIngredientSection = (groupId: string) => {
    // NOTE: Removing a section flattens its ingredients into an unsectioned
    // group so section management never silently deletes entered content.
    setDraft((current) => {
      const removed = current.ingredientGroups.find(
        (group) => group.id === groupId,
      );
      if (!removed) return current;

      const remaining = current.ingredientGroups.filter(
        (group) => group.id !== groupId,
      );
      if (!removed.ingredients.length) {
        return { ...current, ingredientGroups: remaining };
      }

      const simpleIndex = remaining.findIndex((group) => group.title === null);
      if (simpleIndex >= 0) {
        return {
          ...current,
          ingredientGroups: remaining.map((group, index) =>
            index === simpleIndex
              ? {
                  ...group,
                  ingredients: [...group.ingredients, ...removed.ingredients],
                }
              : group,
          ),
        };
      }

      return {
        ...current,
        ingredientGroups: [{ ...removed, title: null }, ...remaining],
      };
    });
  };

  const removeIngredient = (groupId: string, ingredientId: string) => {
    amountSnapshots.current.delete(ingredientId);
    setDraft((current) => ({
      ...current,
      ingredientGroups: current.ingredientGroups
        .map((group) =>
          group.id === groupId
            ? {
                ...group,
                ingredients: group.ingredients.filter(
                  (ingredient) => ingredient.id !== ingredientId,
                ),
              }
            : group,
        )
        .filter(
          (group) => group.title !== null || group.ingredients.length > 0,
        ),
    }));
  };

  const setServings = (servings: number) => {
    const nextServings = Math.max(1, servings);
    // NOTE: Every numeric amount is derived from its stable snapshot instead of
    // the last rendered value, preventing cumulative rounding drift.
    setDraft((current) => ({
      ...current,
      servings: nextServings,
      ingredientGroups: current.ingredientGroups.map((group) => ({
        ...group,
        ingredients: group.ingredients.map((ingredient) => {
          let snapshot = amountSnapshots.current.get(ingredient.id);
          if (!snapshot) {
            const parsed = parseRecipeAmount(ingredient.amount);
            if (parsed === null) return ingredient;
            snapshot = {
              baseAmount: parsed,
              baseRaw: ingredient.amount.trim(),
              baseServings: current.servings,
            };
            amountSnapshots.current.set(ingredient.id, snapshot);
          }
          return {
            ...ingredient,
            amount: formatScaledAmount(snapshot, nextServings),
          };
        }),
      })),
    }));
  };

  const addInstruction = (groupId?: string) => {
    const step: RecipeInstructionStep = {
      id: createLocalId("instruction"),
      text: "",
    };
    setDraft((current) => {
      if (!current.instructionGroups.length) {
        return {
          ...current,
          instructionGroups: [
            {
              id: createLocalId("instruction-group"),
              title: null,
              steps: [step],
            },
          ],
        };
      }
      const targetId = groupId ?? current.instructionGroups.at(-1)?.id;
      return {
        ...current,
        instructionGroups: current.instructionGroups.map((group) =>
          group.id === targetId
            ? { ...group, steps: [...group.steps, step] }
            : group,
        ),
      };
    });
  };

  const addInstructionSection = () => {
    setDraft((current) => ({
      ...current,
      instructionGroups: [
        ...current.instructionGroups,
        { id: createLocalId("instruction-group"), title: "", steps: [] },
      ],
    }));
  };

  const removeInstructionSection = (groupId: string) => {
    // NOTE: Removing a section flattens its steps into an unsectioned group so
    // section management never silently destroys user-entered instructions.
    setDraft((current) => {
      const removed = current.instructionGroups.find(
        (group) => group.id === groupId,
      );
      if (!removed) return current;
      const remaining = current.instructionGroups.filter(
        (group) => group.id !== groupId,
      );
      if (!removed.steps.length)
        return { ...current, instructionGroups: remaining };

      const simpleIndex = remaining.findIndex((group) => group.title === null);
      if (simpleIndex >= 0) {
        return {
          ...current,
          instructionGroups: remaining.map((group, index) =>
            index === simpleIndex
              ? { ...group, steps: [...group.steps, ...removed.steps] }
              : group,
          ),
        };
      }
      return {
        ...current,
        instructionGroups: [{ ...removed, title: null }, ...remaining],
      };
    });
  };

  const removeInstruction = (groupId: string, stepId: string) => {
    setDraft((current) => ({
      ...current,
      instructionGroups: current.instructionGroups
        .map((group) =>
          group.id === groupId
            ? {
                ...group,
                steps: group.steps.filter((step) => step.id !== stepId),
              }
            : group,
        )
        .filter((group) => group.title !== null || group.steps.length > 0),
    }));
  };

  const updateSourceType = (type: RecipeSourceType) => {
    setSourceNameTouched(false);
    setSourceUrlTouched(false);
    setDraft((current) => ({
      ...current,
      source: { type, name: "", url: "" },
    }));
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
    >
      <View style={{ paddingTop: insets.top }} className="flex-1">
        <View className="min-h-16 flex-row items-center gap-3 border-b border-border bg-surface px-4 py-2">
          <Pressable
            accessibilityLabel="Close recipe editor"
            accessibilityRole="button"
            className="h-12 w-12 items-center justify-center rounded-full border-2 border-transparent focus:border-primary-strong active:bg-surface-subtle"
            onPress={onClose}
          >
            <SymbolView
              accessible={false}
              name={{ ios: "xmark", android: "close", web: "close" }}
              size={22}
              tintColor={colorTokens.textPrimary}
            />
          </Pressable>
          <Text
            accessibilityRole="header"
            className="shrink flex-1 text-xl font-bold leading-7 text-text-primary"
          >
            {mode === "create" ? "Add recipe" : "Edit recipe"}
          </Text>
        </View>

        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={{
            paddingBottom: Math.max(insets.bottom + 32, 48),
          }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        >
          <View className="w-full max-w-[720px] self-center gap-8 px-5 pt-6">
            {/* NOTE: Import warnings are inline and non-blocking so users can
                review or replace the photo immediately. */}
            {notice ? (
              <View
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
                className="rounded-xl border border-border bg-surface-subtle px-4 py-3"
              >
                <Text className="text-sm font-medium leading-5 text-text-secondary">
                  {notice}
                </Text>
              </View>
            ) : null}
            <View className="gap-4">
              <SectionHeading
                body="Optional. Choose one photo that helps you recognize this recipe."
                title="Recipe photo"
              />
              <View className="aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-surface-subtle">
                {draft.photo?.uri ? (
                  <Image
                    accessibilityLabel="Selected recipe photo"
                    accessible
                    cachePolicy="memory-disk"
                    contentFit="cover"
                    source={{
                      uri: draft.photo.uri,
                      cacheKey: draft.photo.imagePath ?? undefined,
                    }}
                    style={{ width: "100%", height: "100%" }}
                  />
                ) : (
                  <View className="h-full items-center justify-center gap-3 px-5">
                    <View className="h-14 w-14 items-center justify-center rounded-2xl bg-surface">
                      <SymbolView
                        accessible={false}
                        name={{ ios: "photo", android: "image", web: "image" }}
                        size={26}
                        tintColor={colorTokens.textSecondary}
                      />
                    </View>
                    <Text className="text-center text-sm leading-5 text-text-secondary">
                      {draft.photo ? "Photo unavailable" : "No photo selected"}
                    </Text>
                  </View>
                )}
              </View>
              <View className="flex-row flex-wrap gap-3">
                <View className="min-w-[160px] flex-1">
                  <ActionButton
                    disabled={isSaving}
                    label={draft.photo ? "Replace photo" : "Choose photo"}
                    onPress={pickPhoto}
                  />
                </View>
                {draft.photo ? (
                  <View className="min-w-[140px] flex-1">
                    <ActionButton
                      disabled={isSaving}
                      label="Remove photo"
                      onPress={removePhoto}
                      tone="danger"
                    />
                  </View>
                ) : null}
              </View>
              {photoError ? (
                <Text
                  accessibilityLiveRegion="polite"
                  accessibilityRole="alert"
                  className="text-sm font-medium leading-5 text-error"
                >
                  {photoError}
                </Text>
              ) : null}
            </View>

            <View>
              <FieldLabel label="Recipe title" required />
              <FormInput
                accessibilityLabel="Recipe title"
                error={titleError}
                onBlur={() => setTitleTouched(true)}
                onChangeText={(title) =>
                  setDraft((current) => ({ ...current, title }))
                }
                placeholder="e.g. Sunday tomato pasta"
                value={draft.title}
              />
            </View>

            <View className="gap-4">
              <SectionHeading
                body="Choose structured times so recipes stay easy to scan."
                title="Timing"
              />
              <View className="flex-row gap-3">
                {(["prep", "cook"] as const).map((field) => {
                  const value =
                    field === "prep" ? draft.prepMinutes : draft.cookMinutes;
                  const label = field === "prep" ? "Prep time" : "Cook time";
                  return (
                    <View className="flex-1" key={field}>
                      <Text className="mb-2 text-sm font-bold text-text-primary">
                        {label}
                      </Text>
                      <Pressable
                        accessibilityHint={`Opens ${label.toLowerCase()} choices.`}
                        accessibilityRole="button"
                        className="min-h-[52px] flex-row items-center justify-between gap-2 rounded-xl border-2 border-border bg-surface px-3 py-3 focus:border-primary-strong active:bg-surface-subtle"
                        onPress={() => setDurationField(field)}
                      >
                        <Text className="shrink text-base font-medium text-text-primary">
                          {formatDuration(value)}
                        </Text>
                        <SymbolView
                          accessible={false}
                          name={{
                            ios: "chevron.down",
                            android: "keyboard_arrow_down",
                            web: "keyboard_arrow_down",
                          }}
                          size={18}
                          tintColor={colorTokens.textSecondary}
                        />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>

            <View className="gap-4">
              <SectionHeading
                body="Ingredient amounts scale from their original values."
                title="Servings"
              />
              <View className="max-w-[280px] flex-row items-center justify-between rounded-2xl border border-border bg-surface p-2">
                <Pressable
                  accessibilityLabel="Decrease servings"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: draft.servings <= 1 }}
                  className={`h-12 w-12 items-center justify-center rounded-xl border-2 border-border focus:border-primary-strong active:bg-surface-subtle ${draft.servings <= 1 ? "opacity-40" : ""}`}
                  disabled={draft.servings <= 1}
                  onPress={() => setServings(draft.servings - 1)}
                >
                  <SymbolView
                    accessible={false}
                    name={{ ios: "minus", android: "remove", web: "remove" }}
                    size={22}
                    tintColor={colorTokens.textPrimary}
                  />
                </Pressable>
                <Text
                  accessibilityLabel={`${draft.servings} servings`}
                  className="px-4 text-2xl font-bold text-text-primary"
                >
                  {draft.servings}
                </Text>
                <Pressable
                  accessibilityLabel="Increase servings"
                  accessibilityRole="button"
                  className="h-12 w-12 items-center justify-center rounded-xl border-2 border-border focus:border-primary-strong active:bg-surface-subtle"
                  onPress={() => setServings(draft.servings + 1)}
                >
                  <SymbolView
                    accessible={false}
                    name={{ ios: "plus", android: "add", web: "add" }}
                    size={22}
                    tintColor={colorTokens.textPrimary}
                  />
                </Pressable>
              </View>
            </View>

            <View className="gap-4">
              <SectionHeading
                body="Add structured amounts, units, names, and preparation notes."
                title="Ingredients"
              />
              {draft.ingredientGroups.length ? (
                <View className="gap-6">
                  {draft.ingredientGroups.map((group) => (
                    <View className="gap-3" key={group.id}>
                      {group.title !== null ? (
                        <View className="gap-2 border-b border-border pb-3">
                          <FormInput
                            accessibilityLabel="Ingredient section name"
                            onChangeText={(title) =>
                              setDraft((current) => ({
                                ...current,
                                ingredientGroups: current.ingredientGroups.map(
                                  (item) =>
                                    item.id === group.id
                                      ? { ...item, title }
                                      : item,
                                ),
                              }))
                            }
                            placeholder="Section name"
                            value={group.title}
                          />
                          <ActionButton
                            label="Remove section and keep ingredients"
                            onPress={() => removeIngredientSection(group.id)}
                            tone="danger"
                          />
                        </View>
                      ) : null}

                      {group.ingredients.map((ingredient, index) => (
                        <View
                          className="gap-3 rounded-2xl border border-border bg-surface-subtle p-4"
                          key={ingredient.id}
                        >
                          <View className="flex-row items-center justify-between gap-3">
                            <Text className="text-sm font-bold text-text-primary">
                              Ingredient {index + 1}
                            </Text>
                            <Pressable
                              accessibilityLabel={`Delete ingredient ${index + 1}`}
                              accessibilityRole="button"
                              className="h-12 w-12 items-center justify-center rounded-xl border-2 border-error bg-surface focus:border-primary-strong active:bg-surface-subtle"
                              onPress={() =>
                                removeIngredient(group.id, ingredient.id)
                              }
                            >
                              <SymbolView
                                accessible={false}
                                name={{
                                  ios: "trash",
                                  android: "delete",
                                  web: "delete",
                                }}
                                size={20}
                                tintColor={colorTokens.error}
                              />
                            </Pressable>
                          </View>
                          <View className="flex-row gap-3">
                            <View className="flex-1">
                              <FieldLabel label="Amount" />
                              <FormInput
                                accessibilityLabel={`Ingredient ${index + 1} amount`}
                                error={
                                  ingredientAmountTouched[ingredient.id] ||
                                  submitAttempted
                                    ? validationErrors.ingredientAmounts[
                                        ingredient.id
                                      ]
                                    : null
                                }
                                onBlur={() =>
                                  setIngredientAmountTouched((current) => ({
                                    ...current,
                                    [ingredient.id]: true,
                                  }))
                                }
                                onChangeText={(amount) =>
                                  updateIngredient(group.id, ingredient.id, {
                                    amount,
                                  })
                                }
                                placeholder="1 1/2"
                                value={ingredient.amount}
                              />
                            </View>
                            <View className="flex-1">
                              <FieldLabel label="Unit" />
                              <Pressable
                                accessibilityLabel={`Ingredient ${index + 1} unit`}
                                accessibilityRole="button"
                                className="min-h-[52px] flex-row items-center justify-between rounded-xl border-2 border-border bg-surface px-3 py-3 focus:border-primary-strong active:bg-surface-subtle"
                                onPress={() =>
                                  setUnitIngredientId(ingredient.id)
                                }
                              >
                                <Text className="shrink text-base text-text-primary">
                                  {ingredient.unit || "No unit"}
                                </Text>
                                <SymbolView
                                  accessible={false}
                                  name={{
                                    ios: "chevron.down",
                                    android: "keyboard_arrow_down",
                                    web: "keyboard_arrow_down",
                                  }}
                                  size={18}
                                  tintColor={colorTokens.textSecondary}
                                />
                              </Pressable>
                            </View>
                          </View>
                          <View>
                            <FieldLabel label="Ingredient name" />
                            <FormInput
                              accessibilityLabel={`Ingredient ${index + 1} name`}
                              compactMultiline
                              onChangeText={(name) =>
                                updateIngredient(group.id, ingredient.id, {
                                  name,
                                })
                              }
                              placeholder="e.g. tomatoes"
                              value={ingredient.name}
                            />
                          </View>
                          <View>
                            <FieldLabel label="Note" />
                            <FormInput
                              accessibilityLabel={`Ingredient ${index + 1} note`}
                              onChangeText={(note) =>
                                updateIngredient(group.id, ingredient.id, {
                                  note,
                                })
                              }
                              placeholder="Optional, e.g. finely chopped"
                              value={ingredient.note}
                            />
                          </View>
                        </View>
                      ))}
                      <ActionButton
                        label="Add ingredient"
                        onPress={() => addIngredient(group.id)}
                      />
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="rounded-xl border border-border bg-surface px-4 py-4 text-sm leading-5 text-text-secondary">
                  No ingredients yet. Add a simple ingredient or start with a
                  section.
                </Text>
              )}
              <View className="flex-row gap-3">
                {!draft.ingredientGroups.length ? (
                  <View className="flex-1">
                    <ActionButton
                      label="Add ingredient"
                      onPress={() => addIngredient()}
                    />
                  </View>
                ) : null}
                <View className="flex-1">
                  <ActionButton
                    label="Add section"
                    onPress={addIngredientSection}
                  />
                </View>
              </View>
            </View>

            <View className="gap-4">
              <SectionHeading
                body="Keep each direction independently editable and easy to follow."
                title="Instructions"
              />
              {draft.instructionGroups.length ? (
                <View className="gap-6">
                  {draft.instructionGroups.map((group) => (
                    <View className="gap-3" key={group.id}>
                      {group.title !== null ? (
                        <View className="gap-2 border-b border-border pb-3">
                          <FormInput
                            accessibilityLabel="Instruction section name"
                            onChangeText={(title) =>
                              setDraft((current) => ({
                                ...current,
                                instructionGroups:
                                  current.instructionGroups.map((item) =>
                                    item.id === group.id
                                      ? { ...item, title }
                                      : item,
                                  ),
                              }))
                            }
                            placeholder="Section name"
                            value={group.title}
                          />
                          <ActionButton
                            label="Remove section and keep steps"
                            onPress={() => removeInstructionSection(group.id)}
                            tone="danger"
                          />
                        </View>
                      ) : null}
                      {group.steps.map((step, index) => (
                        <View
                          className="gap-3 rounded-2xl border border-border bg-surface-subtle p-4"
                          key={step.id}
                        >
                          <View className="flex-row items-center justify-between gap-3">
                            <Text className="text-sm font-bold text-text-primary">
                              Instruction {index + 1}
                            </Text>
                            <Pressable
                              accessibilityLabel={`Delete instruction step ${index + 1}`}
                              accessibilityRole="button"
                              className="h-12 w-12 items-center justify-center rounded-xl border-2 border-error bg-surface focus:border-primary-strong active:bg-surface-subtle"
                              onPress={() =>
                                removeInstruction(group.id, step.id)
                              }
                            >
                              <SymbolView
                                accessible={false}
                                name={{
                                  ios: "trash",
                                  android: "delete",
                                  web: "delete",
                                }}
                                size={20}
                                tintColor={colorTokens.error}
                              />
                            </Pressable>
                          </View>
                          <View className="flex-row items-start gap-3">
                            <View
                              accessible={false}
                              className="mt-1 h-10 w-10 items-center justify-center rounded-full bg-surface-subtle"
                            >
                              <Text className="text-base font-bold text-text-primary">
                                {index + 1}
                              </Text>
                            </View>
                            <View className="flex-1">
                              <FormInput
                                accessibilityLabel={`Instruction step ${index + 1}`}
                                multiline
                                onChangeText={(text) =>
                                  setDraft((current) => ({
                                    ...current,
                                    instructionGroups:
                                      current.instructionGroups.map((item) =>
                                        item.id === group.id
                                          ? {
                                              ...item,
                                              steps: item.steps.map(
                                                (currentStep) =>
                                                  currentStep.id === step.id
                                                    ? { ...currentStep, text }
                                                    : currentStep,
                                              ),
                                            }
                                          : item,
                                      ),
                                  }))
                                }
                                placeholder="Describe this step"
                                value={step.text}
                              />
                            </View>
                          </View>
                        </View>
                      ))}
                      <ActionButton
                        label="Add instruction"
                        onPress={() => addInstruction(group.id)}
                      />
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="rounded-xl border border-border bg-surface px-4 py-4 text-sm leading-5 text-text-secondary">
                  No instructions yet. Add a step or organize steps into
                  sections.
                </Text>
              )}
              <View className="flex-row gap-3">
                {!draft.instructionGroups.length ? (
                  <View className="flex-1">
                    <ActionButton
                      label="Add instruction"
                      onPress={() => addInstruction()}
                    />
                  </View>
                ) : null}
                <View className="flex-1">
                  <ActionButton
                    label="Add section"
                    onPress={addInstructionSection}
                  />
                </View>
              </View>
            </View>

            <View>
              <SectionHeading
                body="Keep optional context separate from ingredients and directions."
                title="Notes"
              />
              <View className="mt-4">
                <FormInput
                  accessibilityLabel="Recipe notes"
                  multiline
                  onChangeText={(notes) =>
                    setDraft((current) => ({ ...current, notes }))
                  }
                  placeholder="Optional notes"
                  value={draft.notes}
                />
              </View>
            </View>

            <View className="gap-4">
              <SectionHeading
                body="Optional values per serving. These stay stable when the editor scales the batch."
                title="Nutrition"
              />
              <View className="gap-4">
                {nutritionFields.map(([key, label, unit]) => (
                  <View key={key}>
                    <FieldLabel label={unit ? `${label} (${unit})` : label} />
                    <FormInput
                      accessibilityLabel={`${label} per serving${unit ? ` in ${unit}` : ""}`}
                      error={nutritionError(key)}
                      keyboardType="decimal-pad"
                      onBlur={() =>
                        setNutritionTouched((current) => ({
                          ...current,
                          [key]: true,
                        }))
                      }
                      onChangeText={(value) =>
                        setDraft((current) => ({
                          ...current,
                          nutrition: { ...current.nutrition, [key]: value },
                        }))
                      }
                      placeholder="Optional"
                      value={draft.nutrition[key]}
                    />
                  </View>
                ))}
              </View>
            </View>

            <View className="gap-4">
              <SectionHeading
                body="Choose where this recipe originally came from."
                title="Source"
              />
              <View accessibilityRole="radiogroup" className="gap-2">
                {(
                  [
                    ["my-recipe", "My recipe"],
                    ["family-friend", "Family / Friend"],
                    ["website", "Website"],
                  ] as const
                ).map(([type, label]) => {
                  const selected = draft.source.type === type;
                  return (
                    <Pressable
                      key={type}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      className={`min-h-[52px] flex-row items-center gap-3 rounded-xl border-2 px-4 py-3 focus:border-primary-strong active:bg-surface-subtle ${selected ? "border-primary-strong bg-surface-subtle" : "border-border bg-surface"}`}
                      onPress={() => updateSourceType(type)}
                    >
                      <View
                        accessible={false}
                        className={`h-5 w-5 items-center justify-center rounded-full border-2 ${selected ? "border-primary-strong" : "border-text-secondary"}`}
                      >
                        {selected ? (
                          <View className="h-2.5 w-2.5 rounded-full bg-primary-strong" />
                        ) : null}
                      </View>
                      <Text className="text-base font-medium text-text-primary">
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {!draft.source.type ? (
                <Text
                  accessibilityLiveRegion="polite"
                  accessibilityRole={submitAttempted ? "alert" : undefined}
                  className={`text-sm font-medium leading-5 ${submitAttempted ? "text-error" : "text-text-secondary"}`}
                >
                  {submitAttempted
                    ? validationErrors.source
                    : "Required. Choose a source before saving."}
                </Text>
              ) : null}
              {draft.source.type === "family-friend" ? (
                <View>
                  <FieldLabel label="Who shared it?" required />
                  <FormInput
                    accessibilityLabel="Family or friend source name"
                    error={sourceNameError}
                    onBlur={() => setSourceNameTouched(true)}
                    onChangeText={(name) =>
                      setDraft((current) => ({
                        ...current,
                        source: { ...current.source, name },
                      }))
                    }
                    placeholder="e.g. Mom"
                    value={draft.source.name}
                  />
                </View>
              ) : null}
              {draft.source.type === "website" ? (
                <View>
                  <FieldLabel label="Website URL" required />
                  <FormInput
                    accessibilityLabel="Recipe source website URL"
                    error={sourceUrlError}
                    onBlur={() => setSourceUrlTouched(true)}
                    onChangeText={(url) =>
                      setDraft((current) => ({
                        ...current,
                        source: { ...current.source, url },
                      }))
                    }
                    placeholder="https://example.com/recipe"
                    value={draft.source.url}
                  />
                </View>
              ) : null}
            </View>

            <Pressable
              accessibilityState={{ disabled: isSaving }}
              disabled={isSaving}
              onPress={submit}
              // NOTE: Persistence remains route-owned; the shared form only
              // reports its current draft and pending state.
              accessibilityHint="Saves the current recipe draft."
              accessibilityRole="button"
              className="min-h-[52px] items-center justify-center rounded-xl border-2 border-primary-strong bg-primary-strong px-5 py-3 focus:border-text-primary active:opacity-[0.82] disabled:opacity-50"
              testID={
                mode === "create"
                  ? "save-recipe-placeholder"
                  : "save-changes-placeholder"
              }
            >
              <Text className="text-center text-base font-bold leading-6 text-on-primary">
                {isSaving
                  ? "Saving..."
                  : mode === "create"
                    ? "Save recipe"
                    : "Save changes"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>

      <RecipeDurationPicker
        isOpen={durationField !== null}
        label={durationField === "cook" ? "Cook time" : "Prep time"}
        onDismiss={() => setDurationField(null)}
        onSelect={(minutes) => {
          setDraft((current) =>
            durationField === "cook"
              ? { ...current, cookMinutes: minutes }
              : { ...current, prepMinutes: minutes },
          );
        }}
        value={durationField === "cook" ? draft.cookMinutes : draft.prepMinutes}
      />

      <RecipeUnitPicker
        isOpen={unitIngredientId !== null}
        onDismiss={() => setUnitIngredientId(null)}
        onSelect={(unit) => {
          if (!unitIngredientId) return;
          const group = draft.ingredientGroups.find((item) =>
            item.ingredients.some(
              (ingredient) => ingredient.id === unitIngredientId,
            ),
          );
          if (group) updateIngredient(group.id, unitIngredientId, { unit });
        }}
        value={selectedUnitIngredient?.unit ?? ""}
      />
    </KeyboardAvoidingView>
  );
}
