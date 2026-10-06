# Admin queue visibility checkpoint — 2026-10-06

## Completed

- Verified the production administration screen was already running build `7.71-admin-patient-queue`.
- Confirmed the perceived missing update occurred when all 13 patients were waiting and the completed section count was zero.
- Made both waiting and completed sections remain visible when either section is empty.
- Added bilingual empty-state messages without changing patient data, statuses, APIs, revision handling, or synchronization.
- Bumped the dashboard asset and service-worker cache versions to avoid stale PWA assets.
- Added the existing stored patient national ID to the editable/printed treatment-plan header and the generated share/PDF copy.
- Added bilingual `رقم الهوية` / `National ID` labels without making the field mandatory or changing older plan data.

## Evidence

- `npm run check`: 200/200 passing.
- Production was inspected read-only in the authenticated administration tab before implementation.

## Next safe step

- Update Netlify deploy preview 95, verify the queue sections and treatment-plan identity field, then merge and trigger the Git-connected production build.
