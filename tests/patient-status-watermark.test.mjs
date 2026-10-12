import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const js=await readFile(new URL('../dashboard.js',import.meta.url),'utf8');
const css=await readFile(new URL('../dashboard.css',import.meta.url),'utf8');
const source=js.slice(js.indexOf('function patientStatusWatermarkMarkup('),js.indexOf('function renderTable(){'));
const renderer=(language='ar',view='admin')=>new Function('lang','VIEW_MODE','escapeHtml',`${source};return patientStatusWatermarkMarkup`)(language,view,value=>String(value));

test('watermarks follow explicit display statuses in both languages without guessing from row colors',()=>{
  const ar=renderer(),en=renderer('en');
  for(const [status,arabic,english] of [['done','مكتمل','Completed'],['arrived','وصل','Arrived'],['early_arrival','وصل مبكرًا','Arrived early'],['late','متأخر','Late'],['cancel','ملغي موعده','Cancelled']]){
    assert.ok(ar(status).includes(`>${arabic}</span>`));assert.ok(en(status).includes(`>${english}</span>`));
    assert.match(ar(status),/aria-hidden="true"/);
  }
  for(const status of ['waiting','active','left','asks_delay','unknown'])assert.equal(ar(status),'');
  assert.equal(renderer('ar','clinic')('done'),'');
});

test('watermarks decorate table and hub without changing layout, interaction, timers or printed records',()=>{
  assert.match(js,/patientStatusWatermarkMarkup\(displayStatus\)/);
  assert.match(js,/patientStatusWatermarkMarkup\(status\)/);
  assert.match(css,/\.patient-status-watermark\{[^}]*position:absolute[^}]*pointer-events:none[^}]*user-select:none/);
  assert.match(css,/@media print\{\.patient-status-watermark\{display:none!important/);
  assert.doesNotMatch(source,/setInterval|setTimeout|Date\.now|localStorage|fetch\(/);
});
