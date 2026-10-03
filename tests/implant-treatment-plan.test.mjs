import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('new treatment plans use three implant workflow sections', async () => {
  const client=await read('treatment-plan.js');
  const initial=client.indexOf("kind:'initial',title:'المعالجات الأولية'");
  const implant=client.indexOf("kind:'implant',title:'الجراحة والزراعة'");
  const prosthetic=client.indexOf("kind:'prosthetic',title:'التركيبات'");
  assert.ok(initial>0&&implant>initial&&prosthetic>implant);
  assert.match(client, /phases:defaultTreatmentPhases\(\)/);
  assert.match(client, /const phaseCatalog=phase\.kind\?procedureCatalog\.filter/);
});

test('each structured section supports add-later and doctor-selected ordering', async () => {
  const [client,html]=await Promise.all([read('treatment-plan.js'),read('treatment-plan.html')]);
  assert.match(client, /data-toggle-deferred/);
  assert.match(client, /إضافة لاحقًا/);
  assert.match(client, /data-phase-order/);
  assert.match(client, /function movePhaseToOrder/);
  assert.match(client, /سيتم استكمال تفاصيل هذه المرحلة وإضافتها لاحقًا/);
  assert.match(html, /phase-order-control/);
});

test('payment-created plans distribute procedures into the same sections', async () => {
  const dashboard=await read('dashboard.js');
  assert.match(dashboard, /function paymentPlanPhaseKind\(item\)/);
  assert.match(dashboard, /function paymentLinkedPlanPhases\(items\)/);
  assert.match(dashboard, /phases:paymentLinkedPlanPhases\(items\)/);
  const helperStart=dashboard.indexOf('function paymentPlanPhaseKind(item)');
  const helperEnd=dashboard.indexOf('function paymentLinkedPlanPhases(items)',helperStart);
  const context={};
  vm.runInNewContext(`${dashboard.slice(helperStart,helperEnd)}; result=paymentPlanPhaseKind({code:'post-rct-filling',name:'حشوة تجميلية بعد علاج العصب'});`,context);
  assert.equal(context.result,'initial');
});

test('stored plans retain their phases while only new empty plans get the template', async () => {
  const [client,endpoint]=await Promise.all([read('treatment-plan.js'),read('netlify/functions/treatment-plan.mjs')]);
  assert.match(client, /Array\.isArray\(next\.phases\)&&next\.phases\.length\?next\.phases:defaultTreatmentPhases\(\)/);
  assert.match(endpoint, /kind: \['initial', 'implant', 'prosthetic'\]\.includes\(phase\?\.kind\)/);
  assert.match(endpoint, /deferred: Boolean\(phase\?\.deferred\)/);
});

test('deferred sections remain visible in the public patient signing summary', async () => {
  const [endpoint,client]=await Promise.all([read('netlify/functions/treatment-plan-consent.mjs'),read('plan-consent.js')]);
  assert.match(endpoint, /deferred: Boolean\(phase\?\.deferred\)/);
  assert.match(endpoint, /phase\.items\.length \|\| phase\.deferred/);
  assert.match(client, /phase\.deferred\?' deferred'/);
  assert.match(client, /سيتم استكمال تفاصيل هذه المرحلة وإضافتها لاحقًا/);
});

test('loaded clinic catalogs retain categories and merge new implant defaults', async () => {
  const [client,endpoint]=await Promise.all([read('treatment-plan.js'),read('netlify/functions/treatment-catalog.mjs')]);
  assert.match(client, /DEFAULT_PROCEDURES\.filter\(item=>!remoteIds\.has\(item\.id\)\)/);
  assert.match(endpoint, /category: \['initial', 'implant', 'prosthetic', 'all'\]\.includes/);
  assert.match(endpoint, /if \(code === 'other'\) return 'all'/);
});
