# Administration patient summary — 2026-08-31

## Behavior

- The name and “تفاصيل أكثر / More details” toggle one compact, initially closed summary below the patient's daily-list row.
- Prescriptions remain accessible inside the summary. The clinic screen keeps its previous first-name display and prescription action.
- The summary includes previous attended visit and days elapsed (Riyadh calendar days), completed visits, recorded procedure quantities, newest four plan summaries, lab status/name/time since sending, prescription records, payments, communication counts and administration notes.
- Full patient-record buttons expose the existing appointments, plans, laboratories and payment tabs; the compact view is not a replacement for those records.

## Evidence and limits

- Procedure quantities are structured payment-order items attached to completed visits. They are **not independent clinical evidence of treatment completion**. The UI explicitly explains this.
- Proposed plan items never contribute to completed-visit procedure totals. Free-text visits and missing quantities are shown without guessing numeric counts.
- A scheduled/cancelled/no-show visit is not treated as a previous attended visit merely because its date has passed.
- Only a nonzero file number or national ID links a summary; a shared telephone number/name is never enough. Missing identity prompts correction.
- The existing profile API's historical scan limits still apply. Counts refer to available linked records, not a guarantee that every historical record ever created was recovered. Unknown/unavailable plan details remain visibly unavailable.

## Implementation

New files: `patient-summary.js`, `patient-summary.css`, `netlify/functions/lib/patient-summary.mjs`, `tests/patient-summary.test.mjs`, `scripts/patient-summary-preview.mjs`.

Integration: `dashboard.js`, `index.html`, `service-worker.js`, syntax checks and updated existing prescription/deployment tests.

API: existing authenticated `GET /api/patient-profile` accepts optional `summary=1` for administrators only. It adds sanitized payment quantities/visit timestamps and up to four exact-version plan item summaries. No new database or storage namespace.

Historical registry hydration now accepts `persist=false`, used by summary reads only. Existing callers retain their default behavior. Viewing a summary never saves a registry or changes revisions, patient state, plan state, or notification subscriptions.

One history request is in flight at a time; superseded queued requests are skipped. A bounded, short-lived in-memory cache coalesces repeated opens. No new timer, polling, localStorage, IndexedDB or Service Worker patient-data cache is introduced. A visible refresh action reloads the history. Existing synchronized current-visit fields are overlaid read-only. Cached summaries show load time and warn when a newer list revision arrives or refresh fails. Logout clears summary state/cache.

Styles are namespaced to `.patient-summary*`. The expanded content fits the existing table's visible container, including phones, without changing the base table layout.

## Verification

- Baseline: 91 existing tests passed before changes.
- New suite: 100 total tests passed; syntax checks passed.
- Executed local browser tests with synthetic fixtures: closed initial state, patient-name opening, close, missing identity, live profile response, explicit refresh, simulated 503 with last-loaded summary retained, English summary labels, light/dark display, classic/modern administration layouts, expanded sidebar, 390px phone display, full-record plans action, prescription navigation, clinic view still first-name-only with no summary.
- The local fixture blocks all clinical writes and never connects to Netlify. The pre-existing dashboard registry-hydration POST occurs on startup; summary interactions add only GET profile requests, no state/profile writes.
- No production deployment, production-patient test, real multi-device sync test or production-backend load benchmark was performed in this change. Existing sync regression assertions passed, and synchronization code/contracts were not changed.

## Local reproduction

Run `npm run check`. For browser verification run `node scripts/patient-summary-preview.mjs`, then open `http://127.0.0.1:8779/?view=admin&clinic=clinic-1`.

The preview is a localhost-only Node fixture using fabricated records. It is not a deployed service, not a second database, and does not proxy production APIs.

## Release / rollback

Deploy frontend assets and Netlify function changes together after the normal preview gate. Include the new static files and the updated Service Worker asset version. No patient-data migration is required.

Rollback by reverting this change and redeploying the prior frontend/functions as one version; no patient records need restoring. Existing profile clients may continue to omit `summary=1`.
