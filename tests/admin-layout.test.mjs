import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('modern admin workspace is optional and switched from Settings', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  const menuStart = html.indexOf('id="settingsMenu"');
  const menuEnd = html.indexOf('</div></div>', menuStart);
  const toggleIndex = html.indexOf('id="adminLayoutModeBtn"');

  assert.ok(menuStart >= 0, 'settings menu exists');
  assert.ok(toggleIndex > menuStart && toggleIndex < menuEnd, 'layout switch stays inside settings menu');
  assert.match(html, /id="modernAdminSidebar"[^>]*hidden/);
  assert.match(html, /id="modernAdminOverview"[^>]*hidden/);
  assert.match(html, /data-modern-action="appointments"/);
  assert.match(html, /data-modern-action="payments"/);
  assert.match(html, /data-modern-action="plans"/);
  assert.match(html, /data-modern-action="labs"/);
  assert.match(html, /data-modern-action="language"/);
  assert.match(html, /data-modern-action="theme"/);
  assert.match(html, /data-modern-action="notifications"/);
  assert.match(html, /data-modern-action="logout"/);
  assert.match(html, /id="viewIdentity"/i, 'classic workspace remains available');
});

test('modern workspace state is local-only and reuses existing actions', async () => {
  const script = await readFile(new URL('dashboard.js', root), 'utf8');
  assert.match(script, /ADMIN_LAYOUT_KEY='bestcare_admin_layout_v1'/);
  assert.match(script, /function applyAdminLayout\(/);
  assert.match(script, /localStorage\.setItem\(ADMIN_LAYOUT_KEY/);
  assert.match(script, /if\(action==='payments'\)\{scrollAdminTarget\('paymentPanel'\)/);
  assert.match(script, /if\(action==='patient-record'\)\{\$\('patientIdentitySearchBtn'\)\?\.click\(\)/);
  assert.match(script, /if\(action==='theme'\)\{\$\('themeToggleBtn'\)\?\.click\(\)/);
  assert.match(script, /if\(action==='logout'\)\{\$\('logoutBtn'\)\?\.click\(\)/);
  assert.doesNotMatch(script, /fetch\([^\n]*admin-layout/i, 'layout preference does not alter server sync');
});

test('modern workspace has desktop, mobile, dark and print styling', async () => {
  const css = await readFile(new URL('dashboard.css', root), 'utf8');
  assert.match(css, /\.modern-admin-sidebar\{position:fixed/);
  assert.match(css, /body\.admin-layout-modern>\.app/);
  assert.match(css, /@media\(max-width:1100px\)[\s\S]*?body\.admin-sidebar-mobile-open \.modern-admin-sidebar/);
  assert.match(css, /html\[data-theme="dark"\] \.modern-admin-overview/);
  assert.match(css, /body\.admin-layout-modern \.toolbar>#appointmentRequestCenter/);
  assert.match(css, /body\.admin-layout-modern \.card:not\(\.header\)/);
  assert.match(css, /@media print\{\.modern-admin-sidebar/);
});
