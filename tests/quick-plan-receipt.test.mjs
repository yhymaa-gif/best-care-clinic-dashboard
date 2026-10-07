import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
async function harness(){
 const script=await read('quick-plan.js'),start=script.indexOf('function renderSubmissionReceipt(){'),end=script.indexOf('function toothNumbers(){',start);
 return new Function(`
 let submittedPlan=null,language='en',reply={ok:true,plan:null},requests=0;
 const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,value:id==='clinicId'?'clinic-1':'',scrollIntoView(){}});return nodes.get(id)};
 const esc=value=>String(value??'').replaceAll('<','&lt;'),t=key=>key;
 const location={href:'https://example.test/quick-plan?clinic=clinic-1&mrn=TEST1'},history={replaceState(a,b,url){location.href=String(url)}};
 const request=async()=>{requests++;return{ok:reply.ok,json:async()=>({plan:reply.plan})}};
 ${script.slice(start,end)}
 return{show:showSubmissionReceipt,restore:restoreSubmissionReceipt,node:$,url:()=>location.href,plan:()=>submittedPlan,setReply:value=>reply=value,requests:()=>requests};
 `)();
}
const plan={id:'a'.repeat(64),clinicId:'clinic-1',patientName:'Test Patient',patientMrn:'TEST1',createdAt:1700000000000,status:'pending_review',patientFileSummaryEn:'Proposed treatment.'};
test('server receipt retains identity and links to the standalone administration inbox',async()=>{
 const h=await harness();h.show(plan);assert.equal(h.node('quickPlanForm').hidden,true);assert.equal(h.node('successCard').hidden,false);assert.match(h.node('submissionReceipt').innerHTML,/TEST1/);assert.match(h.node('openAdminInbox').href,/adminQuickPlanInbox/);assert.equal(h.node('submittedClinicalNote').value,plan.patientFileSummaryEn);assert.equal(new URL(h.url()).searchParams.get('sentPlan'),plan.id);assert.equal(new URL(h.url()).searchParams.has('mrn'),false);
});
test('receipt cannot claim success without a saved plan identifier',async()=>{
 const h=await harness();assert.throws(()=>h.show({clinicId:'clinic-1'}),/could not be confirmed/);assert.equal(h.plan(),null);
});
test('receipt restoration is read-only and never falls back to a duplicate submission',async()=>{
 const h=await harness();h.setReply({ok:true,plan});await h.restore(plan.id);assert.equal(h.requests(),1);assert.equal(h.node('successCard').hidden,false);assert.equal(h.node('quickPlanForm').hidden,true);
 const failed=await harness();failed.setReply({ok:false,plan:null});await failed.restore(plan.id);assert.equal(failed.node('receiptRestoreError').hidden,false);assert.equal(failed.node('quickPlanForm').hidden,true);assert.equal(failed.plan(),null);
});
test('sending asks for confirmation and success does not imply an admin read acknowledgement',async()=>{
 const script=await read('quick-plan.js'),html=await read('quick-plan.html');
 const submit=script.slice(script.indexOf('async function submit(event){'),script.indexOf("$('retryReceipt')"));assert.ok(submit.indexOf('window.confirm')<submit.indexOf("method:'POST'"));assert.match(submit,/showSubmissionReceipt\(data.plan,data.costPlan\)/);assert.match(script,/not that staff have read it/);assert.match(html,/id="submissionReceipt"/);assert.match(html,/id="receiptRestoreError"/);
});
test('receipt startup failures keep entry hidden and provide retry instead of a duplicate path',async()=>{
 const script=await read('quick-plan.js'),start=script.indexOf('async function startQuickPlanPage(){'),end=script.indexOf('applyLanguage();startQuickPlanPage();',start);
 for(const status of [401,503,undefined]){
 const state=await new Function('status',`const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false});return nodes.get(id)},location={search:'?sentPlan=saved-id'},language='en';const loadClinics=async()=>{throw Object.assign(new Error('Startup unavailable'),{status})},setError=()=>{};${script.slice(start,end)}return startQuickPlanPage().then(()=>({entryHidden:$('quickPlanForm').hidden,retryVisible:!$('receiptRestoreError').hidden,retryEnabled:!$('retryReceipt').disabled}));`)(status);
 assert.deepEqual(state,{entryHidden:true,retryVisible:true,retryEnabled:true});
 }
 const clinics=script.slice(script.indexOf('async function loadClinics(){'),script.indexOf('async function findPatient(){'));assert.ok(clinics.indexOf('await restoreSubmissionReceipt(sentPlanId)')<clinics.indexOf('await loadCatalog()'));
});
test('a new plan reloads its catalog after a restored receipt and supports retry',async()=>{
 const script=await read('quick-plan.js');assert.match(script,/\$\('newPlan'\).addEventListener\('click',async\(\)=>\{[^\n]*await loadEntryCatalog\(\)/);
 const start=script.indexOf('async function loadEntryCatalog(){'),end=script.indexOf("$('languageToggle').addEventListener",start);
 const h=new Function(`const node={hidden:true,disabled:false};let fail=true,calls=0,error='';const $=()=>node,setError=(value='')=>error=value,loadCatalog=async()=>{calls++;if(fail)throw Error('Network failed')};${script.slice(start,end)}return{load:loadEntryCatalog,recover:()=>fail=false,state:()=>({node,calls,error})};`)();
 await h.load();assert.equal(h.state().node.hidden,false);assert.equal(h.state().node.disabled,false);assert.equal(h.state().error,'Network failed');h.recover();await h.load();assert.equal(h.state().node.hidden,true);assert.equal(h.state().calls,2);assert.equal(h.state().error,'');
});
