import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';
import webpush from 'web-push';

const store = () => getStore({ name: 'clinic-dashboard-push-subscriptions', consistency: 'strong' });
const keyFor = endpoint => `subscriptions/${crypto.createHash('sha256').update(endpoint).digest('hex')}`;
const configured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
const safeRole = role => role === 'admin' ? 'admin' : 'clinic';
const safeClinic = id => /^clinic-([1-9]|1[0-5])$/.test(String(id || '')) ? String(id) : 'clinic-1';

export const publicVapidKey = () => process.env.VAPID_PUBLIC_KEY || '';

export async function savePushSubscription(subscription, { role = 'clinic', clientId = '', clinicId = 'clinic-1', showPatientDetails = false } = {}) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) throw new Error('Invalid push subscription');
  await store().setJSON(keyFor(subscription.endpoint), {
    subscription,
    role: safeRole(role),
    clientId: String(clientId || '').slice(0, 100),
    clinicId: safeClinic(clinicId),
    showPatientDetails: Boolean(showPatientDetails),
    updatedAt: Date.now(),
  });
}

export async function deletePushSubscription(endpoint) {
  if (endpoint) await store().delete(keyFor(endpoint));
}

export async function sendPushNotifications(event, { excludeClientId = '' } = {}) {
  if (!configured() || !event?.title) return { sent: 0, skipped: true };
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:notifications@bestcare.sa', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const pushStore = store();
  const listed = await pushStore.list({ prefix: 'subscriptions/' });
  const entries = Array.isArray(listed?.blobs) ? listed.blobs : [];
  let sent = 0;
  await Promise.allSettled(entries.map(async entry => {
    const record = await pushStore.get(entry.key, { type: 'json', consistency: 'strong' });
    if (!record?.subscription?.endpoint) return;
    if (excludeClientId && record.clientId === excludeClientId) return;
    // Administration receives alerts from every active clinic. Clinic users only
    // receive alerts belonging to their own clinic.
    if (event.clinicId && record.role !== 'admin' && record.clinicId !== event.clinicId) return;
    if (event.type === 'payment' && record.role !== 'admin') return;
    const clinicLabel = event.clinicLabel ? ` — ${event.clinicLabel}` : '';
    const detail = record.showPatientDetails && event.patientName
      ? ` ${event.patientName}${event.patientFile ? ` — ملف ${event.patientFile}` : ''}.`
      : '';
    const targetClinic = event.clinicId || record.clinicId;
    const payload = {
      title: `${event.title}${clinicLabel}`,
      body: `${event.body}${detail}`,
      type: event.type || 'patient',
      tag: event.tag || `bestcare-${event.type || 'update'}`,
      url: `/?view=${event.type === 'payment' ? 'admin' : record.role}&clinic=${targetClinic}`,
    };
    try {
      const topic = crypto.createHash('sha256').update(String(payload.tag)).digest('base64url').slice(0, 24);
      await webpush.sendNotification(record.subscription, JSON.stringify(payload), { TTL: 180, urgency: 'normal', topic });
      sent += 1;
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) await pushStore.delete(entry.key);
      else console.warn('Push delivery failed', error?.statusCode || error?.message);
    }
  }));
  return { sent };
}
