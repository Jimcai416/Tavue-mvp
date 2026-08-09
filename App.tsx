import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { CormorantGaramond_500Medium } from "@expo-google-fonts/cormorant-garamond/500Medium";
import { CormorantGaramond_600SemiBold } from "@expo-google-fonts/cormorant-garamond/600SemiBold";
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_500Medium } from "@expo-google-fonts/dm-sans/500Medium";
import { DMSans_600SemiBold } from "@expo-google-fonts/dm-sans/600SemiBold";
import { DMSans_700Bold } from "@expo-google-fonts/dm-sans/700Bold";
import ScanScreen from "./src/screens/ScanScreen";
import ResultsScreen from "./src/screens/ResultsScreen";
import OrderHistoryScreen from "./src/screens/OrderHistoryScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import { Screen, ScanResult } from "./src/types";
import { colors } from "./src/theme";
import { AmbientBackdrop } from "./src/components/GlassSurface";
import BottomTabBar, { type RootTab } from "./src/components/BottomTabBar";
import { track } from "./src/lib/analytics";
import { captureOperationalError, withMonitoring } from "./src/lib/monitoring";

const WEB_FONT_TIMEOUT_MS = 5_000;

function App() {
  const [screen, setScreen] = useState<Screen>({ name: "scan" });
  const [historyDetailOpen, setHistoryDetailOpen] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const latestResult = useRef<ScanResult | null>(null);
  const [webFontFallbackReady, setWebFontFallbackReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    CormorantGaramond_500Medium,
    CormorantGaramond_600SemiBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });

  useEffect(() => {
    void track("app_opened");
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" || screen.name === "scan") return;

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        setScreen({ name: "scan" });
        return true;
      },
    );

    return () => subscription.remove();
  }, [screen.name]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    const currentState = window.history.state as { tavueScreen?: Screen["name"] } | null;
    if (!currentState?.tavueScreen) {
      window.history.replaceState(
        { ...(currentState ?? {}), tavueScreen: "scan" },
        "",
        window.location.href,
      );
    }

    const handlePopState = (event: PopStateEvent) => {
      const destination = (event.state as { tavueScreen?: Screen["name"] } | null)
        ?.tavueScreen;
      if (destination === "results" && latestResult.current) {
        setScreen({ name: "results", result: latestResult.current });
      } else if (destination === "orderHistory") {
        setScreen({ name: "orderHistory" });
      } else if (destination === "profile") {
        setScreen({ name: "profile" });
      } else {
        setScreen({ name: "scan" });
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const showResults = (result: ScanResult) => {
    latestResult.current = result;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.history.pushState({ tavueScreen: "results" }, "", window.location.href);
    }
    setScreen({ name: "results", result });
  };

  const showScan = () => {
    if (
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      (window.history.state as { tavueScreen?: string } | null)?.tavueScreen !== "scan"
    ) {
      window.history.back();
      return;
    }
    setScreen({ name: "scan" });
  };

  const showRootTab = (tab: RootTab) => {
    if (screen.name === tab) return;
    setHistoryDetailOpen(false);
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.history.pushState({ tavueScreen: tab }, "", window.location.href);
    }
    if (tab === "scan") setScreen({ name: "scan" });
    if (tab === "orderHistory") setScreen({ name: "orderHistory" });
    if (tab === "profile") setScreen({ name: "profile" });
  };

  useEffect(() => {
    if (fontError) {
      captureOperationalError({ operation: "startup", errorCode: "font_load_failed" });
    }
  }, [fontError]);

  useEffect(() => {
    if (Platform.OS !== "web" || fontsLoaded || fontError) return;

    // A missing web font must never block the whole product. This is especially
    // important for subpath hosts where a bad asset base URL can otherwise leave
    // Android browsers on the launch spinner forever.
    const timeout = setTimeout(() => {
      setWebFontFallbackReady(true);
      captureOperationalError({ operation: "startup", errorCode: "font_load_timeout" });
    }, WEB_FONT_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [fontError, fontsLoaded]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;

    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (viewport && !viewport.content.includes("viewport-fit=cover")) {
      viewport.content = `${viewport.content}, viewport-fit=cover`;
    }

    document.documentElement.style.backgroundColor = colors.background;
    document.body.style.backgroundColor = colors.background;
    document.documentElement.style.overscrollBehaviorY = "none";
    document.body.style.overscrollBehaviorY = "none";
  }, []);

  if (!fontsLoaded && !fontError && !webFontFallbackReady) {
    return (
      <View style={styles.fontLoading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={[styles.canvas, Platform.OS === "web" && styles.webCanvas]}>
        <View
          nativeID={Platform.OS === "web" ? "tavue-app-shell" : undefined}
          style={[styles.root, Platform.OS === "web" && styles.webRoot]}
        >
          <StatusBar
            barStyle="dark-content"
            backgroundColor="transparent"
            translucent
          />
          <AmbientBackdrop />

          {screen.name === "scan" && (
            <ScanScreen
              onResult={showResults}
              onBusyChange={setScanBusy}
            />
          )}

          {screen.name === "results" && (
            <ResultsScreen
              result={screen.result}
              onBack={showScan}
            />
          )}

          {screen.name === "orderHistory" && (
            <OrderHistoryScreen
              onBack={showScan}
              onDetailChange={setHistoryDetailOpen}
            />
          )}

          {screen.name === "profile" && <ProfileScreen />}

          {(screen.name === "scan" ||
            screen.name === "orderHistory" ||
            screen.name === "profile") &&
            !historyDetailOpen &&
            !scanBusy && (
              <BottomTabBar activeTab={screen.name} onSelect={showRootTab} />
            )}
        </View>
      </View>
    </SafeAreaProvider>
  );
}

export default withMonitoring(App);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
    backgroundColor: colors.background,
  },
  canvas: {
    flex: 1,
    backgroundColor: colors.background,
  },
  webCanvas: {
    width: "100%",
    backgroundColor: "#EDE6DF",
    alignItems: "center",
  },
  webRoot: {
    maxWidth: 640,
    shadowColor: "#50352F",
    shadowOpacity: 0.12,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 0 },
  },
  fontLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
