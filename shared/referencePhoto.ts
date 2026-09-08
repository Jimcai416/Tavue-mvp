import type { DishPhoto } from './dishPhotoCatalog';
import { resolveFromPhotos, type PhotoDish } from './dishPhotos';
export type ReferencePhoto = Pick<DishPhoto, 'id' | 'name' | 'aliases' | 'proteins' | 'approved' | 'kind' | 'title' | 'author' | 'license' | 'licenseUrl' | 'sourceUrl' | 'reviewedAt'> & {
  deliveryPath: string;
};
// The app builds the image URL from its own API origin; source metadata cannot
// redirect image delivery to an arbitrary third-party host.
export function validReferencePhoto(value: unknown): value is ReferencePhoto {
  if (!value || typeof value !== 'object') return false;
  const p = value as ReferencePhoto;
  return p.approved === true && p.kind === 'photograph'
    && ['id','name','title','author','license','licenseUrl','sourceUrl','reviewedAt','deliveryPath'].every(k => typeof (p as any)[k] === 'string' && (p as any)[k].length > 0 && (p as any)[k].length < 3000)
    && /^[a-z0-9-]{1,100}$/.test(p.id)
    && new RegExp(`^/photos/${p.id}/[a-f0-9]{64}\\.(jpg|png|webp)$`).test(p.deliveryPath)
    && /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(p.sourceUrl)
    && /^https:\/\/creativecommons\.org\/(licenses|publicdomain)\//.test(p.licenseUrl)
    && (/^CC BY(?:-SA)? (1\.0|2\.0|2\.5|3\.0|4\.0)$/.test(p.license) || ['CC0','Public domain'].includes(p.license))
    && [p.aliases,p.proteins].every(a => Array.isArray(a) && a.length <= 100 && a.every(v => typeof v === 'string' && v.length <= 240));
}
export function resolveReferencePhoto(dish: PhotoDish & {reference_photo?: unknown}): ReferencePhoto | null {
  return validReferencePhoto(dish.reference_photo) ? resolveFromPhotos(dish, [dish.reference_photo]) : null;
}
