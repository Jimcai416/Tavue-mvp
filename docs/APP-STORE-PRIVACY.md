# App Store privacy answers

Use this as the conservative App Store Connect disclosure for Tavue 0.9.0.
Re-check it whenever a provider or SDK changes.

## URLs

- Privacy Policy URL:
  `https://dishlens-api.jimcai416.workers.dev/privacy`
- Support URL:
  `https://dishlens-api.jimcai416.workers.dev/support`

These URLs serve the Tavue copy after the Worker from this branch is deployed.

## Tracking

- Does this app use data for tracking? **No**
- Does this app use the advertising identifier? **No**
- ATT prompt required? **No**

## Data types to disclose

| App Store data type | Purpose | Linked to user | Tracking |
| --- | --- | --- | --- |
| Photos or Videos | App Functionality | No | No |
| Device ID | App Functionality; Analytics | No | No |
| Product Interaction | Analytics | No | No |
| Crash Data | App Functionality; Analytics | No | No |
| Performance Data | Analytics | No | No |
| Other User Content | App Functionality | No | No |

Notes:

- `Photos or Videos` covers menu images processed by Anthropic's API.
- Real dish-photo drafts in 0.9.0 stay on the device and are not collected;
  re-check this answer before the contribution upload backend is enabled.
- `Device ID` is a conservative description of Tavue's random installation ID.
  It is not an Apple hardware or advertising identifier.
- `Product Interaction` covers the strict event allowlist in
  `src/lib/analytics.ts`.
- `Crash Data` applies when the production Sentry DSN is configured.
- `Other User Content` covers the optional free-form feedback form.
- Do not declare names, email addresses, location, contacts, purchases,
  financial information, browsing history, search history, or advertising data;
  the app does not collect them.

## Review notes

Tavue sends a user-selected menu photo to a Cloudflare Worker and Anthropic's
commercial API only after the user accepts the in-app disclosure. Tavue does
not store the photo. Results are stored locally in Recent menus. The AI warning
asks users to confirm ingredients and allergens with restaurant staff.
