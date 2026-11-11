# Cloud review checkpoint — 11 November 2026

Recovered snapshot: `catalog/candidates.jsonl.gz` from repository commit
`307024de18fe6dbd4b21341fef073b6a3b1a705d`. It contains **8,030 Commons
candidate records**, all pending in that saved snapshot, across 33 discovery
categories. The separately reported 8,535-record working pool and the user's
400–500 desktop review results were not present in this checkout. Those desktop
results must be imported before claiming a globally deduplicated remaining queue.

## Work completed

- Checked all 8,030 records for required author, licence/link, source link,
  source hash, and identity-text presence. All have those fields. This is field
  completeness, not live licence validation or image review.
- No duplicate source hashes were found by the scheduling pass. Different-hash
  near-duplicate compositions do exist in the viewed sample.
- Froze category-balanced queue manifests under `plan/`. Each record points to
  the original snapshot by ID and source SHA1. The snapshot SHA256 is retained.
- Attempted 100 preview downloads, with at most three concurrent requests:
  97 successful, three HTTP 429 failures. Failed images remain pending.
- Assistant visually screened all 97 successful previews in uncropped contact
  sheets; proposed display candidates received enlarged-panel inspection.
- Results: **75 reject, 10 display candidates, 2 crop candidates, 10 manual
  checks, 3 download failures; zero release approvals**.
- Saved reasons, source links and reviewed-preview SHA256 for every viewed item
  in `visual-screening-001.json`. Preview SHA256 refers to the locally resized
  review JPEG, not a verified live hash of the original Commons file.
- `remaining-plan/` preserves these 97 screening results and schedules 7,933
  unviewed records in eight groups (7 × 1,000 + 933). Pending identity, crop and
  manual checks remain in `visual-screening-001.json`; exclusion from the
  unviewed queue does not mean those images are finished or approved.

The sample is category-balanced, not a simple random sample. Do not extrapolate
its retained fraction as a guaranteed full-catalogue yield. Identity, authenticity
and live source/licence verification were not completed. A model cannot establish
photographic origin or rights from image appearance alone.

## Next run and desktop merge

The existing automated vision pipeline requires `ANTHROPIC_API_KEY`, which is
absent in this cloud runtime. No paid vision batch was submitted, and nothing
continues running after this turn. Existing vision preparation also has download
and payload limits; the eight queue groups are scheduling manifests, **not
submitted API requests**. Actual visual request batches may need to be smaller.

Once exported desktop decisions are available, create a NEW merged plan:

```sh
python scripts/photos/bulk_plan.py \
  --decisions catalog/review-runs/2026-11-11/visual-screening-001.json \
  --decisions /path/to/desktop-photo-decisions.json \
  --out catalog/work/merged-plan
```

Matching ID + source hash preserves prior results without overwriting them.
Changed source hashes stay queued. Conflicting prior results are retained for
later reconciliation; the planner never translates them into approvals.
Failed downloads stay queued. Candidate status and public release data remain
unchanged. Full candidate metadata can be resolved from the original gzipped
JSONL using each manifest ID and hash.

Validation: all **29 existing and new photo-pipeline unit tests passed**. New
coverage verifies matching-hash resumption, changed-hash invalidation, duplicate
handling, missing-field holds and deterministic category balancing.

## Follow-up checkpoint — batch 002

The user authorized publishing this checkpoint to the public repository and
instructed automatic two-minute waits on download throttling. The cloud branch
is `feat/cloud-photo-review-resume`; the connected GitHub account was used because
this terminal has no GitHub push credentials.

Batch 002 downloaded and visually screened **100/100** previews, including the
three prior HTTP 429 failures and 97 previously unviewed records. There were no
new download failures in batch 002. This batch did not trigger another 429, so
the shared cooldown was verified by unit tests rather than a live 429 in this run.

Cumulative unique screening results: **197 viewed; 22 display candidates,
4 crop candidates, 21 manual checks, 150 rejected; 0 release approvals**.
The immutable batch-002 result is `visual-screening-002.json`, and the current
unviewed queue is `remaining-after-002/` with **7,833** records. The prior
`remaining-plan/` is retained as an earlier checkpoint, not the current queue.
Each pending identity/quality/crop review remains in the screening result files.

`download_review.py` reads a frozen queue manifest, resolves ID/hash against the
catalogue, resumes valid cached previews, and checkpoints each completed attempt.
It uses at most three concurrent requests, decodes previews, validates Wikimedia
redirects, and limits image downloads to 4 MB. A 429 pauses all threads for at
least 120 seconds, respecting a longer Retry-After. Waits occur in five-second
steps with progress output. The default retry count is unlimited; callers can
set an explicit cap. Downloads and contact sheets are **not** visual reviews.
Pillow is required for image decoding and contact sheets. All **33** photo tests
passed after adding cooldown tests.

Example for the next 100 unviewed images (requires an active process):

```sh
python scripts/photos/download_review.py \
  --manifest catalog/review-runs/2026-11-11/remaining-after-002/batch-001.json \
  --limit 100 --out catalog/work/cloud-20261111-003
```

No process remains running at this checkpoint. The full automated vision batch
still requires the existing Anthropic credential, which is absent here. This is
a credential blocker, not a download-rate blocker. No paid inference was submitted.
The original desktop's 400–500 decisions have still not been retrieved or merged.
