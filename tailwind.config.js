/** @type {import('tailwindcss').Config} */
const colorTokens = require("./src/shared/design-system/colors.json");

module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  safelist: [
    "bg-background",
    "bg-surface",
    "bg-surface-subtle",
    "text-text-primary",
    "text-text-secondary",
    "bg-primary",
    "bg-primary-strong",
    "bg-secondary",
    "border-border",
    "text-error",
    "text-success",
    "text-on-primary",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: colorTokens.background,
        surface: colorTokens.surface,
        "surface-subtle": colorTokens.surfaceSubtle,
        "text-primary": colorTokens.textPrimary,
        "text-secondary": colorTokens.textSecondary,
        primary: colorTokens.primary,
        "primary-strong": colorTokens.primaryStrong,
        secondary: colorTokens.secondary,
        border: colorTokens.border,
        error: colorTokens.error,
        success: colorTokens.success,
        "on-primary": colorTokens.onPrimary,
      },
    },
  },
  plugins: [],
};
