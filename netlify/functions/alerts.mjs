import { getStore } from '@netlify/blobs';
import { apiHeaders, requireUser, sameOriginRequest } from './lib/session.mjs';
import { sendPushNotifications } from './lib/push.mjs';

const headers = apiHeaders('GET,POST,DELETE,OPTIONS');
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
const alertStore = () => getStore({ name: 'clinic-dashboard-alerts', consistency: 'strong' });
const clinicPattern = /^clinic-([1-9]|1[0-5])$/;
const emptyAlert = () => ({
  active: false,
  message: '',
  kind: 'manual',
  scope: 'all',
  targetClinicId: '',
  targetClinicLabel: '',
  updatedAt: 0,
  updatedBy: '',
});

function cleanAlert(value) {
  const scope = value?.scope === 'clinic' ? 'clinic' : 'all';
  const targetClinicId = scope === 'clinic' && clinicPattern.test(String(value?.targetClinicId || ''))
    ? String(value.targetClinicId)
    : '';
  return {
    active: Boolean(value?.active),
    message: String(value?.message || '').trim().slice(0, 220),
    kind: 'manual',
    scope: targetClinicId ? 'clinic' : 'all',
    targetClinicId,
    targetClinicLabel: targetClinicId ? String(value?.targetClinicLabel || '').trim().slice(0, 120) : '',
    updatedAt: Number(value?.updatedAt || 0),
    updatedBy: String(value?.updatedBy || '').slice(0, 120),
  };
}

function visibleToUser(alert, user) {
  if (!alert.active) return alert;
  if (user?.role === 'admin' || alert.scope === 'all') return alert;
  return String(user?.clinicId || '') === alert.targetClinicId ? alert : emptyAlert();
}

export default async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET' && !sameOriginRequest(request)) return reply({ error: 'Invalid request origin' }, 403);

  const auth = await requireUser(request);
  if (!auth.ok) return reply({ error: auth.error }, auth.status);

  const store = alertStore();
  const key = 'current';

  if (request.method === 'GET') {
    const saved = cleanAlert(await store.get(key, { type: 'json', consistency: 'strong' }));
    return reply({ alert: visibleToUser(saved, auth.user) });
  }

  if (auth.user?.role !== 'admin') return reply({ error: 'Admin role required' }, 403);

  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400); }
    const alert = cleanAlert({
      ...body,
      active: true,
      updatedAt: Date.now(),
      updatedBy: auth.user?.displayName || auth.user?.username || '',
    });
    if (!alert.message) return reply({ error: 'Alert message is required' }, 400);
    if (body?.scope === 'clinic' && !alert.targetClinicId) return reply({ error: 'A valid target clinic is required' }, 400);

    await store.setJSON(key, alert);
    const target = alert.scope === 'clinic' ? alert.targetClinicLabel || alert.targetClinicId : 'جميع العيادات';
    await sendPushNotifications({
      type: 'patient',
      title: alert.scope === 'clinic' ? 'تنبيه موجه من الإدارة' : 'تنبيه عام من الإدارة',
      body: `${alert.message} — إلى ${target}`,
      tag: `manual-alert-${alert.updatedAt}`,
      clinicId: alert.scope === 'clinic' ? alert.targetClinicId : '',
      clinicLabel: alert.scope === 'clinic' ? alert.targetClinicLabel : 'جميع العيادات',
    });
    return reply({ ok: true, alert });
  }

  if (request.method === 'DELETE') {
    const previous = cleanAlert(await store.get(key, { type: 'json', consistency: 'strong' }));
    const alert = { ...emptyAlert(), updatedAt: Date.now(), updatedBy: String(auth.user?.displayName || auth.user?.username || '') };
    await store.setJSON(key, alert);
    return reply({ ok: true, alert, clearedAlertUpdatedAt: previous.updatedAt });
  }

  return reply({ error: 'Method not allowed' }, 405);
};

export const __test = { cleanAlert, visibleToUser, emptyAlert };
