import { createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { apiHeaders, canAccessClinic, requireUser, sameOriginRequest } from './lib/session.mjs';

const headers = apiHeaders('GET,POST,DELETE,OPTIONS');
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
const presenceStore = () => getStore({ name: 'clinic-dashboard-presence', consistency: 'strong' });
const clinicPattern = /^clinic-([1-9]|1[0-5])$/;
const ONLINE_TTL_MS = 90 * 1000;
const DELETE_AFTER_MS = 24 * 60 * 60 * 1000;

const safeDeviceId = value => {
  const id = String(value || '').trim();
  return /^[a-zA-Z0-9_-]{12,120}$/.test(id) ? id : '';
};
const safeClinicId = value => clinicPattern.test(String(value || '')) ? String(value) : 'clinic-1';
const deviceKey = id => `devices/${createHash('sha256').update(id).digest('hex')}`;
const inferDeviceType = request => {
  const ua = String(request.headers.get('user-agent') || '').toLowerCase();
  if (/ipad|tablet|kindle|silk/.test(ua)) return 'tablet';
  if (/android|iphone|ipod|mobile/.test(ua)) return 'mobile';
  return 'desktop';
};

async function readOnlineRecords(store, now = Date.now()) {
  const listed = await store.list({ prefix: 'devices/' });
  const entries = Array.isArray(listed?.blobs) ? listed.blobs : [];
  const records = [];
  await Promise.all(entries.map(async entry => {
    const record = await store.get(entry.key, { type: 'json', consistency: 'strong' });
    if (!record) return;
    const age = now - Number(record.lastSeenAt || 0);
    if (age > DELETE_AFTER_MS) {
      await store.delete(entry.key);
      return;
    }
    if (age <= ONLINE_TTL_MS) records.push(record);
  }));
  return records;
}

function summarize(records, user) {
  const visible = user.role === 'admin'
    ? records
    : records.filter(record => record.view === 'clinic' && canAccessClinic(user, record.clinicId));
  const byClinic = {};
  visible.forEach(record => {
    if (record.view !== 'clinic') return;
    const clinicId = safeClinicId(record.clinicId);
    byClinic[clinicId] = Number(byClinic[clinicId] || 0) + 1;
  });
  return {
    online: visible.length,
    administration: visible.filter(record => record.view === 'admin').length,
    clinics: visible.filter(record => record.view === 'clinic').length,
    desktop: visible.filter(record => record.deviceType === 'desktop').length,
    mobile: visible.filter(record => record.deviceType === 'mobile').length,
    tablet: visible.filter(record => record.deviceType === 'tablet').length,
    byClinic,
    scope: user.role === 'admin' ? 'all' : safeClinicId(user.clinicId),
    updatedAt: Date.now(),
    expiresAfterSeconds: Math.round(ONLINE_TTL_MS / 1000),
  };
}

export const __test = { summarize, readOnlineRecords, safeDeviceId };

export default async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (!['GET', 'POST', 'DELETE'].includes(request.method)) return reply({ error: 'Method not allowed' }, 405);
  if (request.method !== 'GET' && !sameOriginRequest(request)) return reply({ error: 'Invalid request origin' }, 403);

  const auth = await requireUser(request);
  if (!auth.ok) return reply({ error: auth.error }, auth.status);
  const user = auth.user;
  const store = presenceStore();

  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400); }
    const deviceId = safeDeviceId(body.deviceId);
    if (!deviceId) return reply({ error: 'Invalid device identifier' }, 400);
    const requestedClinic = safeClinicId(body.clinicId);
    const clinicId = user.role === 'admin'
      ? requestedClinic
      : safeClinicId(user.clinicId);
    if (!canAccessClinic(user, clinicId)) return reply({ error: 'Clinic access denied' }, 403);
    const view = body.view === 'admin' && user.role === 'admin' ? 'admin' : 'clinic';
    await store.setJSON(deviceKey(deviceId), {
      username: String(user.username || '').slice(0, 48),
      displayName: String(user.displayName || '').slice(0, 80),
      role: user.role === 'admin' ? 'admin' : 'clinic',
      clinicId,
      view,
      deviceType: inferDeviceType(request),
      standalone: Boolean(body.standalone),
      lastSeenAt: Date.now(),
    });
  }

  if (request.method === 'DELETE') {
    let body;
    try { body = await request.json(); } catch { body = {}; }
    const deviceId = safeDeviceId(body.deviceId);
    if (deviceId) {
      const key = deviceKey(deviceId);
      const record = await store.get(key, { type: 'json', consistency: 'strong' });
      const permitted = user.role === 'admin' || String(record?.username || '') === String(user.username || '');
      if (record && permitted) await store.delete(key);
    }
  }

  const records = await readOnlineRecords(store);
  return reply({ ok: true, ...summarize(records, user) });
};
