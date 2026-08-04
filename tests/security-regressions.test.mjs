import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('protected dashboard UI stays inert until authentication succeeds', async () => {
  const html = await read('index.html');
  const script = await read('dashboard.js');
  assert.match(html, /<div class="app" inert aria-hidden="true">/);
  assert.match(script, /function openModal\(id\)\{[\s\S]{0,120}if\(!authReady\)return;/);
  assert.doesNotMatch(script, /if\(NEED_ROLE_CHOICE\)openRoleChoice\(\);/);
  assert.match(script, /NEED_ROLE_CHOICE&&authUser\?\.role==='admin'/);
});

test('authentication reports incomplete static-only Netlify deployments clearly', async () => {
  const script = await read('dashboard.js');
  assert.match(script, /response\.status>=500\|\|!contentType\.includes\('application\/json'\)/);
  assert.match(script, /إعادة نشر المشروع من GitHub مع وظائف Netlify/);
  assert.match(script, /cache:'no-store'/);
});

test('treatment-plan actions are unavailable before session verification', async () => {
  const html = await read('treatment-plan.html');
  const script = await read('treatment-plan.js');
  assert.match(html, /<main class="app" inert aria-hidden="true">/);
  assert.match(html, /id="floatingPlanActions"[^>]* inert aria-hidden="true"/);
  assert.match(html, /body\.auth-locked #floatingPlanActions\{display:none!important\}/);
  assert.match(script, /classList\.add\('auth-locked'\);[\s\S]{0,160}setLocked\(true\)/);
});

test('HTML does not use inline event-handler attributes', async () => {
  const names = ['index.html', 'treatment-plan.html', 'statistics.html', 'appointment-request.html', 'appointment-requests.html', 'lab.html', 'offline.html'];
  for (const name of names) {
    const html = await read(name);
    assert.doesNotMatch(html, /\son(?:click|change|input|submit|load|error|keydown|keyup|focus|blur)\s*=/i, `${name} contains an inline event handler`);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, `${name} contains an inline script block`);
  }
});

test('security headers block inline script attributes and legacy cross-domain policies', async () => {
  const config = await read('netlify.toml');
  assert.match(config, /script-src-attr 'none'/);
  assert.match(config, /script-src 'self';/);
  assert.doesNotMatch(config, /script-src 'self' 'unsafe-inline'/);
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

test('smart image extraction is removed from the dashboard surface and runtime', async () => {
  const html = await read('index.html');
  const script = await read('dashboard.js');
  const config = await read('netlify.toml');
  assert.doesNotMatch(html, /extractorTopBtn|imageOcrBtn|ocrModal|استخراج ذكي/);
  assert.doesNotMatch(script, /openOcrImporter|PATIENT_RECONCILE_API|ocr-import-v7/);
  assert.doesNotMatch(config, /patient-reconcile/);
});

test('every PWA application-shell asset exists', async () => {
  const serviceWorker = await read('service-worker.js');
  const shellBlock = serviceWorker.match(/const APP_SHELL=\[([\s\S]*?)\];/)?.[1] || '';
  const assets = [...shellBlock.matchAll(/'(\.\/[^']*)'/g)].map(match => match[1]);
  assert.ok(assets.length >= 20, 'PWA shell asset list appears unexpectedly short');
  for (const asset of assets) {
    if (asset === './') continue;
    await access(new URL(`../${asset.slice(2)}`, import.meta.url));
  }
});

test('PWA manifest exposes the main operational shortcuts', async () => {
  const manifest = JSON.parse(await read('manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.scope, './');
  const shortcutUrls = new Set((manifest.shortcuts || []).map(item => item.url));
  ['./?source=pwa&view=admin', './?source=pwa&view=clinic', './appointment-requests.html?source=pwa', './lab.html?source=pwa']
    .forEach(url => assert.ok(shortcutUrls.has(url), `missing PWA shortcut ${url}`));
});

test('statistics clinic labels are rendered through textContent', async () => {
  const script = await read('statistics.js');
  assert.match(script, /name\.textContent=/);
  assert.match(script, /doctor\.textContent=/);
  assert.doesNotMatch(script, /clinicFilter'\)\.insertAdjacentHTML/);
});

test('dashboard shell does not embed large raster assets in HTML', async () => {
  const html = await read('index.html');
  assert.doesNotMatch(html, /data:image\/png;base64,/);
  assert.match(html, /src="\.\/assets\/best-care-logo-header\.png"/);
  assert.match(html, /href="\.\/dashboard\.css"/);
  assert.match(html, /src="\.\/dashboard\.js"/);
  assert.ok(Buffer.byteLength(html, 'utf8') < 80_000, 'index.html exceeded the dashboard shell size budget');
});

test('dashboard buttons have an explicit type to prevent accidental form submission', async () => {
  const html = await read('index.html');
  assert.doesNotMatch(html, /<button(?![^>]*\btype=)[^>]*>/i);
});

test('static images reserve layout space to avoid visual jumps', async () => {
  const names = ['index.html', 'treatment-plan.html', 'statistics.html', 'appointment-request.html', 'appointment-requests.html', 'lab.html', 'offline.html'];
  for (const name of names) {
    const html = await read(name);
    for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
      assert.match(match[0], /\bwidth="\d+"/i, `${name} has an image without an intrinsic width`);
      assert.match(match[0], /\bheight="\d+"/i, `${name} has an image without an intrinsic height`);
    }
  }
});
