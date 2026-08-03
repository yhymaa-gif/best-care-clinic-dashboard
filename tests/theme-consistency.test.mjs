import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const pages = [
  'index.html','appointment-request.html','appointment-requests.html','lab.html',
  'offline.html','statistics.html','treatment-plan.html','treatment-plans.html'
];

test('every interface loads the shared theme before rendering', async () => {
  for (const page of pages) {
    const html = await readFile(new URL(page, root), 'utf8');
    assert.match(html, /<script src="\.\/theme-boot\.js"><\/script>/, `${page} boots the saved theme`);
    assert.match(html, /<link rel="stylesheet" href="\.\/theme\.css">/, `${page} loads shared contrast rules`);
  }
});

test('shared dark mode preserves a light printable treatment plan', async () => {
  const css = await readFile(new URL('theme.css', root), 'utf8');
  assert.match(css, /html\[data-theme="dark"\] body/);
  assert.match(css, /html\[data-theme="dark"\] \.paper\{/);
  assert.match(css, /@media print/);
});

test('PWA shell includes shared theme assets', async () => {
  const sw = await readFile(new URL('service-worker.js', root), 'utf8');
  assert.match(sw, /'\.\/theme\.css'/);
  assert.match(sw, /'\.\/theme-boot\.js'/);
  assert.match(sw, /prescriptions-full-name-sync/);
});
