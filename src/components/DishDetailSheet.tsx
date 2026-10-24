import React from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Dish } from "../types";
import { useT } from "../lib/i18n";
import { convertedPriceForDish } from "../lib/currency";
import { colors, fonts, radius, space } from "../theme";
import { DishFlagPill } from "./DishCard";

export default function DishDetailSheet({
  dish,
  qty,
  onAdd,
  onRemove,
  onShowServer,
  onClose,
  showConverted = true,
}: {
  dish: Dish | null;
  qty: number;
  onAdd: (dish: Dish) => void;
  onRemove: (dish: Dish) => void;
  onShowServer: (dish: Dish) => void;
  onClose: () => void;
  showConverted?: boolean;
}) {
  const t = useT();
  if (!dish) return null;
  const convertedPrice = showConverted ? convertedPriceForDish(dish) : null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {dish.image_url ? (
              <Image source={{ uri: dish.image_url }} style={styles.image} resizeMode="cover" />
            ) : (
              <View style={[styles.image, styles.placeholder]}>
                <Text style={styles.placeholderGlyph}>
                  {dish.original_name.trim().slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}

            <View style={styles.content}>
              <View style={styles.eyebrowRow}>
                <Text style={styles.eyebrow}>
                  {(dish.category || t("menuGuide")).toUpperCase()}
                </Text>
                {dish.price ? (
                  <Text style={styles.price}>
                    {dish.price}
                    {convertedPrice ? ` · ${convertedPrice}` : ""}
                  </Text>
                ) : null}
              </View>

              <Text style={styles.original}>{dish.original_name}</Text>
              {dish.romanized ? <Text style={styles.romanized}>{dish.romanized}</Text> : null}
              <Text style={styles.translated}>{dish.translated_name}</Text>

              {dish.description ? (
                <Text style={styles.description}>{dish.description}</Text>
              ) : null}

              {dish.flags.length > 0 && (
                <View style={styles.flagRow}>
                  {dish.flags.map((flag) => (
                    <DishFlagPill key={flag} flag={flag} />
                  ))}
                </View>
              )}

              {(dish.ingredients?.length ?? 0) > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>{t("ingredients")}</Text>
                  <View style={styles.ingredientRow}>
                    {(dish.ingredients ?? []).map((ingredient) => (
                      <View key={ingredient} style={styles.ingredient}>
                        <Text style={styles.ingredientText}>{ingredient}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {dish.worth_it ? (
                <View style={styles.advice}>
                  <Text style={styles.adviceMark}>“</Text>
                  <View style={styles.adviceCopy}>
                    <Text style={styles.adviceLabel}>{t("tavueTake")}</Text>
                    <Text style={styles.adviceText}>{dish.worth_it}</Text>
                  </View>
                </View>
              ) : null}

              <View style={styles.safetyNote}>
                <Text style={styles.safetyIcon}>AI</Text>
                <Text style={styles.safetyText}>{t("allergensNote")}</Text>
              </View>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={styles.serverBtn} onPress={() => onShowServer(dish)}>
              <Text style={styles.serverBtnText}>{t("showServer")}</Text>
            </Pressable>

            {qty > 0 ? (
              <View style={styles.stepper}>
                <Pressable style={styles.stepBtn} onPress={() => onRemove(dish)}>
                  <Text style={styles.stepText}>−</Text>
                </Pressable>
                <View style={styles.qtyCopy}>
                  <Text style={styles.qty}>{qty}</Text>
                  <Text style={styles.qtyLabel}>{t("inYourOrder")}</Text>
                </View>
                <Pressable style={[styles.stepBtn, styles.stepBtnFilled]} onPress={() => onAdd(dish)}>
                  <Text style={[styles.stepText, styles.stepTextFilled]}>+</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.addBtn} onPress={() => onAdd(dish)}>
                <Text style={styles.addBtnText}>{t("addToOrder")}</Text>
                <Text style={styles.addBtnArrow}>＋</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.overlay,
  },
  sheet: {
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    maxHeight: "92%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    overflow: "hidden",
  },
  handle: {
    position: "absolute",
    top: space(2.5),
    alignSelf: "center",
    zIndex: 2,
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  scrollContent: { paddingBottom: space(3) },
  image: {
    width: "100%",
    height: 226,
    backgroundColor: colors.background,
  },
  placeholder: { alignItems: "center", justifyContent: "center" },
  placeholderGlyph: {
    fontFamily: fonts.display,
    fontSize: 82,
    color: colors.lineStrong,
  },
  content: { padding: space(5), paddingBottom: space(3) },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space(3),
  },
  eyebrow: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.5,
    color: colors.accent,
  },
  price: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.accentStrong,
  },
  original: {
    fontFamily: fonts.native,
    fontSize: 29,
    lineHeight: 35,
    fontWeight: "600",
    color: colors.text,
    marginTop: space(2),
  },
  romanized: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontStyle: "italic",
    color: colors.muted,
    marginTop: 2,
  },
  translated: {
    fontFamily: fonts.bodySemibold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.accentStrong,
    marginTop: space(1),
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
    marginTop: space(4),
  },
  flagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space(1.5),
    marginTop: space(4),
  },
  section: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    marginTop: space(5),
    paddingTop: space(4),
  },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.5,
    color: colors.muted,
    textTransform: "uppercase",
  },
  ingredientRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space(1.5),
    marginTop: space(2.5),
  },
  ingredient: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1.5),
  },
  ingredientText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.text,
  },
  advice: {
    flexDirection: "row",
    borderRadius: radius.image,
    backgroundColor: colors.accentWash,
    padding: space(3.5),
    marginTop: space(5),
  },
  adviceMark: {
    fontFamily: fonts.display,
    fontSize: 44,
    lineHeight: 35,
    color: colors.accent,
    marginRight: space(2),
  },
  adviceCopy: { flex: 1 },
  adviceLabel: {
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 1.2,
    color: colors.accentStrong,
  },
  adviceText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
    marginTop: space(1),
  },
  safetyNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
    marginTop: space(4),
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: space(3),
  },
  safetyIcon: {
    width: 26,
    height: 18,
    borderRadius: 9,
    textAlign: "center",
    fontFamily: fonts.bodyBold,
    fontSize: 8,
    lineHeight: 18,
    letterSpacing: 0.5,
    color: colors.accentStrong,
    backgroundColor: colors.accentWash,
  },
  safetyText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 10,
    lineHeight: 15,
    color: colors.muted,
  },
  actions: {
    flexDirection: "row",
    gap: space(2.5),
    paddingHorizontal: space(5),
    paddingTop: space(3),
    paddingBottom: space(7),
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  serverBtn: {
    minHeight: 52,
    justifyContent: "center",
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    paddingHorizontal: space(3),
  },
  serverBtnText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    color: colors.text,
  },
  addBtn: {
    flex: 1,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radius.button,
    backgroundColor: colors.accent,
    paddingHorizontal: space(4),
  },
  addBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.onAccent,
  },
  addBtnArrow: { color: colors.onAccent, fontSize: 18 },
  stepper: {
    flex: 1,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radius.button,
    backgroundColor: colors.background,
    paddingHorizontal: space(2),
  },
  stepBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  stepBtnFilled: { backgroundColor: colors.accent, borderColor: colors.accent },
  stepText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 18,
    color: colors.text,
    lineHeight: 21,
  },
  stepTextFilled: { color: colors.onAccent },
  qtyCopy: { alignItems: "center" },
  qty: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.text,
  },
  qtyLabel: {
    fontFamily: fonts.body,
    fontSize: 8,
    color: colors.muted,
  },
});
