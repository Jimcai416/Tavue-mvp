# Tavue photograph catalogue

Target: at least **10,000 distinct approved photographs**, with distinct named dishes and per-cuisine coverage reported separately. The 48-photo starter is a quality and integration pilot, not the launch collection. API hits, licence-eligible candidates, downloaded files, approved photographs and covered recipes are different counts.

Current test branch inventory (17 November 2026): **1,734 bundled reviewed photos** (408 before this crop review + 1,326 additions). The [latest review record](review-runs/2026-11-17/crop-continuous-review/README.md) exhausts all 3,697 frozen crop candidates: 1,326 accepted and 2,371 held with individual reasons. The earlier 1,054-row identity review is also complete and remains a separate historical record. Other screening categories and future collection are separate. The unchanged 10,000-photo launch gate is still 8,266 photos away; production has not been deployed.

## Claude automatic collection and intake

On 17 November the user explicitly authorized Claude API to find and review
photos automatically for efficiency. The active route is now
`.github/workflows/auto-photos.yml` and `scripts/photos/auto_photos.py`, driven by
`auto-photo-request.json`. The legacy manual/suggestion-only commands below
remain available; their manual-review requirement is not applied to this
separately authorized automatic route.

Claude plans specific dish searches; the collector executes Commons searches
with at most three source requests in parallel. Existing discovery IDs and
earlier review decisions are excluded before paid photo review. Six concurrent
Claude Haiku 4.5 Messages requests review full photographs, actual 124×96
centre-cover thumbnails and source evidence together. This avoids waiting for
each discounted Message Batch to finish before submitting the next one.

Automatic intake requires a complete positive model judgement, full/phone
observations, all visual dimensions at least 4/5, no unresolved uncertainty,
an exact source-supported dish name, explicit protein evidence, unchanged live
source/author/licence metadata, an allowlisted licence, unique source/name, and
passing app matching/hash regressions. Complex custom credit requests are held.
Model scores alone do not approve photos or grant image rights. Intake decisions
identify the Claude model, policy, provider response and usage; they never claim
human review. No broad aliases or dietary/allergen guarantees are added.

The initial continuous run has a **$15 accounted/reserved cost cap**, at most
180 queries and 5,400 candidates. Cost reservations use the provider token-count
endpoint, 15% input padding, and maximum output tokens at the published Haiku
4.5 standard rates ($1/$5 per million input/output tokens, checked 17 November).
Actual usage replaces reservations after a response. Every paid wave is pushed
before POST; ambiguous paid requests are never automatically resubmitted.
Git checkpoint writes retry the same commit with backoff and never repeat a
paid model call. Reviews run six at a time inside 24-photo checkpoint waves,
reducing remote writes by about sixfold compared with the first implementation.
Responses are saved and locally committed before source revalidation, then
published with tested intake before any subsequent paid wave. Already-paid passing reviews
can finish intake after restart without a second model call. Exact filename
quotes are validated against the complete original source fields. Missing
provider responses retain their cost reservation and stay held; they do not
cause the same image to be submitted again. Explicit rate
limits back off; budget/time limits checkpoint rather than run indefinitely.
Automatic image requests share a 1.25-second minimum start interval, retain
source Retry-After cooldowns even after the last retry, and identify the project
URL in their User-Agent. Backoff events log the image ID, status and delay.
A wave containing only unavailable previews records those holds and continues
to the next candidates; it is not mislabeled as budget exhaustion.
Old unavailable-source holds may be reopened once per ID after this fix, only
when the ID has no paid request of any state. The original decision is retained
in `ledger.unpaidPreviewRetries` before retrying. Completed/ambiguous/reserved
provider requests and visual/source-evidence rejections are never reopened by
this mechanism. These reviews use the same run ID and original cost cap.

A runtime checkpoint automatically starts the next sequential review stage
from the latest branch checkpoint, with the same frozen queue and $15 cap.
There are at most three stages per trigger; errors, uncertain paid requests and
budget exhaustion do not trigger another stage. A final gate checks durable
candidate/decision IDs and rejects an unfinished queue, so a successful workflow
means the queue is exhausted and its app checks passed. Per-stage artifacts have
distinct names. `python scripts/photos/auto_photo_progress.py` reports this state
without making provider requests.

Passing images, static app assets, credits and decisions are committed
automatically to the task branch after tests. Other images remain held with
reasons. `catalog/auto-runs/<requestId>/ledger.json` reports actual progress and
cost; source/query records, raw provider responses and final decisions remain
alongside it. Cloud execution uses the already configured GitHub
`ANTHROPIC_API_KEY` secret, not a copied local key. This does not deploy
production or bypass the separate 10,000-photo/device release gates.

Run 44158055065 stopped after 534 processed candidates and 41 additions when
GitHub rejected a checkpoint push. All 499 completed provider responses were
recovered from its SHA-256-verified artifact; cost accounting continues from
$2.030313 against the same $15 cap. `resumeAttempt` changes only the workflow
trigger, not the queue identity or spending allowance. Failed-run artifacts now
also preserve a Git bundle of any committed changes not yet pushed.

The repository contains:

- `pilot-reviewed.json`: the 48 visually reviewed source photographs and attribution.
- `candidates.jsonl.gz`: the collected Commons metadata that passed mechanical filters; every record is still `pending_review`.
- `collection-status.json`: actual counts and timestamp of the saved collection checkpoint.
- `collection.sqlite.gz`: resumable discovery queue and metadata. The collector restores it when no local working database exists.
- `schema.sql`: the cloud catalogue schema. Candidate records are never imported directly into the public tables.

For the November dish-first comparison of Commons, Wikidata, TheMealDB and
Openverse, see [`benchmarks/photos/README.md`](../benchmarks/photos/README.md).
It also exports Commons discoveries into this same review/release workflow.
The [route audit](../docs/PHOTO-SOURCE-ROUTES.md) distinguishes live-tested
sources from documentation-only and account-dependent options.

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

Preparation samples discovery categories in round-robin order so large cake or dessert categories do not dominate the first batch. This balances discovery categories, not verified cuisines or dishes. Use a fixed database snapshot when preparing multiple batches with `--offset`; collecting more records between batches changes their ordering. Retain the generated source-hash sidecars with results.

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

### Windows and two-stage screening (v3)

`triage.py` now downloads Wikimedia previews locally and embeds their bytes as
Base64. All JSON text uses UTF-8. Preparation never overwrites a batch, receipt,
or manifest: use a new batch name. API POSTs leave a durable submission lock;
a timeout is ambiguous, so inspect the provider console before any retry.
The downloader checks host/redirect allowlists, file signatures and a local
4 MB image limit; it does not fully decode images. Batches have a conservative
240 MB serialized-payload cap. Lower `--limit` if either size limit is reached.

Visual screening is blind to source titles and categories. All four dimensions
(sharpness, lighting, composition, appeal) must reach 4/5, with no watermark and
likely photographic content, before a model suggestion can proceed to identity.
A crop suggestion does not pass this gate; review an actual crop separately.
These are model suggestions, not calibrated guarantees or release approvals.

```powershell
python scripts/photos/triage.py prepare --stage visual --limit 12 --out catalog/work/visual-v3-001.json
python scripts/photos/triage.py submit catalog/work/visual-v3-001.json --max-requests 12
python scripts/photos/triage.py collect catalog/work/visual-v3-001.job.json
```

Run each step only after the preceding step succeeds. Repeat only `collect`
while processing. Collection writes raw JSONL plus `.summary.json`, with API
outcomes, validated screening decisions and per-image model output/errors.
It handles Markdown JSON fences and rejects truncated or malformed responses.
Old batches can still be collected; their output is marked `legacy_unvalidated`.
Offline summary, with no API call:

```powershell
python scripts/photos/triage.py summarize catalog/work/visual-v3-001.job.results.jsonl --batch catalog/work/visual-v3-001.json
```

Only after inspecting visual results, prepare identity requests for passing
images using the immutable visual batch and source snapshot. No image redownload
or new database selection occurs. If no photos pass, no identity batch is written.

```powershell
python scripts/photos/triage.py prepare --stage identity --from-batch catalog/work/visual-v3-001.json --visual-results catalog/work/visual-v3-001.job.results.jsonl --limit 12 --out catalog/work/identity-v3-001.json
python scripts/photos/triage.py submit catalog/work/identity-v3-001.json --max-requests 12
python scripts/photos/triage.py collect catalog/work/identity-v3-001.job.json
```

Identity suggestions require an exact source quote, visible support and no
reported uncertainties. Aliases, proteins, ingredients and allergens are not
inferred for catalogue ingestion; model outputs adding them are held for manual
review. Quote matching only verifies that text exists, not that it proves the
claim. Every shortlist still requires human identity, quality and provenance
verification through the existing review/release process. No screening command
updates candidate status or approves assets. Offset sampling is not a persistent
queue; keep manifests to track samples and avoid re-reviewing the same photos.

Calibration observations from the three September 8 samples: reflective partly
empty cookie packaging is not display-ready; a bread stall with a prominent
person/counter is at most a crop candidate; a casserole on a cluttered stovetop
is documentation quality. Do not hardcode outcomes by ID. A ceramic baking dish
must not be described as disposable foil, and dark filling is not evidence of
meat. Include positive examples in future calibration; these three negatives
alone do not establish reviewer accuracy. No paid calibration is performed by
the code tests.

### Visual calibration sheet and v4 packaging guard

Generate a balanced 100-photo sheet without paid API calls:

```powershell
python scripts/photos/calibrate.py --limit 100
Start-Process catalog/work/calibration/index.html
```

The page samples categories round-robin (discovery categories are not verified
cuisines), keeps source metadata collapsed, offers display/crop/reject/verify
labels, notes, zoom, filters, local browser persistence and JSON export/import.
Export before closing: browser storage availability varies for local files.
Exports are calibration labels only and cannot be used as release decisions.
Images load from Wikimedia; a failure is shown with a source-link fallback.
Use `--offset 100 --out catalog/work/calibration-002/index.html` for the next
sample. The generated `.sample.json` records sample identity and source hashes.

V4 explicitly distinguishes exposed food from food printed on packaging. Printed
food is rejected; uncertain or missing `food_depiction` is held for manual review.
V3 visual outputs lack this field, so re-evaluation under v4 will hold them rather
than silently treating them as v4 passes. Existing receipts can still be collected;
raw model results remain intact. Use fresh batch names for any new paid tests.

Preparation holds candidates missing attribution, licence/source links, source
hash or all identity text BEFORE image download or paid submission. It prints
held IDs and reasons; it does not delete or change candidate status. Short text
or self-published work alone is not a rejection criterion. This is field-completeness
checking, not external provenance verification or an AI-origin detector.
