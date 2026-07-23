import { getStore } from '@netlify/blobs';
import { createHash, createHmac } from 'node:crypto';

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, no-cache, must-revalidate',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,PUT,OPTIONS',
  'access-control-allow-headers': 'content-type,accept'
};
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
const store = getStore({ name: 'clinic-treatment-plans', consistency: 'strong' });
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const cleanText = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const cleanNumber = (value, min = 0, max = 10_000_000) => {
  if (value === '' || value === null || value === undefined) return '';
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : '';
};
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
const validClinic = value => /^clinic-([1-9]|1[0-5])$/.test(value || '');
const validPatientId = value => /^[a-zA-Z0-9._:-]{1,80}$/.test(value || '');

async function authSession(request) {
  if (process.env.AUTH_ENABLED !== 'true') return true;
  const raw = (request.headers.get('cookie') || '').split(';').map(value => value.trim()).find(value => value.startsWith('bc_session='))?.slice(11);
  if (!raw) return false;
  const key = `sessions/${hash(raw)}`;
  const sessionStore = getStore({ name: 'clinic-dashboard-auth-sessions', consistency: 'strong' });
  const session = await sessionStore.get(key, { type: 'json', consistency: 'strong' });
  const now = Date.now();
  const signature = createHmac('sha256', process.env.AUTH_SESSION_SECRET || 'change-me-before-production').update(raw).digest('hex');
  if (!session || session.tokenSignature !== signature || now - Number(session.lastSeenAt || 0) > 3 * 60 * 60 * 1000 || now > Number(session.expiresAt || 0)) {
    if (session) await sessionStore.delete(key);
    return false;
  }
  session.lastSeenAt = now;
  await sessionStore.setJSON(key, session);
  return true;
}

const cleanItem = item => ({
  code: cleanText(item?.code, 50),
  service: cleanText(item?.service, 160),
  teeth: (Array.isArray(item?.teeth) ? item.teeth : []).map(String).filter(value => /^[1-4][1-8]$/.test(value)).slice(0, 32),
  qty: Math.max(1, Math.min(99, Number(item?.qty || 1))),
  unitPriceBefore: cleanNumber(item?.unitPriceBefore),
  unitPriceAfter: cleanNumber(item?.unitPriceAfter),
  type: item?.type === 'included' ? 'included' : 'billable',
  includedWith: cleanText(item?.includedWith, 50),
  includedLabel: cleanText(item?.includedLabel, 120)
});
const cleanPhase = (phase, index) => ({
  index,
  title: cleanText(phase?.title, 100) || `المرحلة ${index + 1}`,
  estimatedVisits: cleanText(phase?.estimatedVisits, 30),
  estimatedDuration: cleanText(phase?.estimatedDuration, 80),
  items: (Array.isArray(phase?.items) ? phase.items : []).slice(0, 30).map(cleanItem)
});
const cleanSignature = value => {
  const signature = String(value || '');
  return signature.startsWith('data:image/png;base64,') ? signature.slice(0, 350_000) : '';
};
const cleanPlan = plan => ({
  meta: {
    planNo: cleanText(plan?.meta?.planNo, 40),
    issuedAt: cleanText(plan?.meta?.issuedAt, 40),
    validityDays: Math.max(1, Math.min(90, Number(plan?.meta?.validityDays || 15))),
    copyType: plan?.meta?.copyType === 'file' ? 'file' : 'patient',
    revision: Math.max(1, Number(plan?.meta?.revision || 1)),
    status: plan?.meta?.status === 'approved' ? 'approved' : 'draft'
  },
  clinic: {
    nameAr: cleanText(plan?.clinic?.nameAr, 100),
    nameEn: cleanText(plan?.clinic?.nameEn, 100),
    mohLicense: cleanText(plan?.clinic?.mohLicense, 50),
    city: cleanText(plan?.clinic?.city, 80),
    address: cleanText(plan?.clinic?.address, 180),
    phone: cleanText(plan?.clinic?.phone, 30)
  },
  patient: {
    fullName: cleanText(plan?.patient?.fullName, 120),
    fileNo: cleanText(plan?.patient?.fileNo, 40),
    nationalId: cleanText(plan?.patient?.nationalId, 10),
    nationality: plan?.patient?.nationality === 'non-saudi' ? 'non-saudi' : 'saudi',
    age: cleanNumber(plan?.patient?.age, 0, 120),
    mobile: cleanText(plan?.patient?.mobile, 20)
  },
  doctor: {
    name: cleanText(plan?.doctor?.name, 120),
    scfhsNo: cleanText(plan?.doctor?.scfhsNo, 60),
    specialty: cleanText(plan?.doctor?.specialty, 120),
    explainedBy: cleanText(plan?.doctor?.explainedBy, 120)
  },
  clinical: {
    diagnosis: cleanText(plan?.clinical?.diagnosis, 3000),
    radiographs: Array.isArray(plan?.clinical?.radiographs)
      ? plan.clinical.radiographs.map(value => cleanText(value, 120)).slice(0, 30)
      : cleanText(plan?.clinical?.radiographs, 1500),
    notes: cleanText(plan?.clinical?.notes, 2000)
  },
  phases: (Array.isArray(plan?.phases) ? plan.phases : []).slice(0, 12).map(cleanPhase),
  alternatives: Array.isArray(plan?.alternatives)
    ? plan.alternatives.slice(0, 20).map(value => ({ option: cleanText(value?.option, 180), note: cleanText(value?.note, 300) }))
    : cleanText(plan?.alternatives, 2500),
  noTreatment: cleanText(plan?.noTreatment, 1800),
  risks: Array.isArray(plan?.risks) ? plan.risks.slice(0, 30).map(value => cleanText(value, 180)) : cleanText(plan?.risks, 2500),
  financial: {
    vatMode: ['auto', 'borne_by_state', 'standard_15', 'exempt'].includes(plan?.financial?.vatMode) ? plan.financial.vatMode : 'auto',
    paymentPlan: (Array.isArray(plan?.financial?.paymentPlan) ? plan.financial.paymentPlan : []).slice(0, 20).map(value => ({
      label: cleanText(value?.label, 160),
      amount: cleanNumber(value?.amount)
    }))
  },
  consent: { photoConsent: Boolean(plan?.consent?.photoConsent) },
  signatures: {
    patientSignature: cleanSignature(plan?.signatures?.patientSignature),
    signerName: cleanText(plan?.signatures?.signerName, 120),
    guardianRelation: cleanText(plan?.signatures?.guardianRelation, 80),
    doctorName: cleanText(plan?.signatures?.doctorName, 120),
    doctorSignedAt: cleanText(plan?.signatures?.doctorSignedAt, 80),
    witnessName: cleanText(plan?.signatures?.witnessName, 120),
    witnessSignedAt: cleanText(plan?.signatures?.witnessSignedAt, 80)
  }
});

export default async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (!(await authSession(request))) return reply({ error: 'Authentication required' }, 401);

  const url = new URL(request.url);
  const patientId = url.searchParams.get('patientId') || '';
  const date = url.searchParams.get('date') || '';
  const clinicId = url.searchParams.get('clinic') || 'clinic-1';
  if (!validPatientId(patientId) || !validDate(date) || !validClinic(clinicId)) return reply({ error: 'Invalid treatment plan key' }, 400);

  const key = `clinics/${clinicId}/days/${date}/patients/${hash(patientId)}`;
  if (request.method === 'GET') {
    const record = await store.get(key, { type: 'json', consistency: 'strong' });
    return record ? reply({ exists: true, ...record }) : reply({ exists: false, plan: null, updatedAt: 0 });
  }
  if (request.method === 'PUT') {
    let body;
    try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400); }
    if (!body?.plan || typeof body.plan !== 'object') return reply({ error: 'Invalid plan' }, 400);
    const existing = await store.get(key, { type: 'json', consistency: 'strong' });
    const plan = cleanPlan(body.plan);
    const record = { patientId, clinicId, date, plan, revision: Number(existing?.revision || 0) + 1, updatedAt: Date.now() };
    await store.setJSON(key, record);
    return reply({ ok: true, revision: record.revision, updatedAt: record.updatedAt });
  }
  return reply({ error: 'Method not allowed' }, 405);
};
