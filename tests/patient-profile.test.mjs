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

test('dashboard exposes a unified patient record and local theme control', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="patientProfileForm"/);
  assert.match(html, /data-profile-tab="appointments"/);
  assert.match(html, /data-profile-tab="plans"/);
  assert.match(html, /data-profile-tab="payments"/);
  assert.match(html, /data-profile-tab="labs"/);
  assert.match(html, /id="themeToggleBtn"/);
});
