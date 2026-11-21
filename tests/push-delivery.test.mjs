import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deliveryOptions, failureAction } from '../netlify/functions/lib/push.mjs';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('push delivery uses high urgency and type-aware TTL with a collapsing topic', () => {
  const payment = deliveryOptions('payment', 'payment-request-1');
  const status = deliveryOptions('patient', 'patient-1');
  assert.equal(payment.urgency, 'high');
  assert.equal(status.urgency, 'high');
  assert.equal(payment.TTL, 4 * 60 * 60);
  assert.equal(status.TTL, 30 * 60);
  assert.match(payment.topic, /^[A-Za-z0-9_-]{24}$/);
  assert.equal(deliveryOptions('lab', 'x').topic, deliveryOptions('patient', 'x').topic);
});

test('expired subscriptions are removed and key mismatches only after repeated failures', () => {
  assert.equal(failureAction(410, 0), 'delete');
  assert.equal(failureAction(404, 0), 'delete');
  assert.equal(failureAction(403, 0), 'record');
  assert.equal(failureAction(403, 4), 'delete');
  assert.equal(failureAction(500, 10), 'record');
});

test('service worker renews rotated subscriptions and re-alerts on repeated tags', async () => {
  const worker = await read('service-worker.js');
  assert.match(worker, /addEventListener\('pushsubscriptionchange'/);
  assert.match(worker, /oldEndpoint/);
  assert.match(worker, /renotify:true/);
});

test('client keeps the subscription alive and offers an end-to-end test', async () => {
  const [dashboard, endpoint] = await Promise.all([read('dashboard.js'), read('netlify/functions/push-subscription.mjs')]);
  assert.match(dashboard, /keepPushSubscriptionAlive\(\{force:true\}\)/);
  assert.match(dashboard, /sameServerKey\(subscription,publicKey\)/);
  assert.match(dashboard, /action=test/);
  assert.match(endpoint, /action==='test'/);
  assert.match(endpoint, /action==='status'/);
});
