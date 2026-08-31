import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { matchesSummaryIdentity, planSummaryItems, loadPlanSummaries } from '../netlify/functions/lib/patient-summary.mjs';
import { hydrateTreatmentPlanRegistry } from '../netlify/functions/lib/treatment-plan-history.mjs';
import { __test as profileApi } from '../netlify/functions/patient-profile.mjs';
import '../patient-summary.js';
const summary = globalThis.BestCarePatientSummary;
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const now = Date.parse('2026-08-31T11:00:00Z');
const visit = (overrides={}) => ({ id:'old',clinicId:'clinic-1',date:'2026-08-24',status:'done',procedure:'زيارة علاج',paymentItems:[{name:'حشوة تجميلية',code:'cosmetic-filling',quantity:2}],...overrides });

test('summary identity uses national ID or nonzero file, never shared mobile or name',()=>{
  assert.deepEqual(summary.lookup({file:'٠',phone:'0500000000',name:'اسم'}),null);
  assert.deepEqual(summary.lookup({file:' A-120 '}),{type:'file',value:'A120'});
  assert.deepEqual(summary.lookup({nationalId:'١٢٣٤٥٦٧٨٩٠',file:'A120'}),{type:'national',value:'1234567890'});
  assert.equal(matchesSummaryIdentity({file:'2',phone:'0500000000'},{file:'1',phone:'0500000000'}),false);
  assert.equal(matchesSummaryIdentity({file:'0'},{file:'0'}),false);
  assert.equal(matchesSummaryIdentity({file:'1',nationalId:'1111111111'},{file:'1',nationalId:'2222222222'}),false);
  assert.equal(matchesSummaryIdentity({file:'old',nationalId:'1111111111'},{file:'new',nationalId:'1111111111'}),true);
});

test('summary counts structured quantities on completed visits, not plans or pending/cancelled orders',()=>{
  const source={appointments:[visit(),visit(),visit({id:'pending',status:'waiting'}),visit({id:'cancelled',status:'cancel'}),visit({id:'active',status:'active'}),visit({id:'text',paymentItems:[],procedure:'3 fillings'}),visit({id:'unknown',paymentItems:[{name:'حشوة',quantity:null}]}),visit({id:'other',paymentItems:[{name:'تاج',quantity:1}]})],plans:[{items:[{name:'حشوة',quantity:99}]}]};
  const before=JSON.stringify(source),result=summary.summarize(source,{now});
  assert.equal(result.fillings,2);assert.equal(result.totalUnits,3);
  assert.equal(result.completed.length,4);assert.equal(result.unquantified,2);
  assert.equal(JSON.stringify(source),before);
});

test('previous visit excludes today’s selected appointment, no-shows and future appointments',()=>{
  const source={appointments:[visit(),visit({id:'current',date:'2026-08-31'}),visit({id:'cancel',date:'2026-08-30',status:'cancel'}),visit({id:'waiting',date:'2026-08-29',status:'waiting'}),visit({id:'future',date:'2026-09-10'})]};
  const result=summary.summarize(source,{now,patientId:'current',date:'2026-08-31',clinicId:'clinic-1'});
  assert.equal(result.previous.id,'old');assert.equal(result.daysAgo,7);
  assert.equal(summary.summarize({appointments:[]},{now}).daysAgo,null);
  assert.equal(summary.riyadhDay(Date.parse('2026-08-30T22:00:00Z')),'2026-08-31');
});

test('memory-only summary cache deduplicates concurrent clicks, expires, retries and clears on logout',async()=>{
  let clock=0,calls=0,resolve;
  const cache=summary.createCache({now:()=>clock,ttl:30});
  const loader=()=>{calls++;return new Promise(done=>{resolve=done;});};
  const first=cache.load('one',loader),second=cache.load('one',loader,{force:true});
  assert.equal(first,second);await Promise.resolve();assert.equal(calls,1);
  resolve({patient:{name:'Test'}});await first;
  await cache.load('one',loader);assert.equal(calls,1);
  clock=31;await cache.load('one',async()=>{calls++;return{version:2};});assert.equal(calls,2);
  await assert.rejects(cache.load('one',async()=>{throw new Error('offline');},{force:true}));
  assert.equal(cache.peek('one').error,true);assert.deepEqual(cache.peek('one').data,{version:2});
  await cache.load('one',async()=>({version:3}),{force:true});assert.equal(cache.peek('one').error,false);
  const pending=cache.load('two',loader);await Promise.resolve();cache.clear();resolve({private:true});await pending;
  assert.equal(cache.peek('two'),undefined);assert.equal(cache.peek('one'),undefined);
});

test('summary renderer escapes patient content, keeps actions and provides English labels',()=>{
  const source={patient:{name:'<img src=x onerror=alert(1)>'},appointments:[visit()],plans:[],labs:[{labName:'<script>bad</script>',status:'sent',items:[]}],prescriptions:[],summary:{},directory:{adminNotes:'<b>private</b>'}};
  const html=summary.render(source,{now,patientId:'p1',lang:'en',labStatus:()=> 'Sent to lab'});
  assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<script>bad'));
  assert.match(html,/Open prescriptions/);assert.match(html,/data-prescription-id="p1"/);
  assert.match(html,/No linked treatment plans/);assert.match(html,/7 days ago/);
});

test('profile response includes only sanitized quantities and visit timestamps without modifying storage',()=>{
  const item=visit({arrivedAt:120,paymentItems:[{name:'Filling',code:'filling',quantity:2,price:999,secret:'hidden'}]});
  const input=JSON.stringify(item);
  const payload=profileApi.profilePayload({name:'Test'},[{date:item.date,clinicId:item.clinicId,matches:[item],state:{}}],[],[]);
  assert.deepEqual(payload.appointments[0].paymentItems,[{name:'Filling',code:'filling',quantity:2}]);
  assert.equal(payload.appointments[0].arrivedAt,120);assert.equal(JSON.stringify(item),input);
});

test('plan summary reads exact version and does not silently substitute a later addendum',async()=>{
  let calls=0;
  const record={clinicId:'clinic-1',sourceDate:'2026-08-24',sourcePatientId:'test',planNo:'TP-1'};
  const wrong={plan:{meta:{planNo:'TP-2'},phases:[{items:[{service:'Wrong plan'}]}]}};
  const result=await loadPlanSummaries({get:async()=>{calls++;return wrong;}},[{canonical:'one',record}]);
  assert.equal(result[0].detailsAvailable,false);assert.deepEqual(result[0].items,[]);assert.ok(calls<=3);
  const right={plan:{meta:{planNo:'TP-1'},phases:[{title:'Phase',items:[{service:'Filling',qty:2,signature:'hidden',unitPriceBefore:999}]}]}};
  const available=await loadPlanSummaries({get:async()=>right},[{canonical:'one',record}]);
  assert.deepEqual(available[0].items,[{name:'Filling',quantity:2,phase:'Phase'}]);
  assert.deepEqual(planSummaryItems(null),[]);
});

test('read-only historical plan hydration performs no writes and preserves original registry',async()=>{
  const source={records:{},aliases:{},revision:7};const before=JSON.stringify(source);let writes=0;
  const next=await hydrateTreatmentPlanRegistry({current:source,clinicId:'clinic-1',persist:false,
    registryStore:{setJSON:async()=>{writes++;}},planStore:{list:async()=>({blobs:[]}),get:async()=>null}});
  assert.equal(writes,0);assert.equal(next.revision,7);assert.equal(JSON.stringify(source),before);
});

test('summary integration is admin-only, closed initially, read-only and not periodically fetched',async()=>{
  const dashboard=await read('dashboard.js'),server=await read('netlify/functions/patient-profile.mjs');
  assert.match(dashboard,/let patientSummaryOpen=null/);
  assert.match(dashboard,/VIEW_MODE!=='admin'\|\|authUser\?\.role!=='admin'/);
  assert.match(dashboard,/summary:'1'/);
  assert.match(dashboard,/patientSummaryOpen=null;patientSummaryCache.clear\(\)/);
  const block=dashboard.slice(dashboard.indexOf('function patientSummaryScope'),dashboard.indexOf('function renderTable'));
  assert.doesNotMatch(block,/setInterval|setTimeout|mutate\(|serialize\(|localStorage|sessionStorage/);
  assert.match(server,/persist: !compactSummary/);
  assert.match(server,/compactSummary && auth.user\?\.role !== 'admin'/);
});
