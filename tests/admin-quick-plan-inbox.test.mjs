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
  assert.match(js, /event\.data\?\.type==='submitted'/);
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
  assert.match(output, /Awaiting review/);
  assert.doesNotMatch(row({id:'x',patientName:'A',patientMrn:'B',status:'approved'},copy), /data-admin-quick-note/);
});
