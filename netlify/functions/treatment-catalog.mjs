import { getStore } from '@netlify/blobs';
import { createHash, createHmac } from 'node:crypto';

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, no-cache, must-revalidate',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,PUT,OPTIONS',
  'access-control-allow-headers': 'content-type,accept'
};
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
const store = getStore({ name: 'clinic-treatment-catalog', consistency: 'strong' });
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const validClinic = value => /^clinic-([1-9]|1[0-5])$/.test(value || '');
const cleanText = (value, max = 120) => String(value ?? '').trim().slice(0, max);
const DEFAULT_ITEMS = [
  ['cosmetic-filling', 'حشوة تجميلية'],
  ['post-rct-filling', 'حشوة تجميلية بعد علاج العصب'],
  ['root-canal', 'علاج عصب'],
  ['root-canal-retreatment', 'إعادة علاج عصب'],
  ['remove-post', 'إزالة وتد'],
  ['place-post', 'تركيب وتد'],
  ['remove-crown', 'إزالة تاج'],
  ['recement-crown', 'إعادة تثبيت تاج'],
  ['ceramic-crown', 'تركيب سيراميك تاج'],
  ['ceramic-veneer', 'تركيب سيراميك فينير'],
  ['implant-crown', 'تركيبة زراعة'],
  ['implant-surgery', 'زراعة — الجزء الجراحي'],
  ['extraction', 'خلع الأسنان'],
  ['temporary', 'تركيب مؤقت'],
  ['smile-design', 'تصميم ابتسامة'],
  ['smile-analysis', 'تحليل ابتسامة'],
  ['cleaning-standard', 'تنظيف أسنان عادي'],
  ['cleaning-gbt', 'تنظيف أسنان GBT'],
  ['other', 'إجراء آخر']
].map(([id, name]) => ({ id, name, beforePrice: '', afterPrice: '' }));

async function authUser(request) {
  if (process.env.AUTH_ENABLED !== 'true') return { role: 'admin' };
  const raw = (request.headers.get('cookie') || '').split(';').map(value => value.trim()).find(value => value.startsWith('bc_session='))?.slice(11);
  if (!raw) return null;
  const key = `sessions/${hash(raw)}`;
  const sessionStore = getStore({ name: 'clinic-dashboard-auth-sessions', consistency: 'strong' });
  const session = await sessionStore.get(key, { type: 'json', consistency: 'strong' });
  const now = Date.now();
  const signature = createHmac('sha256', process.env.AUTH_SESSION_SECRET || 'change-me-before-production').update(raw).digest('hex');
  if (!session || session.tokenSignature !== signature || now - Number(session.lastSeenAt || 0) > 3 * 60 * 60 * 1000 || now > Number(session.expiresAt || 0)) {
    if (session) await sessionStore.delete(key);
    return null;
  }
  session.lastSeenAt = now;
  await sessionStore.setJSON(key, session);
  return session.user || null;
}

const cleanItems = items => (Array.isArray(items) ? items : []).slice(0, 60).map((item, index) => {
  const id = cleanText(item?.id, 50).toLowerCase().replace(/[^a-z0-9_-]/g, '') || `custom-${index + 1}`;
  const cleanPrice = value => value === '' || value === null || value === undefined
    ? ''
    : Math.min(10_000_000, Math.max(0, Number(value) || 0));
  const beforePrice = cleanPrice(item?.beforePrice);
  const afterPrice = cleanPrice(item?.afterPrice ?? item?.price);
  return { id, name: cleanText(item?.name, 120), beforePrice, afterPrice };
}).filter(item => item.name);

export default async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const user = await authUser(request);
  if (!user) return reply({ error: 'Authentication required' }, 401);
  const url = new URL(request.url);
  const clinicId = url.searchParams.get('clinic') || 'clinic-1';
  if (!validClinic(clinicId)) return reply({ error: 'Invalid clinic' }, 400);
  const key = `catalog/${clinicId}`;

  if (request.method === 'GET') {
    const record = await store.get(key, { type: 'json', consistency: 'strong' });
    return reply({
      clinicId,
      items: record?.items?.length ? cleanItems(record.items) : DEFAULT_ITEMS,
      updatedAt: Number(record?.updatedAt || 0),
      revision: Number(record?.revision || 0)
    });
  }
  if (request.method === 'PUT') {
    if (user.role !== 'admin') return reply({ error: 'Admin access required' }, 403);
    let body;
    try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400); }
    const items = cleanItems(body?.items);
    if (!items.length) return reply({ error: 'At least one procedure is required' }, 400);
    if (new Set(items.map(item => item.id)).size !== items.length) return reply({ error: 'Duplicate procedure id' }, 400);
    const current = await store.get(key, { type: 'json', consistency: 'strong' });
    const record = { clinicId, items, updatedAt: Date.now(), revision: Number(current?.revision || 0) + 1 };
    await store.setJSON(key, record);
    return reply({ ok: true, ...record });
  }
  return reply({ error: 'Method not allowed' }, 405);
};
