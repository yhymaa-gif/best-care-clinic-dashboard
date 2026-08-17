import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('lab screen uses the real compact table and expandable timeline', async () => {
  const [html, script] = await Promise.all([read('lab.html'), read('lab.js')]);
  assert.match(html, /class="lab-table"/);
  assert.match(html, /id="caseList"/);
  assert.match(script, /renderTimeline\(item\)/);
  assert.match(script, /data-toggle-timeline/);
  assert.match(script, /paceMeta\(item\)/);
  assert.doesNotMatch(script, /const cases=\[\s*\{id:'L-/);
});

test('lab API preserves timestamped status history and coordination stage', async () => {
  const source = await read('netlify/functions/lab-cases.mjs');
  assert.match(source, /'sent_coordination'/);
  assert.match(source, /history: cleanHistory/);
  assert.match(source, /withDerivedHistory/);
  assert.match(source, /history\.push\(\{ status: item\.status, at: item\.updatedAt/);
  assert.match(source, /expectedRevision/);
  assert.match(source, /const labStore = \(\) => getStore/);
  assert.doesNotMatch(source, /const store = getStore\(\{ name: 'clinic-lab-cases'/);
});

test('lab and administration lists resolve old names from the central patient directory', async () => {
  const [labApi, adminApi] = await Promise.all([
    read('netlify/functions/lab-cases.mjs'),
    read('netlify/functions/admin-patients.mjs')
  ]);
  assert.match(labApi, /enrichPatientFromDirectory/);
  assert.match(labApi, /visibleCases\(records\.flatMap\(record => record\.cases\), patientDirectory\)/);
  assert.match(adminApi, /getPatientDirectory\(\)\.catch/);
  assert.match(adminApi, /enrichPatientFromDirectory\(patientDirectory, patient\)/);
});

test('patient completion exposes inline laboratory delivery updates without a second data store', async () => {
  const [html, script, styles] = await Promise.all([
    read('index.html'),
    read('dashboard.js'),
    read('dashboard.css')
  ]);
  assert.match(html, /id="completionLabField"/);
  assert.match(html, /id="completionLabList"/);
  assert.match(script, /const LAB_STATUS_ORDER=\[/);
  assert.match(script, /data-lab-status-inline-id/);
  assert.match(script, /data-completion-lab-status/);
  assert.match(script, /updateDashboardLabStatus/);
  assert.match(script, /collectCompletionLabUpdates/);
  assert.match(styles, /\.completion-lab-field\{/);
  assert.match(styles, /\.lab-status-inline-select\{/);
});
