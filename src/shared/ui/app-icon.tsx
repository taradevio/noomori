import { Image, type ImageProps } from "expo-image";
import { useMemo } from "react";

import { appIconSvg, type AppIconName } from "./app-icon-glyphs";

export type { AppIconName } from "./app-icon-glyphs";

export type AppIconProps = Pick<
  ImageProps,
  "accessible" | "accessibilityLabel" | "style" | "testID"
> & {
  name: AppIconName;
  size?: number;
  color?: string;
  accented?: boolean;
  weight?: "regular" | "bold";
};

export function AppIcon({
  name,
  size = 24,
  color,
  accented = false,
  weight = "regular",
  accessibilityLabel,
  accessible = Boolean(accessibilityLabel),
  style,
  testID,
}: AppIconProps) {
  const source = useMemo(
    () => ({
      uri: `data:image/svg+xml;base64,${btoa(appIconSvg(name, color, accented, weight))}`,
    }),
    [name, color, accented, weight],
  );

  return (
    <Image
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!accessible}
      importantForAccessibility={accessible ? "auto" : "no-hide-descendants"}
      contentFit="contain"
      source={source}
      transition={0}
      style={[{ width: size, height: size, flexShrink: 0 }, style]}
      testID={testID}
    />
  );
}
