import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const js=fs.readFileSync(path.join(root,'dashboard.js'),'utf8');
const css=fs.readFileSync(path.join(root,'dashboard.css'),'utf8');

test('Yahya assistant is a namespaced, animated read-only dashboard helper',()=>{
  assert.match(html,/id="yahyaAssistantBtn"/);
  assert.match(html,/id="yahyaAssistantPanel"/);
  assert.match(html,/id="yahyaAssistantForm"/);
  assert.match(js,/yahyaAssistantKnowledge/);
  assert.match(js,/yahyaAssistantAnswer/);
  assert.match(js,/initYahyaAssistant\(\)/);
  assert.match(css,/\.yahya-assistant-fab/);
  assert.match(css,/yahyaAssistantSpin/);
  assert.doesNotMatch(js,/fetch\([^)]*assistant/i,'The local helper must not introduce an external assistant endpoint');
});

test('Yahya assistant exposes the operational topics requested by clinic staff',()=>{
  for(const topic of ['مزامنه','خطة علاج','امر دفع','معمل','وصفه','موعد عاجل','تقييم','احصائيات','استيراد','بحث عن مريض','الوضع الداكن'])assert.match(js,new RegExp(topic));
});
