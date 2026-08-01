import { getStore } from '@netlify/blobs';
import { apiHeaders, requireUser } from './lib/session.mjs';

const headers = apiHeaders('GET,OPTIONS');
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
const store = name => getStore({ name, consistency: 'strong' });
const clinicPattern = /^clinic-([1-9]|1[0-5])$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;
const statusKeys = ['waiting', 'arrived', 'early_arrival', 'active', 'done', 'late', 'cancel', 'left', 'asks_delay'];
const planStatusKeys = ['draft', 'submitted', 'patient_accepted', 'approved', 'approved_signed', 'rejected', 'cancelled'];
const labStatusKeys = ['pending_send', 'sent', 'in_production', 'ready_at_lab', 'received_clinic', 'delivered_patient', 'needs_adjustment', 'returned_lab', 'cancelled'];

const defaultClinics = () => Array.from({ length: 15 }, (_, index) => ({
  id: `clinic-${index + 1}`,
  name: `العيادة ${index + 1}`,
  doctorName: '',
  roomNumber: String(index + 1),
  active: index === 0,
}));

const riyadhDate = (value = Date.now()) => {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const read = type => parts.find(part => part.type === type)?.value || '';
  return `${read('year')}-${read('month')}-${read('day')}`;
};

const dateAtUtc = value => new Date(`${value}T00:00:00Z`).getTime();
const addDays = (value, days) => new Date(dateAtUtc(value) + days * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.floor((dateAtUtc(to) - dateAtUtc(from)) / 86_400_000) + 1;
const emptyCounts = keys => Object.fromEntries(keys.map(key => [key, 0]));
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;

function activeClinics(saved) {
  const incoming = new Map((Array.isArray(saved?.clinics) ? saved.clinics : [])
    .filter(item => clinicPattern.test(String(item?.id || '')))
    .map(item => [String(item.id), item]));
  return defaultClinics().map(fallback => {
    const value = incoming.get(fallback.id);
    return value ? {
      id: fallback.id,
      name: String(value.name || fallback.name).trim().slice(0, 80),
      doctorName: String(value.doctorName || '').trim().slice(0, 80),
      roomNumber: String(value.roomNumber || fallback.roomNumber).trim().slice(0, 20),
      active: fallback.id === 'clinic-1' ? true : Boolean(value.active),
    } : fallback;
  }).filter(clinic => clinic.active);
}

async function listKeys(blobStore, prefix) {
  const keys = [];
  let cursor;
  for (let pageNo = 0; pageNo < 50; pageNo += 1) {
    const page = await blobStore.list({ prefix, ...(cursor ? { cursor } : {}) });
    const entries = Array.isArray(page?.blobs) ? page.blobs : [];
    keys.push(...entries.map(entry => entry.key).filter(Boolean));
    const next = page?.cursor || page?.nextCursor || '';
    if (!next || next === cursor || entries.length === 0) break;
    cursor = next;
  }
  return keys;
}

async function mapLimited(items, mapper, limit = 24) {
  const results = [];
  for (let index = 0; index < items.length; index += limit) {
    const chunk = items.slice(index, index + limit);
    results.push(...await Promise.all(chunk.map(mapper)));
  }
  return results;
}

const parseDayKey = key => {
  const primary = /^days\/(\d{4}-\d{2}-\d{2})$/.exec(key);
  if (primary) return { clinicId: 'clinic-1', date: primary[1] };
  const scoped = /^clinics\/(clinic-(?:[1-9]|1[0-5]))\/days\/(\d{4}-\d{2}-\d{2})$/.exec(key);
  return scoped ? { clinicId: scoped[1], date: scoped[2] } : null;
};

const normalizePhone = value => String(value || '').replace(/\D/g, '').replace(/^966(?=5\d{8}$)/, '0');
const patientIdentity = patient => {
  const file = String(patient?.file || '').trim().toUpperCase().replace(/\s+/g, '');
  const phone = normalizePhone(patient?.phone);
  const id = String(patient?.id || '').trim();
  const name = String(patient?.name || '').trim().toLocaleLowerCase('ar');
  return file ? `file:${file}` : phone ? `phone:${phone}` : id ? `id:${id}` : `name:${name}`;
};

const scheduledStart = (date, time) => {
  if (!datePattern.test(date) || !/^\d{1,2}:\d{2}$/.test(String(time || ''))) return 0;
  const [hours, minutes] = String(time).split(':').map(Number);
  // Riyadh is UTC+3 throughout the year.
  return Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    hours - 3,
    minutes,
  );
};

function buildDateSeries(from, to) {
  const series = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    series.push({ date, appointments: 0, completed: 0, cancelled: 0, paymentRequests: 0 });
  }
  return series;
}

function summarize({ records, clinics, from, to, clinicFilter, plans, labCases }) {
  const statusCounts = emptyCounts(statusKeys);
  const planStatusCounts = emptyCounts(planStatusKeys);
  const labStatusCounts = emptyCounts(labStatusKeys);
  const daily = buildDateSeries(from, to);
  const dailyMap = new Map(daily.map(item => [item.date, item]));
  const identities = new Set();
  const clinicMetrics = new Map(clinics.map(clinic => [clinic.id, {
    clinicId: clinic.id,
    name: clinic.name,
    doctorName: clinic.doctorName,
    roomNumber: clinic.roomNumber,
    appointments: 0,
    completed: 0,
    cancelled: 0,
    paymentPending: 0,
    plans: 0,
  }]));
  const payments = { requested: 0, acknowledged: 0, completed: 0, pending: 0 };
  let appointments = 0;
  let delaysTotalMinutes = 0;
  let delaysMeasured = 0;

  records.forEach(record => {
    const dailyItem = dailyMap.get(record.date);
    const clinicItem = clinicMetrics.get(record.clinicId);
    (Array.isArray(record.patients) ? record.patients : []).forEach(patient => {
      appointments += 1;
      identities.add(patientIdentity(patient));
      const status = statusKeys.includes(patient?.status) ? patient.status : 'waiting';
      statusCounts[status] += 1;
      if (dailyItem) {
        dailyItem.appointments += 1;
        if (status === 'done') dailyItem.completed += 1;
        if (status === 'cancel') dailyItem.cancelled += 1;
        if (patient?.paymentRequired) dailyItem.paymentRequests += 1;
      }
      if (clinicItem) {
        clinicItem.appointments += 1;
        if (status === 'done') clinicItem.completed += 1;
        if (status === 'cancel') clinicItem.cancelled += 1;
        if (patient?.paymentRequired && !patient?.paymentCompletedAt) clinicItem.paymentPending += 1;
      }
      if (patient?.paymentRequired) payments.requested += 1;
      if (patient?.paymentAcknowledgedAt && !patient?.paymentCompletedAt) payments.acknowledged += 1;
      if (patient?.paymentCompletedAt) payments.completed += 1;
      if (patient?.paymentRequired && !patient?.paymentCompletedAt) payments.pending += 1;
      const actualStartedAt = numeric(patient?.actualStartedAt);
      const planned = scheduledStart(record.date, patient?.start);
      if (actualStartedAt > 0 && planned > 0) {
        delaysTotalMinutes += Math.max(0, Math.round((actualStartedAt - planned) / 60_000));
        delaysMeasured += 1;
      }
    });
  });

  plans.forEach(plan => {
    if (clinicFilter !== 'all' && plan.clinicId !== clinicFilter) return;
    const updatedDate = riyadhDate(numeric(plan.updatedAt));
    if (updatedDate < from || updatedDate > to) return;
    const status = planStatusKeys.includes(plan.status) ? plan.status : 'draft';
    planStatusCounts[status] += 1;
    const clinicItem = clinicMetrics.get(plan.clinicId);
    if (clinicItem) clinicItem.plans += 1;
  });

  labCases.forEach(item => {
    if (clinicFilter !== 'all' && item.clinicId !== clinicFilter) return;
    const createdDate = riyadhDate(numeric(item.createdAt || item.updatedAt));
    if (createdDate < from || createdDate > to) return;
    const status = labStatusKeys.includes(item.status) ? item.status : 'pending_send';
    labStatusCounts[status] += 1;
  });

  const completed = statusCounts.done;
  const cancelled = statusCounts.cancel;
  const activeAppointments = Math.max(0, appointments - cancelled);
  const planTotal = Object.values(planStatusCounts).reduce((sum, value) => sum + value, 0);
  const labTotal = Object.values(labStatusCounts).reduce((sum, value) => sum + value, 0);
  return {
    summary: {
      appointments,
      uniquePatients: identities.size,
      completed,
      cancelled,
      completionRate: activeAppointments ? Math.round((completed / activeAppointments) * 100) : 0,
      averageDelayMinutes: delaysMeasured ? Math.round(delaysTotalMinutes / delaysMeasured) : 0,
      paymentPending: payments.pending,
      planTotal,
      labActive: labTotal - numeric(labStatusCounts.delivered_patient) - numeric(labStatusCounts.cancelled),
    },
    statusCounts,
    planStatusCounts,
    paymentCounts: payments,
    labStatusCounts,
    daily,
    clinics: [...clinicMetrics.values()].filter(item => clinicFilter === 'all' || item.clinicId === clinicFilter),
  };
}

export const __test = {
  activeClinics,
  addDays,
  daysBetween,
  parseDayKey,
  patientIdentity,
  scheduledStart,
  summarize,
  riyadhDate,
};

export default async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET') return reply({ error: 'Method not allowed' }, 405);
  const auth = await requireUser(request);
  if (!auth.ok) return reply({ error: auth.error }, auth.status);
  if (auth.user?.role !== 'admin') return reply({ error: 'Admin role required' }, 403);

  const url = new URL(request.url);
  const today = riyadhDate();
  const to = datePattern.test(url.searchParams.get('to') || '') ? url.searchParams.get('to') : today;
  const from = datePattern.test(url.searchParams.get('from') || '') ? url.searchParams.get('from') : addDays(to, -29);
  const clinicFilter = url.searchParams.get('clinic') === 'all' ? 'all' : String(url.searchParams.get('clinic') || 'all');
  if (from > to || daysBetween(from, to) < 1 || daysBetween(from, to) > MAX_RANGE_DAYS) {
    return reply({ error: `Date range must be between 1 and ${MAX_RANGE_DAYS} days` }, 400);
  }
  if (clinicFilter !== 'all' && !clinicPattern.test(clinicFilter)) return reply({ error: 'Invalid clinic' }, 400);

  const configStore = store('clinic-dashboard-config');
  const dayStore = store('clinic-dashboard-days');
  const registryStore = store('clinic-treatment-plan-registry');
  const labStore = store('clinic-lab-cases');
  const savedClinics = await configStore.get('clinics', { type: 'json', consistency: 'strong' });
  const clinics = activeClinics(savedClinics);
  const allowedClinics = new Set(clinics.map(clinic => clinic.id));

  const [primaryKeys, scopedKeys, registry, labRecords] = await Promise.all([
    clinicFilter === 'all' || clinicFilter === 'clinic-1' ? listKeys(dayStore, 'days/') : [],
    clinicFilter === 'all' ? listKeys(dayStore, 'clinics/') : clinicFilter !== 'clinic-1' ? listKeys(dayStore, `clinics/${clinicFilter}/days/`) : [],
    registryStore.get('registry/global', { type: 'json', consistency: 'strong' }),
    Promise.all(
      clinics
        .filter(clinic => clinicFilter === 'all' || clinic.id === clinicFilter)
        .map(clinic => labStore.get(`clinics/${clinic.id}`, { type: 'json', consistency: 'strong' })),
    ),
  ]);

  const dayKeys = [...new Set([...primaryKeys, ...scopedKeys])]
    .map(key => ({ key, ...parseDayKey(key) }))
    .filter(item => item.clinicId && allowedClinics.has(item.clinicId))
    .filter(item => clinicFilter === 'all' || item.clinicId === clinicFilter)
    .filter(item => item.date >= from && item.date <= to);

  const records = (await mapLimited(dayKeys, async item => {
    const state = await dayStore.get(item.key, { type: 'json', consistency: 'strong' });
    return { clinicId: item.clinicId, date: item.date, patients: Array.isArray(state?.patients) ? state.patients : [] };
  })).filter(Boolean);

  const plans = Object.values(registry?.records && typeof registry.records === 'object' ? registry.records : {});
  const labCases = labRecords.flatMap(record => Array.isArray(record?.cases) ? record.cases : []);
  const result = summarize({ records, clinics, from, to, clinicFilter, plans, labCases });
  return reply({
    from,
    to,
    clinic: clinicFilter,
    generatedAt: Date.now(),
    ...result,
  });
};
