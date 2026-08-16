import test from 'node:test';
import assert from 'node:assert/strict';
import { __test as appointments } from '../netlify/functions/appointment-requests.mjs';

test('phone normalization accepts common Saudi formats', () => {
  assert.equal(appointments.cleanPhone('+966 55 000 0001'), '0550000001');
  assert.equal(appointments.cleanPhone('550000001'), '0550000001');
  assert.equal(appointments.cleanPhone('0550000001'), '0550000001');
});

test('public request record strips unsupported values and excessive text', () => {
  const record = appointments.publicRecord({
    id: 'x'.repeat(120),
    name: '  اسم   المريض  ',
    phone: '+966550000001',
    identity: '1-234-567-890',
    service: 'unsupported',
    source: 'dr-yahyahadi',
    note: 'a'.repeat(300),
    status: 'unsupported',
    history: [
      { status: 'contacted', note: ' تم   التواصل ', at: 100, by: ' الإدارة ' },
      { status: 'unsupported', note: 'x'.repeat(300), at: 200, by: 'الموظف' },
    ],
  });
  assert.equal(record.id.length, 80);
  assert.equal(record.name, 'اسم المريض');
  assert.equal(record.phone, '0550000001');
  assert.equal(record.identity, '1234567890');
  assert.equal(record.service, 'other');
  assert.equal(record.source, 'dr-yahyahadi');
  assert.equal(record.status, 'new');
  assert.equal(record.note.length, 220);
  assert.equal(record.history.length, 2);
  assert.deepEqual(record.history[0], { status: 'contacted', note: 'تم التواصل', at: 100, by: 'الإدارة' });
  assert.equal(record.history[1].status, 'new');
  assert.equal(record.history[1].note.length, 220);
});

test('duplicate-request fingerprint is stable across formatted identifiers', () => {
  const first = appointments.submissionFingerprint({
    phone: '+966 55 000 0001',
    identity: '1-234-567-890',
    service: 'examination',
    serviceOther: '',
  });
  const same = appointments.submissionFingerprint({
    phone: '0550000001',
    identity: '1234567890',
    service: 'examination',
    serviceOther: '',
  });
  const different = appointments.submissionFingerprint({
    phone: '0550000001',
    identity: '1234567890',
    service: 'implants',
    serviceOther: '',
  });
  assert.equal(first, same);
  assert.notEqual(first, different);
});

test('internal earliest-appointment request keeps routing fields safely', () => {
  const record = appointments.publicRecord({
    patientId: 'patient-42',
    name: 'مريض مكتمل العلاج',
    file: '7041',
    phone: '0550000001',
    identity: '1234567890',
    clinicId: 'clinic-3',
    doctorName: 'د. يحيى هادي',
    priority: 'urgent',
    sourceDate: '2026-08-11',
    source: 'doctor_earliest',
  });
  assert.equal(record.patientId, 'patient-42');
  assert.equal(record.file, '7041');
  assert.equal(record.clinicId, 'clinic-3');
  assert.equal(record.doctorName, 'د. يحيى هادي');
  assert.equal(record.priority, 'urgent');
  assert.equal(record.sourceDate, '2026-08-11');
  assert.equal(record.source, 'doctor_earliest');
});

test('internal idempotency fingerprint prevents repeated doctor requests', () => {
  const key = 'earliest:clinic-3:2026-08-11:patient-42';
  assert.equal(appointments.internalRequestFingerprint(key), appointments.internalRequestFingerprint(key));
  assert.notEqual(appointments.internalRequestFingerprint(key), appointments.internalRequestFingerprint(`${key}-other`));
});
