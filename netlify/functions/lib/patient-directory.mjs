import { createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { normalizePatientNationalId, normalizePatientPhone, patientIdentityKeys } from './patient-identity.mjs';

const DIRECTORY_STORE = 'clinic-patient-directory';
const DIRECTORY_KEY = 'registry/global';
const MAX_RECORDS = 10000;
const MAX_RECENT_APPOINTMENTS = 24;
const cleanText = (value, max = 120) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const directoryStore = () => getStore({ name: DIRECTORY_STORE, consistency: 'strong' });

export const directoryPatient = value => ({
  id: cleanText(value?.id ?? value?.sourcePatientId, 100),
  fullName: cleanText(value?.fullName ?? value?.name, 120),
  fileNo: cleanText(value?.fileNo ?? value?.file, 40),
  mobile: normalizePatientPhone(value?.mobile ?? value?.phone),
  nationalId: normalizePatientNationalId(value?.nationalId)
});

const aliasesFor = value => patientIdentityKeys({
  file: value?.fileNo ?? value?.file,
  phone: value?.mobile ?? value?.phone,
  nationalId: value?.nationalId
});

const nameScore = value => {
  const name = cleanText(value, 120);
  return name ? name.split(/\s+/).filter(Boolean).length * 1000 + name.length : 0;
};

const preferValue = (current, incoming, { force = false, locked = false, name = false } = {}) => {
  const oldValue = cleanText(current, name ? 120 : 80);
  const nextValue = cleanText(incoming, name ? 120 : 80);
  if (!nextValue) return oldValue;
  if (force) return nextValue;
  if (locked && oldValue) return oldValue;
  if (!oldValue) return nextValue;
  if (name && nameScore(nextValue) > nameScore(oldValue)) return nextValue;
  return oldValue;
};

const appointmentSnapshot = (patient, meta = {}) => ({
  key: `${cleanText(meta.clinicId, 20)}|${cleanText(meta.date, 10)}|${cleanText(patient.id, 100)}`,
  clinicId: cleanText(meta.clinicId, 20),
  date: cleanText(meta.date, 10),
  patientId: cleanText(patient.id, 100),
  start: cleanText(patient.start, 8),
  end: cleanText(patient.end, 8),
  status: cleanText(patient.status, 30),
  procedure: cleanText(patient.procedure, 180),
  treatmentPlanStatus: cleanText(patient.treatmentPlanStatus, 30),
  paymentRequired: Boolean(patient.paymentRequired),
  paymentCompletedAt: Number(patient.paymentCompletedAt || 0),
  updatedAt: Number(meta.updatedAt || Date.now())
});

const mergeRecords = (target = {}, source = {}) => ({
  ...source,
  ...target,
  fullName: preferValue(target.fullName, source.fullName, { name: true, locked: target.lockedFields?.includes('fullName') }),
  fileNo: preferValue(target.fileNo, source.fileNo, { locked: target.lockedFields?.includes('fileNo') }),
  mobile: preferValue(target.mobile, source.mobile, { locked: target.lockedFields?.includes('mobile') }),
  nationalId: preferValue(target.nationalId, source.nationalId, { locked: target.lockedFields?.includes('nationalId') }),
  aliases: [...new Set([...(target.aliases || []), ...(source.aliases || [])])],
  clinicIds: [...new Set([...(target.clinicIds || []), ...(source.clinicIds || [])])],
  lockedFields: [...new Set([...(target.lockedFields || []), ...(source.lockedFields || [])])],
  recentAppointments: [...(target.recentAppointments || []), ...(source.recentAppointments || [])]
    .sort((a, b) => `${b.date || ''} ${b.start || ''}`.localeCompare(`${a.date || ''} ${a.start || ''}`))
    .filter((item, index, array) => array.findIndex(entry => entry.key === item.key) === index)
    .slice(0, MAX_RECENT_APPOINTMENTS),
  firstSeenAt: Math.min(...[target.firstSeenAt, source.firstSeenAt].map(Number).filter(value => value > 0), Date.now()),
  updatedAt: Math.max(Number(target.updatedAt || 0), Number(source.updatedAt || 0))
});

export async function getPatientDirectory() {
  return await directoryStore().get(DIRECTORY_KEY, { type: 'json', consistency: 'strong' }) || { records: {}, aliases: {}, revision: 0, updatedAt: 0 };
}

export async function upsertPatientDirectory(patients, meta = {}) {
  const list = Array.isArray(patients) ? patients : [];
  if (!list.length) return { changed: false, revision: 0 };
  const store = directoryStore();
  const registry = await getPatientDirectory();
  const records = { ...(registry.records || {}) };
  const aliases = { ...(registry.aliases || {}) };
  const batchUpdatedAt = Number(meta.updatedAt || Date.now());
  let changed = false;

  for (const source of list) {
    const patient = directoryPatient(source);
    const incomingAliases = aliasesFor(patient);
    if (!incomingAliases.length) continue;
    const linked = [...new Set(incomingAliases.map(alias => aliases[alias]).filter(Boolean))];
    const canonical = linked[0] || hash(incomingAliases.slice().sort()[0]);
    let existing = records[canonical] || {};
    for (const duplicate of linked.slice(1)) {
      existing = mergeRecords(existing, records[duplicate] || {});
      delete records[duplicate];
      Object.keys(aliases).forEach(alias => { if (aliases[alias] === duplicate) aliases[alias] = canonical; });
      changed = true;
    }
    const lockedFields = Array.isArray(existing.lockedFields) ? existing.lockedFields : [];
    const sourceUpdatedAt = Math.max(
      Number(source.recordUpdatedAt || 0), Number(source.adminUpdatedAt || 0), Number(source.statusUpdatedAt || 0),
      Number(source.treatmentPlanUpdatedAt || 0), Number(source.paymentRequestedAt || 0), Number(source.paymentAcknowledgedAt || 0),
      Number(source.paymentCompletedAt || 0), Number(source.completedAt || 0), Number(source.actualStartedAt || 0)
    );
    const recordUpdatedAt = sourceUpdatedAt || Number(existing.updatedAt || 0) || batchUpdatedAt;
    const clinicId = cleanText(meta.clinicId ?? source.clinicId, 20);
    const date = cleanText(meta.date ?? source.date, 10);
    const snapshot = date && clinicId ? appointmentSnapshot(source, { ...meta, clinicId, date, updatedAt: recordUpdatedAt }) : null;
    const recentAppointments = snapshot
      ? [snapshot, ...(existing.recentAppointments || []).filter(item => item.key !== snapshot.key)].slice(0, MAX_RECENT_APPOINTMENTS)
      : (existing.recentAppointments || []);
    const latest = recentAppointments[0] || {};
    const next = {
      ...existing,
      canonical,
      fullName: preferValue(existing.fullName, patient.fullName, { name: true, locked: lockedFields.includes('fullName') }),
      fileNo: preferValue(existing.fileNo, patient.fileNo, { locked: lockedFields.includes('fileNo') }),
      mobile: preferValue(existing.mobile, patient.mobile, { locked: lockedFields.includes('mobile') }),
      nationalId: preferValue(existing.nationalId, patient.nationalId, { locked: lockedFields.includes('nationalId') }),
      aliases: [...new Set([...(existing.aliases || []), ...incomingAliases])],
      clinicIds: [...new Set([...(existing.clinicIds || []), ...(clinicId ? [clinicId] : [])])],
      latestClinicId: latest.clinicId || existing.latestClinicId || clinicId,
      latestPatientId: latest.patientId || existing.latestPatientId || patient.id,
      lastAppointmentDate: latest.date || existing.lastAppointmentDate || date,
      latestStart: latest.start || existing.latestStart || cleanText(source.start, 8),
      latestStatus: latest.status || existing.latestStatus || cleanText(source.status, 30),
      latestProcedure: latest.procedure || existing.latestProcedure || cleanText(source.procedure, 180),
      treatmentPlanStatus: latest.treatmentPlanStatus || cleanText(source.treatmentPlanStatus, 30) || existing.treatmentPlanStatus || '',
      recentAppointments,
      firstSeenAt: Number(existing.firstSeenAt || recordUpdatedAt),
      lastSeenAt: Math.max(Number(existing.lastSeenAt || 0), recordUpdatedAt),
      updatedAt: recordUpdatedAt,
      updatedBy: cleanText(meta.actor, 120)
    };
    if (JSON.stringify(existing) !== JSON.stringify(next)) changed = true;
    records[canonical] = next;
    next.aliases.forEach(alias => { aliases[alias] = canonical; });
  }

  if (!changed) return { changed: false, revision: Number(registry.revision || 0) };
  const keep = Object.keys(records).sort((a, b) => Number(records[b]?.lastSeenAt || records[b]?.updatedAt || 0) - Number(records[a]?.lastSeenAt || records[a]?.updatedAt || 0)).slice(0, MAX_RECORDS);
  const allowed = new Set(keep);
  const nextRegistry = {
    records: Object.fromEntries(keep.map(canonical => [canonical, records[canonical]])),
    aliases: Object.fromEntries(Object.entries(aliases).filter(([, canonical]) => allowed.has(canonical))),
    revision: Number(registry.revision || 0) + 1,
    updatedAt: batchUpdatedAt
  };
  await store.setJSON(DIRECTORY_KEY, nextRegistry);
  return { changed: true, revision: nextRegistry.revision, records: nextRegistry.records };
}

export async function correctDirectoryPatient(lookupAliases, value, meta = {}) {
  const registry = await getPatientDirectory();
  const aliases = { ...(registry.aliases || {}) };
  const records = { ...(registry.records || {}) };
  const normalizedAliases = [...new Set((lookupAliases || []).filter(Boolean))];
  const patient = directoryPatient(value);
  const nextAliases = aliasesFor(patient);
  const canonical = normalizedAliases.map(alias => aliases[alias]).find(Boolean) || nextAliases.map(alias => aliases[alias]).find(Boolean) || hash((nextAliases[0] || normalizedAliases[0] || `manual:${Date.now()}`));
  const existing = records[canonical] || {};
  const now = Date.now();
  const next = {
    ...existing,
    canonical,
    fullName: preferValue(existing.fullName, patient.fullName, { force: true, name: true }),
    fileNo: preferValue(existing.fileNo, patient.fileNo, { force: true }),
    mobile: preferValue(existing.mobile, patient.mobile, { force: true }),
    nationalId: patient.nationalId || '',
    aliases: [...new Set([...(existing.aliases || []), ...normalizedAliases, ...nextAliases])],
    lockedFields: ['fullName', 'fileNo', 'mobile', 'nationalId'],
    updatedAt: now,
    lastSeenAt: Math.max(Number(existing.lastSeenAt || 0), now),
    correctedAt: now,
    updatedBy: cleanText(meta.actor, 120)
  };
  records[canonical] = next;
  next.aliases.forEach(alias => { aliases[alias] = canonical; });
  const nextRegistry = { records, aliases, revision: Number(registry.revision || 0) + 1, updatedAt: now };
  await directoryStore().setJSON(DIRECTORY_KEY, nextRegistry);
  return { canonical, record: next, revision: nextRegistry.revision };
}

export async function importPatientDirectory(values, meta = {}) {
  const input = Array.isArray(values) ? values.slice(0, 3000) : [];
  const registry = await getPatientDirectory();
  const aliases = { ...(registry.aliases || {}) };
  const records = { ...(registry.records || {}) };
  const now = Date.now();
  const result = { received: input.length, created: 0, updated: 0, skipped: 0, conflicts: 0, errors: [] };

  for (let index = 0; index < input.length; index += 1) {
    const patient = directoryPatient(input[index]);
    const identityAliases = aliasesFor(patient);
    const fullNameParts = patient.fullName.split(/\s+/).filter(Boolean);
    if (fullNameParts.length < 2 || !identityAliases.length) {
      result.skipped += 1;
      if (result.errors.length < 80) result.errors.push({ row: index + 2, reason: fullNameParts.length < 2 ? 'full_name_required' : 'identity_required' });
      continue;
    }
    const linked = [...new Set(identityAliases.map(alias => aliases[alias]).filter(Boolean))];
    if (linked.length > 1) {
      result.conflicts += 1;
      if (result.errors.length < 80) result.errors.push({ row: index + 2, reason: 'identity_conflict' });
      continue;
    }
    const canonical = linked[0] || hash(identityAliases.slice().sort()[0]);
    const existing = records[canonical] || {};
    const clinicId = cleanText(input[index]?.clinicId || meta.clinicId, 20);
    const next = {
      ...existing,
      canonical,
      id: existing.id || patient.id,
      fullName: patient.fullName,
      fileNo: existing.fileNo || patient.fileNo,
      mobile: existing.mobile || patient.mobile,
      nationalId: existing.nationalId || patient.nationalId,
      aliases: [...new Set([...(existing.aliases || []), ...identityAliases])],
      clinicIds: [...new Set([...(existing.clinicIds || []), ...(clinicId ? [clinicId] : [])])],
      latestClinicId: existing.latestClinicId || clinicId,
      latestPatientId: existing.latestPatientId || patient.id,
      lockedFields: [...new Set([...(existing.lockedFields || []), 'fullName'])],
      firstSeenAt: Number(existing.firstSeenAt || now),
      lastSeenAt: Math.max(Number(existing.lastSeenAt || 0), now),
      updatedAt: now,
      importedAt: now,
      updatedBy: cleanText(meta.actor, 120)
    };
    records[canonical] = next;
    next.aliases.forEach(alias => { aliases[alias] = canonical; });
    if (Object.keys(existing).length) result.updated += 1;
    else result.created += 1;
  }

  if (!result.created && !result.updated) return { ...result, revision: Number(registry.revision || 0), records: registry.records || {} };
  const keep = Object.keys(records).sort((left, right) => Number(records[right]?.lastSeenAt || records[right]?.updatedAt || 0) - Number(records[left]?.lastSeenAt || records[left]?.updatedAt || 0)).slice(0, MAX_RECORDS);
  const allowed = new Set(keep);
  const nextRegistry = {
    records: Object.fromEntries(keep.map(canonical => [canonical, records[canonical]])),
    aliases: Object.fromEntries(Object.entries(aliases).filter(([, canonical]) => allowed.has(canonical))),
    revision: Number(registry.revision || 0) + 1,
    updatedAt: now
  };
  await directoryStore().setJSON(DIRECTORY_KEY, nextRegistry);
  return { ...result, revision: nextRegistry.revision, records: nextRegistry.records };
}

export const __test = { directoryPatient, aliasesFor, nameScore, preferValue, appointmentSnapshot, mergeRecords };
