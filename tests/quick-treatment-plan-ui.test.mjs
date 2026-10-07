import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseQuickEntry, reconcileQuickPlanItems } from '../quick-plan-core.js';

const read=name=>readFile(new URL(`../${name}`,import.meta.url),'utf8');

async function procedureToggleHarness(entry){
  const script=await read('quick-plan.js');
  const start=script.indexOf('function removeAssignedProcedure(');
  const end=script.indexOf('async function toggleProcedureFavorite(',start);
  assert.ok(start>=0&&end>start);
  const source=script.slice(start,end);
  const catalog=[{id:'rct',code:'RCT',name:'علاج عصب',nameEn:'Root canal treatment',aliases:['RCT'],active:true},{id:'post',code:'POST',name:'تركيب وتد',nameEn:'Post',aliases:['POST'],active:true}];
  const make=new Function('entry','catalog','parseQuickEntry','reconcileQuickPlanItems',`let items=[],deletedSourceKeys=new Set(),parseTimer=0;const textarea={value:entry},$=id=>id==='quickEntry'?textarea:{value:'fdi'},clearTimeout=()=>{},render=()=>{};function parse(){const next=parseQuickEntry(textarea.value,catalog,'fdi'),reconciled=reconcileQuickPlanItems(items,next,deletedSourceKeys);items=reconciled.items;deletedSourceKeys=new Set(reconciled.deletedSourceKeys);render()}${source}parse();return{click:(procedureId,toothNumber)=>{clearTimeout(parseTimer);parse();return removeAssignedProcedure(procedureId,toothNumber)},getItems:()=>items,getEntry:()=>textarea.value,setEntry:value=>{textarea.value=value},edit:(index,values)=>Object.assign(items[index],values)}`);
  return {state:make(entry,catalog,parseQuickEntry,reconcileQuickPlanItems),script};
}

test('visual procedure toggle removes the selected tooth/procedure and preserves other procedures',async()=>{
  const {state,script}=await procedureToggleHarness('RCT 32\nRCT 32\nRCT 31\nPost 32');
  assert.equal(state.click('rct','32'),true);
  assert.deepEqual(state.getItems().map(item=>[item.toothNumber,item.procedureId]),[['31','rct'],['32','post']]);
  assert.equal(state.getEntry(),'RCT 31\nPost 32');
  assert.equal(state.click('rct','32'),false);
  assert.match(script,/if\(removeAssignedProcedure\(procedure\.id,selectedTooth\)\)return;insertQuickEntry/);
  assert.match(script,/data-palette-procedure="\$\{esc\(procedure\.id\)\}" aria-pressed="\$\{Boolean\(count\)\}"/);
});

test('toggle preserves a corrected tooth when identical source entries are renumbered',async()=>{
  const {state}=await procedureToggleHarness('RCT 32\nRCT 32');
  state.edit(1,{toothNumber:'31',procedureId:'post',procedureCode:'POST',officialName:'تركيب وتد',officialNameEn:'Post',userEdited:true,matchState:'manual'});
  assert.equal(state.click('rct','32'),true);
  assert.equal(state.getEntry(),'RCT 32');
  assert.deepEqual(state.getItems().map(item=>[item.toothNumber,item.procedureId]),[['31','post']]);
});

test('toggle parses a freshly prepended entry before choosing which source line to remove',async()=>{
  const {state}=await procedureToggleHarness('RCT 32');
  state.setEntry('Post 33\nRCT 32');
  assert.equal(state.click('rct','32'),true);
  assert.equal(state.getEntry(),'Post 33');
  assert.deepEqual(state.getItems().map(item=>[item.toothNumber,item.procedureId]),[['33','post']]);
});

test('toggle keeps a manual duplicate anchored after its surviving source item',async()=>{
  const {state}=await procedureToggleHarness('RCT 32\nRCT 32');
  const [first,second]=state.getItems();
  state.edit(0,{toothNumber:'33',procedureId:'post',procedureCode:'POST',userEdited:true,matchState:'manual'});
  state.getItems().push({...second,sourceKey:'',manualId:'manual-1',manualOrder:1,afterSourceKey:second.sourceKey,toothNumber:'34'});
  assert.equal(state.click('post','33'),true);
  assert.deepEqual(state.getItems().map(item=>item.toothNumber),['32','34']);
  assert.equal(state.getItems()[1].afterSourceKey,state.getItems()[0].sourceKey);
  assert.equal(state.getItems()[0].sourceKey,'rct 32::1');
});

test('nurse quick-plan page is focused, mobile-first, and visibly marked as draft',async()=>{
  const [html,css,runtimeCss,config]=await Promise.all([read('quick-plan.html'),read('quick-plan.css'),read('quick-plan-runtime.css'),read('netlify.toml')]);
  assert.match(html,/id="patientMrn"/);
  assert.match(html,/id="patientAge"/);
  assert.match(html,/id="quickEntry"/);
  assert.match(html,/id="previewList"/);
  assert.match(html,/id="submitPlan"/);
  assert.match(html,/id="submittedClinicalNote"/);
  assert.match(html,/id="openSubmittedPlan"/);
  assert.match(html,/id="confirmExamination" type="checkbox"/);
  assert.match(html,/id="confirmDiscussion" type="checkbox"/);
  assert.match(html,/id="copySubmittedClinicalNote"/);
  assert.match(html,/DRAFT — NOT MEDICAL ADVICE — DOCUMENTATION-ONLY — AUTHORIZED CLINICIAN SIGN-OFF REQUIRED/);
  assert.doesNotMatch(html,/dashboard\.js/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(css,/\.sticky-submit/);
  assert.match(runtimeCss,/overflow-x:hidden/);
  assert.match(runtimeCss,/grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(html,/quick-plan-runtime\.css/);
  assert.match(html,/<option value="fdi">FDI \(11–48\)<\/option>[\s\S]*<option value="universal">/);
  assert.match(html,/id="toothGrid"/);
  assert.match(html,/id="procedurePalette"/);
  assert.doesNotMatch(html,/id="toothProcedureSelect"/);
  assert.match(config,/from = "\/quick-plan"[\s\S]*to = "\/quick-plan\.html"/);
});

test('doctor review supports structured correction and approved outputs',async()=>{
  const [html,script]=await Promise.all([read('quick-plan-review.html'),read('quick-plan-review.js')]);
  for(const marker of ['ORIGINAL NURSE ENTRY','STRUCTURED PLAN','CLINICAL NOTE','APPROVE TREATMENT PLAN','PRINT / PDF'])assert.match(html,new RegExp(marker));
  for(const action of ['data-review-tooth','data-review-procedure','data-move-up','data-move-down','data-review-delete'])assert.match(script,new RegExp(action));
  assert.match(script,/expectedRevision:active\.revision/);
  assert.match(script,/outputOverrides\(\)/);
  assert.match(script,/sessionUser\?\.role!==\'clinic\'/);
  assert.match(script,/verifiedClinicDoctor\(\)/);
  assert.match(script,/active\?\.numberingSystem\|\|\'fdi\'/);
  assert.match(script,/\.generated-output textarea[\s\S]*node\.readOnly=!clinicianEditable/);
  assert.match(script,/active\.outputOverrides\?\.whatsappText\|\|active\.whatsappText/);
  assert.match(script,/focus&&!active/);
  assert.match(script,/BroadcastChannel\('bestcare-quick-plans'\)/);
  assert.match(script,/setInterval\(\(\)=>\{if\(!document\.hidden&&navigator\.onLine\)loadPlans/);
});

test('nurse workflow preserves corrections, rejects stale patient lookups, and refreshes other devices',async()=>{
  const [script,runtimeCss]=await Promise.all([read('quick-plan.js'),read('quick-plan-runtime.css')]);
  assert.match(script,/patientLookupKey===currentPatientKey\(\)/);
  assert.match(script,/generation!==lookupGeneration\|\|key!==currentPatientKey\(\)/);
  assert.match(script,/reconcileQuickPlanItems\(items,next,deletedSourceKeys\)/);
  assert.match(script,/deletedSourceKeys\.add\(item\.sourceKey\)/);
  assert.match(script,/item\.userEdited=true/);
  assert.match(script,/addEventListener\('input',[\s\S]*\[data-tooth\][\s\S]*updateReady\(\)/);
  assert.match(script,/else return;render\(\)/);
  assert.match(script,/quickPlanChannel\?\.postMessage\(\{type:\'submitted\'/);
  assert.match(script,/navigator\.clipboard\.writeText\(\$\('submittedClinicalNote'\)\.value\)/);
  assert.match(script,/procedureDisplayLabel\(option,language\)/);
  assert.match(script,/data-duplicate[^>]*aria-label/);
  assert.match(script,/function toothNumbers\(\)/);
  assert.match(script,/data-tooth-pick/);
  assert.match(script,/function uniqueQuickToken\(procedure\)/);
  assert.match(script,/match\.matchState===\'exact\'&&match\.procedure\?\.id===procedure\.id/);
  assert.match(script,/insertQuickEntry\(`\$\{uniqueQuickToken\(procedure\)\}/);
  assert.match(script,/function renderShortcuts\(\)/);
  assert.match(script,/import \{ DEFAULT_CATALOG_ITEMS \} from '\.\/procedure-catalog-defaults\.js'/);
  assert.match(script,/const previewCatalog=DEFAULT_CATALOG_ITEMS\.map/);
  assert.match(script,/function toothIcon\(shape\)/);
  assert.match(script,/class=\"tooth-icon\"/);
  assert.match(script,/function procedureIcon\(procedure\)/);
  assert.match(script,/data-palette-procedure/);
  assert.match(script,/data-palette-favorite/);
  assert.match(script,/function priorityProcedures\(\)/);
  assert.match(script,/catalogProfile\.usage/);
  assert.match(script,/TREATMENT_PHASES\.map/);
  assert.match(script,/treatmentPhaseLabel\(phase\.id,language\)/);
  assert.match(script,/class=\"odontogram-grid\"/);
  assert.match(script,/\$\('patientAge'\)\.value=''/);
  assert.match(script,/examinationConfirmed:\$\('confirmExamination'\)\.checked/);
  assert.match(script,/discussionConfirmed:\$\('confirmDiscussion'\)\.checked/);
  assert.match(script,/patientFileSummaryAr/);
  assert.match(script,/quick-plan-review\.html\?/);
  assert.match(script,/function invalidatePatient\(\)[\s\S]*?\$\('confirmExamination'\)\.checked=false;\$\('confirmDiscussion'\)\.checked=false/);
  assert.match(script,/Array\.from\(\{length:8\},\(_,index\)=>String\(32-index\)/);
  assert.match(runtimeCss,/@media\(max-width:620px\)[\s\S]*width:44px/);
  assert.match(runtimeCss,/\.tooth-row \.tooth-body\{fill:url\(#toothEnamel\)/);
  assert.match(runtimeCss,/\.procedure-visual-grid/);
  assert.match(runtimeCss,/\.odontogram-grid::before/);
});

test('treatment-plan center surfaces nurse submissions without altering legacy plans',async()=>{
  const [html,center,worker]=await Promise.all([read('treatment-plans.html'),read('quick-plan-center.js'),read('service-worker.js')]);
  assert.match(html,/id="quickPlanInbox"/);
  assert.match(html,/quick-plan-review\.html/);
  assert.match(html,/إضافة خطة سريعة/);
  assert.match(center,/status===\'pending_review\'/);
  assert.match(center,/api\/quick-treatment-plans/);
  assert.match(worker,/url\.pathname===\'\/quick-plan\'/);
  assert.match(worker,/url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(worker,/procedure-catalog-defaults\.js/);
});

test('costed treatment plan keeps a prominent patient-linked Quick Plan action',async()=>{
  const [html,script]=await Promise.all([read('treatment-plan.html'),read('treatment-plan.js')]);
  assert.match(html,/id="quickPlanTopBtn"[\s\S]*إضافة خطة سريعة/);
  assert.match(script,/quickPlanTopBtn[\s\S]*state\?\.patient\?\.fileNo[\s\S]*\.\/quick-plan\?/);
});

test('submitted Quick Plans remain editable in review and expose a contextual add action',async()=>{
  const [reviewHtml,reviewScript,reviewCss,centerScript]=await Promise.all([read('quick-plan-review.html'),read('quick-plan-review.js'),read('quick-plan-review.css'),read('treatment-plans.js')]);
  assert.match(reviewHtml,/quick-plan-add[\s\S]*ADD QUICK PLAN/);
  assert.match(reviewHtml,/id="reviewConfirmExamination"/);
  assert.match(reviewHtml,/id="reviewConfirmDiscussion"/);
  assert.match(reviewScript,/status==='pending_review'/);
  assert.match(reviewScript,/documentationConfirmations=\{examination:/);
  assert.match(reviewScript,/function invalidateDiscussionConfirmation/);
  assert.match(reviewScript,/quick-plan-add[\s\S]*active\?\.patientMrn/);
  assert.match(reviewCss,/\.documentation-confirmations\{/);
  assert.match(centerScript,/function updateQuickPlanLink\(\)[\s\S]*quick-plan-add/);
});

test('administration replaces today-note action with patient-linked Quick Plan and keeps Lab access',async()=>{
  const [html,dashboard,quickPlan]=await Promise.all([read('index.html'),read('dashboard.js'),read('quick-plan.js')]);
  assert.doesNotMatch(html,/id="quickPlanChoiceModal"/);
  assert.doesNotMatch(dashboard,/quickPlanChoiceModal|openQuickPlanChoice/);
  assert.match(dashboard,/data-quick-plan-id=/);
  assert.match(dashboard,/function openQuickPlanForPatient\(id\)[\s\S]*new URLSearchParams\(\{clinic:ACTIVE_CLINIC_ID,lang,mrn/);
  assert.match(dashboard,/quickPlan&&VIEW_MODE==='admin'/);
  assert.match(dashboard,/VIEW_MODE==='clinic'[\s\S]*data-daily-note-id[\s\S]*data-quick-plan-id/);
  assert.match(quickPlan,/get\('mrn'\)[\s\S]*await findPatient\(\)/);
  assert.match(dashboard,/\$\('labCasesBtn'\)\.addEventListener[\s\S]*openLabCasesPage/);
  assert.match(dashboard,/\$\('floatingLabBtn'\)\.addEventListener\('click',\(\)=>openLabCasesPage\(\)\)/);
  assert.doesNotMatch(dashboard,/quickPlanTopLink/);
});

test('admin procedure catalog edits quick aliases on the existing procedure record',async()=>{
  const [dashboard,html]=await Promise.all([read('dashboard.js'),read('index.html')]);
  assert.match(html,/اختصارات الإدخال السريع/);
  assert.match(dashboard,/data-catalog-aliases/);
  assert.match(dashboard,/item\.aliases=\[\.\.\.new Set/);
  assert.doesNotMatch(dashboard,/quickProcedureDatabase|separateProcedure/);
});
