import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
import { apiHeaders, canAccessClinic, requireUser, sameOriginRequest } from './lib/session.mjs';
import { isPlaceholderFileAlias, normalizePatientNationalId, normalizePatientPhone, patientIdentityKeys } from './lib/patient-identity.mjs';
import { hydrateTreatmentPlanRegistry } from './lib/treatment-plan-history.mjs';

const headers = apiHeaders('GET,POST,PUT,DELETE,OPTIONS');
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
const store = getStore({ name: 'clinic-treatment-plan-registry', consistency: 'strong' });
const planStore = getStore({ name: 'clinic-treatment-plans', consistency: 'strong' });
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const validClinic = value => /^clinic-([1-9]|1[0-5])$/.test(value || '');
const cleanText = (value, max = 120) => String(value ?? '').trim().slice(0, max);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
const validPatientId = value => /^[a-zA-Z0-9._:-]{1,80}$/.test(value || '');
const legacyPlanKey = (clinicId, date, patientId) => `clinics/${clinicId}/days/${date}/patients/${hash(patientId)}`;
const permanentPlanKey = (clinicId, identity) => `clinics/${clinicId}/patients/${hash(identity)}`;
const versionedPlanKey = (clinicId, date, patientId, planNo) => `clinics/${clinicId}/versions/${hash(`${date}|${patientId}|${planNo}`)}`;
const withoutPlaceholderAliases = aliases => Object.fromEntries(Object.entries(aliases || {}).filter(([alias]) => !isPlaceholderFileAlias(alias)));

export default async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET' && !sameOriginRequest(request)) return reply({ error: 'Invalid request origin' }, 403);
  const auth = await requireUser(request);
  if (!auth.ok) return reply({ error: auth.error }, auth.status);
  const user = auth.user;
  const url = new URL(request.url);
  const clinicId = url.searchParams.get('clinic') || 'clinic-1';
  if (!validClinic(clinicId)) return reply({ error: 'Invalid clinic' }, 400);
  if (!canAccessClinic(user, clinicId)) return reply({ error: 'Clinic access denied' }, 403);
  const key = 'registry/global';

  if (request.method === 'GET') {
    if (user.role !== 'admin') return reply({ error: 'Admin access required' }, 403);
    let data = await store.get(key, { type: 'json', consistency: 'strong' }) || {};
    if (url.searchParams.get('includeHistory') === '1') {
      data = await hydrateTreatmentPlanRegistry({ registryStore: store, planStore, current: data, clinicId });
    }
    return reply({
      clinicId,
      records: data?.records || {},
      aliases: withoutPlaceholderAliases(data?.aliases),
      revision: Number(data?.revision || 0),
      updatedAt: Number(data?.updatedAt || 0)
    });
  }

  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400); }
    const requestedKeys = [...new Set((Array.isArray(body?.keys) ? body.keys : [])
      .map(value => cleanText(value, 180))
      .filter(value => /^(file|phone|national):/.test(value) && !isPlaceholderFileAlias(value))
      .slice(0, 500))];
    if (!requestedKeys.length) return reply({ clinicId, records: {}, aliases: {}, revision: 0, updatedAt: 0 });
    const data = await store.get(key, { type: 'json', consistency: 'strong' }) || {};
    const records = {};
    const aliases = {};
    requestedKeys.forEach(alias => {
      const canonical = data.aliases?.[alias];
      if (!canonical || !data.records?.[canonical]) return;
      aliases[alias] = canonical;
      records[canonical] = data.records[canonical];
    });
    return reply({
      clinicId,
      records,
      aliases,
      revision: Number(data.revision || 0),
      updatedAt: Number(data.updatedAt || 0)
    });
  }

  if (request.method === 'PUT') {
    let body;
    try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400); }
    const status = ['draft', 'submitted', 'patient_accepted', 'approved', 'approved_signed', 'rejected', 'cancelled'].includes(body?.status) ? body.status : '';
    if (!status) return reply({ error: 'Invalid status' }, 400);
    if (['patient_accepted', 'approved', 'approved_signed', 'rejected', 'cancelled'].includes(status) && user.role !== 'admin') return reply({ error: 'Admin access required' }, 403);
    const keys = patientIdentityKeys(body?.patient);
    if (!keys.length) return reply({ error: 'Patient identity required' }, 400);

    const current = await store.get(key, { type: 'json', consistency: 'strong' }) || {};
    const records = current.records && typeof current.records === 'object' ? { ...current.records } : {};
    const aliases = withoutPlaceholderAliases(current.aliases && typeof current.aliases === 'object' ? current.aliases : {});
    const sourcePatientId = cleanText(body?.sourcePatientId, 100);
    const sourceDate = cleanText(body?.sourceDate, 10);
    const planNo = cleanText(body?.planNo, 40);
    const requestedCanonical = cleanText(body?.canonical, 180);
    const requestedRecord = requestedCanonical && records[requestedCanonical]?.clinicId === clinicId ? records[requestedCanonical] : null;
    const sameSourceRecord = candidate => candidate?.clinicId === clinicId
      && candidate?.sourcePatientId === sourcePatientId
      && candidate?.sourceDate === sourceDate;
    let canonical = requestedRecord ? requestedCanonical : '';
    if (!canonical && planNo) {
      canonical = Object.entries(records).find(([, candidate]) => candidate?.clinicId === clinicId
        && candidate?.planNo === planNo
        && (!sourcePatientId || !sourceDate || sameSourceRecord(candidate)))?.[0] || '';
    }
    if (!canonical && sourcePatientId && validDate(sourceDate)) {
      canonical = Object.entries(records).find(([, candidate]) => sameSourceRecord(candidate)
        && (!candidate?.planNo || !planNo || candidate.planNo === planNo))?.[0] || '';
    }
    if (!canonical) {
      const seed = `${clinicId}|${planNo}|${sourcePatientId}|${sourceDate}`;
      canonical = `plan:${hash(seed)}`;
      let suffix = 0;
      while (records[canonical]) {
        suffix += 1;
        canonical = `plan:${hash(`${seed}|${suffix}`)}`;
      }
    }
    const previous = records[canonical] || {};
    const now = Date.now();
    const record = {
      ...previous,
      canonical,
      clinicId,
      fullName: cleanText(body.patient?.fullName ?? body.patient?.name, 120) || previous.fullName || '',
      fileNo: cleanText(body.patient?.fileNo ?? body.patient?.file, 40) || previous.fileNo || '',
      mobile: normalizePatientPhone(body.patient?.mobile ?? body.patient?.phone) || previous.mobile || '',
      nationalId: normalizePatientNationalId(body.patient?.nationalId) || previous.nationalId || '',
      status,
      rejectionReason: status === 'rejected' ? cleanText(body?.rejectionReason, 500) : '',
      cancellationReason: status === 'cancelled' ? cleanText(body?.cancellationReason, 500) : '',
      cancelledAt: status === 'cancelled' ? Number(body?.cancelledAt || previous.cancelledAt || now) : 0,
      cancelledBy: status === 'cancelled' ? cleanText(body?.cancelledBy || previous.cancelledBy || user.displayName || user.username, 120) : '',
      planNo: planNo || previous.planNo || '',
      parentPlanNo: cleanText(body?.parentPlanNo, 40) || previous.parentPlanNo || '',
      relation: body?.relation === 'addendum' || previous.relation === 'addendum' ? 'addendum' : 'standalone',
      sourcePatientId: sourcePatientId || previous.sourcePatientId || '',
      sourceDate: sourceDate || previous.sourceDate || '',
      patientAcceptedAt: Number(body?.patientAcceptedAt ?? previous.patientAcceptedAt ?? 0),
      patientAcceptedBy: cleanText(body?.patientAcceptedBy, 120) || previous.patientAcceptedBy || '',
      approvedAt: Number(body?.approvedAt ?? previous.approvedAt ?? 0),
      approvedBy: cleanText(body?.approvedBy, 120) || previous.approvedBy || '',
      createdAt: Number(previous.createdAt || now),
      updatedAt: now,
      updatedBy: cleanText(user.displayName || user.username, 120)
    };
    records[canonical] = record;
    keys.forEach(alias => { aliases[alias] = canonical; });
    const limitedKeys = Object.keys(records).sort((a, b) => Number(records[b]?.updatedAt || 0) - Number(records[a]?.updatedAt || 0)).slice(0, 10000);
    const limitedRecords = Object.fromEntries(limitedKeys.map(recordKey => [recordKey, records[recordKey]]));
    const allowed = new Set(limitedKeys);
    const limitedAliases = Object.fromEntries(Object.entries(aliases).filter(([, recordKey]) => allowed.has(recordKey)));
    const result = {
      ...current,
      records: limitedRecords,
      aliases: limitedAliases,
      revision: Number(current.revision || 0) + 1,
      updatedAt: now
    };
    await store.setJSON(key, result);
    return reply({ ok: true, record, revision: result.revision, updatedAt: result.updatedAt });
  }

  if (request.method === 'DELETE') {
    if (user.role !== 'admin') return reply({ error: 'Admin access required' }, 403);
    let body;
    try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400); }
    const canonical = cleanText(body?.canonical, 180);
    if (!canonical) return reply({ error: 'Treatment plan reference required' }, 400);
    const current = await store.get(key, { type: 'json', consistency: 'strong' }) || {};
    const record = current.records?.[canonical];
    if (!record) return reply({ error: 'Treatment plan not found' }, 404);
    if (!validClinic(record.clinicId) || !canAccessClinic(user, record.clinicId)) return reply({ error: 'Clinic access denied' }, 403);
    const records = { ...(current.records || {}) };
    const aliases = withoutPlaceholderAliases(current.aliases);
    const linkedAliases = Object.entries(aliases).filter(([, target]) => target === canonical).map(([alias]) => alias);
    delete records[canonical];
    const replacement = Object.entries(records)
      .filter(([, candidate]) => candidate?.clinicId === record.clinicId
        && patientIdentityKeys(candidate).some(alias => linkedAliases.includes(alias)))
      .sort(([, left], [, right]) => Number(right?.updatedAt || 0) - Number(left?.updatedAt || 0))[0]?.[0] || '';
    linkedAliases.forEach(alias => {
      if (replacement) aliases[alias] = replacement;
      else delete aliases[alias];
    });
    const deletions = [];
    if (validDate(record.sourceDate) && validPatientId(record.sourcePatientId)) {
      const legacyKey = legacyPlanKey(record.clinicId, record.sourceDate, record.sourcePatientId);
      const legacy = await planStore.get(legacyKey, { type: 'json', consistency: 'strong' }).catch(() => null);
      if (!record.planNo || legacy?.plan?.meta?.planNo === record.planNo) deletions.push(planStore.delete(legacyKey));
      if (record.planNo) deletions.push(planStore.delete(versionedPlanKey(record.clinicId, record.sourceDate, record.sourcePatientId, record.planNo)));
    }
    // Permanent identity blobs represent the latest plan for a patient. Delete one
    // only when it is still the exact plan being removed; never remove a newer
    // addendum while deleting an older historical record.
    const identityAliases = patientIdentityKeys(record);
    const permanentEntries = await Promise.all(identityAliases.map(async alias => ({
      alias,
      value: await planStore.get(permanentPlanKey(record.clinicId, alias), { type: 'json', consistency: 'strong' }).catch(() => null)
    })));
    permanentEntries.filter(({ value }) => value?.plan?.meta?.planNo === record.planNo
      && (!record.sourcePatientId || value.patientId === record.sourcePatientId)
      && (!record.sourceDate || value.date === record.sourceDate))
      .forEach(({ alias }) => deletions.push(planStore.delete(permanentPlanKey(record.clinicId, alias))));
    await Promise.allSettled(deletions);
    const result = { ...current, records, aliases, revision: Number(current.revision || 0) + 1, updatedAt: Date.now() };
    await store.setJSON(key, result);
    return reply({ ok: true, deleted: canonical, revision: result.revision, updatedAt: result.updatedAt });
  }

  return reply({ error: 'Method not allowed' }, 405);
};
