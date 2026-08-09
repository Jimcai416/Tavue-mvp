import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TAB_BAR_CONTENT_INSET } from "../components/BottomTabBar";
import GlassSurface, { EdgeGlass } from "../components/GlassSurface";
import { useT } from "../lib/i18n";
import { colors, fonts, radius, shadow, space } from "../theme";

const HEADER_HEIGHT = 68;

function StatusRow({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.statusRow}>
      <View style={[styles.statusDot, active && styles.statusDotActive]} />
      <Text style={styles.statusText}>{children}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={[styles.headerMaterial, { height: insets.top + HEADER_HEIGHT }]}>
        <EdgeGlass style={StyleSheet.absoluteFill} />
      </View>
      <View
        style={[
          styles.header,
          { height: insets.top + HEADER_HEIGHT, paddingTop: insets.top + space(2) },
        ]}
      >
        <Text style={styles.eyebrow}>TAVUE · YOUR SPACE</Text>
        <Text style={styles.title}>{t("profileTitle")}</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + HEADER_HEIGHT + space(6),
            paddingBottom: insets.bottom + TAB_BAR_CONTENT_INSET,
          },
        ]}
      >
        <GlassSurface
          style={[styles.identityCard, shadow.card]}
          contentStyle={styles.identityContent}
          intensity={50}
          nativeGlass={false}
          interactive={false}
        >
          <View style={styles.avatar}>
            <View style={styles.avatarHead} />
            <View style={styles.avatarShoulders} />
          </View>
          <Text style={styles.identityTitle}>{t("profileFutureTitle")}</Text>
          <Text style={styles.identityBody}>{t("profileFutureBody")}</Text>
          <View style={styles.comingPill}>
            <Text style={styles.comingPillText}>{t("comingNextBeta")}</Text>
          </View>
        </GlassSurface>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t("thisBeta")}</Text>
          <View style={styles.statusCard}>
            <StatusRow active>{t("localHistoryStatus")}</StatusRow>
            <View style={styles.divider} />
            <StatusRow active>{t("localPhotosStatus")}</StatusRow>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t("accountPhase")}</Text>
          <View style={styles.statusCard}>
            <StatusRow>{t("signInStatus")}</StatusRow>
            <View style={styles.divider} />
            <StatusRow>{t("cloudReviewStatus")}</StatusRow>
            <View style={styles.divider} />
            <StatusRow>{t("scanBalanceStatus")}</StatusRow>
          </View>
        </View>

        <Text style={styles.privacyNote}>{t("profilePrivacyNote")}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  headerMaterial: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 19 },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    justifyContent: "center",
    paddingHorizontal: space(5),
    paddingBottom: space(2),
  },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 1.2,
    color: colors.accent,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 29,
    lineHeight: 31,
    color: colors.text,
  },
  content: { paddingHorizontal: space(5) },
  identityCard: {
    borderRadius: radius.sheet,
  },
  identityContent: {
    alignItems: "center",
    paddingHorizontal: space(5),
    paddingVertical: space(7),
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentWash,
  },
  avatarHead: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.primaryAction,
    marginTop: -13,
  },
  avatarShoulders: {
    position: "absolute",
    bottom: 12,
    width: 34,
    height: 17,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: colors.primaryAction,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  identityTitle: {
    fontFamily: fonts.display,
    fontSize: 27,
    lineHeight: 30,
    color: colors.text,
    textAlign: "center",
    marginTop: space(4),
  },
  identityBody: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 19,
    color: colors.muted,
    textAlign: "center",
    marginTop: space(2),
  },
  comingPill: {
    marginTop: space(4),
    borderRadius: radius.pill,
    backgroundColor: colors.sageWash,
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
  },
  comingPillText: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    color: colors.sage,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  section: { marginTop: space(7) },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.6,
    color: colors.muted,
    marginBottom: space(2.5),
  },
  statusCard: {
    ...shadow.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: space(4),
  },
  statusRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.5,
    borderColor: colors.mutedSoft,
  },
  statusDotActive: {
    borderColor: colors.sage,
    backgroundColor: colors.sage,
  },
  statusText: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
    color: colors.text,
  },
  divider: { height: 1, backgroundColor: colors.line, marginLeft: space(6) },
  privacyNote: {
    fontFamily: fonts.body,
    fontSize: 10,
    lineHeight: 16,
    color: colors.muted,
    textAlign: "center",
    marginTop: space(5),
    paddingHorizontal: space(3),
  },
});
