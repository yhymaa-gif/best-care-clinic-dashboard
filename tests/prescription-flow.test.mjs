import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generatePrescriptionPdf } from '../netlify/functions/lib/prescription-pdf.mjs';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('admin patient creation accepts national ID instead of file and mobile', async () => {
  const [html, js] = await Promise.all([read('index.html'), read('dashboard.js')]);
  assert.match(html, /id="fName"[^>]+required/);
  assert.doesNotMatch(html, /id="fFile"[^>]+required/);
  assert.doesNotMatch(html, /id="fPhone"[^>]+required/);
  assert.match(html, /id="fPhoneRelationship"/);
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

test('prescription WhatsApp flow shares the generated PDF with the message', async () => {
  const [js,fn,html]=await Promise.all([read('prescription.js'),read('netlify/functions/prescriptions.mjs'),read('prescription.html')]);
  assert.match(js,/prescriptionUrl\(\{format:'pdf',lang:language\}\)/);
  assert.match(js,/navigator\.canShare\?\.\(\{files:/);
  assert.match(js,/navigator\.share\(\{title:tr\('وصفة طبية'\),text,files:\[file\]\}\)/);
  assert.match(js,/downloadPdf\(file\)/);
  assert.match(fn,/generatePrescriptionPdf\(result\.prescription,language\)/);
  assert.match(fn,/'content-type':'application\/pdf'/);
  assert.match(fn,/'cache-control':'private, no-store, max-age=0'/);
  assert.match(html,/prescription\.js\?v=20261020-whatsapp-pdf/);
  const bytes=await generatePrescriptionPdf({
    patient:{name:'مريض تجريبي',file:'RX-101'},diagnosis:'سبب تجريبي موثق',issuedAt:new Date().toISOString(),
    medicines:[{name:'Paracetamol',strength:'500 mg',dose:'قرص واحد',frequency:'عند الحاجة',duration:'ثلاثة أيام',instructions:'بعد الطعام'}],notes:'ملاحظة تجريبية'
  },'ar');
  assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
  assert.ok(bytes.length>10000);
});
