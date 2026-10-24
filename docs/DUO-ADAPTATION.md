# iPhone Duo adaptation

This branch moves Tavue from Expo 54 to Expo 58 / React Native 0.88. Expo 58
prebuild generates the UIKit scene lifecycle required by the iOS 27 SDK.
The dedicated `duo` EAS profile pins Xcode 27.1 and inherits the production
environment and remote build-number increment.

## Build and install

From this branch on an EAS-authenticated machine:

```bash
npm ci
npx eas-cli login
npx eas-cli build --platform ios --profile duo
npx eas-cli submit --platform ios --profile production --latest
```

Check for an existing queued build before starting another. Do not distribute
this SDK upgrade until a native launch and the flows below have been checked.
Production's default image is intentionally unchanged; use `duo` for this test.

## Layout behavior

- Measured safe window width of 700 points or more enables the home split layout
  and a custom side navigation rail. Narrow windows retain bottom navigation.
- Menu results use two columns above 700 content points, one below it.
- Horizontal system safe-area insets apply to the app content and navigation.
- Short windows reduce the home ticket's typography and vertical padding.
- Cart and dish detail modals are limited to 640 points for readability.
- Resizing keeps the same screen instances and React state. It does not start
  a new scan or reset the order. The result list may adjust its scroll position
  when its rows regroup from one column to two.
- Web's app shell now expands to 1280 points to support the same layout.

## Validation completed in the development container

- TypeScript type check.
- Expo dependency alignment check (offline, bundled SDK compatibility table).
- Web production export and iOS Hermes bundle export.
- Headless Chromium checks at 390×844, 600×540, and 1000×720: no horizontal
  page overflow, all three navigation tabs present, and no page runtime errors.
  A five-dish fixture rendered in two columns; adding to the order and resizing
  narrow → wide preserved the order. Screenshots inspected for home and results.
- iOS prebuild without CocoaPods installation; verified SceneDelegate.swift and
  UIApplicationSceneManifest were generated. Generated native sources are not
  committed; EAS regenerates them from app configuration.

Native compilation, signing, installation, and device screenshots require EAS
or Xcode and were not performed in this container.

## Device acceptance checks

1. Upgrade over the current TestFlight app; confirm language, currency, food
   profile, Recent menus, and History survive.
2. Launch closed and fully open. Confirm the app fills the available window,
   controls avoid the status area, and no black compatibility frame remains.
3. Open and close while scrolling Recent menus and while a scan is in flight.
   Confirm scan progress survives and only one result is produced.
4. Open a saved menu, set a filter, add quantities, then repeatedly fold/unfold
   and rotate. Confirm the filter and order stay intact and each section's dish
   count is independent of the number of card rows.
5. Open dish details and Cart in both sizes; confirm close, quantity, and Show
   server controls remain reachable. Test brightness and sharing.
6. Try camera capture, multi-photo picking, scan cancellation, and permission
   denial after the Expo upgrade. Test Sentry initialization if configured.
7. Test split-window widths and increased text sizes. Test short outer windows
   in English and Chinese, including scrolling to both scan actions.
8. Test ordinary iPhones, Android, and mobile Web because dependencies are shared.

Partially folded hinge reserved regions are not exposed by this implementation.
The two-column layout is a window-width adaptation, not a claim of hinge-aware
placement. Half-fold poses need device validation and, if content is occluded,
a native reserved-region bridge before those poses can be considered supported.

## References

- https://developer.apple.com/iphone-duo/prepare/
- https://expo.dev/blog/how-to-upgrade-to-sdk-58
- https://docs.expo.dev/build-reference/infrastructure/
