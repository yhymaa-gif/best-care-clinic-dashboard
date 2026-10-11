import test from 'node:test';
import assert from 'node:assert/strict';
import quickPlans, { __test } from '../netlify/functions/quick-treatment-plans.mjs';
import { DEFAULT_CATALOG_ITEMS, normalizeCatalogItems } from '../netlify/functions/treatment-catalog.mjs';
import { DEFAULT_CATALOG_ITEMS as SHARED_DEFAULT_CATALOG_ITEMS } from '../procedure-catalog-defaults.js';
import { DRAFT_NOTICE } from '../quick-plan-core.js';
import { buildQuickPlanCostDraft, ensureQuickPlanCostDraft, synchronizeQuickPlanCostDraft } from '../netlify/functions/lib/quick-plan-cost-bridge.mjs';

const memoryStore = () => {
  const values = new Map(), etags = new Map();
  let failDayWriteOnce = false;
  const api = {
    values,
    async list({ prefix }) { return { blobs: [...values.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) }; },
    failNextDayWrite() { failDayWriteOnce = true; },
    async get(key) { return structuredClone(values.get(key) ?? null); },
    async getWithMetadata(key) {
      return values.has(key) ? { data: structuredClone(values.get(key)), etag: etags.get(key) } : null;
    },
    async setJSON(key, value, options = {}) {
      if (failDayWriteOnce && key.includes('/days/')) { failDayWriteOnce = false; throw new Error('synthetic interrupted write'); }
      if (options.onlyIfNew && values.has(key)) return { modified: false };
      if (options.onlyIfMatch && etags.get(key) !== options.onlyIfMatch) return { modified: false };
      values.set(key, structuredClone(value));
      etags.set(key, `etag-${Number(String(etags.get(key) || '').split('-')[1] || 0) + 1}`);
      return { modified: true };
    }
  };
  return api;
};

test('admin-only soft deletion preserves clinical content and linked records while hiding the inbox item', async () => {
  const plans = memoryStore();
  const id = 'a'.repeat(64), key = `clinics/clinic-1/plans/${id}`;
  const original = {
    id, clinicId: 'clinic-1', revision: 3, status: 'approved', originalInput: 'Original nurse note',
    items: [{ toothNumber: '11', procedureId: 'root-canal' }],
    patientId: 'file:18417', patientMrn: '18417', costPlan: { planNo: 'CP-01', registryCanonical: 'record-1' },
    patientSignature: 'unchanged', audit: [{ action: 'submitted' }]
  };
  await plans.setJSON(key, original);
  const admin = { role: 'admin', username: 'admin1', displayName: 'Admin One' };
  assert.equal(__test.canDeletePlan(admin, 'clinic-1'), true);
  assert.equal(__test.canDeletePlan({ role: 'clinic', clinicId: 'clinic-1' }, 'clinic-1'), false);
  assert.equal(__test.canDeletePlan(admin, 'clinic-16'), false);
  const before = await plans.getWithMetadata(key);
  const input = { blobStore: plans, key, snapshot: before, clinicId: 'clinic-1', expectedRevision: 3 };
  assert.equal((await __test.deletePlan({ ...input, user: { role: 'clinic', clinicId: 'clinic-1' } })).status, 403);
  assert.equal((await __test.deletePlan({ ...input, user: admin, expectedRevision: 2 })).status, 409);
  assert.equal((await plans.get(key)).deletedAt, undefined);
  const response = await __test.deletePlan({ ...input, user: admin });
  assert.equal(response.status, 200);
  assert.deepEqual(await __test.listPlans('clinic-1', plans), []);
  const saved = await plans.get(key);
  assert.ok(saved.deletedAt > 0);
  assert.equal(saved.deletedBy, 'Admin One');
  assert.equal(saved.deletedByUserId, 'admin1');
  assert.equal(saved.revision, 4);
  assert.equal(saved.audit.at(-1).action, 'delete');
  assert.equal(saved.audit.at(-1).revision, 4);
  for (const field of ['originalInput', 'items', 'patientId', 'patientMrn', 'costPlan', 'patientSignature', 'status']) {
    assert.deepEqual(saved[field], original[field], `${field} must survive deletion`);
  }
  assert.equal(plans.values.size, 1, 'soft deletion must not remove or rewrite linked records');
  assert.equal((await plans.setJSON(key, original, { onlyIfMatch: before.etag })).modified, false, 'stale revision cannot revive the plan');
  assert.equal((await __test.deletePlan({ ...input, user: admin })).status, 409, 'stale delete is a conflict');
  assert.equal((await __test.deletePlan({ ...input, user: admin, snapshot: await plans.getWithMetadata(key), expectedRevision: 4 })).status, 404, 'tombstone cannot be deleted again');
});

test('cost-plan linkage cannot revive a tombstoned Quick Plan during an in-flight retry', async () => {
  const plans = memoryStore();
  const id = 'b'.repeat(64), key = `clinics/clinic-1/plans/${id}`;
  const quickPlan = { id, clinicId: 'clinic-1', revision: 1, audit: [], originalInput: 'Nurse note' };
  const admin = { role: 'admin', username: 'admin1', displayName: 'Admin One' };
  await plans.setJSON(key, quickPlan);
  const linked = await __test.linkCostedTreatmentPlan({
    blobStore: plans, key, quickPlan, catalog: [], patientRecord: {}, user: admin,
    ensureCostDraft: async () => {
      const before = await plans.getWithMetadata(key);
      await plans.setJSON(key, __test.tombstonePlan(before.data, admin, 900), { onlyIfMatch: before.etag });
      return { planNo: 'CP-01', registryCanonical: 'record-1' };
    }
  });
  assert.equal(linked, null);
  const saved = await plans.get(key);
  assert.equal(saved.deletedAt, 900);
  assert.equal(saved.costPlan, undefined);
  assert.equal(saved.audit.at(-1).action, 'delete');
});

test('PATCH deletion rejects foreign origins before authentication or storage access', async () => {
  const request = new Request('https://bestcaredentalclinicsdash.netlify.app/api/quick-treatment-plans', {
    method: 'PATCH', headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'delete', clinicId: 'clinic-1', id: 'a'.repeat(64), expectedRevision: 1 })
  });
  assert.equal((await quickPlans(request)).status, 403);
});

test('server validates against the current catalog ID, not client labels', () => {
  const input = [{ toothNumber: '#09', procedureId: 'root-canal', officialName: 'Client-forged name', matchState: 'exact' }];
  const validated = __test.validateItems(input, DEFAULT_CATALOG_ITEMS, 'universal');
  assert.equal(validated.items[0].officialName, 'علاج عصب');
  assert.equal(validated.items[0].procedureId, 'root-canal');
  assert.equal(__test.validateItems([{ ...input[0], procedureId: 'fake' }], DEFAULT_CATALOG_ITEMS, 'universal').error.length > 0, true);
  assert.equal(__test.validateItems([{ ...input[0], toothNumber: '99' }], DEFAULT_CATALOG_ITEMS, 'universal').error.length > 0, true);
  assert.equal(__test.validateItems(input, DEFAULT_CATALOG_ITEMS.map(item => item.id === 'root-canal' ? { ...item, status: 'inactive' } : item), 'universal').error.length > 0, true);
});

test('legacy catalog records receive known English labels without changing procedure IDs', () => {
  const [item] = normalizeCatalogItems([{ id: 'root-canal', name: 'علاج عصب', nameEn: '', aliases: ['RCT'] }]);
  assert.equal(item.id, 'root-canal');
  assert.equal(item.name, 'علاج عصب');
  assert.equal(item.nameEn, 'Root canal treatment');
});

test('dashboard and quick-plan defaults share one complete bilingual procedure catalog', () => {
  assert.equal(SHARED_DEFAULT_CATALOG_ITEMS.length, 30);
  assert.deepEqual(DEFAULT_CATALOG_ITEMS.map(item => item.id), SHARED_DEFAULT_CATALOG_ITEMS.map(item => item.id));
  assert.equal(SHARED_DEFAULT_CATALOG_ITEMS.every(item => item.id && item.name && item.nameEn), true);
});

test('write endpoint rejects foreign origins before any storage access', async () => {
  const request = new Request('https://bestcaredentalclinicsdash.netlify.app/api/quick-treatment-plans', {
    method: 'POST', headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
    body: JSON.stringify({ clinicId: 'clinic-1' })
  });
  const response = await quickPlans(request);
  assert.equal(response.status, 403);
});

test('clinician output edits remain separate from structured items and retain draft notice', () => {
  const overrides = __test.cleanOutputOverrides({ clinicalNote: '  Clinician-edited documentation\u0000  ', whatsappText: 'Custom copy', unknown: 'ignored' });
  assert.deepEqual(Object.keys(overrides).sort(), ['clinicalNote', 'whatsappText']);
  const plan = { items: [{ toothNumber: '09', procedureId: 'root-canal', officialName: 'علاج عصب', officialNameEn: 'Root canal treatment' }], clinicianData: {}, outputOverrides: overrides };
  const output = __test.generated(plan);
  assert.match(output.clinicalNote, /Clinician-edited documentation/);
  assert.match(output.clinicalNote, new RegExp(DRAFT_NOTICE));
  assert.match(output.treatmentPlanText, /Root canal treatment/);
  assert.equal(plan.items[0].procedureId, 'root-canal');
});

test('generated clinical record text includes only supplied patient context', () => {
  const plan = { patientName: 'Test Patient', patientAge: 37, patientMrn: '18417', items: [{ toothNumber: '09', procedureId: 'root-canal', officialNameEn: 'Root canal treatment' }], clinicianData: {}, numberingSystem: 'universal' };
  const output = __test.generated(plan);
  assert.match(output.clinicalNote, /Patient: Test Patient · Age: 37 years · MRN: 18417/);
  assert.doesNotMatch(output.clinicalNote, /diagnosed|irreversible pulpitis/i);
});

test('patient-file summaries persist only explicitly confirmed examination and discussion statements', () => {
  const base = {
    patientName: 'Test Patient', patientAge: 37, patientMrn: '18417', numberingSystem: 'fdi', clinicianData: {},
    items: [{ toothNumber: '11', procedureId: 'root-canal', officialName: 'علاج عصب', officialNameEn: 'Root canal treatment', category: 'initial' }]
  };
  const unconfirmed = __test.generated(base);
  assert.match(unconfirmed.patientFileSummaryAr, /يحتاج المريض إلى الإجراءات العلاجية التالية/);
  assert.doesNotMatch(unconfirmed.patientFileSummaryAr, /تم الفحص الإكلينيكي|تمت مناقشة الخطة/);
  assert.doesNotMatch(unconfirmed.patientFileSummaryAr, new RegExp(DRAFT_NOTICE));
  const confirmed = __test.generated({ ...base, documentationConfirmations: { examination: true, discussion: true } });
  assert.match(confirmed.patientFileSummaryAr, /تم إعداد هذه الخطة العلاجية بناءً على فحص إكلينيكي وتقييم شعاعي باستخدام الأشعة الذروية والأشعة البانورامية/);
  assert.match(confirmed.patientFileSummaryAr, /تمت مناقشة هذه الخطة العلاجية مع المريض وشرح الإجراءات المقترحة له/);
  assert.match(confirmed.patientFileSummaryEn, /prepared based on a clinical examination and radiographic assessment/);
});

test('approval requires an admin-configured treating dentist identity, never clinic role alone', () => {
  const user = { username: 'doctor12', displayName: 'Dr Synthetic', role: 'clinic', clinicId: 'clinic-12' };
  const account = { ...user };
  const config = { clinics: [{ id: 'clinic-12', doctorName: 'Dr Synthetic' }] };
  assert.equal(__test.isVerifiedTreatingDentist(user, account, config, 'clinic-12'), true);
  assert.equal(__test.isVerifiedTreatingDentist(user, account, { clinics: [{ id: 'clinic-12', doctorName: '' }] }, 'clinic-12'), false);
  assert.equal(__test.isVerifiedTreatingDentist(user, { ...account, displayName: 'Nurse Synthetic' }, config, 'clinic-12'), false);
  assert.equal(__test.isVerifiedTreatingDentist(user, account, config, 'clinic-11'), false);
  assert.equal(__test.isVerifiedTreatingDentist({ ...user, role: 'admin' }, account, config, 'clinic-12'), false);
});

test('server-generated outputs carry the persisted tooth numbering system', () => {
  const plan = { items: [{ toothNumber: '11', procedureId: 'root-canal', officialNameEn: 'Root canal treatment' }], clinicianData: {}, numberingSystem: 'fdi' };
  const output = __test.generated(plan);
  for (const key of ['treatmentPlanText', 'clinicalNote', 'whatsappText']) assert.match(output[key], /FDI two-digit tooth numbering/);
  assert.match(output.patientFileSummaryEn, /Root canal treatment: teeth 11/);
});

test('changing structured items or clinician data invalidates stale output overrides', () => {
  const existing = {
    items: [{ toothNumber: '11', procedureId: 'root-canal' }],
    clinicianData: { diagnosis: '' },
    outputOverrides: { treatmentPlanText: 'Old text for tooth 11' }
  };
  assert.equal(__test.sourceDataChanged(existing, [{ toothNumber: '21', procedureId: 'extraction' }], existing.clinicianData), true);
  assert.equal(__test.sourceDataChanged(existing, existing.items, { diagnosis: 'Clinician-entered diagnosis' }), true);
  assert.equal(__test.sourceDataChanged(existing, existing.items, existing.clinicianData), false);
});

test('quick-plan submission builds one costed draft from the official catalog and patient directory data', () => {
  const rootCanal = DEFAULT_CATALOG_ITEMS.find(item => item.id === 'root-canal');
  const extraction = DEFAULT_CATALOG_ITEMS.find(item => item.id === 'extraction');
  const quickPlan = {
    id: 'a'.repeat(64), clinicId: 'clinic-1', patientId: 'file:18417', patientMrn: '18417', patientName: 'Incomplete', patientAge: 39,
    treatingDentist: 'Dr Test', createdAt: Date.UTC(2026, 9, 7, 9), clinicalNote: 'Draft note',
    items: [
      { toothNumber: '11', procedureId: 'root-canal' },
      { toothNumber: '12', procedureId: 'root-canal' },
      { toothNumber: '21', procedureId: 'extraction' }
    ]
  };
  const draft = buildQuickPlanCostDraft({ quickPlan, catalog: [rootCanal, extraction], patientRecord: { authoritativeFullName: 'Complete Patient Name', fileNo: '18417', mobile: '0500000000', nationalId: '1000000000' }, actor: 'Nurse' });
  assert.equal(draft.plan.meta.sourceType, 'quick_plan');
  assert.equal(draft.plan.meta.sourceQuickPlanId, quickPlan.id);
  assert.equal(draft.plan.patient.fullName, 'Complete Patient Name');
  assert.equal(draft.plan.patient.mobile, '0500000000');
  assert.equal(draft.plan.patient.nationalId, '1000000000');
  const rct = draft.plan.phases.find(phase => phase.kind === 'initial').items[0];
  assert.equal(rct.code, rootCanal.id);
  assert.equal(rct.qty, 2);
  assert.deepEqual(rct.teeth, ['11', '12']);
  assert.equal(rct.unitPriceAfter, rootCanal.afterPrice === '' ? '' : Number(rootCanal.afterPrice ?? rootCanal.price));
  assert.equal(draft.plan.clinical.diagnosis, '');
  assert.equal(draft.plan.meta.status, 'draft');
});

test('cost-plan bridge preserves Universal teeth and records the numbering system', () => {
  const rootCanal = DEFAULT_CATALOG_ITEMS.find(item => item.id === 'root-canal');
  const draft = buildQuickPlanCostDraft({
    quickPlan: { id: 'b'.repeat(64), clinicId: 'clinic-1', patientId: 'file:18417', patientMrn: '18417', numberingSystem: 'universal', createdAt: Date.UTC(2026, 9, 7, 9), items: [{ toothNumber: '9', procedureId: 'root-canal' }] },
    catalog: [rootCanal], patientRecord: { fileNo: '18417' }, actor: 'Nurse'
  });
  assert.equal(draft.plan.meta.toothNumberingSystem, 'universal');
  assert.deepEqual(draft.plan.phases[0].items[0].teeth, ['09']);
  assert.equal(draft.plan.patient.nationality, 'unknown');
  assert.equal(draft.plan.financial.vatMode, 'unconfirmed');
});

test('editing a submitted quick plan updates its linked editable cost draft without overwriting separate edits', async () => {
  const rootCanal = DEFAULT_CATALOG_ITEMS.find(item => item.id === 'root-canal');
  const extraction = DEFAULT_CATALOG_ITEMS.find(item => item.id === 'extraction');
  const plans = memoryStore(), registry = memoryStore();
  const patientRecord = { authoritativeFullName: 'Patient', fileNo: '18417', nationalId: '1000000000' };
  const quickPlan = {
    id: 'f'.repeat(64), clinicId: 'clinic-1', patientId: 'file:18417', patientMrn: '18417', patientName: 'Patient',
    numberingSystem: 'fdi', createdAt: Date.UTC(2026, 9, 7, 9), revision: 1,
    patientFileSummaryAr: 'المسودة الأولى', items: [{ toothNumber: '11', procedureId: 'root-canal' }]
  };
  const input = { quickPlan, catalog: [rootCanal, extraction], patientRecord, actor: 'Nurse' };
  const linked = await ensureQuickPlanCostDraft(input, { planBlobStore: plans, registryBlobStore: registry });
  const versionKey = [...plans.values.keys()].find(key => key.includes('/versions/') && plans.values.get(key)?.plan?.meta?.planNo === linked.planNo);
  assert.ok(versionKey);
  assert.equal(plans.values.get(versionKey).plan.meta.status, 'draft');
  assert.ok(plans.values.get(versionKey).plan.meta.sourceQuickPlanSyncHash);

  await synchronizeQuickPlanCostDraft({
    ...input,
    previousQuickPlan: quickPlan,
    quickPlan: {
      ...quickPlan, revision: 2, patientFileSummaryAr: 'المسودة المحدّثة',
      items: [{ toothNumber: '11', procedureId: 'root-canal' }, { toothNumber: '21', procedureId: 'extraction' }]
    }
  }, { planBlobStore: plans });
  const synchronized = plans.values.get(versionKey).plan;
  assert.equal(synchronized.meta.sourceQuickPlanRevision, 2);
  assert.equal(synchronized.clinical.notes, 'المسودة المحدّثة');
  assert.equal(synchronized.phases.find(phase => phase.kind === 'implant').items[0].code, 'extraction');
  const dayRecord = [...plans.values.entries()].find(([key]) => key.includes('/days/'))?.[1];
  const permanentRecords = [...plans.values.entries()].filter(([key]) => key.includes('/patients/')).map(([, value]) => value);
  assert.equal(dayRecord.plan.meta.sourceQuickPlanRevision, 2);
  assert.equal(dayRecord.plan.phases.find(phase => phase.kind === 'implant').items[0].code, 'extraction');
  assert.equal(permanentRecords.every(record => record.plan.meta.sourceQuickPlanRevision === 2), true);

  const manuallyEdited = structuredClone(plans.values.get(versionKey));
  manuallyEdited.plan.phases[0].items[0].unitPriceAfter = 999;
  await plans.setJSON(versionKey, manuallyEdited);
  await assert.rejects(() => synchronizeQuickPlanCostDraft({
    ...input,
    previousQuickPlan: { ...quickPlan, revision: 2 },
    quickPlan: { ...quickPlan, revision: 3, items: [{ toothNumber: '12', procedureId: 'root-canal' }] }
  }, { planBlobStore: plans }), /edited separately/);
});

test('cost synchronization protects manually edited clinical notes', async () => {
  const rootCanal = DEFAULT_CATALOG_ITEMS.find(item => item.id === 'root-canal');
  const plans = memoryStore(), registry = memoryStore();
  const quickPlan = {
    id: '2'.repeat(64), clinicId: 'clinic-1', patientId: 'file:18417', patientMrn: '18417', numberingSystem: 'fdi',
    createdAt: Date.UTC(2026, 9, 7, 9), revision: 1, patientFileSummaryAr: 'مسودة أصلية', items: [{ toothNumber: '11', procedureId: 'root-canal' }]
  };
  const input = { quickPlan, catalog: [rootCanal], patientRecord: { fileNo: '18417' }, actor: 'Nurse' };
  const linked = await ensureQuickPlanCostDraft(input, { planBlobStore: plans, registryBlobStore: registry });
  const versionKey = [...plans.values.keys()].find(key => key.includes('/versions/') && plans.values.get(key)?.plan?.meta?.planNo === linked.planNo);
  const manual = structuredClone(plans.values.get(versionKey));
  manual.plan.clinical.notes = 'ملاحظة يدوية لا يجوز استبدالها';
  await plans.setJSON(versionKey, manual);
  await assert.rejects(() => synchronizeQuickPlanCostDraft({
    ...input, previousQuickPlan: quickPlan,
    quickPlan: { ...quickPlan, revision: 2, patientFileSummaryAr: 'مسودة جديدة' }
  }, { planBlobStore: plans }), /edited separately/);
});

test('older linked drafts can migrate only when their managed content still matches the previous Quick Plan', async () => {
  const rootCanal = DEFAULT_CATALOG_ITEMS.find(item => item.id === 'root-canal');
  const extraction = DEFAULT_CATALOG_ITEMS.find(item => item.id === 'extraction');
  const plans = memoryStore(), registry = memoryStore();
  const quickPlan = {
    id: '3'.repeat(64), clinicId: 'clinic-1', patientId: 'file:18417', patientMrn: '18417', numberingSystem: 'fdi',
    createdAt: Date.UTC(2026, 9, 7, 9), revision: 1, clinicalNote: 'Legacy clinical note', patientFileSummaryAr: 'Newer summary',
    items: [{ toothNumber: '11', procedureId: 'root-canal' }]
  };
  const input = { quickPlan, catalog: [rootCanal, extraction], patientRecord: { fileNo: '18417' }, actor: 'Nurse' };
  const linked = await ensureQuickPlanCostDraft(input, { planBlobStore: plans, registryBlobStore: registry });
  for (const [key, value] of [...plans.values.entries()]) {
    if (value?.plan?.meta?.planNo !== linked.planNo) continue;
    const legacy = structuredClone(value);
    delete legacy.plan.meta.sourceQuickPlanSyncHash;
    legacy.plan.clinical.notes = quickPlan.clinicalNote;
    await plans.setJSON(key, legacy);
  }
  await synchronizeQuickPlanCostDraft({
    ...input, previousQuickPlan: quickPlan,
    quickPlan: { ...quickPlan, revision: 2, patientFileSummaryAr: 'ملخص محدّث', items: [{ toothNumber: '21', procedureId: 'extraction' }] }
  }, { planBlobStore: plans });
  const version = [...plans.values.values()].find(value => value?.plan?.meta?.planNo === linked.planNo && value.plan.meta.sourceQuickPlanRevision === 2);
  assert.equal(version.plan.clinical.notes, 'ملخص محدّث');
  assert.ok(version.plan.meta.sourceQuickPlanSyncHash);
});

test('out-of-order Quick Plan revisions are rejected and an interrupted pointer write is repairable', async () => {
  const rootCanal = DEFAULT_CATALOG_ITEMS.find(item => item.id === 'root-canal');
  const plans = memoryStore(), registry = memoryStore();
  const quickPlan = {
    id: '4'.repeat(64), clinicId: 'clinic-1', patientId: 'file:18417', patientMrn: '18417', numberingSystem: 'fdi',
    createdAt: Date.UTC(2026, 9, 7, 9), revision: 1, items: [{ toothNumber: '11', procedureId: 'root-canal' }]
  };
  const input = { quickPlan, catalog: [rootCanal], patientRecord: { fileNo: '18417' }, actor: 'Nurse' };
  await ensureQuickPlanCostDraft(input, { planBlobStore: plans, registryBlobStore: registry });
  await assert.rejects(() => synchronizeQuickPlanCostDraft({
    ...input,
    previousQuickPlan: { ...quickPlan, revision: 2, items: [{ toothNumber: '21', procedureId: 'root-canal' }] },
    quickPlan: { ...quickPlan, revision: 3 }
  }, { planBlobStore: plans }), /out of sequence/);
  const revisionTwo = { ...quickPlan, revision: 2, patientFileSummaryAr: 'Revision two', items: [{ toothNumber: '12', procedureId: 'root-canal' }] };
  plans.failNextDayWrite();
  await assert.rejects(() => synchronizeQuickPlanCostDraft({ ...input, previousQuickPlan: quickPlan, quickPlan: revisionTwo }, { planBlobStore: plans }), /synthetic interrupted write/);
  await synchronizeQuickPlanCostDraft({ ...input, previousQuickPlan: quickPlan, quickPlan: revisionTwo }, { planBlobStore: plans });
  const dayRecord = [...plans.values.entries()].find(([key]) => key.includes('/days/'))?.[1];
  assert.equal(dayRecord.plan.meta.sourceQuickPlanRevision, 2);
  assert.deepEqual(dayRecord.plan.phases[0].items[0].teeth, ['12']);
});

test('link audit revisions and no-op saves do not block the first real content edit', async () => {
  const rootCanal = DEFAULT_CATALOG_ITEMS.find(item => item.id === 'root-canal');
  const extraction = DEFAULT_CATALOG_ITEMS.find(item => item.id === 'extraction');
  const plans = memoryStore(), registry = memoryStore();
  const submitted = {
    id: '5'.repeat(64), clinicId: 'clinic-1', patientId: 'file:18417', patientMrn: '18417', numberingSystem: 'fdi',
    createdAt: Date.UTC(2026, 9, 7, 9), revision: 1, patientFileSummaryAr: 'المحتوى المرسل', items: [{ toothNumber: '11', procedureId: 'root-canal' }]
  };
  const input = { quickPlan: submitted, catalog: [rootCanal, extraction], patientRecord: { fileNo: '18417' }, actor: 'Nurse' };
  const linked = await ensureQuickPlanCostDraft(input, { planBlobStore: plans, registryBlobStore: registry });
  assert.equal(linked.sourceQuickPlanRevision, 1);
  const afterLinkAudit = { ...submitted, revision: 2 };
  const afterNoOpSave = { ...afterLinkAudit, revision: 3 };
  const edited = {
    ...afterNoOpSave, revision: 4, patientFileSummaryAr: 'المحتوى المعدّل',
    items: [{ toothNumber: '11', procedureId: 'root-canal' }, { toothNumber: '21', procedureId: 'extraction' }]
  };
  await synchronizeQuickPlanCostDraft({ ...input, previousQuickPlan: afterNoOpSave, quickPlan: edited }, { planBlobStore: plans });
  const version = [...plans.values.values()].find(value => value?.plan?.meta?.planNo === linked.planNo && value.plan.meta.sourceQuickPlanRevision === 4);
  assert.equal(version.plan.clinical.notes, 'المحتوى المعدّل');
  assert.equal(version.plan.phases.find(phase => phase.kind === 'implant').items[0].code, 'extraction');
});

test('quick-plan synchronization never rewrites a cost plan that entered approval', async () => {
  const rootCanal = DEFAULT_CATALOG_ITEMS.find(item => item.id === 'root-canal');
  const plans = memoryStore(), registry = memoryStore();
  const quickPlan = {
    id: '1'.repeat(64), clinicId: 'clinic-1', patientId: 'file:18417', patientMrn: '18417', patientName: 'Patient',
    numberingSystem: 'fdi', createdAt: Date.UTC(2026, 9, 7, 9), revision: 1, items: [{ toothNumber: '11', procedureId: 'root-canal' }]
  };
  const input = { quickPlan, catalog: [rootCanal], patientRecord: { fileNo: '18417' }, actor: 'Nurse' };
  const linked = await ensureQuickPlanCostDraft(input, { planBlobStore: plans, registryBlobStore: registry });
  const versionKey = [...plans.values.keys()].find(key => key.includes('/versions/') && plans.values.get(key)?.plan?.meta?.planNo === linked.planNo);
  const approved = structuredClone(plans.values.get(versionKey));
  approved.plan.meta.status = 'submitted';
  await plans.setJSON(versionKey, approved);
  await assert.rejects(() => synchronizeQuickPlanCostDraft({ ...input, quickPlan: { ...quickPlan, revision: 2 } }, { planBlobStore: plans }), /approval workflow/);
});

test('cost-plan bridge resumes an interrupted retry and does not erase approved registry state', async () => {
  const rootCanal = DEFAULT_CATALOG_ITEMS.find(item => item.id === 'root-canal');
  const quickPlan = {
    id: 'c'.repeat(64), clinicId: 'clinic-1', patientId: 'file:18417', patientMrn: '18417', patientName: 'Patient', numberingSystem: 'fdi',
    createdAt: Date.UTC(2026, 9, 7, 9), items: [{ toothNumber: '11', procedureId: 'root-canal' }]
  };
  const input = { quickPlan, catalog: [rootCanal], patientRecord: { authoritativeFullName: 'Patient', fileNo: '18417', nationalId: '1000000000' }, actor: 'Nurse' };
  const plans = memoryStore(), registry = memoryStore();
  plans.failNextDayWrite();
  await assert.rejects(() => ensureQuickPlanCostDraft(input, { planBlobStore: plans, registryBlobStore: registry }), /synthetic interrupted write/);
  const linked = await ensureQuickPlanCostDraft(input, { planBlobStore: plans, registryBlobStore: registry });
  assert.equal([...plans.values.keys()].some(key => key.includes('/days/')), true);
  assert.equal([...plans.values.keys()].filter(key => key.includes('/patients/')).length >= 2, true);
  const registryDocument = registry.values.get('registry/global');
  registryDocument.records[linked.registryCanonical] = {
    ...registryDocument.records[linked.registryCanonical], status: 'approved_signed', approvedAt: 123, approvedBy: 'Admin',
    patientAcceptedAt: 122, patientAcceptedBy: 'Patient', consentMethod: 'patient_link', consentEvidenceId: 'evidence', lastPrintedAt: 124
  };
  registry.values.set('registry/global', registryDocument);
  await ensureQuickPlanCostDraft(input, { planBlobStore: plans, registryBlobStore: registry });
  const after = registry.values.get('registry/global').records[linked.registryCanonical];
  assert.equal(after.status, 'approved_signed');
  assert.equal(after.consentEvidenceId, 'evidence');
  assert.equal(after.lastPrintedAt, 124);
});

test('retrying an older quick plan never moves the patient alias away from the newer plan', async () => {
  const rootCanal = DEFAULT_CATALOG_ITEMS.find(item => item.id === 'root-canal');
  const plans = memoryStore(), registry = memoryStore();
  const base = {
    clinicId: 'clinic-1', patientId: 'file:18417', patientMrn: '18417', patientName: 'Patient', numberingSystem: 'fdi',
    items: [{ toothNumber: '11', procedureId: 'root-canal' }]
  };
  const patientRecord = { authoritativeFullName: 'Patient', fileNo: '18417', nationalId: '1000000000' };
  const dependencies = { planBlobStore: plans, registryBlobStore: registry };
  const olderInput = { quickPlan: { ...base, id: 'd'.repeat(64), createdAt: Date.UTC(2026, 9, 7, 9) }, catalog: [rootCanal], patientRecord, actor: 'Nurse' };
  const newerInput = { quickPlan: { ...base, id: 'e'.repeat(64), createdAt: Date.UTC(2026, 9, 7, 10) }, catalog: [rootCanal], patientRecord, actor: 'Nurse' };
  const older = await ensureQuickPlanCostDraft(olderInput, dependencies);
  const newer = await ensureQuickPlanCostDraft(newerInput, dependencies);
  await ensureQuickPlanCostDraft(olderInput, dependencies);
  const document = registry.values.get('registry/global');
  assert.notEqual(older.registryCanonical, newer.registryCanonical);
  assert.equal(document.aliases['file:18417'], newer.registryCanonical);
  assert.equal(document.aliases['national:1000000000'], newer.registryCanonical);
});
