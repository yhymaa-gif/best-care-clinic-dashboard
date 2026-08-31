import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('admin patient creation requires full name, non-zero file, and Saudi mobile', async () => {
  const [html, js] = await Promise.all([read('index.html'), read('dashboard.js')]);
  assert.match(html, /id="fName"[^>]+required/);
  assert.match(html, /id="fFile"[^>]+required/);
  assert.match(html, /id="fPhone"[^>]+required/);
  assert.match(js, /normalizedName\.split\(' '\).*length<2/);
  assert.match(js, /isZeroFileNumber\(fileNumber\)/);
  assert.match(js, /\^05\\d\{8\}\$/);
  assert.doesNotMatch(js, /name:firstName\(rawName\)/);
});

test('prescription flow is patient-linked, categorized, recoverable, and stored separately', async () => {
  const [html, js, fn, toml, sw, dashboard, index] = await Promise.all([
    read('prescription.html'), read('prescription.js'), read('netlify/functions/prescriptions.mjs'), read('netlify.toml'), read('service-worker.js'), read('dashboard.js'), read('index.html')
  ]);
  assert.match(html, /id="medicalReview"[^>]+required/);
  assert.match(html, /id="doctorConfirm"[^>]+required/);
  assert.match(html, /DRAFT — NOT MEDICAL ADVICE — DOCUMENTATION-ONLY — AUTHORIZED CLINICIAN SIGN-OFF REQUIRED/);
  for (const id of ['medicineCategory', 'medicinePreset', 'medicineName', 'medicineDose', 'medicineFrequency', 'medicineDuration', 'prescriptionHistory']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(js, /antibiotic:'مضاد حيوي'/);
  assert.match(js, /analgesic:'مسكن'/);
  assert.match(js, /mouthwash:'مضمضة'/);
  assert.match(js, /function renderHistory\(\)/);
  assert.match(js, /patientId=params\.get\('patientId'\)/);
  assert.match(fn, /requireUser\(request\)/);
  assert.match(fn, /sameOriginRequest\(request\)/);
  assert.match(fn, /clinic-prescriptions/);
  assert.match(fn, /registry\/global/);
  assert.match(fn, /permanentKey/);
  assert.match(fn, /expectedRevision/);
  assert.match(fn, /ready_for_admin/);
  assert.match(dashboard, /patientSummaryButtonMarkup\(p\)/);
  const patientSummary = await read('patient-summary.js');
  assert.match(patientSummary, /button\('data-prescription-id'/);
  assert.match(dashboard, /if\(prescription\)openPrescription\(prescription\)/);
  assert.doesNotMatch(dashboard, /class="mini prescription-row-btn"/);
  assert.match(index, /id="prescriptionCheck"/);
  assert.match(index, /id="operationPrescriptionsCount"/);
  assert.match(toml, /from = "\/api\/prescriptions"/);
  assert.match(sw, /prescription\.html/);
});
