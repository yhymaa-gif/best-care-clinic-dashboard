import { createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { apiHeaders, canAccessClinic, requireUser, sameOriginRequest } from './lib/session.mjs';
import { normalizePatientFile, normalizePatientNationalId, normalizePatientPhone, patientIdentityKeys } from './lib/patient-identity.mjs';

const headers = apiHeaders('GET,PATCH,OPTIONS');
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
const clinicPattern = /^clinic-([1-9]|1[0-5])$/;
const cleanText = (value, max = 120) => String(value ?? '').trim().slice(0, max);
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const store = name => getStore({ name, consistency: 'strong' });

const normalizeLookup = (type, value) => {
  if (type === 'file') return normalizePatientFile(value);
  if (type === 'phone') return normalizePatientPhone(value);
  if (type === 'national') return normalizePatientNationalId(value);
  return '';
};
const lookupAlias = (type, value) => `${type}:${value}`;
const parseDayKey = key => {
  const legacy = /^days\/(\d{4}-\d{2}-\d{2})$/.exec(key);
  if (legacy) return { clinicId: 'clinic-1', date: legacy[1] };
  const scoped = /^clinics\/(clinic-(?:[1-9]|1[0-5]))\/days\/(\d{4}-\d{2}-\d{2})$/.exec(key);
  return scoped ? { clinicId: scoped[1], date: scoped[2] } : null;
};
const legacyPlanKey = (clinicId, date, patientId) => `clinics/${clinicId}/days/${date}/patients/${hash(patientId)}`;
const permanentPlanKey = (clinicId, identity) => `clinics/${clinicId}/patients/${hash(identity)}`;

async function listKeys(store, prefix, maxPages = 60) {
  const keys = [];
  let cursor;
  for (let pageNo = 0; pageNo < maxPages; pageNo += 1) {
    const page = await store.list({ prefix, ...(cursor ? { cursor } : {}) });
    const entries = Array.isArray(page?.blobs) ? page.blobs : [];
    keys.push(...entries.map(entry => entry.key).filter(Boolean));
    const next = page?.cursor || page?.nextCursor || '';
    if (!next || next === cursor || !entries.length) break;
    cursor = next;
  }
  return keys;
}

const patientAliases = patient => new Set(patientIdentityKeys({
  file: patient?.file ?? patient?.fileNo,
  phone: patient?.phone ?? patient?.mobile,
  nationalId: patient?.nationalId
}));
const hasAlias = (patient, aliases) => [...patientAliases(patient)].some(alias => aliases.has(alias));
const patientView = patient => ({
  id: cleanText(patient?.id ?? patient?.sourcePatientId, 100),
  name: cleanText(patient?.name ?? patient?.fullName, 100),
  file: cleanText(patient?.file ?? patient?.fileNo, 40),
  phone: normalizePatientPhone(patient?.phone ?? patient?.mobile),
  nationalId: normalizePatientNationalId(patient?.nationalId)
});
const clinicScope = (user, requested) => {
  if (requested === 'all' && user?.role === 'admin') return { all: true, clinicId: '' };
  const clinicId = clinicPattern.test(requested) ? requested : (clinicPattern.test(user?.clinicId) ? user.clinicId : 'clinic-1');
  return { all: false, clinicId };
};
const statusLabel = status => ({
  waiting: 'بانتظار الموعد', arrived: 'وصل المريض', early_arrival: 'وصول مبكر', active: 'قيد العلاج', done: 'مكتمل', late: 'متأخر', cancel: 'ملغي', left: 'غادر', asks_delay: 'يستفسر عن التأخير'
}[status] || status || 'بانتظار الموعد');

async function dayRecords(scope) {
  const days = store('clinic-dashboard-days');
  const prefixes = scope.all ? ['days/', 'clinics/'] : (scope.clinicId === 'clinic-1' ? ['days/'] : [`clinics/${scope.clinicId}/days/`]);
  const keys = [...new Set((await Promise.all(prefixes.map(prefix => listKeys(days, prefix)))).flat())];
  return keys.map(key => ({ key, ...parseDayKey(key) }))
    .filter(item => item.clinicId && (scope.all || item.clinicId === scope.clinicId))
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 1800);
}

async function loadMatchedDays(scope, aliases) {
  const daysStore = store('clinic-dashboard-days');
  const days = await dayRecords(scope);
  const matches = [];
  for (let index = 0; index < days.length; index += 24) {
    const chunk = days.slice(index, index + 24);
    const states = await Promise.all(chunk.map(async item => ({
      ...item,
      state: await daysStore.get(item.key, { type: 'json', consistency: 'strong' })
    })));
    states.forEach(item => {
      const patients = Array.isArray(item.state?.patients) ? item.state.patients : [];
      const patientMatches = patients.filter(patient => hasAlias(patient, aliases));
      if (patientMatches.length) matches.push({ ...item, patients, matches: patientMatches });
    });
  }
  return matches;
}

function registryMatches(registry, aliases, scope) {
  const canonicalKeys = new Set([...aliases].map(alias => registry.aliases?.[alias]).filter(Boolean));
  return [...canonicalKeys].map(canonical => ({ canonical, record: registry.records?.[canonical] }))
    .filter(item => item.record && (scope.all || item.record.clinicId === scope.clinicId));
}

async function loadLabMatches(scope, aliases) {
  const labsStore = store('clinic-lab-cases');
  const clinicIds = scope.all ? Array.from({ length: 15 }, (_, index) => `clinic-${index + 1}`) : [scope.clinicId];
  const records = await Promise.all(clinicIds.map(async clinicId => ({
    clinicId,
    record: await labsStore.get(`clinics/${clinicId}`, { type: 'json', consistency: 'strong' }) || {}
  })));
  return records.flatMap(({ clinicId, record }) => (Array.isArray(record.cases) ? record.cases : [])
    .filter(item => hasAlias(item.patient, aliases))
    .map(item => ({ ...item, clinicId })));
}

function primaryPatient(dayMatches, plans, labs) {
  const latestAppointment = dayMatches.flatMap(day => day.matches.map(patient => ({ patient, date: day.date })))
    .sort((left, right) => right.date.localeCompare(left.date))[0]?.patient;
  const sources = [latestAppointment, plans[0]?.record, labs[0]?.patient].filter(Boolean).map(patientView);
  return sources.reduce((merged, item) => ({
    id: merged.id || item.id,
    name: merged.name || item.name,
    file: merged.file || item.file,
    phone: merged.phone || item.phone,
    nationalId: merged.nationalId || item.nationalId
  }), { id: '', name: '', file: '', phone: '', nationalId: '' });
}

function profilePayload(patient, dayMatches, plans, labs) {
  const appointments = dayMatches.flatMap(day => day.matches.map(item => ({
    id: cleanText(item.id, 100), clinicId: day.clinicId, date: day.date, start: cleanText(item.start, 8), end: cleanText(item.end, 8),
    procedure: cleanText(item.procedure, 180), status: cleanText(item.status, 30), statusLabel: statusLabel(item.status),
    paymentRequired: Boolean(item.paymentRequired), paymentAction: cleanText(item.paymentAction, 180), paymentRequestedAt: Number(item.paymentRequestedAt || 0),
    paymentAcknowledgedAt: Number(item.paymentAcknowledgedAt || 0), paymentCompletedAt: Number(item.paymentCompletedAt || 0),
    treatmentPlanStatus: cleanText(item.treatmentPlanStatus, 30), updatedAt: Number(day.state?.updatedAt || 0)
  }))).sort((left, right) => `${right.date} ${right.start}`.localeCompare(`${left.date} ${left.start}`));
  const planItems = plans.map(({ canonical, record }) => ({ canonical, ...record }));
  const labItems = labs.sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
  const openPayments = appointments.filter(item => item.paymentRequired && !item.paymentCompletedAt).length;
  return {
    patient,
    summary: { appointments: appointments.length, plans: planItems.length, labs: labItems.length, openPayments },
    appointments,
    plans: planItems,
    labs: labItems,
    updatedAt: Date.now()
  };
}

export default async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (!['GET', 'PATCH'].includes(request.method)) return reply({ error: 'Method not allowed' }, 405);
  if (request.method === 'PATCH' && !sameOriginRequest(request)) return reply({ error: 'Invalid request origin' }, 403);
  const auth = await requireUser(request);
  if (!auth.ok) return reply({ error: auth.error }, auth.status);
  const url = new URL(request.url);
  let body = {};
  if (request.method === 'PATCH') {
    if (auth.user?.role !== 'admin') return reply({ error: 'Admin role required' }, 403);
    try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400); }
  }
  const type = cleanText(request.method === 'GET' ? url.searchParams.get('type') : body?.lookup?.type, 20);
  const normalized = normalizeLookup(type, request.method === 'GET' ? url.searchParams.get('value') : body?.lookup?.value);
  if (!['file', 'phone', 'national'].includes(type) || !normalized) return reply({ error: 'Valid patient identity is required' }, 400);
  const scope = clinicScope(auth.user, request.method === 'GET' ? (url.searchParams.get('clinic') || '') : (body?.clinic || ''));
  if (!scope.all && !canAccessClinic(auth.user, scope.clinicId)) return reply({ error: 'Clinic access denied' }, 403);
  const lookupAliases = new Set([lookupAlias(type, normalized)]);
  const registryStore = store('clinic-treatment-plan-registry');
  const daysStore = store('clinic-dashboard-days');
  const labsStore = store('clinic-lab-cases');
  const plansStore = store('clinic-treatment-plans');
  const registry = await registryStore.get('registry/global', { type: 'json', consistency: 'strong' }) || { records: {}, aliases: {} };
  const initialPlans = registryMatches(registry, lookupAliases, scope);
  initialPlans.forEach(({ record }) => patientIdentityKeys(record).forEach(alias => lookupAliases.add(alias)));
  const dayMatches = await loadMatchedDays(scope, lookupAliases);
  dayMatches.forEach(day => day.matches.forEach(patient => patientIdentityKeys(patient).forEach(alias => lookupAliases.add(alias))));
  const plans = registryMatches(registry, lookupAliases, scope);
  const labs = await loadLabMatches(scope, lookupAliases);
  const patient = primaryPatient(dayMatches, plans, labs);
  if (!patient.name && !patient.file && !patient.phone && !patient.nationalId) return reply({ found: false, patient: null, appointments: [], plans: [], labs: [] }, 404);

  if (request.method === 'GET') return reply({ found: true, ...profilePayload(patient, dayMatches, plans, labs) });

  const next = {
    name: cleanText(body?.patient?.name, 100),
    file: cleanText(body?.patient?.file, 40),
    phone: normalizePatientPhone(body?.patient?.phone),
    nationalId: normalizePatientNationalId(body?.patient?.nationalId)
  };
  if (!next.name || !next.file || !next.phone) return reply({ error: 'Name, file number, and mobile are required' }, 400);
  if (next.nationalId && next.nationalId.length !== 10) return reply({ error: 'National ID must contain 10 digits' }, 400);
  const nextAliases = patientIdentityKeys(next);
  const conflicting = nextAliases.map(alias => registry.aliases?.[alias]).find(canonical => canonical && !plans.some(item => item.canonical === canonical));
  if (conflicting) return reply({ error: 'The new identity is already linked to another patient' }, 409);

  let appointmentUpdates = 0;
  await Promise.all(dayMatches.map(async day => {
    const patients = day.patients.map(item => {
      if (!hasAlias(item, lookupAliases)) return item;
      appointmentUpdates += 1;
      return { ...item, name: next.name, file: next.file, phone: next.phone, nationalId: next.nationalId, adminUpdatedAt: Date.now() };
    });
    await daysStore.setJSON(day.key, { ...day.state, patients, revision: Number(day.state?.revision || 0) + 1, updatedAt: Date.now(), updatedBy: cleanText(auth.user?.displayName || auth.user?.username, 120) });
  }));

  const updatedRegistry = { records: { ...(registry.records || {}) }, aliases: { ...(registry.aliases || {}) }, revision: Number(registry.revision || 0), updatedAt: Date.now() };
  plans.forEach(({ canonical, record }) => {
    updatedRegistry.records[canonical] = { ...record, fullName: next.name, fileNo: next.file, mobile: next.phone, nationalId: next.nationalId, updatedAt: Date.now(), updatedBy: cleanText(auth.user?.displayName || auth.user?.username, 120) };
    nextAliases.forEach(alias => { updatedRegistry.aliases[alias] = canonical; });
  });
  if (plans.length) {
    updatedRegistry.revision += 1;
    await registryStore.setJSON('registry/global', updatedRegistry);
  }

  let labUpdates = 0;
  const labClinics = [...new Set(labs.map(item => item.clinicId))];
  await Promise.all(labClinics.map(async clinicId => {
    const key = `clinics/${clinicId}`;
    const record = await labsStore.get(key, { type: 'json', consistency: 'strong' }) || {};
    const cases = (Array.isArray(record.cases) ? record.cases : []).map(item => {
      if (!hasAlias(item.patient, lookupAliases)) return item;
      labUpdates += 1;
      return { ...item, patient: { ...(item.patient || {}), name: next.name, file: next.file, phone: next.phone, nationalId: next.nationalId }, updatedAt: Date.now(), updatedBy: cleanText(auth.user?.displayName || auth.user?.username, 120) };
    });
    await labsStore.setJSON(key, { ...record, clinicId, cases, revision: Number(record.revision || 0) + 1, updatedAt: Date.now() });
  }));

  let planUpdates = 0;
  await Promise.all(plans.map(async ({ record }) => {
    const oldAliases = patientIdentityKeys(record);
    const keys = [
      ...oldAliases.map(alias => permanentPlanKey(record.clinicId, alias)),
      ...(record.sourcePatientId && record.sourceDate ? [legacyPlanKey(record.clinicId, record.sourceDate, record.sourcePatientId)] : [])
    ];
    const stored = (await Promise.all(keys.map(key => plansStore.get(key, { type: 'json', consistency: 'strong' })))).find(Boolean);
    if (!stored?.plan) return;
    const updated = { ...stored, plan: { ...stored.plan, patient: { ...(stored.plan.patient || {}), fullName: next.name, fileNo: next.file, mobile: next.phone, nationalId: next.nationalId } }, updatedAt: Date.now(), updatedBy: cleanText(auth.user?.displayName || auth.user?.username, 120) };
    await Promise.all([...new Set([...keys, ...nextAliases.map(alias => permanentPlanKey(record.clinicId, alias))])].map(key => plansStore.setJSON(key, updated)));
    planUpdates += 1;
  }));

  return reply({ ok: true, patient: next, updated: { appointments: appointmentUpdates, plans: planUpdates, labs: labUpdates } });
};

export const __test = { normalizeLookup, parseDayKey, hasAlias, patientView, statusLabel };
