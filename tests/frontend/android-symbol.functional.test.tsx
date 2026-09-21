import { render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";

jest.mock("expo-font", () => ({ loadAsync: jest.fn().mockResolvedValue(undefined) }));
// jest-expo defaults to iOS resolution; load Android helpers explicitly too.
jest.mock("../../node_modules/expo-symbols/build/utils", () =>
  jest.requireActual("../../node_modules/expo-symbols/build/utils.js"),
);
jest.mock("../../node_modules/expo-symbols/build/android", () =>
  jest.requireActual("../../node_modules/expo-symbols/build/android/index.js"),
);

// Use the executed package renderer, not the global SymbolView mock or iOS adapter.
const { SymbolView } = jest.requireActual(
  "../../node_modules/expo-symbols/build/SymbolView.js",
);

it("keeps the Android add glyph centered and independent of text scaling", async () => {
  const originalOS = Platform.OS;
  Platform.OS = "android";
  try {
    await render(
      <SymbolView
        name={{ android: "add" }}
        size={28}
        tintColor="#001219"
        weight={{ android: { name: "MaterialSymbols_400Regular", font: 1 } }}
      />,
    );
    const glyph = await screen.findByText("\ue145");
    expect(glyph).toHaveProp("allowFontScaling", false);
    expect(glyph).toHaveStyle({
      width: "100%",
      height: "100%",
      includeFontPadding: false,
      textAlign: "center",
      textAlignVertical: "center",
      fontSize: 28,
      lineHeight: 28,
    });
  } finally {
    Platform.OS = originalOS;
  }
});
