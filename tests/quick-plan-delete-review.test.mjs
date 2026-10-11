import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const js=await readFile(new URL('../quick-plan-review.js',import.meta.url),'utf8');
const source=js.match(/async function confirmMissingReviewPlan\(clinicId\)\{[\s\S]*?\r?\n\}(?=\r?\nasync function loadPlans)/)?.[0];

test('missing list entries never discard unsaved edits without a direct confirmed 404', async()=>{
  assert.ok(source);
  for(const status of [200,401,403,500,'network',404]){
    let closed=0,calls=0;const active={id:'a'.repeat(64),clinicId:'clinic-1',items:[{unsaved:true}]};
    const request=async url=>{calls++;assert.ok(url.includes(`clinic=clinic-1&id=${active.id}`));if(status==='network')throw new Error('offline');return{status}};
    const check=new Function('active','plans','request','$','closePlan','setError',`${source};return confirmMissingReviewPlan`)(active,[],request,()=>({value:'clinic-1'}),()=>closed++,()=>{});
    await check('clinic-1');assert.equal(calls,1);assert.equal(closed,status===404?1:0);assert.deepEqual(active.items,[{unsaved:true}]);
  }
});

test('a late deletion response cannot close another selected plan or clinic',async()=>{
  const active={id:'a'.repeat(64),clinicId:'clinic-1'};let closed=0;
  const check=new Function('active','plans','request','$','closePlan','setError',`${source};return confirmMissingReviewPlan`)(active,[],async()=>{active.id='b'.repeat(64);return{status:404}},()=>({value:'clinic-1'}),()=>closed++,()=>{});
  await check('clinic-1');assert.equal(closed,0);
  assert.match(js,/await confirmMissingReviewPlan\(clinicId\)/);
});
