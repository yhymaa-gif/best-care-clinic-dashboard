# Fast synchronization checkpoint — 2026-10-06

## Completed

- Reduced visible core patient-list polling from 15 seconds to 5 seconds; hidden and off-hours cadence remains unchanged.
- Reduced the visible administration patient hub refresh from 20 seconds to 10 seconds.
- Kept `revision`, `expectedRevision`, strong Blob consistency, local pending-state recovery, and conflict merging unchanged.
- Moved Web Push delivery behind Netlify `context.waitUntil()` so the save acknowledgement no longer waits for every notification endpoint.
- Kept the day state and central patient-directory update durable before the response.
- Removed the central identity-correction batch from the live list's `sync.pushing` lock. The persisted correction queue now retries separately.
- Made identity-correction batches single-flight and gave every edit a unique queue id, so completion of an older correction cannot remove a newer one.
- Protected historical day corrections with Netlify Blob ETag `onlyIfMatch` retries; the latest patient status/timing data is preserved during a concurrent name correction.
- Excluded the live source day from historical correction writes because `/api/state` already saved it revision-safely.
- Added `pendingWake` so an update signal received during an active sync cycle is consumed immediately afterward instead of being lost.
- Bumped the PWA cache and release metadata so installed devices receive the synchronization fix and the update control shows its summary.

## Evidence

- `npm run check`: 192/192 tests passed.
- Executable race tests cover an older queued correction completing after a newer edit, single-flight processing, and an ETag conflict while a patient status changes.
- Syntax checks passed.
- `git diff --check`: no whitespace errors.
- Independent read-only acceptance review requested after implementation.

## Not performed

- No production deployment in this checkpoint.
- No authenticated two-device production timing measurement; that requires an active authorized clinic session on two devices.

## Remaining safe step

1. Accept the independent review findings.
2. Commit and publish through the GitHub-integrated Netlify build path.
3. Verify production authentication health and release metadata.
4. Run a real two-device edit test and record observed propagation time.

## Rollback

Revert the fast-sync commit. No stored-data migration or schema change is introduced by this work.
