import { attachDishPhoto, photoIdentityNames, resolveFromPhotos } from '../../shared/dishPhotos.ts';
import { validReferencePhoto } from '../../shared/referencePhoto.ts';

export async function attachCataloguePhotos(dishes, env) {
  const clean = dishes.map(attachDishPhoto);
  if (!env.PHOTO_CATALOG || !env.PHOTO_BUCKET) return clean;
  try {
    const names = [...new Set(dishes.flatMap(photoIdentityNames))];
    const photos = new Map();
    // D1 supports 100 bound parameters/query. Bound chunks also keep scans with
    // 160 dishes below the free plan's 50-query invocation limit.
    for (let i = 0; i < names.length; i += 80) {
      const batch = names.slice(i, i + 80);
      const { results } = await env.PHOTO_CATALOG.prepare(`
        SELECT p.metadata_json FROM photo_aliases a
        JOIN photo_dishes d ON d.id = a.dish_id
        JOIN approved_photos p ON p.id = d.primary_photo_id AND p.dish_id = d.id
        WHERE a.alias IN (${batch.map(() => '?').join(',')}) AND p.status = 'approved'
      `).bind(...batch).all();
      for (const row of results) {
        const p = JSON.parse(row.metadata_json);
        if (validReferencePhoto(p)) photos.set(p.id, p);
      }
    }
    return dishes.map((dish, i) => {
      const photo = resolveFromPhotos(dish, [...photos.values()]);
      return photo ? {...clean[i], image_id: photo.id, image_source: 'commons', reference_photo: photo} : clean[i];
    });
  } catch {
    // A catalogue outage must not discard a successfully translated menu.
    console.warn(JSON.stringify({type:'photo_catalog_unavailable'}));
    return clean;
  }
}

export async function serveCataloguePhoto(request, env) {
  const path = new URL(request.url).pathname;
  const match = path.match(/^\/photos\/([a-z0-9-]{1,100})\/([a-f0-9]{64})\.(jpg|png|webp)$/);
  const headers = {'Access-Control-Allow-Origin':'*', 'X-Content-Type-Options':'nosniff'};
  if (!match || !env.PHOTO_CATALOG || !env.PHOTO_BUCKET) return new Response(null,{status:404,headers});
  const row = await env.PHOTO_CATALOG.prepare("SELECT r2_key,content_type,metadata_json FROM approved_photos WHERE id=? AND sha256=? AND status='approved' LIMIT 1").bind(match[1],match[2]).first();
  if (!row || !validReferencePhoto(JSON.parse(row.metadata_json))) return new Response(null,{status:404,headers});
  const photo = JSON.parse(row.metadata_json);
  if (photo.deliveryPath !== path || !['image/jpeg','image/png','image/webp'].includes(row.content_type)) return new Response(null,{status:404,headers});
  const object = await env.PHOTO_BUCKET.get(row.r2_key);
  if (!object) return new Response(null,{status:404,headers});
  // A short cache permits withdrawal; never cache an unapproved arbitrary URL.
  const responseHeaders = {...headers, 'Content-Type':row.content_type, 'Cache-Control':'public, max-age=300', ETag:`"${match[2]}"`};
  if (request.headers.get('If-None-Match') === responseHeaders.ETag) return new Response(null,{status:304,headers:responseHeaders});
  return new Response(request.method === 'HEAD' ? null : object.body,{headers:responseHeaders});
}
