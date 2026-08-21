import { Platform } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";
import type { ImagePickerAsset } from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";

const PHOTO_DIRECTORY = "tavue-contributions";
const WEB_DB_NAME = "tavue-contribution-photos";
const WEB_STORE_NAME = "photos";
const WEB_URI_PREFIX = "tavue-photo://";

function openWebPhotoDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WEB_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(WEB_STORE_NAME)) {
        request.result.createObjectStore(WEB_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("photo_database_failed"));
  });
}

async function writeWebPhoto(key: string, base64: string): Promise<void> {
  const database = await openWebPhotoDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(WEB_STORE_NAME, "readwrite");
    transaction.objectStore(WEB_STORE_NAME).put(base64, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("photo_write_failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("photo_write_aborted"));
  });
  database.close();
}

async function readWebPhoto(key: string): Promise<string> {
  const database = await openWebPhotoDatabase();
  const base64 = await new Promise<string>((resolve, reject) => {
    const request = database
      .transaction(WEB_STORE_NAME, "readonly")
      .objectStore(WEB_STORE_NAME)
      .get(key);
    request.onsuccess = () =>
      typeof request.result === "string"
        ? resolve(request.result)
        : reject(new Error("photo_not_found"));
    request.onerror = () => reject(request.error ?? new Error("photo_read_failed"));
  });
  database.close();
  return base64;
}

async function deleteWebPhoto(key: string): Promise<void> {
  const database = await openWebPhotoDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(WEB_STORE_NAME, "readwrite");
    transaction.objectStore(WEB_STORE_NAME).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("photo_delete_failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("photo_delete_aborted"));
  });
  database.close();
}

function resizeAction(width: number, height: number, maxEdge: number) {
  const longestEdge = Math.max(width, height);
  if (longestEdge <= maxEdge) return [];
  const scale = maxEdge / longestEdge;
  return [
    {
      resize: {
        width: Math.round(width * scale),
        height: Math.round(height * scale),
      },
    },
  ];
}

export async function persistContributionPhoto(
  asset: ImagePickerAsset,
  contributionId: string
): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    asset.uri,
    resizeAction(
      Math.max(1, asset.width || 1),
      Math.max(1, asset.height || 1),
      Platform.OS === "web" ? 1024 : 1440
    ),
    {
      base64: Platform.OS === "web",
      compress: Platform.OS === "web" ? 0.68 : 0.76,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  if (Platform.OS === "web") {
    if (!result.base64) throw new Error("photo_encode_failed");
    await writeWebPhoto(contributionId, result.base64);
    return `${WEB_URI_PREFIX}${contributionId}`;
  }

  if (!FileSystem.documentDirectory) throw new Error("photo_storage_unavailable");
  const directory = `${FileSystem.documentDirectory}${PHOTO_DIRECTORY}/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const destination = `${directory}${contributionId}.jpg`;
  await FileSystem.copyAsync({ from: result.uri, to: destination });
  return destination;
}

export async function deleteContributionPhoto(uri: string): Promise<void> {
  if (Platform.OS === "web") {
    if (uri.startsWith(WEB_URI_PREFIX)) {
      await deleteWebPhoto(uri.slice(WEB_URI_PREFIX.length)).catch(() => {});
    }
    return;
  }
  if (!uri.startsWith("file:")) return;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

export async function resolveContributionPhotoUri(uri: string): Promise<string> {
  if (Platform.OS !== "web" || !uri.startsWith(WEB_URI_PREFIX)) return uri;
  const base64 = await readWebPhoto(uri.slice(WEB_URI_PREFIX.length));
  return `data:image/jpeg;base64,${base64}`;
}
