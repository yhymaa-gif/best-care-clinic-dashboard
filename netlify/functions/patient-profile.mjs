import { createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { apiHeaders, canAccessClinic, requireUser, sameOriginRequest } from './lib/session.mjs';
import { normalizePatientFile, normalizePatientNationalId, normalizePatientPhone, patientIdentityKeys } from './lib/patient-identity.mjs';
import { correctDirectoryPatient, getPatientDirectory } from './lib/patient-directory.mjs';

const headers = apiHeaders('GET,PATCH,POST,OPTIONS');
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
const legacyPrescriptionKey = (clinicId, date, patientId) => `clinics/${clinicId}/days/${date}/patients/${hash(patientId)}`;
const permanentPrescriptionKey = (clinicId, identity) => `clinics/${clinicId}/patients/${hash(identity)}`;
const communicationKinds = new Set(['plan_whatsapp', 'review_whatsapp']);

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

function prescriptionMatches(registry, aliases, scope) {
  const canonicalKeys = new Set([...aliases].map(alias => registry.aliases?.[alias]).filter(Boolean));
  return [...canonicalKeys].map(canonical => ({ canonical, record: registry.records?.[canonical] }))
    .filter(item => item.record && (scope.all || item.record.clinicId === scope.clinicId));
}

function primaryPatient(dayMatches, plans, labs, communications = [], prescriptions = [], directoryRecord = null) {
  const latestAppointment = dayMatches.flatMap(day => day.matches.map(patient => ({ patient, date: day.date })))
    .sort((left, right) => right.date.localeCompare(left.date))[0]?.patient;
  const sources = [directoryRecord, latestAppointment, plans[0]?.record, labs[0]?.patient, communications[0]?.record?.patient, prescriptions[0]?.record?.patient].filter(Boolean).map(patientView);
  return sources.reduce((merged, item) => ({
    id: merged.id || item.id,
    name: merged.name || item.name,
    file: merged.file || item.file,
    phone: merged.phone || item.phone,
    nationalId: merged.nationalId || item.nationalId
  }), { id: '', name: '', file: '', phone: '', nationalId: '' });
}

function communicationMatches(registry, aliases, scope) {
  const canonicalKeys = new Set([...aliases].map(alias => registry.aliases?.[alias]).filter(Boolean));
  return [...canonicalKeys].map(canonical => ({ canonical, record: registry.records?.[canonical] }))
    .filter(item => item.record && (scope.all || !item.record.clinicIds?.length || item.record.clinicIds.includes(scope.clinicId)));
}

function communicationPayload(matches) {
  const events = matches.flatMap(({ record }) => Array.isArray(record?.events) ? record.events : [])
    .sort((left, right) => Number(right.at || 0) - Number(left.at || 0));
  const counts = matches.reduce((total, { record }) => ({
    planWhatsapp: total.planWhatsapp + Number(record?.counts?.planWhatsapp || 0),
    reviewWhatsapp: total.reviewWhatsapp + Number(record?.counts?.reviewWhatsapp || 0)
  }), { planWhatsapp: 0, reviewWhatsapp: 0 });
  return {
    planWhatsappCount: counts.planWhatsapp,
    reviewWhatsappCount: counts.reviewWhatsapp,
    lastPlanWhatsappAt: Math.max(0, ...matches.map(({ record }) => Number(record?.lastAt?.planWhatsapp || 0))),
    lastReviewWhatsappAt: Math.max(0, ...matches.map(({ record }) => Number(record?.lastAt?.reviewWhatsapp || 0))),
    events: events.slice(0, 100)
  };
}

function profilePayload(patient, dayMatches, plans, labs, communications = [], prescriptions = [], directoryRecord = null) {
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
  const communication = communicationPayload(communications);
  const prescriptionItems = prescriptions.map(({ canonical, record }) => ({ canonical, ...record }));
  return {
    patient,
    summary: { appointments: appointments.length, plans: planItems.length, prescriptions: prescriptionItems.length, labs: labItems.length, openPayments, communications: communication.planWhatsappCount + communication.reviewWhatsappCount },
    appointments,
    plans: planItems,
    labs: labItems,
    prescriptions: prescriptionItems,
    communications: communication,
    directory: directoryRecord ? {
      adminNotes: cleanText(directoryRecord.adminNotes, 1600),
      dataQualityFlags: Array.isArray(directoryRecord.dataQualityFlags) ? directoryRecord.dataQualityFlags : [],
      reviewRequired: Boolean(directoryRecord.reviewRequired),
      notesReviewedAt: Number(directoryRecord.notesReviewedAt || 0)
    } : { adminNotes: '', dataQualityFlags: [], reviewRequired: false, notesReviewedAt: 0 },
    updatedAt: Date.now()
  };
}

export default async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (!['GET', 'PATCH', 'POST'].includes(request.method)) return reply({ error: 'Method not allowed' }, 405);
  if (['PATCH', 'POST'].includes(request.method) && !sameOriginRequest(request)) return reply({ error: 'Invalid request origin' }, 403);
  const auth = await requireUser(request);
  if (!auth.ok) return reply({ error: auth.error }, auth.status);
  const url = new URL(request.url);
  let body = {};
  if (['PATCH', 'POST'].includes(request.method)) {
    if (request.method === 'PATCH' && auth.user?.role !== 'admin') return reply({ error: 'Admin role required' }, 403);
    try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400); }
  }
  if (request.method === 'POST') {
    const kind = cleanText(body?.kind, 30);
    const clinicId = clinicPattern.test(body?.clinicId) ? body.clinicId : (clinicPattern.test(auth.user?.clinicId) ? auth.user.clinicId : 'clinic-1');
    if (!communicationKinds.has(kind)) return reply({ error: 'Unsupported communication kind' }, 400);
    if (!canAccessClinic(auth.user, clinicId)) return reply({ error: 'Clinic access denied' }, 403);
    const patient = patientView(body?.patient || {});
    const aliases = patientIdentityKeys(patient);
    if (!aliases.length) return reply({ error: 'Patient identity is required' }, 400);
    const eventId = cleanText(body?.eventId, 100) || hash(`${kind}:${clinicId}:${Date.now()}:${Math.random()}`);
    const communicationsStore = store('clinic-patient-communications');
    const registry = await communicationsStore.get('registry/global', { type: 'json', consistency: 'strong' }) || { records: {}, aliases: {}, revision: 0 };
    const existingCanonicals = aliases.map(alias => registry.aliases?.[alias]).filter(Boolean);
    const canonical = existingCanonicals[0] || hash(aliases.slice().sort()[0]);
    const existing = registry.records?.[canonical] || {};
    const existingEvents = Array.isArray(existing.events) ? existing.events : [];
    if (existingEvents.some(event => event.id === eventId)) return reply({ ok: true, duplicate: true, communications: communicationPayload([{ canonical, record: existing }]) });
    const at = Date.now();
    const countKey = kind === 'plan_whatsapp' ? 'planWhatsapp' : 'reviewWhatsapp';
    const event = {
      id: eventId, kind, at, clinicId,
      planNo: cleanText(body?.details?.planNo, 80),
      planStatus: cleanText(body?.details?.planStatus, 40),
      copyType: cleanText(body?.details?.copyType, 30),
      actor: cleanText(auth.user?.displayName || auth.user?.username, 120)
    };
    const previousPatient = patientView(existing.patient || {});
    const record = {
      ...existing,
      patient: {
        id: patient.id || previousPatient.id,
        name: patient.name || previousPatient.name,
        file: patient.file || previousPatient.file,
        phone: patient.phone || previousPatient.phone,
        nationalId: patient.nationalId || previousPatient.nationalId
      },
      aliases: [...new Set([...(Array.isArray(existing.aliases) ? existing.aliases : []), ...aliases])],
      clinicIds: [...new Set([...(Array.isArray(existing.clinicIds) ? existing.clinicIds : []), clinicId])],
      counts: { planWhatsapp: Number(existing?.counts?.planWhatsapp || 0), reviewWhatsapp: Number(existing?.counts?.reviewWhatsapp || 0), [countKey]: Number(existing?.counts?.[countKey] || 0) + 1 },
      lastAt: { ...(existing.lastAt || {}), [countKey]: at },
      events: [event, ...existingEvents].slice(0, 200),
      updatedAt: at
    };
    const next = { records: { ...(registry.records || {}), [canonical]: record }, aliases: { ...(registry.aliases || {}) }, revision: Number(registry.revision || 0) + 1, updatedAt: at };
    record.aliases.forEach(alias => { next.aliases[alias] = canonical; });
    await communicationsStore.setJSON('registry/global', next);
    return reply({ ok: true, communications: communicationPayload([{ canonical, record }]) });
  }
  const type = cleanText(request.method === 'GET' ? url.searchParams.get('type') : body?.lookup?.type, 20);
  const normalized = normalizeLookup(type, request.method === 'GET' ? url.searchParams.get('value') : body?.lookup?.value);
  if (!['file', 'phone', 'national'].includes(type) || !normalized) return reply({ error: 'Valid patient identity is required' }, 400);
  const scope = clinicScope(auth.user, request.method === 'GET' ? (url.searchParams.get('clinic') || '') : (body?.clinic || ''));
  if (!scope.all && !canAccessClinic(auth.user, scope.clinicId)) return reply({ error: 'Clinic access denied' }, 403);
  const lookupAliases = new Set([lookupAlias(type, normalized)]);
  const registryStore = store('clinic-treatment-plan-registry');
  const communicationsStore = store('clinic-patient-communications');
  const prescriptionsStore = store('clinic-prescriptions');
  const daysStore = store('clinic-dashboard-days');
  const labsStore = store('clinic-lab-cases');
  const plansStore = store('clinic-treatment-plans');
  const registry = await registryStore.get('registry/global', { type: 'json', consistency: 'strong' }) || { records: {}, aliases: {} };
  const communicationRegistry = await communicationsStore.get('registry/global', { type: 'json', consistency: 'strong' }) || { records: {}, aliases: {} };
  const prescriptionRegistry = await prescriptionsStore.get('registry/global', { type: 'json', consistency: 'strong' }) || { records: {}, aliases: {} };
  const directoryRegistry = await getPatientDirectory();
  const directoryCanonical = directoryRegistry.aliases?.[lookupAlias(type, normalized)];
  const directoryRecord = directoryCanonical ? directoryRegistry.records?.[directoryCanonical] : null;
  patientIdentityKeys(directoryRecord).forEach(alias => lookupAliases.add(alias));
  const initialPlans = registryMatches(registry, lookupAliases, scope);
  initialPlans.forEach(({ record }) => patientIdentityKeys(record).forEach(alias => lookupAliases.add(alias)));
  const dayMatches = await loadMatchedDays(scope, lookupAliases);
  dayMatches.forEach(day => day.matches.forEach(patient => patientIdentityKeys(patient).forEach(alias => lookupAliases.add(alias))));
  const plans = registryMatches(registry, lookupAliases, scope);
  const labs = await loadLabMatches(scope, lookupAliases);
  const communications = communicationMatches(communicationRegistry, lookupAliases, scope);
  const prescriptions = prescriptionMatches(prescriptionRegistry, lookupAliases, scope);
  const patient = primaryPatient(dayMatches, plans, labs, communications, prescriptions, directoryRecord);
  if (!patient.name && !patient.file && !patient.phone && !patient.nationalId) return reply({ found: false, patient: null, appointments: [], plans: [], labs: [] }, 404);

  if (request.method === 'GET') return reply({ found: true, ...profilePayload(patient, dayMatches, plans, labs, communications, prescriptions, directoryRecord) });

  const allowIncomplete = Boolean(body?.allowIncomplete);
  const suppliedPatient = body?.patient && typeof body.patient === 'object' ? body.patient : {};
  const suppliedNationalId = Object.prototype.hasOwnProperty.call(suppliedPatient, 'nationalId');
  const next = {
    name: cleanText(suppliedPatient.name, 100) || (allowIncomplete ? cleanText(patient.name, 100) : ''),
    file: cleanText(suppliedPatient.file, 40) || (allowIncomplete ? cleanText(patient.file, 40) : ''),
    phone: normalizePatientPhone(suppliedPatient.phone) || (allowIncomplete ? normalizePatientPhone(patient.phone) : ''),
    nationalId: suppliedNationalId ? normalizePatientNationalId(suppliedPatient.nationalId) : normalizePatientNationalId(patient.nationalId),
    adminNotes: Object.prototype.hasOwnProperty.call(suppliedPatient, 'adminNotes') ? cleanText(suppliedPatient.adminNotes, 1600) : cleanText(patient.adminNotes, 1600),
    notesReviewed: Object.prototype.hasOwnProperty.call(suppliedPatient, 'notesReviewed') ? Boolean(suppliedPatient.notesReviewed) : Boolean(patient.notesReviewed)
  };
  if (!next.name || (!next.file && !next.phone && !next.nationalId)) return reply({ error: 'Name and at least one stable patient identity are required' }, 400);
  if (!allowIncomplete && (!next.file || !next.phone)) return reply({ error: 'Name, file number, and mobile are required' }, 400);
  if (next.nationalId && next.nationalId.length !== 10) return reply({ error: 'National ID must contain 10 digits' }, 400);
  const nextAliases = patientIdentityKeys(next);
  const conflicting = nextAliases.map(alias => registry.aliases?.[alias]).find(canonical => canonical && !plans.some(item => item.canonical === canonical));
  if (conflicting) return reply({ error: 'The new identity is already linked to another patient' }, 409);
  const directoryConflict = nextAliases.filter(alias => !alias.startsWith('phone:')).map(alias => directoryRegistry.aliases?.[alias]).find(canonical => canonical && canonical !== directoryCanonical);
  if (directoryConflict) return reply({ error: 'The new identity is already linked to another patient' }, 409);

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

  if (communications.length) {
    const nextCommunicationRegistry = { records: { ...(communicationRegistry.records || {}) }, aliases: { ...(communicationRegistry.aliases || {}) }, revision: Number(communicationRegistry.revision || 0) + 1, updatedAt: Date.now() };
    communications.forEach(({ canonical, record }) => {
      nextCommunicationRegistry.records[canonical] = { ...record, patient: next, aliases: [...new Set([...(record.aliases || []), ...nextAliases])], updatedAt: Date.now() };
      nextAliases.forEach(alias => { nextCommunicationRegistry.aliases[alias] = canonical; });
    });
    await communicationsStore.setJSON('registry/global', nextCommunicationRegistry);
  }

  let prescriptionUpdates = 0;
  if (prescriptions.length) {
    const nextPrescriptionRegistry = { records: { ...(prescriptionRegistry.records || {}) }, aliases: { ...(prescriptionRegistry.aliases || {}) }, revision: Number(prescriptionRegistry.revision || 0) + 1, updatedAt: Date.now() };
    await Promise.all(prescriptions.map(async ({ canonical, record }) => {
      const clinicId = record.clinicId || scope.clinicId || 'clinic-1';
      const keys = [
        permanentPrescriptionKey(clinicId, canonical),
        ...(record.sourcePatientId && record.sourceDate ? [legacyPrescriptionKey(clinicId, record.sourceDate, record.sourcePatientId)] : [])
      ];
      const stored = (await Promise.all(keys.map(key => prescriptionsStore.get(key, { type: 'json', consistency: 'strong' })))).find(Boolean);
      if (stored?.prescription) {
        const updatePrescription = prescription => ({ ...prescription, patient: { ...(prescription?.patient || {}), name: next.name, file: next.file, phone: next.phone, nationalId: next.nationalId } });
        const updated = {
          ...stored,
          prescription: updatePrescription(stored.prescription),
          history: (Array.isArray(stored.history) ? stored.history : []).map(entry => ({ ...entry, prescription: updatePrescription(entry.prescription) })),
          updatedAt: Date.now(),
          updatedBy: cleanText(auth.user?.displayName || auth.user?.username, 120)
        };
        await Promise.all([...new Set(keys)].map(key => prescriptionsStore.setJSON(key, updated)));
        prescriptionUpdates += 1;
      }
      nextPrescriptionRegistry.records[canonical] = { ...record, patient: { ...(record.patient || {}), name: next.name, file: next.file, phone: next.phone, nationalId: next.nationalId }, updatedAt: Date.now(), updatedBy: cleanText(auth.user?.displayName || auth.user?.username, 120) };
      nextAliases.forEach(alias => { nextPrescriptionRegistry.aliases[alias] = canonical; });
    }));
    await prescriptionsStore.setJSON('registry/global', nextPrescriptionRegistry);
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

  await correctDirectoryPatient([...lookupAliases], next, { actor: cleanText(auth.user?.displayName || auth.user?.username, 120), correctionId: cleanText(body?.correctionId, 120) });

  return reply({ ok: true, patient: next, updated: { appointments: appointmentUpdates, plans: planUpdates, prescriptions: prescriptionUpdates, labs: labUpdates } });
};

export const __test = { normalizeLookup, parseDayKey, hasAlias, patientView, statusLabel, communicationMatches, communicationPayload, prescriptionMatches };
