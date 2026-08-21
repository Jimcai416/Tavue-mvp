// Shared types — must stay in sync with worker/src/index.js JSON schema.

export type DishFlag =
  | "spicy"
  | "raw"
  | "offal"
  | "contains_nuts"
  | "contains_shellfish"
  | "contains_gluten"
  | "contains_dairy"
  | "vegetarian"
  | "vegan"
  | "house_special";

export interface Dish {
  category?: string | null;    // translated section heading used by the app
  original_category?: string | null; // section exactly as printed, for server handoff
  original_name: string;       // as printed on the menu, original script
  romanized: string | null;    // e.g. "wan tan lo mein"
  translated_name: string;     // target app language
  description: string;         // one plain sentence: what it actually is
  ingredients?: string[];      // optional for scans saved before v0.5.3
  price: string | null;        // as printed, e.g. "48"
  price_gbp?: string | null;   // legacy GBP conversion for older app versions
  converted_price?: string | null; // conversion in ScanResult.display_currency
  spice_level: 0 | 1 | 2 | 3;
  flags: DishFlag[];
  worth_it: string | null;     // one-line ordering advice
  image_url: string | null;    // resolved by the worker (cached lookup)
  image_query: string;         // fallback query if image_url is null
}

export interface ScanResult {
  cuisine: string;             // e.g. "Cantonese"
  currency: string | null;     // ISO code guessed from the menu, e.g. "HKD"
  display_currency?: string | null; // currency selected by the user
  menu_language: string;       // e.g. "Traditional Chinese"
  dishes: Dish[];
  page_count?: number;         // locally merged multi-page scan
}

export type Screen =
  | { name: "scan" }
  | { name: "results"; result: ScanResult }
  | { name: "orderHistory" }
  | { name: "profile" };
