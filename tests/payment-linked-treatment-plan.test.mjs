import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('a payment order creates a linked plan only when no plan already exists', async () => {
  const dashboard = await read('dashboard.js');
  const ensureStart = dashboard.indexOf('async function ensureTreatmentPlanFromPayment');
  const ensureEnd = dashboard.indexOf('function syncPaymentPlanChoice', ensureStart);
  const ensureSource = dashboard.slice(ensureStart, ensureEnd);

  assert.ok(ensureStart > 0);
  assert.match(ensureSource, /existingResponse=await request\(`\$\{PLAN_API\}\?\$\{params\.toString\(\)\}`/);
  assert.match(ensureSource, /if\(existing\.exists&&existing\.plan\)/);
  assert.ok(ensureSource.indexOf('if(existing.exists&&existing.plan)') < ensureSource.indexOf("method:'PUT'"));
  assert.match(ensureSource, /buildPaymentLinkedTreatmentPlan/);
  assert.match(ensureSource, /createIfMissing:true/);
  assert.match(ensureSource, /if\(saved\.existing&&saved\.plan\)/);
  assert.match(await read('netlify/functions/treatment-plan.mjs'), /if \(body\.createIfMissing === true\)/);
  assert.match(dashboard, /if\(paymentRequired\)[\s\S]*?ensureTreatmentPlanFromPayment\(p,selection\.items,paymentRequestedAt,\{vatConfirmed:paymentPlanVatConfirmed\}\)/);
});

test('doctor payment plans are share-ready only after explicit price and VAT confirmation', async () => {
  const [dashboard, planApi, registryApi] = await Promise.all([
    read('dashboard.js'),
    read('netlify/functions/treatment-plan.mjs'),
    read('netlify/functions/treatment-plan-registry.mjs')
  ]);

  assert.match(dashboard, /function paymentLinkedPlanStatus\(\{priced=false,vatConfirmed=false\}=\{\}\)\{return VIEW_MODE==='clinic'&&priced&&vatConfirmed\?'submitted':'draft'\}/);
  assert.match(dashboard, /vatConfirmed:Boolean\(vatConfirmed\)/);
  assert.match(dashboard, /paymentPlanVatConfirmedCheck/);
  assert.match(dashboard, /sourceType:'payment_order'/);
  assert.match(dashboard, /sourcePaymentRequestedAt:Number\(requestedAt\)/);
  assert.match(planApi, /sourceType: plan\?\.meta\?\.sourceType === 'payment_order'/);
  assert.match(registryApi, /sourceType: body\?\.sourceType === 'payment_order'/);
});

test('payment and plan actions use matching icon controls and expose signature sharing', async () => {
  const [dashboard, dashboardCss, center, planClient, index] = await Promise.all([
    read('dashboard.js'),
    read('dashboard.css'),
    read('treatment-plans.js'),
    read('treatment-plan.js'),
    read('index.html')
  ]);

  assert.match(index, /completion-choice-icon/);
  assert.match(dashboardCss, /\.payment-workflow-actions/);
  assert.match(dashboardCss, /\.payment-linked-plan-action\.ready/);
  assert.match(dashboard, /data-plan-center-share=/);
  assert.match(dashboard, /data-payment-plan-share=/);
  assert.match(dashboard, /مشاركة الخطة والتوقيع/);
  assert.match(center, /data-share=/);
  assert.match(planClient, /requestedAction=params\.get\('action'\)==='share'/);
  assert.match(planClient, /focusRequestedAction/);
});

test('payment procedures seed plan quantities and catalog prices without inventing teeth', async () => {
  const [dashboard, planClient] = await Promise.all([read('dashboard.js'), read('treatment-plan.js')]);
  assert.match(dashboard, /beforePrice:free\?0:item\.beforePrice,afterPrice:free\?0:item\.afterPrice/);
  assert.match(dashboard, /teeth:\[\],qty:Math\.max/);
  assert.match(planClient, /function applyPaymentSourceToNewPlan\(\)/);
  assert.match(planClient, /teeth:\[\]/);
  assert.match(planClient, /state\.financial\.vatConfirmed=false/);
});
