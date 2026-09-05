import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('doctor-approved plan sharing creates and includes a patient signature link', async () => {
  const [html, client, endpoint, config] = await Promise.all([
    read('treatment-plan.html'),
    read('treatment-plan.js'),
    read('netlify/functions/treatment-plan-consent.mjs'),
    read('netlify.toml')
  ]);
  assert.match(html, /مشاركة الخطة \+ رابط التوقيع|id="shareConsentLinkBox"/);
  assert.match(client, /async function ensureConsentLink\(\)/);
  assert.match(client, /action:'create',clinicId,date:appointmentDate,patientId,planNo:state\.meta\.planNo/);
  assert.match(client, /رابط مراجعة الخطة والتوقيع/);
  assert.match(endpoint, /plan\?\.meta\?\.status !== 'submitted'/);
  assert.match(endpoint, /!Number\(plan\?\.meta\?\.doctorApprovedAt \|\| 0\)/);
  assert.match(config, /from = "\/api\/treatment-plan-consent"/);
});

test('patient signature link is version-bound, time-independent, single-active, and server-timestamped', async () => {
  const endpoint = await read('netlify/functions/treatment-plan-consent.mjs');
  assert.match(endpoint, /planDigest: consentDigest\(plan\)/);
  assert.match(endpoint, /active\?\.tokenHash !== tokenHash/);
  assert.match(endpoint, /until_signed_replaced_or_plan_changed/);
  assert.match(endpoint, /expiresAt: 0/);
  assert.doesNotMatch(endpoint, /Date\.now\(\) > Number\(link\.expiresAt \|\| 0\)/);
  assert.match(endpoint, /consentDigest\(plan\) !== link\.planDigest/);
  assert.match(endpoint, /const now = Date\.now\(\)/);
  assert.match(endpoint, /status: 'approved_signed'/);
  assert.match(endpoint, /consentMethod: 'patient_link'/);
  assert.match(endpoint, /signatureDigest: hash\(signature\)/);
});

test('public signature page retries transient loading failures and offers manual reload', async () => {
  const [html, script] = await Promise.all([read('plan-consent.html'), read('plan-consent.js')]);
  assert.match(html, /id="retryLoad"/);
  assert.match(html, /يبقى صالحًا حتى التوقيع أو تحديث الخطة/);
  assert.match(script, /for\(let attempt=0;attempt<3;attempt\+=1\)/);
  assert.match(script, /response\.status>=500\|\|response\.status===408\|\|response\.status===429/);
  assert.match(script, /\$\('retryLoad'\)\.addEventListener\('click',load\)/);
});

test('public consent page requires complete informed, treatment, and financial acceptance plus drawn signature', async () => {
  const [html, script, endpoint] = await Promise.all([read('plan-consent.html'), read('plan-consent.js'), read('netlify/functions/treatment-plan-consent.mjs')]);
  assert.match(html, /id="understood" type="checkbox" required/);
  assert.match(html, /id="accepted" type="checkbox" required/);
  assert.match(html, /id="financialAccepted" type="checkbox" required/);
  assert.match(html, /id="photoConsent" type="checkbox"/);
  assert.match(html, /يلتزم المريض بسداد تكلفة كل إجراء يوافق عليه ويتم تنفيذه فعليًا/);
  assert.match(html, /بنود الموافقة المستنيرة/);
  assert.match(html, /توثيق ومراجعة وضبط جودة النتيجة العلاجية/);
  assert.match(html, /id="signerName"[^>]*required/);
  assert.match(html, /id="signatureCanvas"/);
  assert.match(script, /if\(strokeLength<70\)/);
  assert.match(script, /action:'sign',token,consentVersion:2/);
  assert.match(script, /financialAccepted:\$\('financialAccepted'\)\.checked/);
  assert.match(script, /photoConsent:\$\('photoConsent'\)\.checked/);
  assert.match(endpoint, /body\?\.financialAccepted !== true/);
  assert.match(endpoint, /photoConsentAcceptedAt: photoConsent \? now : 0/);
  assert.match(endpoint, /termsVersion: CONSENT_VERSION/);
  assert.doesNotMatch(html, /<input[^>]+(?:understood|accepted|financialAccepted)[^>]+checked/i);
});

test('signature page mirrors the principal plan terms and keeps photography consent independent', async () => {
  const [mainPlan, consentPage] = await Promise.all([read('treatment-plan.html'), read('plan-consent.html')]);
  const sharedClauses = [
    'تكلفة كل إجراء يوافق عليه ويتم تنفيذه فعليًا',
    'سداد كامل المبلغ',
    'قد تختلف أوقات البدء والانتهاء',
    'أي إجراء غير مدرج',
    'شرح لي طبيعة الإجراءات المقترحة وأهدافها',
    'أُتيحت لي فرصة كافية لطرح الأسئلة',
    'الفوائد المتوقعة والمخاطر والمضاعفات المحتملة',
    'البدائل العلاجية المتاحة',
    'الاستجابة للعلاج تختلف',
    'الالتزام بالتعليمات والمراجعات الدورية',
    'أي إجراء خارج الخطة يحتاج شرحًا وموافقة',
    'عرض تقديري وليست فاتورة ضريبية',
    'بدء العلاج وفق المراحل الموضحة'
  ];
  for (const clause of sharedClauses) {
    assert.ok(mainPlan.includes(clause), `principal plan is missing: ${clause}`);
    assert.ok(consentPage.includes(clause), `signature page is missing: ${clause}`);
  }
  assert.match(consentPage, /موافقة تصوير اختيارية/);
  assert.match(consentPage, /هذه الموافقة مستقلة وليست شرطًا للعلاج/);
  assert.doesNotMatch(consentPage, /id="photoConsent"[^>]+required/);
});

test('manual administration status change cannot bypass patient signature evidence', async () => {
  const [dashboard, planClient, planCenter, planEndpoint] = await Promise.all([read('dashboard.js'), read('treatment-plan.js'), read('treatment-plans.js'), read('netlify/functions/treatment-plan.mjs')]);
  assert.match(dashboard, /submitted:\['rejected'\]/);
  assert.match(dashboard, /nextStatus==='approved_signed'&&!updatedPlan\.signatures\?\.patientSignature/);
  assert.match(planClient, /if\(!state\.signatures\.patientSignature\)/);
  assert.match(planClient, /consentMethod='in_clinic'/);
  assert.match(planCenter, /if\(!canManageStatus\(previous,status\)\)/);
  assert.match(planCenter, /لا يمكن اعتماد الخطة يدويًا/);
  assert.match(planEndpoint, /Patient consent must be completed through the plan signature flow/);
  assert.match(planEndpoint, /Verified patient signature evidence is required/);
});
