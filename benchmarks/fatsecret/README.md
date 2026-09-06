# FatSecret image benchmark

This experiment measures whether FatSecret Premier Free can provide useful representative images for Tavue's international menu use case before any production integration is attempted.

## What it tests

- International generic dishes across Europe and Asia
- Search hit rate
- Image availability
- All ten requested generic candidates returned by `foods.search.v5`
- Difficult restaurant-style menu descriptions as well as canonical dish names

The generated HTML report is for visual review because image correctness matters more than raw search coverage.

## Setup

Create `.env.local` in the repository root:

```bash
FATSECRET_CLIENT_ID=your_client_id
FATSECRET_CLIENT_SECRET=your_client_secret
```

Do not prefix the secret with `EXPO_PUBLIC_` and do not commit `.env.local`.

OAuth 2.0 token requests are restricted to IP ranges configured for the app. To
run the benchmark with OAuth 1.0 instead, create separate OAuth 1.0 credentials
in FatSecret and use:

```bash
FATSECRET_OAUTH_VERSION=1
FATSECRET_CONSUMER_KEY=your_consumer_key
FATSECRET_CONSUMER_SECRET=your_consumer_secret
```

OAuth 2.0 remains the default. OAuth 1.0 credentials are not interchangeable
with the OAuth 2.0 Client ID and Client Secret.

## Run

```bash
npm run benchmark:fatsecret
```

To use a different dataset:

```bash
npm run benchmark:fatsecret -- path/to/dishes.json
```

The script authenticates with OAuth 2.0 client credentials (default) or a
signed OAuth 1.0 request, then calls
`https://platform.fatsecret.com/rest/foods/search/v5` with
`food_type=generic` and `include_food_images=true`.

## Results

Generated files are written to `benchmarks/fatsecret/results/` and are intentionally gitignored:

- `results.json` — complete machine-readable API output after normalization
- `results.csv` — compact sheet with empty columns for manual accuracy scoring and notes
- `review.html` — visual contact sheet showing up to ten candidates for every test dish

Suggested manual score:

- `0` = wrong/misleading
- `1` = weak resemblance; not safe as a Tavue primary image
- `2` = good representative image
- `3` = exact/strong representative image

For a production decision, judge **Good + Exact** coverage, not merely `has_image` coverage.

## Diagnose zero results first

```bash
npm run diagnose:fatsecret
```

Uses the existing `.env.local` credentials (Node 18+). Three controls compare
search without images, search with images, and the documented Chicken Breast
food ID 1641 via food.get.v4. US is the default dataset; no localization scope
is requested. A fresh OAuth 2 token requests `premier` on every run.

The previous benchmark ignored JSON `{error: ...}` envelopes on HTTP 200,
so API rejections could be reported as zero candidates and zero images. It
also counted images only in the first five of ten returned foods. Both are
fixed. Unexpected response shapes are now errors rather than silent misses.

`results/diagnostics.json` contains counts, operation names, and safe error
codes, with no tokens, credentials, upstream error bodies, or photo URLs.
Share that file to diagnose account access. Each request times out after 15s.
Exit 0 means the image controls passed; exit 2 means they did not; exit 1
indicates setup/authentication failure. Full benchmark runs stop before scoring
coverage if these controls fail, and return nonzero when any dish request fails.

- Error 14: check premier scope/access on this exact credential pair.
- Error 21: check IP whitelist on this exact application.
- Controls work but have no images: have support check the separate image
  entitlement. This is an indication to investigate, not proof of the cause.
- Images work: run the full benchmark, then manually judge photo relevance.
  Finding a photo does not establish that it depicts the correct dish.

Regression tests (no credentials, no external requests): `npm run test:fatsecret`.

## Launch implications

This branch is a diagnostic experiment. It does not integrate or deploy a
production image provider. Main's existing Brave/Google image resolver does
not establish reuse rights merely by returning a URL or excluding stock sites.

Before integrating FatSecret, verify image entitlement and representative-dish
coverage on the live account, include mandatory attribution, and confirm the
permitted Tavue use and launch territories under the account terms. Keep the
client secret server-side. Do not copy the old resolver's 90-day URL cache or
persist FatSecret photo URLs indefinitely in app history: the API documentation
lists only food_id and serving_id as storable search-result values. Design
history around IDs and fresh lookups unless the provider grants other rights.

Official references:
- https://platform.fatsecret.com/docs/guides/error-codes
- https://platform.fatsecret.com/docs/v5/foods.search
- https://platform.fatsecret.com/docs/v4/food.get
- https://platform.fatsecret.com/docs/guides/storable-data
