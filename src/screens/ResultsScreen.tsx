import React, { useEffect, useMemo, useState } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DishCard from "../components/DishCard";
import DishDetailSheet from "../components/DishDetailSheet";
import GlassSurface, { EdgeGlass } from "../components/GlassSurface";
import OrderSheet from "../components/OrderSheet";
import OrderCart, { OrderLine, orderTotals } from "../components/OrderCart";
import { useT } from "../lib/i18n";
import {
  convertedPriceForDish,
  displayCurrencyForResult,
  formatMoney,
  getCurrencySymbol,
} from "../lib/currency";
import { track } from "../lib/analytics";
import { Dish, ScanResult } from "../types";
import {
  EMPTY_FOOD_PROFILE,
  FoodProfile,
  getFoodProfile,
  isForYou,
  riskFlags,
} from "../lib/preferences";
import { colors, fonts, radius, space } from "../theme";
import { saveOrderFromCart } from "../lib/orders";

type Filter = "all" | "forYou" | "recommended" | "vegetarian" | "spicy";
const RESULTS_HEADER_HEIGHT = 68;

function dishKey(dish: Dish): string {
  return [dish.category, dish.original_name, dish.price].filter(Boolean).join("::");
}

function matchesFilter(dish: Dish, filter: Filter, profile: FoodProfile): boolean {
  if (filter === "forYou") return isForYou(dish, profile);
  if (filter === "recommended") {
    return !!dish.worth_it || dish.flags.includes("house_special");
  }
  if (filter === "vegetarian") {
    return dish.flags.includes("vegetarian") || dish.flags.includes("vegan");
  }
  if (filter === "spicy") {
    return dish.spice_level > 0 || dish.flags.includes("spicy");
  }
  return true;
}

export default function ResultsScreen({
  result,
  onBack,
}: {
  result: ScanResult;
  onBack: () => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Dish | null>(null);
  const [serverDish, setServerDish] = useState<Dish | null>(null);
  const [order, setOrder] = useState<OrderLine[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState<string | null>(null);
  const [foodProfile, setFoodProfile] = useState<FoodProfile>(EMPTY_FOOD_PROFILE);
  const savedOrderId = React.useRef<string | null>(null);
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const topGlassOpacity = scrollY.interpolate({
    inputRange: [0, 14, 62],
    outputRange: [0, 0.7, 1],
    extrapolate: "clamp",
  });
  const handleScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.setValue(event.nativeEvent.contentOffset.y);
    },
    [scrollY]
  );
  const displayCurrency = displayCurrencyForResult(result);
  const showConverted = !result.currency || result.currency !== displayCurrency;
  useEffect(() => { void getFoodProfile().then(setFoodProfile); }, []);
  const hasFoodProfile = foodProfile.avoid.length > 0 || foodProfile.prefer.length > 0;

  const categories = useMemo(() => {
    const names: string[] = [];
    for (const dish of result.dishes) {
      const name = dish.category?.trim();
      if (name && !names.includes(name)) names.push(name);
    }
    return names;
  }, [result.dishes]);

  const sections = useMemo(() => {
    const grouped = new Map<string, Dish[]>();
    const fallback = t("allDishes");

    result.dishes
      .filter((dish) => matchesFilter(dish, filter, foodProfile))
      .filter((dish) => !category || dish.category?.trim() === category)
      .forEach((dish) => {
        const title = dish.category?.trim() || fallback;
        grouped.set(title, [...(grouped.get(title) || []), dish]);
      });

    return Array.from(grouped, ([title, data]) => ({ title, data }));
  }, [category, filter, foodProfile, result.dishes, t]);

  const count = order.reduce((total, line) => total + line.qty, 0);
  const totals = orderTotals(order);

  function qtyOf(dish: Dish): number {
    return order.find((line) => dishKey(line.dish) === dishKey(dish))?.qty ?? 0;
  }

  function addToOrder(dish: Dish, source: "card" | "detail" = "card") {
    void track("order_item_added", { source });
    setOrder((current) => {
      const index = current.findIndex((line) => dishKey(line.dish) === dishKey(dish));
      if (index === -1) return [...current, { dish, qty: 1 }];
      const next = [...current];
      next[index] = { ...next[index], qty: next[index].qty + 1 };
      return next;
    });
  }

  function removeFromOrder(dish: Dish) {
    setOrder((current) =>
      current
        .map((line) =>
          dishKey(line.dish) === dishKey(dish)
            ? { ...line, qty: line.qty - 1 }
            : line
        )
        .filter((line) => line.qty > 0)
    );
  }

  async function saveShownOrder() {
    void track("order_server_view_opened");
    try {
      const saved = await saveOrderFromCart({
        existingOrderId: savedOrderId.current,
        result,
        lines: order,
      });
      savedOrderId.current = saved.id;
      void track("order_saved", { source: "detail", dishCount: saved.lines.length });
    } catch {
      // Saving Food Memory must never block the server handoff.
    }
  }

  const filters: Array<{ id: Filter; label: string }> = [
    { id: "all", label: t("filterAll") },
    ...(hasFoodProfile ? [{ id: "forYou" as Filter, label: t("filterForYou") }] : []),
    { id: "recommended", label: t("filterRecommended") },
    { id: "vegetarian", label: t("filterVegetarian") },
    { id: "spicy", label: t("filterSpicy") },
  ];

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(dish, index) => `${dishKey(dish)}-${index}`}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: insets.top + RESULTS_HEADER_HEIGHT,
            paddingBottom:
              insets.bottom + (count > 0 ? space(27) : space(8)),
          },
        ]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        scrollIndicatorInsets={{
          top: insets.top + RESULTS_HEADER_HEIGHT,
          bottom: insets.bottom + (count > 0 ? space(22) : 0),
        }}
        ListHeaderComponent={
          <View>
            <View style={styles.menuMeta}>
              <View style={styles.menuMetaBlock}>
                <Text style={styles.menuMetaLabel}>{t("translatedFrom")}</Text>
                <Text style={styles.menuMetaValue}>
                  {result.menu_language || t("unknownLanguage")}
                  {result.currency ? ` · ${result.currency}` : ""}
                </Text>
              </View>
              <View style={styles.menuMetaPrice}>
                <Text style={styles.menuMetaLabel}>{t("pricesIn")}</Text>
                <Text style={styles.menuMetaValue}>
                  {getCurrencySymbol(displayCurrency)} {displayCurrency}
                </Text>
              </View>
            </View>

            <View style={styles.safetyBanner}>
              <View style={styles.safetyIcon}>
                <Text style={styles.safetyIconText}>AI</Text>
              </View>
              <Text style={styles.safetyText}>{t("allergensNote")}</Text>
            </View>
            {hasFoodProfile && (
              <Pressable style={styles.profileBanner} onPress={() => setFilter("forYou")}>
                <View style={styles.profileMark}><Text style={styles.profileMarkText}>♡</Text></View>
                <View style={styles.profileCopy}>
                  <Text style={styles.profileTitle}>{t("profileActive")}</Text>
                  <Text style={styles.profileText}>{t("profileActiveSub")}</Text>
                </View>
                <Text style={styles.profileArrow}>›</Text>
              </Pressable>
            )}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {filters.map((item) => {
                const active = item.id === filter;
                return (
                  <Pressable
                    key={item.id}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setFilter(item.id)}
                  >
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {categories.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryRow}
              >
                <Pressable
                  style={[styles.categoryChip, !category && styles.categoryChipActive]}
                  onPress={() => setCategory(null)}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      !category && styles.categoryTextActive,
                    ]}
                  >
                    {t("allSections")}
                  </Text>
                </Pressable>
                {categories.map((name) => {
                  const active = name === category;
                  return (
                    <Pressable
                      key={name}
                      style={[styles.categoryChip, active && styles.categoryChipActive]}
                      onPress={() => setCategory(active ? null : name)}
                    >
                      <Text
                        style={[
                          styles.categoryText,
                          active && styles.categoryTextActive,
                        ]}
                      >
                        {name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionCount}>
              {section.data.length} {t("items")}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <DishCard
            dish={item}
            personalRisk={riskFlags(item, foodProfile).length > 0}
            onPress={() => {
              void track("dish_detail_opened", { source: "card" });
              setSelected(item);
            }}
            onAdd={() => addToOrder(item, "card")}
            convertedPrice={
              showConverted ? convertedPriceForDish(item) : null
            }
            qty={qtyOf(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {result.dishes.length ? t("nothingMatches") : t("noDishes")}
            </Text>
            {result.dishes.length > 0 && (
              <Text style={styles.emptyBody}>{t("tryAnotherFilter")}</Text>
            )}
            <Pressable
              style={styles.resetFilters}
              onPress={() => {
                setFilter("all");
                setCategory(null);
              }}
            >
              <Text style={styles.resetFiltersText}>{t("clearFilters")}</Text>
            </Pressable>
          </View>
        }
      />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.topMaterial,
          {
            height: insets.top + RESULTS_HEADER_HEIGHT,
            opacity: topGlassOpacity,
          },
        ]}
      >
        <EdgeGlass style={StyleSheet.absoluteFill} />
      </Animated.View>

      <View
        style={[
          styles.header,
          {
            height: insets.top + RESULTS_HEADER_HEIGHT,
            paddingTop: insets.top + space(2),
          },
        ]}
      >
        <GlassSurface style={styles.backGlass} intensity={46}>
          <Pressable style={styles.backButton} onPress={onBack} hitSlop={10}>
            <Text style={styles.backArrow}>‹</Text>
          </Pressable>
        </GlassSurface>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>TAVUE · {t("menuGuide").toUpperCase()}</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {result.cuisine || t("menuFallback")}
          </Text>
        </View>
        <View style={styles.dishCount}>
          <Text style={styles.dishCountNumber}>{result.dishes.length}</Text>
          <Text style={styles.dishCountLabel}>{t("items")}</Text>
        </View>
      </View>

      {count > 0 && (
        <GlassSurface
          style={[
            styles.cartDock,
            { bottom: insets.bottom + space(2) },
          ]}
          contentStyle={styles.cartDockContent}
          intensity={72}
          strong
        >
          <Pressable
            style={styles.cartBar}
            onPress={() => {
              void track("order_opened");
              setShowCart(true);
            }}
          >
            <View style={styles.cartCount}>
              <Text style={styles.cartCountText}>{count}</Text>
            </View>
            <View style={styles.cartCopy}>
              <Text style={styles.cartLabel}>{t("viewOrder")}</Text>
              <Text style={styles.cartSub}>{t("orderReady")}</Text>
            </View>
            <Text style={styles.cartTotal}>
              {totals.converted > 0
                ? formatMoney(totals.converted, displayCurrency)
                : "—"}
            </Text>
            <Text style={styles.cartArrow}>›</Text>
          </Pressable>
        </GlassSurface>
      )}

      <DishDetailSheet
        dish={selected}
        qty={selected ? qtyOf(selected) : 0}
        onAdd={(dish) => addToOrder(dish, "detail")}
        onRemove={removeFromOrder}
        onShowServer={(dish) => {
          setSelected(null);
          setServerDish(dish);
        }}
        onClose={() => setSelected(null)}
        showConverted={showConverted}
      />

      <OrderCart
        visible={showCart}
        lines={order}
        displayCurrency={displayCurrency}
        menuLanguage={result.menu_language}
        showConverted={showConverted}
        onAdd={(dish) => addToOrder(dish, "detail")}
        onRemove={removeFromOrder}
        onClear={() => {
          setOrder([]);
          setShowCart(false);
        }}
        onClose={() => setShowCart(false)}
        onShowServer={() => void saveShownOrder()}
      />

      <OrderSheet
        dish={serverDish}
        showConverted={showConverted}
        onClose={() => setServerDish(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  topMaterial: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 19,
  },
  header: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space(4),
    paddingBottom: space(2),
  },
  backGlass: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  backButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  backArrow: {
    fontFamily: fonts.body,
    fontSize: 29,
    lineHeight: 30,
    color: colors.text,
    marginTop: -2,
  },
  headerCopy: { flex: 1, paddingHorizontal: space(3) },
  headerEyebrow: {
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 1.2,
    color: colors.accent,
  },
  headerTitle: {
    fontFamily: fonts.display,
    fontSize: 25,
    lineHeight: 27,
    color: colors.text,
  },
  dishCount: { alignItems: "flex-end" },
  dishCountNumber: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.text,
  },
  dishCountLabel: {
    fontFamily: fonts.body,
    fontSize: 8,
    color: colors.muted,
    textTransform: "uppercase",
  },
  listContent: { paddingBottom: space(8) },
  menuMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: space(4),
    paddingHorizontal: space(5),
    paddingTop: space(4),
  },
  menuMetaBlock: { flex: 1 },
  menuMetaPrice: { alignItems: "flex-end" },
  menuMetaLabel: {
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 1.2,
    color: colors.muted,
  },
  menuMetaValue: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.text,
    marginTop: 2,
  },
  safetyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2.5),
    marginHorizontal: space(5),
    marginTop: space(3),
    paddingVertical: space(2.5),
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  safetyIcon: {
    width: 28,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentWash,
  },
  safetyIconText: {
    fontFamily: fonts.bodyBold,
    fontSize: 8,
    letterSpacing: 0.5,
    color: colors.accentStrong,
  },
  safetyText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 10,
    lineHeight: 15,
    color: colors.muted,
  },
  profileBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: space(5),
    marginTop: space(3),
    borderWidth: 1,
    borderColor: "rgba(184,58,41,0.2)",
    borderRadius: radius.image,
    backgroundColor: "#FFF2EF",
    padding: space(3),
  },
  profileMark: { width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  profileMarkText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.accentStrong },
  profileCopy: { flex: 1, paddingHorizontal: space(2.5) },
  profileTitle: { fontFamily: fonts.bodySemibold, fontSize: 12, color: colors.text },
  profileText: { fontFamily: fonts.body, fontSize: 9, lineHeight: 13, color: colors.muted, marginTop: 1 },
  profileArrow: { fontSize: 22, color: colors.accent },
  filterRow: {
    gap: space(2),
    paddingHorizontal: space(5),
    paddingTop: space(4),
    paddingBottom: space(2),
  },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    backgroundColor: colors.glassStrong,
    paddingHorizontal: space(3),
    paddingVertical: space(2),
  },
  filterChipActive: { backgroundColor: colors.text, borderColor: colors.text },
  filterText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.muted,
  },
  filterTextActive: { fontFamily: fonts.bodySemibold, color: colors.surface },
  categoryRow: {
    gap: space(2.5),
    paddingHorizontal: space(5),
    paddingTop: space(2),
    paddingBottom: space(2),
  },
  categoryChip: { paddingVertical: space(1), borderBottomWidth: 1, borderBottomColor: "transparent" },
  categoryChipActive: { borderBottomColor: colors.accent },
  categoryText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.muted,
  },
  categoryTextActive: { color: colors.accentStrong },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingHorizontal: space(5),
    paddingTop: space(4),
    paddingBottom: space(2),
  },
  sectionTitle: {
    flex: 1,
    fontFamily: fonts.display,
    fontSize: 24,
    lineHeight: 27,
    color: colors.text,
  },
  sectionCount: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: colors.muted,
  },
  cartDock: {
    position: "absolute",
    left: space(4),
    right: space(4),
    zIndex: 30,
    borderRadius: radius.pill,
    shadowColor: "#50352F",
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7,
  },
  cartDockContent: { borderRadius: radius.pill },
  cartBar: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.pill,
    backgroundColor: "transparent",
    paddingHorizontal: space(3.5),
  },
  cartCount: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  cartCountText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.onAccent,
  },
  cartCopy: { flex: 1, paddingHorizontal: space(3) },
  cartLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: 13,
    color: colors.text,
  },
  cartSub: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: colors.muted,
    marginTop: 1,
  },
  cartTotal: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.text,
  },
  cartArrow: { color: colors.accent, fontSize: 24, marginLeft: space(2) },
  empty: {
    alignItems: "center",
    paddingHorizontal: space(8),
    paddingTop: space(12),
  },
  emptyTitle: {
    fontFamily: fonts.display,
    fontSize: 25,
    color: colors.text,
    textAlign: "center",
  },
  emptyBody: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
    marginTop: space(1),
  },
  resetFilters: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    paddingHorizontal: space(4),
    paddingVertical: space(2),
    marginTop: space(4),
  },
  resetFiltersText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 11,
    color: colors.accentStrong,
  },
});
