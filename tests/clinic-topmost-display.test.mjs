import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('doctor page exposes a safe live always-on-top display and official PowerToys link', async () => {
  const [html, script, css] = await Promise.all([
    read('index.html'),
    read('dashboard.js'),
    read('dashboard.css')
  ]);

  assert.match(html, /id="clinicTopmostTools" class="clinic-topmost-tools clinic-only hide-screen"/);
  assert.match(html, /id="clinicAlwaysOnTopBtn"/);
  assert.match(html, /href="https:\/\/aka\.ms\/getPowertoys" target="_blank" rel="noopener noreferrer"/);
  assert.match(script, /window\.documentPictureInPicture\?\.requestWindow/);
  assert.match(script, /syncClinicTopmostDisplay\(\);/);
  assert.match(script, /Array\.from\(flow\.children\).*cloneNode\(true\)/);
  assert.match(script, /querySelectorAll\('button,input,select,textarea'\)/);
  assert.doesNotMatch(script, /clinicTopmostWindow[\s\S]{0,200}(?:markDirty|saveRemote|mutate)\(/);
  assert.match(css, /body\.clinic-topmost-window/);
  assert.match(css, /clinic-topmost-window \.patient-actions[^\n]*display:none!important/);
});

test('topmost doctor display includes complete English labels', async () => {
  const script = await read('dashboard.js');
  assert.match(script, /Keep the doctor display above other applications/);
  assert.match(script, /Open always-on-top display/);
  assert.match(script, /Download PowerToys/);
  assert.match(script, /The floating display updates automatically with the clinic list/);
});
