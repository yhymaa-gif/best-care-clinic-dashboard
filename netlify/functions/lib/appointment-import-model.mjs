import { createHash } from 'node:crypto';
import { normalizePatientFile, normalizePatientPhone } from './patient-identity.mjs';

const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = (value, length = 120) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, length);
const requiredString = (value, label, max) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Invalid ${label}`);
  return value.trim().replace(/\s+/g, ' ');
};
const nameKey = value => text(value).toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[ًٌٍَُِّْـ]/g, '');
const sameName = (left, right) => Boolean(nameKey(left) && nameKey(left) === nameKey(right));
const dateValid = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const time = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : '';
const clinicValid = value => /^clinic-(?:[1-9]|1[0-5])$/.test(value);
const samePatient = (left, right) => Boolean(
  left.file && right.file && left.file === right.file ||
  left.canonical && right.canonical && left.canonical === right.canonical ||
  left.temporaryId && right.temporaryId && left.temporaryId === right.temporaryId
);

export function normalizeImport(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid payload');
  const reportDate = requiredString(payload.report_date, 'report_date', 10);
  if (!dateValid(reportDate)) throw new Error('Invalid report_date');
  const clinicId = requiredString(payload.clinic_id, 'clinic_id', 20);
  if (!clinicValid(clinicId)) throw new Error('Valid clinic_id required');
  if (payload.source !== 'secretary_image_import') throw new Error('Invalid source');
  if (typeof payload.image_hash !== 'string' || !/^[0-9a-f]{64}$/i.test(payload.image_hash)) throw new Error('Valid image_hash required');
  if (!Array.isArray(payload.appointments) || !payload.appointments.length || payload.appointments.length > 300) throw new Error('Invalid appointments');
  if (!Number.isInteger(payload.row_count) || payload.row_count !== payload.appointments.length) throw new Error('Report row count mismatch');
  const appointments = payload.appointments.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Invalid appointment row ${index + 1}`);
    const rawFile = raw.file_number ?? raw.file ?? '';
    if (typeof rawFile !== 'string' || rawFile.length > 40 ||
      (rawFile.trim() && !/^[\p{L}\p{N}\s/-]+$/u.test(rawFile))) throw new Error(`Invalid file_number at row ${index + 1}`);
    const file = normalizePatientFile(rawFile);
    const rawMobile = raw.mobile ?? raw.phone;
    if (typeof rawMobile !== 'string' || rawMobile.length > 20) throw new Error(`Invalid mobile at row ${index + 1}`);
    const mobile = normalizePatientPhone(rawMobile);
    const start = time(raw.start_time ?? raw.start);
    const end = time(raw.end_time ?? raw.end);
    const name = requiredString(raw.name ?? raw.patient_name, `name at row ${index + 1}`, 120);
    const procedure = requiredString(raw.procedure ?? raw.visit_type, `procedure at row ${index + 1}`, 180);
    if (raw.temporary_patient_id !== undefined && (typeof raw.temporary_patient_id !== 'string' || raw.temporary_patient_id.length > 100)) throw new Error(`Invalid temporary_patient_id at row ${index + 1}`);
    const temporaryId = raw.temporary_patient_id?.trim() || '';
    const rawDate = raw.appointment_date === undefined ? reportDate : requiredString(raw.appointment_date, `appointment_date at row ${index + 1}`, 10);
    const issues = [];
    if (!name || name.split(' ').length < 2) issues.push('name_required');
    if (!/^05\d{8}$/.test(mobile)) issues.push('mobile_invalid');
    if (!start || !end || start >= end) issues.push('time_invalid');
    if (!procedure) issues.push('procedure_required');
    if (rawDate !== reportDate) issues.push('date_mismatch');
    if (!file && !temporaryId) issues.push('identity_required');
    return { row: index + 1, name, file, mobile, start, end, procedure, temporaryId, issues };
  });
  return { reportDate, clinicId, imageHash: payload.image_hash.toLowerCase(), appointments,
    csvBackupFilename: `appointments_${reportDate}_dashboard.csv` };
}

function directoryMatch(directory, row) {
  const records = Object.values(directory?.records || {});
  const fileMatches = row.file ? records.filter(record => normalizePatientFile(record.fileNo) === row.file) : [];
  if (fileMatches.length > 1) return { status: 'CONFLICT', reason: 'duplicate_file_in_master' };
  if (fileMatches.length === 1) {
    const record = fileMatches[0];
    if (!sameName(record.fullName, row.name)) return { status: 'CONFLICT', reason: 'file_name_conflict' };
    if (record.mobile && normalizePatientPhone(record.mobile) !== row.mobile) return { status: 'REVIEW_REQUIRED', reason: 'proposed_mobile_change' };
    return { record };
  }
  const phoneMatches = records.filter(record => normalizePatientPhone(record.mobile) === row.mobile);
  if (phoneMatches.length > 1) return { status: 'REVIEW_REQUIRED', reason: 'shared_mobile' };
  if (phoneMatches.length === 1) {
    const record = phoneMatches[0];
    if (!sameName(record.fullName, row.name)) return { status: 'CONFLICT', reason: 'mobile_name_conflict' };
    if (row.file && normalizePatientFile(record.fileNo) && normalizePatientFile(record.fileNo) !== row.file) return { status: 'CONFLICT', reason: 'mobile_file_conflict' };
    if (row.file && !normalizePatientFile(record.fileNo)) return { status: 'REVIEW_REQUIRED', reason: 'proposed_file_change' };
    return { record };
  }
  if (!row.file) return { status: 'REVIEW_REQUIRED', reason: 'temporary_id_unverified' };
  return { record: null };
}

export function planImport(normalized, directory, day) {
  const old = Array.isArray(day?.patients) ? day.patients : [];
  const existing = old.map(patient => ({
    id: text(patient.id, 100), file: normalizePatientFile(patient.file), mobile: normalizePatientPhone(patient.phone),
    start: time(patient.start), end: time(patient.end), name: text(patient.name), procedure: text(patient.procedure, 180), temporaryId: text(patient.temporaryPatientId),
    canonical: text(patient.directoryCanonical)
  }));
  const seen = new Set();
  const seenPatients = new Set();
  const rows = normalized.appointments.map(row => {
    if (row.issues.length) return { ...row, status: 'REVIEW_REQUIRED', reason: row.issues.join(',') };
    const match = directoryMatch(directory, row);
    if (match.status) return { ...row, status: match.status, reason: match.reason };
    const canonical = text(match.record?.canonical);
    const identity = row.file || row.temporaryId;
    const fingerprint = sha([normalized.reportDate, identity, row.mobile, row.start]);
    if (Array.isArray(day?.deletedPatientIds) && day.deletedPatientIds.includes(`import-${fingerprint.slice(0, 32)}`))
      return { ...row, canonical, fingerprint, status: 'REVIEW_REQUIRED', reason: 'previously_deleted' };
    if (seen.has(fingerprint)) return { ...row, canonical, fingerprint, status: 'CONFLICT', reason: 'duplicate_in_report' };
    seen.add(fingerprint);
    const patientKey = row.file || canonical || row.temporaryId;
    if (seenPatients.has(patientKey)) return { ...row, canonical, fingerprint, status: 'REVIEW_REQUIRED', reason: 'multiple_times_in_report' };
    seenPatients.add(patientKey);
    const comparable = { ...row, canonical };
    const same = existing.filter(patient => samePatient(patient, comparable));
    const exact = same.find(patient => patient.start === row.start && patient.mobile === row.mobile);
    if (exact) {
      if (!sameName(exact.name, row.name) || exact.file && row.file && exact.file !== row.file) return { ...row, canonical, fingerprint, status: 'CONFLICT', reason: 'day_identity_conflict' };
      if (exact.end !== row.end || exact.procedure !== row.procedure) return { ...row, canonical, fingerprint, status: 'REVIEW_REQUIRED', reason: 'possible_appointment_update' };
      return { ...row, canonical, fingerprint, status: 'EXISTING', existingId: exact.id };
    }
    if (same.length) {
      if (same.some(patient => !sameName(patient.name, row.name) || patient.file && row.file && patient.file !== row.file || patient.mobile && patient.mobile !== row.mobile)) return { ...row, canonical, fingerprint, status: 'CONFLICT', reason: 'day_identity_conflict' };
      return { ...row, canonical, fingerprint, status: 'REVIEW_REQUIRED', reason: 'possible_time_update' };
    }
    const sameSlot = existing.find(patient => patient.start === row.start && patient.mobile === row.mobile && !samePatient(patient, comparable));
    if (sameSlot) return { ...row, canonical, fingerprint, status: 'CONFLICT', reason: 'slot_identity_conflict' };
    return { ...row, canonical, fingerprint, status: 'NEW', newMaster: !match.record };
  });
  const counts = { NEW: 0, EXISTING: 0, UPDATED: 0, CONFLICT: 0, REVIEW_REQUIRED: 0 };
  rows.forEach(row => { counts[row.status] += 1; });
  return { rows, counts, can_execute: counts.CONFLICT === 0 && counts.REVIEW_REQUIRED === 0,
    diff_hash: sha(rows.map(row => [row.fingerprint, row.status, row.existingId || '', row.reason || ''])) };
}

export function mergeDay(day, normalized, plan, now = Date.now()) {
  const current = Array.isArray(day?.patients) ? day.patients : [];
  const added = plan.rows.filter(row => row.status === 'NEW').map(row => ({
    id: `import-${row.fingerprint.slice(0, 32)}`, name: row.name, file: row.file, phone: row.mobile,
    start: row.start, end: row.end, procedure: row.procedure, status: 'waiting',
    directoryCanonical: row.canonical, temporaryPatientId: row.temporaryId, addedAt: now, recordUpdatedAt: now
  }));
  return { ...(day || {}), date: normalized.reportDate,
    clinic: day?.clinic || { id: normalized.clinicId, name: '', doctorName: '', roomNumber: '' },
    patients: [...current, ...added], revision: Number(day?.revision || 0) + 1, updatedAt: now, updatedBy: 'office-service' };
}

export const importModelTest = { dateValid, sameName, sha };

