import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dashboard = await readFile(new URL('../dashboard.js', import.meta.url), 'utf8');
const state = await readFile(new URL('../netlify/functions/state.mjs', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');
const push = await readFile(new URL('../netlify/functions/lib/push.mjs', import.meta.url), 'utf8');

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

test('remote synchronization preserves the patient full name', () => {
  assert.match(dashboard, /name:String\(p\.name\|\|''\)\.trim\(\)/);
  assert.doesNotMatch(dashboard, /patients=Array\.isArray\(data\.patients\)\?data\.patients\.map\(p=>\(\{\.\.\.p,name:firstName\(p\.name\)\}\)\)/);
});

test('remote push wakes open pages and preserves a lightweight polling fallback', () => {
  assert.match(serviceWorker, /BESTCARE_REMOTE_SYNC/);
  assert.match(serviceWorker, /client\.postMessage\(message\)/);
  assert.match(dashboard, /navigator\.serviceWorker\.addEventListener\('message'/);
  assert.match(dashboard, /receiveServiceWorkerSyncSignal\(event\.data\)/);
  assert.match(dashboard, /POLL_MS=15000/);
  assert.match(dashboard, /knownRevision/);
  assert.match(dashboard, /data\.changed===false/);
  assert.match(state, /changed:false/);
  assert.match(dashboard, /authKeepAliveAt>30\*60\*1000/);
  assert.match(dashboard, /document\.hidden\?5\*60\*1000:20\*1000/);
  assert.match(push, /clinicId: event\.clinicId/);
  assert.match(push, /revision: Number\(event\.revision/);
  assert.match(state, /date:state\.date,revision:state\.revision/);
});
