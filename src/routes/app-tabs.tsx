import { NativeTabs } from "expo-router/unstable-native-tabs";

import { noomoriTheme } from "@/shared/design-system";

/** Primary native tab navigation. */
export default function AppTabs() {
  return (
    <NativeTabs
      backBehavior="history"
      backgroundColor={noomoriTheme.surface}
      iconColor={{
        default: noomoriTheme.textSecondary,
        selected: noomoriTheme.primaryStrong,
      }}
      indicatorColor={noomoriTheme.surfaceSubtle}
      labelStyle={{
        default: { color: noomoriTheme.textSecondary },
        selected: { color: noomoriTheme.textPrimary, fontWeight: "700" },
      }}
      labelVisibilityMode="labeled"
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Recipes</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md={{ default: "menu_book", selected: "menu_book" }}
          sf={{ default: "book.closed", selected: "book.closed.fill" }}
        />
      </NativeTabs.Trigger>

      {/* NOTE: Cookbooks now live inside Recipes; Household takes the top-level slot. */}
      <NativeTabs.Trigger name="household">
        <NativeTabs.Trigger.Label>Household</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md={{ default: "home", selected: "home" }}
          sf={{
            default: "house",
            selected: "house.fill",
          }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md={{ default: "account_circle", selected: "account_circle" }}
          sf={{
            default: "person.crop.circle",
            selected: "person.crop.circle.fill",
          }}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
