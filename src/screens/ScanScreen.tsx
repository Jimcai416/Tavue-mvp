import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { ScanError, scanMenu } from "../lib/api";
import { prepareMenuImage } from "../lib/imagePreprocessing";
import { track } from "../lib/analytics";
import { captureOperationalError } from "../lib/monitoring";
import { ensureAiProcessingConsent } from "../lib/privacy";
import { describeWhen, getHistory, SavedScan, saveScan } from "../lib/history";
import {
  getLanguage,
  getLanguageLabel,
  initLanguage,
  LANGUAGES,
  setLanguage,
  useT,
} from "../lib/i18n";
import {
  CURRENCIES,
  CurrencyCode,
  getCurrency,
  initCurrency,
  setCurrency,
} from "../lib/currency";
import FeedbackSheet from "../components/FeedbackSheet";
import FoodProfileSheet from "../components/FoodProfileSheet";
import { TAB_BAR_CONTENT_INSET } from "../components/BottomTabBar";
import GlassSurface, { EdgeGlass } from "../components/GlassSurface";
import { ScanResult } from "../types";
import { colors, fonts, radius, shadow, space } from "../theme";

const STAMP_CODES: Record<string, string> = {
  Italian: "IT",
  French: "FR",
  Japanese: "JP",
  Korean: "KR",
  Spanish: "ES",
  Thai: "TH",
  Chinese: "CN",
  Cantonese: "HK",
  Greek: "GR",
  Turkish: "TR",
  Vietnamese: "VN",
  Indian: "IN",
  Mexican: "MX",
  Portuguese: "PT",
  German: "DE",
};

const DEFAULT_RECENT_COUNT = 6;
const HOME_HEADER_HEIGHT = 62;

function stampFor(cuisine: string): string {
  const hit = Object.keys(STAMP_CODES).find((key) =>
    (cuisine || "").toLowerCase().includes(key.toLowerCase())
  );
  return hit ? STAMP_CODES[hit] : (cuisine || "MN").slice(0, 2).toUpperCase();
}

function Barcode() {
  const widths = [2, 4, 2, 6, 2, 3, 5, 2, 4, 2, 6, 3];
  return (
    <View style={styles.barcode}>
      {widths.map((width, index) => (
        <View key={index} style={{ width, height: 22, backgroundColor: colors.accent }} />
      ))}
    </View>
  );
}

function LoadingStep({
  label,
  index,
  activeIndex,
}: {
  label: string;
  index: number;
  activeIndex: number;
}) {
  const complete = index < activeIndex;
  const active = index === activeIndex;

  return (
    <View style={styles.loadingStep}>
      <View
        style={[
          styles.loadingDot,
          (complete || active) && styles.loadingDotActive,
        ]}
      >
        <Text style={[styles.loadingDotText, (complete || active) && styles.loadingDotTextActive]}>
          {complete ? "✓" : index + 1}
        </Text>
      </View>
      <Text style={[styles.loadingStepText, active && styles.loadingStepTextActive]}>
        {label}
      </Text>
    </View>
  );
}

export default function ScanScreen({
  onResult,
  onBusyChange,
}: {
  onResult: (result: ScanResult) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const usesTallHeroGlyphs = [
    "Chinese (Simplified)",
    "Chinese (Traditional)",
    "Japanese",
    "Korean",
  ].includes(getLanguage());
  const [busy, setBusy] = useState(false);
  const [loadingLine, setLoadingLine] = useState(0);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [targetCurrency, setTargetCurrency] = useState<CurrencyCode>(getCurrency());
  const [history, setHistory] = useState<SavedScan[]>([]);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showFoodProfile, setShowFoodProfile] = useState(false);
  const ticketAnim = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;
  const requestRef = useRef<AbortController | null>(null);
  const topGlassOpacity = scrollY.interpolate({
    inputRange: [0, 18, 72],
    outputRange: [0, 0.72, 1],
    extrapolate: "clamp",
  });
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.setValue(event.nativeEvent.contentOffset.y);
    },
    [scrollY]
  );

  useEffect(() => {
    initLanguage();
    initCurrency().then(setTargetCurrency);
    getHistory().then(setHistory);
    Animated.timing(ticketAnim, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    return () => requestRef.current?.abort();
  }, [ticketAnim]);

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  async function pick(fromCamera: boolean) {
    const consented = await ensureAiProcessingConsent({
      title: t("privacyTitle"),
      body: t("privacyBody"),
      cancel: t("privacyCancel"),
      viewPolicy: t("privacyViewPolicy"),
      continue: t("privacyContinue"),
    });
    if (!consented) return;

    const permission =
      Platform.OS === "web"
        ? { granted: true }
        : fromCamera
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(t("permTitle"), fromCamera ? t("permCamera") : t("permPhotos"));
      return;
    }

    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
      allowsEditing: false,
      allowsMultipleSelection: !fromCamera,
      selectionLimit: fromCamera ? 1 : 8,
    };
    const picked = fromCamera
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);

    const assets = picked.canceled ? [] : (picked.assets ?? []);
    if (!assets.length) return;

    const source = fromCamera ? "camera" : "library";
    const startedAt = Date.now();
    void track("scan_started", { source });

    const controller = new AbortController();
    requestRef.current = controller;
    setPreviewUri(assets[0].uri);
    setLoadingLine(0);
    setBusy(true);

    const ticker = setInterval(() => {
      setLoadingLine((current) => Math.min(current + 1, 2));
    }, 2400);

    try {
      const pages: ScanResult[] = [];
      for (const asset of assets) {
        setPreviewUri(asset.uri);
        const prepared = await prepareMenuImage(asset);
        setPreviewUri(prepared.previewUri);
        pages.push(await scanMenu(
          prepared.base64,
          prepared.mediaType,
          getLanguage(),
          targetCurrency,
          controller.signal,
          prepared.retryBase64
        ));
      }
      const first = pages[0];
      const result: ScanResult = {
        ...first,
        dishes: pages.flatMap((page) => page.dishes),
        page_count: pages.length,
      };

      saveScan(result, getLanguage());
      void track("scan_completed", {
        source,
        durationMs: Date.now() - startedAt,
        dishCount: result.dishes.length,
      });
      onResult(result);
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        const errorCode =
          error instanceof ScanError ? error.code : "unexpected_scan_error";
        const durationMs = Date.now() - startedAt;
        void track("scan_failed", { source, durationMs, errorCode });
        captureOperationalError({
          operation: "scan",
          source,
          durationMs,
          errorCode,
        });
        Alert.alert(t("scanErrTitle"), error?.message ?? t("scanErrBody"));
      }
    } finally {
      clearInterval(ticker);
      requestRef.current = null;
      setPreviewUri(null);
      setBusy(false);
    }
  }

  function cancelScan() {
    requestRef.current?.abort();
  }

  if (busy) {
    const steps = [t("loading1"), t("loading2"), t("loading3")];
    return (
      <View
        style={[
          styles.loading,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <View style={styles.loadingTop}>
          <Text style={styles.wordmark}>Tavue</Text>
          <Pressable onPress={cancelScan} hitSlop={12}>
            <Text style={styles.cancelScan}>{t("cancelScan")}</Text>
          </Pressable>
        </View>

        <View style={styles.previewCard}>
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="cover" />
          ) : null}
          <View style={styles.previewShade} />
          <View style={styles.scanLine} />
          <View style={styles.previewBadge}>
            <ActivityIndicator size="small" color={colors.onAccent} />
            <Text style={styles.previewBadgeText}>{t("readingMenu")}</Text>
          </View>
        </View>

        <View style={styles.loadingPanel}>
          <Text style={styles.loadingTitle}>{t("makingMenuClear")}</Text>
          <Text style={styles.loadingSub}>{t("loadingSub")}</Text>
          <View style={styles.loadingSteps}>
            {steps.map((label, index) => (
              <LoadingStep
                key={label}
                label={label}
                index={index}
                activeIndex={loadingLine}
              />
            ))}
          </View>
        </View>
      </View>
    );
  }

  const visibleHistory = showAllHistory
    ? history
    : history.slice(0, DEFAULT_RECENT_COUNT);

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + HOME_HEADER_HEIGHT + space(4),
            paddingBottom: insets.bottom + TAB_BAR_CONTENT_INSET,
          },
        ]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        scrollIndicatorInsets={{
          top: insets.top + HOME_HEADER_HEIGHT,
          bottom: insets.bottom + TAB_BAR_CONTENT_INSET,
        }}
      >
        <Animated.View
          style={[
            styles.ticketMotion,
            shadow.glass,
            {
              opacity: ticketAnim,
              transform: [
                {
                  translateY: ticketAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [18, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <GlassSurface
            style={styles.ticket}
            intensity={58}
            nativeGlass={false}
            interactive={false}
          >
            <View style={styles.ticketTop}>
              <View style={styles.ticketLabelRow}>
                <Text style={styles.mono}>MENU PASS</Text>
                <Text style={styles.mono}>
                  {Platform.OS === "web" ? t("instantWeb") : "№ 0042"}
                </Text>
              </View>

              <Text
                style={[styles.heroTitle, usesTallHeroGlyphs && styles.heroTitleTallGlyphs]}
              >
                {t("heroTitle")}
              </Text>
              <Text style={styles.ticketDesc}>{t("ticketDesc")}</Text>

              <View style={styles.routeRow}>
                <View style={styles.routeStop}>
                  <Text style={styles.routeCode}>ANY</Text>
                  <Text style={styles.routeLabel}>{t("anyMenu")}</Text>
                </View>
                <View style={styles.routeLine}>
                  <View style={styles.routeDot} />
                  <View style={styles.routeRule} />
                  <Text style={styles.routeArrow}>›</Text>
                </View>
                <View style={[styles.routeStop, styles.routeStopEnd]}>
                  <Text style={[styles.routeCode, styles.routeCodeAccent]}>YOU</Text>
                  <Text style={styles.routeLabel}>{getLanguageLabel()}</Text>
                </View>
              </View>
            </View>

            <View style={styles.perforation}>
              <View style={[styles.notch, { left: -11 }]} />
              <View style={[styles.notch, { right: -11 }]} />
              <View style={styles.stubRow}>
                <Barcode />
                <Text style={styles.mono}>LDN · {t("everywhere")}</Text>
              </View>
            </View>
          </GlassSurface>
        </Animated.View>

        <View style={styles.scanActions}>
          <Pressable style={styles.primaryBtn} onPress={() => pick(true)}>
            <View style={styles.buttonIcon}>
              <Text style={styles.buttonIconText}>⌁</Text>
            </View>
            <View style={styles.buttonCopy}>
              <Text style={styles.primaryBtnText}>{t("scanMenu")}</Text>
              <Text style={styles.primaryBtnSub}>
                {Platform.OS === "web" ? t("webScanMenuSub") : t("scanMenuSub")}
              </Text>
            </View>
            <Text style={styles.buttonArrow}>›</Text>
          </Pressable>

          <GlassSurface style={styles.secondaryGlass} intensity={40}>
            <Pressable style={styles.secondaryBtn} onPress={() => pick(false)}>
              <Text style={styles.secondaryBtnText}>{t("choosePhotos")}</Text>
              <Text style={styles.secondaryArrow}>＋</Text>
            </Pressable>
          </GlassSurface>
          <Text style={styles.footnote}>{t("footnote")}</Text>
        </View>

        {history.length > 0 && (
          <View style={styles.recent}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.recentTitle}>{t("recent")}</Text>
              <Text style={styles.recentCount}>{history.length}</Text>
            </View>
            {visibleHistory.map((saved) => (
              <Pressable
                key={saved.id}
                style={styles.recentRow}
                onPress={() => {
                  void track("history_menu_reopened", {
                    source: "history",
                    dishCount: saved.result.dishes.length,
                  });
                  onResult(saved.result);
                }}
              >
                <View style={styles.recentLeft}>
                  <View style={styles.stamp}>
                    <Text style={styles.stampText}>{stampFor(saved.result.cuisine)}</Text>
                  </View>
                  <View style={styles.recentCopy}>
                    <Text style={styles.recentMain} numberOfLines={1}>
                      {saved.result.cuisine || t("menuFallback")}
                    </Text>
                    <Text style={styles.recentWhen}>
                      {saved.result.dishes.length} {t("dishesWord")} ·{" "}
                      {describeWhen(saved.date, getLanguage())}
                    </Text>
                  </View>
                </View>
                <Text style={styles.chev}>›</Text>
              </Pressable>
            ))}
            {history.length > DEFAULT_RECENT_COUNT && (
              <GlassSurface
                style={styles.historyToggleGlass}
                intensity={36}
                interactive
              >
                <Pressable
                  style={({ pressed }) => [
                    styles.historyToggle,
                    pressed && styles.historyTogglePressed,
                  ]}
                  onPress={() => setShowAllHistory((current) => !current)}
                >
                  <Text style={styles.historyToggleText}>
                    {showAllHistory ? t("showFewerMenus") : t("showAllMenus")}
                    {!showAllHistory ? ` (${history.length})` : ""}
                  </Text>
                  <Text
                    style={[
                      styles.historyToggleIcon,
                      showAllHistory && styles.historyToggleIconOpen,
                    ]}
                  >
                    ↓
                  </Text>
                </Pressable>
              </GlassSurface>
            )}
          </View>
        )}

        <Pressable onPress={() => setShowFeedback(true)} hitSlop={8}>
          <Text style={styles.bugLink}>{t("bugLink")}</Text>
        </Pressable>
      </ScrollView>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.topMaterial,
          {
            height: insets.top + HOME_HEADER_HEIGHT,
            opacity: topGlassOpacity,
          },
        ]}
      >
        <EdgeGlass style={StyleSheet.absoluteFill} />
      </Animated.View>

      <View
        style={[
          styles.topBar,
          {
            height: insets.top + HOME_HEADER_HEIGHT,
            paddingTop: insets.top + space(2),
          },
        ]}
      >
        <View>
          <Text style={styles.wordmark}>Tavue</Text>
          <Text style={styles.wordmarkSub}>MENU, MADE CLEAR</Text>
        </View>
        <View style={styles.topControls}>
          {Platform.OS !== "web" && (
            <GlassSurface style={styles.profileGlass} intensity={46}>
              <Pressable
                style={styles.profilePill}
                onPress={() => setShowFoodProfile(true)}
                accessibilityLabel="Food profile"
              >
                <Text style={styles.profileGlyph}>♡</Text>
              </Pressable>
            </GlassSurface>
          )}
          <GlassSurface style={styles.currencyGlass} intensity={46}>
            <Pressable
              style={styles.currencyPill}
              onPress={() => setShowCurrencyPicker(true)}
            >
              <Text style={styles.currencyPillText}>{targetCurrency}</Text>
              <Text style={styles.controlChevron}>⌄</Text>
            </Pressable>
          </GlassSurface>
          <GlassSurface style={styles.langGlass} intensity={46}>
            <Pressable
              style={styles.langPill}
              onPress={() => setShowLangPicker(true)}
            >
              <Text style={styles.langGlobe}>◎</Text>
              <Text style={styles.langPillText}>{getLanguageLabel()}</Text>
              <Text style={styles.controlChevron}>⌄</Text>
            </Pressable>
          </GlassSurface>
        </View>
      </View>

      <FeedbackSheet visible={showFeedback} onClose={() => setShowFeedback(false)} />
      <FoodProfileSheet visible={showFoodProfile} onClose={() => setShowFoodProfile(false)} />

      <Modal
        visible={showLangPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLangPicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowLangPicker(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalEyebrow}>TAVUE</Text>
            <Text style={styles.modalTitle}>{t("langTitle")}</Text>
            <FlatList
              data={LANGUAGES}
              keyExtractor={(language) => language.code}
              renderItem={({ item }) => {
                const active = item.code === getLanguage();
                return (
                  <Pressable
                    style={styles.langRow}
                    onPress={() => {
                      setLanguage(item.code);
                      setShowLangPicker(false);
                    }}
                  >
                    <Text style={[styles.langRowText, active && styles.langRowActive]}>
                      {item.label}
                    </Text>
                    {active && (
                      <View style={styles.langCheck}>
                        <Text style={styles.langCheckText}>✓</Text>
                      </View>
                    )}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showCurrencyPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCurrencyPicker(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowCurrencyPicker(false)}
        >
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalEyebrow}>TAVUE</Text>
            <Text style={styles.modalTitle}>{t("currencyTitle")}</Text>
            <Text style={styles.modalSub}>{t("currencySub")}</Text>
            <FlatList
              data={CURRENCIES}
              keyExtractor={(currency) => currency.code}
              renderItem={({ item }) => {
                const active = item.code === targetCurrency;
                return (
                  <Pressable
                    style={styles.currencyRow}
                    onPress={() => {
                      const next = setCurrency(item.code);
                      setTargetCurrency(next);
                      setShowCurrencyPicker(false);
                    }}
                  >
                    <View style={styles.currencyIdentity}>
                      <View style={[styles.currencySymbol, active && styles.currencySymbolActive]}>
                        <Text
                          style={[
                            styles.currencySymbolText,
                            active && styles.currencySymbolTextActive,
                          ]}
                        >
                          {item.symbol}
                        </Text>
                      </View>
                      <View>
                        <Text
                          style={[
                            styles.currencyCode,
                            active && styles.langRowActive,
                          ]}
                        >
                          {item.code}
                        </Text>
                        <Text style={styles.currencyName}>{item.label}</Text>
                      </View>
                    </View>
                    {active && (
                      <View style={styles.langCheck}>
                        <Text style={styles.langCheckText}>✓</Text>
                      </View>
                    )}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  scrollContent: { paddingBottom: space(8) },
  topMaterial: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 9,
  },
  topBar: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: space(5),
    paddingBottom: space(2),
  },
  topControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(1.5),
    marginLeft: space(2),
  },
  wordmark: {
    fontFamily: fonts.display,
    fontSize: 31,
    lineHeight: 32,
    color: colors.text,
  },
  wordmarkSub: {
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 1.8,
    color: colors.accent,
    marginTop: 2,
  },
  langGlass: {
    maxWidth: 120,
    borderRadius: radius.pill,
  },
  currencyGlass: {
    minWidth: 58,
    borderRadius: radius.pill,
  },
  profileGlass: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  profilePill: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  profileGlyph: {
    fontFamily: fonts.bodySemibold,
    fontSize: 17,
    lineHeight: 18,
    color: colors.accentStrong,
  },
  langPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(1.5),
    paddingLeft: space(2.5),
    paddingRight: space(2),
    paddingVertical: space(2),
  },
  currencyPill: {
    minWidth: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(1),
    paddingHorizontal: space(2.5),
    paddingVertical: space(2),
  },
  currencyPillText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 11,
    color: colors.accentStrong,
  },
  langGlobe: { color: colors.accent, fontSize: 15 },
  langPillText: {
    flexShrink: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.text,
  },
  controlChevron: { color: colors.muted, fontSize: 13 },
  ticketMotion: {
    marginHorizontal: space(5),
    borderRadius: radius.card,
  },
  ticket: {
    borderRadius: radius.card,
    overflow: "hidden",
  },
  ticketTop: { padding: space(5), paddingBottom: space(4.5) },
  ticketLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: space(4),
  },
  mono: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.6,
    color: colors.muted,
  },
  heroTitle: {
    fontFamily: fonts.display,
    fontSize: 39,
    lineHeight: 41,
    color: colors.text,
    maxWidth: 300,
  },
  heroTitleTallGlyphs: {
    fontFamily: fonts.native,
    fontWeight: "600",
    lineHeight: 52,
    paddingTop: 6,
  },
  ticketDesc: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    marginTop: space(2),
    maxWidth: 300,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: space(5),
  },
  routeStop: { minWidth: 62 },
  routeStopEnd: { alignItems: "flex-end", minWidth: 88 },
  routeCode: {
    fontFamily: fonts.bodyBold,
    fontSize: 19,
    lineHeight: 21,
    color: colors.text,
  },
  routeCodeAccent: { color: colors.accent },
  routeLabel: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: colors.muted,
    marginTop: 2,
  },
  routeLine: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: space(2),
  },
  routeDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent },
  routeRule: { flex: 1, height: 1, backgroundColor: colors.lineStrong },
  routeArrow: { color: colors.accent, fontSize: 20, lineHeight: 20, marginLeft: -2 },
  perforation: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    borderStyle: "dashed",
    position: "relative",
  },
  notch: {
    position: "absolute",
    top: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.background,
  },
  stubRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: space(5),
    paddingVertical: space(3),
  },
  barcode: { flexDirection: "row", alignItems: "flex-end", gap: 2 },
  scanActions: { paddingHorizontal: space(5), marginTop: space(4), gap: space(2.5) },
  primaryBtn: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primaryAction,
    borderRadius: radius.button,
    paddingHorizontal: space(3.5),
  },
  buttonIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.13)",
  },
  buttonIconText: { color: colors.onAccent, fontSize: 24, lineHeight: 26 },
  buttonCopy: { flex: 1, paddingHorizontal: space(3) },
  primaryBtnText: {
    color: colors.onAccent,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
  },
  primaryBtnSub: {
    color: colors.onAccentMuted,
    fontFamily: fonts.body,
    fontSize: 11,
    marginTop: 2,
  },
  buttonArrow: { color: colors.onAccent, fontSize: 28, lineHeight: 28 },
  secondaryBtn: {
    minHeight: 50,
    paddingHorizontal: space(4),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  secondaryGlass: {
    borderRadius: radius.button,
  },
  secondaryBtnText: {
    color: colors.text,
    fontFamily: fonts.bodySemibold,
    fontSize: 14,
  },
  secondaryArrow: { color: colors.accent, fontFamily: fonts.bodyMedium, fontSize: 18 },
  footnote: {
    fontFamily: fonts.body,
    fontSize: 10,
    lineHeight: 15,
    color: colors.muted,
    textAlign: "center",
    paddingHorizontal: space(4),
  },
  recent: { paddingHorizontal: space(5), marginTop: space(7) },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space(2.5),
  },
  recentTitle: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.8,
    color: colors.muted,
  },
  recentCount: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    color: colors.accent,
  },
  recentRow: {
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space(3),
    paddingVertical: space(2.5),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: space(2),
    borderRadius: radius.image,
  },
  recentLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2.5),
    flex: 1,
  },
  recentCopy: { flex: 1 },
  stamp: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderColor: "rgba(185, 81, 62, 0.22)",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.62)",
  },
  stampText: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 1.2,
    color: colors.primaryAction,
  },
  recentMain: {
    fontFamily: fonts.bodySemibold,
    fontSize: 14,
    color: colors.text,
  },
  recentWhen: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.muted,
    marginTop: 2,
  },
  chev: { color: colors.mutedSoft, fontSize: 20, marginLeft: space(2) },
  historyToggleGlass: {
    borderRadius: radius.image,
    marginTop: space(0.5),
  },
  historyToggle: {
    minHeight: 44,
    paddingHorizontal: space(3),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(1.5),
  },
  historyTogglePressed: {
    backgroundColor: "rgba(185, 81, 62, 0.06)",
  },
  historyToggleText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    color: colors.primaryAction,
  },
  historyToggleIcon: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 15,
    color: colors.primaryAction,
  },
  historyToggleIconOpen: { transform: [{ rotate: "180deg" }] },
  bugLink: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.muted,
    textAlign: "center",
    textDecorationLine: "underline",
    marginTop: space(5),
  },
  loading: {
    flex: 1,
    backgroundColor: "transparent",
    paddingHorizontal: space(5),
  },
  loadingTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: space(3),
    marginBottom: space(5),
  },
  cancelScan: {
    fontFamily: fonts.bodySemibold,
    fontSize: 13,
    color: colors.muted,
  },
  previewCard: {
    height: 300,
    borderRadius: radius.card,
    overflow: "hidden",
    backgroundColor: colors.line,
    position: "relative",
  },
  previewImage: { width: "100%", height: "100%" },
  previewShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.imageShade,
  },
  scanLine: {
    position: "absolute",
    left: space(4),
    right: space(4),
    top: "48%",
    height: 2,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  previewBadge: {
    position: "absolute",
    left: space(3),
    bottom: space(3),
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: space(3),
    paddingVertical: space(2),
  },
  previewBadgeText: {
    fontFamily: fonts.bodySemibold,
    color: colors.onAccent,
    fontSize: 11,
  },
  loadingPanel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: space(5),
    marginTop: space(4),
  },
  loadingTitle: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 31,
    color: colors.text,
  },
  loadingSub: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.muted,
    marginTop: space(1),
  },
  loadingSteps: { gap: space(3), marginTop: space(5) },
  loadingStep: { flexDirection: "row", alignItems: "center", gap: space(3) },
  loadingDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingDotActive: { borderColor: colors.accent, backgroundColor: colors.accentWash },
  loadingDotText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 10,
    color: colors.muted,
  },
  loadingDotTextActive: { color: colors.accentStrong },
  loadingStepText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
  },
  loadingStepTextActive: { fontFamily: fonts.bodySemibold, color: colors.text },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space(5),
    paddingTop: space(3),
    paddingBottom: space(8),
    maxHeight: "80%",
  },
  modalHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    alignSelf: "center",
    marginBottom: space(4),
  },
  modalEyebrow: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.8,
    color: colors.accent,
  },
  modalTitle: {
    fontFamily: fonts.display,
    fontSize: 29,
    color: colors.text,
    marginBottom: space(2),
  },
  modalSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
    marginTop: -space(1),
    marginBottom: space(2),
  },
  langRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space(3),
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  langRowText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
  },
  langRowActive: { fontFamily: fonts.bodySemibold, color: colors.accentStrong },
  langCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  langCheckText: {
    color: colors.onAccent,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
  },
  currencyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space(2.5),
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  currencyIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
  },
  currencySymbol: {
    width: 40,
    height: 34,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  currencySymbolActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentWash,
  },
  currencySymbolText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    color: colors.muted,
  },
  currencySymbolTextActive: { color: colors.accentStrong },
  currencyCode: {
    fontFamily: fonts.bodySemibold,
    fontSize: 14,
    color: colors.text,
  },
  currencyName: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.muted,
    marginTop: 1,
  },
});
