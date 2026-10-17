# Best Care appointment import API

Implementation staged in the release worktree on 2026-10-17. It has not been deployed or configured with a service token.

## Contract

`POST /api/appointment-imports/preview` and `POST /api/appointment-imports` require `Authorization: Bearer <BEST_CARE_OFFICE_SERVICE_TOKEN>` and the same `Idempotency-Key` (8–128 permitted characters). Configure the token in Netlify's Functions environment; it must be at least 32 characters and must not be committed. There is no inferred clinic or date.

Preview accepts `{ "payload": { "source": "secretary_image_import", "report_date": "YYYY-MM-DD", "clinic_id": "clinic-3", "image_hash": "<SHA-256 hex>", "row_count": 1, "appointments": [{ "name": "...", "file_number": "...", "mobile": "05...", "start_time": "HH:mm", "end_time": "HH:mm", "procedure": "..." }] } }`. Execution repeats `payload` and includes the complete preview response as `preview`.

The preview is persisted with the request hash, day version, directory revision and exact response. Execution rejects absent, stale or modified previews, then atomically reserves the saved preview. The import rechecks identity, dates, times, mobile format, duplicates and same-day changes. Only `NEW` and `EXISTING` rows are executable; uncertain rows remain in the review result. A deleted appointment tombstone is also review-required. No import deletes appointments omitted from the image.

Execution uses an ETag-conditional write for the day. Patient Master receives only new approved identities through an insert-only conditional write; existing records are never changed based on OCR. A failure after saving the day is recorded as a persistent `partial` result, not success, and a replay with the same key is blocked. The audit and review result persist in Netlify Blobs. The response does not expose patient names or phones.

The caller must create the CSV backup; this API records its expected filename but does not write a desktop file. A preview is not a claim that the report was merged. An authenticated production smoke test and service-token configuration remain release steps outside this stage.

Local verification: `npm test` passed 324/324 after installing dependencies from the checked-in pnpm lockfile.
