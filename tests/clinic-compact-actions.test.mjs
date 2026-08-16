import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('doctor screen uses compact icon actions without changing action hooks', async () => {
  const script = await readFile(new URL('dashboard.js', root), 'utf8');
  const css = await readFile(new URL('dashboard.css', root), 'utf8');

  assert.match(script, /function clinicIconAction\(icon,label,attributes='',className=''\)/);
  assert.match(script, /VIEW_MODE==='clinic'\s*\?\s*clinicIconAction\('🦷'/);
  assert.match(script, /VIEW_MODE==='clinic'\s*\?\s*clinicIconAction\('📋'/);
  assert.match(script, /data-completion-id=/);
  assert.match(script, /clinicIconAction\(Number\(lead\.callCount\|\|0\)>0\?'↻':'📣'/);
  assert.match(css, /body\.view-clinic \.clinic-icon-action\{/);
  assert.match(css, /body\.view-clinic \.clinic-action-label\{/);
  assert.match(css, /body\.view-clinic \.row-actions \.clinic-row-action/);
  assert.match(css, /V7\.61: clinic screen density pass/);
  assert.match(css, /body\.view-clinic \.doctor-list-note\{display:none!important\}/);
  assert.match(css, /body\.view-clinic #adminWorkspace>details>.table-wrap\{max-height:320px;overflow:auto\}/);
  assert.match(css, /body\.view-clinic \.current-status-notice small\{display:none\}/);
  assert.match(css, /body\.view-clinic \.actual-hint\{display:none\}/);
});
