<div align="center">
  <img src="./assets/tavue-icon.png" alt="Tavue app icon" width="128" />
  <h1>Tavue</h1>
  <p>Point Tavue at any restaurant menu. See every dish in your language.</p>
  <p><strong>Version 0.9.0 · Order History and real-photo contributions</strong></p>
</div>

Tavue turns a photo of a restaurant menu into a clear, visual guide. It
translates and organises the menu, explains unfamiliar dishes, shows dietary
and allergen guidance, converts prices and helps the user build an order to
show the server.

`scan → choose → show server → remember the order → add real dish photos`

## Current product

- One Expo / React Native product for iOS, Android and mobile Web
- Zero-install Web flow with mobile camera/photo upload and single-page deployment
- Camera and photo-library menu scanning
- Claude-powered OCR, translation and menu structuring
- Menu sections, dietary filters and compact visual dish cards
- Dish explanations, ingredients, prices and ordering advice
- Allergen and dietary guidance with a visible confirmation warning
- Persistent display-currency selection with approximate converted prices
- Order builder with a converted total and a full-screen server handoff mode
- Server view prioritising quantity, original dish name, printed section and price
- Local Order History created automatically when the server handoff is opened
- User-controlled Order History deletion, including associated local dish-photo drafts
- Three-tab Scan / History / Profile navigation, with account features clearly
  marked as a future backend phase
- Restaurant confirmation and one real-photo contribution slot per ordered dish
- Moderation-ready photo status and scan-credit reward records
- Nine interface languages
- Local history for the ten most recent menus
- Liquid Glass navigation on supported iOS versions, with BlurView fallbacks

The paywall prototype remains in the repository for future development, but it
is not reachable and does not limit the beta.

Contribution photos in v0.9.0 are compressed and saved only on the user's
device. Cloud upload, accounts, review decisions and scan-credit grants remain
disabled until the moderation backend is introduced in the next beta.

## Beta safeguards

Version 0.9.0 retains the infrastructure required for controlled testing:

- Privacy-safe, first-party product analytics through Cloudflare Analytics Engine
- Sentry crash monitoring with PII, screenshots and menu content disabled
- Per-install burst and daily scan limits
- Explicit consent before a menu image is sent for AI processing
- Hosted privacy policy, support and health endpoints
- Android microphone permission explicitly blocked

No menu photos, menu text, dish names, search terms or personal identity are
sent to the analytics endpoint.

## Run locally

Requirements: Node.js 20+, npm and Expo Go or an iOS/Android development
environment.

```bash
npm ci
npx expo start --clear
```

Run the instant Web experience locally or export its static production build:

```bash
npm run web
npm run export:web
```

The production-ready single-page bundle is written to `dist/`. Deploy that
directory to any static host; all scanning continues to use the existing
Cloudflare Worker.

The app currently points to the deployed Worker URL in `src/lib/api.ts`.
Optional client environment variables are documented in `.env.example`.

## Deploy the Worker

```bash
cd worker
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy
```

Optional image-search secrets:

```bash
npx wrangler secret put BRAVE_API_KEY
# or
npx wrangler secret put GOOGLE_CSE_KEY
npx wrangler secret put GOOGLE_CSE_CX
```

The beta requires an anonymous client ID, limits each installation to six scan
attempts per minute and allows 20 scans per day. Daily counters use
`SCAN_LIMITS` when configured, otherwise the existing `FEEDBACK` KV namespace
with isolated `scan:` keys.

Worker endpoints:

- `POST /scan` — scan and structure a menu
- `POST /events` — strict, content-free beta event allowlist
- `POST /feedback` — beta feedback collection
- `GET /health` — deployment health and release version
- `GET /privacy` — privacy policy
- `GET /support` — support page

See `worker/analytics.sql` for the core beta queries.

## Project structure

```text
App.tsx
assets/
  tavue-icon.png
  tavue-splash.png
  tavue-adaptive-foreground.png
  tavue-adaptive-monochrome.png
src/
  screens/
    ScanScreen.tsx
    ResultsScreen.tsx
    PaywallScreen.tsx       # future feature; not in beta navigation
  components/
    DishCard.tsx
    DishDetailSheet.tsx
    GlassSurface.tsx
    OrderCart.tsx
    OrderSheet.tsx
  lib/
    analytics.ts
    api.ts
    currency.ts
    history.ts
    identity.ts
    monitoring.ts
    privacy.ts
worker/
  src/index.js
  analytics.sql
  wrangler.toml
docs/
  APP-STORE-PRIVACY.md
  PRIVACY-POLICY.md
  TESTFLIGHT.md
```

## Release handoff

- Brand rules and migration record: [`docs/BRAND.md`](docs/BRAND.md)
- TestFlight and EAS instructions: [`docs/TESTFLIGHT.md`](docs/TESTFLIGHT.md)
- App Store privacy answers: [`docs/APP-STORE-PRIVACY.md`](docs/APP-STORE-PRIVACY.md)
- Privacy policy source: [`docs/PRIVACY-POLICY.md`](docs/PRIVACY-POLICY.md)

Before a public release, complete physical-device accessibility testing, review
photo-source licensing and replace the paywall prototype with the chosen
billing implementation.
