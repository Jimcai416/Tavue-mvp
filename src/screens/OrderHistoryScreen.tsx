import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  FlatList,
  Image,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { TAB_BAR_CONTENT_INSET } from "../components/BottomTabBar";
import GlassSurface, { EdgeGlass } from "../components/GlassSurface";
import { track } from "../lib/analytics";
import {
  contributionCount,
  deleteOrders,
  getOrders,
  MAX_REWARDED_PHOTOS_PER_ORDER,
  potentialCredits,
  removeContribution,
  saveContribution,
  type SavedOrder,
  type SavedOrderLine,
  updateRestaurant,
} from "../lib/orders";
import {
  deleteContributionPhoto,
  persistContributionPhoto,
  resolveContributionPhotoUri,
} from "../lib/contributionPhotos";
import { useT } from "../lib/i18n";
import { colors, fonts, radius, shadow, space } from "../theme";

const HEADER_HEIGHT = 68;
const SWIPE_ACTION_WIDTH = 88;

function orderTitle(order: SavedOrder, fallback: string): string {
  return order.restaurant?.name || order.cuisine || fallback;
}

function formatOrderDate(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function itemCount(order: SavedOrder): number {
  return order.lines.reduce((total, line) => total + line.qty, 0);
}

function ContributionImage({ uri }: { uri: string }) {
  const [resolvedUri, setResolvedUri] = useState<string | null>(
    Platform.OS === "web" ? null : uri
  );

  useEffect(() => {
    let active = true;
    void resolveContributionPhotoUri(uri)
      .then((next) => {
        if (active) setResolvedUri(next);
      })
      .catch(() => {
        if (active) setResolvedUri(null);
      });
    return () => {
      active = false;
    };
  }, [uri]);

  if (!resolvedUri) {
    return (
      <View style={[styles.contributionImage, styles.contributionImageLoading]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return <Image source={{ uri: resolvedUri }} style={styles.contributionImage} />;
}

function confirmOrderDeletion({
  title,
  body,
  cancelLabel,
  deleteLabel,
}: {
  title: string;
  body: string;
  cancelLabel: string;
  deleteLabel: string;
}): Promise<boolean> {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return Promise.resolve(window.confirm(`${title}\n\n${body}`));
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (answer: boolean) => {
      if (settled) return;
      settled = true;
      resolve(answer);
    };
    Alert.alert(
      title,
      body,
      [
        { text: cancelLabel, style: "cancel", onPress: () => finish(false) },
        { text: deleteLabel, style: "destructive", onPress: () => finish(true) },
      ],
      { cancelable: true, onDismiss: () => finish(false) }
    );
  });
}

function SwipeableOrderRow({
  children,
  deleteLabel,
  editMode,
  selected,
  onDelete,
  onOpen,
  onToggle,
}: React.PropsWithChildren<{
  deleteLabel: string;
  editMode: boolean;
  selected: boolean;
  onDelete: () => void;
  onOpen: () => void;
  onToggle: () => void;
}>) {
  const translateX = useRef(new Animated.Value(0)).current;
  const currentX = useRef(0);
  const dragStart = useRef(0);
  const latest = useRef({ editMode, onDelete, onOpen, onToggle });
  latest.current = { editMode, onDelete, onOpen, onToggle };

  useEffect(() => {
    const listener = translateX.addListener(({ value }) => {
      currentX.current = value;
    });
    return () => translateX.removeListener(listener);
  }, [translateX]);

  const settle = (toValue: number) => {
    Animated.spring(translateX, {
      toValue,
      damping: 20,
      stiffness: 240,
      mass: 0.72,
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    if (editMode) settle(0);
  }, [editMode]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        !latest.current.editMode &&
        Math.abs(gesture.dx) > 8 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
      onMoveShouldSetPanResponder: (_, gesture) =>
        !latest.current.editMode &&
        Math.abs(gesture.dx) > 8 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
      onPanResponderGrant: () => {
        dragStart.current = currentX.current;
      },
      onPanResponderMove: (_, gesture) => {
        const next = Math.max(
          -SWIPE_ACTION_WIDTH,
          Math.min(0, dragStart.current + gesture.dx)
        );
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        const projected = dragStart.current + gesture.dx + gesture.vx * 18;
        settle(projected < -SWIPE_ACTION_WIDTH * 0.42 ? -SWIPE_ACTION_WIDTH : 0);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: () => settle(0),
    })
  ).current;

  const handlePress = () => {
    if (latest.current.editMode) {
      latest.current.onToggle();
    } else if (currentX.current < -2) {
      settle(0);
    } else {
      latest.current.onOpen();
    }
  };

  return (
    <View style={styles.swipeShadow}>
      <View style={styles.swipeShell}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={deleteLabel}
          style={styles.swipeDelete}
          onPress={() => latest.current.onDelete()}
        >
          <Text style={styles.swipeDeleteText}>{deleteLabel}</Text>
        </Pressable>
        <Animated.View
          {...panResponder.panHandlers}
          style={{ transform: [{ translateX }] }}
        >
          <Pressable
            accessibilityActions={[{ name: "activate" }, { name: "delete", label: deleteLabel }]}
            accessibilityState={{ selected: editMode ? selected : undefined }}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === "delete") latest.current.onDelete();
              if (event.nativeEvent.actionName === "activate") handlePress();
            }}
            style={({ pressed }) => [styles.orderCard, pressed && styles.cardPressed]}
            onPress={handlePress}
          >
            {editMode && (
              <View style={[styles.selectionCircle, selected && styles.selectionCircleSelected]}>
                {selected && <Text style={styles.selectionCheck}>✓</Text>}
              </View>
            )}
            <View style={styles.orderCardBody}>{children}</View>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

export default function OrderHistoryScreen({
  onBack,
  onDetailChange,
}: {
  onBack: () => void;
  onDetailChange?: (open: boolean) => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState<SavedOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingLineId, setSavingLineId] = useState<string | null>(null);
  const [restaurantDraft, setRestaurantDraft] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void getOrders().then((next) => {
      setOrders(next);
      setLoading(false);
    });
    void track("order_history_opened", { source: "history" });
  }, []);

  const selected = useMemo(
    () => orders.find((order) => order.id === selectedId) ?? null,
    [orders, selectedId]
  );

  useEffect(() => {
    onDetailChange?.(Boolean(selectedId) || editMode);
  }, [editMode, onDetailChange, selectedId]);

  useEffect(() => () => onDetailChange?.(false), [onDetailChange]);

  useEffect(() => {
    setRestaurantDraft(selected?.restaurant?.name ?? "");
  }, [selected?.id, selected?.restaurant?.name]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (selectedId) {
        setSelectedId(null);
      } else {
        onBack();
      }
      return true;
    });
    return () => subscription.remove();
  }, [onBack, selectedId]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as {
        tavueScreen?: string;
        tavueOrderId?: string;
      } | null;
      if (state?.tavueScreen === "orderHistory") {
        setSelectedId(state.tavueOrderId ?? null);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function replaceOrder(next: SavedOrder) {
    setOrders((current) => current.map((order) => (order.id === next.id ? next : order)));
  }

  const closeEditMode = () => {
    setEditMode(false);
    setSelectedOrderIds(new Set());
  };

  const toggleEditMode = () => {
    if (editMode) {
      closeEditMode();
    } else {
      setEditMode(true);
    }
  };

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrderIds((current) => {
      const next = new Set(current);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  async function removeOrders(orderIds: string[]) {
    if (orderIds.length === 0 || deleting) return;
    const confirmed = await confirmOrderDeletion({
      title: t("deleteHistoryTitle"),
      body: t("deleteHistoryBody"),
      cancelLabel: t("deleteHistoryCancel"),
      deleteLabel: t("deleteHistoryConfirm"),
    });
    if (!confirmed) return;

    setDeleting(true);
    try {
      const removed = await deleteOrders(orderIds);
      await Promise.all(
        removed.flatMap((order) =>
          order.lines.flatMap((line) =>
            line.contribution?.localUri
              ? [deleteContributionPhoto(line.contribution.localUri)]
              : []
          )
        )
      );
      const removedIds = new Set(removed.map((order) => order.id));
      setOrders((current) => current.filter((order) => !removedIds.has(order.id)));
      setSelectedOrderIds(new Set());
      setEditMode(false);
    } catch {
      Alert.alert(t("deleteHistoryFailedTitle"), t("deleteHistoryFailedBody"));
    } finally {
      setDeleting(false);
    }
  }

  async function saveRestaurantName() {
    if (!selected) return;
    const next = await updateRestaurant(selected.id, restaurantDraft);
    if (next) replaceOrder(next);
  }

  async function pickPhoto(line: SavedOrderLine, fromCamera: boolean) {
    if (!selected) return;
    if (
      !line.contribution &&
      contributionCount(selected) >= MAX_REWARDED_PHOTOS_PER_ORDER
    ) {
      Alert.alert(t("maxPhotosTitle"), t("maxPhotosBody"));
      return;
    }
    if (!selected.restaurant?.name?.trim() && !restaurantDraft.trim()) {
      Alert.alert(t("restaurantNeededTitle"), t("restaurantNeededBody"));
      return;
    }

    if (!selected.restaurant?.name?.trim() && restaurantDraft.trim()) {
      const updated = await updateRestaurant(selected.id, restaurantDraft);
      if (updated) replaceOrder(updated);
    }

    const permission =
      Platform.OS === "web"
        ? { granted: true }
        : fromCamera
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(t("permTitle"), fromCamera ? t("photoCameraPermission") : t("photoLibraryPermission"));
      return;
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
      selectionLimit: 1,
    };
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset) return;

    setSavingLineId(line.id);
    try {
      const photoId = `dish-${selected.id}-${line.id}-${Date.now().toString(36)}`;
      const localUri = await persistContributionPhoto(asset, photoId);
      const next = await saveContribution(selected.id, line.id, localUri);
      if (!next) throw new Error("contribution_not_saved");
      if (line.contribution?.localUri) {
        await deleteContributionPhoto(line.contribution.localUri);
      }
      replaceOrder(next);
      void track("dish_photo_saved", {
        source: fromCamera ? "camera" : "library",
        dishCount: 1,
      });
    } catch {
      Alert.alert(t("photoSaveFailedTitle"), t("photoSaveFailedBody"));
    } finally {
      setSavingLineId(null);
    }
  }

  async function removePhoto(line: SavedOrderLine) {
    if (!selected || !line.contribution) return;
    const next = await removeContribution(selected.id, line.id);
    await deleteContributionPhoto(line.contribution.localUri);
    if (next) replaceOrder(next);
  }

  const goBack = () => {
    if (selectedId) {
      if (
        Platform.OS === "web" &&
        typeof window !== "undefined" &&
        (window.history.state as { tavueOrderId?: string } | null)?.tavueOrderId
      ) {
        window.history.back();
        return;
      }
      setSelectedId(null);
      return;
    }
    onBack();
  };

  const openOrder = (orderId: string) => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.history.pushState(
        { tavueScreen: "orderHistory", tavueOrderId: orderId },
        "",
        window.location.href,
      );
    }
    setSelectedId(orderId);
  };

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
        {selected ? (
          <GlassSurface style={styles.backGlass} intensity={50}>
            <Pressable style={styles.backButton} onPress={goBack} hitSlop={10}>
              <Text style={styles.backArrow}>‹</Text>
            </Pressable>
          </GlassSurface>
        ) : null}
        <View style={[styles.headerCopy, !selected && styles.headerCopyRoot]}>
          <Text style={styles.eyebrow}>TAVUE · FOOD MEMORY</Text>
          <Text style={styles.title} numberOfLines={1}>
            {selected ? orderTitle(selected, t("menuFallback")) : t("orderHistoryTitle")}
          </Text>
        </View>
        {!selected && orders.length > 0 && (
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.editButton, pressed && styles.editButtonPressed]}
            onPress={toggleEditMode}
          >
            <Text style={styles.editButtonText}>
              {editMode ? t("historyDone") : t("historyEdit")}
            </Text>
          </Pressable>
        )}
      </View>

      {selected ? (
        <OrderDetail
          order={selected}
          insetsTop={insets.top}
          insetsBottom={insets.bottom}
          restaurantDraft={restaurantDraft}
          setRestaurantDraft={setRestaurantDraft}
          saveRestaurantName={saveRestaurantName}
          savingLineId={savingLineId}
          pickPhoto={pickPhoto}
          removePhoto={removePhoto}
        />
      ) : (
        <FlatList
          data={orders}
          extraData={{ editMode, selectedOrderIds }}
          keyExtractor={(order) => order.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContent,
            {
              paddingTop: insets.top + HEADER_HEIGHT + space(5),
              paddingBottom: insets.bottom + TAB_BAR_CONTENT_INSET,
            },
          ]}
          ListHeaderComponent={
            <View style={styles.rewardIntro}>
              <View style={styles.rewardMark}>
                <Text style={styles.rewardMarkText}>＋1</Text>
              </View>
              <View style={styles.rewardIntroCopy}>
                <Text style={styles.rewardTitle}>{t("photoRewardTitle")}</Text>
                <Text style={styles.rewardBody}>{t("photoRewardBody")}</Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={colors.accent} style={styles.loader} />
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyGlyph}>◎</Text>
                <Text style={styles.emptyTitle}>{t("orderHistoryEmptyTitle")}</Text>
                <Text style={styles.emptyBody}>{t("orderHistoryEmptyBody")}</Text>
              </View>
            )
          }
          renderItem={({ item }) => {
            const photos = contributionCount(item);
            const selectedForDeletion = selectedOrderIds.has(item.id);
            return (
              <SwipeableOrderRow
                deleteLabel={t("deleteHistoryConfirm")}
                editMode={editMode}
                selected={selectedForDeletion}
                onDelete={() => void removeOrders([item.id])}
                onOpen={() => openOrder(item.id)}
                onToggle={() => toggleOrderSelection(item.id)}
              >
                <View style={styles.orderCardTop}>
                  <View style={styles.orderIdentity}>
                    <Text style={styles.orderName} numberOfLines={1}>
                      {orderTitle(item, t("menuFallback"))}
                    </Text>
                    <Text style={styles.orderDate}>{formatOrderDate(item.createdAt)}</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </View>
                <View style={styles.orderMetaRow}>
                  <Text style={styles.orderMeta}>{itemCount(item)} {t("items")}</Text>
                  <Text style={styles.orderMeta}>
                    {photos > 0 ? `${photos} ${t("photosSaved")}` : t("photosToAdd")}
                  </Text>
                </View>
              </SwipeableOrderRow>
            );
          }}
        />
      )}
      {!selected && editMode && (
        <View
          pointerEvents="box-none"
          style={[styles.bulkDeletePositioner, { bottom: Math.max(insets.bottom, space(3)) }]}
        >
          <Pressable
            accessibilityRole="button"
            disabled={selectedOrderIds.size === 0 || deleting}
            style={({ pressed }) => [
              styles.bulkDeleteButton,
              selectedOrderIds.size === 0 && styles.bulkDeleteButtonDisabled,
              pressed && selectedOrderIds.size > 0 && styles.bulkDeleteButtonPressed,
            ]}
            onPress={() => void removeOrders([...selectedOrderIds])}
          >
            {deleting ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.bulkDeleteText}>
                {t("deleteSelected")} ({selectedOrderIds.size})
              </Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

function OrderDetail({
  order,
  insetsTop,
  insetsBottom,
  restaurantDraft,
  setRestaurantDraft,
  saveRestaurantName,
  savingLineId,
  pickPhoto,
  removePhoto,
}: {
  order: SavedOrder;
  insetsTop: number;
  insetsBottom: number;
  restaurantDraft: string;
  setRestaurantDraft: (value: string) => void;
  saveRestaurantName: () => Promise<void>;
  savingLineId: string | null;
  pickPhoto: (line: SavedOrderLine, fromCamera: boolean) => Promise<void>;
  removePhoto: (line: SavedOrderLine) => Promise<void>;
}) {
  const t = useT();
  const credits = potentialCredits(order);
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.detailContent,
        {
          paddingTop: insetsTop + HEADER_HEIGHT + space(5),
          paddingBottom: insetsBottom + space(10),
        },
      ]}
    >
      <View style={styles.detailMeta}>
        <Text style={styles.detailDate}>{formatOrderDate(order.createdAt)}</Text>
        <Text style={styles.detailCount}>{itemCount(order)} {t("items")}</Text>
      </View>

      <View style={styles.restaurantCard}>
        <Text style={styles.fieldLabel}>{t("restaurantNameLabel")}</Text>
        <Text style={styles.fieldHelp}>{t("restaurantNameHelp")}</Text>
        <View style={styles.restaurantRow}>
          <TextInput
            value={restaurantDraft}
            onChangeText={setRestaurantDraft}
            onSubmitEditing={() => void saveRestaurantName()}
            placeholder={t("restaurantNamePlaceholder")}
            placeholderTextColor={colors.mutedSoft}
            maxLength={120}
            style={styles.restaurantInput}
            returnKeyType="done"
          />
          <Pressable style={styles.restaurantSave} onPress={() => void saveRestaurantName()}>
            <Text style={styles.restaurantSaveText}>{t("saveWord")}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.privacyNote}>
        <Text style={styles.privacyGlyph}>✓</Text>
        <Text style={styles.privacyText}>{t("contributionPrivacy")}</Text>
      </View>

      <View style={styles.detailHeadingRow}>
        <View>
          <Text style={styles.detailEyebrow}>{t("orderedDishes")}</Text>
          <Text style={styles.detailHeading}>{t("addRealPhotos")}</Text>
        </View>
        {credits > 0 && (
          <View style={styles.creditPill}>
            <Text style={styles.creditPillText}>+{credits} {t("scansWord")}</Text>
          </View>
        )}
      </View>

      {order.lines.map((line) => {
        const contribution = line.contribution;
        const busy = savingLineId === line.id;
        return (
          <View key={line.id} style={styles.dishCard}>
            <View style={styles.dishHeader}>
              <View style={styles.qtyBadge}>
                <Text style={styles.qtyText}>{line.qty}×</Text>
              </View>
              <View style={styles.dishCopy}>
                <Text style={styles.dishOriginal} numberOfLines={2}>
                  {line.dish.original_name}
                </Text>
                <Text style={styles.dishTranslated} numberOfLines={2}>
                  {line.dish.translated_name}
                </Text>
              </View>
            </View>

            {contribution ? (
              <View>
                <ContributionImage uri={contribution.localUri} />
                <View style={styles.photoStatusRow}>
                  <View style={styles.savedDot} />
                  <View style={styles.photoStatusCopy}>
                    <Text style={styles.photoStatusTitle}>{t("photoSavedLocally")}</Text>
                    <Text style={styles.photoStatusBody}>{t("reviewNextBeta")}</Text>
                  </View>
                  <View style={styles.rewardBadge}>
                    <Text style={styles.rewardBadgeText}>+1</Text>
                  </View>
                </View>
                <View style={styles.photoActions}>
                  <Pressable style={styles.replaceButton} onPress={() => void pickPhoto(line, false)}>
                    <Text style={styles.replaceButtonText}>{t("replacePhoto")}</Text>
                  </Pressable>
                  <Pressable style={styles.removeButton} onPress={() => void removePhoto(line)}>
                    <Text style={styles.removeButtonText}>{t("removePhoto")}</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View>
                <View style={styles.photoPlaceholder}>
                  {busy ? (
                    <ActivityIndicator color={colors.accent} />
                  ) : (
                    <>
                      <Text style={styles.cameraGlyph}>⌁</Text>
                      <Text style={styles.photoPrompt}>{t("addDishPhoto")}</Text>
                      <Text style={styles.photoRewardHint}>{t("earnOneScan")}</Text>
                    </>
                  )}
                </View>
                <View style={styles.photoActions}>
                  <Pressable
                    style={styles.cameraButton}
                    disabled={busy}
                    onPress={() => void pickPhoto(line, true)}
                  >
                    <Text style={styles.cameraButtonText}>{t("takePhoto")}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.libraryButton}
                    disabled={busy}
                    onPress={() => void pickPhoto(line, false)}
                  >
                    <Text style={styles.libraryButtonText}>{t("choosePhoto")}</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
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
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space(4),
    paddingBottom: space(2),
  },
  backGlass: { width: 38, height: 38, borderRadius: 19 },
  backButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  backArrow: { fontFamily: fonts.body, fontSize: 29, lineHeight: 30, color: colors.text, marginTop: -2 },
  headerCopy: { flex: 1, paddingHorizontal: space(3) },
  headerCopyRoot: { paddingHorizontal: space(1) },
  eyebrow: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 1.2, color: colors.accent },
  title: { fontFamily: fonts.display, fontSize: 27, lineHeight: 29, color: colors.text },
  editButton: {
    minWidth: 52,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space(3),
    backgroundColor: "rgba(255,255,255,0.48)",
    borderWidth: 1,
    borderColor: colors.glassLine,
  },
  editButtonPressed: { opacity: 0.65, transform: [{ scale: 0.97 }] },
  editButtonText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 11,
    color: colors.primaryAction,
  },
  listContent: { paddingHorizontal: space(5), gap: space(3) },
  rewardIntro: {
    flexDirection: "row",
    gap: space(3),
    padding: space(4),
    marginBottom: space(2),
    borderRadius: radius.card,
    backgroundColor: colors.accentWash,
    borderWidth: 1,
    borderColor: "#F2D58B",
  },
  rewardMark: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.accentMuted, alignItems: "center", justifyContent: "center" },
  rewardMarkText: { fontFamily: fonts.bodyBold, color: colors.text, fontSize: 14 },
  rewardIntroCopy: { flex: 1 },
  rewardTitle: { fontFamily: fonts.bodyBold, color: colors.text, fontSize: 15 },
  rewardBody: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 2 },
  swipeShadow: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  swipeShell: {
    position: "relative",
    overflow: "hidden",
    borderRadius: radius.card,
    backgroundColor: colors.danger,
  },
  swipeDelete: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: SWIPE_ACTION_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space(2),
  },
  swipeDeleteText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.onAccent,
    textAlign: "center",
  },
  orderCard: {
    minHeight: 102,
    padding: space(4),
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
  },
  orderCardBody: { flex: 1, minWidth: 0 },
  selectionCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: space(3),
  },
  selectionCircleSelected: {
    backgroundColor: colors.primaryAction,
    borderColor: colors.primaryAction,
  },
  selectionCheck: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.onAccent,
  },
  cardPressed: { opacity: 0.72, transform: [{ scale: 0.992 }] },
  orderCardTop: { flexDirection: "row", alignItems: "center" },
  orderIdentity: { flex: 1, minWidth: 0 },
  orderName: { fontFamily: fonts.display, fontSize: 23, lineHeight: 25, color: colors.text },
  orderDate: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, marginTop: 2 },
  chevron: { fontFamily: fonts.body, fontSize: 26, color: colors.accent },
  orderMetaRow: { flexDirection: "row", gap: space(2), marginTop: space(3), paddingTop: space(3), borderTopWidth: 1, borderTopColor: colors.line },
  orderMeta: { fontFamily: fonts.mono, fontSize: 9, color: colors.muted, textTransform: "uppercase" },
  loader: { marginTop: space(10) },
  empty: { alignItems: "center", paddingHorizontal: space(7), paddingTop: space(12) },
  emptyGlyph: { fontFamily: fonts.display, fontSize: 44, color: colors.accent },
  emptyTitle: { fontFamily: fonts.display, fontSize: 26, color: colors.text, textAlign: "center" },
  emptyBody: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.muted, textAlign: "center", marginTop: space(2) },
  bulkDeletePositioner: {
    position: "absolute",
    left: space(5),
    right: space(5),
    zIndex: 85,
  },
  bulkDeleteButton: {
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space(5),
    ...shadow.glass,
  },
  bulkDeleteButtonDisabled: {
    backgroundColor: colors.mutedSoft,
    shadowOpacity: 0,
    elevation: 0,
  },
  bulkDeleteButtonPressed: { opacity: 0.8, transform: [{ scale: 0.985 }] },
  bulkDeleteText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.onAccent,
  },
  detailContent: { paddingHorizontal: space(5) },
  detailMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space(4) },
  detailDate: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  detailCount: { fontFamily: fonts.mono, fontSize: 9, color: colors.accentStrong, textTransform: "uppercase" },
  restaurantCard: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, padding: space(4) },
  fieldLabel: { fontFamily: fonts.bodyBold, color: colors.text, fontSize: 14 },
  fieldHelp: { fontFamily: fonts.body, color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  restaurantRow: { flexDirection: "row", gap: space(2), marginTop: space(3) },
  restaurantInput: { flex: 1, minWidth: 0, height: 44, borderRadius: radius.button, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.background, color: colors.text, fontFamily: fonts.body, paddingHorizontal: space(3), fontSize: 14 },
  restaurantSave: { minWidth: 70, height: 44, borderRadius: radius.button, backgroundColor: colors.text, alignItems: "center", justifyContent: "center", paddingHorizontal: space(3) },
  restaurantSaveText: { fontFamily: fonts.bodyBold, color: colors.onAccent, fontSize: 12 },
  privacyNote: { flexDirection: "row", alignItems: "flex-start", gap: space(2), marginTop: space(3), paddingHorizontal: space(2) },
  privacyGlyph: { fontFamily: fonts.bodyBold, color: colors.sage, fontSize: 13 },
  privacyText: { flex: 1, fontFamily: fonts.body, color: colors.muted, fontSize: 10, lineHeight: 15 },
  detailHeadingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: space(7), marginBottom: space(3) },
  detailEyebrow: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 1.2, color: colors.accentStrong },
  detailHeading: { fontFamily: fonts.display, fontSize: 25, color: colors.text },
  creditPill: { backgroundColor: colors.sageWash, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(1.5) },
  creditPillText: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.sage },
  dishCard: { ...shadow.card, backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, padding: space(4), marginBottom: space(3) },
  dishHeader: { flexDirection: "row", gap: space(3), alignItems: "flex-start" },
  qtyBadge: { minWidth: 36, height: 36, borderRadius: 18, backgroundColor: colors.accentWash, alignItems: "center", justifyContent: "center" },
  qtyText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.accentStrong },
  dishCopy: { flex: 1, minWidth: 0 },
  dishOriginal: { fontFamily: fonts.native, fontWeight: "600", fontSize: 16, lineHeight: 21, color: colors.text },
  dishTranslated: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 2 },
  photoPlaceholder: { height: 154, marginTop: space(4), borderRadius: radius.image, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.lineStrong, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  cameraGlyph: { fontFamily: fonts.display, fontSize: 32, color: colors.accent },
  photoPrompt: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.text },
  photoRewardHint: { fontFamily: fonts.body, fontSize: 10, color: colors.sage, marginTop: 2 },
  contributionImage: { width: "100%", height: 190, marginTop: space(4), borderRadius: radius.image, backgroundColor: colors.paperLine },
  contributionImageLoading: { alignItems: "center", justifyContent: "center" },
  photoStatusRow: { flexDirection: "row", alignItems: "center", marginTop: space(3), gap: space(2) },
  savedDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.sage },
  photoStatusCopy: { flex: 1 },
  photoStatusTitle: { fontFamily: fonts.bodySemibold, color: colors.text, fontSize: 11 },
  photoStatusBody: { fontFamily: fonts.body, color: colors.muted, fontSize: 9, marginTop: 1 },
  rewardBadge: { backgroundColor: colors.sageWash, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(1.5) },
  rewardBadgeText: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.sage },
  photoActions: { flexDirection: "row", gap: space(2), marginTop: space(3) },
  cameraButton: { flex: 1, minHeight: 42, borderRadius: radius.pill, backgroundColor: colors.primaryAction, alignItems: "center", justifyContent: "center" },
  cameraButtonText: { fontFamily: fonts.bodyBold, color: colors.onAccent, fontSize: 12 },
  libraryButton: { flex: 1, minHeight: 42, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.lineStrong, alignItems: "center", justifyContent: "center" },
  libraryButtonText: { fontFamily: fonts.bodySemibold, color: colors.text, fontSize: 12 },
  replaceButton: { flex: 1, minHeight: 38, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, alignItems: "center", justifyContent: "center" },
  replaceButtonText: { fontFamily: fonts.bodySemibold, color: colors.text, fontSize: 11 },
  removeButton: { minHeight: 38, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", paddingHorizontal: space(4) },
  removeButtonText: { fontFamily: fonts.body, color: colors.danger, fontSize: 11 },
});
