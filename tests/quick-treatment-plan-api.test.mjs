import test from 'node:test';
import assert from 'node:assert/strict';
import quickPlans, { __test } from '../netlify/functions/quick-treatment-plans.mjs';
import { DEFAULT_CATALOG_ITEMS } from '../netlify/functions/treatment-catalog.mjs';
import { DRAFT_NOTICE } from '../quick-plan-core.js';

test('server validates against the current catalog ID, not client labels', () => {
  const input = [{ toothNumber: '#09', procedureId: 'root-canal', officialName: 'Client-forged name', matchState: 'exact' }];
  const validated = __test.validateItems(input, DEFAULT_CATALOG_ITEMS, 'universal');
  assert.equal(validated.items[0].officialName, 'علاج عصب');
  assert.equal(validated.items[0].procedureId, 'root-canal');
  assert.equal(__test.validateItems([{ ...input[0], procedureId: 'fake' }], DEFAULT_CATALOG_ITEMS, 'universal').error.length > 0, true);
  assert.equal(__test.validateItems([{ ...input[0], toothNumber: '99' }], DEFAULT_CATALOG_ITEMS, 'universal').error.length > 0, true);
  assert.equal(__test.validateItems(input, DEFAULT_CATALOG_ITEMS.map(item => item.id === 'root-canal' ? { ...item, status: 'inactive' } : item), 'universal').error.length > 0, true);
});

test('write endpoint rejects foreign origins before any storage access', async () => {
  const request = new Request('https://bestcaredentalclinicsdash.netlify.app/api/quick-treatment-plans', {
    method: 'POST', headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
    body: JSON.stringify({ clinicId: 'clinic-1' })
  });
  const response = await quickPlans(request);
  assert.equal(response.status, 403);
});

test('clinician output edits remain separate from structured items and retain draft notice', () => {
  const overrides = __test.cleanOutputOverrides({ clinicalNote: '  Clinician-edited documentation\u0000  ', whatsappText: 'Custom copy', unknown: 'ignored' });
  assert.deepEqual(Object.keys(overrides).sort(), ['clinicalNote', 'whatsappText']);
  const plan = { items: [{ toothNumber: '09', procedureId: 'root-canal', officialName: 'علاج عصب', officialNameEn: 'Root canal treatment' }], clinicianData: {}, outputOverrides: overrides };
  const output = __test.generated(plan);
  assert.match(output.clinicalNote, /Clinician-edited documentation/);
  assert.match(output.clinicalNote, new RegExp(DRAFT_NOTICE));
  assert.match(output.treatmentPlanText, /Root canal treatment/);
  assert.equal(plan.items[0].procedureId, 'root-canal');
});

test('approval requires an admin-configured treating dentist identity, never clinic role alone', () => {
  const user = { username: 'doctor12', displayName: 'Dr Synthetic', role: 'clinic', clinicId: 'clinic-12' };
  const account = { ...user };
  const config = { clinics: [{ id: 'clinic-12', doctorName: 'Dr Synthetic' }] };
  assert.equal(__test.isVerifiedTreatingDentist(user, account, config, 'clinic-12'), true);
  assert.equal(__test.isVerifiedTreatingDentist(user, account, { clinics: [{ id: 'clinic-12', doctorName: '' }] }, 'clinic-12'), false);
  assert.equal(__test.isVerifiedTreatingDentist(user, { ...account, displayName: 'Nurse Synthetic' }, config, 'clinic-12'), false);
  assert.equal(__test.isVerifiedTreatingDentist(user, account, config, 'clinic-11'), false);
  assert.equal(__test.isVerifiedTreatingDentist({ ...user, role: 'admin' }, account, config, 'clinic-12'), false);
});

test('server-generated outputs carry the persisted tooth numbering system', () => {
  const plan = { items: [{ toothNumber: '11', procedureId: 'root-canal', officialNameEn: 'Root canal treatment' }], clinicianData: {}, numberingSystem: 'fdi' };
  const output = __test.generated(plan);
  for (const value of Object.values(output)) assert.match(value, /FDI two-digit tooth numbering/);
});

test('changing structured items or clinician data invalidates stale output overrides', () => {
  const existing = {
    items: [{ toothNumber: '11', procedureId: 'root-canal' }],
    clinicianData: { diagnosis: '' },
    outputOverrides: { treatmentPlanText: 'Old text for tooth 11' }
  };
  assert.equal(__test.sourceDataChanged(existing, [{ toothNumber: '21', procedureId: 'extraction' }], existing.clinicianData), true);
  assert.equal(__test.sourceDataChanged(existing, existing.items, { diagnosis: 'Clinician-entered diagnosis' }), true);
  assert.equal(__test.sourceDataChanged(existing, existing.items, existing.clinicianData), false);
});
