# Identity review reconciliation — 12 November 2026

No new API calls or release approvals were made. Inputs are the persisted identity-stage results on `data/cloud-photo-identity-20261112`, not the unavailable desktop decisions.

| Review queue | Photos |
| --- | ---: |
| Original-rule shortlist | 91 |
| Recipe-detail review priority | 3 |
| Material or unclassified uncertainty | 705 |
| Identity or source-evidence hold | 428 |
| Model-output parsing error | 1 |

These labels express review priority, not verified identity or publication permission. The 705 uncertainty records include unclassified caveats, not 705 proven wrong identities. The 428 holds include low scores, unsupported/invalid source quotes, insufficient visible support, generic family names or other incomplete checks; they are not all source-rights failures.

The conservative recipe-detail group is pickled peaches, grilled salmon with tahini salad and cherry tomatoes, and pound cake with caramel icing. A contact-sheet inspection of these and six neighbouring records was performed; it did not establish photographic origin, rights or release approval. Do not infer ingredient/allergen guarantees from these images.

The full per-image records, original uncertainty text, source links and hold reasons are in `review-queues.json.gz`; decompress as UTF-8 JSON. Original inputs remain unchanged. The input-digests file pins the reviewed result snapshots.

Next review must interpret the caveats in context, retain original source-supported names and variants, and separately check provenance/authenticity. Do not promote every high-scoring record or every caveat containing the word recipe. For example, hidden protein species, alternative identities and uncertain regional variants remain unresolved.

Validation: 52 photo-pipeline tests passed, including regressions preventing decoration/preparation from matching ratio and keeping explicit identity/source doubts held.
