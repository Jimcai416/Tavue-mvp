import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "../lib/i18n";
import { colors, fonts, radius, shadow, space } from "../theme";
import GlassSurface from "./GlassSurface";

export type RootTab = "scan" | "orderHistory" | "profile";

export const TAB_BAR_CONTENT_INSET = 104;

function ScanGlyph({ active }: { active: boolean }) {
  const tint = active ? colors.primaryAction : colors.muted;
  return (
    <View style={styles.scanGlyph}>
      <View style={[styles.scanCorner, styles.scanTopLeft, { borderColor: tint }]} />
      <View style={[styles.scanCorner, styles.scanTopRight, { borderColor: tint }]} />
      <View style={[styles.scanCorner, styles.scanBottomLeft, { borderColor: tint }]} />
      <View style={[styles.scanCorner, styles.scanBottomRight, { borderColor: tint }]} />
      <View style={[styles.scanDot, { backgroundColor: tint }]} />
    </View>
  );
}

function HistoryGlyph({ active }: { active: boolean }) {
  const tint = active ? colors.primaryAction : colors.muted;
  return (
    <View style={[styles.historyGlyph, { borderColor: tint }]}>
      <View style={[styles.clockHand, { backgroundColor: tint }]} />
      <View style={[styles.clockMinute, { backgroundColor: tint }]} />
    </View>
  );
}

function ProfileGlyph({ active }: { active: boolean }) {
  const tint = active ? colors.primaryAction : colors.muted;
  return (
    <View style={styles.profileGlyph}>
      <View style={[styles.profileHead, { borderColor: tint }]} />
      <View style={[styles.profileShoulders, { borderColor: tint }]} />
    </View>
  );
}

export default function BottomTabBar({
  activeTab,
  onSelect,
}: {
  activeTab: RootTab;
  onSelect: (tab: RootTab) => void;
}) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const tabs: Array<{
    id: RootTab;
    label: string;
    icon: (active: boolean) => React.ReactNode;
  }> = [
    { id: "scan", label: t("tabScan"), icon: (active) => <ScanGlyph active={active} /> },
    {
      id: "orderHistory",
      label: t("tabHistory"),
      icon: (active) => <HistoryGlyph active={active} />,
    },
    {
      id: "profile",
      label: t("tabProfile"),
      icon: (active) => <ProfileGlyph active={active} />,
    },
  ];

  return (
    <View
      pointerEvents="box-none"
      style={[styles.positioner, { bottom: Math.max(insets.bottom, space(2.5)) }]}
    >
      <GlassSurface
        style={[styles.glass, shadow.glass]}
        contentStyle={styles.tabs}
        intensity={64}
        strong
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(tab.id)}
              style={({ pressed }) => [
                styles.tab,
                active && styles.tabActive,
                pressed && styles.tabPressed,
              ]}
            >
              {tab.icon(active)}
              <Text style={[styles.label, active && styles.labelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  positioner: {
    position: "absolute",
    left: space(3),
    right: space(3),
    zIndex: 80,
  },
  glass: {
    height: 68,
    borderRadius: radius.sheet,
  },
  tabs: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: space(1.5),
    gap: space(1),
  },
  tab: {
    flex: 1,
    height: 56,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    gap: 3,
  },
  tabActive: {
    backgroundColor: "rgba(185, 81, 62, 0.11)",
  },
  tabPressed: {
    opacity: 0.68,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 9,
    lineHeight: 11,
    color: colors.muted,
  },
  labelActive: {
    fontFamily: fonts.bodyBold,
    color: colors.primaryAction,
  },
  scanGlyph: {
    width: 21,
    height: 20,
  },
  scanCorner: {
    position: "absolute",
    width: 7,
    height: 7,
  },
  scanTopLeft: { left: 0, top: 0, borderLeftWidth: 1.5, borderTopWidth: 1.5 },
  scanTopRight: { right: 0, top: 0, borderRightWidth: 1.5, borderTopWidth: 1.5 },
  scanBottomLeft: { left: 0, bottom: 0, borderLeftWidth: 1.5, borderBottomWidth: 1.5 },
  scanBottomRight: { right: 0, bottom: 0, borderRightWidth: 1.5, borderBottomWidth: 1.5 },
  scanDot: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
    left: 8.5,
    top: 8,
  },
  historyGlyph: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  clockHand: {
    position: "absolute",
    width: 1.5,
    height: 6,
    left: 8.75,
    top: 3,
    borderRadius: 1,
  },
  clockMinute: {
    position: "absolute",
    width: 5,
    height: 1.5,
    left: 8.75,
    top: 8.5,
    borderRadius: 1,
    transform: [{ rotate: "30deg" }],
  },
  profileGlyph: {
    width: 22,
    height: 20,
    alignItems: "center",
  },
  profileHead: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  profileShoulders: {
    position: "absolute",
    bottom: 0,
    width: 19,
    height: 9,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
});
