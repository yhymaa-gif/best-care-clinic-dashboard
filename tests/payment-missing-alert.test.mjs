import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('completed patients without a payment order create an administration action', async () => {
  const script = await readFile(new URL('dashboard.js', root), 'utf8');
  const css = await readFile(new URL('dashboard.css', root), 'utf8');

  assert.match(script, /function paymentOrderExists\(p\)/);
  assert.match(script, /function riyadhDateKey\(value=Date\.now\(\)\)/);
  assert.match(script, /function dailyQuickActionsVisible\(date=selectedDate\)/);
  assert.match(script, /function paymentMissingAfterCompletion\(p\)/);
  assert.match(script, /VIEW_MODE==='admin'&&dailyQuickActionsVisible\(\)&&derivedStatus\(p\)==='done'/);
  assert.match(script, /!Number\(p\?\.paymentNotRequiredAt\|\|0\)/);
  assert.match(script, /add\('payment_missing'/);
  assert.match(script, /function paymentMissingBadgeMarkup\(p\)[\s\S]*payment-missing-badge/);
  assert.match(script, /data-payment-missing-id=/);
  assert.match(script, /dailyQuickActionsVisible\(\)&&VIEW_MODE==='clinic'\?clinicIconAction\('💊'/);
  assert.match(script, /function openMissingPaymentOrder\(id\)/);
  assert.match(script, /if\(paymentMissing&&VIEW_MODE==='admin'\)openMissingPaymentOrder\(paymentMissing\)/);
  assert.match(script, /p\.paymentMissingAlertAt=Date\.now\(\)/);
  assert.match(script, /kind:'payment-missing'/);
  assert.match(script, /function renderPaymentMissingAlert\(\)/);
  assert.match(script, /id='paymentMissingAlert'/);
  assert.match(script, /data-payment-missing-id/);
  assert.match(script, /if\(sync\.dirty\)await pushState\(\)/);
  assert.match(css, /\.payment-missing-badge\{/);
  assert.match(css, /\.payment-missing-action\{/);
  assert.match(css, /\.payment-missing-alert\{/);
});

test('doctor can explicitly complete a visit with no payment required', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('dashboard.js', root), 'utf8')
  ]);
  assert.match(html, /id="noPaymentRequiredCheck"/);
  assert.match(html, /id="noPaymentChoiceTitle">لا توجد دفعة مطلوبة/);
  assert.match(script, /p\.paymentNotRequiredAt=noPaymentRequired\?Date\.now\(\):0/);
  assert.match(script, /kind:'payment-not-required'/);
  assert.match(script, /if\(\$\('paymentRequiredCheck'\)\.checked\)\$\('noPaymentRequiredCheck'\)\.checked=false/);
  assert.match(script, /if\(paymentRequired&&selection\.error\)/);
});
