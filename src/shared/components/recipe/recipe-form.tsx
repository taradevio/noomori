import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
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
  RecipeIngredientGroup,
  RecipeInstructionGroup,
  RecipeInstructionStep,
  RecipeSourceType,
} from "@/shared/types";

import {
  formatDuration,
  RecipeDurationPicker,
  RecipeUnitPicker,
} from "./recipe-form-pickers";

type RecipeFormProps = {
  initialDraft: RecipeDraft;
  mode: RecipeFormMode;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
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

export function createBlankRecipeDraft(): RecipeDraft {
  // NOTE: Product-approved Create defaults: one serving, no source, and no
  // fabricated ingredient or instruction rows.
  return {
    title: "",
    prepMinutes: null,
    cookMinutes: null,
    servings: 1,
    ingredientGroups: [],
    instructionGroups: [],
    notes: "",
    source: { type: null, name: "", url: "" },
  };
}

function parseAmount(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;

  const mixed = normalized.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const denominator = Number(mixed[3]);
    if (!denominator) return null;
    return Number(mixed[1]) + Number(mixed[2]) / denominator;
  }

  const fraction = normalized.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (!denominator) return null;
    return Number(fraction[1]) / denominator;
  }

  if (!/^\d*\.?\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatScaledAmount(snapshot: AmountSnapshot, servings: number) {
  if (servings === snapshot.baseServings) return snapshot.baseRaw;
  const scaled = (snapshot.baseAmount * servings) / snapshot.baseServings;
  return Number(scaled.toFixed(4)).toString();
}

function isValidWebsiteUrl(value: string) {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
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
  error,
  multiline,
  onBlur,
  onChangeText,
  placeholder,
  value,
}: {
  accessibilityLabel: string;
  error?: string | null;
  multiline?: boolean;
  onBlur?: () => void;
  onChangeText: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  const [focused, setFocused] = useState(false);
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
        multiline={multiline}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        placeholderTextColor={colorTokens.textSecondary}
        selectionColor={colorTokens.primaryStrong}
        textAlignVertical={multiline ? "top" : "center"}
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
  label,
  onPress,
  tone = "secondary",
}: {
  label: string;
  onPress: () => void;
  tone?: "secondary" | "danger";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      className={`min-h-12 items-center justify-center rounded-xl border-2 bg-surface px-4 py-3 focus:border-primary-strong active:bg-surface-subtle ${tone === "danger" ? "border-error" : "border-border"}`}
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
  mode,
  onClose,
  onDirtyChange,
}: RecipeFormProps) {
  const insets = useSafeAreaInsets();
  const initialSignature = useRef(JSON.stringify(initialDraft));
  const amountSnapshots = useRef(new Map<string, AmountSnapshot>());
  const [draft, setDraft] = useState(() => cloneDraft(initialDraft));
  const [titleTouched, setTitleTouched] = useState(false);
  const [sourceNameTouched, setSourceNameTouched] = useState(false);
  const [sourceUrlTouched, setSourceUrlTouched] = useState(false);
  const [durationField, setDurationField] = useState<"prep" | "cook" | null>(
    null,
  );
  const [unitIngredientId, setUnitIngredientId] = useState<string | null>(null);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== initialSignature.current,
    [draft],
  );

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const titleError =
    titleTouched && !draft.title.trim() ? "Enter a recipe name." : null;
  const sourceNameError =
    sourceNameTouched &&
    draft.source.type === "family-friend" &&
    !draft.source.name.trim()
      ? "Add who this recipe came from."
      : null;
  const sourceUrlError =
    sourceUrlTouched &&
    draft.source.type === "website" &&
    !isValidWebsiteUrl(draft.source.url)
      ? "Enter a valid website URL."
      : null;

  const selectedUnitIngredient = draft.ingredientGroups
    .flatMap((group) => group.ingredients)
    .find((ingredient) => ingredient.id === unitIngredientId);

  const updateIngredient = (
    groupId: string,
    ingredientId: string,
    update: Partial<RecipeIngredient>,
  ) => {
    if (typeof update.amount === "string") {
      const parsed = parseAmount(update.amount);
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
            const parsed = parseAmount(ingredient.amount);
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
          contentContainerClassName="w-full max-w-[720px] self-center px-5 pb-12 pt-6"
          contentContainerStyle={{
            paddingBottom: Math.max(insets.bottom + 32, 48),
          }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-8">
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
                          className="flex-row items-start gap-3"
                          key={step.id}
                        >
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
                          <Pressable
                            accessibilityLabel={`Delete instruction step ${index + 1}`}
                            accessibilityRole="button"
                            className="h-12 w-12 items-center justify-center rounded-xl border-2 border-error bg-surface focus:border-primary-strong active:bg-surface-subtle"
                            onPress={() => removeInstruction(group.id, step.id)}
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
                <Text className="text-sm font-medium leading-5 text-text-secondary">
                  Required. Choose a source before saving.
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
              // NOTE: This is intentionally an unconnected visual placeholder.
              // CRUD, submit validation, navigation, and fake success are omitted.
              accessibilityHint="Recipe saving will be connected later."
              accessibilityRole="button"
              className="min-h-[52px] items-center justify-center rounded-xl border-2 border-primary-strong bg-primary-strong px-5 py-3 focus:border-text-primary active:opacity-[0.82]"
              testID={
                mode === "create"
                  ? "save-recipe-placeholder"
                  : "save-changes-placeholder"
              }
            >
              <Text className="text-center text-base font-bold leading-6 text-on-primary">
                {mode === "create" ? "Save recipe" : "Save changes"}
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
