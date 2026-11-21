import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';
import webpush from 'web-push';

const store = () => getStore({ name: 'clinic-dashboard-push-subscriptions', consistency: 'strong' });
const keyFor = endpoint => `subscriptions/${crypto.createHash('sha256').update(endpoint).digest('hex')}`;
const configured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
const safeRole = role => role === 'admin' ? 'admin' : 'clinic';
const safeClinic = id => /^clinic-([1-9]|1[0-5])$/.test(String(id || '')) ? String(id) : 'clinic-1';
const safeColor = value => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : '#176344';
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

export function isNotificationDeliveryWindow(value = Date.now()) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) return false;
  const riyadh = new Date(timestamp + RIYADH_OFFSET_MS);
  return riyadh.getUTCDay() !== 5 && riyadh.getUTCHours() >= 14 && riyadh.getUTCHours() < 23;
}

export const publicVapidKey = () => process.env.VAPID_PUBLIC_KEY || '';
const vapid = () => webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:notifications@bestcare.sa', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
// Push services drop messages whose TTL expires while a phone sleeps. Keep
// short-lived status alerts brief and give actionable work more time; the
// topic header still collapses repeats so the phone shows only the latest one.
const LONG_LIVED_TYPES = new Set(['payment', 'lab', 'appointment_request', 'treatment_plan', 'prescription']);
export const deliveryOptions = (type, tag) => ({
  TTL: LONG_LIVED_TYPES.has(type) ? 4 * 60 * 60 : 30 * 60,
  urgency: 'high',
  topic: crypto.createHash('sha256').update(String(tag || type || 'update')).digest('base64url').slice(0, 24),
});
// 404/410: the browser dropped the subscription. 401/403: usually a key
// mismatch; tolerate a few in case of a transient configuration problem.
const MAX_AUTH_FAILURES = 5;
export const failureAction = (statusCode, failures = 0) => {
  if (statusCode === 404 || statusCode === 410) return 'delete';
  if ((statusCode === 401 || statusCode === 403) && failures + 1 >= MAX_AUTH_FAILURES) return 'delete';
  return 'record';
};

export async function savePushSubscription(subscription, { user = null, clientId = '', clinicId = 'clinic-1', showPatientDetails = false, allowOutsideWorkHours = false, oldEndpoint = '', inherit = false } = {}) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) throw new Error('Invalid push subscription');
  if (!user?.username) throw new Error('Authenticated user required');
  const pushStore = store();
  // A browser-rotated subscription (pushsubscriptionchange) keeps the device's
  // previous preferences; the old endpoint is removed once the new one is saved.
  const previous = oldEndpoint && oldEndpoint !== subscription.endpoint
    ? await pushStore.get(keyFor(oldEndpoint), { type: 'json', consistency: 'strong' }).catch(() => null)
    : null;
  const ownsPrevious = previous && (user.role === 'admin' || String(previous.username || '') === String(user.username));
  const base = inherit && ownsPrevious ? previous : null;
  const existing = await pushStore.get(keyFor(subscription.endpoint), { type: 'json', consistency: 'strong' }).catch(() => null);
  await pushStore.setJSON(keyFor(subscription.endpoint), {
    subscription,
    username: String(user.username).slice(0, 48),
    role: safeRole(user.role),
    clientId: String((base ? base.clientId : clientId) || '').slice(0, 100),
    clinicId: safeClinic(base ? base.clinicId : clinicId),
    showPatientDetails: Boolean(base ? base.showPatientDetails : showPatientDetails),
    allowOutsideWorkHours: Boolean(base ? base.allowOutsideWorkHours : allowOutsideWorkHours),
    createdAt: Number(existing?.createdAt || base?.createdAt || Date.now()),
    lastDeliveredAt: Number(existing?.lastDeliveredAt || 0),
    failures: 0,
    lastError: '',
    updatedAt: Date.now(),
  });
  if (ownsPrevious) await pushStore.delete(keyFor(oldEndpoint)).catch(() => {});
}

export async function pushSubscriptionStatus(endpoint, user = null) {
  if (!endpoint || !user?.username) return { registered: false };
  const record = await store().get(keyFor(endpoint), { type: 'json', consistency: 'strong' }).catch(() => null);
  if (!record || (user.role !== 'admin' && String(record.username || '') !== String(user.username))) return { registered: false, configured: configured() };
  return {
    registered: true,
    configured: configured(),
    role: record.role,
    clinicId: record.clinicId,
    allowOutsideWorkHours: Boolean(record.allowOutsideWorkHours),
    withinDeliveryWindow: isNotificationDeliveryWindow(),
    updatedAt: Number(record.updatedAt || 0),
    lastDeliveredAt: Number(record.lastDeliveredAt || 0),
    failures: Number(record.failures || 0),
    lastError: String(record.lastError || ''),
  };
}

// Sends one notification to the caller's own device, ignoring the delivery
// window, and reports exactly what the push service answered.
export async function sendTestNotification(endpoint, user = null) {
  if (!configured()) return { ok: false, reason: 'not_configured' };
  if (!endpoint || !user?.username) return { ok: false, reason: 'not_registered' };
  const pushStore = store();
  const key = keyFor(endpoint);
  const record = await pushStore.get(key, { type: 'json', consistency: 'strong' }).catch(() => null);
  if (!record?.subscription?.endpoint || (user.role !== 'admin' && String(record.username || '') !== String(user.username))) return { ok: false, reason: 'not_registered' };
  vapid();
  const payload = {
    title: 'اختبار تنبيهات أفضل عناية',
    body: 'وصل الإشعار التجريبي إلى هذا الجهاز بنجاح ✓',
    type: 'test',
    tag: `bestcare-test-${Date.now()}`,
    url: `/?view=${record.role === 'admin' ? 'admin' : 'clinic'}&clinic=${record.clinicId}`,
    test: true,
    updatedAt: Date.now(),
  };
  try {
    const result = await webpush.sendNotification(record.subscription, JSON.stringify(payload), { TTL: 120, urgency: 'high' });
    await pushStore.setJSON(key, { ...record, failures: 0, lastError: '', lastDeliveredAt: Date.now() });
    return { ok: true, statusCode: Number(result?.statusCode || 201) };
  } catch (error) {
    const statusCode = Number(error?.statusCode || 0);
    if (failureAction(statusCode, Number(record.failures || 0)) === 'delete') await pushStore.delete(key).catch(() => {});
    else await pushStore.setJSON(key, { ...record, failures: Number(record.failures || 0) + 1, lastError: String(statusCode || error?.message || 'error').slice(0, 80), lastErrorAt: Date.now() }).catch(() => {});
    return { ok: false, reason: statusCode === 404 || statusCode === 410 ? 'expired' : statusCode === 401 || statusCode === 403 ? 'key_mismatch' : 'push_service_error', statusCode };
  }
}

export async function deletePushSubscription(endpoint, user = null) {
  if (!endpoint || !user?.username) return false;
  const pushStore = store();
  const key = keyFor(endpoint);
  const record = await pushStore.get(key, { type: 'json', consistency: 'strong' });
  if (!record) return true;
  const permitted = user.role === 'admin' || String(record.username || '') === String(user.username);
  if (!permitted) return false;
  await pushStore.delete(key);
  return true;
}

export async function sendPushNotifications(event, { excludeClientId = '' } = {}) {
  if (!configured() || !event?.title) return { sent: 0, skipped: true };
  vapid();
  const pushStore = store();
  const listed = await pushStore.list({ prefix: 'subscriptions/' });
  const entries = Array.isArray(listed?.blobs) ? listed.blobs : [];
  const withinDeliveryWindow = isNotificationDeliveryWindow();
  let sent = 0, suppressed = 0;
  await Promise.allSettled(entries.map(async entry => {
    const record = await pushStore.get(entry.key, { type: 'json', consistency: 'strong' });
    if (!record?.subscription?.endpoint) return;
    if (!withinDeliveryWindow && record.allowOutsideWorkHours !== true) { suppressed += 1; return; }
    if (excludeClientId && record.clientId === excludeClientId) return;
    // Administration receives alerts from every active clinic. Clinic users only
    // receive alerts belonging to their own clinic.
    if (event.clinicId && record.role !== 'admin' && record.clinicId !== event.clinicId) return;
    if (event.type === 'payment' && record.role !== 'admin') return;
    if (event.type === 'appointment_request' && record.role !== 'admin') return;
    const clinicLabel = event.clinicLabel ? ` — ${event.clinicLabel}` : '';
    const detail = record.showPatientDetails && event.patientName
      ? ` ${event.patientName}${event.patientFile ? ` — ملف ${event.patientFile}` : ''}.`
      : '';
    const appointmentTime = /^\d{1,2}:\d{2}$/.test(String(event.appointmentTime || '')) ? String(event.appointmentTime) : '';
    const actionBody = event.actionLabel
      ? (record.showPatientDetails && event.patientName
        ? `المريض ${event.patientName}${appointmentTime ? ` — الساعة ${appointmentTime}` : ''} — ${event.actionLabel}.`
        : `${appointmentTime ? `موعد الساعة ${appointmentTime} — ` : ''}${event.actionLabel}.`)
      : '';
    const targetClinic = event.clinicId || record.clinicId;
    const payload = {
      title: `${event.title}${clinicLabel}`,
      body: actionBody || `${event.body}${detail}`,
      type: event.type || 'patient',
      tag: event.tag || `bestcare-${event.type || 'update'}`,
      clinicId: event.clinicId || '',
      date: event.date || '',
      revision: Number(event.revision || 0),
      updatedAt: Number(event.updatedAt || Date.now()),
      color: safeColor(event.color),
      url: event.url || (event.type === 'lab'
        ? `/lab.html?clinic=${encodeURIComponent(targetClinic)}`
        : `/?view=${event.type === 'payment' ? 'admin' : record.role}&clinic=${targetClinic}`),
    };
    try {
      await webpush.sendNotification(record.subscription, JSON.stringify(payload), deliveryOptions(payload.type, payload.tag));
      sent += 1;
      if (Number(record.failures || 0) > 0) await pushStore.setJSON(entry.key, { ...record, failures: 0, lastError: '', lastDeliveredAt: Date.now() }).catch(() => {});
    } catch (error) {
      const statusCode = Number(error?.statusCode || 0);
      if (failureAction(statusCode, Number(record.failures || 0)) === 'delete') await pushStore.delete(entry.key).catch(() => {});
      else {
        console.warn('Push delivery failed', statusCode || error?.message);
        await pushStore.setJSON(entry.key, { ...record, failures: Number(record.failures || 0) + 1, lastError: String(statusCode || error?.message || 'error').slice(0, 80), lastErrorAt: Date.now() }).catch(() => {});
      }
    }
  }));
  return { sent, suppressed, outsideWorkingHours: !withinDeliveryWindow };
}
