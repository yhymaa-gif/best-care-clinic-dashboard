import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=name=>readFile(new URL(`../${name}`,import.meta.url),'utf8');

test('nurse quick-plan page is focused, mobile-first, and visibly marked as draft',async()=>{
  const [html,css,runtimeCss,config]=await Promise.all([read('quick-plan.html'),read('quick-plan.css'),read('quick-plan-runtime.css'),read('netlify.toml')]);
  assert.match(html,/id="patientMrn"/);
  assert.match(html,/id="patientAge"/);
  assert.match(html,/id="quickEntry"/);
  assert.match(html,/id="previewList"/);
  assert.match(html,/id="submitPlan"/);
  assert.match(html,/id="submittedClinicalNote"/);
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
  assert.match(center,/status===\'pending_review\'/);
  assert.match(center,/api\/quick-treatment-plans/);
  assert.match(worker,/url\.pathname===\'\/quick-plan\'/);
  assert.match(worker,/url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(worker,/procedure-catalog-defaults\.js/);
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
