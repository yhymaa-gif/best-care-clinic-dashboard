import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pulseSignatures, dayKey } from '../netlify/functions/pulse.mjs';

const fakeStore = (entries = {}) => ({
  entries,
  async getMetadata(key) { return key in entries ? { etag: entries[key] } : null; },
  async list({ prefix }) { return { blobs: Object.entries(entries).filter(([key]) => key.startsWith(prefix)).map(([key, etag]) => ({ key, etag })) }; },
});

test('pulse signatures change only for the area whose data changed', async () => {
  const stores = {
    days: fakeStore({ [dayKey('clinic-1', '2026-11-21')]: 'a', [dayKey('clinic-2', '2026-11-21')]: 'b' }),
    labs: fakeStore({ 'clinics/clinic-1': 'l1' }),
    quickPlans: fakeStore({ 'clinics/clinic-1/plans/p1': 'q1' }),
    requests: fakeStore({ 'requests/r1': 'r1' }),
    registry: fakeStore({ 'registry/global': 'g1' }),
    prescriptions: fakeStore({ 'registry/global': 'x1' }),
    alerts: fakeStore({ current: 'c1' }),
  };
  const args = { clinicIds: ['clinic-1', 'clinic-2'], activeClinic: 'clinic-1', date: '2026-11-21', stores };
  const first = await pulseSignatures(args);
  stores.days.entries[dayKey('clinic-2', '2026-11-21')] = 'b2';
  const second = await pulseSignatures(args);
  assert.notEqual(first.allDays, second.allDays);
  assert.equal(first.activeDay, second.activeDay);
  assert.equal(first.labs, second.labs);
  stores.quickPlans.entries['clinics/clinic-1/plans/p2'] = 'q2';
  stores.requests.entries['requests/r1'] = 'r1b';
  const third = await pulseSignatures(args);
  assert.notEqual(second.quickPlans, third.quickPlans);
  assert.notEqual(second.appointmentRequests, third.appointmentRequests);
  assert.equal(second.registry, third.registry);
  assert.equal(dayKey('clinic-1', '2026-11-21'), 'days/2026-11-21');
});

test('admin polling defers to the pulse and falls back when it fails', async () => {
  const dashboard = await readFile(new URL('../dashboard.js', import.meta.url), 'utf8');
  assert.match(dashboard, /pulseDelay\(20000\)/);
  assert.match(dashboard, /pulseDelay\(appointmentRequestCadence\(\)\)/);
  assert.match(dashboard, /if\(adminPulse\.healthy\)return ADMIN_PULSE_SAFETY_MS;/);
  assert.match(dashboard, /if\(adminPulse\.failures>=2\)setAdminPulseHealthy\(false\)/);
  assert.match(dashboard, /startAdminPulse\(\);startAdminQuickPlanInbox\(\)/);
});
