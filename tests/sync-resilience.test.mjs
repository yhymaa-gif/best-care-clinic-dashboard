import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const dashboard = await readFile(new URL('../dashboard.js', import.meta.url), 'utf8');
const state = await readFile(new URL('../netlify/functions/state.mjs', import.meta.url), 'utf8');
const patientProfile = await readFile(new URL('../netlify/functions/patient-profile.mjs', import.meta.url), 'utf8');
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
  assert.match(dashboard, /POLL_MS=5\*1000/);
  assert.match(dashboard, /syncDisplayVisible\(\)\?10000:60000/);
  assert.match(push, /clinicId: event\.clinicId/);
  assert.match(push, /revision: Number\(event\.revision/);
  assert.match(state, /date:state\.date,revision:state\.revision/);
});

test('state save does not wait for external push delivery when Netlify waitUntil is available', () => {
  assert.match(state, /export default async \(request, context = \{\}\)/);
  assert.match(state, /context\?\.waitUntil/);
  assert.match(state, /context\.waitUntil\(notificationWork\)/);
  assert.match(state, /else await notificationWork/);
  assert.ok(state.indexOf('await store.setJSON(key,state)') < state.indexOf('context.waitUntil(notificationWork)'));
});

test('slow identity corrections and an in-flight cycle cannot swallow a newer sync wake', () => {
  const pushStateBody = dashboard.slice(dashboard.indexOf('async function pushState'), dashboard.indexOf('function applyRemote'));
  assert.doesNotMatch(pushStateBody, /await flushPatientDirectoryCorrections/);
  assert.match(pushStateBody, /schedulePatientDirectoryCorrectionRetry\(0\)/);
  assert.match(dashboard, /if\(sync\.cycleRunning\)\{sync\.pendingWake=true;return\}/);
  assert.match(dashboard, /const nextDelay=sync\.pendingWake\?50:/);
});

test('an older correction cannot delete a newer edit and correction batches are single-flight', async () => {
  const start = dashboard.indexOf('async function processPatientDirectoryCorrections');
  const end = dashboard.indexOf('function loadLocal', start);
  assert.ok(start > 0 && end > start);
  let releaseFirst;
  const scheduled = [];
  const calls = [];
  const context = vm.createContext({
    sync: {
      pushing: false,
      directoryCorrectionRunning: false,
      directoryCorrectionTimer: null,
      directoryCorrections: [{id:'A',patientId:'p1',lookup:{type:'file',value:'1'},patient:{name:'Old edit'}}]
    },
    authUser:{role:'admin'},VIEW_MODE:'clinic',patientIdentityDirectory:{},
    clearTimeout(){},setTimeout(fn){scheduled.push(fn);return scheduled.length},
    persistPatientDirectoryCorrections(){},refreshAdminPatientHub(){},
    flushPatientDirectoryCorrections(batch){
      calls.push(batch.map(item=>item.id));
      if(calls.length===1)return new Promise(resolve=>{releaseFirst=()=>resolve({applied:['A'],failed:[]})});
      return Promise.resolve({applied:batch.map(item=>item.id),failed:[]});
    }
  });
  vm.runInContext(dashboard.slice(start,end),context);
  const first=context.processPatientDirectoryCorrections();
  context.sync.directoryCorrections=[{id:'B',patientId:'p1',lookup:{type:'file',value:'1'},patient:{name:'New edit'}}];
  assert.equal(await context.processPatientDirectoryCorrections(),false);
  assert.deepEqual(calls,[['A']]);
  releaseFirst();await first;
  assert.deepEqual(context.sync.directoryCorrections.map(item=>item.id),['B']);
  assert.equal(scheduled.length,1);
  await scheduled.shift()();
  assert.deepEqual(calls,[['A'],['B']]);
  assert.deepEqual(context.sync.directoryCorrections,[]);
});

test('identity propagation never rewrites the live revision-safe source day', () => {
  assert.match(dashboard, /source:\{clinicId:ACTIVE_CLINIC_ID,date:selectedDate,patientId\}/);
  assert.match(dashboard, /source:correction\.source/);
  assert.match(patientProfile, /const isSourceDay = day =>/);
  assert.match(patientProfile, /dayMatches\s*\.filter\(day => !isSourceDay\(day\)\)/);
  assert.match(patientProfile, /onlyIfMatch: entry\.etag/);
  assert.match(patientProfile, /updateMatchedDayIdentity/);
});
