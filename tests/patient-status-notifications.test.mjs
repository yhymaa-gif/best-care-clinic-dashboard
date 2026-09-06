import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __test as state } from '../netlify/functions/state.mjs';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const patient = (status, overrides = {}) => ({
  id: 'synthetic-patient-1',
  name: 'مريض اختباري كامل',
  file: '1234',
  start: '15:30',
  status,
  ...overrides
});

test('status push states name the action, appointment time, and distinct color', () => {
  const clinic = { id: 'clinic-3', name: 'عيادة اختبار', roomNumber: '3', doctorName: 'طبيب اختبار' };
  const cancelled = state.pushEvents([patient('waiting')], [patient('cancel')], {}, {}, clinic)[0];
  assert.equal(cancelled.title, 'إلغاء موعد مريض');
  assert.equal(cancelled.patientName, 'مريض اختباري كامل');
  assert.equal(cancelled.appointmentTime, '15:30');
  assert.equal(cancelled.actionLabel, 'أُلغي الموعد');
  assert.equal(cancelled.color, '#dc2626');
  assert.match(cancelled.body, /موعد الساعة 15:30/);

  const active = state.pushEvents([patient('arrived')], [patient('active')], {}, {}, clinic)[0];
  assert.equal(active.color, '#16a34a');
  assert.equal(active.actionLabel, 'بدأ العلاج');

  const late = state.pushEvents([patient('waiting')], [patient('late')], {}, {}, clinic)[0];
  assert.equal(late.color, '#ea580c');
  assert.equal(late.actionLabel, 'متأخر عن الموعد');
});

test('administration subscriptions and notification surfaces support named colored updates', async () => {
  const [dashboard, push, worker, html] = await Promise.all([
    read('dashboard.js'),
    read('netlify/functions/lib/push.mjs'),
    read('service-worker.js'),
    read('index.html')
  ]);
  assert.match(dashboard, /showPatientDetails:VIEW_MODE==='admin'/);
  assert.match(dashboard, /المريض \$\{patient\.name\} — الساعة \$\{at\}/);
  assert.match(push, /المريض \$\{event\.patientName\}/);
  assert.match(push, /color: safeColor\(event\.color\)/);
  assert.match(worker, /color:payload\.color\|\|'#176344'/);
  assert.match(html, /dashboard\.js\?v=20260906-payment-plan-link/);
});
