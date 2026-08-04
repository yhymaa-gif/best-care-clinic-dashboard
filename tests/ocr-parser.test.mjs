import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadParser(){
  const source=await readFile(new URL('../ocr-import-v7-3-1.js',import.meta.url),'utf8');
  const instrumented=source.replace(
    "window.BestCareOCR={init,open,version:'7.43.0'};",
    "window.BestCareOCR={init,open,version:'7.43.0',__test:{timeMatches,parseTextFallback}};"
  );
  const sandbox={window:{},document:{getElementById:()=>null},crypto:{randomUUID:()=>`test-${Math.random()}`}};
  vm.runInNewContext(instrumented,sandbox);
  return sandbox.window.BestCareOCR.__test;
}

test('OCR parser recognizes common Arabic report time formats',async()=>{
  const {timeMatches}=await loadParser();
  assert.deepEqual(Array.from(timeMatches('٣.٤٥ م إلى ٤/١٥ م')),['15:45','16:15']);
  assert.deepEqual(Array.from(timeMatches('1545 1625')),['15:45','16:25']);
  assert.deepEqual(Array.from(timeMatches('08-30 ص')),['08:30']);
});

test('OCR parser joins adjacent name and time lines',async()=>{
  const {parseTextFallback}=await loadParser();
  const rows=parseTextFallback('سارة أحمد\n17819 1545 1625\nمراجعة دورية');
  assert.ok(rows.length>=1);
  assert.equal(rows[0].start,'15:45');
  assert.equal(rows[0].end,'16:25');
  assert.match(rows[0].name,/سارة أحمد/);
});
