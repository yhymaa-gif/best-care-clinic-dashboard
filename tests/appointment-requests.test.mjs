import test from 'node:test';
import assert from 'node:assert/strict';
import { __test as appointments } from '../netlify/functions/appointment-requests.mjs';

test('phone normalization accepts common Saudi formats', () => {
  assert.equal(appointments.cleanPhone('+966 55 503 3484'), '0555033484');
  assert.equal(appointments.cleanPhone('555033484'), '0555033484');
  assert.equal(appointments.cleanPhone('0555033484'), '0555033484');
});

test('public request record strips unsupported values and excessive text', () => {
  const record = appointments.publicRecord({
    id: 'x'.repeat(120),
    name: '  اسم   المريض  ',
    phone: '+966555033484',
    identity: '1-234-567-890',
    service: 'unsupported',
    source: 'dr-yahyahadi',
    note: 'a'.repeat(300),
    status: 'unsupported',
  });
  assert.equal(record.id.length, 80);
  assert.equal(record.name, 'اسم المريض');
  assert.equal(record.phone, '0555033484');
  assert.equal(record.identity, '1234567890');
  assert.equal(record.service, 'other');
  assert.equal(record.source, 'dr-yahyahadi');
  assert.equal(record.status, 'new');
  assert.equal(record.note.length, 220);
});
