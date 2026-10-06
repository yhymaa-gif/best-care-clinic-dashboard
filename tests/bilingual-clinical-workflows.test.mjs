import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('treatment plan keeps dashboard language and independent sharing language', async () => {
  const [html, script, i18n] = await Promise.all([
    read('treatment-plan.html'), read('treatment-plan.js'), read('treatment-plan-i18n.js')
  ]);
  assert.match(html, /id="documentLanguageSelect"/);
  assert.match(html, /treatment-plan-i18n\.js\?v=20261006-patient-id-print/);
  assert.match(script, /params\.get\('planLang'\)/);
  assert.match(script, /url\.searchParams\.set\('planLang',uiLang\)/);
  assert.match(script, /consentUrl\.searchParams\.set\('planLang',uiLang\)/);
  assert.match(i18n, /Plan and sharing language/);
  assert.match(i18n, /Treatment Plan, Cost Estimate, and Informed Consent/);
});

test('public signature page follows the selected plan language without translating patient names', async () => {
  const [html, script, endpoint] = await Promise.all([
    read('plan-consent.html'), read('plan-consent.js'), read('netlify/functions/treatment-plan-consent.mjs')
  ]);
  assert.match(html, /treatment-plan-i18n\.js\?v=20261003-bilingual-plan/);
  assert.match(script, /params\.get\('planLang'\)==='en'/);
  assert.match(script, /summary\.patientName/);
  assert.match(script, /procedureEnByCode/);
  assert.match(endpoint, /kind: cleanText\(phase\?\.kind/);
  assert.match(endpoint, /code: cleanText\(item\?\.code/);
  assert.match(endpoint, /customService: cleanText\(item\?\.customService/);
  assert.match(script, /item\.code==='other'&&item\.customService\?item\.customService/);
  assert.match(script, /sourceTitle===defaultAr\|\|sourceTitle===defaultEn/);
});

test('dashboard login shell and floating controls follow English mode before authentication', async () => {
  const [script, auth] = await Promise.all([read('dashboard.js'), read('netlify/functions/auth.mjs')]);
  assert.match(script, /const requestedLang=new URLSearchParams\(location\.search\)\.get\('lang'\)/);
  assert.match(script, /Best Care Dental Clinics internal communication app/);
  assert.match(script, /Ask Hassina/);
  assert.match(script, /Enable dark mode/);
  const serverError = auth.match(/error: '([^']*اسم المستخدم[^']*)'/)?.[1];
  assert.ok(serverError);
  assert.ok(script.includes(`'${serverError}':'Incorrect username or password.'`));
});

test('bilingual treatment assets are refreshed in the PWA shell', async () => {
  const [worker, release] = await Promise.all([read('service-worker.js'), read('release.json')]);
  assert.match(worker, /bestcare-dashboard-v1-20261007-quick-plan-cost-link/);
  assert.match(worker, /'\.\/treatment-plan-i18n\.js'/);
  const metadata = JSON.parse(release);
  assert.equal(metadata.version, '2026.10.07-quick-plan-cost-link');
  assert.ok(metadata.summary.ar.length > 10);
  assert.ok(metadata.summary.en.length > 10);
});
