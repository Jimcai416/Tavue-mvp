import DishPhoto from "./DishPhoto";
import React from "react";
import {
  GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useT } from "../lib/i18n";
import { Dish, DishFlag } from "../types";
import { colors, fonts, radius, space } from "../theme";

const FLAG_KEYS: Record<DishFlag, string> = {
  spicy: "flagSpicy",
  raw: "flagRaw",
  offal: "flagOffal",
  contains_nuts: "flagNuts",
  contains_shellfish: "flagShellfish",
  contains_gluten: "flagGluten",
  contains_dairy: "flagDairy",
  vegetarian: "flagVegetarian",
  vegan: "flagVegan",
  house_special: "flagHouseSpecial",
};

export function DishFlagPill({ flag }: { flag: DishFlag }) {
  const t = useT();
  const positive = flag === "vegetarian" || flag === "vegan" || flag === "house_special";
  const warning = flag.startsWith("contains_") || flag === "raw" || flag === "offal";

  return (
    <View
      style={[
        styles.flag,
        positive && styles.flagPositive,
        warning && styles.flagWarning,
      ]}
    >
      <Text
        style={[
          styles.flagText,
          positive && styles.flagTextPositive,
          warning && styles.flagTextWarning,
        ]}
      >
        {t(FLAG_KEYS[flag] as any)}
      </Text>
    </View>
  );
}

export default function DishCard({
  dish,
  onPress,
  onAdd,
  convertedPrice,
  qty = 0,
  personalRisk = false,
}: {
  dish: Dish;
  onPress?: () => void;
  onAdd?: () => void;
  convertedPrice?: string | null;
  qty?: number;
  personalRisk?: boolean;
}) {
  const t = useT();

  function handleAdd(event: GestureResponderEvent) {
    event.stopPropagation();
    onAdd?.();
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.imageWrap}>
        <DishPhoto dish={dish} style={styles.image} />
        {dish.spice_level > 0 && (
          <View style={styles.spiceBadge}>
            <Text style={styles.spiceText}>{"•".repeat(dish.spice_level)}</Text>
          </View>
        )}
        {personalRisk && (
          <View style={styles.riskBadge}>
            <Text style={styles.riskText}>CHECK</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.topLine}>
          <Text style={styles.originalName} numberOfLines={1}>
            {dish.original_name}
          </Text>
          {dish.price || convertedPrice ? (
            <View style={styles.priceGroup}>
              {dish.price ? (
                <Text style={styles.priceText} numberOfLines={1}>
                  {dish.price}
                </Text>
              ) : null}
              {convertedPrice ? (
                <Text style={styles.convertedPrice} numberOfLines={1}>
                  {convertedPrice}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <Text style={styles.translatedName} numberOfLines={1}>
          {dish.translated_name}
        </Text>

        {dish.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {dish.description}
          </Text>
        ) : null}

        <View style={styles.footer}>
          <View style={styles.flagRow}>
            {dish.flags.slice(0, 2).map((flag) => (
              <DishFlagPill key={flag} flag={flag} />
            ))}
            {dish.flags.length > 2 && (
              <Text style={styles.moreFlags}>+{dish.flags.length - 2}</Text>
            )}
          </View>

          {onAdd && (
            <Pressable
              style={[styles.addBtn, qty > 0 && styles.addBtnActive]}
              onPress={handleAdd}
              hitSlop={8}
              accessibilityLabel={t("addToOrder")}
            >
              <Text style={[styles.addBtnText, qty > 0 && styles.addBtnTextActive]}>
                {qty > 0 ? qty : "+"}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 114,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.image,
    marginHorizontal: space(5),
    marginBottom: space(2.5),
    padding: space(2),
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardPressed: { opacity: 0.78, transform: [{ scale: 0.995 }] },
  imageWrap: {
    // Both dimensions must be explicit. A percentage-height Image inside a
    // minHeight-only parent can be measured from the remote image's intrinsic
    // aspect ratio on iOS, which lets one portrait image stretch the whole row.
    width: 124,
    height: 96,
    flexShrink: 0,
    borderRadius: radius.image - 4,
    overflow: "hidden",
    backgroundColor: colors.background,
  },
  image: { width: "100%", height: "100%" },
  placeholder: { alignItems: "center", justifyContent: "center" },
  placeholderGlyph: {
    fontFamily: fonts.display,
    fontSize: 48,
    color: colors.lineStrong,
  },
  spiceBadge: {
    position: "absolute",
    left: space(2),
    bottom: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    paddingHorizontal: space(1.5),
    paddingVertical: 2,
  },
  spiceText: {
    color: "#FFF",
    fontSize: 10,
    letterSpacing: 1,
    lineHeight: 10,
  },
  riskBadge: {
    position: "absolute",
    right: space(2),
    top: space(2),
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    paddingHorizontal: space(2),
    paddingVertical: 3,
  },
  riskText: {
    color: "#FFF",
    fontFamily: fonts.bodyBold,
    fontSize: 8,
    letterSpacing: 0.8,
  },
  body: {
    flex: 1,
    minHeight: 96,
    paddingLeft: space(3),
    paddingRight: space(1),
    paddingVertical: space(1),
  },
  topLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: space(2),
  },
  originalName: {
    flex: 1,
    fontFamily: fonts.bodySemibold,
    fontSize: 15,
    lineHeight: 19,
    color: colors.text,
  },
  priceText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.accentStrong,
  },
  priceGroup: { alignItems: "flex-end", flexShrink: 0 },
  convertedPrice: {
    fontFamily: fonts.bodyMedium,
    fontSize: 8,
    lineHeight: 11,
    color: colors.muted,
    marginTop: 1,
  },
  translatedName: {
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 15,
    color: colors.muted,
    marginTop: 1,
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 15,
    color: colors.text,
    marginTop: space(1.5),
    opacity: 0.82,
  },
  footer: {
    minHeight: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: "auto",
    paddingTop: space(1),
  },
  flagRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space(1),
    flexWrap: "wrap",
    paddingRight: space(1),
  },
  flag: {
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    paddingHorizontal: space(1.5),
    paddingVertical: 3,
  },
  flagPositive: { backgroundColor: colors.sageWash },
  flagWarning: { backgroundColor: colors.dangerWash },
  flagText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 8,
    lineHeight: 10,
    color: colors.muted,
  },
  flagTextPositive: { color: colors.sage },
  flagTextWarning: { color: colors.danger },
  moreFlags: {
    fontFamily: fonts.bodyMedium,
    fontSize: 8,
    color: colors.muted,
  },
  addBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  addBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  addBtnText: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    lineHeight: 20,
  },
  addBtnTextActive: { color: colors.onAccent, fontSize: 12 },
});
