import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __test as profile } from '../netlify/functions/patient-profile.mjs';

test('patient profile normalizes exact identity lookups', () => {
  assert.equal(profile.normalizeLookup('file', ' A-120 '), 'A120');
  assert.equal(profile.normalizeLookup('phone', '+966 50 123 4567'), '0501234567');
  assert.equal(profile.normalizeLookup('national', '1234567890'), '1234567890');
  assert.equal(profile.normalizeLookup('file', '0'), '');
});

test('patient profile links appointments by any stable patient identity', () => {
  const aliases = new Set(['file:A120', 'phone:0501234567']);
  assert.equal(profile.hasAlias({ file: 'A-120', phone: '' }, aliases), true);
  assert.equal(profile.hasAlias({ file: '', phone: '+966501234567' }, aliases), true);
  assert.equal(profile.hasAlias({ file: 'A121', phone: '0500000000' }, aliases), false);
});

test('patient profile parses both legacy and clinic-scoped appointment keys', () => {
  assert.deepEqual(profile.parseDayKey('days/2026-08-02'), { clinicId: 'clinic-1', date: '2026-08-02' });
  assert.deepEqual(profile.parseDayKey('clinics/clinic-15/days/2026-08-03'), { clinicId: 'clinic-15', date: '2026-08-03' });
  assert.equal(profile.parseDayKey('clinics/clinic-16/days/2026-08-03'), null);
});

test('patient profile summarizes WhatsApp plan and review communication events', () => {
  const summary = profile.communicationPayload([{ canonical: 'patient-1', record: {
    counts: { planWhatsapp: 3, reviewWhatsapp: 2 },
    lastAt: { planWhatsapp: 300, reviewWhatsapp: 250 },
    events: [
      { id: 'p-3', kind: 'plan_whatsapp', at: 300 },
      { id: 'r-2', kind: 'review_whatsapp', at: 250 }
    ]
  } }]);
  assert.equal(summary.planWhatsappCount, 3);
  assert.equal(summary.reviewWhatsappCount, 2);
  assert.equal(summary.lastPlanWhatsappAt, 300);
  assert.equal(summary.lastReviewWhatsappAt, 250);
  assert.deepEqual(summary.events.map(event => event.id), ['p-3', 'r-2']);
});

test('dashboard exposes a unified patient record and local theme control', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="patientProfileForm"/);
  assert.match(html, /data-profile-tab="appointments"/);
  assert.match(html, /data-profile-tab="plans"/);
  assert.match(html, /data-profile-tab="payments"/);
  assert.match(html, /data-profile-tab="labs"/);
  assert.match(html, /id="themeToggleBtn"/);
  assert.match(html, /id="patientProfilePlanWhatsappCount"/);
  assert.match(html, /id="patientProfileReviewWhatsappCount"/);
  assert.match(html, /data-profile-tab="communications"/);
});

test('successful WhatsApp actions record central patient communication', async () => {
  const dashboard = await readFile(new URL('../dashboard.js', import.meta.url), 'utf8');
  const state = await readFile(new URL('../netlify/functions/state.mjs', import.meta.url), 'utf8');
  const plan = await readFile(new URL('../treatment-plan.js', import.meta.url), 'utf8');
  assert.match(dashboard, /recordPatientCommunication\(patient,'review_whatsapp'/);
  assert.match(dashboard, /patient\.reviewRequestedAt=requestedAt/);
  assert.match(dashboard, /if\(sendButton\?\.disabled\)return/);
  assert.match(dashboard, /review-requested/);
  assert.match(state, /reviewRequestedAt:Number/);
  assert.match(state, /reviewRequestCount:Math\.max/);
  assert.match(state, /reviewLastEventId:String/);
  assert.match(plan, /recordPlanWhatsappCommunication\(\)/);
  assert.match(plan, /kind:'plan_whatsapp'/);
});
