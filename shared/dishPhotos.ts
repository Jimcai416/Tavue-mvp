import { dishPhotoCatalog, type DishPhoto } from './dishPhotoCatalog';

export type PhotoDish = {
  original_name?: string | null;
  translated_name?: string | null;
  romanized?: string | null;
  image_query?: string | null;
  image_dish_name?: string | null;
  image_id?: string | null;
  flags?: string[];
};

export function normalizeDishName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const byAlias = new Map<string, DishPhoto>();
for (const photo of dishPhotoCatalog) {
  if (!photo.approved) continue;
  for (const alias of [photo.name, ...photo.aliases]) {
    const key = normalizeDishName(alias);
    if (byAlias.has(key) && byAlias.get(key)?.id !== photo.id) {
      throw new Error(`Ambiguous dish photo alias: ${alias}`);
    }
    byAlias.set(key, photo);
  }
}

// Only use these reviewed equivalences on the printed menu title. The target
// names already exist in the bundled catalogue and in catalogue lookup indexes.
const MENU_EQUIVALENTS = new Map([
  // Las Bravas calls its single-sauce dish "Patatas con salsa Las Bravas".
  ['Patatas con salsa Las Bravas', 'Patatas Bravas'],
  ['Patatas con salsa brava', 'Patatas Bravas'],
  ['Pincho moruno', 'Pinchos Morunos'],
  // The sampled Roman menu specifies rice, tomato and mozzarella in this supplì.
  ['Supplì alla romana', 'Supplì al telefono'],
  ['Trippa romana', 'Trippa alla Romana'],
  // The source onion-soup photo shows the browned topping. The tartiflette
  // source names Reblochon and Savoy. "Maison" alone specifies no preparation.
  ["Soupe à l’oignon gratinée", "Soupe à l’oignon"],
  ['Tartiflette au reblochon de Savoie', 'Tartiflette'],
  ['Tartare de bœuf maison', 'Steak Tartare'],
].map(([menuName, catalogueName]) => [normalizeDishName(menuName), normalizeDishName(catalogueName)]));

const COUNTABLE_MENU_NAMES = new Set([
  'Escargots de Bourgogne', 'Supplì alla romana', 'Supplì al telefono',
  'Pimientos de Padrón', 'Boquerones Fritos', 'Boquerones en vinagre',
  'Pincho moruno', 'Pinchos Morunos',
].map(normalizeDishName));
const MENU_TITLE_REQUIRED = new Set([...MENU_EQUIVALENTS.values(), ...COUNTABLE_MENU_NAMES]);

function printedMenuKeys(value: unknown): string[] {
  if (typeof value !== 'string' || value.length > 240) return [];
  const original = normalizeDishName(value);
  const keys = original ? [original] : [];
  const withoutCount = value.trim()
    .replace(/^[1-9]\d?(?:\s*[x×]\s+|\s+)/iu, '')
    .replace(/\s*\([1-9]\d?\s*(?:uds?\.?|unidades?|pz\.?|pezzi|pi[eè]ces?)\)\s*$/iu, '');
  const dish = normalizeDishName(withoutCount);
  if (dish !== original && COUNTABLE_MENU_NAMES.has(dish)) keys.push(dish);
  for (const key of [...keys]) {
    const equivalent = MENU_EQUIVALENTS.get(key);
    if (equivalent) keys.push(equivalent);
  }
  return keys;
}

// Do not let an AI-simplified name strip a meaningful variant from a menu.
// Exact identity is necessary, but is not proof of the restaurant's plating.
const VARIANTS = /\b(vegan|vegetarian|plant based|meatless|mock|deconstructed|fusion|style|inspired|substitute|without|no cheese|gluten free)\b|素食|纯素|純素|ヴィーガン|비건/i;
const PROTEINS: Record<string, RegExp> = {
  chicken: /\b(chicken|poulet|pollo)\b|鸡|雞|鶏/iu,
  beef: /\b(beef|boeuf|bœuf|wagyu)\b|牛肉/iu,
  pork: /\b(pork|porc|bacon|pancetta|guanciale|ham)\b|猪肉|豬肉|豚/iu,
  duck: /\b(duck|canard)\b|鸭|鴨/iu,
  lamb: /\b(lamb|mutton|agneau)\b|羊肉/iu,
  seafood: /\b(shrimp|prawn|seafood|lobster|crab|salmon|tuna|fish|cod|eel)\b|虾|蝦|鱼|魚|蟹/iu,
};

export function photoIdentityNames(dish: PhotoDish): string[] {
  const hints = [dish.translated_name, dish.romanized, dish.image_dish_name, dish.image_query]
    .filter((name): name is string => typeof name === 'string' && name.length <= 240)
    .map(normalizeDishName).filter(Boolean);
  return [...new Set([...printedMenuKeys(dish.original_name), ...hints])];
}

export function resolveFromPhotos<T extends Pick<DishPhoto, 'name' | 'aliases' | 'proteins' | 'approved'> & {requiresExactMenuName?: boolean}>(
  dish: PhotoDish | null | undefined, photos: T[],
): T | null {
  if (!dish) return null;
  const original = [dish.original_name, dish.translated_name, dish.romanized, dish.image_query].filter(Boolean).join(' ');
  // "Style" may itself be part of a reviewed source's exact menu label.
  // All other disallowed substitutions remain blocked; style-qualified queries
  // can only resolve a reviewed canonical label which retains that qualifier.
  if (VARIANTS.test(original.replace(/\bstyle\b/gi, ''))) return null;
  const styleQualified = /\bstyle\b/i.test(original);
  for (const name of photoIdentityNames(dish)) {
    const photo = photos.find(p => p.approved && [p.name, ...p.aliases].some(a => normalizeDishName(a) === name));
    if (!photo) continue;
    if (styleQualified && (!photo.requiresExactMenuName || !/\bstyle\b/i.test(photo.name))) continue;
    const aliases = [photo.name, ...photo.aliases].map(normalizeDishName);
    if (photo.requiresExactMenuName || aliases.some(alias => MENU_TITLE_REQUIRED.has(alias))) {
      // Newly reviewed variants and curated equivalents require print evidence.
      // An image hint can drop a topping, cooking method, or regional qualifier.
      const originalName = dish.original_name || '';
      const menuKeys = printedMenuKeys(originalName);
      if (!/[A-Za-z]/.test(originalName)) {
        menuKeys.push(normalizeDishName(dish.translated_name), normalizeDishName(dish.romanized));
      }
      if (!menuKeys.some(key => aliases.includes(key))) continue;
      // These additions have no independently verified vegetarian classification.
      if (photo.requiresExactMenuName && dish.flags?.includes('vegetarian')) continue;
    }
    if (dish.flags?.includes('vegan')) continue;
    if (dish.flags?.includes('vegetarian') && photo.proteins.length > 0) continue;
    if (Object.entries(PROTEINS).some(([protein, pattern]) => pattern.test(original) && !photo.proteins.includes(protein))) continue;
    return photo;
  }
  return null;
}

export function resolveDishPhoto(dish: PhotoDish | null | undefined): DishPhoto | null {
  if (!dish) return null;
  const photos = [...new Set(photoIdentityNames(dish).map(n => byAlias.get(n)).filter((p): p is DishPhoto => !!p))];
  return resolveFromPhotos(dish, photos);
}

export function attachDishPhoto<T extends PhotoDish>(dish: T) {
  const photo = resolveDishPhoto(dish);
  return { ...dish, image_id: photo?.id ?? null, image_source: photo ? 'commons' : null, image_url: null, reference_photo: null };
}
