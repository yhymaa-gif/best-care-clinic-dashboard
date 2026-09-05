import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = file => fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('administration flags started treatment until the plan is approved and printed', async () => {
  const [dashboard, css] = await Promise.all([read('dashboard.js'), read('dashboard.css')]);
  assert.match(dashboard, /function treatmentPlanComplianceState\(patient,clinicId=ACTIVE_CLINIC_ID\)/);
  assert.match(dashboard, /hasStarted=Number\(patient\.actualStartedAt\|\|0\)>0\|\|\['active','done'\]\.includes\(appointmentStatus\)/);
  assert.match(dashboard, /hasPayment=paymentOrderExists\(patient\)/);
  assert.match(dashboard, /hasLab=treatmentEvidenceLabCases\(patient,clinicId\)\.length>0/);
  assert.match(dashboard, /type:'plan_started_missing'/);
  assert.match(dashboard, /type:'plan_started_unapproved'/);
  assert.match(dashboard, /type:'plan_started_unprinted'/);
  assert.match(dashboard, /treatmentPlanComplianceBadgeMarkup\(p\)/);
  assert.match(css, /\.plan-compliance-alert/);
  assert.match(css, /\.plan-required-action/);
});

test('printing is persisted to the plan, daily patient state, and registry', async () => {
  const [client, planApi, registryApi, historyApi, stateApi] = await Promise.all([
    read('treatment-plan.js'),
    read('netlify/functions/treatment-plan.mjs'),
    read('netlify/functions/treatment-plan-registry.mjs'),
    read('netlify/functions/lib/treatment-plan-history.mjs'),
    read('netlify/functions/state.mjs')
  ]);
  assert.match(client, /state\.meta\.lastPrintedAt=Date\.now\(\)/);
  assert.match(client, /await Promise\.all\(\[syncPlanStatusToDashboard\(state\.meta\.status\),syncPlanRegistry\(state\.meta\.status\)\]\)/);
  assert.match(client, /treatmentPlanPrintedAt:Number\(state\.meta\.lastPrintedAt\|\|0\)/);
  assert.match(client, /lastPrintedAt:state\.meta\.lastPrintedAt\|\|0/);
  assert.match(planApi, /lastPrintedAt: cleanNumber\(plan\?\.meta\?\.lastPrintedAt/);
  assert.match(registryApi, /lastPrintedAt: Math\.max\(0, Number\(body\?\.lastPrintedAt/);
  assert.match(historyApi, /lastPrintedAt: Number\(meta\.lastPrintedAt \|\| 0\)/);
  assert.match(stateApi, /treatmentPlanPrintedAt:Number\(p\?\.treatmentPlanPrintedAt\|\|0\)/);
});

test('editing or changing approval invalidates an earlier print record', async () => {
  const [planClient, dashboard] = await Promise.all([read('treatment-plan.js'), read('dashboard.js')]);
  assert.match(planClient, /function markDirty\(\)[\s\S]*?state\.meta\.lastPrintedAt=0/);
  assert.match(dashboard, /function applyPlanStatusMetadata[\s\S]*?plan\.meta\.lastPrintedAt=0/);
  assert.match(dashboard, /target\.treatmentPlanPrintedAt=0/);
});
