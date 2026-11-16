# Final photo review and bundled integration — 16 November 2026

94 shortlisted records were inspected using uncropped contact sheets; 32 finalists received enlarged preview-panel review. Live Commons source hash, author and licence fields were unchanged for all 94.

**22 photos accepted by assistant review and integrated into the test branch; 72 held.** These are 22 distinct named additions to the 48-photo starter, bringing the bundled catalogue to 70. Decisions identify the reviewer as an assistant and preserve method, date, source hash, name, asset hash and reasons. Held items are not counted as approvals. Published authorship/licence declarations are the provenance basis; independent authorship or camera-origin proof is not claimed.

The new assets are uncropped 960px-or-smaller JPEG previews, resized and re-encoded without generative editing. Attribution, original licence links and source pages are retained in the app and CREDITS. Assets are hash checked. New entries require menu-supplied names, prevent a simplified AI image query from dropping Latin-script dish qualifiers, and conservatively decline vegetarian-flagged matching where classification is unverified. Protein tags were added only where the reviewed source/depiction supports them.

This is a test-branch integration. Production has not been deployed, no iOS/Android binary has been distributed, and the 10,000-photo launch gate remains unchanged. The cloud catalogue's other candidates remain pending.

Local validation: photo matching/worker/scale tests passed with 70 real asset hashes; TypeScript check and Expo web export passed. Local Chromium could not launch under the environment socket restrictions, so real web UI verification runs in the dedicated GitHub workflow with fixture menu history and no paid AI call.

Verified browser run: [43850441606](https://github.com/Jimcai416/Tavue-mvp/actions/runs/43850441606), commit `03204ef2024eb5a7f0dc08a34854567b592d861a`, completed successfully. Photo matching/asset hashes, Worker migration/fallback, synthetic scale checks, TypeScript, web export and real Chromium UI checks all passed. The synthetic scale test does not add real photographs. Final screenshots were inspected: all four fixture images show food within their cards; the attribution modal shows the full photograph, photographer, source and licence. Banana pancakes remains a placeholder rather than receiving the plain Pancakes image. Browser artifacts are attached to the run.

Two real display issues were corrected during verification: the head script accessed `document.body` before it existed; reference thumbnails inherited intrinsic asset dimensions and cropped to background. A pre-body script regression test and rendered thumbnail-size check now cover those cases. Native iOS/Android verification and production deployment remain outstanding.
