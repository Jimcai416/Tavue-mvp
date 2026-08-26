# FatSecret image benchmark

This experiment measures whether FatSecret Premier Free can provide useful representative images for Tavue's international menu use case before any production integration is attempted.

## What it tests

- International generic dishes across Europe and Asia
- Search hit rate
- Image availability
- Top five generic candidates returned by `foods.search.v5`
- Difficult restaurant-style menu descriptions as well as canonical dish names

The generated HTML report is for visual review because image correctness matters more than raw search coverage.

## Setup

Create `.env.local` in the repository root:

```bash
FATSECRET_CLIENT_ID=your_client_id
FATSECRET_CLIENT_SECRET=your_client_secret
```

Do not prefix the secret with `EXPO_PUBLIC_` and do not commit `.env.local`.

## Run

```bash
npm run benchmark:fatsecret
```

To use a different dataset:

```bash
npm run benchmark:fatsecret -- path/to/dishes.json
```

The script requests an OAuth 2.0 client-credentials token with the `premier` scope, then calls `https://platform.fatsecret.com/rest/foods/search/v5` with `food_type=generic` and `include_food_images=true`.

## Results

Generated files are written to `benchmarks/fatsecret/results/` and are intentionally gitignored:

- `results.json` — complete machine-readable API output after normalization
- `results.csv` — compact sheet with empty columns for manual accuracy scoring and notes
- `review.html` — visual contact sheet showing up to five candidates for every test dish

Suggested manual score:

- `0` = wrong/misleading
- `1` = weak resemblance; not safe as a Tavue primary image
- `2` = good representative image
- `3` = exact/strong representative image

For a production decision, judge **Good + Exact** coverage, not merely `has_image` coverage.
