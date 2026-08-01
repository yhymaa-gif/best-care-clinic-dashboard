import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('cancelled treatment plans are supported across UI and storage', async () => {
  const [dashboard, center, planApi, registryApi, stateApi] = await Promise.all([
    read('dashboard.js'),
    read('treatment-plans.js'),
    read('netlify/functions/treatment-plan.mjs'),
    read('netlify/functions/treatment-plan-registry.mjs'),
    read('netlify/functions/state.mjs')
  ]);

  for (const source of [dashboard, center, planApi, registryApi, stateApi]) {
    assert.match(source, /cancelled/, 'cancelled status must be preserved at every data boundary');
  }
  assert.match(dashboard, /cancelled:'خطة ملغاة'/);
  assert.match(center, /cancelled:'خطة ملغاة'/);
  assert.match(registryApi, /cancellationReason/);
  assert.match(planApi, /cancelledAt/);
});

test('cancelled plans are archived and excluded from action-required counts', async () => {
  const [dashboard, center] = await Promise.all([read('dashboard.js'), read('treatment-plans.js')]);
  assert.match(dashboard, /function planCenterIsUnapproved\(status\)\{return \['draft','submitted','patient_accepted','rejected'\]\.includes\(status\)\}/);
  assert.match(center, /const needsAction=status=>\['draft','submitted','patient_accepted','rejected'\]\.includes\(status\)/);
  assert.match(dashboard, /if\(current==='cancelled'\)return next==='draft'/);
});
