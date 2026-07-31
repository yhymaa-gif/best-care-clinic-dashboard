import test from 'node:test';
import assert from 'node:assert/strict';
import { __test as lookup } from '../netlify/functions/patient-lookup.mjs';

test('patient lookup normalizes exact file, Saudi phone, and national ID values', () => {
  assert.equal(lookup.normalizeFile(' 12-34 '), '1234');
  assert.equal(lookup.normalizePhone('+966 50 123 4567'), '0501234567');
  assert.equal(lookup.normalizePhone('0501234567'), '0501234567');
  assert.equal(lookup.normalizeNationalId('1 234 567 890'), '1234567890');
});

test('patient lookup matches the selected identity type only', () => {
  const patient = { file: 'A-102', phone: '+966501234567', nationalId: '1234567890' };
  assert.equal(lookup.patientMatches(patient, 'file', 'A102'), true);
  assert.equal(lookup.patientMatches(patient, 'phone', '0501234567'), true);
  assert.equal(lookup.patientMatches(patient, 'national', '1234567890'), true);
  assert.equal(lookup.patientMatches(patient, 'file', 'A103'), false);
});

test('patient lookup parses legacy and clinic-scoped day keys', () => {
  assert.deepEqual(lookup.parseDayKey('days/2026-07-31'), { clinicId: 'clinic-1', date: '2026-07-31' });
  assert.deepEqual(lookup.parseDayKey('clinics/clinic-15/days/2026-07-31'), { clinicId: 'clinic-15', date: '2026-07-31' });
  assert.equal(lookup.parseDayKey('clinics/clinic-16/days/2026-07-31'), null);
});
