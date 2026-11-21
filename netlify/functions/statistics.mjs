import { createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { apiHeaders, requireUser } from './lib/session.mjs';
import { PROCEDURE_TYPES, procedureType, typeLabel } from './lib/procedure-types.mjs';

const headers = apiHeaders('GET,OPTIONS');
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
const store = name => getStore({ name, consistency: 'strong' });
const clinicPattern = /^clinic-([1-9]|1[0-5])$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;
// Reading day blobs directly is far cheaper than listing the whole history when
// the requested window is small (e.g. today's admin snapshot).
const DIRECT_KEY_LIMIT = 240;
const TOP_LIMIT = 12;
const labSentStatuses = new Set(['sent', 'in_production', 'ready_at_lab', 'received_clinic', 'delivered_coordination', 'delivered_patient', 'needs_adjustment', 'returned_lab']);
const labClosedStatuses = new Set(['received_clinic', 'delivered_coordination', 'delivered_patient', 'cancelled']);
const statusKeys = ['waiting', 'arrived', 'early_arrival', 'active', 'done', 'late', 'cancel', 'left', 'asks_delay'];
const planStatusKeys = ['draft', 'submitted', 'patient_accepted', 'approved', 'approved_signed', 'rejected', 'cancelled'];
const labStatusKeys = ['pending_send', 'sent_coordination', 'sent', 'in_production', 'ready_at_lab', 'received_clinic', 'delivered_coordination', 'delivered_patient', 'needs_adjustment', 'returned_lab', 'cancelled'];

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

async function listEntries(blobStore, prefix) {
  const entries = [];
  let cursor;
  for (let pageNo = 0; pageNo < 50; pageNo += 1) {
    const page = await blobStore.list({ prefix, ...(cursor ? { cursor } : {}) });
    const blobs = Array.isArray(page?.blobs) ? page.blobs : [];
    entries.push(...blobs.filter(entry => entry?.key).map(entry => ({ key: entry.key, etag: String(entry.etag || '') })));
    const next = page?.cursor || page?.nextCursor || '';
    if (!next || next === cursor || blobs.length === 0) break;
    cursor = next;
  }
  return entries;
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
    series.push({ date, appointments: 0, completed: 0, cancelled: 0, paymentRequests: 0, revenueCents: 0, paymentCount: 0, procedures: 0, labSent: 0 });
  }
  return series;
}

const cleanLabel = (value, max = 100) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const procedureKey = item => {
  const code = cleanLabel(item?.code, 60);
  return code && !['other', 'direct-lab-entry'].includes(code) ? `code:${code}` : `name:${cleanLabel(item?.name).toLocaleLowerCase('ar')}`;
};

function tally(map, key, name, code, amount, extra = {}) {
  if (!key || !name) return;
  const entry = map.get(key) || { key, name, code, count: 0, ...Object.fromEntries(Object.keys(extra).map(field => [field, 0])) };
  entry.count += amount;
  Object.entries(extra).forEach(([field, value]) => { entry[field] += value; });
  map.set(key, entry);
}

const topEntries = map => [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ar')).slice(0, TOP_LIMIT);
const inRange = (at, from, to) => {
  if (!(at > 0)) return false;
  const date = riyadhDate(at);
  return date >= from && date <= to;
};

function summarize({ records, clinics, from, to, clinicFilter, plans, labCases, communicationEvents = [], now = Date.now() }) {
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
    revenueCents: 0,
    paymentCount: 0,
    plans: 0,
    procedures: 0,
    treatedPatients: 0,
    labSent: 0,
    stayTotalMinutes: 0,
    stayMeasured: 0,
  }]));
  const payments = { requested: 0, acknowledged: 0, completed: 0, pending: 0, collectedCents: 0, transactionCount: 0 };
  const countedReceipts = new Set();
  const procedureMap = new Map();
  const typeMap = new Map();
  const clinicTypes = new Map();
  const treatedIdentities = new Set();
  const clinicTreated = new Map();
  const procedureTotals = { units: 0, lines: 0, freeUnits: 0, visitsWithProcedures: 0, completedWithoutProcedure: 0 };
  let appointments = 0;
  let delaysTotalMinutes = 0;
  let delaysMeasured = 0;
  let stayTotalMinutes = 0;
  let stayMeasured = 0;

  records.forEach(record => {
    const dailyItem = dailyMap.get(record.date);
    const clinicItem = clinicMetrics.get(record.clinicId);
    (Array.isArray(record.patients) ? record.patients : []).forEach(patient => {
      appointments += 1;
      identities.add(patientIdentity(patient));
      const status = statusKeys.includes(patient?.status) ? patient.status : 'waiting';
      statusCounts[status] += 1;
      const items = status === 'cancel' ? [] : (Array.isArray(patient?.paymentItems) ? patient.paymentItems : [])
        .filter(item => cleanLabel(item?.name));
      let visitUnits = 0;
      items.forEach(item => {
        const quantity = Math.max(1, Math.min(99, Math.round(numeric(item?.quantity) || 1)));
        visitUnits += quantity;
        procedureTotals.lines += 1;
        if (item?.free) procedureTotals.freeUnits += quantity;
        tally(procedureMap, procedureKey(item), cleanLabel(item.name), cleanLabel(item?.code, 60), quantity, { free: item?.free ? quantity : 0, visits: 1 });
        const type = procedureType(item?.code, item?.name);
        const typeEntry = typeMap.get(type) || { count: 0, visits: 0, free: 0, patients: new Set(), procedures: new Map() };
        typeEntry.count += quantity;
        typeEntry.visits += 1;
        if (item?.free) typeEntry.free += quantity;
        typeEntry.patients.add(patientIdentity(patient));
        tally(typeEntry.procedures, procedureKey(item), cleanLabel(item.name), cleanLabel(item?.code, 60), quantity);
        typeMap.set(type, typeEntry);
        if (!clinicTypes.has(record.clinicId)) clinicTypes.set(record.clinicId, {});
        const perClinic = clinicTypes.get(record.clinicId);
        perClinic[type] = (perClinic[type] || 0) + quantity;
      });
      procedureTotals.units += visitUnits;
      if (visitUnits) procedureTotals.visitsWithProcedures += 1;
      else if (status === 'done') procedureTotals.completedWithoutProcedure += 1;
      if (status === 'done' || visitUnits) {
        const identity = patientIdentity(patient);
        treatedIdentities.add(identity);
        if (!clinicTreated.has(record.clinicId)) clinicTreated.set(record.clinicId, new Set());
        clinicTreated.get(record.clinicId).add(identity);
      }
      if (dailyItem) dailyItem.procedures += visitUnits;
      if (clinicItem) clinicItem.procedures += visitUnits;
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
      (Array.isArray(patient?.paymentReceipts) ? patient.paymentReceipts : []).forEach(receipt => {
        const receiptId = String(receipt?.id || '').trim();
        const amountCents = Math.max(0, Math.round(numeric(receipt?.amountCents)));
        const paidAt = numeric(receipt?.paidAt);
        if (!receiptId || countedReceipts.has(receiptId) || !amountCents || !paidAt) return;
        const paidDate = riyadhDate(paidAt);
        if (paidDate < from || paidDate > to) return;
        countedReceipts.add(receiptId);
        payments.collectedCents += amountCents;
        payments.transactionCount += 1;
        const receiptDay = dailyMap.get(paidDate);
        if (receiptDay) {
          receiptDay.revenueCents += amountCents;
          receiptDay.paymentCount += 1;
        }
        if (clinicItem) {
          clinicItem.revenueCents += amountCents;
          clinicItem.paymentCount += 1;
        }
      });
      const arrivedAt = numeric(patient?.arrivedAt);
      const completedAt = numeric(patient?.completedAt || patient?.actualEndedAt);
      if (status === 'done' && arrivedAt > 0 && completedAt >= arrivedAt) {
        const stayMinutes = Math.round((completedAt - arrivedAt) / 60_000);
        if (stayMinutes >= 0) {
          stayTotalMinutes += stayMinutes;
          stayMeasured += 1;
          if (clinicItem) {
            clinicItem.stayTotalMinutes += stayMinutes;
            clinicItem.stayMeasured += 1;
          }
        }
      }
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

  const labWorkMap = new Map();
  const labVendorMap = new Map();
  const labTotals = { sent: 0, sentUnits: 0, received: 0, delivered: 0, overdue: 0, waitingToSend: 0, openNow: 0 };
  const labAttention = [];
  labCases.forEach(item => {
    if (clinicFilter !== 'all' && item.clinicId !== clinicFilter) return;
    const status = labStatusKeys.includes(item.status) ? item.status : 'pending_send';
    const units = Math.max(1, Math.min(99, Math.round(numeric(item.units) || 1)));
    // Snapshot of the current workload, independent of the date window.
    if (status !== 'cancelled' && status !== 'delivered_patient') labTotals.openNow += 1;
    if (status === 'pending_send' || status === 'sent_coordination') labTotals.waitingToSend += 1;
    const expectedAt = numeric(item.expectedAt);
    const overdue = expectedAt > 0 && expectedAt < now && !labClosedStatuses.has(status);
    const waiting = status === 'pending_send' || status === 'sent_coordination';
    if (overdue) labTotals.overdue += 1;
    if (overdue || waiting) {
      labAttention.push({
        id: cleanLabel(item.id, 100),
        reason: overdue ? 'overdue' : 'waiting',
        clinicId: cleanLabel(item.clinicId, 30),
        patientName: cleanLabel(item.patient?.name, 100),
        patientFile: cleanLabel(item.patient?.file, 50),
        labName: item.labName === 'other' ? cleanLabel(item.customLabName) || 'معمل آخر' : cleanLabel(item.labName),
        work: (Array.isArray(item.items) ? item.items : []).map(entry => cleanLabel(entry?.name, 60)).filter(Boolean).slice(0, 3).join('، '),
        units,
        status,
        expectedAt,
        sentAt: numeric(item.sentAt),
        createdAt: numeric(item.createdAt),
      });
    }

    if (inRange(numeric(item.createdAt || item.updatedAt), from, to)) labStatusCounts[status] += 1;
    const sentAt = numeric(item.sentAt);
    if (sentAt > 0 && status !== 'cancelled' && inRange(sentAt, from, to)) {
      labTotals.sent += 1;
      labTotals.sentUnits += units;
      const sentDay = dailyMap.get(riyadhDate(sentAt));
      if (sentDay) sentDay.labSent += 1;
      const clinicItem = clinicMetrics.get(item.clinicId);
      if (clinicItem) clinicItem.labSent += 1;
      const works = (Array.isArray(item.items) ? item.items : []).filter(entry => cleanLabel(entry?.name));
      if (works.length) works.forEach(entry => tally(labWorkMap, procedureKey(entry), cleanLabel(entry.name), cleanLabel(entry?.code, 60), Math.max(1, Math.round(numeric(entry?.quantity) || 1))));
      else tally(labWorkMap, 'name:unspecified', 'حالة معمل', '', units);
      const vendor = item.labName === 'other' ? cleanLabel(item.customLabName) || 'معمل آخر' : cleanLabel(item.labName) || 'غير محدد';
      tally(labVendorMap, `lab:${vendor.toLocaleLowerCase('ar')}`, vendor, '', 1, { units });
    }
    if (inRange(numeric(item.receivedAt), from, to)) labTotals.received += 1;
    if (inRange(numeric(item.deliveredAt), from, to)) labTotals.delivered += 1;
  });

  const communicationCounts = { planWhatsapp: 0, reviewWhatsapp: 0 };
  const countedCommunicationEvents = new Set();
  communicationEvents.forEach(event => {
    const kind = String(event?.kind || '');
    if (!['plan_whatsapp', 'review_whatsapp'].includes(kind)) return;
    if (clinicFilter !== 'all' && event?.clinicId !== clinicFilter) return;
    const at = numeric(event?.at);
    if (at <= 0) return;
    const eventDate = riyadhDate(at);
    if (eventDate < from || eventDate > to) return;
    const eventKey = String(event?.id || `${kind}:${event?.clinicId || ''}:${at}`);
    if (countedCommunicationEvents.has(eventKey)) return;
    countedCommunicationEvents.add(eventKey);
    communicationCounts[kind === 'plan_whatsapp' ? 'planWhatsapp' : 'reviewWhatsapp'] += 1;
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
      averageStayMinutes: stayMeasured ? Math.round(stayTotalMinutes / stayMeasured) : 0,
      stayMeasured,
      paymentPending: payments.pending,
      revenueCents: payments.collectedCents,
      paymentTransactionCount: payments.transactionCount,
      planTotal,
      labActive: labTotal - numeric(labStatusCounts.delivered_patient) - numeric(labStatusCounts.cancelled),
      reviewWhatsappShares: communicationCounts.reviewWhatsapp,
      treatedPatients: treatedIdentities.size,
      procedureUnits: procedureTotals.units,
      procedureLines: procedureTotals.lines,
      procedureFreeUnits: procedureTotals.freeUnits,
      visitsWithProcedures: procedureTotals.visitsWithProcedures,
      completedWithoutProcedure: procedureTotals.completedWithoutProcedure,
      labCreated: labTotal,
      labSent: labTotals.sent,
      labSentUnits: labTotals.sentUnits,
      labReceived: labTotals.received,
      labDelivered: labTotals.delivered,
      labOverdue: labTotals.overdue,
      labWaitingToSend: labTotals.waitingToSend,
      labOpenNow: labTotals.openNow,
    },
    topProcedures: topEntries(procedureMap),
    procedureTypes: PROCEDURE_TYPES.map(({ id, label, en }) => {
      const entry = typeMap.get(id);
      return entry ? {
        type: id, label, en,
        count: entry.count,
        visits: entry.visits,
        free: entry.free,
        patients: entry.patients.size,
        share: procedureTotals.units ? Math.round(entry.count / procedureTotals.units * 1000) / 10 : 0,
        procedures: topEntries(entry.procedures).slice(0, 8),
      } : null;
    }).filter(Boolean).sort((a, b) => b.count - a.count),
    labAttention: labAttention
      .sort((a, b) => (a.reason === b.reason ? 0 : a.reason === 'overdue' ? -1 : 1) || (a.expectedAt || a.createdAt) - (b.expectedAt || b.createdAt))
      .slice(0, 30),
    topLabWork: topEntries(labWorkMap),
    labVendors: topEntries(labVendorMap),
    statusCounts,
    planStatusCounts,
    paymentCounts: payments,
    labStatusCounts,
    communicationCounts,
    daily,
    clinics: [...clinicMetrics.values()].map(item => {
      const { stayTotalMinutes, stayMeasured, ...clinic } = item;
      return {
        ...clinic,
        treatedPatients: clinicTreated.get(clinic.clinicId)?.size || 0,
        procedureTypes: clinicTypes.get(clinic.clinicId) || {},
        stayMeasured,
        averageStayMinutes: stayMeasured ? Math.round(stayTotalMinutes / stayMeasured) : 0,
      };
    }).filter(item => clinicFilter === 'all' || item.clinicId === clinicFilter),
  };
}

function directDayKeys(clinics, from, to, clinicFilter) {
  const scoped = clinics.filter(clinic => clinicFilter === 'all' || clinic.id === clinicFilter);
  const days = daysBetween(from, to);
  // clinic-1 may hold both its legacy key and a scoped key, so budget two reads for it.
  if (!scoped.length || days * (scoped.length + 1) > DIRECT_KEY_LIMIT) return null;
  const keys = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    scoped.forEach(clinic => {
      if (clinic.id === 'clinic-1') keys.push(`days/${date}`);
      keys.push(`clinics/${clinic.id}/days/${date}`);
    });
  }
  return keys;
}

// ---- Monthly and all-time totals -------------------------------------------
// Each day blob is reduced to a small digest and cached per month, keyed by the
// blob etag, so only days that changed since the last request are read again.
const CACHE_VERSION = 4;
const shortHash = value => createHash('sha1').update(String(value)).digest('hex').slice(0, 12);
const monthOf = date => String(date).slice(0, 7);
const monthKeys = ['appointments', 'completed', 'cancelled', 'procedureUnits', 'visitsWithProcedures'];

function dayDigest(clinicId, date, patients) {
  const list = Array.isArray(patients) ? patients : [];
  const { summary } = summarize({ records: [{ clinicId, date, patients: list }], clinics: [], from: date, to: date, clinicFilter: 'all', plans: [], labCases: [] });
  const ids = new Set();
  const treated = new Set();
  list.forEach(patient => {
    const identity = shortHash(patientIdentity(patient));
    ids.add(identity);
    const status = statusKeys.includes(patient?.status) ? patient.status : 'waiting';
    const hasItems = status !== 'cancel' && (Array.isArray(patient?.paymentItems) ? patient.paymentItems : []).some(item => cleanLabel(item?.name));
    if (status === 'done' || hasItems) treated.add(identity);
  });
  const types = {};
  // Per-procedure counts for all-time totals: key -> [name, code, count].
  const procs = {};
  // Per patient: hash -> [name, file, units, visits]; per hour: [appointments, cancelled, units, completed, waitSum, waitN];
  // durations: [waitSum, waitN, treatSum, treatN, staySum, stayN]; per type: [treatSum, treatN, visits].
  const patientsOut = {};
  const hours = {};
  const dur = [0, 0, 0, 0, 0, 0];
  const typeDur = {};
  const minutesBetween = (start, end, max) => {
    const a = numeric(start), b = numeric(end);
    if (!(a > 0) || !(b >= a)) return null;
    const value = Math.round((b - a) / 60_000);
    return value <= max ? value : null;
  };
  list.forEach(patient => {
    const status = statusKeys.includes(patient?.status) ? patient.status : 'waiting';
    const hourMatch = /^(\d{1,2}):/.exec(String(patient?.start || ''));
    const hour = hourMatch ? Math.min(23, Number(hourMatch[1])) : (numeric(patient?.arrivedAt) > 0 ? new Date(numeric(patient.arrivedAt) + 3 * 3_600_000).getUTCHours() : -1);
    const slot = hour >= 0 ? (hours[hour] || (hours[hour] = [0, 0, 0, 0, 0, 0])) : null;
    if (slot) { slot[0] += 1; if (status === 'cancel') slot[1] += 1; if (status === 'done') slot[3] += 1; }
    if (status === 'cancel') return;
    let units = 0;
    const visitTypes = {};
    (Array.isArray(patient?.paymentItems) ? patient.paymentItems : []).forEach(item => {
      if (!cleanLabel(item?.name)) return;
      const quantity = Math.max(1, Math.min(99, Math.round(numeric(item?.quantity) || 1)));
      units += quantity;
      const type = procedureType(item?.code, item?.name);
      types[type] = (types[type] || 0) + quantity;
      visitTypes[type] = (visitTypes[type] || 0) + quantity;
      const key = procedureKey(item);
      const entry = procs[key] || [cleanLabel(item.name), cleanLabel(item?.code, 60), 0];
      entry[2] += quantity;
      procs[key] = entry;
    });
    if (slot) slot[2] += units;
    const wait = minutesBetween(patient?.arrivedAt, patient?.actualStartedAt, 300);
    const treat = minutesBetween(patient?.actualStartedAt, patient?.completedAt || patient?.actualEndedAt, 300);
    const stay = status === 'done' ? minutesBetween(patient?.arrivedAt, patient?.completedAt || patient?.actualEndedAt, 480) : null;
    if (wait !== null) { dur[0] += wait; dur[1] += 1; if (slot) { slot[4] += wait; slot[5] += 1; } }
    if (treat !== null) { dur[2] += treat; dur[3] += 1; }
    if (stay !== null) { dur[4] += stay; dur[5] += 1; }
    const primary = Object.entries(visitTypes).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (primary) {
      const entry = typeDur[primary] || (typeDur[primary] = [0, 0, 0]);
      entry[2] += 1;
      if (treat !== null) { entry[0] += treat; entry[1] += 1; }
    }
    if (units > 0 || status === 'done') {
      const id = shortHash(patientIdentity(patient));
      const entry = patientsOut[id] || [cleanLabel(patient?.name, 60), cleanLabel(patient?.file, 30), 0, 0];
      entry[2] += units;
      entry[3] += 1;
      patientsOut[id] = entry;
    }
  });
  return {
    clinicId,
    date,
    types,
    procs,
    patients: patientsOut,
    hours,
    dur,
    typeDur,
    ...Object.fromEntries(monthKeys.map(key => [key, numeric(summary[key])])),
    ids: [...ids],
    treated: [...treated],
  };
}

const emptyMonth = month => ({ month, ...Object.fromEntries(monthKeys.map(key => [key, 0])), uniquePatients: 0, treatedPatients: 0, labCreated: 0, labSent: 0, labSentUnits: 0, labDelivered: 0, types: {} });

function aggregateMonths({ digests, labCases, clinicFilter, currentMonth }) {
  const months = new Map();
  const ids = new Map();
  const treated = new Map();
  const allIds = new Set();
  const allTreated = new Set();
  const allProcs = new Map();
  const clinicTypes = {};
  let firstDate = '';
  const month = key => {
    if (!months.has(key)) { months.set(key, emptyMonth(key)); ids.set(key, new Set()); treated.set(key, new Set()); }
    return months.get(key);
  };
  digests.forEach(digest => {
    if (clinicFilter !== 'all' && digest.clinicId !== clinicFilter) return;
    const key = monthOf(digest.date);
    const item = month(key);
    monthKeys.forEach(field => { item[field] += numeric(digest[field]); });
    Object.entries(digest.types || {}).forEach(([type, count]) => {
      item.types[type] = (item.types[type] || 0) + numeric(count);
      const perClinic = clinicTypes[digest.clinicId] || (clinicTypes[digest.clinicId] = {});
      perClinic[type] = (perClinic[type] || 0) + numeric(count);
    });
    Object.entries(digest.procs || {}).forEach(([key, [name, code, count]]) => {
      const entry = allProcs.get(key) || { key, name, code, count: 0, type: procedureType(code, name) };
      entry.count += numeric(count);
      allProcs.set(key, entry);
    });
    if (numeric(digest.procedureUnits) > 0 && (!firstDate || digest.date < firstDate)) firstDate = digest.date;
    (digest.ids || []).forEach(id => { ids.get(key).add(id); allIds.add(id); });
    (digest.treated || []).forEach(id => { treated.get(key).add(id); allTreated.add(id); });
  });
  labCases.forEach(item => {
    if (clinicFilter !== 'all' && item.clinicId !== clinicFilter) return;
    const status = String(item.status || '');
    const created = numeric(item.createdAt || item.updatedAt);
    if (created > 0) month(monthOf(riyadhDate(created))).labCreated += 1;
    const sentAt = numeric(item.sentAt);
    if (sentAt > 0 && status !== 'cancelled') {
      const entry = month(monthOf(riyadhDate(sentAt)));
      entry.labSent += 1;
      entry.labSentUnits += Math.max(1, Math.min(99, Math.round(numeric(item.units) || 1)));
    }
    const deliveredAt = numeric(item.deliveredAt);
    if (deliveredAt > 0) month(monthOf(riyadhDate(deliveredAt))).labDelivered += 1;
  });
  month(currentMonth);
  // Fill gaps so the timeline has no missing months.
  const keys = [...months.keys()].sort();
  for (let cursor = keys[0]; cursor && cursor < currentMonth;) {
    const next = new Date(Date.UTC(Number(cursor.slice(0, 4)), Number(cursor.slice(5, 7)), 1)).toISOString().slice(0, 7);
    month(next);
    cursor = next;
  }
  const list = [...months.values()].sort((a, b) => b.month.localeCompare(a.month)).map(item => ({
    ...item,
    uniquePatients: ids.get(item.month).size,
    treatedPatients: treated.get(item.month).size,
    completionRate: item.appointments - item.cancelled > 0 ? Math.round(item.completed / (item.appointments - item.cancelled) * 100) : 0,
  }));
  const total = list.reduce((sum, item) => {
    [...monthKeys, 'labCreated', 'labSent', 'labSentUnits', 'labDelivered'].forEach(field => { sum[field] += item[field]; });
    return sum;
  }, emptyMonth('all'));
  total.types = list.reduce((sum, item) => { Object.entries(item.types).forEach(([type, count]) => { sum[type] = (sum[type] || 0) + count; }); return sum; }, {});
  total.uniquePatients = allIds.size;
  total.treatedPatients = allTreated.size;
  total.completionRate = total.appointments - total.cancelled > 0 ? Math.round(total.completed / (total.appointments - total.cancelled) * 100) : 0;
  total.firstMonth = list.length ? list[list.length - 1].month : currentMonth;
  total.firstDate = firstDate;
  const units = Object.values(total.types).reduce((sum, count) => sum + count, 0);
  total.typeList = PROCEDURE_TYPES.map(({ id, label, en }) => ({ type: id, label, en, count: total.types[id] || 0, share: units ? Math.round((total.types[id] || 0) / units * 1000) / 10 : 0 }))
    .filter(item => item.count).sort((a, b) => b.count - a.count);
  total.procedures = [...allProcs.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ar')).slice(0, 200);
  total.clinicTypes = clinicTypes;
  return { months: list, total };
}

async function cachedDigests({ dayStore, cacheStore, allowedClinics }) {
  const listed = new Map();
  (await Promise.all([listEntries(dayStore, 'days/'), listEntries(dayStore, 'clinics/')])).flat().forEach(entry => {
    const parsed = parseDayKey(entry.key);
    if (parsed && allowedClinics.has(parsed.clinicId)) listed.set(entry.key, { ...entry, ...parsed });
  });
  const byMonth = new Map();
  listed.forEach(entry => {
    const key = monthOf(entry.date);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(entry);
  });
  const digests = [];
  await mapLimited([...byMonth.entries()], async ([month, entries]) => {
    const cacheKey = `days/v${CACHE_VERSION}/${month}`;
    const cached = await cacheStore.get(cacheKey, { type: 'json', consistency: 'strong' }).catch(() => null);
    const saved = cached?.version === CACHE_VERSION && cached.entries && typeof cached.entries === 'object' ? cached.entries : {};
    const next = {};
    const stale = [];
    entries.forEach(entry => {
      const hit = saved[entry.key];
      if (hit && entry.etag && hit.etag === entry.etag) next[entry.key] = hit;
      else stale.push(entry);
    });
    const fresh = await mapLimited(stale, async entry => {
      const state = await dayStore.get(entry.key, { type: 'json', consistency: 'strong' });
      return [entry.key, { etag: entry.etag, ...dayDigest(entry.clinicId, entry.date, state?.patients) }];
    }, 16);
    fresh.forEach(([key, value]) => { next[key] = value; });
    const removed = Object.keys(saved).some(key => !next[key]);
    if (stale.length || removed) {
      await cacheStore.setJSON(cacheKey, { version: CACHE_VERSION, updatedAt: Date.now(), entries: next }).catch(error => console.warn('Statistics cache write failed', error));
    }
    digests.push(...Object.values(next));
  }, 6);
  return digests;
}

// ---- Comprehensive report over any date range (from the cached day digests) ----
const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const avg = (sum, count, digits = 1) => count ? Math.round(sum / count * 10 ** digits) / 10 ** digits : 0;

function buildInsights({ digests, clinicFilter, from, to }) {
  const selected = digests.filter(d => (clinicFilter === 'all' || d.clinicId === clinicFilter) && (!from || d.date >= from) && (!to || d.date <= to));
  const byDay = new Map();
  const byMonth = new Map();
  const procs = new Map();
  const patients = new Map();
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, appointments: 0, cancelled: 0, procedures: 0, completed: 0, waitSum: 0, waitN: 0 }));
  const weekdays = WEEKDAYS.map((name, index) => ({ index, name, days: 0, procedures: 0, appointments: 0, cancelled: 0, completed: 0 }));
  const types = {};
  const typeDur = {};
  const dur = [0, 0, 0, 0, 0, 0];
  const ids = new Set();
  let firstDate = '';
  let lastDate = '';
  selected.forEach(d => {
    const day = byDay.get(d.date) || { date: d.date, procedures: 0, appointments: 0, cancelled: 0, completed: 0, visits: 0 };
    day.procedures += numeric(d.procedureUnits);
    day.appointments += numeric(d.appointments);
    day.cancelled += numeric(d.cancelled);
    day.completed += numeric(d.completed);
    day.visits += numeric(d.visitsWithProcedures);
    byDay.set(d.date, day);
    (d.ids || []).forEach(id => ids.add(id));
    const monthKey = monthOf(d.date);
    const month = byMonth.get(monthKey) || { month: monthKey, procedures: 0, appointments: 0, cancelled: 0, completed: 0, procs: new Map(), types: {}, patients: new Set() };
    month.procedures += numeric(d.procedureUnits);
    month.appointments += numeric(d.appointments);
    month.cancelled += numeric(d.cancelled);
    month.completed += numeric(d.completed);
    (d.ids || []).forEach(id => month.patients.add(id));
    byMonth.set(monthKey, month);
    Object.entries(d.procs || {}).forEach(([key, [name, code, count]]) => {
      const total = procs.get(key) || { key, name, code, count: 0, type: procedureType(code, name) };
      total.count += numeric(count);
      procs.set(key, total);
      const monthly = month.procs.get(key) || { key, name, count: 0 };
      monthly.count += numeric(count);
      month.procs.set(key, monthly);
    });
    Object.entries(d.types || {}).forEach(([type, count]) => {
      types[type] = (types[type] || 0) + numeric(count);
      month.types[type] = (month.types[type] || 0) + numeric(count);
    });
    Object.entries(d.patients || {}).forEach(([id, [name, file, units, visits]]) => {
      const entry = patients.get(id) || { name, file, procedures: 0, visits: 0, lastDate: '' };
      entry.procedures += numeric(units);
      entry.visits += numeric(visits);
      if (d.date > entry.lastDate) { entry.lastDate = d.date; if (name) entry.name = name; if (file) entry.file = file; }
      patients.set(id, entry);
    });
    Object.entries(d.hours || {}).forEach(([hour, [appointments, cancelled, units, completed, waitSum, waitN]]) => {
      const slot = hours[Number(hour)];
      if (!slot) return;
      slot.appointments += numeric(appointments); slot.cancelled += numeric(cancelled); slot.procedures += numeric(units);
      slot.completed += numeric(completed); slot.waitSum += numeric(waitSum); slot.waitN += numeric(waitN);
    });
    (d.dur || []).forEach((value, index) => { dur[index] += numeric(value); });
    Object.entries(d.typeDur || {}).forEach(([type, [sum, count, visits]]) => {
      const entry = typeDur[type] || (typeDur[type] = [0, 0, 0]);
      entry[0] += numeric(sum); entry[1] += numeric(count); entry[2] += numeric(visits);
    });
    if (numeric(d.appointments) > 0) {
      if (!firstDate || d.date < firstDate) firstDate = d.date;
      if (!lastDate || d.date > lastDate) lastDate = d.date;
    }
  });
  const days = [...byDay.values()].filter(day => day.appointments > 0);
  days.forEach(day => {
    const weekday = weekdays[new Date(`${day.date}T00:00:00Z`).getUTCDay()];
    weekday.days += 1; weekday.procedures += day.procedures; weekday.appointments += day.appointments;
    weekday.cancelled += day.cancelled; weekday.completed += day.completed;
  });
  const totals = days.reduce((sum, day) => {
    sum.procedures += day.procedures; sum.appointments += day.appointments; sum.cancelled += day.cancelled;
    sum.completed += day.completed; sum.visits += day.visits;
    return sum;
  }, { procedures: 0, appointments: 0, cancelled: 0, completed: 0, visits: 0 });
  const monthsList = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  const activeMonths = monthsList.filter(m => m.appointments > 0).length;
  const units = Object.values(types).reduce((sum, count) => sum + count, 0);
  const hourList = hours.filter(slot => slot.appointments > 0).map(slot => ({
    hour: slot.hour, appointments: slot.appointments, cancelled: slot.cancelled, procedures: slot.procedures, completed: slot.completed,
    cancelRate: avg(slot.cancelled * 100, slot.appointments, 0), averageWaitMinutes: avg(slot.waitSum, slot.waitN, 0),
  }));
  const pick = (list, field, min = 1) => list.filter(item => numeric(item[field]) >= min).sort((a, b) => b[field] - a[field])[0] || null;
  const busiestCancelHour = hourList.filter(slot => slot.appointments >= 5).sort((a, b) => b.cancelRate - a.cancelRate || b.cancelled - a.cancelled)[0] || null;
  return {
    from: from || firstDate, to: to || lastDate, firstDate, lastDate,
    activeDays: days.length,
    activeMonths,
    totals: { ...totals, patients: ids.size, completionRate: avg(totals.completed * 100, totals.appointments - totals.cancelled, 0), cancelRate: avg(totals.cancelled * 100, totals.appointments, 0) },
    averages: {
      proceduresPerDay: avg(totals.procedures, days.length),
      appointmentsPerDay: avg(totals.appointments, days.length),
      completedPerDay: avg(totals.completed, days.length),
      patientsPerDay: avg([...byDay.values()].reduce((sum, day) => sum + day.completed, 0), days.length),
      proceduresPerMonth: avg(totals.procedures, activeMonths, 0),
      patientsPerMonth: avg(monthsList.reduce((sum, m) => sum + m.patients.size, 0), activeMonths, 0),
      proceduresPerVisit: avg(totals.procedures, totals.visits),
      proceduresPerPatient: avg(totals.procedures, ids.size),
      visitsPerPatient: avg([...patients.values()].reduce((sum, p) => sum + p.visits, 0), patients.size),
      waitMinutes: avg(dur[0], dur[1], 0), treatmentMinutes: avg(dur[2], dur[3], 0), stayMinutes: avg(dur[4], dur[5], 0),
      measured: { wait: dur[1], treatment: dur[3], stay: dur[5] },
    },
    months: monthsList.map(m => {
      const top = [...m.procs.values()].sort((a, b) => b.count - a.count)[0] || null;
      const topType = Object.entries(m.types).sort((a, b) => b[1] - a[1])[0] || null;
      return { month: m.month, procedures: m.procedures, appointments: m.appointments, cancelled: m.cancelled, completed: m.completed, patients: m.patients.size,
        topProcedure: top ? { name: top.name, count: top.count, share: avg(top.count * 100, m.procedures, 0) } : null,
        topType: topType ? { ...typeLabel(topType[0]), type: topType[0], count: topType[1] } : null };
    }),
    topPatients: [...patients.values()].filter(p => p.procedures > 0).sort((a, b) => b.procedures - a.procedures || b.visits - a.visits).slice(0, 10),
    topDays: [...days].sort((a, b) => b.procedures - a.procedures || b.completed - a.completed).slice(0, 5),
    busiestDay: pick(days, 'procedures'),
    weekdays: weekdays.filter(w => w.days > 0).map(w => ({ ...w, averageProcedures: avg(w.procedures, w.days), averageAppointments: avg(w.appointments, w.days), cancelRate: avg(w.cancelled * 100, w.appointments, 0) })),
    hours: hourList,
    peakProcedureHour: pick(hourList, 'procedures'),
    peakCancelHour: busiestCancelHour,
    typeList: PROCEDURE_TYPES.map(({ id, label, en }) => ({ type: id, label, en, count: types[id] || 0, share: units ? Math.round((types[id] || 0) / units * 1000) / 10 : 0,
      averageTreatmentMinutes: avg(typeDur[id]?.[0] || 0, typeDur[id]?.[1] || 0, 0), measured: typeDur[id]?.[1] || 0 })).filter(item => item.count).sort((a, b) => b.count - a.count),
    procedures: [...procs.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ar')).slice(0, 200),
  };
}

export const __test = {
  buildInsights,
  aggregateMonths,
  typeLabel,
  dayDigest,
  activeClinics,
  directDayKeys,
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
  const mode = String(url.searchParams.get('mode') || '');
  if (mode === 'insights') {
    if (clinicFilter !== 'all' && !clinicPattern.test(clinicFilter)) return reply({ error: 'Invalid clinic' }, 400);
    const rangeFrom = datePattern.test(url.searchParams.get('from') || '') ? url.searchParams.get('from') : '';
    const rangeTo = datePattern.test(url.searchParams.get('to') || '') ? url.searchParams.get('to') : '';
    if (rangeFrom && rangeTo && rangeFrom > rangeTo) return reply({ error: 'Invalid range' }, 400);
    const savedClinics = await store('clinic-dashboard-config').get('clinics', { type: 'json', consistency: 'strong' });
    const allClinics = activeClinics(savedClinics);
    const digests = await cachedDigests({ dayStore: store('clinic-dashboard-days'), cacheStore: store('clinic-statistics-cache'), allowedClinics: new Set(allClinics.map(clinic => clinic.id)) });
    return reply({ clinic: clinicFilter, generatedAt: Date.now(), ...buildInsights({ digests, clinicFilter, from: rangeFrom, to: rangeTo }) });
  }
  if (mode === 'months') {
    if (clinicFilter !== 'all' && !clinicPattern.test(clinicFilter)) return reply({ error: 'Invalid clinic' }, 400);
    const savedClinics = await store('clinic-dashboard-config').get('clinics', { type: 'json', consistency: 'strong' });
    const clinics = activeClinics(savedClinics).filter(clinic => clinicFilter === 'all' || clinic.id === clinicFilter);
    const labStore = store('clinic-lab-cases');
    const allClinics = activeClinics(savedClinics);
    const [digests, labRecords] = await Promise.all([
      cachedDigests({ dayStore: store('clinic-dashboard-days'), cacheStore: store('clinic-statistics-cache'), allowedClinics: new Set(allClinics.map(clinic => clinic.id)) }),
      Promise.all(clinics.map(clinic => labStore.get(`clinics/${clinic.id}`, { type: 'json', consistency: 'strong' }))),
    ]);
    const labCases = labRecords.flatMap(record => Array.isArray(record?.cases) ? record.cases : []);
    return reply({ clinic: clinicFilter, generatedAt: Date.now(), ...aggregateMonths({ digests, labCases, clinicFilter, currentMonth: monthOf(today) }) });
  }
  if (from > to || daysBetween(from, to) < 1 || daysBetween(from, to) > MAX_RANGE_DAYS) {
    return reply({ error: `Date range must be between 1 and ${MAX_RANGE_DAYS} days` }, 400);
  }
  if (clinicFilter !== 'all' && !clinicPattern.test(clinicFilter)) return reply({ error: 'Invalid clinic' }, 400);

  const configStore = store('clinic-dashboard-config');
  const dayStore = store('clinic-dashboard-days');
  const registryStore = store('clinic-treatment-plan-registry');
  const labStore = store('clinic-lab-cases');
  const communicationStore = store('clinic-patient-communications');
  const savedClinics = await configStore.get('clinics', { type: 'json', consistency: 'strong' });
  const clinics = activeClinics(savedClinics);
  const allowedClinics = new Set(clinics.map(clinic => clinic.id));

  // compare=1 returns the previous period of the same length from this same
  // invocation, so the counter needs one function call per refresh.
  const compare = url.searchParams.get('compare') === '1';
  // Default comparison: the same number of days right before the period.
  // pfrom/pto let the caller compare like with like (e.g. month-to-date
  // against the same days of last month).
  const explicitPrev = datePattern.test(url.searchParams.get('pfrom') || '') && datePattern.test(url.searchParams.get('pto') || '')
    && url.searchParams.get('pfrom') <= url.searchParams.get('pto') && url.searchParams.get('pto') < from
    && daysBetween(url.searchParams.get('pfrom'), url.searchParams.get('pto')) <= MAX_RANGE_DAYS;
  const prevTo = explicitPrev ? url.searchParams.get('pto') : addDays(from, -1);
  const prevFrom = explicitPrev ? url.searchParams.get('pfrom') : addDays(from, -daysBetween(from, to));
  const readFrom = compare ? prevFrom : from;
  const directKeys = directDayKeys(clinics, readFrom, to, clinicFilter);
  const [primaryKeys, scopedKeys, registry, labRecords, communicationRegistry] = await Promise.all([
    directKeys ? directKeys : clinicFilter === 'all' || clinicFilter === 'clinic-1' ? listKeys(dayStore, 'days/') : [],
    directKeys ? [] : clinicFilter === 'all' ? listKeys(dayStore, 'clinics/') : clinicFilter !== 'clinic-1' ? listKeys(dayStore, `clinics/${clinicFilter}/days/`) : [],
    registryStore.get('registry/global', { type: 'json', consistency: 'strong' }),
    Promise.all(
      clinics
        .filter(clinic => clinicFilter === 'all' || clinic.id === clinicFilter)
        .map(clinic => labStore.get(`clinics/${clinic.id}`, { type: 'json', consistency: 'strong' })),
    ),
    communicationStore.get('registry/global', { type: 'json', consistency: 'strong' }),
  ]);

  const dayKeys = [...new Set([...primaryKeys, ...scopedKeys])]
    .map(key => ({ key, ...parseDayKey(key) }))
    .filter(item => item.clinicId && allowedClinics.has(item.clinicId))
    .filter(item => clinicFilter === 'all' || item.clinicId === clinicFilter)
    .filter(item => item.date >= readFrom && item.date <= to);

  const records = (await mapLimited(dayKeys, async item => {
    const state = await dayStore.get(item.key, { type: 'json', consistency: 'strong' });
    if (!state) return null;
    return { clinicId: item.clinicId, date: item.date, patients: Array.isArray(state?.patients) ? state.patients : [] };
  })).filter(Boolean);

  const plans = Object.values(registry?.records && typeof registry.records === 'object' ? registry.records : {});
  const labCases = labRecords.flatMap(record => Array.isArray(record?.cases) ? record.cases : []);
  const communicationEvents = Object.values(communicationRegistry?.records && typeof communicationRegistry.records === 'object' ? communicationRegistry.records : {})
    .flatMap(record => Array.isArray(record?.events) ? record.events : []);
  const inWindow = (a, b) => records.filter(record => record.date >= a && record.date <= b);
  const result = summarize({ records: inWindow(from, to), clinics, from, to, clinicFilter, plans, labCases, communicationEvents });
  const previous = compare
    ? (() => {
      const prior = summarize({ records: inWindow(prevFrom, prevTo), clinics, from: prevFrom, to: prevTo, clinicFilter, plans, labCases, communicationEvents });
      return {
        from: prevFrom,
        to: prevTo,
        summary: prior.summary,
        clinics: prior.clinics.map(({ clinicId, appointments, completed, cancelled, procedures, treatedPatients, labSent, revenueCents }) => ({ clinicId, appointments, completed, cancelled, procedures, treatedPatients, labSent, revenueCents })),
        topProcedures: prior.topProcedures,
        procedureTypes: prior.procedureTypes.map(({ type, count, visits, patients }) => ({ type, count, visits, patients })),
      };
    })()
    : undefined;
  return reply({
    from,
    to,
    clinic: clinicFilter,
    generatedAt: Date.now(),
    ...result,
    ...(previous ? { previous } : {}),
  });
};
