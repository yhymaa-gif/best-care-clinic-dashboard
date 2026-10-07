import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
import { apiHeaders, canAccessClinic, requireUser, sameOriginRequest } from './lib/session.mjs';
import { getPatientDirectory } from './lib/patient-directory.mjs';
import { normalizePatientFile } from './lib/patient-identity.mjs';
import { ensureQuickPlanCostDraft, synchronizeQuickPlanCostDraft } from './lib/quick-plan-cost-bridge.mjs';
import { normalizeToothNumber, countQuickEntries, generateTreatmentPlanText, generateClinicalNote, generatePatientFileSummary, generateWhatsAppText, DRAFT_NOTICE } from '../../quick-plan-core.js';
import { DEFAULT_CATALOG_ITEMS, normalizeCatalogItems } from './treatment-catalog.mjs';

const headers = apiHeaders('GET,POST,PATCH,OPTIONS');
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
const store = () => getStore({ name: 'clinic-quick-treatment-plans', consistency: 'strong' });
const catalogStore = () => getStore({ name: 'clinic-treatment-catalog', consistency: 'strong' });
const validClinic = value => /^clinic-([1-9]|1[0-5])$/.test(value || '');
const clean = (value, max = 120) => String(value ?? '').trim().slice(0, max);
const sha = value => createHash('sha256').update(String(value)).digest('hex');
const planKey = (clinicId, id) => `clinics/${clinicId}/plans/${id}`;
const fields = ['chiefComplaint', 'diagnosis', 'clinicalFindings', 'radiographicFindings', 'clinicalNotes', 'specialConsiderations'];
const actorName = user => clean(user?.displayName || user?.username, 100);
const actorId = user => clean(user?.username, 100);
const normalizedName = value => clean(value, 120).replace(/\s+/g, ' ').toLocaleLowerCase();
const isVerifiedTreatingDentist = (user, storedAccount, clinicConfig, clinicId) => {
  const clinic = (Array.isArray(clinicConfig?.clinics) ? clinicConfig.clinics : []).find(item => item?.id === clinicId);
  return Boolean(user?.role === 'clinic' && user?.clinicId === clinicId
    && storedAccount?.role === 'clinic' && storedAccount?.clinicId === clinicId
    && storedAccount?.username === user.username
    && normalizedName(storedAccount?.displayName) === normalizedName(user.displayName)
    && normalizedName(clinic?.doctorName)
    && normalizedName(storedAccount?.displayName) === normalizedName(clinic.doctorName));
};
async function verifyTreatingDentist(user, clinicId) {
  if (user?.role !== 'clinic' || user?.clinicId !== clinicId || !user?.username) return false;
  const [account, config] = await Promise.all([
    getStore({ name: 'clinic-dashboard-auth-users', consistency: 'strong' }).get(`users/${user.username}`, { type: 'json', consistency: 'strong' }),
    getStore({ name: 'clinic-dashboard-config', consistency: 'strong' }).get('clinics', { type: 'json', consistency: 'strong' })
  ]);
  return isVerifiedTreatingDentist(user, account, config, clinicId);
}

async function loadCatalog(clinicId) {
  const record = await catalogStore().get(`catalog/${clinicId}`, { type: 'json', consistency: 'strong' });
  return Array.isArray(record?.items) && record.items.length ? normalizeCatalogItems(record.items) : DEFAULT_CATALOG_ITEMS;
}

function validateItems(source, catalog, numberingSystem) {
  if (!Array.isArray(source) || !source.length || source.length > 60) return { error: 'At least one procedure is required' };
  const byId = new Map((catalog || []).filter(item => item?.status !== 'inactive' && item?.active !== false).map(item => [item.id, item]));
  const items = [];
  for (const input of source) {
    const toothNumber = normalizeToothNumber(input?.toothNumber, numberingSystem);
    const item = byId.get(clean(input?.procedureId, 50));
    if (!toothNumber || !item) return { error: 'Invalid tooth or procedure; resolve all entries before submission' };
    items.push({
      toothNumber,
      procedureId: item.id,
      procedureCode: clean(item.code || item.id, 50),
      officialName: clean(item.name, 120),
      officialNameEn: clean(item.nameEn, 120),
      category: clean(item.category, 40),
      originalInput: clean(input?.originalInput, 200),
      matchState: ['exact', 'possible', 'manual'].includes(input?.matchState) ? input.matchState : 'manual'
    });
  }
  return { items };
}

async function resolvePatient(patientMrn, clinicId) {
  const directory = await getPatientDirectory();
  const canonical = directory.aliases?.[`file:${patientMrn}`];
  const patient = canonical ? directory.records?.[canonical] : null;
  const scoped = patient && (patient.latestClinicId === clinicId || patient.clinicIds?.includes(clinicId));
  return scoped ? { canonical, patient } : null;
}

async function linkCostedTreatmentPlan({ blobStore, key, quickPlan, catalog, patientRecord, user }) {
  const costPlan = await ensureQuickPlanCostDraft({ quickPlan, catalog, patientRecord, actor: actorName(user) });
  if (quickPlan.costPlan?.planNo === costPlan.planNo && quickPlan.costPlan?.registryCanonical) return quickPlan;
  const snapshot = await blobStore.getWithMetadata(key, { type: 'json', consistency: 'strong' });
  const current = snapshot?.data;
  if (!current || !snapshot.etag) throw new Error('Quick-plan revision token unavailable');
  if (current.costPlan?.planNo === costPlan.planNo && current.costPlan?.registryCanonical) return current;
  const now = Date.now();
  const linked = {
    ...current, costPlan, revision: Number(current.revision || 0) + 1, updatedAt: now,
    audit: [...(current.audit || []), { action: 'cost_plan_linked', at: now, by: actorName(user), userId: actorId(user), planNo: costPlan.planNo }]
  };
  const write = await blobStore.setJSON(key, linked, { onlyIfMatch: snapshot.etag });
  if (!write.modified) throw new Error('Concurrent quick-plan linkage conflict');
  return linked;
}

const clinicianData = body => Object.fromEntries(fields.map(key => [key, clean(body?.[key], 1000)]));
const outputLimits = { treatmentPlanText: 10000, clinicalNote: 10000, whatsappText: 4000 };
const cleanOutputOverrides = value => Object.fromEntries(Object.entries(outputLimits)
  .filter(([key]) => Object.hasOwn(value || {}, key))
  .map(([key, max]) => [key, clean(value[key], max).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')]));
const withDraftNotice = value => value.startsWith(DRAFT_NOTICE) ? value : `${DRAFT_NOTICE}\n\n${value}`;
const sourceDataChanged = (existing, nextItems, nextClinicianData) => JSON.stringify({
  items: (existing?.items || []).map(item => [item.toothNumber, item.procedureId]),
  clinicianData: existing?.clinicianData || {}
}) !== JSON.stringify({
  items: (nextItems || []).map(item => [item.toothNumber, item.procedureId]),
  clinicianData: nextClinicianData || {}
});
const generated = plan => ({
  treatmentPlanText: withDraftNotice(plan.outputOverrides?.treatmentPlanText || generateTreatmentPlanText(plan.items, plan.numberingSystem)),
  clinicalNote: withDraftNotice(plan.outputOverrides?.clinicalNote || generateClinicalNote(plan.items, plan.clinicianData, plan.numberingSystem, { name: plan.patientName, age: plan.patientAge, mrn: plan.patientMrn })),
  whatsappText: withDraftNotice(plan.outputOverrides?.whatsappText || generateWhatsAppText(plan.items, plan.numberingSystem)),
  patientFileSummaryAr: generatePatientFileSummary(plan.items, plan.numberingSystem, {
    name: plan.patientName, age: plan.patientAge, mrn: plan.patientMrn,
    examinationConfirmed: plan.documentationConfirmations?.examination === true,
    discussionConfirmed: plan.documentationConfirmations?.discussion === true
  }, 'ar'),
  patientFileSummaryEn: generatePatientFileSummary(plan.items, plan.numberingSystem, {
    name: plan.patientName, age: plan.patientAge, mrn: plan.patientMrn,
    examinationConfirmed: plan.documentationConfirmations?.examination === true,
    discussionConfirmed: plan.documentationConfirmations?.discussion === true
  }, 'en')
});

async function listPlans(clinicId) {
  const blobStore = store();
  const keys = [];
  let cursor;
  for (let pageNo = 0; pageNo < 20; pageNo++) {
    const page = await blobStore.list({ prefix: `clinics/${clinicId}/plans/`, ...(cursor ? { cursor } : {}) });
    const blobs = Array.isArray(page?.blobs) ? page.blobs : [];
    keys.push(...blobs.map(entry => entry.key).filter(Boolean));
    const next = page?.cursor || page?.nextCursor || '';
    if (!next || next === cursor || !blobs.length) break;
    cursor = next;
  }
  const records = await Promise.all(keys.slice(0, 1000).map(key => blobStore.get(key, { type: 'json', consistency: 'strong' }).catch(() => null)));
  return records.filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
}

export default async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (!['GET', 'POST', 'PATCH'].includes(request.method)) return reply({ error: 'Method not allowed' }, 405);
  if (request.method !== 'GET' && !sameOriginRequest(request)) return reply({ error: 'Invalid request origin' }, 403);
  const auth = await requireUser(request);
  if (!auth.ok) return reply({ error: auth.error }, auth.status);
  const user = auth.user;
  const url = new URL(request.url);
  let body = {};
  if (request.method !== 'GET') {
    try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400); }
  }
  const clinicId = clean(request.method === 'GET' ? url.searchParams.get('clinic') : body.clinicId, 30);
  if (!validClinic(clinicId)) return reply({ error: 'Invalid clinic' }, 400);
  if (!canAccessClinic(user, clinicId)) return reply({ error: 'Clinic access denied' }, 403);
  const blobStore = store();

  if (request.method === 'GET') {
    const id = clean(url.searchParams.get('id'), 64);
    if (id) {
      if (!/^[a-f0-9]{64}$/.test(id)) return reply({ error: 'Invalid plan ID' }, 400);
      const plan = await blobStore.get(planKey(clinicId, id), { type: 'json', consistency: 'strong' });
      return plan ? reply({ ok: true, plan }) : reply({ error: 'Plan not found' }, 404);
    }
    return reply({ ok: true, plans: await listPlans(clinicId) });
  }

  if (request.method === 'POST') {
    const patientMrn = normalizePatientFile(body.patientMrn);
    const idempotencyKey = clean(body.idempotencyKey, 100);
    const numberingSystem = ['universal', 'fdi'].includes(body.numberingSystem) ? body.numberingSystem : '';
    if (!patientMrn || !/^[a-zA-Z0-9._:-]{8,100}$/.test(idempotencyKey) || !numberingSystem) return reply({ error: 'MRN, idempotency key and numbering system required' }, 400);
    const patientRef = await resolvePatient(patientMrn, clinicId);
    if (!patientRef) return reply({ error: 'Patient MRN not found in clinic directory' }, 404);
    const catalog = await loadCatalog(clinicId);
    if (!catalog) return reply({ error: 'Procedure catalog unavailable' }, 503);
    const validated = validateItems(body.items, catalog, numberingSystem);
    if (validated.error) return reply({ error: validated.error }, 400);
    if (String(body.originalInput ?? '').length > 6000) return reply({ error: 'Original entry is too long' }, 400);
    const originalInput = clean(body.originalInput, 6000);
    if (!originalInput) return reply({ error: 'Original nurse entry required' }, 400);
    if (countQuickEntries(originalInput) > 60) return reply({ error: 'Too many procedure entries (maximum 60)' }, 400);
    const fingerprint = sha(JSON.stringify([
      clinicId, patientMrn, numberingSystem, originalInput, validated.items,
      body.examinationConfirmed === true, body.discussionConfirmed === true
    ]));
    const id = sha(`${clinicId}|${actorId(user)}|${idempotencyKey}`);
    const key = planKey(clinicId, id);
    const current = await blobStore.get(key, { type: 'json', consistency: 'strong' });
    if (current) {
      if (current.submissionFingerprint !== fingerprint) return reply({ error: 'Idempotency key already used for a different submission' }, 409);
      try {
        const linked = await linkCostedTreatmentPlan({ blobStore, key, quickPlan: current, catalog, patientRecord: patientRef.patient, user });
        return reply({ ok: true, plan: linked, costPlan: linked.costPlan, duplicate: true });
      } catch (error) {
        return reply({ error: 'Quick plan saved; costed treatment plan linkage is pending. Retry submission.', retryable: true, planId: current.id, detail: clean(error?.message, 200) }, 503);
      }
    }
    const now = Date.now();
    const plan = {
      id, clinicId, patientMrn, patientId: patientRef.canonical,
      patientName: clean(patientRef.patient.authoritativeFullName || patientRef.patient.fullName || body.patientName, 120),
      patientAge: Math.max(0, Math.min(120, Math.round(Number(body.patientAge) || 0))),
      treatingDentist: clean(body.treatingDentist, 120),
      numberingSystem, originalInput, originalParsedItems: structuredClone(validated.items),
      items: validated.items, clinicianData: {}, status: 'pending_review',
      documentationConfirmations: {
        examination: body.examinationConfirmed === true,
        discussion: body.discussionConfirmed === true
      },
      submittedBy: actorName(user), submittedByUserId: actorId(user), createdAt: now, updatedAt: now,
      modifiedBy: actorName(user), approvedBy: '', approvedAt: 0, revision: 1,
      submissionFingerprint: fingerprint,
      audit: [{
        action: 'submitted', at: now, by: actorName(user), userId: actorId(user),
        documentationConfirmations: {
          examination: body.examinationConfirmed === true,
          discussion: body.discussionConfirmed === true
        }
      }]
    };
    Object.assign(plan, generated(plan));
    const write = await blobStore.setJSON(key, plan, { onlyIfNew: true });
    if (write.modified) {
      try {
        const linked = await linkCostedTreatmentPlan({ blobStore, key, quickPlan: plan, catalog, patientRecord: patientRef.patient, user });
        return reply({ ok: true, plan: linked, costPlan: linked.costPlan }, 201);
      } catch (error) {
        return reply({ error: 'Quick plan saved; costed treatment plan linkage is pending. Retry submission.', retryable: true, planId: plan.id, detail: clean(error?.message, 200) }, 503);
      }
    }
    const winner = await blobStore.get(key, { type: 'json', consistency: 'strong' });
    if (winner?.submissionFingerprint !== fingerprint) return reply({ error: 'Concurrent submission conflict' }, 409);
    try {
      const linked = await linkCostedTreatmentPlan({ blobStore, key, quickPlan: winner, catalog, patientRecord: patientRef.patient, user });
      return reply({ ok: true, plan: linked, costPlan: linked.costPlan, duplicate: true });
    } catch (error) {
      return reply({ error: 'Quick plan saved; costed treatment plan linkage is pending. Retry submission.', retryable: true, planId: winner.id, detail: clean(error?.message, 200) }, 503);
    }
  }

  const id = clean(body.id, 64);
  if (!/^[a-f0-9]{64}$/.test(id)) return reply({ error: 'Invalid plan ID' }, 400);
  const key = planKey(clinicId, id);
  const snapshot = await blobStore.getWithMetadata(key, { type: 'json', consistency: 'strong' });
  const existing = snapshot?.data;
  if (!existing) return reply({ error: 'Plan not found' }, 404);
  if (!snapshot.etag) return reply({ error: 'Revision token unavailable' }, 503);
  if (Number(body.expectedRevision) !== existing.revision) return reply({ error: 'Revision conflict', revision: existing.revision }, 409);
  const action = body.action;
  if (!['update', 'approve', 'complete'].includes(action)) return reply({ error: 'Invalid action' }, 400);
  if (action === 'approve' && !await verifyTreatingDentist(user, clinicId)) return reply({ error: 'Verified treating dentist account required for approval' }, 403);
  if (action === 'complete' && user.role !== 'admin') return reply({ error: 'Admin access required to complete' }, 403);
  if (action === 'update' && existing.status !== 'pending_review') return reply({ error: 'Approved plans cannot be silently edited' }, 409);
  if (action === 'update' && body.clinicianData && user.role !== 'clinic') return reply({ error: 'Clinical note fields require a clinic clinician account' }, 403);
  if (action === 'update' && body.outputOverrides && user.role !== 'clinic') return reply({ error: 'Output editing requires a clinic clinician account' }, 403);
  if (action === 'approve' && existing.status !== 'pending_review') return reply({ error: 'Plan is not pending review' }, 409);
  if (action === 'complete' && existing.status !== 'approved') return reply({ error: 'Plan is not approved' }, 409);
  const now = Date.now();
  let linkedContentChanged = false;
  const plan = { ...existing, revision: existing.revision + 1, updatedAt: now, modifiedBy: actorName(user), audit: [...(existing.audit || [])] };
  if (action === 'update') {
    const catalog = await loadCatalog(clinicId);
    if (!catalog) return reply({ error: 'Procedure catalog unavailable' }, 503);
    const validated = validateItems(body.items, catalog, existing.numberingSystem);
    if (validated.error) return reply({ error: validated.error }, 400);
    const before = existing.items.map(item => ({ toothNumber: item.toothNumber, procedureId: item.procedureId }));
    const after = validated.items.map(item => ({ toothNumber: item.toothNumber, procedureId: item.procedureId }));
    const nextClinicianData = body.clinicianData ? clinicianData(body.clinicianData) : (existing.clinicianData || {});
    const sourcesChanged = sourceDataChanged(existing, validated.items, nextClinicianData);
    const requestedConfirmations = body.documentationConfirmations && typeof body.documentationConfirmations === 'object' ? body.documentationConfirmations : {};
    const nextConfirmations = {
      examination: Object.hasOwn(requestedConfirmations, 'examination') ? requestedConfirmations.examination === true : existing.documentationConfirmations?.examination === true,
      discussion: Object.hasOwn(requestedConfirmations, 'discussion') ? requestedConfirmations.discussion === true : existing.documentationConfirmations?.discussion === true
    };
    if (sourcesChanged && !Object.hasOwn(requestedConfirmations, 'discussion')) nextConfirmations.discussion = false;
    if (sourcesChanged && existing.documentationConfirmations?.discussion === true && nextConfirmations.discussion === false) {
      plan.audit.push({ action: 'discussion_confirmation_invalidated_after_plan_change', at: now, by: actorName(user), userId: actorId(user), previousRevision: existing.revision });
    }
    if (JSON.stringify(nextConfirmations) !== JSON.stringify(existing.documentationConfirmations || {})) {
      plan.audit.push({ action: 'documentation_confirmations_updated', at: now, by: actorName(user), userId: actorId(user), confirmations: nextConfirmations });
    }
    linkedContentChanged = sourcesChanged || JSON.stringify(nextConfirmations) !== JSON.stringify(existing.documentationConfirmations || {});
    if (JSON.stringify(before) !== JSON.stringify(after)) plan.audit.push({ action: 'items_corrected', at: now, by: actorName(user), userId: actorId(user), before, after });
    plan.items = validated.items;
    plan.clinicianData = nextClinicianData;
    plan.documentationConfirmations = nextConfirmations;
    if (sourcesChanged) {
      delete plan.outputOverrides;
      plan.audit.push({ action: 'outputs_regenerated_after_source_change', at: now, by: actorName(user), userId: actorId(user) });
    } else if (body.outputOverrides && typeof body.outputOverrides === 'object') {
      plan.outputOverrides = { ...(existing.outputOverrides || {}), ...cleanOutputOverrides(body.outputOverrides) };
      plan.audit.push({ action: 'output_edited', at: now, by: actorName(user), userId: actorId(user), fields: Object.keys(body.outputOverrides).filter(key => key in outputLimits) });
    }
  } else if (action === 'approve') {
    plan.status = 'approved';
    plan.approvedBy = actorName(user);
    plan.approvedByUserId = actorId(user);
    plan.approvedAt = now;
  } else plan.status = 'completed';
  plan.audit.push({ action, at: now, by: actorName(user), userId: actorId(user), revision: plan.revision });
  Object.assign(plan, generated(plan));
  const write = await blobStore.setJSON(key, plan, { onlyIfMatch: snapshot.etag });
  if (!write.modified) return reply({ error: 'Concurrent update conflict' }, 409);
  if (action === 'update' && linkedContentChanged) {
    try {
      const patientRef = await resolvePatient(existing.patientMrn, clinicId);
      if (!patientRef) throw new Error('Patient record unavailable for linked plan synchronization');
      const catalog = await loadCatalog(clinicId);
      await synchronizeQuickPlanCostDraft({ quickPlan: plan, previousQuickPlan: existing, catalog, patientRecord: patientRef.patient, user, actor: actorName(user) });
    } catch (error) {
      const latest = await blobStore.getWithMetadata(key, { type: 'json', consistency: 'strong' }).catch(() => null);
      if (latest?.etag && latest.data?.revision === plan.revision) await blobStore.setJSON(key, existing, { onlyIfMatch: latest.etag }).catch(() => null);
      return reply({ error: clean(error?.message || 'Linked costed plan synchronization failed', 240), costPlanConflict: true }, 409);
    }
  }
  return reply({ ok: true, plan });
};

export const __test = { validateItems, clinicianData, generated, cleanOutputOverrides, sourceDataChanged, isVerifiedTreatingDentist };
