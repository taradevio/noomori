import { View } from "react-native";

type HouseholdIllustrationProps = {
  compact?: boolean;
};

const ILLUSTRATION_WIDTH = 280;
const ILLUSTRATION_HEIGHT = 184;

/** A quiet, decorative recipe-and-household illustration built from tokens. */
export function HouseholdIllustration({
  compact = false,
}: HouseholdIllustrationProps) {
  const scale = compact ? 0.78 : 1;

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="relative"
      style={{
        width: ILLUSTRATION_WIDTH * scale,
        height: ILLUSTRATION_HEIGHT * scale,
      }}
    >
      <View
        className="absolute h-[184px] w-[280px]"
        style={{
          left: (ILLUSTRATION_WIDTH * scale - ILLUSTRATION_WIDTH) / 2,
          top: (ILLUSTRATION_HEIGHT * scale - ILLUSTRATION_HEIGHT) / 2,
          transform: [{ scale }],
        }}
      >
        <View className="absolute left-2 top-7 h-36 w-[264px] rounded-[72px] bg-surface-subtle opacity-[0.76]" />

        <View className="absolute left-7 top-1.5 h-[158px] w-[166px] overflow-hidden rounded-2xl border border-border bg-surface shadow-sm shadow-text-primary/5">
          <View className="h-24 overflow-hidden bg-background">
            <View className="absolute left-7 top-2.5 h-[78px] w-[78px] rounded-[39px] bg-primary opacity-15" />
            <View className="absolute left-9 top-[18px] h-[62px] w-[62px] rounded-[31px] border-[7px] border-surface bg-surface-subtle" />
            <View className="absolute left-[50px] top-[38px] h-[22px] w-[34px] -rotate-[8deg] rounded-[11px] bg-primary" />
            <View className="absolute left-[59px] top-[31px] h-[23px] w-2 rotate-[36deg] rounded bg-secondary" />
            <View className="absolute left-[71px] top-[31px] h-[21px] w-2 -rotate-[24deg] rounded bg-success" />
          </View>
          <View className="gap-[7px] px-3.5 pt-[13px]">
            <View className="h-2 w-24 rounded bg-text-primary opacity-[0.88]" />
            <View className="h-[5px] w-[132px] rounded-[3px] bg-border" />
            <View className="h-[5px] w-[88px] rounded-[3px] bg-border" />
          </View>
        </View>

        <View className="absolute right-4 top-[52px] min-h-[102px] w-28 gap-[9px] rounded-[14px] border border-border bg-surface p-[13px] shadow-sm shadow-text-primary/5">
          <View className="flex-row items-center">
            <View className="z-30 h-6 w-6 rounded-xl border-2 border-surface bg-primary" />
            <View className="z-20 -ml-1.5 h-6 w-6 rounded-xl border-2 border-surface bg-secondary" />
            <View className="z-10 -ml-1.5 h-6 w-6 rounded-xl border-2 border-surface bg-surface-subtle" />
          </View>
          <View className="h-[7px] w-[72px] rounded bg-text-primary opacity-[0.84]" />
          <View className="h-[5px] w-[52px] rounded-[3px] bg-border" />
          <View className="flex-row items-center gap-[5px]">
            <View className="h-[7px] w-[7px] rounded bg-secondary" />
            <View className="h-[5px] w-[42px] rounded-[3px] bg-surface-subtle" />
          </View>
        </View>
      </View>
    </View>
  );
}
