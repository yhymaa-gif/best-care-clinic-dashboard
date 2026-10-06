import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=name=>readFile(new URL(`../${name}`,import.meta.url),'utf8');

test('printed and shared treatment plans include the stored patient national ID',async()=>{
  const [html,script,i18n]=await Promise.all([
    read('treatment-plan.html'),
    read('treatment-plan.js'),
    read('treatment-plan-i18n.js')
  ]);
  assert.match(html,/id="patientNationalId"/);
  assert.match(html,/treatment-plan\.js\?v=20261006-patient-id-print/);
  assert.match(html,/treatment-plan-i18n\.js\?v=20261006-patient-id-print/);
  assert.match(script,/state\.patient\.nationalId=normalizeNationalId\(\$\('patientNationalId'\)\.value\)/);
  assert.match(script,/\$\('patientNationalId'\)\.value=normalizeNationalId\(state\.patient\.nationalId\)/);
  assert.match(script,/tr\('رقم الهوية','National ID'\)/);
  assert.match(script,/grid-template-columns:2fr \.85fr 1\.1fr 1\.2fr/);
  assert.match(i18n,/\['رقم الهوية','National ID'\]/);
});
