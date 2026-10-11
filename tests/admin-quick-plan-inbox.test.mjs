import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, js, css] = await Promise.all(['index.html', 'dashboard.js', 'dashboard.css'].map(file => readFile(new URL(`../${file}`, import.meta.url), 'utf8')));

test('admin quick plan inbox is a dedicated always-present panel near payments', () => {
  assert.match(html, /id="paymentPanel"[\s\S]*id="adminQuickPlanInbox"[\s\S]*class="stats"/);
  assert.match(js, /panel\.className='card admin-quick-plan-inbox admin-only'/);
  assert.match(js, /الخطط السريعة المرسلة للإدارة/);
  assert.match(js, /id="adminQuickPlanPendingCount"/);
  assert.match(js, /id="adminQuickPlanReviewedCount"/);
  assert.ok(Buffer.byteLength(html, 'utf8') < 80_000);
  assert.match(css, /\.admin-quick-plan-group\.pending/);
});

test('inbox reads server plans across all dates with guarded visible-only refresh', () => {
  assert.match(js, /request\(`\/api\/quick-treatment-plans\?clinic=\$\{encodeURIComponent\(clinicId\)\}`/);
  assert.doesNotMatch(js.match(/function adminQuickPlanActive\(\)[\s\S]*?(?=function suggestedTimes\()/)?.[0] || '', /selectedDate|localStorage/);
  assert.match(js, /plan\?\.status==='pending_review'/);
  assert.match(js, /plan&&plan\.status!=='pending_review'/);
  assert.match(js, /adminQuickPlans\.loading\)\{adminQuickPlans\.refreshAgain=true/);
  assert.match(js, /generation!==adminQuickPlans\.generation/);
  assert.match(js, /document\.hidden\|\|navigator\.onLine===false\|\|adminQuickPlans\.suspended/);
  assert.match(js, /navigator\.onLine===false/);
  assert.match(js, /renderKey!==adminQuickPlans\.renderedKey/);
  assert.match(js, /\['submitted','deleted'\]\.includes\(event\.data\?\.type\)/);
  assert.match(js, /stopAdminQuickPlanInbox\(\)/);
});

test('inbox row escapes identity, builds scoped review link, and only offers existing note', () => {
  const source = js.match(/function adminQuickPlanRow\(plan,copy\)\{[\s\S]*?\n\}(?=\nfunction renderAdminQuickPlanInbox)/)?.[0];
  assert.ok(source);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const row = new Function('URLSearchParams','ACTIVE_CLINIC_ID','lang','escapeHtml', `${source}; return adminQuickPlanRow`)(URLSearchParams,'clinic-3','en',escapeHtml);
  const copy = {file:'MRN',open:'Open and review',note:'Copy clinical note',pending:'Awaiting review',approved:'Approved',completed:'Completed',unknown:'Other'};
  const output = row({id:'plan & 1',patientName:'<Patient>',patientMrn:'MRN-1',createdAt:Date.UTC(2026,9,6),status:'pending_review',clinicalNote:'A note'},copy);
  assert.match(output, /&lt;Patient&gt;/);
  assert.match(output, /clinic=clinic-3&amp;id=plan\+%26\+1/);
  assert.match(output, /data-admin-quick-note="plan &amp; 1"/);
  assert.match(output, /data-admin-quick-delete="plan &amp; 1"/);
  assert.match(output, />Delete<\/button>/);
  assert.match(row({id:'x',patientName:'A',_deleting:true},copy), /disabled aria-busy="true"/);
  assert.match(output, /Awaiting review/);
  assert.doesNotMatch(row({id:'x',patientName:'A',patientMrn:'B',status:'approved'},copy), /data-admin-quick-note/);
});

test('deletion confirms the exact submission and only removes it after a successful server response', async () => {
  const source=js.match(/async function deleteAdminQuickPlan\(id\)\{[\s\S]*?\r?\n\}(?=\r?\nfunction suggestedTimes)/)?.[0];
  assert.ok(source);
  const plan={id:'a'.repeat(64),revision:3,patientName:'Demo',patientMrn:'TEST',createdAt:1700000000000};
  let allowed=true,confirm=false,status=200,calls=0,confirmation='',refreshes=0;
  const state={plans:[plan],deleting:[],removed:[],generation:0,suspended:false};
  const request=async(_url,options)=>{calls++;assert.deepEqual(JSON.parse(options.body),{clinicId:'clinic-1',id:plan.id,action:'delete',expectedRevision:3});assert.equal(state.plans.length,1);return{ok:status===200,status,json:async()=>({ok:status===200})}};
  const remove=new Function('adminQuickPlanActive','adminQuickPlans','lang','window','ACTIVE_CLINIC_ID','renderAdminQuickPlanInbox','request','refreshAdminQuickPlanInbox',`${source};return deleteAdminQuickPlan`)(()=>allowed,state,'en',{confirm:text=>{confirmation=text;return confirm}},'clinic-1',()=>{},request,()=>{refreshes++});
  await remove(plan.id);assert.equal(calls,0);assert.equal(state.plans.length,1);
  assert.match(confirmation,/Demo · TEST/);assert.match(confirmation,/signatures will NOT be deleted/);
  allowed=false;confirm=true;await remove(plan.id);assert.equal(calls,0);
  allowed=true;status=500;await remove(plan.id);assert.equal(calls,1);assert.equal(state.plans.length,1);assert.equal(state.deleteFailed,true);assert.deepEqual(state.deleting,[]);
  status=409;await remove(plan.id);assert.equal(state.plans.length,1);assert.match(state.deleteNotice,/changed/);assert.equal(refreshes,1);
  status=200;await remove(plan.id);assert.equal(state.plans.length,0);assert.deepEqual(state.removed,[plan.id]);assert.equal(state.deleteFailed,false);assert.deepEqual(state.deleting,[]);
  await remove(plan.id);assert.equal(calls,3);
});
