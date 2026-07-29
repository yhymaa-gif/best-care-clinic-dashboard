import { getStore } from '@netlify/blobs';
import { sendPushNotifications } from './lib/push.mjs';
import { apiHeaders, canAccessClinic, requireUser, sameOriginRequest } from './lib/session.mjs';

const headers = apiHeaders('GET,POST,PATCH,OPTIONS');
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
const store = getStore({ name: 'clinic-lab-cases', consistency: 'strong' });
const configStore = getStore({ name: 'clinic-dashboard-config', consistency: 'strong' });
const validClinic = value => /^clinic-([1-9]|1[0-5])$/.test(String(value || ''));
const cleanText = (value, max = 160) => String(value ?? '').trim().slice(0, max);
const normalizePhone = value => String(value || '').replace(/\D/g, '').slice(0, 20);
const allowedStatuses = new Set([
  'pending_send',
  'sent',
  'in_production',
  'ready_at_lab',
  'received_clinic',
  'delivered_patient',
  'needs_adjustment',
  'returned_lab',
  'cancelled'
]);

const cleanItems = items => (Array.isArray(items) ? items : [])
  .slice(0, 20)
  .map(item => ({
    code: cleanText(item?.code, 60),
    name: cleanText(item?.name, 120),
    quantity: Math.max(1, Math.min(99, Math.round(Number(item?.quantity) || 1)))
  }))
  .filter(item => item.name);

const cleanPatient = patient => ({
  id: cleanText(patient?.id, 100),
  name: cleanText(patient?.name, 100),
  file: cleanText(patient?.file, 50),
  phone: normalizePhone(patient?.phone)
});
const doctorKey = (clinicId, doctorName) => `${clinicId}:${cleanText(doctorName, 100).toLocaleLowerCase('ar').replace(/\s+/g, ' ')}`;
const readClinicAssignment = async clinicId => {
  const saved = await configStore.get('clinics', { type: 'json', consistency: 'strong' });
  const clinic = (Array.isArray(saved?.clinics) ? saved.clinics : []).find(item => String(item?.id) === clinicId);
  return {
    name: cleanText(clinic?.name, 100),
    roomNumber: cleanText(clinic?.roomNumber, 30),
    doctorName: cleanText(clinic?.doctorName, 100)
  };
};

const cleanCase = (value, fallback = {}, touch = true) => {
  const status = allowedStatuses.has(value?.status) ? value.status : (fallback.status || 'pending_send');
  const sentAt = status === 'pending_send'
    ? Number(value?.sentAt || fallback.sentAt || 0)
    : Number(value?.sentAt || fallback.sentAt || Date.now());
  return {
    id: cleanText(value?.id || fallback.id, 100),
    clinicId: cleanText(value?.clinicId || fallback.clinicId, 30),
    clinicName: cleanText(value?.clinicName || fallback.clinicName, 100),
    roomNumber: cleanText(value?.roomNumber || fallback.roomNumber, 30),
    doctorName: cleanText(value?.doctorName || fallback.doctorName, 100),
    doctorKey: cleanText(value?.doctorKey || fallback.doctorKey, 160),
    patient: cleanPatient(value?.patient || fallback.patient),
    paymentOrderId: cleanText(value?.paymentOrderId || fallback.paymentOrderId, 100),
    sourceDate: cleanText(value?.sourceDate || fallback.sourceDate, 20),
    labName: cleanText(value?.labName || fallback.labName, 100),
    customLabName: cleanText(value?.customLabName || fallback.customLabName, 100),
    items: cleanItems(value?.items?.length ? value.items : fallback.items),
    units: Math.max(1, Math.min(99, Math.round(Number(value?.units ?? fallback.units) || 1))),
    material: cleanText(value?.material ?? fallback.material, 80),
    shade: cleanText(value?.shade ?? fallback.shade, 50),
    deliveryMethod: cleanText(value?.deliveryMethod ?? fallback.deliveryMethod, 80),
    expectedAt: Number(value?.expectedAt ?? fallback.expectedAt ?? 0),
    notes: cleanText(value?.notes ?? fallback.notes, 600),
    status,
    sentAt,
    receivedAt: status === 'received_clinic' && !Number(fallback.receivedAt)
      ? Date.now()
      : Number(value?.receivedAt ?? fallback.receivedAt ?? 0),
    deliveredAt: status === 'delivered_patient' && !Number(fallback.deliveredAt)
      ? Date.now()
      : Number(value?.deliveredAt ?? fallback.deliveredAt ?? 0),
    createdAt: Number(fallback.createdAt || value?.createdAt || Date.now()),
    createdBy: cleanText(fallback.createdBy || value?.createdBy, 100),
    updatedAt: touch ? Date.now() : Number(value?.updatedAt || fallback.updatedAt || 0),
    updatedBy: cleanText(value?.updatedBy || fallback.updatedBy, 100)
  };
};

const clinicKey = clinicId => `clinics/${clinicId}`;
const readClinic = async clinicId => {
  const record = await store.get(clinicKey(clinicId), { type: 'json', consistency: 'strong' });
  return {
    clinicId,
    cases: Array.isArray(record?.cases) ? record.cases : [],
    revision: Number(record?.revision || 0),
    updatedAt: Number(record?.updatedAt || 0)
  };
};
const visibleCases = cases => cases
  .map(item => cleanCase(item, item, false))
  .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
const clinicLabel = item => `${item.clinicName || 'العيادة'} · رقم ${item.roomNumber || ''}${item.doctorName ? ` · د. ${item.doctorName}` : ''}`;
const statusCopy = status => ({
  pending_send: ['حالة معمل جديدة', 'تم إنشاء حالة معمل وبانتظار إرسالها.'],
  sent: ['سُلّمت الحالة للمعمل', 'بدأ احتساب مدة الحالة لدى المعمل.'],
  in_production: ['الحالة قيد التصنيع', 'بدأ المعمل تنفيذ الحالة.'],
  ready_at_lab: ['الحالة جاهزة لدى المعمل', 'الحالة جاهزة للاستلام من المعمل.'],
  received_clinic: ['وصلت الحالة إلى العيادة', 'وصلت الحالة ولم تُسلّم للمريض بعد.'],
  delivered_patient: ['سُلّمت الحالة للمريض', 'تم توثيق تسليم حالة المعمل للمريض.'],
  needs_adjustment: ['حالة المعمل تحتاج تعديلًا', 'تحتاج الحالة إلى تعديل قبل التسليم.'],
  returned_lab: ['أُعيدت الحالة للمعمل', 'تمت إعادة الحالة إلى المعمل للتعديل.'],
  cancelled: ['أُلغيت حالة المعمل', 'تم إلغاء حالة المعمل.']
}[status] || ['تحديث حالة معمل', 'تم تحديث حالة معمل أسنان.']);

async function notify(caseItem) {
  const [title, body] = statusCopy(caseItem.status);
  const patient = caseItem.patient?.name || 'مريض';
  const file = caseItem.patient?.file ? ` · ملف ${caseItem.patient.file}` : '';
  const laboratory = caseItem.labName === 'other'
    ? (caseItem.customLabName || 'معمل آخر')
    : (caseItem.labName || 'المعمل');
  await sendPushNotifications({
    type: 'lab',
    title,
    body: `${patient}${file} · ${laboratory} — ${body}`,
    tag: `lab-case-${caseItem.id}-${caseItem.status}`,
    clinicId: caseItem.clinicId,
    clinicLabel: clinicLabel(caseItem),
    patientName: caseItem.patient?.name || '',
    patientFile: caseItem.patient?.file || ''
  });
}

export default async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET' && !sameOriginRequest(request)) return reply({ error: 'Invalid request origin' }, 403);
  const auth = await requireUser(request);
  if (!auth.ok) return reply({ error: auth.error }, auth.status);
  const user = auth.user;
  const url = new URL(request.url);
  const requestedClinic = url.searchParams.get('clinic') || '';
  const allClinics = url.searchParams.get('scope') === 'all';

  if (request.method === 'GET') {
    if (allClinics) {
      if (user.role !== 'admin') return reply({ error: 'Admin access required' }, 403);
      const records = await Promise.all(Array.from({ length: 15 }, (_, index) => readClinic(`clinic-${index + 1}`)));
      return reply({
        scope: 'all',
        cases: visibleCases(records.flatMap(record => record.cases)),
        updatedAt: Math.max(0, ...records.map(record => record.updatedAt))
      });
    }
    const clinicId = validClinic(requestedClinic) ? requestedClinic : (validClinic(user.clinicId) ? user.clinicId : 'clinic-1');
    if (!canAccessClinic(user, clinicId)) return reply({ error: 'Clinic access denied' }, 403);
    const record = await readClinic(clinicId);
    return reply({ ...record, cases: visibleCases(record.cases) });
  }

  let body;
  try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400); }
  const clinicId = validClinic(body?.clinicId) ? body.clinicId : requestedClinic;
  if (!validClinic(clinicId)) return reply({ error: 'Invalid clinic' }, 400);
  if (!canAccessClinic(user, clinicId)) return reply({ error: 'Clinic access denied' }, 403);
  const current = await readClinic(clinicId);
  const expectedRevision = Number(body?.expectedRevision);
  if (Number.isFinite(expectedRevision) && expectedRevision >= 0 && expectedRevision !== current.revision) {
    return reply({ error: 'Revision conflict', revision: current.revision, updatedAt: current.updatedAt }, 409);
  }

  if (request.method === 'POST') {
    if (!body?.patient || !cleanText(body?.labName, 100) || !cleanItems(body?.items).length) {
      return reply({ error: 'Patient, laboratory, and procedure are required' }, 400);
    }
    const assignment = await readClinicAssignment(clinicId);
    const assignedDoctor = assignment.doctorName || cleanText(body?.doctorName, 100) || cleanText(user.displayName || user.username, 100);
    if (!assignedDoctor) return reply({ error: 'Doctor assignment is required' }, 400);
    const id = crypto.randomUUID();
    const item = cleanCase({
      ...body,
      id,
      clinicId,
      clinicName: assignment.name || cleanText(body?.clinicName, 100),
      roomNumber: assignment.roomNumber || cleanText(body?.roomNumber, 30),
      doctorName: assignedDoctor,
      doctorKey: doctorKey(clinicId, assignedDoctor),
      createdBy: user.displayName || user.username,
      updatedBy: user.displayName || user.username
    });
    const record = {
      clinicId,
      cases: [item, ...current.cases].slice(0, 1200),
      revision: current.revision + 1,
      updatedAt: Date.now()
    };
    await store.setJSON(clinicKey(clinicId), record);
    await Promise.allSettled([notify(item)]);
    return reply({ ok: true, case: item, revision: record.revision, updatedAt: record.updatedAt }, 201);
  }

  if (request.method === 'PATCH') {
    const id = cleanText(body?.id, 100);
    const index = current.cases.findIndex(item => String(item.id) === id);
    if (index < 0) return reply({ error: 'Lab case not found' }, 404);
    const previous = current.cases[index];
    const item = cleanCase({
      ...previous,
      ...body,
      id,
      clinicId,
      clinicName: previous.clinicName,
      roomNumber: previous.roomNumber,
      doctorName: previous.doctorName,
      doctorKey: previous.doctorKey || doctorKey(clinicId, previous.doctorName),
      updatedBy: user.displayName || user.username
    }, previous);
    const cases = current.cases.slice();
    cases[index] = item;
    const record = { clinicId, cases, revision: current.revision + 1, updatedAt: Date.now() };
    await store.setJSON(clinicKey(clinicId), record);
    if (item.status !== previous.status) await Promise.allSettled([notify(item)]);
    return reply({ ok: true, case: item, revision: record.revision, updatedAt: record.updatedAt });
  }

  return reply({ error: 'Method not allowed' }, 405);
};
