import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePatientFile, patientIdentityKeys } from '../netlify/functions/lib/patient-identity.mjs';

test('placeholder zero file numbers are never permanent patient identities', () => {
  assert.equal(normalizePatientFile('0'), '');
  assert.equal(normalizePatientFile('0000'), '');
  assert.deepEqual(patientIdentityKeys({ file: '0' }), []);
});

test('national ID identifies patients whose file is zero; mobile never joins identities', () => {
  assert.deepEqual(patientIdentityKeys({ file: '0', phone: '+966501234567', nationalId: '1234567890' }), [
    'national:1234567890'
  ]);
});
test('file then national ID, with no phone-only fallback even for the same name',()=>{
  assert.deepEqual(patientIdentityKeys({file:'123',nationalId:'1234567890',phone:'0501234567'}),['file:123','national:1234567890']);
  assert.deepEqual(patientIdentityKeys({name:'Ahmed Ali',phone:'0501234567'}),[]);
});

test('valid file numbers continue to normalize consistently', () => {
  assert.equal(normalizePatientFile(' A-102 '), 'A102');
  assert.deepEqual(patientIdentityKeys({ file: ' A-102 ' }), ['file:A102']);
});
