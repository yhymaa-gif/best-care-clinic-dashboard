import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('modern dashboard header uses a stable stacked command-center layout', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  const css = await readFile(new URL('dashboard.css', root), 'utf8');
  assert.match(html, /class="brand-copy"/);
  assert.match(css, /V7\.50:[^\n]*usable dashboard width/);
  assert.match(css, /body\.admin-layout-modern \.header\{grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(css, /body\.admin-layout-modern \.toolbar\{display:grid;grid-template-columns:/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?body\.admin-layout-modern \.toolbar\{grid-template-columns:1fr/);
  assert.match(css, /\.brand h1\{word-break:keep-all;overflow-wrap:normal/);
});
