import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "../lib/i18n";
import { colors, radius, space } from "../theme";
import GlassSurface from "./GlassSurface";

export type RootTab = "scan" | "orderHistory" | "profile";

export const TAB_BAR_CONTENT_INSET = 94;

const ROOT_TABS: RootTab[] = ["scan", "orderHistory", "profile"];
const TAB_GAP = space(1);
const BAR_PADDING = 4;
const BAR_HEIGHT = 52;
const TAB_HEIGHT = BAR_HEIGHT - BAR_PADDING * 2;
const DRAG_START_DISTANCE = 5;

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
  const indicatorValue = useRef(activeIndex);
  const dragStartPosition = useRef(activeIndex);
  const dragging = useRef(false);
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
    if (dragging.current) return;
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
  const settleTabContent = (target: number) => {
    Animated.parallel(
      tabLifts.map((value, index) =>
        Animated.spring(value, {
          toValue: index === target ? 1 : 0,
          damping: 19,
          stiffness: 235,
          mass: 0.66,
          useNativeDriver: true,
        })
      )
    ).start();
  };
  const settleIndicator = (index: number) => {
    const target = Math.max(0, Math.min(ROOT_TABS.length - 1, index));
    indicatorValue.current = target;
    Animated.spring(indicatorPosition, {
      toValue: target,
      damping: 20,
      stiffness: 270,
      mass: 0.68,
      useNativeDriver: true,
    }).start();
    if (target !== activeIndex) onSelect(ROOT_TABS[target]);
  };
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          tabStep > 0 &&
          Math.abs(gesture.dx) >= DRAG_START_DISTANCE &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.15,
        onPanResponderGrant: () => {
          dragging.current = true;
          indicatorPosition.stopAnimation((value) => {
            indicatorValue.current = value;
            dragStartPosition.current = value;
          });
          Animated.spring(lensResponse, {
            toValue: 0,
            damping: 18,
            stiffness: 280,
            mass: 0.55,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderMove: (_, gesture) => {
          if (tabStep <= 0) return;
          const next = Math.max(
            0,
            Math.min(
              ROOT_TABS.length - 1,
              dragStartPosition.current + gesture.dx / tabStep
            )
          );
          indicatorValue.current = next;
          indicatorPosition.setValue(next);
          tabLifts.forEach((value, index) =>
            value.setValue(Math.max(0, 1 - Math.abs(next - index)))
          );
        },
        onPanResponderRelease: (_, gesture) => {
          dragging.current = false;
          const projected = indicatorValue.current + gesture.vx * 0.16;
          const target = Math.round(projected);
          Animated.spring(lensResponse, {
            toValue: 1,
            damping: 18,
            stiffness: 280,
            mass: 0.58,
            useNativeDriver: true,
          }).start();
          settleTabContent(target);
          settleIndicator(target);
        },
        onPanResponderTerminate: () => {
          dragging.current = false;
          Animated.spring(lensResponse, {
            toValue: 1,
            damping: 18,
            stiffness: 280,
            mass: 0.58,
            useNativeDriver: true,
          }).start();
          settleTabContent(activeIndex);
          settleIndicator(activeIndex);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [activeIndex, indicatorPosition, lensResponse, onSelect, tabLifts, tabStep]
  );

  return (
    <View
      pointerEvents="box-none"
      style={[styles.layer, { height: Math.max(insets.bottom, space(2)) + 132 }]}
    >
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
                  outputRange: [0, 7],
                }),
              },
              {
                scaleX: compactProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0.86],
                }),
              },
              {
                scaleY: compactProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0.86],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.barFrame} {...panResponder.panHandlers}>
          <GlassSurface
            style={styles.glass}
            contentStyle={styles.tabs}
            intensity={18}
            clear
          >
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
              />
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
              </Animated.View>
            </Pressable>
          );
          })}
          </GlassSurface>
        </View>
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
    left: space(5),
    right: space(5),
    zIndex: 80,
  },
  barFrame: {
    width: "100%",
  },
  glass: {
    height: BAR_HEIGHT,
    borderRadius: radius.pill,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "transparent",
  },
  tabs: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: BAR_PADDING,
    gap: TAB_GAP,
  },
  activeLensFrame: {
    position: "absolute",
    top: BAR_PADDING,
    height: TAB_HEIGHT,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(43,33,29,0.065)",
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
  },
  tabPressed: {
    opacity: 0.68,
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
