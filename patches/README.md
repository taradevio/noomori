# Expo Symbols 56.0.7

The Android renderer uses a text glyph inside a fixed-size view. Android font
padding and user font scaling can offset or clip that glyph. The Bun patch
centers it, removes font padding, and keeps its size independent of text scaling.
Labels continue to respect the user's font size; iOS and web are unchanged.

Both the TypeScript source and the published JavaScript entry are patched.
Remove this patch when an Expo Symbols release includes the same correction.
The regression check is `tests/frontend/android-symbol.functional.test.tsx`.
