import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=name=>readFile(new URL(`../${name}`,import.meta.url),'utf8');

test('nurse quick-plan page is focused, mobile-first, and visibly marked as draft',async()=>{
  const [html,css,runtimeCss,config]=await Promise.all([read('quick-plan.html'),read('quick-plan.css'),read('quick-plan-runtime.css'),read('netlify.toml')]);
  assert.match(html,/id="patientMrn"/);
  assert.match(html,/id="quickEntry"/);
  assert.match(html,/id="previewList"/);
  assert.match(html,/id="submitPlan"/);
  assert.match(html,/DRAFT — NOT MEDICAL ADVICE — DOCUMENTATION-ONLY — AUTHORIZED CLINICIAN SIGN-OFF REQUIRED/);
  assert.doesNotMatch(html,/dashboard\.js/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(css,/\.sticky-submit/);
  assert.match(runtimeCss,/overflow-x:hidden/);
  assert.match(runtimeCss,/grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(html,/quick-plan-runtime\.css/);
  assert.match(html,/<option value="fdi">FDI \(11–48\)<\/option>[\s\S]*<option value="universal">/);
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
  const script=await read('quick-plan.js');
  assert.match(script,/patientLookupKey===currentPatientKey\(\)/);
  assert.match(script,/generation!==lookupGeneration\|\|key!==currentPatientKey\(\)/);
  assert.match(script,/reconcileQuickPlanItems\(items,next,deletedSourceKeys\)/);
  assert.match(script,/deletedSourceKeys\.add\(item\.sourceKey\)/);
  assert.match(script,/item\.userEdited=true/);
  assert.match(script,/addEventListener\('input',[\s\S]*\[data-tooth\][\s\S]*updateReady\(\)/);
  assert.match(script,/else return;render\(\)/);
  assert.match(script,/quickPlanChannel\?\.postMessage\(\{type:\'submitted\'/);
});

test('treatment-plan center surfaces nurse submissions without altering legacy plans',async()=>{
  const [html,center,worker]=await Promise.all([read('treatment-plans.html'),read('quick-plan-center.js'),read('service-worker.js')]);
  assert.match(html,/id="quickPlanInbox"/);
  assert.match(html,/quick-plan-review\.html/);
  assert.match(center,/status===\'pending_review\'/);
  assert.match(center,/api\/quick-treatment-plans/);
  assert.match(worker,/url\.pathname===\'\/quick-plan\'/);
  assert.match(worker,/url\.pathname\.startsWith\('\/api\/'\)/);
});

test('administration dashboard exposes a direct bilingual quick-plan action',async()=>{
  const [html,dashboard]=await Promise.all([read('index.html'),read('dashboard.js')]);
  assert.doesNotMatch(html,/id="quickPlanTopLink"/);
  assert.match(dashboard,/quickPlanTopLink\.href='\.\/quick-plan'/);
  assert.match(dashboard,/الخطة السريعة/);
  assert.match(dashboard,/#quickPlanTopLink strong/);
  assert.match(dashboard,/Quick plan/);
});

test('admin procedure catalog edits quick aliases on the existing procedure record',async()=>{
  const [dashboard,html]=await Promise.all([read('dashboard.js'),read('index.html')]);
  assert.match(html,/اختصارات الإدخال السريع/);
  assert.match(dashboard,/data-catalog-aliases/);
  assert.match(dashboard,/item\.aliases=\[\.\.\.new Set/);
  assert.doesNotMatch(dashboard,/quickProcedureDatabase|separateProcedure/);
});
