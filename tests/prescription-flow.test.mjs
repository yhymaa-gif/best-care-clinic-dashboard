import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('admin patient creation requires full name, non-zero file, and Saudi mobile', async () => {
  const [html, js] = await Promise.all([read('index.html'), read('dashboard.js')]);
  assert.match(html, /id="fName"[^>]+required/);
  assert.match(html, /id="fFile"[^>]+required/);
  assert.match(html, /id="fPhone"[^>]+required/);
  assert.match(js, /normalizedName\.split\(' '\).*length<2/);
  assert.match(js, /isZeroFileNumber\(fileNumber\)/);
  assert.match(js, /\^05\\d\{8\}\$/);
  assert.doesNotMatch(js, /name:firstName\(rawName\)/);
});

test('prescription flow is patient-linked, authenticated, and stored separately', async () => {
  const [html, js, fn, toml, sw] = await Promise.all([
    read('prescription.html'), read('prescription.js'), read('netlify/functions/prescriptions.mjs'), read('netlify.toml'), read('service-worker.js')
  ]);
  assert.match(html, /id="medicalReview"[^>]+required/);
  assert.match(html, /id="doctorConfirm"[^>]+required/);
  assert.match(html, /id="steroidConfirm"/);
  for (const id of ['augmentinName', 'augmentinStrength', 'augmentinFrequency', 'metronidazoleName', 'prednisoloneName', 'otherFrequency']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /id="augmentinFrequency"[^>]+disabled/);
  assert.match(js, /function medicineFrom\(prefix,template\)/);
  assert.match(js, /patientId=params\.get\('patientId'\)/);
  assert.match(fn, /requireUser\(request\)/);
  assert.match(fn, /sameOriginRequest\(request\)/);
  assert.match(fn, /clinic-prescriptions/);
  assert.match(toml, /from = "\/api\/prescriptions"/);
  assert.match(sw, /prescription\.html/);
});
