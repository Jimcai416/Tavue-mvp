import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { Dish, ScanResult } from "../types";

const ORDERS_KEY = "tavue.orders.v1";
const MAX_SAVED_ORDERS = Platform.OS === "web" ? 10 : 250;
export const MAX_REWARDED_PHOTOS_PER_ORDER = 5;

export type ContributionStatus =
  | "saved_local"
  | "queued"
  | "uploading"
  | "under_review"
  | "approved"
  | "rejected";

export type RewardStatus = "pending" | "granted" | "revoked";

export interface RestaurantIdentity {
  name: string;
  address: string | null;
  placeId: string | null;
}

export interface ContributionReward {
  credits: number;
  status: RewardStatus;
  ledgerEntryId: string | null;
  grantedAt: string | null;
}

export interface DishContribution {
  id: string;
  localUri: string;
  createdAt: string;
  status: ContributionStatus;
  remoteId: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
  reward: ContributionReward;
}

export interface SavedOrderLine {
  id: string;
  dish: Dish;
  qty: number;
  contribution: DishContribution | null;
}

export interface SavedOrder {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  lastShownAt: string;
  cuisine: string;
  menuLanguage: string;
  currency: string | null;
  displayCurrency: string | null;
  restaurant: RestaurantIdentity | null;
  lines: SavedOrderLine[];
}

type CartLine = { dish: Dish; qty: number };

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function lineIdentity(dish: Dish): string {
  return [dish.category, dish.original_name, dish.price]
    .filter(Boolean)
    .join("::")
    .toLowerCase();
}

function isSavedOrder(value: unknown): value is SavedOrder {
  const order = value as Partial<SavedOrder> | null;
  return !!order && order.schemaVersion === 1 && typeof order.id === "string" && Array.isArray(order.lines);
}

export async function getOrders(): Promise<SavedOrder[]> {
  try {
    const raw = await AsyncStorage.getItem(ORDERS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter(isSavedOrder) : [];
  } catch {
    return [];
  }
}

async function writeOrders(orders: SavedOrder[]): Promise<void> {
  await AsyncStorage.setItem(
    ORDERS_KEY,
    JSON.stringify(orders.slice(0, MAX_SAVED_ORDERS))
  );
}

export async function saveOrderFromCart({
  existingOrderId,
  result,
  lines,
}: {
  existingOrderId?: string | null;
  result: ScanResult;
  lines: CartLine[];
}): Promise<SavedOrder> {
  const orders = await getOrders();
  const existingIndex = existingOrderId
    ? orders.findIndex((order) => order.id === existingOrderId)
    : -1;
  const existing = existingIndex >= 0 ? orders[existingIndex] : null;
  const now = new Date().toISOString();

  const nextLines = lines.map((line) => {
    const identity = lineIdentity(line.dish);
    const previous = existing?.lines.find(
      (savedLine) => lineIdentity(savedLine.dish) === identity
    );
    return {
      id: previous?.id ?? makeId("dish"),
      dish: line.dish,
      qty: line.qty,
      contribution: previous?.contribution ?? null,
    };
  });

  const order: SavedOrder = {
    schemaVersion: 1,
    id: existing?.id ?? makeId("order"),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastShownAt: now,
    cuisine: result.cuisine,
    menuLanguage: result.menu_language,
    currency: result.currency,
    displayCurrency: result.display_currency ?? null,
    restaurant: existing?.restaurant ?? null,
    lines: nextLines,
  };

  if (existingIndex >= 0) orders.splice(existingIndex, 1);
  orders.unshift(order);
  await writeOrders(orders);
  return order;
}

export async function updateRestaurant(
  orderId: string,
  name: string
): Promise<SavedOrder | null> {
  const orders = await getOrders();
  const index = orders.findIndex((order) => order.id === orderId);
  if (index < 0) return null;

  const trimmed = name.trim().slice(0, 120);
  const next: SavedOrder = {
    ...orders[index],
    updatedAt: new Date().toISOString(),
    restaurant: trimmed
      ? {
          name: trimmed,
          address: orders[index].restaurant?.address ?? null,
          placeId: orders[index].restaurant?.placeId ?? null,
        }
      : null,
  };
  orders[index] = next;
  await writeOrders(orders);
  return next;
}

export async function saveContribution(
  orderId: string,
  lineId: string,
  localUri: string
): Promise<SavedOrder | null> {
  const orders = await getOrders();
  const orderIndex = orders.findIndex((order) => order.id === orderId);
  if (orderIndex < 0) return null;

  const now = new Date().toISOString();
  const existingRewardedPhotos = orders[orderIndex].lines.filter(
    (line) => line.id !== lineId && (line.contribution?.reward.credits ?? 0) > 0
  ).length;
  const rewardCredits =
    existingRewardedPhotos < MAX_REWARDED_PHOTOS_PER_ORDER ? 1 : 0;
  let changed = false;
  const lines = orders[orderIndex].lines.map((line) => {
    if (line.id !== lineId) return line;
    changed = true;
    return {
      ...line,
      contribution: {
        id: makeId("photo"),
        localUri,
        createdAt: now,
        status: "saved_local" as const,
        remoteId: null,
        submittedAt: null,
        reviewedAt: null,
        reviewReason: null,
        reward: {
          credits: rewardCredits,
          status: "pending" as const,
          ledgerEntryId: null,
          grantedAt: null,
        },
      },
    };
  });
  if (!changed) return null;

  const next: SavedOrder = {
    ...orders[orderIndex],
    updatedAt: now,
    lines,
  };
  orders[orderIndex] = next;
  await writeOrders(orders);
  return next;
}

export async function removeContribution(
  orderId: string,
  lineId: string
): Promise<SavedOrder | null> {
  const orders = await getOrders();
  const orderIndex = orders.findIndex((order) => order.id === orderId);
  if (orderIndex < 0) return null;

  const next: SavedOrder = {
    ...orders[orderIndex],
    updatedAt: new Date().toISOString(),
    lines: orders[orderIndex].lines.map((line) =>
      line.id === lineId ? { ...line, contribution: null } : line
    ),
  };
  orders[orderIndex] = next;
  await writeOrders(orders);
  return next;
}

export function contributionCount(order: SavedOrder): number {
  return order.lines.filter((line) => !!line.contribution).length;
}

export function potentialCredits(order: SavedOrder): number {
  return Math.min(
    MAX_REWARDED_PHOTOS_PER_ORDER,
    order.lines.reduce(
      (total, line) => total + (line.contribution?.reward.credits ?? 0),
      0
    )
  );
}
