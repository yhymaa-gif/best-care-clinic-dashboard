import { getStore } from '@netlify/blobs';
import { apiHeaders, canAccessClinic, requireUser, sameOriginRequest } from './lib/session.mjs';

const headers = apiHeaders('GET,PUT,PATCH,OPTIONS');
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
const store = getStore({ name: 'clinic-treatment-catalog', consistency: 'strong' });
const validClinic = value => /^clinic-([1-9]|1[0-5])$/.test(value || '');
const cleanText = (value, max = 120) => String(value ?? '').trim().slice(0, max);
const DEFAULT_LAB_IDS = new Set(['ceramic-crown', 'ceramic-veneer', 'implant-crown', 'whitening-trays']);
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
  ['whitening-trays', 'قوالب تبييض'],
  ['other', 'إجراء آخر']
].map(([id, name]) => ({ id, name, beforePrice: '', afterPrice: '', requiresLab: DEFAULT_LAB_IDS.has(id) }));

const cleanItems = items => (Array.isArray(items) ? items : []).slice(0, 60).map((item, index) => {
  const id = cleanText(item?.id, 50).toLowerCase().replace(/[^a-z0-9_-]/g, '') || `custom-${index + 1}`;
  const cleanPrice = value => value === '' || value === null || value === undefined
    ? ''
    : Math.min(10_000_000, Math.max(0, Number(value) || 0));
  const beforePrice = cleanPrice(item?.beforePrice);
  const afterPrice = cleanPrice(item?.afterPrice ?? item?.price);
  return {
    id,
    name: cleanText(item?.name, 120),
    beforePrice,
    afterPrice,
    requiresLab: item?.requiresLab === undefined ? DEFAULT_LAB_IDS.has(id) : Boolean(item.requiresLab)
  };
}).filter(item => item.name);
const cleanDoctorKey = value => cleanText(value, 100).toLocaleLowerCase('ar').replace(/\s+/g, ' ') || 'clinic-default';
const cleanProfile = (value, validIds = null) => {
  const favorites = [...new Set((Array.isArray(value?.favorites) ? value.favorites : [])
    .map(item => cleanText(item, 50).toLowerCase())
    .filter(item => !validIds || validIds.has(item)))].slice(0, 60);
  const usage = {};
  for (const [rawId, rawCount] of Object.entries(value?.usage && typeof value.usage === 'object' ? value.usage : {})) {
    const id = cleanText(rawId, 50).toLowerCase();
    if (!id || (validIds && !validIds.has(id))) continue;
    usage[id] = Math.max(0, Math.min(1_000_000, Math.round(Number(rawCount) || 0)));
  }
  return { favorites, usage };
};
const cleanProfiles = (value, validIds) => {
  const profiles = {};
  for (const [rawKey, rawProfile] of Object.entries(value && typeof value === 'object' ? value : {}).slice(0, 60)) {
    profiles[cleanDoctorKey(rawKey)] = cleanProfile(rawProfile, validIds);
  }
  return profiles;
};

export default async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET' && !sameOriginRequest(request)) return reply({ error: 'Invalid request origin' }, 403);
  const auth = await requireUser(request);
  if (!auth.ok) return reply({ error: auth.error }, auth.status);
  const user = auth.user;
  const url = new URL(request.url);
  const clinicId = url.searchParams.get('clinic') || 'clinic-1';
  if (!validClinic(clinicId)) return reply({ error: 'Invalid clinic' }, 400);
  if (!canAccessClinic(user, clinicId)) return reply({ error: 'Clinic access denied' }, 403);
  const key = `catalog/${clinicId}`;

  if (request.method === 'GET') {
    const record = await store.get(key, { type: 'json', consistency: 'strong' });
    const items = record?.items?.length ? cleanItems(record.items) : DEFAULT_ITEMS;
    const doctorKey = cleanDoctorKey(url.searchParams.get('doctor'));
    const validIds = new Set(items.map(item => item.id));
    const profiles = cleanProfiles(record?.profiles, validIds);
    return reply({
      clinicId,
      items,
      doctorKey,
      profile: profiles[doctorKey] || cleanProfile(null),
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
    const validIds = new Set(items.map(item => item.id));
    const record = {
      clinicId,
      items,
      profiles: cleanProfiles(current?.profiles, validIds),
      updatedAt: Date.now(),
      revision: Number(current?.revision || 0) + 1
    };
    await store.setJSON(key, record);
    return reply({ ok: true, ...record });
  }
  if (request.method === 'PATCH') {
    let body;
    try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400); }
    const current = await store.get(key, { type: 'json', consistency: 'strong' });
    const items = current?.items?.length ? cleanItems(current.items) : DEFAULT_ITEMS;
    const validIds = new Set(items.map(item => item.id));
    const profiles = cleanProfiles(current?.profiles, validIds);
    const doctorKey = cleanDoctorKey(body?.doctorKey || url.searchParams.get('doctor'));
    const profile = profiles[doctorKey] || cleanProfile(null);
    if (body?.action === 'favorite') {
      const procedureId = cleanText(body?.procedureId, 50).toLowerCase();
      if (!validIds.has(procedureId)) return reply({ error: 'Unknown procedure' }, 400);
      const favorites = new Set(profile.favorites);
      if (body?.favorite) favorites.add(procedureId);
      else favorites.delete(procedureId);
      profile.favorites = [...favorites];
    } else if (body?.action === 'usage') {
      const usageItems = Array.isArray(body?.items) ? body.items.slice(0, 20) : [];
      for (const entry of usageItems) {
        const procedureId = cleanText(entry?.code, 50).toLowerCase();
        if (!validIds.has(procedureId)) continue;
        const increment = Math.max(1, Math.min(99, Math.round(Number(entry?.quantity) || 1)));
        profile.usage[procedureId] = Math.min(1_000_000, Number(profile.usage[procedureId] || 0) + increment);
      }
    } else {
      return reply({ error: 'Unsupported preference action' }, 400);
    }
    profiles[doctorKey] = cleanProfile(profile, validIds);
    const record = {
      clinicId,
      items,
      profiles,
      updatedAt: Date.now(),
      revision: Number(current?.revision || 0) + 1
    };
    await store.setJSON(key, record);
    return reply({ ok: true, clinicId, doctorKey, profile: profiles[doctorKey], updatedAt: record.updatedAt, revision: record.revision });
  }
  return reply({ error: 'Method not allowed' }, 405);
};
