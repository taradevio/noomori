import {
  TabList,
  TabListProps,
  Tabs,
  TabSlot,
  TabTrigger,
  TabTriggerSlotProps,
} from "expo-router/ui";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Pressable, Text, View } from "react-native";

import { colorTokens } from "@/shared/design-system";

/** Primary web tab navigation. */
export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: "100%" }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="recipes" href="/" asChild>
            <TabButton
              icon={{ ios: "book.closed", web: "menu_book" }}
              label="Recipes"
            />
          </TabTrigger>
          <TabTrigger name="cookbooks" href="/cookbooks" asChild>
            <TabButton
              icon={{ ios: "books.vertical", web: "library_books" }}
              label="Cookbooks"
            />
          </TabTrigger>
          <TabTrigger name="account" href="/account" asChild>
            <TabButton
              icon={{ ios: "person.crop.circle", web: "account_circle" }}
              label="Account"
            />
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({
  icon,
  isFocused,
  label,
  ...props
}: TabTriggerSlotProps & {
  icon: SymbolViewProps["name"];
  label: string;
}) {
  return (
    <Pressable
      {...props}
      accessibilityLabel={label}
      className={`min-h-12 flex-1 items-center justify-center gap-1 rounded-xl border-2 px-3 py-2 focus:border-primary-strong active:opacity-[0.72] ${
        isFocused
          ? "border-border bg-surface-subtle"
          : "border-transparent bg-surface"
      }`}
    >
      <SymbolView
        accessible={false}
        name={icon}
        size={22}
        tintColor={
          isFocused ? colorTokens.primaryStrong : colorTokens.textSecondary
        }
      />
      <Text
        className={`text-sm leading-5 ${
          isFocused
            ? "font-bold text-text-primary"
            : "font-medium text-text-secondary"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  return (
    <View
      {...props}
      className="absolute bottom-0 left-0 right-0 z-20 items-center border-t border-border bg-surface px-4 py-3"
    >
      <View className="w-full max-w-[800px] flex-row items-center gap-2">
        {props.children}
      </View>
    </View>
  );
}
