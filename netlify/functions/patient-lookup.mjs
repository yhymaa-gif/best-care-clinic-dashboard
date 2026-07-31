import { getStore } from '@netlify/blobs';
import { apiHeaders, canAccessClinic, requireUser } from './lib/session.mjs';

const headers = apiHeaders('GET,OPTIONS');
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
const clinicPattern = /^clinic-([1-9]|1[0-5])$/;

const cleanText = (value, max = 120) => String(value ?? '').trim().slice(0, max);
const normalizeFile = value => cleanText(value, 40).toUpperCase().replace(/[\s-]+/g, '');
const normalizePhone = value => {
  const digits = cleanText(value, 24).replace(/\D/g, '');
  if (/^009665\d{8}$/.test(digits)) return `0${digits.slice(5)}`;
  if (/^9665\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
  if (/^5\d{8}$/.test(digits)) return `0${digits}`;
  return digits;
};
const normalizeNationalId = value => cleanText(value, 20).replace(/\D/g, '').slice(0, 10);

const normalizeLookup = (type, value) => {
  if (type === 'file') return normalizeFile(value);
  if (type === 'phone') return normalizePhone(value);
  if (type === 'national') return normalizeNationalId(value);
  return '';
};

const lookupAlias = (type, normalized) => `${type}:${normalized}`;
const parseDayKey = key => {
  const primary = /^days\/(\d{4}-\d{2}-\d{2})$/.exec(key);
  if (primary) return { clinicId: 'clinic-1', date: primary[1] };
  const scoped = /^clinics\/(clinic-(?:[1-9]|1[0-5]))\/days\/(\d{4}-\d{2}-\d{2})$/.exec(key);
  return scoped ? { clinicId: scoped[1], date: scoped[2] } : null;
};

async function listKeys(dayStore, prefix) {
  const keys = [];
  let cursor;
  for (let pageNo = 0; pageNo < 50; pageNo += 1) {
    const page = await dayStore.list({ prefix, ...(cursor ? { cursor } : {}) });
    const entries = Array.isArray(page?.blobs) ? page.blobs : [];
    keys.push(...entries.map(entry => entry.key).filter(Boolean));
    const next = page?.cursor || page?.nextCursor || '';
    if (!next || next === cursor || entries.length === 0) break;
    cursor = next;
  }
  return keys;
}

const patientMatches = (patient, type, normalized) => {
  if (type === 'file') return normalizeFile(patient?.file) === normalized;
  if (type === 'phone') return normalizePhone(patient?.phone) === normalized;
  return normalizeNationalId(patient?.nationalId) === normalized;
};

const publicMatch = ({ patient, clinicId, date, source }) => ({
  patient: {
    id: cleanText(patient?.id ?? patient?.sourcePatientId, 100),
    name: cleanText(patient?.name ?? patient?.fullName, 100),
    file: cleanText(patient?.file ?? patient?.fileNo, 50),
    phone: normalizePhone(patient?.phone ?? patient?.mobile),
    nationalId: normalizeNationalId(patient?.nationalId),
  },
  clinicId,
  sourceDate: cleanText(date ?? patient?.sourceDate, 10),
  source,
});

const matchKey = match => `${match.clinicId}:${normalizeFile(match.patient.file) || normalizePhone(match.patient.phone) || normalizeNationalId(match.patient.nationalId)}`;

export default async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET') return reply({ error: 'Method not allowed' }, 405);

  const auth = await requireUser(request);
  if (!auth.ok) return reply({ error: auth.error }, auth.status);
  const dayStore = getStore({ name: 'clinic-dashboard-days', consistency: 'strong' });
  const registryStore = getStore({ name: 'clinic-treatment-plan-registry', consistency: 'strong' });

  const url = new URL(request.url);
  const type = url.searchParams.get('type') || '';
  const normalized = normalizeLookup(type, url.searchParams.get('value') || '');
  if (!['file', 'phone', 'national'].includes(type)) return reply({ error: 'Invalid lookup type' }, 400);
  if ((type === 'phone' && normalized.length < 9) || (type === 'national' && normalized.length !== 10) || (type === 'file' && normalized.length < 1)) {
    return reply({ error: 'Invalid lookup value' }, 400);
  }

  const requestedClinic = url.searchParams.get('clinic') || '';
  const searchAll = auth.user?.role === 'admin' && requestedClinic === 'all';
  const scopedClinic = searchAll
    ? ''
    : (clinicPattern.test(requestedClinic) ? requestedClinic : (clinicPattern.test(auth.user?.clinicId) ? auth.user.clinicId : 'clinic-1'));
  if (scopedClinic && !canAccessClinic(auth.user, scopedClinic)) return reply({ error: 'Clinic access denied' }, 403);

  const matches = [];
  const registry = await registryStore.get('registry/global', { type: 'json', consistency: 'strong' }) || {};
  const canonical = registry.aliases?.[lookupAlias(type, normalized)];
  const registryPatient = canonical ? registry.records?.[canonical] : null;
  if (registryPatient && clinicPattern.test(registryPatient.clinicId) && (searchAll || registryPatient.clinicId === scopedClinic)) {
    matches.push(publicMatch({ patient: registryPatient, clinicId: registryPatient.clinicId, date: registryPatient.sourceDate, source: 'treatment-plan' }));
  }

  const prefixes = searchAll
    ? ['days/', 'clinics/']
    : (scopedClinic === 'clinic-1' ? ['days/'] : [`clinics/${scopedClinic}/days/`]);
  const listed = (await Promise.all(prefixes.map(prefix => listKeys(dayStore, prefix)))).flat();
  const dayKeys = [...new Set(listed)]
    .map(key => ({ key, ...parseDayKey(key) }))
    .filter(item => item.clinicId && (searchAll || item.clinicId === scopedClinic))
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 1500);

  for (let index = 0; index < dayKeys.length && matches.length < 12; index += 20) {
    const chunk = dayKeys.slice(index, index + 20);
    const states = await Promise.all(chunk.map(async item => ({
      ...item,
      state: await dayStore.get(item.key, { type: 'json', consistency: 'strong' }),
    })));
    states.forEach(item => {
      (Array.isArray(item.state?.patients) ? item.state.patients : [])
        .filter(patient => patientMatches(patient, type, normalized))
        .forEach(patient => matches.push(publicMatch({ patient, clinicId: item.clinicId, date: item.date, source: 'appointment' })));
    });
    if (matches.length) break;
  }

  const unique = new Map();
  matches
    .sort((left, right) => String(right.sourceDate || '').localeCompare(String(left.sourceDate || '')))
    .forEach(match => {
      const key = matchKey(match);
      if (!unique.has(key)) unique.set(key, match);
    });

  return reply({
    found: unique.size > 0,
    type,
    matches: [...unique.values()].slice(0, 8),
  });
};

export const __test = { normalizeFile, normalizePhone, normalizeNationalId, normalizeLookup, patientMatches, parseDayKey };
