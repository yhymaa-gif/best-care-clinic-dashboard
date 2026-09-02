import { getStore } from '@netlify/blobs';
import { apiHeaders, canAccessClinic, requireUser, sameOriginRequest } from './lib/session.mjs';
import { getPatientDirectory, importPatientDirectory, reconcilePatientDirectoryNames, upsertPatientDirectory } from './lib/patient-directory.mjs';
import { patientIdentityKeys } from './lib/patient-identity.mjs';

const headers = apiHeaders('GET,POST,OPTIONS');
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
const validClinic = value => /^clinic-([1-9]|1[0-5])$/.test(value || '');
const store = name => getStore({ name, consistency: 'strong' });

const parseDayKey = key => {
  const legacy = /^days\/(\d{4}-\d{2}-\d{2})$/.exec(key);
  if (legacy) return { clinicId: 'clinic-1', date: legacy[1] };
  const scoped = /^clinics\/(clinic-(?:[1-9]|1[0-5]))\/days\/(\d{4}-\d{2}-\d{2})$/.exec(key);
  return scoped ? { clinicId: scoped[1], date: scoped[2] } : null;
};

const listKeys = async (blobStore, prefix, maxPages = 60) => {
  const keys = [];
  let cursor;
  for (let pageNo = 0; pageNo < maxPages; pageNo += 1) {
    const page = await blobStore.list({ prefix, ...(cursor ? { cursor } : {}) });
    const blobs = Array.isArray(page?.blobs) ? page.blobs : [];
    keys.push(...blobs.map(item => item.key).filter(Boolean));
    const next = page?.cursor || page?.nextCursor || '';
    if (!next || next === cursor || !blobs.length) break;
    cursor = next;
  }
  return keys;
};

const historicalPatients = async () => {
  const daysStore = store('clinic-dashboard-days');
  const keys = [...new Set((await Promise.all(['days/', 'clinics/'].map(prefix => listKeys(daysStore, prefix)))).flat())]
    .map(key => ({ key, ...parseDayKey(key) }))
    .filter(item => item.clinicId && item.date)
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 1800);
  const entries = [];
  for (let index = 0; index < keys.length; index += 30) {
    const chunk = keys.slice(index, index + 30);
    const records = await Promise.all(chunk.map(async item => ({
      ...item,
      state: await daysStore.get(item.key, { type: 'json', consistency: 'strong' })
    })));
    records.forEach(item => (Array.isArray(item.state?.patients) ? item.state.patients : []).forEach(patient => entries.push({
      ...patient,
      clinicId: item.clinicId,
      date: item.date,
      recordUpdatedAt: Number(item.state?.updatedAt || 0)
    })));
  }
  return entries;
};

const externalPatients = async (includeHistory = false) => {
  const [plans, prescriptions, communications, labStores] = await Promise.all([
    store('clinic-treatment-plan-registry').get('registry/global', { type: 'json', consistency: 'strong' }).catch(() => null),
    store('clinic-prescriptions').get('registry/global', { type: 'json', consistency: 'strong' }).catch(() => null),
    store('clinic-patient-communications').get('registry/global', { type: 'json', consistency: 'strong' }).catch(() => null),
    Promise.all(Array.from({ length: 15 }, (_, index) => {
      const clinicId = `clinic-${index + 1}`;
      return store('clinic-lab-cases').get(`clinics/${clinicId}`, { type: 'json', consistency: 'strong' })
        .then(record => ({ clinicId, record: record || {} })).catch(() => ({ clinicId, record: {} }));
    }))
  ]);
  const entries = [];
  Object.values(plans?.records || {}).forEach(record => entries.push({
    fullName: record.fullName, fileNo: record.fileNo, mobile: record.mobile, nationalId: record.nationalId,
    clinicId: record.clinicId, treatmentPlanStatus: record.status, sourcePatientId: record.sourcePatientId
  }));
  Object.values(prescriptions?.records || {}).forEach(record => entries.push({
    ...(record.patient || {}), clinicId: record.clinicId, sourcePatientId: record.sourcePatientId
  }));
  Object.values(communications?.records || {}).forEach(record => entries.push({
    ...(record.patient || {}), clinicId: record.clinicIds?.[0] || ''
  }));
  const labs = { records: {} };
  labStores.forEach(({ clinicId, record }) => (Array.isArray(record?.cases) ? record.cases : []).forEach(item => {
    labs.records[`${clinicId}:${item.id}`] = { ...item, clinicId, patient: item.patient || {} };
    entries.push({ ...(item.patient || {}), clinicId });
  }));
  if (includeHistory) entries.push(...await historicalPatients());
  return { entries, plans: plans || {}, prescriptions: prescriptions || {}, communications: communications || {}, labs };
};

const summaryIndex = registry => {
  const index = new Map();
  Object.values(registry?.records || {}).forEach(record => {
    patientIdentityKeys(record?.patient || record).forEach(alias => {
      const previous = index.get(alias) || [];
      previous.push(record);
      index.set(alias, previous);
    });
  });
  return index;
};

const countMatches = (record, index) => {
  const matches = new Set();
  patientIdentityKeys(record).forEach(alias => (index.get(alias) || []).forEach(item => matches.add(item)));
  return [...matches];
};

export default async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const auth = await requireUser(request);
  if (!auth.ok) return reply({ error: auth.error }, auth.status);
  const url = new URL(request.url);
  const requestedClinic = url.searchParams.get('clinic') || (auth.user?.role === 'admin' ? 'all' : auth.user?.clinicId || 'clinic-1');
  if (requestedClinic !== 'all' && !validClinic(requestedClinic)) return reply({ error: 'Invalid clinic' }, 400);
  if (requestedClinic === 'all' && auth.user?.role !== 'admin') return reply({ error: 'Admin role required' }, 403);
  if (requestedClinic !== 'all' && !canAccessClinic(auth.user, requestedClinic)) return reply({ error: 'Clinic access denied' }, 403);

  if (request.method === 'POST') {
    if (auth.user?.role !== 'admin') return reply({ error: 'Admin role required' }, 403);
    if (!sameOriginRequest(request)) return reply({ error: 'Origin mismatch' }, 403);
    let body;
    try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400); }
    if (body?.action === 'reconcile_names') {
      const reconciled = await reconcilePatientDirectoryNames({ actor: String(auth.user?.displayName || auth.user?.username || 'admin').slice(0, 120) });
      const { registry: _registry, ...summary } = reconciled;
      return reply({ ok: true, ...summary });
    }
    if (!Array.isArray(body?.patients) || !body.patients.length || body.patients.length > 3000) return reply({ error: 'Invalid patient import' }, 400);
    const clinicId = validClinic(body.clinicId) ? body.clinicId : '';
    const imported = await importPatientDirectory(body.patients, {
      clinicId,
      actor: String(auth.user?.displayName || auth.user?.username || 'admin').slice(0, 120)
    });
    const { records: _records, ...summary } = imported;
    return reply({ ok: true, ...summary });
  }

  if (request.method !== 'GET') return reply({ error: 'Method not allowed' }, 405);

  let external = await externalPatients(false);
  let registry = await getPatientDirectory();
  if (!Object.keys(registry.records || {}).length) {
    external = await externalPatients(true);
  }
  if (!Object.keys(registry.records || {}).length && external.entries.length) {
    await upsertPatientDirectory(external.entries, { actor: 'system-registry-import', updatedAt: Date.now() });
    registry = await getPatientDirectory();
  }
  const planIndex = summaryIndex(external.plans);
  const prescriptionIndex = summaryIndex(external.prescriptions);
  const communicationIndex = summaryIndex(external.communications);
  const labIndex = summaryIndex(external.labs);
  const records = Object.fromEntries(Object.entries(registry.records || {})
    .filter(([, record]) => requestedClinic === 'all' || (record.clinicIds || []).includes(requestedClinic) || record.latestClinicId === requestedClinic)
    .map(([canonical, record]) => {
      const plans = countMatches(record, planIndex);
      const prescriptions = countMatches(record, prescriptionIndex);
      const communications = countMatches(record, communicationIndex);
      const labs = countMatches(record, labIndex);
      return [canonical, {
        ...record,
        canonical,
        fullName: String(record.authoritativeFullName || record.fullName || '').trim(),
        planCount: plans.length,
        prescriptionCount: prescriptions.length,
        labCount: labs.length,
        communicationCount: communications.reduce((total, item) => total + Number(item?.counts?.planWhatsapp || 0) + Number(item?.counts?.reviewWhatsapp || 0), 0),
        treatmentPlanStatus: plans.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0]?.status || record.treatmentPlanStatus || ''
      }];
    })
    .sort(([, left], [, right]) => Number(right.lastSeenAt || right.updatedAt || 0) - Number(left.lastSeenAt || left.updatedAt || 0)));
  return reply({ ok: true, records, revision: Number(registry.revision || 0), updatedAt: Number(registry.updatedAt || 0), total: Object.keys(records).length });
};

export const __test = { parseDayKey, summaryIndex, countMatches };
