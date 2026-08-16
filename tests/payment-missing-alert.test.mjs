import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('completed patients without a payment order create an administration action', async () => {
  const script = await readFile(new URL('dashboard.js', root), 'utf8');
  const css = await readFile(new URL('dashboard.css', root), 'utf8');

  assert.match(script, /function paymentOrderExists\(p\)/);
  assert.match(script, /function paymentMissingAfterCompletion\(p\)/);
  assert.match(script, /add\('payment_missing'/);
  assert.match(script, /function paymentMissingBadgeMarkup\(p\)[\s\S]*payment-missing-badge/);
  assert.match(script, /data-payment-missing-id=/);
  assert.match(script, /function openMissingPaymentOrder\(id\)/);
  assert.match(script, /if\(paymentMissing&&VIEW_MODE==='admin'\)openMissingPaymentOrder\(paymentMissing\)/);
  assert.match(css, /\.payment-missing-badge\{/);
  assert.match(css, /\.payment-missing-action\{/);
});
