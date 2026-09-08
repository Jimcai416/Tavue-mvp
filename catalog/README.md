# Tavue photograph catalogue

Target: at least **10,000 distinct approved photographs**, with distinct named dishes and per-cuisine coverage reported separately. The 48-photo starter is a quality and integration pilot, not the launch collection. API hits, licence-eligible candidates, downloaded files, approved photographs and covered recipes are different counts.

The repository contains:

- `pilot-reviewed.json`: the 48 visually reviewed source photographs and attribution.
- `candidates.jsonl.gz`: the collected Commons metadata that passed mechanical filters; every record is still `pending_review`.
- `collection-status.json`: actual counts and timestamp of the saved collection checkpoint.
- `collection.sqlite.gz`: resumable discovery queue and metadata. The collector restores it when no local working database exists.
- `schema.sql`: the cloud catalogue schema. Candidate records are never imported directly into the public tables.

## Collect and resume

Use Python 3.10+; collection/preparation uses its standard library. From the repository root:

```sh
python scripts/photos/collect.py --target 30000
python scripts/photos/collect.py --stats
```

The target is a count of metadata-eligible candidates, not a promise of 30,000 good photographs. Increase discovery until enough exact recipes and approved photos survive review. Collection uses a resumable category queue, pagination, three concurrent read requests at most, `maxlag`, retry/backoff and source hashes. It filters unsupported formats, missing attribution, unapproved licences, small images, extreme aspect ratios and obviously irrelevant contexts. Category labels are discovery hints, never automatically published dish names. Exact source-hash duplicates are removed; near-duplicate compositions still need review.

To stop cleanly, create `catalog/work/candidates.sqlite.stop`; the next completed request batch checkpoints the database and exports the metadata. Delete that file to resume. Ctrl-C also checkpoints when delivered normally. Do not start two collectors against the same database.

## Batch vision screening

Prepare a bounded pilot before spending on the full collection:

```sh
python scripts/photos/triage.py prepare --limit 100 --out catalog/work/vision-001.json
python scripts/photos/triage.py submit catalog/work/vision-001.json --max-requests 100
python scripts/photos/triage.py collect catalog/work/vision-001.job.json
```

Submission requires `ANTHROPIC_API_KEY` in the process environment or the ignored root `.env.local` file. Credentials are never written into request files. The CLI uses the existing Haiku model by default; pass `--model` to prepare a different model for comparative screening. Each batch has a caller-specified request cap; submitting the same saved job twice is refused. On an ambiguous network failure, inspect the provider console before retrying. Batches can take up to 24 hours; collection checks once and returns. The command does not keep silently polling or incur generation costs.

Screening checks the actual photograph against source evidence and proposes an exact recipe, cuisine, preparation/protein tags and quality concerns. Model output remains a suggestion. A shortlisting score is not a calibrated probability and cannot establish authorship or authenticity. Calibrate on the 100-photo pilot, inspect false accepts and false rejects, and review uncertain identities/variants. Do not use the model to grant image rights. Keep a separate comparison/audit set as the collection grows.

## Record review decisions

```sh
python scripts/photos/review.py
```

Open `catalog/work/review/index.html` locally. Pages contain 40 candidates each, uncropped previews, provenance links and explicit identity/quality/licensing/photograph checks. Export the decisions to JSON; browser storage is just a working convenience. Preserve exact recipe names and regional/protein variants. Mark unclear identities as rejected or leave them pending. Model batch results can guide the order of review, but are not accepted as review decisions by the publisher.

Review decisions are reproducible input data: photo ID, source hash, reviewer, review time, exact dish, aliases, protein tags and the four checks. A changed source hash invalidates a decision. Every published image must have an accepted decision; the public service has no auto-approve endpoint.

## Build a release

```sh
python scripts/photos/prepare_release.py --decisions photo-decisions.json --out catalog/work/release-v1
python scripts/photos/check_release.py catalog/work/release-v1
```

The default preparation gate is 10,000 approved source-distinct photos. Final release validation also requires at least 10,000 distinct downloaded asset hashes. It checks the SQL catalogue against the actual assets, rejects conflicting aliases and verifies primary-image references. Preparation rechecks current Commons source hash, photographer and licence before downloading accepted assets. Its output directory must be new so an incomplete release cannot be mistaken for an earlier good release. A hash-checked local asset cache avoids redownloading unchanged files when retrying preparation into a new release directory. Keep source records, decisions and release outputs together.

For integration tests only:

```sh
python scripts/photos/prepare_release.py --pilot --out catalog/work/pilot-test
```

This sets `launchReady:false`; the launch validator rejects it. A synthetic 10,000-row test database also never contributes to real inventory counts.

## Serve and deploy

The existing Worker gains two optional bindings: `PHOTO_CATALOG` (D1) and `PHOTO_BUCKET` (private R2). Binding examples are in `worker/wrangler.toml`; the combined deployment uses the `d1_databases` and `r2_buckets` arrays in root `wrangler.jsonc`. The web-only Worker needs no photo bindings. Create a fresh database per release, import `schema.sql` plus the generated data, and bind the tested release to the Worker. The release SQL is for a fresh database, not a destructive in-place replacement. Retain the previous binding/config for rollback.

1. Validate the completed release locally.
2. Configure an R2 remote using Cloudflare's [rclone instructions](https://developers.cloudflare.com/r2/examples/rclone/).
3. Upload `release-v1/objects/` to the private bucket, preserving its `photos/<id>/<hash>.<ext>` paths. For example: `rclone copy catalog/work/release-v1/objects r2:tavue-approved-photos --checksum`.
4. Import `release-v1/import.sql` into the new D1 database with Wrangler, and bind that database plus the bucket to the Worker.
5. Deploy the updated client before or with the Worker, then check real scans and device layouts.

The Worker performs indexed, bound-parameter lookups in groups of 80 names. Its model prompt has constant size; adding photos does not enlarge the prompt or the app binary. A photo is served only if the requested ID and content hash correspond to an approved database row. Set a row to `withdrawn` to remove it from matching/delivery; the response cache can retain a previous image for up to five minutes. Keep the R2 bucket private, otherwise a public bucket URL could bypass the withdrawal check. Catalogue failures preserve menu translation and fall back to the small bundled starter set.

The app builds image URLs from its own API origin and a validated delivery path, with attribution from the same approved record. It never renders old arbitrary `image_url` values. New saved scans retain cloud reference metadata. Old saved scans without that metadata can still use starter aliases; they are not silently resubmitted to an external image search.

## Economics and source limits

At an assumed 200 KB per image, 10,000 delivery images occupy about 2 GB; originals, multiple sizes and backups add to that. [R2 Standard](https://developers.cloudflare.com/r2/pricing/) currently includes 10 GB-month storage, with operation limits and separate Worker/D1 costs. Storage is not the main quality bottleneck.

For budgeting only, if a vision review uses 2,000 input tokens and 600 output tokens, 10,000 Haiku 4.5 batch reviews would be about $25 at the [published batch rates](https://platform.claude.com/docs/en/about-claude/pricing). Actual image/token counts, retries, additional models and follow-up reviews change that cost. This estimate is not the cost of acquiring 10,000 approved photos, generating 10,000 pictures, or operating the app.

Sources checked on 2026-09-07:

- [Commons reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia): per-file licences and attribution need checking.
- [Wikimedia API limits](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits): respect rate limits, at most three concurrent requests and Retry-After.
- [Flickr API](https://www.flickr.com/services/api/): commercial API use requires prior arrangement; it is not assumed to be an unrestricted free bulk feed.
- [Openverse](https://docs.openverse.org/api/reference/made_with_ov.html): an additional discovery source, not a guarantee of accurate licence metadata. Its API also has access limits.
- [Anthropic batch processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing): discounted asynchronous vision processing; no paid jobs have been submitted from this environment.

Commons remains a candidate source, not a demonstrated supply of 10,000 launch-quality recipe photos. If exact-recipe or visual retention is too low, the remaining gap requires another licensed source, commissioned/user-contributed photography, or a separately labelled, quality-controlled generated collection. Bulk counts alone do not resolve that gap.

Additional alternatives checked: [Unsplash API images must remain hotlinked](https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines), so they cannot be silently imported into this R2 collection. [Edamam](https://developer.edamam.com/edamam-docs-recipe-api) distinguishes indexed web recipes from fully licensed content; its search size is not a licence for our own bulk image library. [TheMealDB](https://www.themealdb.com/terms_of_use.php) permits API content use but requires paid access for app-store publishing; it is a potential supplementary source rather than a verified 10,000-image solution.
