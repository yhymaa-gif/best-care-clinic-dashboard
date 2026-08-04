import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __test as directory } from '../netlify/functions/lib/patient-directory.mjs';
import { __test as patients } from '../netlify/functions/patients.mjs';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('central patient directory preserves a complete normalized identity', () => {
  assert.deepEqual(directory.directoryPatient({
    id: ' patient-1 ',
    name: '  أحمد   محمد علي  ',
    file: '7041',
    phone: '+966 55 123 4567',
    nationalId: '1234567890'
  }), {
    id: 'patient-1',
    fullName: 'أحمد محمد علي',
    fileNo: '7041',
    mobile: '0551234567',
    nationalId: '1234567890'
  });
});

test('central patient directory prefers the more complete name and keeps corrected fields locked', () => {
  assert.equal(directory.preferValue('أحمد', 'أحمد محمد علي', { name: true }), 'أحمد محمد علي');
  assert.equal(directory.preferValue('أحمد محمد علي', 'أحمد', { name: true }), 'أحمد محمد علي');
  assert.equal(directory.preferValue('7041', '9999', { locked: true }), '7041');
  assert.equal(directory.preferValue('7041', '9999', { force: true, locked: true }), '9999');
});

test('central patient directory keeps recent appointment context for future visits', () => {
  const snapshot = directory.appointmentSnapshot({
    id: 'p-1', start: '15:30', end: '16:00', status: 'arrived', procedure: 'مراجعة', treatmentPlanStatus: 'doctor_approved'
  }, { clinicId: 'clinic-3', date: '2026-08-05', updatedAt: 1000 });
  assert.equal(snapshot.key, 'clinic-3|2026-08-05|p-1');
  assert.equal(snapshot.treatmentPlanStatus, 'doctor_approved');
  assert.equal(snapshot.updatedAt, 1000);
});

test('central patient endpoint understands legacy and multi-clinic appointment storage', () => {
  assert.deepEqual(patients.parseDayKey('days/2026-08-05'), { clinicId: 'clinic-1', date: '2026-08-05' });
  assert.deepEqual(patients.parseDayKey('clinics/clinic-15/days/2026-08-05'), { clinicId: 'clinic-15', date: '2026-08-05' });
  assert.equal(patients.parseDayKey('clinics/clinic-16/days/2026-08-05'), null);
});

test('patient corrections propagate to appointments, plans, prescriptions, labs, and the directory', async () => {
  const [profile, state, dashboard, prescription, treatmentPlan, toml] = await Promise.all([
    read('netlify/functions/patient-profile.mjs'),
    read('netlify/functions/state.mjs'),
    read('dashboard.js'),
    read('prescription.js'),
    read('treatment-plan.js'),
    read('netlify.toml')
  ]);
  assert.match(profile, /clinic-prescriptions/);
  assert.match(profile, /correctDirectoryPatient/);
  assert.match(profile, /prescriptionUpdates/);
  assert.match(profile, /labUpdates/);
  assert.match(profile, /planUpdates/);
  assert.match(state, /upsertPatientDirectory/);
  assert.match(dashboard, /const PATIENTS_API='\/api\/patients'/);
  assert.match(dashboard, /VIEW_MODE==='admin'\?\(String\(p\.name/);
  assert.match(dashboard, /name:rawName\?rawName\.replace/);
  assert.match(prescription, /preferCompleteName\(patient\.name,storedPatient\.name\)/);
  assert.match(treatmentPlan, /preferCompleteName\(state\.patient\.fullName,source\.name\)/);
  assert.match(treatmentPlan, /state\.patient\.fullName\|\|'—'/);
  assert.match(toml, /from = "\/api\/patients"/);
});
