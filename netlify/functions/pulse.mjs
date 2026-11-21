import { createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { apiHeaders, requireUser } from './lib/session.mjs';

// One cheap request that tells the admin dashboard which areas changed.
// It reads only blob metadata/etags (no patient data), so the dashboard can
// skip the separate periodic calls and refresh an area only when it changed.
const headers = apiHeaders('GET,OPTIONS');
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
const store = name => getStore({ name, consistency: 'strong' });
const validClinic = value => /^clinic-([1-9]|1[0-5])$/.test(String(value || ''));
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const hash = value => createHash('sha1').update(String(value)).digest('hex').slice(0, 16);

const metaEtag = async (blobStore, key) => {
  try { return (await blobStore.getMetadata(key, { consistency: 'strong' }))?.etag || '-'; } catch { return '!'; }
};
async function listSignature(blobStore, prefix) {
  const parts = [];
  let cursor;
  for (let page = 0; page < 20; page += 1) {
    const result = await blobStore.list({ prefix, ...(cursor ? { cursor } : {}) });
    const blobs = Array.isArray(result?.blobs) ? result.blobs : [];
    blobs.forEach(entry => parts.push(`${entry.key}:${entry.etag || ''}`));
    const next = result?.cursor || result?.nextCursor || '';
    if (!next || next === cursor || !blobs.length) break;
    cursor = next;
  }
  return hash(parts.sort().join('|'));
}

export const dayKey = (clinicId, date) => clinicId === 'clinic-1' ? `days/${date}` : `clinics/${clinicId}/days/${date}`;

export async function pulseSignatures({ clinicIds, activeClinic, date, stores = {} }) {
  const days = stores.days || store('clinic-dashboard-days');
  const labs = stores.labs || store('clinic-lab-cases');
  const [dayTags, labTags, quickPlans, appointmentRequests, registry, prescriptions, alert] = await Promise.all([
    Promise.all(clinicIds.map(id => metaEtag(days, dayKey(id, date)))),
    Promise.all(clinicIds.map(id => metaEtag(labs, `clinics/${id}`))),
    listSignature(stores.quickPlans || store('clinic-quick-treatment-plans'), `clinics/${activeClinic}/plans/`),
    listSignature(stores.requests || store('clinic-appointment-requests'), 'requests/'),
    metaEtag(stores.registry || store('clinic-treatment-plan-registry'), 'registry/global'),
    metaEtag(stores.prescriptions || store('clinic-prescriptions'), 'registry/global'),
    metaEtag(stores.alerts || store('clinic-dashboard-alerts'), 'current'),
  ]);
  return {
    activeDay: hash(dayTags[clinicIds.indexOf(activeClinic)] ?? '-'),
    allDays: hash(clinicIds.map((id, index) => `${id}:${dayTags[index]}`).join('|')),
    labs: hash(clinicIds.map((id, index) => `${id}:${labTags[index]}`).join('|')),
    quickPlans,
    appointmentRequests,
    registry: hash(registry),
    prescriptions: hash(prescriptions),
    alert: hash(alert),
  };
}

export default async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET') return reply({ error: 'Method not allowed' }, 405);
  const auth = await requireUser(request);
  if (!auth.ok) return reply({ error: auth.error }, auth.status);
  if (auth.user?.role !== 'admin') return reply({ error: 'Admin role required' }, 403);
  const url = new URL(request.url);
  const date = url.searchParams.get('date') || '';
  const activeClinic = url.searchParams.get('clinic') || 'clinic-1';
  if (!validDate(date) || !validClinic(activeClinic)) return reply({ error: 'Invalid request' }, 400);
  const saved = await store('clinic-dashboard-config').get('clinics', { type: 'json', consistency: 'strong' }).catch(() => null);
  const active = new Set(['clinic-1', activeClinic, ...(Array.isArray(saved?.clinics) ? saved.clinics : []).filter(item => item?.active && validClinic(item.id)).map(item => String(item.id))]);
  const clinicIds = [...active].sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]));
  return reply({ date, clinic: activeClinic, generatedAt: Date.now(), signatures: await pulseSignatures({ clinicIds, activeClinic, date }) });
};
