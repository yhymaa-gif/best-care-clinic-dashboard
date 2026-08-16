import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = file => readFile(new URL(file, root), 'utf8');

test('doctor completion menu exposes an idempotent earliest-appointment action', async () => {
  const dashboard = await read('dashboard.js');
  assert.match(dashboard, /const EARLIEST_APPOINTMENT_ACTION='request_earliest_appointment'/);
  assert.match(dashboard, /if\(key!==['"]done['"]\|\|VIEW_MODE!==['"]clinic['"]\)return statusOption/);
  assert.match(dashboard, /source:'doctor_earliest'/);
  assert.match(dashboard, /idempotencyKey:`earliest:\$\{ACTIVE_CLINIC_ID\}:\$\{selectedDate\}:\$\{patient\.id\}`/);
  assert.match(dashboard, /if\(status===EARLIEST_APPOINTMENT_ACTION\)/);
  assert.doesNotMatch(dashboard, /p\.status\s*=\s*EARLIEST_APPOINTMENT_ACTION/);
});

test('earliest request is persisted on patient state and surfaced in administration', async () => {
  const [dashboard, html, stateFunction] = await Promise.all([
    read('dashboard.js'),
    read('index.html'),
    read('netlify/functions/state.mjs'),
  ]);
  assert.match(stateFunction, /earliestAppointmentRequestId/);
  assert.match(stateFunction, /earliestAppointmentRequestedAt/);
  assert.match(dashboard, /type==='earliest'/);
  assert.match(dashboard, /scope==='earliest'/);
  assert.match(dashboard, /renderAdminPatientHub\(\)/);
  assert.match(html, /id="adminHubEarliestCount"/);
  assert.match(html, /أقرب موعد ⚡/);
});
