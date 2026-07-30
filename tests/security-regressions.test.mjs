import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('protected dashboard UI stays inert until authentication succeeds', async () => {
  const html = await read('index.html');
  assert.match(html, /<div class="app" inert aria-hidden="true">/);
  assert.match(html, /function openModal\(id\)\{[\s\S]{0,120}if\(!authReady\)return;/);
  assert.doesNotMatch(html, /if\(NEED_ROLE_CHOICE\)openRoleChoice\(\);/);
  assert.match(html, /NEED_ROLE_CHOICE&&authUser\?\.role==='admin'/);
});

test('treatment-plan actions are unavailable before session verification', async () => {
  const html = await read('treatment-plan.html');
  assert.match(html, /<main class="app" inert aria-hidden="true">/);
  assert.match(html, /id="floatingPlanActions"[^>]* inert aria-hidden="true"/);
  assert.match(html, /body\.auth-locked #floatingPlanActions\{display:none!important\}/);
  assert.match(html, /classList\.add\('auth-locked'\);[\s\S]{0,160}setLocked\(true\)/);
});

test('HTML does not use inline event-handler attributes', async () => {
  const names = ['index.html', 'treatment-plan.html', 'statistics.html', 'appointment-request.html', 'appointment-requests.html', 'lab.html', 'offline.html'];
  for (const name of names) {
    const html = await read(name);
    assert.doesNotMatch(html, /\son(?:click|change|input|submit|load|error|keydown|keyup|focus|blur)\s*=/i, `${name} contains an inline event handler`);
  }
});

test('security headers block inline script attributes and legacy cross-domain policies', async () => {
  const config = await read('netlify.toml');
  assert.match(config, /script-src-attr 'none'/);
  assert.match(config, /X-Permitted-Cross-Domain-Policies = "none"/);
});

test('public appointment page allows browser zoom', async () => {
  const html = await read('appointment-request.html');
  assert.doesNotMatch(html, /maximum-scale\s*=\s*1/i);
});

test('offline retry behavior is cached as part of the PWA shell', async () => {
  const serviceWorker = await read('service-worker.js');
  const offline = await read('offline.html');
  assert.match(serviceWorker, /'\.\/offline\.js'/);
  assert.match(offline, /<script src="\.\/offline\.js" defer><\/script>/);
});

test('statistics clinic labels are rendered through textContent', async () => {
  const html = await read('statistics.html');
  assert.match(html, /name\.textContent=/);
  assert.match(html, /doctor\.textContent=/);
  assert.doesNotMatch(html, /clinicFilter'\)\.insertAdjacentHTML/);
});
