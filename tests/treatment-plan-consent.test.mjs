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

test('patient signature link is version-bound, expiring, single-active, and server-timestamped', async () => {
  const endpoint = await read('netlify/functions/treatment-plan-consent.mjs');
  assert.match(endpoint, /planDigest: consentDigest\(plan\)/);
  assert.match(endpoint, /active\?\.tokenHash !== tokenHash/);
  assert.match(endpoint, /Date\.now\(\) > Number\(link\.expiresAt \|\| 0\)/);
  assert.match(endpoint, /consentDigest\(plan\) !== link\.planDigest/);
  assert.match(endpoint, /const now = Date\.now\(\)/);
  assert.match(endpoint, /status: 'approved_signed'/);
  assert.match(endpoint, /consentMethod: 'patient_link'/);
  assert.match(endpoint, /signatureDigest: hash\(signature\)/);
});

test('public consent page requires explicit understanding, acceptance, identity, and drawn signature', async () => {
  const [html, script] = await Promise.all([read('plan-consent.html'), read('plan-consent.js')]);
  assert.match(html, /id="understood" type="checkbox" required/);
  assert.match(html, /id="accepted" type="checkbox" required/);
  assert.match(html, /id="signerName"[^>]*required/);
  assert.match(html, /id="signatureCanvas"/);
  assert.match(script, /if\(strokeLength<70\)/);
  assert.match(script, /action:'sign',token,consentVersion:1/);
  assert.doesNotMatch(html, /<input[^>]+(?:understood|accepted)[^>]+checked/i);
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
