import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dashboard = await readFile(new URL('../dashboard.js', import.meta.url), 'utf8');
const treatmentPlan = await readFile(new URL('../treatment-plan.js', import.meta.url), 'utf8');

test('background reads use resource-saving fallback cadences', () => {
  assert.match(dashboard, /const POLL_MS=60\*1000/);
  assert.match(dashboard, /const SYNC_WORK_HIDDEN_MS=15\*60\*1000/);
  assert.match(dashboard, /const AUX_WORK_MS=5\*60\*1000/);
  assert.match(dashboard, /document\.hidden\?15\*60\*1000:5\*60\*1000/);
  assert.match(dashboard, /syncDisplayVisible\(\)\?2\*60\*1000:10\*60\*1000/);
  assert.match(dashboard, /working\?\(document\.hidden\?10\*60\*1000:3\*60\*1000\)/);
});

test('treatment catalog refresh is throttled and single-flight', () => {
  assert.match(treatmentPlan, /const PROCEDURE_CATALOG_REFRESH_MS=5\*60\*1000/);
  assert.match(treatmentPlan, /if\(procedureCatalogLoading\)return false/);
  assert.match(treatmentPlan, /Date\.now\(\)-procedureCatalogFetchedAt<PROCEDURE_CATALOG_REFRESH_MS/);
  assert.match(treatmentPlan, /finally\{procedureCatalogLoading=false\}/);
  assert.doesNotMatch(treatmentPlan, /loadProcedureCatalog\(true\)\},15000/);
});
