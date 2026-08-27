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

      <NativeTabs.Trigger name="cookbooks">
        <NativeTabs.Trigger.Label>Cookbooks</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md={{ default: "library_books", selected: "library_books" }}
          sf={{
            default: "books.vertical",
            selected: "books.vertical.fill",
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
