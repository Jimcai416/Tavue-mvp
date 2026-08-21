import { ScanResult } from "../types";
import { CurrencyCode } from "./currency";
import { getClientId } from "./identity";
import { API_CLIENT_HEADER } from "../config";

// Set this to your deployed Cloudflare Worker URL after `wrangler deploy`,
// e.g. "https://dishlens-api.<your-subdomain>.workers.dev"
export const API_URL = "https://dishlens-api.jimcai416.workers.dev";

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

export async function scanMenuPages(
  pages: ScanPage[],
  targetLanguage: string = "English",
  targetCurrency: CurrencyCode = "GBP",
  signal?: AbortSignal,
): Promise<ScanResult> {
  if (!pages.length || pages.length > 8) {
    throw new ScanError("Choose between one and eight menu pages.", "invalid_page_count");
  }
  const clientId = await getClientId();
  const scanSessionId = `scan-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
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
    // iOS can suspend a foreground fetch while Tavue is in the background.
    // Retrying the same idempotent session on resume recovers a completed
    // Worker result without consuming another scan.
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
