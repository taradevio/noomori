import { DefaultTheme } from "expo-router";

import colorValues from "./colors.json";

/** Canonical colors from noomori-mobile-app-design-system.md. */
export const colorTokens = Object.freeze({ ...colorValues });

export type ColorTokens = typeof colorTokens;
export type ColorTokenName = keyof ColorTokens;

/** Semantic aliases still used by the existing shared UI components. */
export const noomoriTheme = Object.freeze({
  ...colorTokens,
  text: colorTokens.textPrimary,
  backgroundElement: colorTokens.surfaceSubtle,
  backgroundSelected: colorTokens.border,
});

export type NoomoriTheme = typeof noomoriTheme;
export type ThemeColor = keyof NoomoriTheme;

export const noomoriNavigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colorTokens.primary,
    background: colorTokens.background,
    card: colorTokens.surface,
    text: colorTokens.textPrimary,
    border: colorTokens.border,
    notification: colorTokens.error,
  },
} satisfies typeof DefaultTheme;

export function useTheme() {
  return noomoriTheme;
}
