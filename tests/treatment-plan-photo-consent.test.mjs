import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('new treatment plans preselect the optional photo consent with quality-purpose wording', async () => {
  const [html, script] = await Promise.all([read('treatment-plan.html'), read('treatment-plan.js')]);
  assert.match(html, /id="photoConsent" type="checkbox" checked/);
  assert.match(html, /توثيق ومراجعة وضبط جودة النتيجة العلاجية/);
  assert.match(html, /يمكن إلغاء اختيارها قبل الاعتماد/);
  assert.match(script, /consent:\{photoConsent:true\}/);
  assert.match(script, /state\.consent=\{photoConsent:true\}/);
  assert.match(script, /\$\('photoConsent'\)\.checked=Boolean\(state\.consent\.photoConsent\)/);
});

test('photo-consent deployment refreshes the treatment-plan script and PWA shell', async () => {
  const [html, worker] = await Promise.all([read('treatment-plan.html'), read('service-worker.js')]);
  assert.match(html, /treatment-plan\.js\?v=20260905-photo-consent/);
  assert.match(worker, /bestcare-dashboard-v1-20260905-photo-consent/);
});
