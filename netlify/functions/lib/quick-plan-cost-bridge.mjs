import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
import { patientIdentityKeys } from './patient-identity.mjs';

const hash = value => createHash('sha256').update(String(value)).digest('hex');
const planStore = () => getStore({ name: 'clinic-treatment-plans', consistency: 'strong' });
const registryStore = () => getStore({ name: 'clinic-treatment-plan-registry', consistency: 'strong' });
const legacyPlanKey = (clinicId, date, patientId) => `clinics/${clinicId}/days/${date}/patients/${hash(patientId)}`;
const permanentPlanKey = (clinicId, identity) => `clinics/${clinicId}/patients/${hash(identity)}`;
const versionedPlanKey = (clinicId, date, patientId, planNo) => `clinics/${clinicId}/versions/${hash(`${date}|${patientId}|${planNo}`)}`;
const clean = (value, max = 120) => String(value ?? '').trim().slice(0, max);
const managedSyncValue = plan => ({
  phases: (plan?.phases || []).map(phase => ({
    kind: phase?.kind || '', title: phase?.title || '', deferred: Boolean(phase?.deferred),
    estimatedVisits: phase?.estimatedVisits || '', estimatedDuration: phase?.estimatedDuration || '',
    items: (phase?.items || []).map(item => ({
      code: item?.code || '', service: item?.service || '', variant: item?.variant || '', customService: item?.customService || '',
      teeth: item?.teeth || [], qty: Number(item?.qty || 0), unitPriceBefore: item?.unitPriceBefore ?? '', unitPriceAfter: item?.unitPriceAfter ?? '',
      beforePriceSource: item?.beforePriceSource || '', afterPriceSource: item?.afterPriceSource || '', priceSource: item?.priceSource || '',
      type: item?.type || '', includedWith: item?.includedWith || '', includedLabel: item?.includedLabel || ''
    }))
  })),
  clinicalNotes: clean(plan?.clinical?.notes, 2000)
});
const phaseSyncHash = plan => hash(JSON.stringify(managedSyncValue(plan)));
const fullPlanHash = plan => hash(JSON.stringify(plan || {}));
const quickPlanNote = quickPlan => clean(quickPlan?.patientFileSummaryAr || quickPlan?.clinicalNote, 2000);

const riyadhDate = value => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const part = type => parts.find(entry => entry.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

const phaseDefinitions = [
  { kind: 'initial', title: 'المعالجات الأولية' },
  { kind: 'implant', title: 'الجراحة والزراعة' },
  { kind: 'prosthetic', title: 'التركيبات' }
];
const phaseKind = value => ['initial', 'implant', 'prosthetic'].includes(value) ? value : 'initial';
const normalizedTooth = (value, numberingSystem) => {
  const raw = String(value || '').replace(/^#/, '').trim();
  if (numberingSystem === 'universal') {
    const number = Number(raw);
    return Number.isInteger(number) && number >= 1 && number <= 32 ? String(number).padStart(2, '0') : '';
  }
  return /^[1-4][1-8]$/.test(raw) ? raw : '';
};

function groupedPlanItems(quickPlan, catalog) {
  const byId = new Map((catalog || []).map(item => [item.id, item]));
  const grouped = new Map();
  for (const source of quickPlan.items || []) {
    const procedure = byId.get(source.procedureId);
    if (!procedure) continue;
    const kind = phaseKind(procedure.category);
    const key = `${kind}|${procedure.id}`;
    const current = grouped.get(key) || {
      code: procedure.id,
      service: clean(procedure.name, 160),
      variant: '', customService: '', teeth: [], qty: 0,
      unitPriceBefore: procedure.beforePrice === '' || procedure.beforePrice == null ? '' : Number(procedure.beforePrice),
      unitPriceAfter: (procedure.afterPrice ?? procedure.price) === '' || (procedure.afterPrice ?? procedure.price) == null ? '' : Number(procedure.afterPrice ?? procedure.price),
      beforePriceSource: procedure.beforePrice === '' || procedure.beforePrice == null ? '' : 'catalog',
      afterPriceSource: (procedure.afterPrice ?? procedure.price) === '' || (procedure.afterPrice ?? procedure.price) == null ? '' : 'catalog',
      priceSource: (procedure.afterPrice ?? procedure.price) === '' || (procedure.afterPrice ?? procedure.price) == null ? '' : 'catalog',
      type: 'billable', includedWith: '', includedLabel: '', kind
    };
    current.qty += 1;
    const tooth = normalizedTooth(source.toothNumber, quickPlan.numberingSystem);
    if (tooth && !current.teeth.includes(tooth)) current.teeth.push(tooth);
    grouped.set(key, current);
  }
  return [...grouped.values()];
}

export function buildQuickPlanCostDraft({ quickPlan, catalog, patientRecord = {}, actor = '' }) {
  const now = Number(quickPlan.createdAt || Date.now());
  const date = riyadhDate(now);
  const patientId = clean(quickPlan.patientId || `file:${quickPlan.patientMrn}`, 80).replace(/[^a-zA-Z0-9._:-]/g, '') || `file:${clean(quickPlan.patientMrn, 40)}`;
  const planNo = `TP-QP-${date.replaceAll('-', '')}-${String(quickPlan.id || '').slice(0, 8).toUpperCase()}`.slice(0, 40);
  const grouped = groupedPlanItems(quickPlan, catalog);
  const phases = phaseDefinitions.map((phase, index) => ({
    index, kind: phase.kind, title: phase.title, deferred: false, estimatedVisits: '', estimatedDuration: '',
    items: grouped.filter(item => item.kind === phase.kind).map(({ kind, ...item }) => item)
  }));
  const patient = {
    fullName: clean(patientRecord.authoritativeFullName || patientRecord.fullName || quickPlan.patientName, 120),
    fileNo: clean(patientRecord.fileNo || patientRecord.file || quickPlan.patientMrn, 40),
    nationalId: clean(patientRecord.nationalId, 10),
    nationality: ['saudi', 'non-saudi'].includes(patientRecord.nationality) ? patientRecord.nationality : 'unknown',
    age: Math.max(0, Math.min(120, Number(quickPlan.patientAge || patientRecord.age || 0))),
    mobile: clean(patientRecord.mobile || patientRecord.phone, 20)
  };
  const doctor = clean(quickPlan.treatingDentist, 120);
  const plan = {
    meta: {
      planNo, issuedAt: new Date(now).toISOString(), validityDays: 15, copyType: 'patient', revision: 1, status: 'draft', relation: 'standalone', parentPlanNo: '',
      doctorApprovedAt: 0, doctorApprovedBy: '', administrationPreparedAt: 0, administrationPreparedBy: '', submittedAt: 0,
      patientAcceptedAt: 0, patientAcceptedBy: '', approvedAt: 0, approvedBy: '', consentMethod: '', consentEvidenceId: '', consentVerifiedAt: 0,
      consentVerifiedBy: '', consentVerificationNote: '', consentPlanRevision: 0, consentVersion: 0, lastPrintedAt: 0,
      rejectedAt: 0, rejectedBy: '', rejectionReason: '', cancelledAt: 0, cancelledBy: '', cancellationReason: '',
      sourceType: 'quick_plan', sourceQuickPlanId: clean(quickPlan.id, 64), sourceQuickPlanRevision: Number(quickPlan.revision || 1),
      toothNumberingSystem: quickPlan.numberingSystem === 'universal' ? 'universal' : 'fdi'
    },
    clinic: { nameAr: 'عيادات أفضل عناية الاستشارية للأسنان', nameEn: 'Best Care Dental Clinics', city: 'أبها', address: '', phone: '' },
    patient,
    doctor: { name: doctor, scfhsNo: '', specialty: 'طب وإصلاح الأسنان', explainedBy: doctor },
    clinical: { diagnosis: '', radiographs: '', notes: quickPlanNote(quickPlan) },
    phases, alternatives: '', noTreatment: '', risks: '',
    financial: { vatMode: 'unconfirmed', vatConfirmed: false, paymentPlan: [] },
    consent: { photoConsent: true, photoConsentRecorded: false, photoConsentDefaultVersion: 2, photoConsentAcceptedAt: 0, termsVersion: 0 },
    signatures: { patientSignature: '', signerName: patient.fullName, guardianRelation: '', doctorName: doctor, doctorSignedAt: '', witnessName: '', witnessSignedAt: '' }
  };
  plan.meta.sourceQuickPlanSyncHash = phaseSyncHash(plan);
  return { clinicId: quickPlan.clinicId, patientId, date, plan, actor: clean(actor, 120) };
}

export async function synchronizeQuickPlanCostDraft(input, dependencies = {}) {
  const draft = buildQuickPlanCostDraft(input), targetStore = dependencies.planBlobStore || planStore();
  const key = versionedPlanKey(draft.clinicId, draft.date, draft.patientId, draft.plan.meta.planNo);
  const snapshot = await targetStore.getWithMetadata(key, { type: 'json', consistency: 'strong' });
  const current = snapshot?.data;
  if (!current?.plan || !snapshot?.etag) throw new Error('Linked costed treatment plan is unavailable');
  if (current.plan.meta?.sourceQuickPlanId !== draft.plan.meta.sourceQuickPlanId) throw new Error('Linked costed treatment plan identity conflict');
  if (current.plan.meta?.status !== 'draft') throw new Error('The linked costed plan has already entered its approval workflow; edit it directly');
  const requestedRevision = Math.max(1, Number(input.quickPlan?.revision || 1));
  const currentSourceRevision = Math.max(1, Number(current.plan.meta?.sourceQuickPlanRevision || 1));
  if (requestedRevision < currentSourceRevision) throw new Error('A newer Quick Plan revision is already linked; reload before editing');
  const desiredManagedHash = phaseSyncHash(draft.plan);
  if (requestedRevision === currentSourceRevision) {
    if (phaseSyncHash(current.plan) !== desiredManagedHash) throw new Error('Quick Plan revision conflict; reload before editing');
    await synchronizeLinkedPointers(targetStore, draft, current, current);
    return {
      planNo: current.plan.meta.planNo, patientId: draft.patientId, date: draft.date, clinicId: draft.clinicId,
      status: current.plan.meta.status, sourceQuickPlanId: current.plan.meta.sourceQuickPlanId
    };
  }
  const previousQuickPlan = input.previousQuickPlan;
  const storedHash = String(current.plan.meta?.sourceQuickPlanSyncHash || '');
  const currentManagedHash = phaseSyncHash(current.plan);
  if (storedHash && currentManagedHash !== storedHash) throw new Error('The linked costed plan was edited separately; open it directly to continue');
  let previousManagedHashes = null;
  if (previousQuickPlan) {
    const previousDraft = buildQuickPlanCostDraft({ ...input, quickPlan: previousQuickPlan });
    previousManagedHashes = new Set([phaseSyncHash(previousDraft.plan)]);
    const legacyClinicalDraft = structuredClone(previousDraft.plan);
    legacyClinicalDraft.clinical.notes = clean(previousQuickPlan.clinicalNote, 2000);
    previousManagedHashes.add(phaseSyncHash(legacyClinicalDraft));
    if (!previousManagedHashes.has(currentManagedHash)) throw new Error('Quick Plan and costed-plan content are out of sequence; reload before editing');
  }
  if (!storedHash) {
    if (!previousManagedHashes) throw new Error('This earlier linked plan must be opened directly before it can be updated');
  }
  const nextPlan = {
    ...current.plan,
    phases: draft.plan.phases,
    clinical: { ...(current.plan.clinical || {}), notes: quickPlanNote(input.quickPlan) },
    meta: {
      ...(current.plan.meta || {}),
      revision: Math.max(1, Number(current.plan.meta?.revision || 1) + 1),
      sourceQuickPlanRevision: requestedRevision,
      sourceQuickPlanPreviousPlanHash: fullPlanHash(current.plan),
      lastPrintedAt: 0
    }
  };
  nextPlan.meta.sourceQuickPlanSyncHash = phaseSyncHash(nextPlan);
  const nextRecord = { ...current, plan: nextPlan, revision: Number(current.revision || 0) + 1, updatedAt: Date.now(), updatedBy: draft.actor };
  const write = await targetStore.setJSON(key, nextRecord, { onlyIfMatch: snapshot.etag });
  if (!write.modified) throw new Error('Concurrent costed treatment-plan update conflict');
  await synchronizeLinkedPointers(targetStore, draft, current, nextRecord);
  return {
    planNo: nextPlan.meta.planNo, patientId: draft.patientId, date: draft.date, clinicId: draft.clinicId,
    status: nextPlan.meta.status, sourceQuickPlanId: nextPlan.meta.sourceQuickPlanId
  };
}

async function synchronizePointer(store, key, previousRecord, nextRecord) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const snapshot = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    const pointer = snapshot?.data;
    if (!pointer) {
      const write = await store.setJSON(key, nextRecord, { onlyIfNew: true });
      if (write.modified) return;
      continue;
    }
    if (pointer.plan?.meta?.planNo !== nextRecord.plan.meta.planNo) return;
    if (fullPlanHash(pointer.plan) === fullPlanHash(nextRecord.plan)) return;
    const allowedPreviousHash = String(nextRecord.plan.meta?.sourceQuickPlanPreviousPlanHash || fullPlanHash(previousRecord.plan));
    if (fullPlanHash(pointer.plan) !== allowedPreviousHash) throw new Error('A linked treatment-plan index was edited separately; open the costed plan directly');
    const write = await store.setJSON(key, nextRecord, { onlyIfMatch: snapshot.etag });
    if (write.modified) return;
  }
  throw new Error('Concurrent linked treatment-plan index update conflict');
}

async function synchronizeLinkedPointers(store, draft, previousRecord, nextRecord) {
  await synchronizePointer(store, legacyPlanKey(draft.clinicId, draft.date, draft.patientId), previousRecord, nextRecord);
  for (const identity of patientIdentityKeys(nextRecord.plan.patient)) {
    await synchronizePointer(store, permanentPlanKey(draft.clinicId, identity), previousRecord, nextRecord);
  }
}

async function ensureCurrentRecord(store, key, authoritative, draft) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const snapshot = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    const current = snapshot?.data;
    if (current?.plan?.meta?.planNo === authoritative.plan.meta.planNo) return;
    if (current?.plan?.meta?.planNo) {
      const archiveKey = versionedPlanKey(draft.clinicId, current.date || draft.date, current.patientId || draft.patientId, current.plan.meta.planNo);
      await store.setJSON(archiveKey, current, { onlyIfNew: true });
      if (Number(current.updatedAt || 0) > Number(authoritative.updatedAt || 0)) return;
    }
    const write = await store.setJSON(key, authoritative, snapshot?.etag ? { onlyIfMatch: snapshot.etag } : { onlyIfNew: true });
    if (write.modified) return;
  }
  throw new Error('Concurrent costed treatment-plan update conflict');
}

async function ensurePermanentRecords(store, draft, authoritative) {
  for (const identity of patientIdentityKeys(authoritative.plan.patient)) {
    const key = permanentPlanKey(draft.clinicId, identity);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const snapshot = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
      const current = snapshot?.data;
      if (current?.plan?.meta?.planNo === authoritative.plan.meta.planNo) break;
      if (current && Number(current.updatedAt || 0) > Number(authoritative.updatedAt || 0)) break;
      const write = await store.setJSON(key, authoritative, snapshot?.etag ? { onlyIfMatch: snapshot.etag } : { onlyIfNew: true });
      if (write.modified) break;
      if (attempt === 4) throw new Error('Concurrent permanent treatment-plan index conflict');
    }
  }
}

async function saveCurrentPlan(draft, store = planStore()) {
  const key = legacyPlanKey(draft.clinicId, draft.date, draft.patientId);
  const versionKey = versionedPlanKey(draft.clinicId, draft.date, draft.patientId, draft.plan.meta.planNo);
  let authoritative = await store.get(versionKey, { type: 'json', consistency: 'strong' });
  if (authoritative && authoritative?.plan?.meta?.sourceQuickPlanId !== draft.plan.meta.sourceQuickPlanId) throw new Error('Costed treatment-plan number conflict');
  if (!authoritative) {
    const record = { patientId: draft.patientId, clinicId: draft.clinicId, date: draft.date, plan: draft.plan, revision: 1, updatedAt: Date.now(), updatedBy: draft.actor };
    const versionWrite = await store.setJSON(versionKey, record, { onlyIfNew: true });
    authoritative = versionWrite.modified ? record : await store.get(versionKey, { type: 'json', consistency: 'strong' });
    if (authoritative?.plan?.meta?.sourceQuickPlanId !== draft.plan.meta.sourceQuickPlanId) throw new Error('Costed treatment-plan number conflict');
  }
  await ensureCurrentRecord(store, key, authoritative, draft);
  await ensurePermanentRecords(store, draft, authoritative);
  return authoritative;
}

async function indexPlan(draft, record, store = registryStore()) {
  const key = 'registry/global';
  const plan = record.plan, patient = plan.patient;
  const aliasesToAdd = patientIdentityKeys(patient);
  const canonical = `plan:${hash(`${draft.clinicId}|${plan.meta.planNo}|${draft.patientId}|${draft.date}`)}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const snapshot = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    const current = snapshot?.data || {}, records = { ...(current.records || {}) }, aliases = { ...(current.aliases || {}) }, now = Date.now();
    const previous = records[canonical] || {};
    const recordOrderTime = value => Number(new Date(value?.plan?.meta?.issuedAt || value?.sourceIssuedAt || value?.createdAt || value?.updatedAt || 0)) || Number(value?.createdAt || value?.updatedAt || 0);
    if (previous.canonical) {
      let aliasesChanged = false;
      for (const alias of aliasesToAdd) {
        const currentCanonical = aliases[alias];
        const currentTarget = records[currentCanonical];
        if (!currentCanonical || currentCanonical === canonical || recordOrderTime(record) > recordOrderTime(currentTarget)) {
          if (currentCanonical !== canonical) { aliases[alias] = canonical; aliasesChanged = true; }
        }
      }
      if (!aliasesChanged) return previous;
      const next = { ...current, records, aliases, revision: Number(current.revision || 0) + 1, updatedAt: now };
      const write = await store.setJSON(key, next, snapshot?.etag ? { onlyIfMatch: snapshot.etag } : { onlyIfNew: true });
      if (write.modified) return previous;
      continue;
    }
    records[canonical] = {
      canonical, clinicId: draft.clinicId, fullName: patient.fullName, fileNo: patient.fileNo, mobile: patient.mobile, nationalId: patient.nationalId,
      status: plan.meta.status || 'draft', rejectionReason: '', cancellationReason: '', cancelledAt: 0, cancelledBy: '',
      planNo: plan.meta.planNo, parentPlanNo: '', relation: 'standalone', sourceType: 'quick_plan', sourceQuickPlanId: plan.meta.sourceQuickPlanId,
      sourceIssuedAt: plan.meta.issuedAt,
      preparedByRole: '', administrationPreparedAt: 0, administrationPreparedBy: '', sourcePatientId: draft.patientId, sourceDate: draft.date,
      patientAcceptedAt: Number(plan.meta.patientAcceptedAt || 0), patientAcceptedBy: plan.meta.patientAcceptedBy || '', approvedAt: Number(plan.meta.approvedAt || 0), approvedBy: plan.meta.approvedBy || '',
      consentMethod: plan.meta.consentMethod || '', consentEvidenceId: plan.meta.consentEvidenceId || '', consentVerifiedAt: Number(plan.meta.consentVerifiedAt || 0),
      consentVerifiedBy: plan.meta.consentVerifiedBy || '', consentVerificationNote: plan.meta.consentVerificationNote || '', photoConsent: Boolean(plan.consent?.photoConsent),
      photoConsentRecorded: Boolean(plan.consent?.photoConsentRecorded), consentTermsVersion: Number(plan.consent?.termsVersion || 0), lastPrintedAt: Number(plan.meta.lastPrintedAt || 0),
      createdAt: Number(previous.createdAt || record.updatedAt),
      ...previous,
      canonical, clinicId: draft.clinicId, fullName: patient.fullName, fileNo: patient.fileNo, mobile: patient.mobile, nationalId: patient.nationalId,
      planNo: plan.meta.planNo, sourceType: 'quick_plan', sourceQuickPlanId: plan.meta.sourceQuickPlanId, sourceIssuedAt: plan.meta.issuedAt, sourcePatientId: draft.patientId, sourceDate: draft.date,
      updatedAt: now, updatedBy: draft.actor
    };
    aliasesToAdd.forEach(alias => {
      const target = records[aliases[alias]];
      if (!target || recordOrderTime(record) >= recordOrderTime(target)) aliases[alias] = canonical;
    });
    const next = { ...current, records, aliases, revision: Number(current.revision || 0) + 1, updatedAt: now };
    const write = await store.setJSON(key, next, snapshot?.etag ? { onlyIfMatch: snapshot.etag } : { onlyIfNew: true });
    if (write.modified) return records[canonical];
  }
  throw new Error('Concurrent treatment-plan registry update conflict');
}

export async function ensureQuickPlanCostDraft(input, dependencies = {}) {
  const draft = buildQuickPlanCostDraft(input);
  const record = await saveCurrentPlan(draft, dependencies.planBlobStore || planStore());
  const registryRecord = await indexPlan(draft, record, dependencies.registryBlobStore || registryStore());
  return {
    planNo: record.plan.meta.planNo, patientId: draft.patientId, date: draft.date, clinicId: draft.clinicId,
    status: registryRecord.status || record.plan.meta.status || 'draft', sourceQuickPlanId: record.plan.meta.sourceQuickPlanId,
    sourceQuickPlanRevision: Number(record.plan.meta.sourceQuickPlanRevision || 1), registryCanonical: registryRecord.canonical
  };
}

export const __test = { riyadhDate, groupedPlanItems, normalizedTooth, phaseSyncHash, saveCurrentPlan, indexPlan };
