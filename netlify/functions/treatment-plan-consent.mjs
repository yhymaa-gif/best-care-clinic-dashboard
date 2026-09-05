import { getStore } from '@netlify/blobs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { apiHeaders, canAccessClinic, requireUser, sameOriginRequest } from './lib/session.mjs';
import { patientIdentityKeys } from './lib/patient-identity.mjs';
import { sendPushNotifications } from './lib/push.mjs';

const headers = apiHeaders('GET,POST,OPTIONS');
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
const planStore = getStore({ name: 'clinic-treatment-plans', consistency: 'strong' });
const registryStore = getStore({ name: 'clinic-treatment-plan-registry', consistency: 'strong' });
const consentStore = getStore({ name: 'clinic-treatment-plan-consents', consistency: 'strong' });
const CONSENT_VERSION = 2;
const LINK_VALIDITY_POLICY = 'until_signed_replaced_or_plan_changed';
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const cleanText = (value, max = 500) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const validClinic = value => /^clinic-([1-9]|1[0-5])$/.test(value || '');
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
const validPatientId = value => /^[a-zA-Z0-9._:-]{1,80}$/.test(value || '');
const validToken = value => /^[A-Za-z0-9_-]{40,100}$/.test(value || '');
const legacyPlanKey = (clinicId, date, patientId) => `clinics/${clinicId}/days/${date}/patients/${hash(patientId)}`;
const permanentPlanKey = (clinicId, identity) => `clinics/${clinicId}/patients/${hash(identity)}`;
const versionedPlanKey = (clinicId, date, patientId, planNo) => `clinics/${clinicId}/versions/${hash(`${date}|${patientId}|${planNo}`)}`;
const scopeKey = ({ clinicId, date, patientId, planNo }) => hash(`${clinicId}|${date}|${patientId}|${planNo}`);
const tokenKey = tokenHash => `tokens/${tokenHash}`;
const activeKey = scope => `active/${scopeKey(scope)}`;

const consentDigest = plan => hash(JSON.stringify({
  planNo: plan?.meta?.planNo || '',
  revision: Number(plan?.meta?.revision || 1),
  issuedAt: plan?.meta?.issuedAt || '',
  validityDays: Number(plan?.meta?.validityDays || 15),
  patient: plan?.patient || {},
  doctor: plan?.doctor || {},
  clinical: plan?.clinical || {},
  phases: plan?.phases || [],
  alternatives: plan?.alternatives || '',
  noTreatment: plan?.noTreatment || '',
  risks: plan?.risks || '',
  financial: plan?.financial || {},
  consent: plan?.consent || {}
}));

const cleanSignature = value => {
  const signature = String(value || '');
  if (signature.length < 300 || signature.length > 350_000) return '';
  return /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature) ? signature : '';
};

const moneyTotals = plan => {
  let before = 0;
  let after = 0;
  let hasBefore = false;
  let hasAfter = false;
  (plan?.phases || []).forEach(phase => (phase?.items || []).forEach(item => {
    if (item?.type === 'included' || !item?.service) return;
    const quantity = Math.max(1, Number(item?.qty || 1));
    const beforeValue = Number(item?.unitPriceBefore);
    const afterValue = Number(item?.unitPriceAfter);
    if (Number.isFinite(beforeValue)) { before += beforeValue * quantity; hasBefore = true; }
    if (Number.isFinite(afterValue)) { after += afterValue * quantity; hasAfter = true; }
  }));
  return { before: hasBefore ? before : null, after: hasAfter ? after : null };
};

const publicSummary = plan => ({
  planNo: cleanText(plan?.meta?.planNo, 40),
  revision: Math.max(1, Number(plan?.meta?.revision || 1)),
  issuedAt: cleanText(plan?.meta?.issuedAt, 40),
  validityDays: Math.max(1, Math.min(90, Number(plan?.meta?.validityDays || 15))),
  patientName: cleanText(plan?.patient?.fullName, 120),
  fileNo: cleanText(plan?.patient?.fileNo, 40),
  doctorName: cleanText(plan?.doctor?.name || plan?.doctor?.explainedBy, 120),
  photoConsent: Boolean(plan?.consent?.photoConsent),
  phases: (Array.isArray(plan?.phases) ? plan.phases : []).slice(0, 12).map((phase, phaseIndex) => ({
    title: cleanText(phase?.title, 100) || `المرحلة ${phaseIndex + 1}`,
    items: (Array.isArray(phase?.items) ? phase.items : []).filter(item => item?.service).slice(0, 30).map(item => ({
      service: cleanText(item?.service, 160),
      quantity: Math.max(1, Math.min(99, Number(item?.qty || 1))),
      included: item?.type === 'included'
    }))
  })).filter(phase => phase.items.length),
  totals: moneyTotals(plan)
});

async function loadLinkedPlan(link) {
  const versionedKey = versionedPlanKey(link.clinicId, link.date, link.patientId, link.planNo);
  let record = await planStore.get(versionedKey, { type: 'json', consistency: 'strong' });
  let planKey = versionedKey;
  if (!record) {
    const legacyKey = legacyPlanKey(link.clinicId, link.date, link.patientId);
    const legacy = await planStore.get(legacyKey, { type: 'json', consistency: 'strong' });
    if (legacy?.plan?.meta?.planNo === link.planNo) { record = legacy; planKey = legacyKey; }
  }
  return { record, planKey };
}

async function updatePlanCopies(link, record, updatedPlan, now) {
  const updatedRecord = {
    ...record,
    patientId: link.patientId,
    clinicId: link.clinicId,
    date: link.date,
    plan: updatedPlan,
    revision: Number(record?.revision || 0) + 1,
    updatedAt: now,
    updatedBy: 'المريض عبر رابط التوقيع'
  };
  const versionedKey = versionedPlanKey(link.clinicId, link.date, link.patientId, link.planNo);
  const writes = [planStore.setJSON(versionedKey, updatedRecord)];
  const legacyKey = legacyPlanKey(link.clinicId, link.date, link.patientId);
  const legacy = await planStore.get(legacyKey, { type: 'json', consistency: 'strong' }).catch(() => null);
  if (legacy?.plan?.meta?.planNo === link.planNo) writes.push(planStore.setJSON(legacyKey, updatedRecord));
  const identities = patientIdentityKeys(updatedPlan.patient);
  const permanent = await Promise.all(identities.map(async identity => ({
    key: permanentPlanKey(link.clinicId, identity),
    record: await planStore.get(permanentPlanKey(link.clinicId, identity), { type: 'json', consistency: 'strong' }).catch(() => null)
  })));
  permanent.filter(item => !item.record || item.record?.plan?.meta?.planNo === link.planNo)
    .forEach(item => writes.push(planStore.setJSON(item.key, updatedRecord)));
  await Promise.all(writes);
  return updatedRecord;
}

async function updateRegistry(link, plan, now, signerName) {
  const current = await registryStore.get('registry/global', { type: 'json', consistency: 'strong' }) || {};
  const records = current.records && typeof current.records === 'object' ? { ...current.records } : {};
  const aliases = current.aliases && typeof current.aliases === 'object' ? { ...current.aliases } : {};
  let canonical = Object.entries(records).find(([, item]) => item?.clinicId === link.clinicId
    && item?.planNo === link.planNo
    && item?.sourcePatientId === link.patientId
    && item?.sourceDate === link.date)?.[0] || '';
  if (!canonical) canonical = `plan:${hash(`${link.clinicId}|${link.planNo}|${link.patientId}|${link.date}`)}`;
  const previous = records[canonical] || {};
  records[canonical] = {
    ...previous,
    canonical,
    clinicId: link.clinicId,
    fullName: cleanText(plan?.patient?.fullName, 120),
    fileNo: cleanText(plan?.patient?.fileNo, 40),
    mobile: cleanText(plan?.patient?.mobile, 20),
    nationalId: cleanText(plan?.patient?.nationalId, 10),
    status: 'approved_signed',
    planNo: link.planNo,
    parentPlanNo: cleanText(plan?.meta?.parentPlanNo, 40),
    relation: plan?.meta?.relation === 'addendum' ? 'addendum' : 'standalone',
    sourcePatientId: link.patientId,
    sourceDate: link.date,
    patientAcceptedAt: now,
    patientAcceptedBy: signerName,
    approvedAt: now,
    approvedBy: 'اعتماد تلقائي بعد توقيع المريض',
    consentMethod: 'patient_link',
    consentEvidenceId: link.id,
    photoConsent: plan?.consent?.photoConsent === true,
    photoConsentRecorded: true,
    consentTermsVersion: Number(plan?.consent?.termsVersion || CONSENT_VERSION),
    lastPrintedAt: Number(plan?.meta?.lastPrintedAt || 0),
    createdAt: Number(previous.createdAt || now),
    updatedAt: now,
    updatedBy: 'المريض عبر رابط التوقيع'
  };
  patientIdentityKeys(plan.patient).forEach(alias => { aliases[alias] = canonical; });
  await registryStore.setJSON('registry/global', {
    ...current,
    records,
    aliases,
    revision: Number(current.revision || 0) + 1,
    updatedAt: now
  });
}

async function validateActiveLink(token) {
  if (!validToken(token)) return { error: 'رابط التوقيع غير صالح.', status: 400 };
  const tokenHash = hash(token);
  const link = await consentStore.get(tokenKey(tokenHash), { type: 'json', consistency: 'strong' });
  if (!link) return { error: 'رابط التوقيع غير صالح أو تم استبداله.', status: 404 };
  const active = await consentStore.get(activeKey(link), { type: 'json', consistency: 'strong' });
  if (active?.tokenHash !== tokenHash) return { error: 'تم استبدال هذا الرابط برابط أحدث. اطلب من العيادة إعادة الإرسال.', status: 409 };
  return { link, tokenHash };
}

async function createConsentLink(request, body) {
  const auth = await requireUser(request);
  if (!auth.ok) return reply({ error: auth.error }, auth.status);
  if (auth.user?.role !== 'admin') return reply({ error: 'Administration access required' }, 403);
  const scope = {
    clinicId: cleanText(body?.clinicId, 20),
    date: cleanText(body?.date, 10),
    patientId: cleanText(body?.patientId, 80),
    planNo: cleanText(body?.planNo, 40)
  };
  if (!validClinic(scope.clinicId) || !validDate(scope.date) || !validPatientId(scope.patientId) || !scope.planNo) {
    return reply({ error: 'بيانات الخطة غير مكتملة.' }, 400);
  }
  if (!canAccessClinic(auth.user, scope.clinicId)) return reply({ error: 'Clinic access denied' }, 403);
  const { record, planKey } = await loadLinkedPlan(scope);
  const plan = record?.plan;
  if (!plan || plan?.meta?.planNo !== scope.planNo) return reply({ error: 'تعذر العثور على نسخة الخطة المحددة.' }, 404);
  if (plan?.meta?.status !== 'submitted' || !Number(plan?.meta?.doctorApprovedAt || 0)) {
    return reply({ error: 'يجب أن يعتمد الطبيب الخطة قبل إنشاء رابط التوقيع.' }, 409);
  }
  const issuedAt = Date.parse(plan?.meta?.issuedAt || '') || Date.now();
  const planExpiresAt = issuedAt + Math.max(1, Math.min(90, Number(plan?.meta?.validityDays || 15))) * 24 * 60 * 60 * 1000;
  if (planExpiresAt <= Date.now()) return reply({ error: 'انتهت صلاحية الخطة. حدّث تاريخها قبل إرسالها للمريض.' }, 409);
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hash(token);
  const now = Date.now();
  const link = {
    id: randomUUID(),
    ...scope,
    planKey,
    planDigest: consentDigest(plan),
    planRevision: Math.max(1, Number(plan?.meta?.revision || 1)),
    createdAt: now,
    createdBy: cleanText(auth.user?.displayName || auth.user?.username || 'الإدارة', 120),
    validityPolicy: LINK_VALIDITY_POLICY,
    expiresAt: 0,
    usedAt: 0
  };
  await Promise.all([
    consentStore.setJSON(tokenKey(tokenHash), link),
    consentStore.setJSON(activeKey(scope), { tokenHash, consentId: link.id, createdAt: now })
  ]);
  const consentUrl = new URL('/plan-consent.html', request.url);
  consentUrl.searchParams.set('token', token);
  return reply({ ok: true, consentId: link.id, url: consentUrl.toString(), expiresAt: null, validityPolicy: LINK_VALIDITY_POLICY });
}

async function readConsentLink(token) {
  const checked = await validateActiveLink(token);
  if (checked.error) return reply({ error: checked.error }, checked.status);
  const { link } = checked;
  const { record } = await loadLinkedPlan(link);
  const plan = record?.plan;
  if (!plan) return reply({ error: 'لم تعد الخطة متاحة. تواصل مع العيادة.' }, 404);
  if (Number(link.usedAt || 0) || (plan?.meta?.status === 'approved_signed' && plan?.meta?.consentEvidenceId === link.id)) {
    return reply({ ok: true, status: 'signed', signedAt: Number(link.usedAt || plan?.meta?.patientAcceptedAt || 0), summary: publicSummary(plan) });
  }
  if (plan?.meta?.status !== 'submitted' || consentDigest(plan) !== link.planDigest) {
    return reply({ error: 'تم تعديل الخطة بعد إرسال الرابط. اطلب النسخة الأحدث من العيادة.' }, 409);
  }
  return reply({ ok: true, status: 'ready', expiresAt: null, validityPolicy: LINK_VALIDITY_POLICY, consentVersion: CONSENT_VERSION, summary: publicSummary(plan) });
}

async function signConsent(request, body) {
  const checked = await validateActiveLink(cleanText(body?.token, 120));
  if (checked.error) return reply({ error: checked.error }, checked.status);
  const { link, tokenHash } = checked;
  const { record } = await loadLinkedPlan(link);
  const plan = record?.plan;
  if (!plan) return reply({ error: 'لم تعد الخطة متاحة. تواصل مع العيادة.' }, 404);
  if (Number(link.usedAt || 0) || (plan?.meta?.status === 'approved_signed' && plan?.meta?.consentEvidenceId === link.id)) {
    return reply({ ok: true, duplicate: true, status: 'signed', signedAt: Number(link.usedAt || plan?.meta?.patientAcceptedAt || 0), photoConsent: plan?.consent?.photoConsent === true });
  }
  if (plan?.meta?.status !== 'submitted' || consentDigest(plan) !== link.planDigest) {
    return reply({ error: 'تم تعديل الخطة بعد إرسال الرابط. اطلب النسخة الأحدث من العيادة.' }, 409);
  }
  if (Number(body?.consentVersion) !== CONSENT_VERSION) {
    return reply({ error: 'تم تحديث شروط الموافقة. حدّث الصفحة ثم راجع البنود وأعد التوقيع.' }, 409);
  }
  if (body?.accepted !== true || body?.understood !== true || body?.financialAccepted !== true) {
    return reply({ error: 'يجب قراءة الإقرار وتأكيد الموافقة العلاجية والالتزام المالي قبل التوقيع.' }, 400);
  }
  const signerName = cleanText(body?.signerName, 120);
  const signerRole = body?.signerRole === 'guardian' ? 'guardian' : 'patient';
  const guardianRelation = signerRole === 'guardian' ? cleanText(body?.guardianRelation, 80) : '';
  const signature = cleanSignature(body?.signature);
  if (signerName.length < 3) return reply({ error: 'اكتب الاسم الكامل للموقّع.' }, 400);
  if (signerRole === 'guardian' && guardianRelation.length < 2) return reply({ error: 'حدد صلة الموقّع بالمريض.' }, 400);
  if (!signature) return reply({ error: 'يلزم توقيع واضح داخل مربع التوقيع.' }, 400);

  const now = Date.now();
  const photoConsent = body?.photoConsent === true;
  const updatedPlan = structuredClone(plan);
  updatedPlan.meta = {
    ...(updatedPlan.meta || {}),
    status: 'approved_signed',
    patientAcceptedAt: now,
    patientAcceptedBy: signerName,
    approvedAt: now,
    approvedBy: 'اعتماد تلقائي بعد توقيع المريض',
    consentMethod: 'patient_link',
    consentEvidenceId: link.id,
    consentPlanRevision: link.planRevision,
    consentVersion: CONSENT_VERSION,
    lastPrintedAt: 0,
    rejectedAt: 0,
    rejectedBy: '',
    rejectionReason: ''
  };
  updatedPlan.signatures = {
    ...(updatedPlan.signatures || {}),
    patientSignature: signature,
    signerName,
    guardianRelation,
    witnessName: '',
    witnessSignedAt: ''
  };
  updatedPlan.consent = {
    ...(updatedPlan.consent || {}),
    photoConsent,
    photoConsentRecorded: true,
    photoConsentDefaultVersion: 2,
    photoConsentAcceptedAt: photoConsent ? now : 0,
    termsVersion: CONSENT_VERSION
  };
  const requestIp = cleanText(request.headers.get('x-nf-client-connection-ip') || request.headers.get('x-forwarded-for') || '', 120).split(',')[0];
  const evidence = {
    id: link.id,
    clinicId: link.clinicId,
    date: link.date,
    patientId: link.patientId,
    planNo: link.planNo,
    planRevision: link.planRevision,
    planDigest: link.planDigest,
    consentVersion: CONSENT_VERSION,
    understood: true,
    treatmentAccepted: true,
    financialAccepted: true,
    photoConsent,
    method: 'patient_link',
    signerName,
    signerRole,
    guardianRelation,
    signatureDigest: hash(signature),
    acceptedAt: now,
    ipDigest: requestIp ? hash(requestIp) : '',
    userAgentDigest: hash(cleanText(request.headers.get('user-agent'), 500))
  };
  await consentStore.setJSON(`evidence/${link.id}`, evidence);
  await updatePlanCopies(link, record, updatedPlan, now);
  await updateRegistry(link, updatedPlan, now, signerName);
  await consentStore.setJSON(tokenKey(tokenHash), { ...link, usedAt: now, signerName, signerRole, guardianRelation });
  await sendPushNotifications({
    type: 'treatment_plan',
    title: 'تم توقيع الخطة العلاجية',
    body: 'اكتملت موافقة المريض وأصبحت الخطة معتمدة وموقعة وجاهزة للطباعة.',
    tag: `treatment-plan-consent-${link.id}`,
    clinicId: link.clinicId,
    patientName: cleanText(updatedPlan?.patient?.fullName, 80),
    patientFile: cleanText(updatedPlan?.patient?.fileNo, 40),
    url: `/treatment-plan.html?${new URLSearchParams({ patientId: link.patientId, date: link.date, planNo: link.planNo, clinic: link.clinicId, view: 'admin' })}`,
    updatedAt: now
  }).catch(() => null);
  return reply({ ok: true, status: 'signed', signedAt: now, planNo: link.planNo, photoConsent });
}

export default async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const url = new URL(request.url);
  if (request.method === 'GET') return readConsentLink(cleanText(url.searchParams.get('token'), 120));
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  if (!sameOriginRequest(request)) return reply({ error: 'Invalid request origin' }, 403);
  let body;
  try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400); }
  if (body?.action === 'create') return createConsentLink(request, body);
  if (body?.action === 'sign') return signConsent(request, body);
  return reply({ error: 'Invalid consent action' }, 400);
};

export const __test = { consentDigest, publicSummary, cleanSignature, validToken, moneyTotals, CONSENT_VERSION, LINK_VALIDITY_POLICY };
