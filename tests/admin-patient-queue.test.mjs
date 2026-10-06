import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

await import('../admin-patient-queue.js');
const queue=globalThis.BestCareAdminQueue;

test('administration queue separates completed patients from the waiting list',()=>{
  assert.equal(queue.group('waiting'),'waiting');
  assert.equal(queue.group('active'),'waiting');
  assert.equal(queue.group('done'),'completed');
});

test('current and due patients sort before upcoming and completed patients',()=>{
  const now=Date.UTC(2026,9,6,10,0,0); // 13:00 in Riyadh
  const date='2026-10-06';
  const clock=queue.riyadhClock(now);
  const rows=[
    {patient:{id:'done',start:'11:30',completedAt:1},status:'done'},
    {patient:{id:'upcoming',start:'13:20'},status:'waiting'},
    {patient:{id:'due',start:'12:45'},status:'waiting'},
    {patient:{id:'current',start:'14:00'},status:'active'}
  ].sort((left,right)=>queue.compare(left,right,{date,now,clock}));
  assert.deepEqual(rows.map(row=>row.patient.id),['current','due','upcoming','done']);
  assert.equal(queue.timing(rows[1].patient,{status:'waiting',date,now}).state,'due');
  assert.equal(queue.timing(rows[2].patient,{status:'waiting',date,now}).state,'upcoming');
});

test('administration interface renders both queue sections and due-time labels',()=>{
  const dashboard=fs.readFileSync(new URL('../dashboard.js',import.meta.url),'utf8');
  assert.match(dashboard,/في الانتظار والمتابعة/);
  assert.match(dashboard,/لا يوجد مرضى منجزون حتى الآن/);
  assert.match(dashboard,/لا يوجد مرضى في الانتظار حاليًا/);
  assert.match(dashboard,/حان موعده الآن/);
  assert.match(dashboard,/admin-table-group-divider/);
  assert.match(dashboard,/adminHubWaitingCount/);
  assert.match(dashboard,/adminHubCompletedCount/);
  assert.match(dashboard,/minuteKey!==adminQueueMinuteKey/);
  assert.match(dashboard,/completedWasOpen/);
  assert.match(dashboard,/previousScrollTop/);
  assert.match(dashboard,/focusedHref/);
});
