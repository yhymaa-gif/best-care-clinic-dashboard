import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dashboard = await readFile(new URL('../dashboard.js', import.meta.url), 'utf8');
const state = await readFile(new URL('../netlify/functions/state.mjs', import.meta.url), 'utf8');

test('sync uses revisions, strong storage consistency, and immediate tab signals', () => {
  assert.match(dashboard, /expectedRevision:sync\.ready\?sync\.revision/);
  assert.match(dashboard, /mergePatientVersions\(remote,patient\)/);
  assert.match(dashboard, /new BroadcastChannel\('bestcare-dashboard-sync-v1'\)/);
  assert.match(state, /consistency:\s*['"]strong['"]/);
});

test('sync preserves field update timestamps through the server boundary', () => {
  assert.match(state, /statusUpdatedAt:Number/);
  assert.match(state, /recordUpdatedAt:Number/);
  assert.match(dashboard, /patient\.recordUpdatedAt=now/);
});
