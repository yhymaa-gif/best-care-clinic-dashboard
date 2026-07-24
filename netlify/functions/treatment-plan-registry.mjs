import { getStore } from '@netlify/blobs';
import { createHash, createHmac } from 'node:crypto';

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, no-cache, must-revalidate',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
  'access-control-allow-headers': 'content-type,accept'
};
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
const store = getStore({ name: 'clinic-treatment-plan-registry', consistency: 'strong' });
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const validClinic = value => /^clinic-([1-9]|1[0-5])$/.test(value || '');
const cleanText = (value, max = 120) => String(value ?? '').trim().slice(0, max);
const normalizePhone = value => {
  const digits = cleanText(value, 20).replace(/\D/g, '');
  if (/^9665\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
  if (/^5\d{8}$/.test(digits)) return `0${digits}`;
  return digits;
};
const identityKeys = patient => {
  const file = cleanText(patient?.fileNo ?? patient?.file, 40).toUpperCase().replace(/\s+/g, '');
  const mobile = normalizePhone(patient?.mobile ?? patient?.phone);
  return [...new Set([
    file ? `file:${file}` : '',
    mobile ? `phone:${mobile}` : ''
  ].filter(Boolean))];
};

async function authUser(request) {
  if (process.env.AUTH_ENABLED !== 'true') return { role: 'admin' };
  const raw = (request.headers.get('cookie') || '').split(';').map(value => value.trim()).find(value => value.startsWith('bc_session='))?.slice(11);
  if (!raw) return null;
  const sessionStore = getStore({ name: 'clinic-dashboard-auth-sessions', consistency: 'strong' });
  const session = await sessionStore.get(`sessions/${hash(raw)}`, { type: 'json', consistency: 'strong' });
  const now = Date.now();
  const signature = createHmac('sha256', process.env.AUTH_SESSION_SECRET || 'change-me-before-production').update(raw).digest('hex');
  if (!session || session.tokenSignature !== signature || now - Number(session.lastSeenAt || 0) > 3 * 60 * 60 * 1000 || now > Number(session.expiresAt || 0)) return null;
  session.lastSeenAt = now;
  await sessionStore.setJSON(`sessions/${hash(raw)}`, session);
  return session.user || null;
}

export default async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const user = await authUser(request);
  if (!user) return reply({ error: 'Authentication required' }, 401);
  const url = new URL(request.url);
  const clinicId = url.searchParams.get('clinic') || 'clinic-1';
  if (!validClinic(clinicId)) return reply({ error: 'Invalid clinic' }, 400);
  const key = 'registry/global';

  if (request.method === 'GET') {
    if (user.role !== 'admin') return reply({ error: 'Admin access required' }, 403);
    const data = await store.get(key, { type: 'json', consistency: 'strong' });
    return reply({
      clinicId,
      records: data?.records || {},
      aliases: data?.aliases || {},
      revision: Number(data?.revision || 0),
      updatedAt: Number(data?.updatedAt || 0)
    });
  }

  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400); }
    const requestedKeys = [...new Set((Array.isArray(body?.keys) ? body.keys : [])
      .map(value => cleanText(value, 180))
      .filter(value => /^(file|phone):/.test(value))
      .slice(0, 500))];
    if (!requestedKeys.length) return reply({ clinicId, records: {}, aliases: {}, revision: 0, updatedAt: 0 });
    const data = await store.get(key, { type: 'json', consistency: 'strong' }) || {};
    const records = {};
    const aliases = {};
    requestedKeys.forEach(alias => {
      const canonical = data.aliases?.[alias];
      if (!canonical || !data.records?.[canonical]) return;
      aliases[alias] = canonical;
      records[canonical] = data.records[canonical];
    });
    return reply({
      clinicId,
      records,
      aliases,
      revision: Number(data.revision || 0),
      updatedAt: Number(data.updatedAt || 0)
    });
  }

  if (request.method === 'PUT') {
    let body;
    try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400); }
    const status = ['submitted', 'patient_accepted', 'approved', 'approved_signed', 'rejected'].includes(body?.status) ? body.status : '';
    if (!status) return reply({ error: 'Invalid status' }, 400);
    if (['patient_accepted', 'approved', 'approved_signed', 'rejected'].includes(status) && user.role !== 'admin') return reply({ error: 'Admin access required' }, 403);
    const keys = identityKeys(body?.patient);
    if (!keys.length) return reply({ error: 'Patient identity required' }, 400);

    const current = await store.get(key, { type: 'json', consistency: 'strong' }) || {};
    const records = current.records && typeof current.records === 'object' ? { ...current.records } : {};
    const aliases = current.aliases && typeof current.aliases === 'object' ? { ...current.aliases } : {};
    const existingCanonical = keys.map(alias => aliases[alias]).find(Boolean);
    const canonical = existingCanonical || keys[0];
    const record = {
      clinicId,
      fullName: cleanText(body.patient?.fullName ?? body.patient?.name, 120),
      fileNo: cleanText(body.patient?.fileNo ?? body.patient?.file, 40),
      mobile: normalizePhone(body.patient?.mobile ?? body.patient?.phone),
      status,
      rejectionReason: status === 'rejected' ? cleanText(body?.rejectionReason, 500) : '',
      planNo: cleanText(body?.planNo, 40),
      sourcePatientId: cleanText(body?.sourcePatientId, 100),
      sourceDate: cleanText(body?.sourceDate, 10),
      patientAcceptedAt: Number(body?.patientAcceptedAt || 0),
      patientAcceptedBy: cleanText(body?.patientAcceptedBy, 120),
      approvedAt: Number(body?.approvedAt || 0),
      approvedBy: cleanText(body?.approvedBy, 120),
      updatedAt: Date.now(),
      updatedBy: cleanText(user.displayName || user.username, 120)
    };
    records[canonical] = record;
    keys.forEach(alias => { aliases[alias] = canonical; });
    const limitedKeys = Object.keys(records).sort((a, b) => Number(records[b]?.updatedAt || 0) - Number(records[a]?.updatedAt || 0)).slice(0, 5000);
    const limitedRecords = Object.fromEntries(limitedKeys.map(recordKey => [recordKey, records[recordKey]]));
    const allowed = new Set(limitedKeys);
    const limitedAliases = Object.fromEntries(Object.entries(aliases).filter(([, recordKey]) => allowed.has(recordKey)));
    const result = {
      clinicId,
      records: limitedRecords,
      aliases: limitedAliases,
      revision: Number(current.revision || 0) + 1,
      updatedAt: Date.now()
    };
    await store.setJSON(key, result);
    return reply({ ok: true, record, revision: result.revision, updatedAt: result.updatedAt });
  }

  return reply({ error: 'Method not allowed' }, 405);
};
