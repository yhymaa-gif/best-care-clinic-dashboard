import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { __test as history } from '../netlify/functions/lib/treatment-plan-history.mjs';

test('a new plan for a later appointment gets a different registry record', () => {
  const old = {
    oldPlan: {
      clinicId: 'clinic-1',
      planNo: 'TP-2026-000001',
      sourcePatientId: 'appointment-old',
      sourceDate: '2026-07-20',
      updatedAt: 100
    }
  };
  const next = {
    clinicId: 'clinic-1',
    planNo: 'TP-2026-000002',
    sourcePatientId: 'appointment-new',
    sourceDate: '2026-07-24'
  };
  assert.equal(history.findCanonical(old, next), '');
});

test('status updates target the same plan without replacing another plan', () => {
  const records = {
    oldPlan: { clinicId: 'clinic-1', planNo: 'TP-2026-000001', sourcePatientId: 'appointment-old', sourceDate: '2026-07-20' },
    newPlan: { clinicId: 'clinic-1', planNo: 'TP-2026-000002', sourcePatientId: 'appointment-new', sourceDate: '2026-07-24' }
  };
  assert.equal(history.findCanonical(records, { clinicId: 'clinic-1', planNo: 'TP-2026-000001', sourcePatientId: 'appointment-old', sourceDate: '2026-07-20' }), 'oldPlan');
  assert.equal(history.findCanonical(records, { clinicId: 'clinic-1', planNo: 'TP-2026-000002', sourcePatientId: 'appointment-new', sourceDate: '2026-07-24' }), 'newPlan');
});

test('history hydration candidate keeps the addendum relationship and patient identity', () => {
  const candidate = history.candidateFromStored({
    clinicId: 'clinic-1',
    patientId: 'appointment-new',
    date: '2026-07-24',
    updatedAt: 200,
    plan: {
      meta: { planNo: 'TP-2026-000002', parentPlanNo: 'TP-2026-000001', relation: 'addendum', status: 'draft' },
      patient: { fullName: 'ملاك الحسن الحفظي', fileNo: '1234', mobile: '0555555555', nationalId: '1234567890' }
    }
  }, 'clinics/clinic-1/days/2026-07-24/patients/hash', 'clinic-1');
  assert.equal(candidate.relation, 'addendum');
  assert.equal(candidate.parentPlanNo, 'TP-2026-000001');
  assert.equal(candidate.fullName, 'ملاك الحسن الحفظي');
  assert.deepEqual([...history.aliasesFor(candidate)].sort(), ['file:1234', 'national:1234567890', 'phone:0555555555'].sort());
});

test('client creates a fresh addendum when a prior plan is carried forward', () => {
  const source = fs.readFileSync(new URL('../treatment-plan.js', import.meta.url), 'utf8');
  assert.match(source, /remoteResult\?\.carriedForward&&!local/);
  assert.match(source, /relation:'addendum'/);
  assert.match(source, /parentPlanNo:previousPlanNo/);
});

test('historical plan actions address the plan number, not only the appointment', () => {
  const server = fs.readFileSync(new URL('../netlify/functions/treatment-plan.mjs', import.meta.url), 'utf8');
  const center = fs.readFileSync(new URL('../treatment-plans.js', import.meta.url), 'utf8');
  assert.match(server, /versionedPlanKey/);
  assert.match(server, /requestedPlanNo/);
  assert.match(center, /planNo:record\.planNo\|\|''/);
});
