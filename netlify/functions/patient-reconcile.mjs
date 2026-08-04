import { getStore } from '@netlify/blobs';
import { apiHeaders, canAccessClinic, requireUser } from './lib/session.mjs';

const headers = apiHeaders('POST,OPTIONS');
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
const clinicPattern = /^clinic-([1-9]|1[0-5])$/;

const cleanText = (value, max = 120) => String(value ?? '').trim().slice(0, max);
const normalizeFile = value => cleanText(value, 40).toUpperCase().replace(/[\s-]+/g, '');
const normalizePhone = value => {
  const digits = cleanText(value, 24).replace(/\D/g, '');
  if (/^009665\d{8}$/.test(digits)) return `0${digits.slice(5)}`;
  if (/^9665\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
  if (/^5\d{8}$/.test(digits)) return `0${digits}`;
  return /^05\d{8}$/.test(digits) ? digits : '';
};
const normalizeName = value => cleanText(value, 120)
  .normalize('NFKD')
  .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
  .replace(/[إأآٱ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()
  .toLowerCase();

const nameSimilarity = (left, right) => {
  const a = new Set(normalizeName(left).split(' ').filter(Boolean));
  const b = new Set(normalizeName(right).split(' ').filter(Boolean));
  if (!a.size || !b.size) return 0;
  const shared = [...a].filter(token => b.has(token)).length;
  return shared / Math.min(a.size, b.size);
};

const parseDayKey = key => {
  const primary = /^days\/(\d{4}-\d{2}-\d{2})$/.exec(key);
  if (primary) return { clinicId: 'clinic-1', date: primary[1] };
  const scoped = /^clinics\/(clinic-(?:[1-9]|1[0-5]))\/days\/(\d{4}-\d{2}-\d{2})$/.exec(key);
  return scoped ? { clinicId: scoped[1], date: scoped[2] } : null;
};

async function listKeys(store, prefix) {
  const keys = [];
  let cursor;
  for (let pageNo = 0; pageNo < 50; pageNo += 1) {
    const page = await store.list({ prefix, ...(cursor ? { cursor } : {}) });
    const entries = Array.isArray(page?.blobs) ? page.blobs : [];
    keys.push(...entries.map(entry => entry.key).filter(Boolean));
    const next = page?.cursor || page?.nextCursor || '';
    if (!next || next === cursor || entries.length === 0) break;
    cursor = next;
  }
  return keys;
}

const cleanRow = (value, index) => ({
  id: cleanText(value?.id || `row-${index + 1}`, 100),
  name: cleanText(value?.name, 120),
  file: normalizeFile(value?.file),
  phone: normalizePhone(value?.phone),
});

const cleanPatient = ({ patient, clinicId, date, source }) => {
  const updatedAt = Math.max(
    Number(patient?.adminUpdatedAt || 0),
    Number(patient?.doctorUpdatedAt || 0),
    Number(patient?.updatedAt || 0),
  );
  return {
    id: cleanText(patient?.id ?? patient?.sourcePatientId, 100),
    name: cleanText(patient?.name ?? patient?.fullName, 120),
    file: normalizeFile(patient?.file ?? patient?.fileNo),
    phone: normalizePhone(patient?.phone ?? patient?.mobile),
    clinicId,
    sourceDate: cleanText(date ?? patient?.sourceDate, 10),
    source,
    updatedAt,
  };
};

const patientKey = patient => patient.file
  ? `file:${patient.file}`
  : patient.phone
    ? `phone:${patient.phone}:${normalizeName(patient.name)}`
    : `name:${normalizeName(patient.name)}`;

const patientRecency = patient => Math.max(
  Number(patient.updatedAt || 0),
  Number(String(patient.sourceDate || '').replaceAll('-', '')) || 0,
);

function keepLatest(map, candidate) {
  if (!candidate.name && !candidate.file && !candidate.phone) return;
  const key = patientKey(candidate);
  const current = map.get(key);
  if (!current || patientRecency(candidate) >= patientRecency(current)) map.set(key, candidate);
}

function reconcileRow(row, patients) {
  const sameFile = row.file ? patients.filter(patient => patient.file === row.file) : [];
  const samePhone = row.phone ? patients.filter(patient => patient.phone === row.phone) : [];
  const normalizedRowName = normalizeName(row.name);
  const sameName = normalizedRowName
    ? patients.filter(patient => normalizeName(patient.name) === normalizedRowName)
    : [];

  let candidates = sameFile;
  let matchType = 'file';
  if (!candidates.length) {
    candidates = samePhone;
    matchType = 'phone';
  }
  if (!candidates.length) {
    candidates = sameName;
    matchType = 'name';
  }
  if (!candidates.length) return { rowId: row.id, found: false, status: 'none', confidence: 0 };

  const uniqueFiles = new Set(candidates.map(patient => patient.file).filter(Boolean));
  const ranked = [...candidates].sort((left, right) => {
    const similarity = nameSimilarity(row.name, right.name) - nameSimilarity(row.name, left.name);
    return similarity || patientRecency(right) - patientRecency(left);
  });
  const patient = ranked[0];
  const similarity = nameSimilarity(row.name, patient.name);
  const ambiguousPhone = matchType === 'phone' && uniqueFiles.size > 1;
  const exactFile = matchType === 'file';
  const safePhone = matchType === 'phone' && !ambiguousPhone && similarity >= 0.6;
  const status = exactFile || safePhone ? 'exact' : candidates.length > 1 || ambiguousPhone ? 'ambiguous' : 'review';
  const confidence = exactFile ? 100 : safePhone ? 92 : matchType === 'phone' ? 72 : 58;

  const corrections = [];
  if (patient.name && normalizeName(patient.name) !== normalizeName(row.name)) corrections.push('name');
  if (patient.file && patient.file !== row.file) corrections.push('file');
  if (patient.phone && patient.phone !== row.phone) corrections.push('phone');

  return {
    rowId: row.id,
    found: true,
    status,
    matchType,
    confidence,
    corrections,
    patient,
    alternatives: ranked.slice(1, 4),
  };
}

export default async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);

  const auth = await requireUser(request);
  if (!auth.ok) return reply({ error: auth.error }, auth.status);

  const body = await request.json().catch(() => ({}));
  const rows = (Array.isArray(body?.rows) ? body.rows : []).slice(0, 50).map(cleanRow);
  if (!rows.length) return reply({ error: 'At least one patient row is required' }, 400);

  const requestedClinic = cleanText(body?.clinicId, 20);
  const searchAll = auth.user?.role === 'admin' && requestedClinic === 'all';
  const scopedClinic = searchAll
    ? ''
    : clinicPattern.test(requestedClinic)
      ? requestedClinic
      : clinicPattern.test(auth.user?.clinicId)
        ? auth.user.clinicId
        : 'clinic-1';
  if (scopedClinic && !canAccessClinic(auth.user, scopedClinic)) return reply({ error: 'Clinic access denied' }, 403);

  const dayStore = getStore({ name: 'clinic-dashboard-days', consistency: 'strong' });
  const registryStore = getStore({ name: 'clinic-treatment-plan-registry', consistency: 'strong' });
  const patients = new Map();

  const registry = await registryStore.get('registry/global', { type: 'json', consistency: 'strong' }) || {};
  Object.values(registry.records || {}).forEach(record => {
    if (!clinicPattern.test(record?.clinicId)) return;
    if (!searchAll && record.clinicId !== scopedClinic) return;
    keepLatest(patients, cleanPatient({ patient: record, clinicId: record.clinicId, date: record.sourceDate, source: 'treatment-plan' }));
  });

  const prefixes = searchAll
    ? ['days/', 'clinics/']
    : scopedClinic === 'clinic-1'
      ? ['days/']
      : [`clinics/${scopedClinic}/days/`];
  const listed = (await Promise.all(prefixes.map(prefix => listKeys(dayStore, prefix)))).flat();
  const dayKeys = [...new Set(listed)]
    .map(key => ({ key, ...parseDayKey(key) }))
    .filter(item => item.clinicId && (searchAll || item.clinicId === scopedClinic))
    .slice(0, 1500);

  for (let index = 0; index < dayKeys.length; index += 25) {
    const chunk = dayKeys.slice(index, index + 25);
    const states = await Promise.all(chunk.map(async item => ({
      ...item,
      state: await dayStore.get(item.key, { type: 'json', consistency: 'strong' }),
    })));
    states.forEach(item => {
      (Array.isArray(item.state?.patients) ? item.state.patients : []).forEach(patient => {
        keepLatest(patients, cleanPatient({ patient, clinicId: item.clinicId, date: item.date, source: 'appointment' }));
      });
    });
  }

  const directory = [...patients.values()];
  const matches = rows.map(row => reconcileRow(row, directory));
  const safeCorrections = matches.filter(match => match.status === 'exact' && match.corrections?.length).length;
  return reply({
    ok: true,
    searchedPatients: directory.length,
    safeCorrections,
    matches,
    refreshedAt: Date.now(),
  });
};

export const __test = {
  normalizeFile,
  normalizePhone,
  normalizeName,
  nameSimilarity,
  reconcileRow,
  patientKey,
  patientRecency,
};
