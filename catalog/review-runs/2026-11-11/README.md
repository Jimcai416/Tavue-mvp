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
