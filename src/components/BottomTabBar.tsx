import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "../lib/i18n";
import { colors, fonts, radius, shadow, space } from "../theme";
import GlassSurface from "./GlassSurface";

export type RootTab = "scan" | "orderHistory" | "profile";

export const TAB_BAR_CONTENT_INSET = 108;

const ROOT_TABS: RootTab[] = ["scan", "orderHistory", "profile"];
const TAB_GAP = space(1);
const BAR_PADDING = 5;
const BAR_HEIGHT = 64;
const TAB_HEIGHT = BAR_HEIGHT - BAR_PADDING * 2;

function ScanGlyph({ active }: { active: boolean }) {
  const tint = active ? colors.text : colors.muted;
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
  const tint = active ? colors.text : colors.muted;
  return (
    <View style={[styles.historyGlyph, { borderColor: tint }]}>
      <View style={[styles.clockHand, { backgroundColor: tint }]} />
      <View style={[styles.clockMinute, { backgroundColor: tint }]} />
    </View>
  );
}

function ProfileGlyph({ active }: { active: boolean }) {
  const tint = active ? colors.text : colors.muted;
  return (
    <View style={styles.profileGlyph}>
      <View style={[styles.profileHead, { borderColor: tint }]} />
      <View style={[styles.profileShoulders, { borderColor: tint }]} />
    </View>
  );
}

export default function BottomTabBar({
  activeTab,
  compact = false,
  onSelect,
}: {
  activeTab: RootTab;
  compact?: boolean;
  onSelect: (tab: RootTab) => void;
}) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const activeIndex = ROOT_TABS.indexOf(activeTab);
  const indicatorPosition = useRef(new Animated.Value(activeIndex)).current;
  const compactProgress = useRef(new Animated.Value(compact ? 1 : 0)).current;
  const lensResponse = useRef(new Animated.Value(1)).current;
  const tabLifts = useRef(
    ROOT_TABS.map((_, index) => new Animated.Value(index === activeIndex ? 1 : 0))
  ).current;
  const [barWidth, setBarWidth] = useState(0);
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

  useEffect(() => {
    Animated.parallel([
      Animated.spring(indicatorPosition, {
        toValue: activeIndex,
        damping: 21,
        stiffness: 245,
        mass: 0.74,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(lensResponse, {
          toValue: 0,
          duration: 75,
          useNativeDriver: true,
        }),
        Animated.spring(lensResponse, {
          toValue: 1,
          damping: 18,
          stiffness: 260,
          mass: 0.62,
          useNativeDriver: true,
        }),
      ]),
      ...tabLifts.map((value, index) =>
        Animated.spring(value, {
          toValue: index === activeIndex ? 1 : 0,
          damping: 19,
          stiffness: 220,
          mass: 0.7,
          useNativeDriver: true,
        })
      ),
    ]).start();
  }, [activeIndex, indicatorPosition, lensResponse, tabLifts]);

  useEffect(() => {
    Animated.spring(compactProgress, {
      toValue: compact ? 1 : 0,
      damping: 20,
      stiffness: 235,
      mass: 0.72,
      useNativeDriver: true,
    }).start();
  }, [compact, compactProgress]);

  const tabWidth = Math.max(
    0,
    (barWidth - BAR_PADDING * 2 - TAB_GAP * (ROOT_TABS.length - 1)) /
      ROOT_TABS.length
  );
  const tabStep = tabWidth + TAB_GAP;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.layer, { height: Math.max(insets.bottom, space(2)) + 120 }]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: compactProgress.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0.78],
            }),
          },
        ]}
      >
        <LinearGradient
          colors={[
            "rgba(247,243,238,0)",
            "rgba(247,243,238,0.46)",
            "rgba(247,243,238,0.88)",
            colors.background,
          ]}
          locations={[0, 0.42, 0.76, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.positioner,
          {
            bottom: Math.max(insets.bottom, space(2.5)),
            transform: [
              {
                translateY: compactProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 5],
                }),
              },
              {
                scaleX: compactProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0.91],
                }),
              },
              {
                scaleY: compactProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0.88],
                }),
              },
            ],
          },
        ]}
      >
        <GlassSurface
          style={[styles.glass, shadow.glass]}
          contentStyle={styles.tabs}
          intensity={72}
          strong
        >
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(255,255,255,0.58)", "rgba(255,255,255,0.10)"]}
            locations={[0, 0.52]}
            style={styles.topRefraction}
          />
          <View
            pointerEvents="none"
            style={styles.innerLine}
          />
          <View
            style={StyleSheet.absoluteFill}
            onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
            pointerEvents="none"
          >
            {tabWidth > 0 && (
              <Animated.View
                style={[
                  styles.activeLensFrame,
                  {
                    left: BAR_PADDING,
                    width: tabWidth,
                    transform: [
                      { translateX: Animated.multiply(indicatorPosition, tabStep) },
                      {
                        scaleX: lensResponse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.92, 1],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <View style={styles.lensHighlight} />
              </Animated.View>
            )}
          </View>

          {tabs.map((tab, index) => {
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
                pressed && styles.tabPressed,
              ]}
            >
              <Animated.View
                style={[
                  styles.tabContent,
                  {
                    opacity: tabLifts[index].interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.78, 1],
                    }),
                    transform: [
                      {
                        translateY: tabLifts[index].interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -1.5],
                        }),
                      },
                      {
                        scale: tabLifts[index].interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 1.045],
                        }),
                      },
                    ],
                  },
                ]}
              >
                {tab.icon(active)}
                <Text style={[styles.label, active && styles.labelActive]}>{tab.label}</Text>
              </Animated.View>
            </Pressable>
          );
          })}
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 79,
  },
  positioner: {
    position: "absolute",
    left: space(4),
    right: space(4),
    zIndex: 80,
  },
  glass: {
    height: BAR_HEIGHT,
    borderRadius: radius.pill,
    borderColor: "rgba(255,255,255,0.92)",
  },
  tabs: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: BAR_PADDING,
    gap: TAB_GAP,
  },
  topRefraction: {
    position: "absolute",
    left: 15,
    right: 15,
    top: 1,
    height: 19,
    borderRadius: radius.pill,
  },
  innerLine: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.38)",
    borderRadius: radius.pill,
  },
  activeLensFrame: {
    position: "absolute",
    top: BAR_PADDING,
    height: TAB_HEIGHT,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
    backgroundColor: "rgba(83,78,76,0.10)",
    shadowColor: "#3B3735",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  lensHighlight: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 2,
    height: 1,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.96)",
  },
  tab: {
    flex: 1,
    height: TAB_HEIGHT,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    zIndex: 2,
  },
  tabContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
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
    color: colors.text,
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
