import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { ScanResult } from "../types";
import { CurrencyCode } from "./currency";
import { getClientId } from "./identity";
import { saveScan } from "./history";
import { API_CLIENT_HEADER } from "../config";

// Set this to your deployed Cloudflare Worker URL after `wrangler deploy`,
// e.g. "https://dishlens-api.<your-subdomain>.workers.dev"
export const API_URL = "https://dishlens-api.jimcai416.workers.dev";

const QUEUE_KEY = "tavue.scanQueue.v1";
const QUEUE_DIRECTORY = "tavue-scan-queue";
const RETRY_INTERVAL_MS = 15_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

export class ScanError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "ScanError";
  }
}

export type ScanPage = {
  base64: string;
  mediaType: string;
};

type QueuedScanPage = {
  uri: string;
  mediaType: string;
};

type QueuedScanJob = {
  id: string;
  sessionId: string;
  createdAt: string;
  targetLanguage: string;
  targetCurrency: CurrencyCode;
  pages: QueuedScanPage[];
  attemptCount: number;
  nextAttemptAt: number;
};

const activeJobs = new Set<string>();
let drainInFlight = false;

function createSessionId(): string {
  return `scan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function getQueue(): Promise<QueuedScanJob[]> {
  if (Platform.OS === "web") return [];
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const parsed = raw ? (JSON.parse(raw) as QueuedScanJob[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getPendingScanCount(): Promise<number> {
  return (await getQueue()).length;
}

export async function getPendingScanStatus(): Promise<{
  count: number;
  processing: boolean;
}> {
  const queue = await getQueue();
  return {
    count: queue.length,
    processing: queue.some((job) => activeJobs.has(job.id)),
  };
}

async function setQueue(queue: QueuedScanJob[]): Promise<void> {
  if (Platform.OS === "web") return;
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function updateQueuedJob(
  jobId: string,
  update: (job: QueuedScanJob) => QueuedScanJob
): Promise<void> {
  const queue = await getQueue();
  const index = queue.findIndex((job) => job.id === jobId);
  if (index < 0) return;
  queue[index] = update(queue[index]);
  await setQueue(queue);
}

async function removeQueuedJob(jobId: string): Promise<void> {
  if (Platform.OS === "web") return;
  const queue = await getQueue();
  const job = queue.find((item) => item.id === jobId);
  await setQueue(queue.filter((item) => item.id !== jobId));
  if (!job) return;
  await Promise.all(
    job.pages.map((page) => FileSystem.deleteAsync(page.uri, { idempotent: true }).catch(() => {}))
  );
}

async function persistQueuedScan(
  pages: ScanPage[],
  targetLanguage: string,
  targetCurrency: CurrencyCode,
  sessionId: string
): Promise<QueuedScanJob | null> {
  if (Platform.OS === "web" || !FileSystem.documentDirectory) return null;

  const directory = `${FileSystem.documentDirectory}${QUEUE_DIRECTORY}/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const jobId = sessionId;
  const persistedPages: QueuedScanPage[] = [];

  try {
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      const uri = `${directory}${jobId}-${index}.jpg`;
      await FileSystem.writeAsStringAsync(uri, page.base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      persistedPages.push({ uri, mediaType: page.mediaType });
    }

    const job: QueuedScanJob = {
      id: jobId,
      sessionId,
      createdAt: new Date().toISOString(),
      targetLanguage,
      targetCurrency,
      pages: persistedPages,
      attemptCount: 0,
      nextAttemptAt: Date.now(),
    };
    const queue = await getQueue();
    await setQueue([...queue.filter((item) => item.id !== jobId), job]);
    return job;
  } catch (error) {
    await Promise.all(
      persistedPages.map((page) =>
        FileSystem.deleteAsync(page.uri, { idempotent: true }).catch(() => {})
      )
    );
    throw error;
  }
}

async function readQueuedPages(job: QueuedScanJob): Promise<ScanPage[]> {
  return Promise.all(
    job.pages.map(async (page) => ({
      base64: await FileSystem.readAsStringAsync(page.uri, {
        encoding: FileSystem.EncodingType.Base64,
      }),
      mediaType: page.mediaType,
    }))
  );
}

function retryDelay(attemptCount: number): number {
  const exponential = 5_000 * Math.pow(2, Math.min(attemptCount, 6));
  return Math.min(exponential, MAX_RETRY_DELAY_MS);
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof ScanError)) return true;
  if (error.code === "burst_limit") return true;
  return typeof error.status === "number" && error.status >= 500;
}

async function requestScan(
  pages: ScanPage[],
  targetLanguage: string,
  targetCurrency: CurrencyCode,
  scanSessionId: string,
  signal?: AbortSignal
): Promise<ScanResult> {
  const clientId = await getClientId();
  const request: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [API_CLIENT_HEADER]: clientId,
    },
    signal,
    body: JSON.stringify({
      images: pages,
      targetLanguage,
      targetCurrency,
      scanSessionId,
    }),
  };

  let res: Response;
  try {
    res = await fetch(`${API_URL}/scan`, request);
  } catch (error: any) {
    if (error?.name === "AbortError" || signal?.aborted) throw error;
    // A weak connection can drop after the Worker already accepted the scan.
    // Retrying the same idempotent session recovers the completed result without
    // consuming another scan.
    await new Promise((resolve) => setTimeout(resolve, 800));
    res = await fetch(`${API_URL}/scan`, request);
  }

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as
      | { error?: string; code?: string }
      | null;
    const code = payload?.code || `http_${res.status}`;
    const message =
      res.status === 429
        ? code === "burst_limit"
          ? "Too many scans at once. Wait a minute and try again."
          : "You've reached today's scan limit. Please try again tomorrow."
        : payload?.error ||
          "We couldn't read this menu. Keep one page in frame, remove dark borders, and try again.";
    throw new ScanError(message, code, res.status);
  }

  const data = (await res.json()) as ScanResult;
  if (!data || !Array.isArray(data.dishes)) {
    throw new ScanError(
      "We couldn't read this menu. Keep one page in frame, remove dark borders, and try again.",
      "invalid_scan_response"
    );
  }
  return data;
}

async function processQueuedJob(
  job: QueuedScanJob,
  saveCompletedResult: boolean
): Promise<ScanResult> {
  activeJobs.add(job.id);
  try {
    const pages = await readQueuedPages(job);
    const result = await requestScan(
      pages,
      job.targetLanguage,
      job.targetCurrency,
      job.sessionId
    );
    if (saveCompletedResult) {
      await saveScan(result, job.targetLanguage);
    }
    await removeQueuedJob(job.id);
    return result;
  } catch (error) {
    if (isRetryable(error)) {
      await updateQueuedJob(job.id, (current) => {
        const attemptCount = current.attemptCount + 1;
        return {
          ...current,
          attemptCount,
          nextAttemptAt: Date.now() + retryDelay(attemptCount),
        };
      });
    } else {
      await removeQueuedJob(job.id);
    }
    throw error;
  } finally {
    activeJobs.delete(job.id);
  }
}

async function drainQueuedScans(): Promise<void> {
  if (Platform.OS === "web" || drainInFlight) return;
  drainInFlight = true;
  try {
    const queue = await getQueue();
    const now = Date.now();
    for (const job of queue) {
      if (activeJobs.has(job.id) || job.nextAttemptAt > now) continue;
      await processQueuedJob(job, true).catch(() => {});
    }
  } finally {
    drainInFlight = false;
  }
}

export async function retryPendingScans(): Promise<void> {
  if (Platform.OS === "web") return;
  const queue = await getQueue();
  await setQueue(queue.map((job) => ({ ...job, nextAttemptAt: 0 })));
  await drainQueuedScans();
}

if (Platform.OS !== "web") {
  // Timers pause naturally when React Native is suspended. On foreground/resume
  // they continue, so queued scans recover without requiring a network library.
  setTimeout(() => void drainQueuedScans(), 1_500);
  setInterval(() => void drainQueuedScans(), RETRY_INTERVAL_MS);
}

export async function scanMenuPages(
  pages: ScanPage[],
  targetLanguage: string = "English",
  targetCurrency: CurrencyCode = "GBP",
  signal?: AbortSignal
): Promise<ScanResult> {
  if (!pages.length || pages.length > 8) {
    throw new ScanError("Choose between one and eight menu pages.", "invalid_page_count");
  }

  const scanSessionId = createSessionId();

  // Web keeps its fast, ephemeral flow. Native first writes the compressed menu
  // pages to durable app storage, then uploads them. A dropped connection can
  // therefore never force the diner to take the same menu photos again.
  if (Platform.OS === "web") {
    return requestScan(pages, targetLanguage, targetCurrency, scanSessionId, signal);
  }

  const job = await persistQueuedScan(
    pages,
    targetLanguage,
    targetCurrency,
    scanSessionId
  );

  if (!job) {
    return requestScan(pages, targetLanguage, targetCurrency, scanSessionId, signal);
  }

  activeJobs.add(job.id);
  try {
    const result = await requestScan(
      pages,
      targetLanguage,
      targetCurrency,
      scanSessionId,
      signal
    );
    await removeQueuedJob(job.id);
    return result;
  } catch (error: any) {
    if (error?.name === "AbortError" || signal?.aborted) {
      // Cancel means the user intentionally stopped this foreground scan. Do not
      // resurrect it later from the retry queue.
      await removeQueuedJob(job.id);
      throw error;
    }

    if (isRetryable(error)) {
      await updateQueuedJob(job.id, (current) => ({
        ...current,
        attemptCount: 1,
        nextAttemptAt: Date.now() + retryDelay(1),
      }));

      // This is a successful local save, not a user-facing scan failure. The
      // Home pending-menu card owns the weak-network status and retry action.
      const queued = new Error("Menu saved. Waiting for connection.");
      queued.name = "AbortError";
      throw queued;
    }

    await removeQueuedJob(job.id);
    throw error;
  } finally {
    activeJobs.delete(job.id);
  }
}