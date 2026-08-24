import { createHash } from 'node:crypto';
import { patientIdentityKeys } from './patient-identity.mjs';

const hash = value => createHash('sha256').update(String(value)).digest('hex');
const validClinic = value => /^clinic-([1-9]|1[0-5])$/.test(value || '');
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
const validPatientId = value => /^[a-zA-Z0-9._:-]{1,80}$/.test(value || '');
const cleanText = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const statuses = new Set(['draft', 'submitted', 'patient_accepted', 'approved', 'approved_signed', 'rejected', 'cancelled']);
const legacyPlanKey = (clinicId, date, patientId) => `clinics/${clinicId}/days/${date}/patients/${hash(patientId)}`;

const listKeys = async (blobStore, prefix, maxPages = 60) => {
  const keys = [];
  let cursor = '';
  for (let pageNo = 0; pageNo < maxPages; pageNo += 1) {
    const page = await blobStore.list({ prefix, ...(cursor ? { cursor } : {}) });
    const blobs = Array.isArray(page?.blobs) ? page.blobs : [];
    keys.push(...blobs.map(blob => blob.key).filter(Boolean));
    const next = page?.cursor || page?.nextCursor || '';
    if (!next || next === cursor || !blobs.length) break;
    cursor = next;
  }
  return keys;
};

const sourceFromKey = (key, clinicId) => {
  const escapedClinic = clinicId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const scoped = new RegExp(`^clinics/${escapedClinic}/days/(\\d{4}-\\d{2}-\\d{2})/patients/`).exec(key || '');
  if (scoped) return { clinicId, date: scoped[1] };
  if (clinicId === 'clinic-1') {
    const legacy = /^days\/(\d{4}-\d{2}-\d{2})\/patients\//.exec(key || '');
    if (legacy) return { clinicId, date: legacy[1] };
  }
  return null;
};

const candidateFromStored = (stored, key, requestedClinic) => {
  if (!stored?.plan || typeof stored.plan !== 'object') return null;
  const planClinic = validClinic(stored.clinicId) ? stored.clinicId : requestedClinic;
  if (planClinic !== requestedClinic) return null;
  const source = sourceFromKey(key, planClinic);
  const sourceDate = validDate(stored.date) ? stored.date : source?.date || '';
  const sourcePatientId = cleanText(stored.patientId, 100);
  if (!validDate(sourceDate) || !validPatientId(sourcePatientId)) return null;
  const meta = stored.plan.meta || {};
  const patient = stored.plan.patient || {};
  const updatedAt = Number(stored.updatedAt || 0) || Date.parse(meta.issuedAt || '') || 0;
  return {
    clinicId: planClinic,
    fullName: cleanText(patient.fullName, 120),
    fileNo: cleanText(patient.fileNo, 40),
    mobile: cleanText(patient.mobile, 20),
    nationalId: cleanText(patient.nationalId, 10),
    status: statuses.has(meta.status) ? meta.status : 'draft',
    rejectionReason: cleanText(meta.rejectionReason, 500),
    cancellationReason: cleanText(meta.cancellationReason, 500),
    cancelledAt: Number(meta.cancelledAt || 0),
    cancelledBy: cleanText(meta.cancelledBy, 120),
    planNo: cleanText(meta.planNo, 40),
    parentPlanNo: cleanText(meta.parentPlanNo, 40),
    relation: meta.relation === 'addendum' ? 'addendum' : 'standalone',
    sourcePatientId,
    sourceDate,
    patientAcceptedAt: Number(meta.patientAcceptedAt || 0),
    patientAcceptedBy: cleanText(meta.patientAcceptedBy, 120),
    approvedAt: Number(meta.approvedAt || 0),
    approvedBy: cleanText(meta.approvedBy, 120),
    updatedAt,
    updatedBy: cleanText(stored.updatedBy, 120),
    createdAt: Number(stored.createdAt || updatedAt || 0)
  };
};

const sameSource = (record, candidate) => record?.clinicId === candidate.clinicId
  && record?.sourcePatientId === candidate.sourcePatientId
  && record?.sourceDate === candidate.sourceDate;

const findCanonical = (records, candidate) => {
  const entries = Object.entries(records || {});
  if (candidate.planNo) {
    const exactPlan = entries.find(([, record]) => record?.clinicId === candidate.clinicId
      && record?.planNo === candidate.planNo
      && (!candidate.sourcePatientId || !candidate.sourceDate || sameSource(record, candidate)));
    if (exactPlan) return exactPlan[0];
  }
  const sourceMatch = entries.find(([, record]) => sameSource(record, candidate)
    && (!record?.planNo || !candidate.planNo || record.planNo === candidate.planNo));
  return sourceMatch?.[0] || '';
};

const uniqueCanonical = (records, candidate) => {
  const seed = `${candidate.clinicId}|${candidate.planNo}|${candidate.sourcePatientId}|${candidate.sourceDate}`;
  let canonical = `plan:${hash(seed)}`;
  let suffix = 0;
  while (records[canonical] && !sameSource(records[canonical], candidate)) {
    suffix += 1;
    canonical = `plan:${hash(`${seed}|${suffix}`)}`;
  }
  return canonical;
};

const mergeRecord = (existing, candidate) => {
  if (!existing) return candidate;
  const existingAt = Number(existing.updatedAt || 0);
  const candidateAt = Number(candidate.updatedAt || 0);
  const primary = candidateAt >= existingAt ? candidate : existing;
  const secondary = primary === candidate ? existing : candidate;
  const merged = { ...secondary, ...primary };
  ['fullName', 'fileNo', 'mobile', 'nationalId', 'planNo', 'sourcePatientId', 'sourceDate', 'parentPlanNo', 'relation', 'updatedBy'].forEach(field => {
    if (!String(merged[field] || '').trim() && String(secondary[field] || '').trim()) merged[field] = secondary[field];
  });
  merged.createdAt = Number(existing.createdAt || candidate.createdAt || candidateAt || Date.now());
  return merged;
};

const aliasesFor = record => patientIdentityKeys({
  fileNo: record?.fileNo,
  mobile: record?.mobile,
  nationalId: record?.nationalId
});

/**
 * Rebuilds missing registry entries from the existing per-appointment blobs.
 * This is intentionally opt-in and throttled so normal dashboard polling stays light.
 */
export async function hydrateTreatmentPlanRegistry({ registryStore, planStore, current = {}, clinicId, force = false }) {
  if (!validClinic(clinicId)) return current;
  const now = Date.now();
  const hydratedAt = Number(current.historyHydratedAtByClinic?.[clinicId] || 0);
  if (!force && hydratedAt && now - hydratedAt < 300_000) return current;

  const prefixes = [`clinics/${clinicId}/days/`, `clinics/${clinicId}/versions/`];
  if (clinicId === 'clinic-1') prefixes.push('days/');
  const listed = (await Promise.all(prefixes.map(prefix => listKeys(planStore, prefix)))).flat();
  const keys = [...new Set(listed)].slice(0, 10000);
  const records = { ...(current.records || {}) };
  const aliases = { ...(current.aliases || {}) };
  let changed = false;

  for (let index = 0; index < keys.length; index += 32) {
    const chunk = keys.slice(index, index + 32);
    const stored = await Promise.all(chunk.map(key => planStore.get(key, { type: 'json', consistency: 'strong' }).catch(() => null)));
    stored.forEach((item, itemIndex) => {
      const candidate = candidateFromStored(item, chunk[itemIndex], clinicId);
      if (!candidate) return;
      const canonical = findCanonical(records, candidate) || uniqueCanonical(records, candidate);
      const merged = mergeRecord(records[canonical], candidate);
      if (JSON.stringify(records[canonical] || null) !== JSON.stringify(merged)) changed = true;
      records[canonical] = merged;
      aliasesFor(merged).forEach(alias => {
        const previous = aliases[alias];
        const previousRecord = previous ? records[previous] : null;
        if (!previous || previous === canonical || Number(merged.updatedAt || 0) >= Number(previousRecord?.updatedAt || 0)) {
          if (aliases[alias] !== canonical) changed = true;
          aliases[alias] = canonical;
        }
      });
    });
  }

  const limitedKeys = Object.keys(records)
    .sort((left, right) => Number(records[right]?.updatedAt || 0) - Number(records[left]?.updatedAt || 0))
    .slice(0, 10_000);
  const limitedRecords = Object.fromEntries(limitedKeys.map(recordKey => [recordKey, records[recordKey]]));
  const allowed = new Set(limitedKeys);
  const limitedAliases = Object.fromEntries(Object.entries(aliases).filter(([, recordKey]) => allowed.has(recordKey)));
  const next = {
    ...current,
    records: limitedRecords,
    aliases: limitedAliases,
    historyHydratedAtByClinic: { ...(current.historyHydratedAtByClinic || {}), [clinicId]: now },
    revision: Number(current.revision || 0) + (changed ? 1 : 0),
    updatedAt: changed ? now : Number(current.updatedAt || 0)
  };
  await registryStore.setJSON('registry/global', next);
  return next;
}

export const __test = { candidateFromStored, findCanonical, mergeRecord, sameSource, aliasesFor };
