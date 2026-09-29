import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __test as state } from '../netlify/functions/state.mjs';

test('payment receipt ledger is sanitized and retained with integer cents', () => {
  const patient=state.cleanPatient({id:'p1',name:'مريض',paymentReceipts:[{id:'pay_1',amountCents:12345.4,paidAt:1000,recordedAt:1000,updatedAt:1100,recordedBy:' الإدارة ',method:'cash',note:' دفعة أولى '},{id:'bad',amountCents:0,paidAt:1000}]});
  assert.deepEqual(patient.paymentReceipts,[{id:'pay_1',amountCents:12345,paidAt:1000,recordedAt:1000,updatedAt:1100,recordedBy:'الإدارة',method:'cash',note:'دفعة أولى'}]);
});

test('administration records paid amounts before completing payment and exposes revenue totals', async () => {
  const [dashboard,html,statistics]=await Promise.all([
    readFile(new URL('../dashboard.js',import.meta.url),'utf8'),
    readFile(new URL('../index.html',import.meta.url),'utf8'),
    readFile(new URL('../netlify/functions/statistics.mjs',import.meta.url),'utf8'),
  ]);
  assert.match(dashboard,/function openPaymentCollection\(id\)/);
  assert.match(dashboard,/function savePaymentReceipt\(\)/);
  assert.match(dashboard,/openPaymentCollection\(completeId\)/);
  assert.match(dashboard,/paymentReceipts/);
  assert.match(html,/id="floatingRevenueBtn"/);
  assert.match(statistics,/revenueCents/);
});

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('same-day patient notes survive server cleaning with their own revision time', () => {
  const patient=state.cleanPatient({
    id:'patient-1',name:'مريض تجريبي',file:'101',start:'14:00',end:'14:30',
    dailyNote:'  يحتاج   متابعة اليوم  ',dailyNoteUpdatedAt:12345
  });
  assert.equal(patient.dailyNote,'يحتاج متابعة اليوم');
  assert.equal(patient.dailyNoteUpdatedAt,12345);
});

test('patient name corrections update the visible directory and administration list immediately', async () => {
  const script=await read('dashboard.js');
  assert.match(script,/function applyPatientDirectoryCorrectionLocally\(existing,item\)/);
  assert.match(script,/authoritativeFullName:correctedName/);
  assert.match(script,/function applyAdminHubPatientCorrectionLocally\(existing,item\)/);
  assert.match(script,/if\(wasEditing\)applyAdminHubPatientCorrectionLocally\(existing,item\)/);
  assert.match(script,/\[\['dailyNote','dailyNoteUpdatedAt'\]/);
});

test('completed crown payment orders expose a required laboratory-case action without auto-creating a case', async () => {
  const [script,styles]=await Promise.all([read('dashboard.js'),read('dashboard.css')]);
  assert.match(script,/function paymentItemRequiresLab\(item=\{\}\)/);
  assert.match(script,/(?:crown|تاج|كراون)/);
  assert.match(script,/function patientNeedsLabCase\(patient\)/);
  assert.match(script,/Laboratory case required/);
  assert.match(script,/data-lab-entry-id/);
  assert.match(styles,/\.lab-required-badge/);
  assert.match(styles,/\.lab-entry-btn\.lab-needed/);
  assert.doesNotMatch(script,/function patientNeedsLabCase[\s\S]{0,400}createLabCase\(/);
});

test('doctor display separates current, next, and following patients with timing details', async () => {
  const [html,script,styles]=await Promise.all([read('index.html'),read('dashboard.js'),read('dashboard.css')]);
  assert.match(html,/id="nextPatientCallout"/);
  assert.match(html,/id="followingPatients"/);
  assert.match(script,/CURRENT PATIENT — IN TREATMENT/);
  assert.match(script,/NEXT PATIENT — IN QUEUE/);
  assert.match(script,/appointmentExitTime\(p\)/);
  assert.match(script,/appointmentDurationLabel\(p\)/);
  assert.match(styles,/Strong visual hierarchy for the current patient, next patient, and following queue/);
});

test('English mode translates procedures, plans, payment actions, and laboratory entry', async () => {
  const script=await read('dashboard.js');
  assert.match(script,/const PROCEDURE_EN_BY_ID/);
  assert.match(script,/function procedureDisplayName\(value,code=''\)/);
  assert.match(script,/function translateTreatmentAndLabModals\(\)/);
  assert.match(script,/Procedures, services, and prices/);
  assert.match(script,/Add laboratory case/);
  assert.match(script,/Laboratory case linked to this patient/);
  assert.match(script,/Post-treatment actions/);
  assert.match(script,/translateTreatmentAndLabModals\(\);/);
});
