import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('the update control shows a concise bilingual summary loaded from release metadata', async () => {
  const [html, dashboard, worker, rawRelease] = await Promise.all([
    read('index.html'), read('dashboard.js'), read('service-worker.js'), read('release.json')
  ]);
  const release = JSON.parse(rawRelease);
  assert.match(html, /id="pwaUpdateTitle"/);
  assert.match(html, /id="pwaUpdateSummary"/);
  assert.match(dashboard, /fetch\(`\.\/release\.json\?update=\$\{Date\.now\(\)\}`/);
  assert.match(dashboard, /function renderPwaUpdateCopy\(\)/);
  assert.match(worker, /'\.\/release\.json'/);
  assert.ok(release.summary.ar.length > 10 && release.summary.ar.length <= 140);
  assert.ok(release.summary.en.length > 10 && release.summary.en.length <= 140);
});
