# Reviewed dish photographs

The 48 manually reviewed reference photographs (about 8.7 MiB) are a pilot, not the launch catalogue. The user’s launch target is at least 10,000 approved photographs. See [the scalable collection and release workflow](../catalog/README.md). Open `docs/photo-review.html` after cloning this branch to inspect every photo at full size and follow its photographer/source/licence links. No image API key is required.

## Why this change

The FatSecret OAuth 2.0 controls passed, but the user's 60-dish benchmark counted any returned image, not a correct, attractive dish photograph. The supplied screenshots show ingredient and preparation mismatches. Authentication changes cannot fix that quality problem. This implementation removes live arbitrary image-search results from the app.

## Runtime behaviour

- `shared/dishPhotoCatalog.ts` is the reviewed identity and attribution catalogue; `src/lib/dishPhotoAssets.ts` maps it to bundled static assets.
- `shared/dishPhotos.ts` matches complete normalized aliases. It does not select by a shared word such as “pasta” or “duck”. It rejects detected protein conflicts and explicit dietary/preparation variants; these rules are conservative, not a universal semantic validator.
- The menu parser can propose an exact canonical `image_dish_name`; the Worker then checks the indexed cloud catalogue without embedding its entire contents in the prompt. This is still model-assisted identification and must be checked on real multilingual menus. A plausible canonical name is not proof of what a restaurant serves.
- Old saved scans resolve through their original/translated/romanized names or exact legacy English identity. Arbitrary `image_url` and unverified `image_id` fields are never rendered. Worker resume results are sanitized too.
- Unmatched dishes use the existing letter placeholder. Translation, descriptions and ordering still work. This release does not promise a photo for every dish.
- Credit opens a complete uncropped photograph, author, title, source and licence. Exported OrderSheet pictures include full credit text and links in the captured area. Source links open externally only when tapped.
- Pictures are representative of a recipe, not restaurant-specific portions, ingredients or plating. They are not evidence for dietary/allergen decisions.

## Photo review and additions

Photographs retain their individual licences; see `assets/dishes/CREDITS.md`. Commons is the hosting source, not the photographer. We store original source links, attribution, licence URLs, source hashes and local asset hashes. Previews crop to their frames; bundled files are resized Commons thumbnails without further edits.

For each addition, check the full photo and source description for the exact dish and preparation; verify photographer and reusable licence; reject unclear provenance, incompatible restrictions, visible watermarks, weak quality and lookalike recipes. Add the asset, catalogue entry, static require and credit together. Only add unambiguous aliases. Review phone-sized crops and the full image. Keep all derivative-photo licensing and credit with the photo.

Rejected examples include water-boiled beef returned for water-boiled fish, Yanguan jar pork described as merely similar to Dongpo pork, unspecified biryani for chicken biryani, and lamb rendang for beef rendang. Several benchmark dishes remain without an approved photo. The 48-photo catalogue is not a measured real-menu coverage or accuracy rate.

For expansion, curate high-frequency missing dishes using the same process. Existing v0.9.0 user photo contributions remain private local drafts; they are not silently promoted to shared catalogue content. Generated references should be a separate, explicitly labelled future collection with recipe and visual review, not an automatic fallback in this release.

## Validation and rollout

Run from the project root:

```sh
npm ci
npm run test:photos
npx tsc --noEmit
npm run export:web
```

Automated checks cover matching and rejection, attribution and asset hashes, fresh mocked Worker scans, old scan-cache migration and the absence of any image-provider requests. Web export includes all 48 photos. No production credentials were available for a live OCR scan. The cloud browser blocked local preview, so device interaction is not yet visually verified.

Before rollout, open the gallery; then open an old saved menu and a newly scanned menu on iOS/Android and a narrow web viewport. Check that matched photos load, unknown/modified dishes remain placeholders, credits open and close, full photos are uncropped, source/licence links work and exported orders retain attribution. Check real French, Italian and Chinese menu names against their photos.

Ship the updated client before or together with the Worker: old clients expect `image_url` and will show placeholders when the new Worker returns null. Existing Anthropic credentials remain necessary for menu extraction; FatSecret, Brave and Google image-search credentials are unnecessary for this photo pipeline. Native release and production Worker deployment remain separate from opening the review PR.
