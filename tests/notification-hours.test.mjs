import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isNotificationDeliveryWindow } from '../netlify/functions/lib/push.mjs';

const at = value => new Date(value).getTime();
const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('push delivery is limited to Sat–Thu from 14:00 until before 23:00 Riyadh', () => {
  assert.equal(isNotificationDeliveryWindow(at('2026-09-06T10:59:59Z')), false);
  assert.equal(isNotificationDeliveryWindow(at('2026-09-06T11:00:00Z')), true);
  assert.equal(isNotificationDeliveryWindow(at('2026-09-06T19:59:59Z')), true);
  assert.equal(isNotificationDeliveryWindow(at('2026-09-06T20:00:00Z')), false);
  assert.equal(isNotificationDeliveryWindow(at('2026-09-04T12:00:00Z')), false);
});

test('client suppresses automated sounds and system notifications outside the same window', async () => {
  const dashboard = await read('dashboard.js');
  assert.match(dashboard, /function automatedAlertsAllowed\(\)\{return syncCadence\(\)\.workHours\|\|outsideHoursNotificationsEnabled\(\)\}/);
  assert.match(dashboard, /async function showSystemNotification\(event\)\{[\s\S]*?if\(!automatedAlertsAllowed\(\)\)return/);
  assert.match(dashboard, /if\(notification&&automatedAlertsAllowed\(\)\)\{playAlertSound/);
  assert.match(dashboard, /if\(automatedAlertsAllowed\(\)\)\{prepareAudio\(\);playAlertSound\('urgent'\)\}/);
});

test('settings expose an opt-in per-device after-hours override', async () => {
  const [html, dashboard, endpoint, push] = await Promise.all([
    read('index.html'), read('dashboard.js'), read('netlify/functions/push-subscription.mjs'), read('netlify/functions/lib/push.mjs')
  ]);
  assert.match(html, /id="outsideHoursNotificationsBtn"/);
  assert.match(dashboard, /allowOutsideWorkHours:outsideHoursNotificationsEnabled\(\)/);
  assert.match(endpoint, /allowOutsideWorkHours:body\.allowOutsideWorkHours/);
  assert.match(push, /record\.allowOutsideWorkHours !== true/);
});
