import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('new treatment plans preselect the optional photo consent with quality-purpose wording', async () => {
  const [html, script] = await Promise.all([read('treatment-plan.html'), read('treatment-plan.js')]);
  assert.match(html, /id="photoConsent" type="checkbox" checked/);
  assert.match(html, /توثيق ومراجعة وضبط جودة النتيجة العلاجية/);
  assert.match(html, /يمكن إلغاء اختيارها قبل الاعتماد/);
  assert.match(script, /consent:\{photoConsent:true,photoConsentRecorded:false,photoConsentDefaultVersion:2,photoConsentAcceptedAt:0,termsVersion:0\}/);
  assert.match(script, /state\.consent=\{photoConsent:true,photoConsentRecorded:false,photoConsentDefaultVersion:2,photoConsentAcceptedAt:0,termsVersion:0\}/);
  assert.match(script, /\$\('photoConsent'\)\.checked=Boolean\(state\.consent\.photoConsent\)/);
});

test('editable legacy plans receive the new default once while signed plans keep recorded consent', async () => {
  const [script, endpoint] = await Promise.all([read('treatment-plan.js'), read('netlify/functions/treatment-plan.mjs')]);
  assert.match(script, /const consentLocked=Boolean\(Number\(normalized\.meta\.patientAcceptedAt\|\|0\)\)\|\|\['patient_accepted','approved','approved_signed','cancelled'\]\.includes\(normalized\.meta\.status\)/);
  assert.match(script, /if\(!consentLocked&&Number\(next\.consent\?\.photoConsentDefaultVersion\|\|0\)<2\)/);
  assert.match(script, /state\.consent\.photoConsentDefaultVersion=2/);
  assert.match(endpoint, /photoConsentDefaultVersion:/);
});

test('photo-consent deployment refreshes the treatment-plan script and PWA shell', async () => {
  const [html, worker] = await Promise.all([read('treatment-plan.html'), read('service-worker.js')]);
  assert.match(html, /treatment-plan\.js\?v=20260906-payment-plan-link/);
  assert.match(worker, /bestcare-dashboard-v1-20260906-payment-plan-link/);
});

test('unsigned photography consent is explicit in the plan and administration views', async () => {
  const [planHtml, planScript, dashboard, center] = await Promise.all([
    read('treatment-plan.html'),
    read('treatment-plan.js'),
    read('dashboard.js'),
    read('treatment-plans.js')
  ]);
  assert.match(planHtml, /id="photoConsentWarning"[^>]*role="alert"/);
  assert.match(planScript, /لم يوقّع المريض على موافقة التصوير/);
  assert.match(planScript, /موافقة التصوير غير موثقة/);
  assert.match(dashboard, /function photoConsentAlertState\(record\)/);
  assert.match(dashboard, /المريض لم يوقّع على موافقة التصوير/);
  assert.match(center, /موافقة التصوير غير موثقة/);
});

test('photography decision is persisted separately and projected into the shared registry', async () => {
  const [planClient, planEndpoint, consentEndpoint, registryEndpoint, history] = await Promise.all([
    read('treatment-plan.js'),
    read('netlify/functions/treatment-plan.mjs'),
    read('netlify/functions/treatment-plan-consent.mjs'),
    read('netlify/functions/treatment-plan-registry.mjs'),
    read('netlify/functions/lib/treatment-plan-history.mjs')
  ]);
  assert.match(planClient, /photoConsentRecorded=true/);
  assert.match(planClient, /consentTermsVersion:Number\(state\.consent\?\.termsVersion\|\|0\)/);
  assert.match(planEndpoint, /photoConsentRecorded:/);
  assert.match(consentEndpoint, /photoConsentRecorded: true/);
  assert.match(registryEndpoint, /photoConsentRecorded:/);
  assert.match(history, /photoConsentRecorded:/);
});
