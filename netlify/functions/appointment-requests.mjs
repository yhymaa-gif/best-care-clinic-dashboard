import { getStore } from '@netlify/blobs';
import { createHash, randomUUID } from 'node:crypto';
import { apiHeaders, canAccessClinic, requireUser, sameOriginRequest } from './lib/session.mjs';
import { sendPushNotifications } from './lib/push.mjs';

const headers = apiHeaders('GET,POST,PATCH,DELETE,OPTIONS');
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
const requestStore = () => getStore({ name: 'clinic-appointment-requests', consistency: 'strong' });
const rateStore = () => getStore({ name: 'clinic-appointment-request-limits', consistency: 'strong' });
const statusValues = ['new', 'contacted', 'booked', 'closed'];
const serviceValues = ['examination', 'pain', 'restorative', 'root_canal', 'prosthodontics', 'implants', 'cosmetic', 'cleaning', 'other'];

const cleanText = (value, max = 120) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
const cleanPhone = value => {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone.startsWith('966')) phone = `0${phone.slice(3)}`;
  if (phone.startsWith('5') && phone.length === 9) phone = `0${phone}`;
  return phone.slice(0, 10);
};
const cleanIdentity = value => String(value || '').replace(/\D/g, '').slice(0, 10);
const cleanHistory = value => (Array.isArray(value) ? value : [])
  .slice(-50)
  .map(entry => ({
    status: statusValues.includes(entry?.status) ? entry.status : 'new',
    note: cleanText(entry?.note, 220),
    at: Number(entry?.at || 0),
    by: cleanText(entry?.by, 80),
  }))
  .filter(entry => entry.at > 0);
const requestIp = request => String(request.headers.get('x-nf-client-connection-ip') || request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
const ipKey = value => createHash('sha256').update(value).digest('hex');
const submissionFingerprint = ({ phone, identity, service, serviceOther }) => createHash('sha256')
  .update([cleanPhone(phone), cleanIdentity(identity), cleanText(service, 40), cleanText(serviceOther, 100).toLowerCase()].join('|'))
  .digest('hex');
const internalRequestFingerprint = value => createHash('sha256')
  .update(cleanText(value, 180))
  .digest('hex');

async function allowSubmission(request) {
  const key = `limits/${ipKey(requestIp(request))}`;
  const store = rateStore();
  const now = Date.now();
  const saved = await store.get(key, { type: 'json', consistency: 'strong' });
  const current = saved && now < Number(saved.resetAt || 0) ? saved : { count: 0, resetAt: now + 60 * 60 * 1000 };
  current.count = Number(current.count || 0) + 1;
  await store.setJSON(key, current);
  return current.count <= 5;
}

async function listKeys(store, prefix) {
  const keys = [];
  let cursor;
  for (let pageNo = 0; pageNo < 20; pageNo += 1) {
    const page = await store.list({ prefix, ...(cursor ? { cursor } : {}) });
    const entries = Array.isArray(page?.blobs) ? page.blobs : [];
    keys.push(...entries.map(entry => entry.key).filter(Boolean));
    const next = page?.cursor || page?.nextCursor || '';
    if (!next || next === cursor || !entries.length) break;
    cursor = next;
  }
  return keys;
}

const publicRecord = value => ({
  id: cleanText(value?.id, 80),
  patientId: cleanText(value?.patientId, 80),
  name: cleanText(value?.name, 80),
  file: cleanText(value?.file, 40),
  phone: cleanPhone(value?.phone),
  identity: cleanIdentity(value?.identity),
  clinicId: /^clinic-([1-9]|1[0-5])$/.test(value?.clinicId || '') ? value.clinicId : '',
  doctorName: cleanText(value?.doctorName, 80),
  priority: value?.priority === 'urgent' ? 'urgent' : 'normal',
  sourceDate: /^\d{4}-\d{2}-\d{2}$/.test(value?.sourceDate || '') ? value.sourceDate : '',
  service: serviceValues.includes(value?.service) ? value.service : 'other',
  serviceOther: cleanText(value?.serviceOther, 100),
  note: cleanText(value?.note, 220),
  source: cleanText(value?.source, 40) || 'direct',
  status: statusValues.includes(value?.status) ? value.status : 'new',
  createdAt: Number(value?.createdAt || 0),
  updatedAt: Number(value?.updatedAt || 0),
  handledBy: cleanText(value?.handledBy, 80),
  lastActionNote: cleanText(value?.lastActionNote, 220),
  history: cleanHistory(value?.history),
});

export default async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET' && !sameOriginRequest(request)) return reply({ error: 'Invalid request origin' }, 403);

  const store = requestStore();

  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400); }
    const auth = await requireUser(request);
    const internalSource = cleanText(body?.source, 40) === 'doctor_earliest';
    if (internalSource && auth.ok) {
      const clinicId = /^clinic-([1-9]|1[0-5])$/.test(body?.clinicId || '') ? body.clinicId : '';
      if (!clinicId || !canAccessClinic(auth.user, clinicId)) return reply({ error: 'Clinic access denied' }, 403);
      const name = cleanText(body?.name, 80);
      const patientId = cleanText(body?.patientId, 80);
      const file = cleanText(body?.file, 40);
      const phone = cleanPhone(body?.phone);
      const identity = cleanIdentity(body?.identity);
      const idempotencyKey = cleanText(body?.idempotencyKey, 180);
      if (name.length < 2 || !patientId || idempotencyKey.length < 12) return reply({ error: 'Incomplete patient request' }, 400);
      const duplicateStore = rateStore();
      const duplicateKey = `internal/${internalRequestFingerprint(idempotencyKey)}`;
      const duplicate = await duplicateStore.get(duplicateKey, { type: 'json', consistency: 'strong' });
      if (duplicate?.requestId) {
        const existing = await store.get(`requests/${cleanText(duplicate.requestId, 80)}`, { type: 'json', consistency: 'strong' });
        if (existing) return reply({ ok: true, duplicate: true, requestId: existing.id, request: publicRecord(existing) });
      }
      const now = Date.now();
      const id = `${now}-${randomUUID()}`;
      const actor = cleanText(auth.user?.displayName || auth.user?.username || 'الطبيب', 80);
      const record = publicRecord({
        id, patientId, name, file, phone, identity, clinicId,
        doctorName: body?.doctorName,
        priority: 'urgent',
        sourceDate: body?.sourceDate,
        service: 'examination',
        note: cleanText(body?.note, 220) || 'يرجى التواصل مع المريض عاجلًا لتقديم أقرب موعد متاح.',
        source: 'doctor_earliest',
        status: 'new', createdAt: now, updatedAt: now,
        history: [{ status: 'new', note: 'طلب الطبيب التواصل لتقديم أقرب موعد متاح', at: now, by: actor }],
      });
      await store.setJSON(`requests/${id}`, record);
      await duplicateStore.setJSON(duplicateKey, { requestId: id, createdAt: now });
      await sendPushNotifications({
        type: 'appointment_request',
        title: '⚡ طلب أقرب موعد',
        body: `${name}${file ? ` — ملف ${file}` : ''} يحتاج تواصلًا عاجلًا لتقديم أقرب موعد.`,
        tag: `earliest-appointment-${id}`,
        url: `/appointment-requests.html?focus=${encodeURIComponent(id)}`,
        clinicId,
      });
      return reply({ ok: true, requestId: id, request: record }, 201);
    }
    if (internalSource) return reply({ error: auth.error || 'Authentication required' }, auth.status || 401);
    if (!await allowSubmission(request)) return reply({ error: 'Too many requests. Please try again later.' }, 429);
    if (cleanText(body?.website, 40)) return reply({ ok: true });
    const startedAt = Number(body?.startedAt || 0);
    if (!startedAt || Date.now() - startedAt < 1800 || Date.now() - startedAt > 2 * 60 * 60 * 1000) {
      return reply({ error: 'Please review the form and try again.' }, 400);
    }
    const name = cleanText(body?.name, 80);
    const phone = cleanPhone(body?.phone);
    const identity = cleanIdentity(body?.identity);
    const service = serviceValues.includes(body?.service) ? body.service : 'other';
    const serviceOther = cleanText(body?.serviceOther, 100);
    const note = cleanText(body?.note, 220);
    const source = cleanText(body?.source, 40) || 'direct';
    if (name.length < 2) return reply({ error: 'Name is required' }, 400);
    if (!/^05\d{8}$/.test(phone)) return reply({ error: 'A valid Saudi mobile number is required' }, 400);
    if (!/^[12]\d{9}$/.test(identity)) return reply({ error: 'A valid identity number is required' }, 400);
    if (service === 'other' && serviceOther.length < 2) return reply({ error: 'Service details are required' }, 400);

    const now = Date.now();
    const duplicateStore = rateStore();
    const duplicateKey = `duplicates/${submissionFingerprint({ phone, identity, service, serviceOther })}`;
    const duplicate = await duplicateStore.get(duplicateKey, { type: 'json', consistency: 'strong' });
    if (duplicate && now - Number(duplicate.createdAt || 0) < 10 * 60 * 1000) {
      return reply({
        ok: true,
        duplicate: true,
        requestId: cleanText(duplicate.requestId, 80),
        message: 'تم استلام طلبك مسبقًا، وسيتم التواصل معك لتحديد الموعد.',
      });
    }
    const id = `${now}-${randomUUID()}`;
    const record = publicRecord({
      id,
      name,
      phone,
      identity,
      service,
      serviceOther,
      note,
      source,
      status: 'new',
      createdAt: now,
      updatedAt: now,
      history: [{ status: 'new', note: 'تم استلام الطلب من رابط المواعيد', at: now, by: 'النظام' }],
    });
    await store.setJSON(`requests/${id}`, record);
    await duplicateStore.setJSON(duplicateKey, { requestId: id, createdAt: now });
    await sendPushNotifications({
      type: 'appointment_request',
      title: 'طلب موعد جديد',
      body: `طلب جديد من ${name} — يحتاج تواصل الإدارة.`,
      tag: `appointment-request-${id}`,
      url: `/appointment-requests.html?focus=${encodeURIComponent(id)}`,
    });
    return reply({ ok: true, requestId: id, message: 'سيتم التواصل معك لتحديد أقرب موعد مناسب للفحص والتشخيص.' }, 201);
  }

  const auth = await requireUser(request);
  if (!auth.ok) return reply({ error: auth.error }, auth.status);
  if (auth.user?.role !== 'admin') return reply({ error: 'Admin role required' }, 403);

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 100)));
    const keys = await listKeys(store, 'requests/');
    const records = (await Promise.all(keys.slice(-limit * 2).map(key => store.get(key, { type: 'json', consistency: 'strong' }))))
      .filter(Boolean)
      .map(publicRecord)
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, limit);
    return reply({ requests: records, updatedAt: Date.now() });
  }

  let body;
  try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400); }
  const id = cleanText(body?.id, 80);
  if (!/^\d{13}-[a-f0-9-]{36}$/.test(id)) return reply({ error: 'Invalid request id' }, 400);
  const key = `requests/${id}`;
  const existing = await store.get(key, { type: 'json', consistency: 'strong' });
  if (!existing) return reply({ error: 'Request not found' }, 404);

  if (request.method === 'PATCH') {
    const status = statusValues.includes(body?.status) ? body.status : '';
    if (!status) return reply({ error: 'Invalid status' }, 400);
    const actionNote = cleanText(body?.note, 220);
    const actor = auth.user?.displayName || auth.user?.username || '';
    const now = Date.now();
    const previous = publicRecord(existing);
    const changed = status !== previous.status || Boolean(actionNote);
    const history = changed
      ? [...previous.history, { status, note: actionNote || 'تم تحديث حالة الطلب', at: now, by: actor }]
      : previous.history;
    const updated = publicRecord({
      ...existing,
      status,
      updatedAt: changed ? now : Number(existing.updatedAt || now),
      handledBy: actor,
      lastActionNote: actionNote || previous.lastActionNote,
      history,
    });
    await store.setJSON(key, updated);
    return reply({ ok: true, request: updated });
  }

  if (request.method === 'DELETE') {
    await store.delete(key);
    return reply({ ok: true });
  }

  return reply({ error: 'Method not allowed' }, 405);
};

export const __test = { cleanPhone, cleanIdentity, publicRecord, submissionFingerprint, internalRequestFingerprint, statusValues, serviceValues };
