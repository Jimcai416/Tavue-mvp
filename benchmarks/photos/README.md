# Dish-first source investigation

The live application on `master` still uses arbitrary Brave/Google image
results. This work is based on the existing, unmerged catalogue branch / PR 26.
It does not deploy, merge unrelated app changes, or approve new photographs.

The test set has the previous FatSecret benchmark's 60 items, 40 additional
named dishes, and four controls. It is a diagnostic sample, not a random sample
of real customer menus or proof of 10,000-photo coverage. Some of the first
60 dishes already have starter photos. Report the 100 positive items separately
from the four controls. A search result for an emperor or a vegan variant is
useful evidence of false-match risk, not food coverage.

```sh
python scripts/photos/source_audit.py \
  --out catalog/work/source-audit-2026-11-08 \
  --export-commons-db catalog/work/dish-first.sqlite
```

This runs Commons full-text search, Wikidata P18 discovery, TheMealDB development
API, and an Openverse probe against the same test set. A source returning
401/403/429 is stopped, rather than counted as zero coverage or bypassed. Three
concurrent requests at most. Results are journalled after each query. Re-run
the identical command to resume. Failed individual requests remain in the
journal for inspection; use a new output directory for an intentional retry.
Do not run two processes against the same output directory.

The manifest locks input dishes, providers and result depth. Output contains:

- `results.jsonl`: source evidence and per-dish outcomes; no approvals.
- `summary.json`: API outcomes, positive/control candidate counts and cuisine
  breakdown. A candidate count is not an identity or quality pass rate.
- `review.html`: source-linked uncropped candidate previews. Opening it contacts
  the image hosts. This is an inspection sheet, not a release approval tool.
- `commons-candidates.jsonl.gz`: unique Commons records for the existing review
  and release workflow. Wikidata photos are deduplicated with Commons by ID.
- Optional SQLite export: only Commons records, always `pending_review`.

Control-query images remain inspectable in raw results/the research gallery,
but are excluded from both the Commons release-input export and review DB.

P18 only means that Wikidata associates a file with an entity. An emperor or
building can have P18 too. Search ranking does not prove exact dish identity.
For Commons, the existing metadata filter requires an allowed licence,
attribution, a supported bitmap and adequate dimensions. It cannot establish
photographic authenticity, authorship or appetising composition.

TheMealDB is tested with its documented development key. The returned artwork
is held for paid publication access and source/credit verification. A
`strCreativeCommons` flag is preserved, not treated as a complete licence grant.
No meal data is automatically ingested into the Commons-only release pipeline.
No subscription or new account is created by this experiment.

After actual review of identity, quality, provenance and photographic content:

```sh
python scripts/photos/review.py --db catalog/work/dish-first.sqlite \
  --out catalog/work/dish-first-review
# Export explicit decisions from the review UI, then:
python scripts/photos/prepare_release.py \
  --candidates catalog/work/source-audit-2026-11-08/commons-candidates.jsonl.gz \
  --decisions photo-decisions.json --out catalog/work/release-v2
python scripts/photos/check_release.py catalog/work/release-v2
```

The existing 10,000 distinct approved-photo gate remains. Source-hash,
licence/author revalidation, variant checks, private delivery and visible client
credits remain in force. Raw search output never becomes a production fallback.

See [the route audit](../../docs/PHOTO-SOURCE-ROUTES.md) for sources requiring
credentials, commercial arrangements, or restaurant-specific presentation.

## Explicit query retries and visual observations

The baseline uses the fixed query in `dishes.json`, without unrecorded query
rewriting. The two supplemental fixtures are deliberately separate experiments:

```sh
python scripts/photos/source_audit.py --sources commons_photos \
  --dishes benchmarks/photos/query-retries.json --workers 1 \
  --out catalog/work/source-query-retries-2026-11-08
python scripts/photos/source_audit.py --sources themealdb \
  --dishes benchmarks/photos/mealdb-aliases.json --workers 1 \
  --out catalog/work/mealdb-aliases-2026-11-08
```

`commons_photos` adds the documented CirrusSearch `filetype:bitmap` restriction.
The native Chinese query recovers five eggplant candidates. The Thai and composed
sea-bass queries still have no eligible candidates. This does not make the
baseline 100/100, nor establish the eggplant photos' exact identity or quality.

TheMealDB's shorter queries recover `Spaghetti alla Carbonara` and other records,
but `Biryani` returns **Lamb Biryani** for a **Chicken Biryani** test item. Never
convert a broader query into an implicit alias or discard the requested protein.

`visual-observations.json` records inspection of actual previews for the first
24 extended dishes with candidates, choosing the first eligible result each
time. This is a non-random diagnostic sample. Eleven were visually promising
enough to investigate, five might benefit from an actual reviewed crop, and
eight were visually rejected. The promising group includes an item whose
highly styled appearance needs an authenticity check. No identity, provenance
or release approval is granted by these observations.

The original source titles reveal why metadata filtering alone is inadequate:
`Haemul-pajeon making.jpg` is an unfinished cooking-process photo, and the
Japchae preview has a visible date/time stamp. A valid commercial CC licence
does not make either of these a suitable final dish reference.

## Portable previews

If external images do not display in the review viewer, generate a self-contained
page with `review.py --embed-previews`. This explicitly downloads Wikimedia bitmap
previews into the HTML; source and licence links remain available. Use `--limit 12`
for a small initial batch. The default still uses online images. Download failures
appear on the card and in `preview-status.json`, and block approval on that card.
This option does not approve candidates or change source hashes. Keep exported
decisions separately before closing the page.
