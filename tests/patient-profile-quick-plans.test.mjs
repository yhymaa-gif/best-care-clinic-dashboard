import test from 'node:test';
import assert from 'node:assert/strict';
import { __test as profile } from '../netlify/functions/patient-profile.mjs';

const records = [
  { id: 'same-patient-clinic-1', clinicId: 'clinic-1', patientId: 'patient-canonical-1', patientMrn: '120', items: [{ procedureId: 'root-canal' }], updatedAt: 10 },
  { id: 'same-patient-clinic-2', clinicId: 'clinic-2', patientId: 'patient-canonical-1', patientMrn: '120', items: [{ procedureId: 'extraction' }], updatedAt: 20 },
  { id: 'different-patient-same-mrn', clinicId: 'clinic-2', patientId: 'patient-canonical-2', patientMrn: '120', items: [{ procedureId: 'place-post' }], updatedAt: 30 }
];

test('quick plan profile lookup is scoped to clinic and canonical patient', () => {
  const clinicOne = profile.quickPlanMatches(records, { canonical: 'patient-canonical-1', file: '120' }, { all: false, clinicId: 'clinic-1' });
  assert.deepEqual(clinicOne.map(plan => plan.id), ['same-patient-clinic-1']);
  const clinicTwo = profile.quickPlanMatches(records, { canonical: 'patient-canonical-1', file: '120' }, { all: false, clinicId: 'clinic-2' });
  assert.deepEqual(clinicTwo.map(plan => plan.id), ['same-patient-clinic-2']);
  const admin = profile.quickPlanMatches(records, { canonical: 'patient-canonical-1', file: '120' }, { all: true, clinicId: '' });
  assert.deepEqual(admin.map(plan => plan.id), ['same-patient-clinic-2', 'same-patient-clinic-1']);
});

test('MRN fallback is limited to one clinic; all-clinic queries need canonical identity', () => {
  assert.deepEqual(profile.quickPlanMatches(records, { file: '120' }, { all: false, clinicId: 'clinic-1' }).map(plan => plan.id), ['same-patient-clinic-1']);
  assert.deepEqual(profile.quickPlanMatches(records, { file: '120' }, { all: true, clinicId: '' }), []);
});

test('profile payload exposes quick plans separately without changing legacy plan count', () => {
  const payload = profile.profilePayload({ name: 'Synthetic patient', file: '120' }, [], [], [], [], [], null, [records[0]]);
  assert.equal(payload.summary.plans, 0);
  assert.equal(payload.summary.quickPlans, 1);
  assert.equal(payload.quickPlans[0].items[0].procedureId, 'root-canal');
});
