import { render, screen } from "@testing-library/react-native";

import { AppIcon } from "@/shared/ui/app-icon";
import { appIconGlyphs, appIconSvg, type AppIconName } from "@/shared/ui/app-icon-glyphs";
import { colorTokens } from "@/shared/design-system";

it("renders every glyph at utility size and preserves color, state, and accessibility", async () => {
  for (const name of Object.keys(appIconGlyphs) as AppIconName[]) {
    const view = await render(<AppIcon name={name} size={14} testID="icon" />);
    const icon = screen.getByTestId("icon", { includeHiddenElements: true });
    const svg = atob(icon.props.source.uri.split(",")[1]);
    expect(svg).toBe(appIconSvg(name));
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).not.toMatch(/fill="(warm|mint)"|undefined/);
    expect(icon).toHaveStyle({ width: 14, height: 14, flexShrink: 0 });
    expect(icon).toHaveProp("accessible", false);
    expect(icon).toHaveProp("importantForAccessibility", "no-hide-descendants");
    expect(icon).toHaveProp("transition", 0);
    await view.unmount();
  }

  const view = await render(<AppIcon name="household" accented testID="selected" />);
  const selectedSvg = atob(screen.getByTestId("selected", { includeHiddenElements: true }).props.source.uri.split(",")[1]);
  expect(selectedSvg).toContain(`fill="${colorTokens.warmSoft}"`);
  expect(selectedSvg).toContain(`fill="${colorTokens.brandSoft}"`);

  await view.rerender(
    <AppIcon name="delete" size={22} color={colorTokens.error} accessibilityLabel="Delete" testID="selected" />,
  );
  const errorIcon = screen.getByTestId("selected", { includeHiddenElements: true });
  expect(atob(errorIcon.props.source.uri.split(",")[1])).toContain(`stroke="${colorTokens.error}"`);
  expect(errorIcon).toHaveProp("accessible", true);
  expect(errorIcon).toHaveProp("accessibilityLabel", "Delete");

  await view.rerender(
    <AppIcon name="add" size={28} color={colorTokens.onPrimary} weight="bold" testID="selected" style={{ opacity: 0.5 }} />,
  );
  const inverse = screen.getByTestId("selected", { includeHiddenElements: true });
  expect(inverse).toHaveStyle({ width: 28, height: 28, opacity: 0.5 });
  expect(atob(inverse.props.source.uri.split(",")[1])).toContain('stroke="#FFFFFF" stroke-width="2.5"');
  expect(appIconSvg("add", '"/><script>')).not.toContain('"/><script>');
});
