import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __test as authPolicy } from '../netlify/functions/auth.mjs';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('administration settings provide a protected password-change workflow', async () => {
  const [html, dashboard, auth] = await Promise.all([
    read('index.html'),
    read('dashboard.js'),
    read('netlify/functions/auth.mjs'),
  ]);
  assert.doesNotMatch(html, /id="changePasswordModal"/);
  assert.match(dashboard, /button\.id='changePasswordBtn';button\.className='admin-only'/);
  assert.match(dashboard, /id="currentPasswordInput" type="password" autocomplete="current-password"/);
  assert.match(dashboard, /id="newPasswordInput" type="password" autocomplete="new-password" minlength="12"/);
  assert.match(dashboard, /id="confirmPasswordInput" type="password" autocomplete="new-password" minlength="12"/);
  assert.match(dashboard, /authRequest\('\?action=change-password'/);
  assert.match(dashboard, /newPassword!==confirmation/);
  assert.match(auth, /action === 'change-password'/);
  assert.match(auth, /session\.user\.role !== 'admin'/);
  assert.match(auth, /passwordCredentialStore\(\)\.setJSON/);
  assert.doesNotMatch(auth, /console\.(?:log|info|warn)\([^\n]*(?:currentPassword|newPassword)/);
});

test('stored password credentials are salted and verify without retaining plaintext', () => {
  const password = 'Secure-Clinic-2026!';
  const first = authPolicy.createPasswordCredential(password);
  const second = authPolicy.createPasswordCredential(password);
  assert.equal(first.algorithm, 'scrypt');
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
  assert.equal(JSON.stringify(first).includes(password), false);
  assert.equal(authPolicy.storedPasswordMatches(password, first), true);
  assert.equal(authPolicy.storedPasswordMatches('Wrong-Clinic-2026!', first), false);
});

test('horizontal swipes change administration dates without hijacking interactive controls', async () => {
  const dashboard = await read('dashboard.js');
  assert.match(dashboard, /function setupAdminDateSwipe\(\)/);
  assert.match(dashboard, /VIEW_MODE!=='admin'/);
  assert.match(dashboard, /addEventListener\('touchstart'/);
  assert.match(dashboard, /addEventListener\('touchend'/);
  assert.match(dashboard, /Math\.abs\(dx\)<72/);
  assert.match(dashboard, /input,textarea,select,button,a/);
  assert.match(dashboard, /moveAdminDate\(dx>0\?-1:1\)/);
  assert.match(dashboard, /url\.searchParams\.set\('date',nextDate\)/);
});
