import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Brightness from "expo-brightness";
import { useKeepAwake } from "expo-keep-awake";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Dish } from "../types";
import { useT } from "../lib/i18n";
import {
  convertedPriceForDish,
  formatMoney,
  parseMoney,
} from "../lib/currency";
import { colors, fonts, radius, space } from "../theme";

export interface OrderLine {
  dish: Dish;
  qty: number;
}

export function orderTotals(lines: OrderLine[]): { converted: number } {
  return {
    converted: lines.reduce(
      (sum, line) => sum + parseMoney(convertedPriceForDish(line.dish)) * line.qty,
      0
    ),
  };
}

function lineKey(line: OrderLine): string {
  return [line.dish.category, line.dish.original_name, line.dish.price]
    .filter(Boolean)
    .join("::");
}

function serverPromptFor(menuLanguage: string): string {
  const language = (menuLanguage || "").toLowerCase();
  if (language.includes("traditional chinese") || language.includes("cantonese")) {
    return "我們想點以下菜式，請幫我們確認。";
  }
  if (language.includes("chinese") || language.includes("mandarin")) {
    return "我们想点以下菜品，请帮我们确认。";
  }
  if (language.includes("japanese")) {
    return "以下の料理を注文したいです。ご確認ください。";
  }
  if (language.includes("korean")) {
    return "아래 메뉴로 주문하겠습니다. 확인 부탁드립니다.";
  }
  if (language.includes("french")) {
    return "Nous souhaiterions commander les plats suivants, s’il vous plaît.";
  }
  if (language.includes("italian")) {
    return "Vorremmo ordinare i seguenti piatti, per favore.";
  }
  if (language.includes("spanish")) {
    return "Nos gustaría pedir los siguientes platos, por favor.";
  }
  if (language.includes("thai")) {
    return "ต้องการสั่งรายการต่อไปนี้ กรุณาช่วยยืนยันด้วยค่ะ/ครับ";
  }
  return "We’d like to order the following, please.";
}

function usesLatinPromptFont(menuLanguage: string): boolean {
  const language = (menuLanguage || "").toLowerCase();
  return ![
    "chinese",
    "mandarin",
    "cantonese",
    "japanese",
    "korean",
    "thai",
  ].some((script) => language.includes(script));
}

function ServerOrderView({
  lines,
  menuLanguage,
  onBack,
  onClose,
}: {
  lines: OrderLine[];
  menuLanguage: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const originalBrightness = useRef<number | null>(null);
  const [bright, setBright] = useState(false);
  const itemCount = lines.reduce((sum, line) => sum + line.qty, 0);

  useKeepAwake("tavue-server-order");

  useEffect(() => {
    return () => {
      if (Platform.OS !== "web" && originalBrightness.current !== null) {
        void Brightness.setBrightnessAsync(originalBrightness.current).catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;

    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousThemeColor = themeColor?.content;
    const previousHtmlBackground = document.documentElement.style.backgroundColor;
    const previousBodyBackground = document.body.style.backgroundColor;
    const nextBackground = bright ? colors.surfaceRaised : colors.background;

    themeColor?.setAttribute("content", nextBackground);
    document.documentElement.style.backgroundColor = nextBackground;
    document.body.style.backgroundColor = nextBackground;

    return () => {
      if (themeColor && previousThemeColor) themeColor.content = previousThemeColor;
      document.documentElement.style.backgroundColor = previousHtmlBackground;
      document.body.style.backgroundColor = previousBodyBackground;
    };
  }, [bright]);

  async function toggleBrightness() {
    if (Platform.OS === "web") {
      // Browsers cannot change device brightness. Use a visibly brighter,
      // high-contrast presentation instead so the control remains useful.
      setBright((current) => !current);
      return;
    }

    try {
      if (!bright) {
        originalBrightness.current = await Brightness.getBrightnessAsync();
        await Brightness.setBrightnessAsync(1);
        setBright(true);
        return;
      }

      if (originalBrightness.current !== null) {
        await Brightness.setBrightnessAsync(originalBrightness.current);
      }
      originalBrightness.current = null;
      setBright(false);
    } catch {
      // Brightness is a convenience; the order must remain usable without it.
    }
  }

  return (
    <View
      style={[
        styles.serverScreen,
        bright && styles.serverScreenBright,
        { paddingTop: insets.top + space(2), paddingBottom: insets.bottom + space(3) },
      ]}
    >
      <View style={styles.serverHeader}>
        <Pressable
          style={styles.serverHeaderButton}
          onPress={onBack}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("orderTitle")}
        >
          <Text style={styles.serverBack}>‹</Text>
        </Pressable>
        <View style={styles.serverHeaderCopy}>
          <Text style={styles.serverEyebrow}>TAVUE · ORDER</Text>
          <Text style={styles.serverTitle}>{t("orderTitle")}</Text>
        </View>
        <Pressable
          style={[styles.serverHeaderButton, bright && styles.serverHeaderButtonActive]}
          onPress={toggleBrightness}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={
            Platform.OS === "web"
              ? "Toggle high-contrast display"
              : "Increase screen brightness"
          }
          accessibilityState={{ selected: bright }}
        >
          <Text style={[styles.sun, bright && styles.sunActive]}>☼</Text>
        </Pressable>
      </View>

      <FlatList
        data={lines}
        keyExtractor={lineKey}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.serverList}
        ListHeaderComponent={
          <View style={styles.serverIntro}>
            <Text
              style={[
                styles.serverPrompt,
                usesLatinPromptFont(menuLanguage) && styles.serverPromptLatin,
              ]}
            >
              {serverPromptFor(menuLanguage)}
            </Text>
            <View style={styles.serverMetaRow}>
              <Text style={styles.serverMeta}>{itemCount} {t("items")}</Text>
              <Text style={styles.serverMeta}>{menuLanguage || "MENU"}</Text>
            </View>
          </View>
        }
        renderItem={({ item, index }) => {
          const originalCategory =
            item.dish.original_category?.trim() || item.dish.category?.trim();

          return (
            <View style={[styles.serverLine, bright && styles.serverLineBright]}>
              <View style={styles.serverLineTop}>
                <View style={styles.serverQtyBox}>
                  <Text style={styles.serverQty}>{item.qty}</Text>
                  <Text style={styles.serverTimes}>×</Text>
                </View>
                <View style={styles.serverDishCopy}>
                  <Text style={styles.serverOriginal}>{item.dish.original_name}</Text>
                  {item.dish.romanized ? (
                    <Text style={styles.serverRomanized}>{item.dish.romanized}</Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.serverDetails}>
                <Text style={styles.serverTranslated}>{item.dish.translated_name}</Text>
                <View style={styles.serverLineMeta}>
                  {originalCategory ? (
                    <Text style={styles.serverCategory}>{originalCategory}</Text>
                  ) : (
                    <View />
                  )}
                  {item.dish.price ? (
                    <Text style={styles.serverPrice}>{item.dish.price}</Text>
                  ) : null}
                </View>
              </View>

              <Text style={styles.serverLineNumber}>
                {String(index + 1).padStart(2, "0")}
              </Text>
            </View>
          );
        }}
      />

      <Pressable
        style={[styles.backToCart, bright && styles.backToCartBright]}
        onPress={onBack}
        accessibilityRole="button"
      >
        <Text style={styles.backToCartText}>‹ {t("orderTitle")}</Text>
      </Pressable>
      <View style={styles.foodMemoryNote}>
        <Text style={styles.foodMemoryNoteMark}>✓</Text>
        <Text style={styles.foodMemoryNoteText}>{t("orderSavedHint")}</Text>
      </View>
      <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
        <Text style={styles.serverClose}>{t("done")}</Text>
      </Pressable>
    </View>
  );
}

export default function OrderCart({
  visible,
  lines,
  displayCurrency,
  menuLanguage,
  showConverted = true,
  onAdd,
  onRemove,
  onClear,
  onClose,
  onShowServer,
}: {
  visible: boolean;
  lines: OrderLine[];
  displayCurrency: string;
  menuLanguage: string;
  showConverted?: boolean;
  onAdd: (dish: Dish) => void;
  onRemove: (dish: Dish) => void;
  onClear: () => void;
  onClose: () => void;
  onShowServer?: () => void;
}) {
  const t = useT();
  const totals = orderTotals(lines);
  const [serverMode, setServerMode] = useState(false);

  useEffect(() => {
    if (!visible || lines.length === 0) setServerMode(false);
  }, [lines.length, visible]);

  function openServerMode() {
    onShowServer?.();
    setServerMode(true);
  }

  return (
    <Modal
      key={serverMode ? "server-order" : "order-cart"}
      visible={visible}
      transparent={!serverMode}
      animationType={serverMode ? "fade" : "slide"}
      onRequestClose={serverMode ? () => setServerMode(false) : onClose}
    >
      {serverMode ? (
        <ServerOrderView
          lines={lines}
          menuLanguage={menuLanguage}
          onBack={() => setServerMode(false)}
          onClose={onClose}
        />
      ) : (
        <Pressable
          nativeID={Platform.OS === "web" ? "tavue-order-backdrop" : undefined}
          style={[styles.backdrop, Platform.OS === "web" && styles.webBackdrop]}
          onPress={onClose}
        >
          <Pressable
            nativeID={Platform.OS === "web" ? "tavue-order-sheet" : undefined}
            style={[styles.sheet, Platform.OS === "web" && styles.webSheet]}
            onPress={() => {}}
          >
            <View style={styles.handle} />
            <View style={styles.titleRow}>
              <Text style={styles.title}>{t("orderTitle")}</Text>
              <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
                <Text style={styles.close}>✕</Text>
              </Pressable>
            </View>

            <FlatList
              data={lines}
              keyExtractor={lineKey}
              style={{ flexGrow: 0 }}
              renderItem={({ item }) => (
                <View style={styles.line}>
                  <View style={styles.lineCopy}>
                    <Text style={styles.lineName} numberOfLines={1}>
                      {item.dish.original_name}
                    </Text>
                    <Text style={styles.lineSub} numberOfLines={1}>
                      {item.dish.translated_name}
                      {item.dish.price ? `  ·  ${item.dish.price}` : ""}
                      {showConverted && convertedPriceForDish(item.dish)
                        ? `  ·  ${convertedPriceForDish(item.dish)}`
                        : ""}
                    </Text>
                  </View>
                  <View style={styles.stepper}>
                    <Pressable
                      onPress={() => onRemove(item.dish)}
                      hitSlop={8}
                      style={styles.stepBtn}
                      accessibilityRole="button"
                    >
                      <Text style={styles.stepText}>−</Text>
                    </Pressable>
                    <Text style={styles.qty}>{item.qty}</Text>
                    <Pressable
                      onPress={() => onAdd(item.dish)}
                      hitSlop={8}
                      style={styles.stepBtn}
                      accessibilityRole="button"
                    >
                      <Text style={styles.stepText}>+</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            />

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t("totalWord")}</Text>
              <Text style={styles.totalValue}>
                {totals.converted > 0
                  ? formatMoney(totals.converted, displayCurrency)
                  : "—"}
              </Text>
            </View>

            <View style={styles.cartActions}>
              <Pressable style={styles.clearBtn} onPress={onClear} accessibilityRole="button">
                <Text style={styles.clearText}>{t("orderClear")}</Text>
              </Pressable>
              <Pressable
                style={styles.showServerBtn}
                onPress={openServerMode}
                accessibilityRole="button"
              >
                <Text style={styles.showServerText}>{t("showServer")}</Text>
                <Text style={styles.showServerArrow}>›</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  webBackdrop: {
    width: "100%",
    maxWidth: "100%",
    alignItems: "center",
    overflow: "hidden",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.card + 6,
    borderTopRightRadius: radius.card + 6,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space(5),
    paddingBottom: space(8),
    maxHeight: "78%",
  },
  webSheet: {
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: space(3),
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: space(3),
  },
  title: { fontFamily: fonts.display, fontSize: 27, color: colors.text },
  close: { fontSize: 20, color: colors.muted },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    paddingVertical: space(2.5),
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  lineCopy: { flex: 1, minWidth: 0 },
  lineName: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.text },
  lineSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 1,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: space(2.5),
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    lineHeight: 20,
  },
  qty: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.text,
    minWidth: 18,
    textAlign: "center",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: space(4),
  },
  totalLabel: { fontFamily: fonts.body, fontSize: 15, color: colors.muted },
  totalValue: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.accent },
  cartActions: {
    flexDirection: "row",
    gap: space(2.5),
    marginTop: space(4),
  },
  clearBtn: {
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: radius.pill,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    alignItems: "center",
    justifyContent: "center",
  },
  clearText: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  showServerBtn: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(2),
    borderRadius: radius.pill,
    backgroundColor: colors.primaryAction,
    paddingHorizontal: space(4),
  },
  showServerText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.onAccent,
  },
  showServerArrow: { fontSize: 22, lineHeight: 24, color: colors.onAccent },

  serverScreen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: space(5),
  },
  serverScreenBright: {
    backgroundColor: "#FFFFFF",
  },
  serverHeader: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 62,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  serverHeaderButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  serverHeaderButtonActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentStrong,
  },
  serverBack: { color: colors.text, fontSize: 30, lineHeight: 31, marginTop: -2 },
  sun: {
    color: colors.accentStrong,
    fontFamily: fonts.display,
    fontSize: 23,
    lineHeight: 25,
  },
  sunActive: { color: colors.onAccent },
  serverHeaderCopy: { flex: 1, alignItems: "center" },
  serverEyebrow: {
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 1.5,
    color: colors.accentStrong,
  },
  serverTitle: {
    fontFamily: fonts.display,
    fontSize: 23,
    lineHeight: 25,
    color: colors.text,
  },
  serverList: { paddingTop: space(4), paddingBottom: space(3) },
  serverIntro: {
    paddingHorizontal: space(1),
    paddingTop: space(1),
    paddingBottom: space(5),
  },
  serverPrompt: {
    fontFamily: fonts.native,
    fontSize: 25,
    lineHeight: 34,
    fontWeight: "600",
    color: colors.text,
  },
  serverPromptLatin: {
    fontFamily: fonts.display,
    fontSize: 31,
    lineHeight: 35,
    fontWeight: "normal",
  },
  serverMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: space(2),
  },
  serverMeta: {
    maxWidth: "70%",
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 1.1,
    color: colors.muted,
    textTransform: "uppercase",
  },
  serverLine: {
    position: "relative",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceRaised,
    padding: space(4),
    marginBottom: space(3),
    shadowColor: "#50352F",
    shadowOpacity: 0.045,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  serverLineBright: {
    borderColor: "#CDBEB4",
    backgroundColor: "#FFFFFF",
    shadowOpacity: 0,
    elevation: 0,
  },
  serverLineTop: { flexDirection: "row", alignItems: "flex-start", gap: space(3) },
  serverQtyBox: {
    width: 48,
    height: 48,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E7B9AF",
    backgroundColor: "#F9ECE8",
    paddingTop: space(1.5),
  },
  serverQty: {
    fontFamily: fonts.bodyBold,
    fontSize: 24,
    color: colors.accentStrong,
  },
  serverTimes: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.accentStrong,
    marginLeft: 1,
  },
  serverDishCopy: { flex: 1, paddingRight: space(3) },
  serverOriginal: {
    fontFamily: fonts.native,
    fontSize: 27,
    lineHeight: 35,
    fontWeight: "600",
    color: colors.ink,
  },
  serverRomanized: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
    fontStyle: "italic",
    color: colors.muted,
    marginTop: 1,
  },
  serverDetails: {
    marginLeft: 48 + space(3),
    paddingTop: space(2),
  },
  serverTranslated: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  serverLineMeta: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: space(3),
    marginTop: space(2.5),
  },
  serverCategory: {
    flexShrink: 1,
    overflow: "hidden",
    borderRadius: radius.pill,
    backgroundColor: "#F8ECE8",
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
    fontFamily: fonts.native,
    fontSize: 11,
    color: colors.accentStrong,
  },
  serverPrice: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.ink,
  },
  serverLineNumber: {
    position: "absolute",
    right: space(2),
    top: space(1.5),
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 1,
    color: colors.lineStrong,
  },
  backToCart: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surfaceRaised,
  },
  backToCartBright: {
    borderColor: colors.accentStrong,
  },
  backToCartText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.accentStrong,
  },
  serverClose: {
    alignSelf: "center",
    paddingTop: space(2.5),
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.muted,
  },
  foodMemoryNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(2),
    marginTop: space(2),
  },
  foodMemoryNoteMark: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.sage,
  },
  foodMemoryNoteText: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.muted,
  },
});
