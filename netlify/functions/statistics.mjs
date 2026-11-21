import { createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { apiHeaders, requireUser } from './lib/session.mjs';

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
const CACHE_VERSION = 1;
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
  return {
    clinicId,
    date,
    ...Object.fromEntries(monthKeys.map(key => [key, numeric(summary[key])])),
    ids: [...ids],
    treated: [...treated],
  };
}

const emptyMonth = month => ({ month, ...Object.fromEntries(monthKeys.map(key => [key, 0])), uniquePatients: 0, treatedPatients: 0, labCreated: 0, labSent: 0, labSentUnits: 0, labDelivered: 0 });

function aggregateMonths({ digests, labCases, clinicFilter, currentMonth }) {
  const months = new Map();
  const ids = new Map();
  const treated = new Map();
  const allIds = new Set();
  const allTreated = new Set();
  const month = key => {
    if (!months.has(key)) { months.set(key, emptyMonth(key)); ids.set(key, new Set()); treated.set(key, new Set()); }
    return months.get(key);
  };
  digests.forEach(digest => {
    if (clinicFilter !== 'all' && digest.clinicId !== clinicFilter) return;
    const key = monthOf(digest.date);
    const item = month(key);
    monthKeys.forEach(field => { item[field] += numeric(digest[field]); });
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
  total.uniquePatients = allIds.size;
  total.treatedPatients = allTreated.size;
  total.completionRate = total.appointments - total.cancelled > 0 ? Math.round(total.completed / (total.appointments - total.cancelled) * 100) : 0;
  total.firstMonth = list.length ? list[list.length - 1].month : currentMonth;
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

export const __test = {
  aggregateMonths,
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
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(from, -daysBetween(from, to));
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
    ? { from: prevFrom, to: prevTo, summary: summarize({ records: inWindow(prevFrom, prevTo), clinics, from: prevFrom, to: prevTo, clinicFilter, plans, labCases, communicationEvents }).summary }
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
