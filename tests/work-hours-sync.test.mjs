import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../dashboard.js',import.meta.url),'utf8');
const slice=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end));
const working=Date.parse('2026-09-07T07:00:00+03:00');
test('unchanged plan feed skips a full render but record and identity changes are detected',()=>{
  const c=vm.createContext({});
  vm.runInContext(slice('function registryContentChanged','function patientIdentityRecordKey'),c);
  const before={records:{sample:{status:'draft'}},aliases:{},revision:1};
  assert.equal(c.registryContentChanged(before,{...before,revision:2,lastFetchedAt:100}),false);
  assert.equal(c.registryContentChanged(before,{...before,records:{sample:{status:'submitted'}}}),true);
  assert.equal(c.registryContentChanged(before,{...before,aliases:{sample:'new'}}),true);
});
test('sixty timer renders preserve patient action markup until actual content changes',()=>{
  const c=vm.createContext({});
  vm.runInContext(slice('const liveMarkupCache=','function renderLive'),c);
  let writes=0;
  const element={set innerHTML(value){writes++}};
  for(let i=0;i<60;i++)c.setLiveMarkup(element,'<button>Sample</button>');
  assert.equal(writes,1);
  c.setLiveMarkup(element,'<button>Updated</button>');assert.equal(writes,2);
});
function harness(overrides={}){
  const calls={pull:0,push:0,delays:[],updates:0};
  const context=vm.createContext({
    document:{hidden:false},window:{},navigator:{onLine:true},lang:'en',
    console,clearTimeout(){},setBadge(){},setIdleSyncBadge(){},
    sync:{dirty:false,error:'',cycleRunning:false,pwaCheckAt:0,pwaChecking:false},
    async pullState(){calls.pull++},async pushState(){calls.push++},
    async refreshAuxiliaryData(){},scheduleAutomaticSync(delay){calls.delays.push(delay)},
    ...overrides
  });
  vm.runInContext(slice('const POLL_MS=','function syncCadenceCopy')+
    slice('function syncDelayUntilWorkStart','async function runAutomaticSync')+
    slice('async function runAutomaticSync','function auxiliaryCadence'),context);
  return {context,calls};
}

test('working-hours cadence covers visible, background and floating clinic display',()=>{
  const {context:c}=harness();
  assert.equal(c.syncCadence(working).delay,5000);
  c.document.hidden=true;
  assert.equal(c.syncCadence(working).delay,300000);
  c.window.documentPictureInPicture={window:{closed:false}};
  assert.equal(c.syncCadence(working).delay,5000);
  c.window.documentPictureInPicture.window.closed=true;
  assert.equal(c.syncCadence(working).delay,300000);
  assert.equal(c.syncCadence(Date.parse('2026-09-11T16:00:00+03:00')).delay,300000);
  assert.equal(c.syncCadence(Date.parse('2026-09-07T06:59:59+03:00')).workHours,false);
  assert.equal(c.syncCadence(Date.parse('2026-09-07T23:59:59+03:00')).workHours,true);
});

test('reduced polling wakes at 07:00 Riyadh every day',()=>{
  const {context:c}=harness();
  assert.equal(c.syncDelayUntilWorkStart(900000,working-10000),10000);
  assert.equal(c.syncDelayUntilWorkStart(900000,Date.parse('2026-09-11T06:59:50+03:00')),10000);
});

test('slow auxiliary feeds do not hold up patient synchronization',async()=>{
  const {context:c,calls}=harness({refreshAuxiliaryData:()=>new Promise(()=>{})});
  c.syncCadence=()=>({workHours:true,delay:15000});
  await c.runAutomaticSync();
  assert.equal(calls.pull,1);
  assert.deepEqual(calls.delays,[15000]);
  assert.equal(c.sync.cycleRunning,false);
});

test('simultaneous wake signals run one patient pull',async()=>{
  let finish,pulls=0;
  const {context:c,calls}=harness({pullState:()=>{pulls++;return new Promise(resolve=>{finish=resolve})}});
  c.syncCadence=()=>({workHours:true,delay:15000});
  const first=c.runAutomaticSync();
  await c.runAutomaticSync();
  assert.equal(pulls,1);
  finish();await first;
  assert.deepEqual(calls.delays,[50]);
});

test('pending edits take priority and get a prompt retry without pulling over them',async()=>{
  const {context:c,calls}=harness();
  c.syncCadence=()=>({workHours:true,delay:15000});c.sync.dirty=true;
  await c.runAutomaticSync();
  assert.equal(calls.pull,0);assert.equal(calls.push,1);
  assert.deepEqual(calls.delays,[250]);
  c.sync.error='temporary';await c.runAutomaticSync();
  assert.equal(calls.delays.at(-1),30000);
});

test('offline work pauses network traffic and retains pending edits',async()=>{
  const {context:c,calls}=harness();
  c.syncCadence=()=>({workHours:true,delay:15000});
  c.navigator.onLine=false;c.sync.dirty=true;
  await c.runAutomaticSync();
  assert.equal(calls.pull+calls.push,0);assert.equal(c.sync.dirty,true);
  assert.deepEqual(calls.delays,[60000]);
});

test('version checks are throttled and single-flight without reloading',async()=>{
  const {context:c,calls}=harness();
  let finish;
  c.sync.pwaRegistration={update(){calls.updates++;return new Promise(resolve=>{finish=resolve})}};
  const first=c.checkApplicationUpdate(working);
  await c.checkApplicationUpdate(working+300001);
  assert.equal(calls.updates,1);
  finish();await first;
  await c.checkApplicationUpdate(working+10000);
  assert.equal(calls.updates,1);
  c.document.hidden=true;
  await c.checkApplicationUpdate(working+300001);
  assert.equal(calls.updates,1);
  c.document.hidden=false;
  c.sync.pwaRegistration.update=async()=>{calls.updates++};
  await c.checkApplicationUpdate(working+300001);
  assert.equal(calls.updates,2);
  assert.equal(c.sync.pwaChecking,false);
});
