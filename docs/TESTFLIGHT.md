# Tavue 0.9.1 TestFlight handoff

## Build identity

- App name: Tavue
- Bundle identifier: `com.playbook.dishlens`
- EAS project ID: `859efdc3-4c16-448c-9e6a-fe98349513c5`
- Build profile: `production`
- Version: `0.9.1`
- Build number: remotely managed and auto-incremented by EAS

## Release focus

0.9.1 focuses on weak-network reliability. On iOS and Android, compressed menu
pages are saved locally before upload. Retryable connection/server failures keep
the menu in a durable queue, reuse the same scan session and resume
automatically. A queued scan should be presented as a saved menu rather than a
failed scan. Web scanning remains an online/direct flow.

## One-time production configuration

Create a React Native project in Sentry, then add these EAS production
environment variables. Never commit their values.

```text
EXPO_PUBLIC_SENTRY_DSN
SENTRY_AUTH_TOKEN
SENTRY_ORG
SENTRY_PROJECT
```

Configure the Worker support address before deploying:

```bash
npx wrangler secret put SUPPORT_EMAIL
npx wrangler deploy
```

The app still builds and runs if Sentry is not configured, but crash reports and
source-map uploads will remain disabled.

## Build and upload

Authenticate locally, then run one build only:

```bash
eas login
eas build --platform ios --profile production --auto-submit
```

If automatic submission is not configured for the Apple account:

```bash
eas build --platform ios --profile production
eas submit --platform ios --profile production --latest
```

Do not resubmit while a Free-tier EAS build is queued. Inspect it with:

```bash
eas build:list --platform ios --limit 5
```

## TestFlight “What to Test”

```text
Please test Tavue 0.9.1 in a real restaurant, especially with weak connectivity:

1. Scan a normal menu with a good connection and confirm the result still opens normally.
2. Start a native scan, then disable Wi-Fi/mobile data while it is uploading. Confirm Tavue says “Menu saved ✓” (or the equivalent translated message), not “Scan failed”.
3. While that scan is queued, close Tavue completely, reopen it, restore the connection and confirm the queued menu resumes automatically and appears in Recent menus after completion.
4. Repeat a weak-network scan but press Cancel before it queues/completes. Confirm it does not reappear later after the connection returns.
5. Confirm retrying a dropped connection does not create duplicate Recent menus or consume the same scan twice.
6. Scan several menu pages together and confirm page order, visible dishes, sections and printed prices remain correct.
7. Open several dish details and verify descriptions, dietary flags and allergen guidance.
8. Add dishes to Your order, adjust quantities and open Show server. Confirm original dish names, sections and printed prices remain easy for restaurant staff to read.
9. Close Show server and confirm the order is saved once in History.
10. Add/replace/remove a real dish photo from History and confirm it remains local after reopening Tavue.
11. On tavue.tavuelabs.com, confirm the Web app loads instead of a route_not_found JSON response and that web scanning still works normally.
12. Confirm /health on the API deployment reports version 0.9.1 after the new Worker is deployed.

Please report slow scans, queued scans that never resume, duplicate scans, altered original dish names, missing dishes, wrong prices/currency, crashes, or layouts that overlap the floating Liquid Glass header/dock. Always confirm ingredients and allergens with restaurant staff.
```

## Beta App Review information still requiring owner input

- Contact first and last name
- Contact phone number
- Public support email
- App Store Connect Apple ID (`ascAppId`) if non-interactive submit is desired
