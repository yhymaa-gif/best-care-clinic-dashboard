import { getStore } from '@netlify/blobs';
import { createHash, createHmac } from 'node:crypto';

const IDLE_MS = 3 * 60 * 60 * 1000;
const COOKIE = 'bc_session';
const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,PUT,OPTIONS',
  'access-control-allow-headers': 'content-type',
};
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
const store = name => getStore({ name, consistency: 'strong' });
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const sign = value => createHmac('sha256', process.env.AUTH_SESSION_SECRET || 'change-me-before-production').update(value).digest('hex');
const clinicIdPattern = /^clinic-([1-9]|1[0-5])$/;
const defaults = () => Array.from({ length: 15 }, (_, index) => ({
  id: `clinic-${index + 1}`,
  name: `العيادة ${index + 1}`,
  doctorName: '',
  roomNumber: String(index + 1),
  active: index === 0,
}));
const clean = clinic => ({
  id: clinicIdPattern.test(String(clinic?.id || '')) ? String(clinic.id) : '',
  name: String(clinic?.name || '').trim().slice(0, 80),
  doctorName: String(clinic?.doctorName || '').trim().slice(0, 80),
  roomNumber: String(clinic?.roomNumber || '').trim().slice(0, 20),
  active: Boolean(clinic?.active),
});

async function sessionUser(request) {
  if (process.env.AUTH_ENABLED !== 'true') return { username: 'system', role: 'admin' };
  const cookie = request.headers.get('cookie') || '';
  const raw = cookie.split(';').map(value => value.trim()).find(value => value.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!raw) return null;
  const sessions = store('clinic-dashboard-auth-sessions');
  const key = `sessions/${hash(raw)}`;
  const session = await sessions.get(key, { type: 'json', consistency: 'strong' });
  const now = Date.now();
  if (!session || session.tokenSignature !== sign(raw) || now - Number(session.lastSeenAt || 0) > IDLE_MS || now > Number(session.expiresAt || 0)) {
    if (session) await sessions.delete(key);
    return null;
  }
  session.lastSeenAt = now;
  await sessions.setJSON(key, session);
  return session.user || null;
}

function mergeClinics(saved) {
  const base = defaults();
  const version = Number(saved?.version || 0);
  const incoming = new Map((Array.isArray(saved?.clinics) ? saved.clinics : []).map(item => {
    const value = clean(item);
    return [value.id, value];
  }).filter(([id]) => id));
  return base.map((fallback, index) => {
    const value = incoming.get(fallback.id);
    if (!value) return fallback;
    const number = index + 1;
    const legacyPlaceholder = version < 2 && number > 1 && value.active && !value.doctorName &&
      value.roomNumber === String(number) && value.name === `العيادة ${number}`;
    return {
      ...fallback,
      ...value,
      name: value.name || fallback.name,
      roomNumber: value.roomNumber || fallback.roomNumber,
      active: number === 1 ? true : (legacyPlaceholder ? false : value.active),
    };
  });
}

export default async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const user = await sessionUser(request);
  if (!user) return reply({ error: 'Authentication required' }, 401);

  const configStore = store('clinic-dashboard-config');
  const key = 'clinics';
  if (request.method === 'GET') {
    const saved = await configStore.get(key, { type: 'json', consistency: 'strong' });
    const clinics = mergeClinics(saved);
    const state = { version: 2, clinics, updatedAt: Number(saved?.updatedAt || 0) };
    if (saved && Number(saved.version || 0) < 2) await configStore.setJSON(key, state);
    return reply(state);
  }

  if (request.method === 'PUT') {
    if (user.role !== 'admin') return reply({ error: 'Admin role required' }, 403);
    let body;
    try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400); }
    if (!Array.isArray(body.clinics)) return reply({ error: 'Invalid clinics' }, 400);
    const incoming = new Map(body.clinics.map(item => {
      const value = clean(item);
      return [value.id, value];
    }).filter(([id]) => id));
    const clinics = defaults().map((fallback, index) => {
      const value = incoming.get(fallback.id);
      return value ? {
        ...fallback,
        ...value,
        name: value.name || fallback.name,
        roomNumber: value.roomNumber || fallback.roomNumber,
        active: index === 0 ? true : value.active,
      } : fallback;
    });
    const state = { version: 2, clinics, updatedAt: Date.now(), updatedBy: String(user.username || '') };
    await configStore.setJSON(key, state);
    return reply({ ok: true, ...state });
  }

  return reply({ error: 'Method not allowed' }, 405);
};
