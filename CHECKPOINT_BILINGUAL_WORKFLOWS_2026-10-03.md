# Bilingual workflows checkpoint — 2026-10-03

## Completed

- Treatment-plan editor, print/share sheet, and patient signature page support Arabic and English.
- Plan sharing language is independent from the dashboard language and is carried into the signature link.
- Implant-plan stage kind, order, and deferred state remain stored; patient names and free text are not translated.
- Laboratory, prescription, treatment-plan registry, and critical dashboard action messages follow the selected language.
- PWA cache/release metadata includes the bilingual treatment-plan asset and a new cache version.
- Public consent preserves custom procedure names and non-default phase titles.
- The unauthenticated login shell, Hassina control, and theme control now follow English mode before login.

## Evidence

- `npm run check`: 186/186 passing.
- Focused bilingual/synchronization/performance tests: 23/23 passing.
- Focused public-consent and pre-login language assertions: 4/4 passing.
- Browser audits found no Arabic system text in the English treatment-plan or signature pages and no English system text in their Arabic views.
- Browser console audit: no warnings or errors on treatment plan, signature page, plan registry, or laboratory page.
- Measured local language-switch round trips: treatment plan 185 ms, plan registry 105 ms, laboratory 80 ms.
- Browser audit confirms the English pre-login screen contains English system labels, assistant labels, and theme-control labels.

## Remaining before publish

- Independent reviewer acceptance.
- Final clean working-tree review and commit.
- Deploy Preview smoke test; production remains unchanged until explicit publication approval.

## Next safe step

Address any reviewer finding, rerun the full suite, create a focused commit, then report readiness for Deploy Preview.
