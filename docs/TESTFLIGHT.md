# Tavue 0.9.0 TestFlight handoff

## Build identity

- App name: Tavue
- Bundle identifier: `com.playbook.dishlens`
- EAS project ID: `859efdc3-4c16-448c-9e6a-fe98349513c5`
- Build profile: `production`
- Version: `0.9.0`
- Build number: remotely managed and auto-incremented by EAS

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
cd worker
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
Please test Tavue in a real restaurant:

1. Confirm the Tavue name, T/V icon and warm-paper splash appear correctly.
2. Upgrade over an earlier beta and confirm Recent menus, language, currency
   and food profile are preserved.
3. In Simplified Chinese, confirm “看懂菜单，轻松点菜。” is not clipped.
4. Scan one page of a menu in a language you do not read and check whether
   every visible dish, section and price is recognised.
5. Open several dish details and verify descriptions and dietary flags.
6. Add several dishes to Your order and adjust their quantities.
7. Tap Show server. Confirm that quantities, original dish names, original
   menu sections and printed prices are easy for restaurant staff to read.
8. Try the brightness button, return to the editable order, then reopen it.
9. On mobile Web, confirm the top and bottom backgrounds remain continuous,
   the brightness button enters a visible high-contrast mode, and the App
   remains full-width on native iOS/Android.
10. Close Show server and open History from the bottom navigation. Confirm the
    same dishes and quantities were saved without creating duplicate meals.
11. Confirm Scan contains only menu actions and Recent menus; History is not
    repeated as a card on the same page.
12. Open Profile and confirm it clearly says that account, cloud sync and scan
    balance are future features while current data remains on this device.
13. Return to History, add the restaurant name, then take or choose a real photo for one ordered
    dish. Confirm it stays attached after closing and reopening Tavue.
14. Replace and remove the dish photo, and confirm menu photos are never shown
    as saved contribution photos.
15. Return to the History list, swipe one meal left and delete it. Confirm the
    warning appears and the meal disappears only after confirmation.
16. Create at least two more meals, tap Edit, select multiple entries and delete
    them together. Confirm Cancel/Done leaves unselected entries untouched.
17. Return later and reopen the menu from Recent menus.

Please report slow scans, altered original dish names, missing dishes, wrong
prices/currency, crashes, or layouts that overlap the floating Liquid Glass
header/dock. Always confirm ingredients and allergens with restaurant staff.
```

## Beta App Review information still requiring owner input

- Contact first and last name
- Contact phone number
- Public support email
- App Store Connect Apple ID (`ascAppId`) if non-interactive submit is desired
