# Administration queue checkpoint — 2026-10-06

## Completed

- Grouped both administration patient lists into waiting/in-progress and completed sections.
- Moved the active patient and appointments whose start time has arrived to the top automatically.
- Added compact timing labels for current, due, arrived, upcoming, completed, and closed appointments.
- Kept patient status data and synchronization contracts unchanged.
- Added Arabic and English labels, responsive styling, release metadata, and PWA cache refresh.

## Evidence

- `npm run check`: 199/199 tests passed.
- New queue tests verify grouping, deterministic Riyadh-time ordering, and administration integration.
- Dashboard HTML remains below the existing 80 KB shell budget.
- Shared-clock benchmark: 500 queue records sorted in about 2 ms locally.
- Independent read-only review: SHIP after verifying minute updates and preservation of open, scroll, and focus state.

## Remaining work

- No production deployment was performed in this change set.

## Next safe step

- Review the diff, create a focused commit, deploy a Netlify preview, then publish only after live smoke checks pass.
