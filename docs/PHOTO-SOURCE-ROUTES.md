# Real-photo source routes — checked 8 November 2026

Goal: accurate, useful real dish photographs with traceable commercial display
rights, visible attribution and a maintainable withdrawal process. A publicly
visible photograph, paid search access, an AI edit, or credit alone is not a
licence. Source terms and the rights in the individual photograph are separate.

## What exists already

`master` still returns Brave-first/Google-fallback URLs. PR 26 is unmerged and
already contains 48 starter photos, client attribution UI, a reviewed D1/R2
catalogue, matching guards, release checks and 8,030 **pending-review** Commons
records. Those records already include CC BY and CC BY-SA. Allowing attribution
is useful but does not itself expand that existing checkpoint.

The saved checkpoint is category-skewed: Desserts 1,152; Salads 742; Chicken
dishes 652; Chocolate cakes 521; Cakes 519; Pasta dishes 477; Decorated cakes
450; Pastries 437. Those are discovery categories, not verified recipes.
The new audit searches specific dishes instead of counting broad categories.

## Route decisions

| Route | What was tested/checked | Role and remaining constraint |
|---|---|---|
| Commons dish-name search | Live benchmark; author, licence, source hash, dimensions and preview retained | Best immediately testable route into our private reviewed catalogue. Per-file rights, exact dish identity and photo quality still require review. |
| Wikidata P18 → Commons | Live benchmark with entity label/description retained | Another discovery route for established dishes. P18 and search ranking are not food/identity verification; false entities must be rejected. |
| Openverse | Live endpoint probe; denial stops further requests | Broader CC discovery, but the current environment returns HTTP 403. This is an access failure, not proof of poor coverage. Verify each original source's licence; higher API access may require registration/approval. |
| TheMealDB | Live documented development API against named dishes | Potential low-cost supplement. Public app-store use requires supporter access. Verify artwork provenance/credit; do not infer a full licence from a yes/no flag. Not integrated into the Commons-only publisher. |
| Pexels | Current API documentation and October 2026 terms checked; no local key | Useful on-demand photographic supplement, subject to actual recipe coverage. API attribution required. Systematic/bulk copying needs express permission; do not silently build a 10,000-image dataset from it. |
| Unsplash | Current API terms/guidelines checked; no local key | Hotlinked provider URLs, photographer/Unsplash links and required download-event tracking. Separate delivery adapter needed; cannot copy API photos into R2 as though they were Commons assets. |
| Flickr directly | Current API terms checked; no commercial key | Individual CC BY/SA photos can permit commercial use, but commercial API access requires an appropriate arrangement. Do not confuse the two permissions. Commons/Openverse discovery of such photos is not a blanket waiver of original-source terms. |
| Google Places Photos | Official API docs and policies checked; no local Maps key or selected restaurant fixture | Legitimate route for photos of a selected restaurant, including user-contributed photos. Display required Google/author/source links, obey caching/derived-content restrictions, and verify exact dish association. Not a universal dish-photo export feed. |
| Tripadvisor Content API / Terra | Official product, photo docs and terms checked; no account/key | Another restaurant/location-photo route. Contract, display and caching restrictions apply; do not scrape review pages or mix content in ways the contract forbids. Exact menu-item matching remains unproved. |
| FatSecret Premier Free | Preserve the previous 60-item experiment; no new local credentials | Existing account access does not need to be re-applied for. Previous 46/60 image availability was not photo accuracy/quality. Fetch current allowed data per contract; do not turn responses into a permanent independent image library. Re-run the diagnostics branch when credentials are available. |
| Edamam | Official recipe documentation checked; no local credentials | Web-recipe search is not ownership of the underlying recipes/images. Fully licensed content is a separate arrangement. Requires explicit confirmation that the proposed isolated dish-photo use and storage are covered. |
| Spoonacular | Official April 2026 terms checked; no local key | API terms allow use in an app and require original-source credit. Terms allow indefinite storage of recipe ID/title/image URL, not arbitrary metadata or image binaries. No implied non-infringement guarantee. Needs source/photograph rights assessment and a different live delivery design. |
| Foodiesfeed | Official licence/terms checked | Potential manually curated supplement; commercial use allowed under its stated licence. Includes AI-generated images, so real-photo provenance must be checked. No bulk feed is assumed; do not overload/scrape the service or redistribute its library. |
| Restaurant / photographer contribution | Existing app contribution draft flow inspected | Strong long-term route when the actual rights holder grants app display/storage/cropping rights. Current contribution drafts are device-local; account, upload, consent receipt, moderation, reporting and withdrawal backend are still required. Uploading a photo copied from a review is insufficient. |
| Generic Brave / Google Images / review-page scraping | Existing implementation inspected; official rights guidance checked | Useful for finding a rights holder or an explicitly licensed source, not automatic permission to display arbitrary results. No production fallback, no AI laundering. |
| Shutterstock | Prior commercial quote already ruled out for this bootstrap budget | No new purchase/negotiation or live API test. Not the source of the current Brave/Google problem. |

No account was created, no paid plan purchased, no photographer contacted, no
paid vision batch submitted and no production deployment performed during this
audit. Key-dependent sources are **not live-tested** merely because their
documentation is accessible. The JSON summary records missing environment
variable names, never values.

## Practical implementation boundary

The checked-in catalogue and app already support attribution for approved
Commons photos. The new benchmark exports eligible Commons discoveries directly
to the existing human-review DB and release input format. It deliberately does
not relax approval gates or make arbitrary results visible to customers.

Maintain two delivery models if later tests justify them:

1. A private, source-verified catalogue for media whose terms permit storage.
2. Provider-hosted or restaurant-specific photos rendered under that provider's
   contract, attribution and cache rules.

These are architectural options, not two implemented production sources.
They must not share a generic "download everything to R2" importer. General
representative photos must not be labelled as the scanned restaurant's actual
dish, and a photo at a restaurant is not proof that it depicts a particular
menu line. Regional/protein/vegan substitutions remain explicit matching holds.

AI may assist ranking or evaluating actual image quality, but cannot establish
copyright, source authenticity, or exact recipe identity from appearance alone.
The current benchmark is free API/metadata research, without AI image editing.

## Inspectable official references

- [Commons reuse and per-file verification](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia)
- [Openverse API and rate/access limits](https://api.openverse.org/v1/)
- [Openverse original-licence verification warning](https://docs.openverse.org/api/reference/made_with_ov.html)
- [TheMealDB terms](https://www.themealdb.com/terms_of_use.php) and [development/publication keys](https://www.themealdb.com/api.php)
- [Pexels API guidelines](https://www.pexels.com/api/documentation/) and [current terms](https://www.pexels.com/terms-of-service/)
- [Unsplash API terms](https://unsplash.com/api-terms) and [API guidelines](https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines)
- [Flickr API commercial use and photo-owner rights](https://www.flickr.com/help/terms/api)
- [Places Photos](https://developers.google.com/maps/documentation/places/web-service/place-photos) and [policies](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Tripadvisor photo endpoint](https://developer-tripadvisor.com/partner/json-api/documentation/partner/json-api/documentation/location-photos/index.html), [API terms](https://tripadvisor-content-api.readme.io/reference/api-master-terms-new), [current packages](https://docs.terra.tripadvisor.com/docs/overview)
- [FatSecret editions](https://platform.fatsecret.com/api-editions) and [storable fields](https://platform.fatsecret.com/docs/guides/storable-data)
- [Edamam web recipes versus fully licensed content](https://developer.edamam.com/edamam-docs-recipe-api)
- [Spoonacular API terms](https://spoonacular.com/food-api/terms)
- [Foodiesfeed licence](https://www.foodiesfeed.com/license) and [terms](https://www.foodiesfeed.com/terms)
- [Google Images usage-right verification](https://support.google.com/websearch/answer/29508?hl=en-GB)
- [Brave third-party rights](https://brave.com/search/api/)

Accessed on 8 November 2026; account-specific signed terms can differ. The route
table records implementation constraints, not a legal certification of any
individual image. See the dated benchmark snapshot for actual API outcomes.
