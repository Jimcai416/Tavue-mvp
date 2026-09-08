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
  return [dish.original_name, dish.translated_name, dish.romanized, dish.image_dish_name, dish.image_query]
    .filter((name): name is string => typeof name === 'string' && name.length <= 240)
    .map(normalizeDishName).filter(Boolean);
}

export function resolveFromPhotos<T extends Pick<DishPhoto, 'name' | 'aliases' | 'proteins' | 'approved'>>(
  dish: PhotoDish | null | undefined, photos: T[],
): T | null {
  if (!dish) return null;
  const original = [dish.original_name, dish.translated_name, dish.romanized, dish.image_query].filter(Boolean).join(' ');
  if (VARIANTS.test(original)) return null;
  for (const name of photoIdentityNames(dish)) {
    const photo = photos.find(p => p.approved && [p.name, ...p.aliases].some(a => normalizeDishName(a) === name));
    if (!photo) continue;
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
