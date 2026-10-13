import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../dashboard.js',import.meta.url),'utf8');
const scope=vm.createContext({mins:value=>{const [h,m]=value.split(':').map(Number);return h*60+m;}});
vm.runInContext(source.slice(source.indexOf('function detectCsvDelimiter('),source.indexOf('function cleanDirectoryName(')),scope);
vm.runInContext(source.slice(source.indexOf('function normalizeCsvTime('),source.indexOf('async function acceptPatientImport(')),scope);

test('daily import keeps each literal patient name, file and appointment on its own source row',()=>{
  const input='اسم المريض,رقم الملف,رقم الجوال,وقت البداية,وقت النهاية\nخيرية اختبار,TEST18252,0500000001,16:00,16:40\nمريضة أخرى للاختبار,TEST18253,0500000001,17:00,17:30';
  const result=scope.parsePatientCsv(input);
  assert.equal(result.reason,'');
  assert.equal(result.rows.length,2);
  assert.equal(result.rows[0].name,'خيرية اختبار');
  assert.equal(result.rows[0].file,'TEST18252');
  assert.equal(result.rows[0].start,'16:00');
  assert.equal(result.rows[1].name,'مريضة أخرى للاختبار');
  assert.equal(result.rows[1].file,'TEST18253');
  assert.equal(result.rows[1].start,'17:00');
});

test('quoted CSV cells and reordered English columns never move names between appointments',()=>{
  const input='Start Time;File Number;Patient Name;End Time;Procedure\n16:00;TEST18252;"Khairiyah Test";16:40;"Review; examination"\n17:00;TEST18253;"Other Test Patient";17:30;"Review"';
  const result=scope.parsePatientCsv(input);
  assert.equal(result.rows.length,2);
  assert.equal(result.rows[0].name,'Khairiyah Test');
  assert.equal(result.rows[0].file,'TEST18252');
  assert.equal(result.rows[0].procedure,'Review; examination');
  assert.equal(result.rows[1].name,'Other Test Patient');
  assert.equal(result.rows[1].file,'TEST18253');
});
