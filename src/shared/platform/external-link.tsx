import * as Linking from "expo-linking";
import { Link, type Href } from "expo-router";
import { type ComponentProps } from "react";
import { Alert } from "react-native";

type Props = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

export function ExternalLink({ href, ...rest }: Props) {
  return (
    <Link
      target="_blank"
      {...rest}
      href={href as Href}
      onPress={async (event) => {
        if (process.env.EXPO_OS !== "web") {
          event.preventDefault();
          try {
            await Linking.openURL(href);
          } catch {
            Alert.alert(
              "Couldn’t open link",
              "Check that a browser is available and try again.",
            );
          }
        }
      }}
    />
  );
}
