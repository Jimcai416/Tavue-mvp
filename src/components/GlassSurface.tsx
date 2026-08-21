import React, { PropsWithChildren } from "react";
import {
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { BlurView } from "expo-blur";
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { colors } from "../theme";

type GlassSurfaceProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  intensity?: number;
  strong?: boolean;
  nativeGlass?: boolean;
  interactive?: boolean;
  clear?: boolean;
}>;

type EdgeGlassProps = {
  style?: StyleProp<ViewStyle>;
  intensity?: number;
};

export default function GlassSurface({
  children,
  style,
  contentStyle,
  intensity = 48,
  strong = false,
  nativeGlass = true,
  interactive = true,
  clear = false,
}: GlassSurfaceProps) {
  const useNativeGlass =
    nativeGlass &&
    Platform.OS === "ios" &&
    isGlassEffectAPIAvailable() &&
    isLiquidGlassAvailable();

  if (useNativeGlass) {
    return (
      <GlassView
        colorScheme="light"
        glassEffectStyle={strong ? "regular" : "clear"}
        isInteractive={interactive}
        tintColor={
          clear
            ? "rgba(255,255,255,0.035)"
            : strong
              ? "rgba(255,255,255,0.28)"
              : "rgba(255,255,255,0.14)"
        }
        style={[styles.frame, style]}
      >
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            clear ? styles.nativeTintClear : styles.nativeTint,
            strong && styles.nativeTintStrong,
          ]}
        />
        <View style={contentStyle}>{children}</View>
      </GlassView>
    );
  }

  return (
    <View style={[styles.frame, style]}>
      <BlurView
        tint={clear ? "default" : "light"}
        intensity={intensity}
        experimentalBlurMethod={
          Platform.OS === "android" ? "dimezisBlurView" : "none"
        }
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          clear ? styles.tintClear : styles.tint,
          strong && styles.tintStrong,
        ]}
      />
      <View style={contentStyle}>{children}</View>
    </View>
  );
}

/**
 * A borderless material for screen edges. It deliberately uses BlurView on
 * every platform so its opacity can animate as content moves underneath it.
 * Interactive controls layered above still use the native Liquid Glass path.
 */
export function EdgeGlass({ style, intensity = 52 }: EdgeGlassProps) {
  return (
    <View pointerEvents="none" style={[styles.edgeFrame, style]}>
      <BlurView
        tint="light"
        intensity={intensity}
        experimentalBlurMethod={
          Platform.OS === "android" ? "dimezisBlurView" : "none"
        }
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, styles.edgeTint]} />
    </View>
  );
}

export function AmbientBackdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.orb, styles.coralOrb]} />
      <View style={[styles.orb, styles.citrusOrb]} />
      <View style={[styles.orb, styles.roseOrb]} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.glassLine,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  tint: { backgroundColor: colors.glass },
  tintClear: { backgroundColor: "rgba(255,255,255,0.055)" },
  tintStrong: { backgroundColor: colors.glassStrong },
  nativeTint: { backgroundColor: "rgba(255,255,255,0.08)" },
  nativeTintClear: { backgroundColor: "rgba(255,255,255,0.025)" },
  nativeTintStrong: { backgroundColor: "rgba(255,255,255,0.16)" },
  edgeFrame: {
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  edgeTint: { backgroundColor: colors.glassEdge },
  orb: {
    position: "absolute",
    borderRadius: 999,
  },
  coralOrb: {
    width: 260,
    height: 260,
    top: -128,
    right: -102,
    backgroundColor: colors.ambientCoral,
  },
  citrusOrb: {
    width: 224,
    height: 224,
    top: 280,
    left: -150,
    backgroundColor: colors.ambientCitrus,
  },
  roseOrb: {
    width: 280,
    height: 280,
    bottom: -170,
    right: -142,
    backgroundColor: colors.ambientRose,
  },
});
