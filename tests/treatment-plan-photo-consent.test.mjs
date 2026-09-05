import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('new treatment plans preselect the optional photo consent with quality-purpose wording', async () => {
  const [html, script] = await Promise.all([read('treatment-plan.html'), read('treatment-plan.js')]);
  assert.match(html, /id="photoConsent" type="checkbox" checked/);
  assert.match(html, /توثيق ومراجعة وضبط جودة النتيجة العلاجية/);
  assert.match(html, /يمكن إلغاء اختيارها قبل الاعتماد/);
  assert.match(script, /consent:\{photoConsent:true,photoConsentDefaultVersion:2,photoConsentAcceptedAt:0,termsVersion:0\}/);
  assert.match(script, /state\.consent=\{photoConsent:true,photoConsentDefaultVersion:2,photoConsentAcceptedAt:0,termsVersion:0\}/);
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
  assert.match(html, /treatment-plan\.js\?v=20260905-plan-consent-v2/);
  assert.match(worker, /bestcare-dashboard-v1-20260905-plan-consent-v2/);
});
