# Quick Treatment Plan checkpoint — 2026-10-07

## Completed

- Reworked the FDI tooth picker into a professional four-quadrant clinical odontogram with a central cross and the official quadrant order.
- Kept the selected tooth active so more than one existing procedure can be assigned to it.
- Added a visible list of procedures already assigned to the selected tooth.
- Ranked quick shortcuts from the existing catalog profile (favorites, then recorded usage); no second procedure database was introduced.
- Expanded the bilingual patient-file summary into a professional draft that groups teeth and procedure counts, while explicitly avoiding invented diagnoses or findings.
- Kept localhost preview mode read-only and clearly labelled as a non-saving preview.
- Fixed ambiguous catalog shortcuts by inserting a uniquely matched token for the selected existing procedure ID.
- Re-rendered shortcuts on language changes, cleared stale age/name data when the MRN changes, and refreshed the file summary after manual tooth edits.
- Corrected the Universal lower-arch direction and provided 44×44 mobile touch targets in a horizontally scrollable chart.
- Replaced circular tooth markers with original vector incisor, canine, premolar, and molar silhouettes; upper and lower roots are oriented away from the biting plane.
- Added one shared default procedure catalog containing all 30 bilingual dashboard procedures and aliases; the server catalog and local preview now consume the same IDs and labels.
- Replaced the tooth procedure dropdown with a full visual procedure palette. Each card has a procedure-family pictogram and adds one or more procedures to the selected tooth.
- Organized the visual palette by the dashboard's existing phases: initial treatments (blue), surgery and implants (orange), prosthetics (purple), and other procedures (neutral).
- Added a gold favorites/most-used section driven by the existing per-doctor catalog profile. Usage is learned from successful plan submissions and favorites can be toggled without creating procedure records.
- Structured generated clinical notes and patient-file summaries in this order: recorded diagnostics, initial treatments, surgery/implants, then final prosthetics.
- Forced this fast-entry page to a white, high-contrast presentation with larger IBM Plex Arabic labels and clearer tooth numbers, independent of the dashboard's saved dark theme.
- Refined each interactive tooth into a more anatomical enamel-shaded SVG with crown/root detail while preserving exact FDI order and touch targets.
- A successful quick-plan submission now creates one linked draft in the existing costed treatment-plan store and registry, using the authoritative procedure IDs and catalog prices.
- The linked costed draft automatically receives the complete patient-directory identity (name, file number, national ID, mobile and available age) and remains traceable through `sourceQuickPlanId`.
- Existing treatment plans are preserved as versioned history; the linked quick plan receives its own deterministic plan number and retries safely without duplicate plans.
- Interrupted writes now resume the missing day, permanent-identity and registry links instead of reporting a partial success.
- A retry never resets an existing signed or approved registry record to draft.
- FDI and Universal tooth numbers are preserved with an explicit numbering-system field; no silent conversion or tooth loss is allowed.
- Nationality and VAT remain explicitly unconfirmed when the directory has no authoritative value, so staff must review them before approval.
- Added a success action to open the linked costed plan while retaining the one-tap nursing note copy output.
- Fixed diagnostic ordering so implant uncovering and implant impressions cannot be mistaken for diagnostics.
- Serialized favorite updates with clinic/doctor context guards and optimistic rollback scoped to one procedure.
- Made a second tap on the same visual tooth/procedure card remove that assignment without disturbing corrected or duplicated entries.
- Replaced the patient-file copy with treatment-focused wording. Examination/periapical/panoramic assessment and patient discussion are included only after explicit confirmation, and those confirmations plus Arabic/English summaries are stored with the submitted plan and audit record.
- Kept submitted Quick Plans editable through a direct post-submit review link, while the structured record remains revision-checked and audit-trailed.
- Added a prominent “Add Quick Plan” action to the treatment-plan center, quick-plan review header, and the opened costed plan; the latter carries clinic, language, and available MRN.
- Added administration date swipes and an authenticated, salted password-change workflow in Settings.
- Kept submitted Quick Plans editable while pending review and synchronized safe edits across the versioned, appointment-day, and permanent-patient copies of the linked costed draft.
- Added revision-order guards, retryable pointer repair, and managed-content fingerprints covering both procedure phases and the generated patient-file note.
- Protected separately edited prices, procedures, and clinical notes from Quick Plan overwrite; plans already in approval remain direct-edit only.
- Added a safe compatibility path for earlier linked drafts only when their stored content still exactly matches the prior Quick Plan.
- Added short Arabic/English proposed-draft wording and the recorded tooth-numbering system to the copyable patient-file summary.

## Evidence

- `npm run check`: 251 tests passed, 0 failed after the final content-revision, concurrency, and cross-index hardening.
- Local browser preview verified FDI arch order, counts, and three procedures on tooth 11 (root canal treatment, post placement, ceramic crown).
- Local browser preview verified the generated Arabic patient-file summary and draft/review warning.
- Browser behavior verified an ambiguous temporary implant procedure stays an exact match, Arabic/English shortcuts switch immediately, Universal lower order is `32` through `17`, and age/name are cleared after changing the MRN.
- Final image inspection verified all FDI teeth, including 48 and 38, are fully visible.
- Browser verification confirmed 30 Arabic and 30 English procedure labels and 32 rendered tooth SVGs.
- Interactive browser verification confirmed the Arabic and English phase labels, repeated procedures on tooth 11, and persisted favorite state in local preview.
- Deterministic note verification confirmed diagnostics appear before initial treatment, surgery/implants, and prosthetics, without introducing a diagnosis or radiographic finding.
- Live local browser inspection verified the refined four-quadrant tooth chart and visual procedure cards.
- Pure bridge verification confirmed official IDs/prices, automatic patient details, grouped quantities and an empty diagnosis field.
- Failure-injection tests confirmed an interrupted first write is repaired on retry and an approved/signed registry status is retained.
- An A → B → retry A regression test confirmed patient aliases remain on the newer plan.
- Concurrency tests confirmed stale Quick Plan revisions are rejected, interrupted day-index writes repair on retry, and older drafts migrate only when unchanged.
- Cross-index verification confirmed the versioned, appointment-day, and permanent-patient plan copies all receive the same edited procedures and source revision.
- Manual-note and manual-price tests confirmed Quick Plan synchronization refuses to overwrite separate cost-plan edits.
- Independent read-only review returned GO with no remaining blocker in the cost-plan bridge scope.

## Remaining work

- The current combined update is fully tested locally; production deployment has not yet been performed.

## Next safe step

- Commit the verified changes, push the branch and publish through the connected Git/Netlify pipeline, then run live production smoke tests.
