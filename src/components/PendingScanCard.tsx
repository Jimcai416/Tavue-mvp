import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { getPendingScanStatus, retryPendingScans } from "../lib/api";
import { getLanguage } from "../lib/i18n";
import { colors, fonts, radius, shadow, space } from "../theme";

const COPY: Record<string, { saved: string; waiting: string; processing: string; body: string; retry: string }> = {
  English: {
    saved: "Menu saved ✓",
    waiting: "Waiting for connection",
    processing: "Scanning your saved menu…",
    body: "We’ll finish scanning automatically.",
    retry: "Retry now",
  },
  "Chinese (Simplified)": {
    saved: "菜单已保存 ✓",
    waiting: "等待网络连接",
    processing: "正在处理已保存的菜单…",
    body: "网络恢复后会自动继续，无需重新拍摄。",
    retry: "立即重试",
  },
  "Chinese (Traditional)": {
    saved: "菜單已儲存 ✓",
    waiting: "等待網路連線",
    processing: "正在處理已儲存的菜單…",
    body: "連線恢復後會自動繼續，不需要重新拍攝。",
    retry: "立即重試",
  },
  French: {
    saved: "Menu enregistré ✓",
    waiting: "En attente de connexion",
    processing: "Analyse du menu enregistré…",
    body: "Tavue reprendra automatiquement.",
    retry: "Réessayer",
  },
  Italian: {
    saved: "Menu salvato ✓",
    waiting: "In attesa della connessione",
    processing: "Scansione del menu salvato…",
    body: "Tavue continuerà automaticamente.",
    retry: "Riprova",
  },
  Spanish: {
    saved: "Menú guardado ✓",
    waiting: "Esperando conexión",
    processing: "Procesando el menú guardado…",
    body: "Tavue continuará automáticamente.",
    retry: "Reintentar",
  },
  Japanese: {
    saved: "メニューを保存しました ✓",
    waiting: "接続を待っています",
    processing: "保存したメニューを処理中…",
    body: "通信が戻り次第、自動で続行します。",
    retry: "再試行",
  },
  Korean: {
    saved: "메뉴 저장됨 ✓",
    waiting: "연결 대기 중",
    processing: "저장된 메뉴 처리 중…",
    body: "연결이 복구되면 자동으로 계속합니다.",
    retry: "다시 시도",
  },
};

export default function PendingScanCard() {
  const [count, setCount] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const refresh = useCallback(async () => {
    if (Platform.OS === "web") return;
    const status = await getPendingScanStatus();
    setCount(status.count);
    setProcessing(status.processing);
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    void refresh();
    const timer = setInterval(() => void refresh(), 1500);
    return () => clearInterval(timer);
  }, [refresh]);

  if (Platform.OS === "web" || count === 0) return null;

  const copy = COPY[getLanguage()] ?? COPY.English;

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    setProcessing(true);
    try {
      await retryPendingScans();
    } finally {
      setRetrying(false);
      await refresh();
    }
  };

  return (
    <View style={[styles.card, shadow.glass]} accessibilityLiveRegion="polite">
      <View style={styles.iconWrap}>
        {processing || retrying ? (
          <ActivityIndicator size="small" color={colors.accentStrong} />
        ) : (
          <Text style={styles.icon}>✓</Text>
        )}
      </View>

      <View style={styles.copy}>
        <Text style={styles.title}>{processing ? copy.processing : copy.saved}</Text>
        {!processing && <Text style={styles.status}>{copy.waiting}</Text>}
        <Text style={styles.body} numberOfLines={2}>{copy.body}</Text>
      </View>

      {!processing && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.retry}
          onPress={retry}
          style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
        >
          <Text style={styles.retryText}>{copy.retry}</Text>
        </Pressable>
      )}

      {count > 1 && <View style={styles.countBadge}><Text style={styles.countText}>{count}</Text></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    left: space(5),
    right: space(5),
    bottom: 94,
    zIndex: 20,
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    padding: space(3),
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: "rgba(201, 86, 66, 0.25)",
    backgroundColor: "rgba(255, 250, 244, 0.96)",
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(201, 86, 66, 0.10)",
  },
  icon: {
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    color: colors.accentStrong,
  },
  copy: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    lineHeight: 18,
    color: colors.text,
  },
  status: {
    marginTop: 2,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.text,
  },
  body: {
    marginTop: 3,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 15,
    color: colors.muted,
  },
  retry: {
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: space(2.5),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(201, 86, 66, 0.28)",
  },
  retryPressed: { opacity: 0.6 },
  retryText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 11,
    color: colors.accentStrong,
  },
  countBadge: {
    position: "absolute",
    right: -5,
    top: -5,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentStrong,
  },
  countText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.onAccent,
  },
});