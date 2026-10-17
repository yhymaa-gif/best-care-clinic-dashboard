import { createHash, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { getPatientDirectory, insertApprovedPatientDirectory } from './patient-directory.mjs';
import { mergeDay, normalizeImport, planImport } from './appointment-import-model.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: {
  'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'
} });
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` :
  value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const equal = (left, right) => {
  const a = Buffer.from(String(left || '')); const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
};
const store = name => getStore({ name, consistency: 'strong' });
const dayKey = (clinicId, date) => clinicId === 'clinic-1' ? `days/${date}` : `clinics/${clinicId}/days/${date}`;
const readDay = async (days, key) => {
  const snapshot = await days.getWithMetadata(key, { type: 'json', consistency: 'strong' });
  return { day: snapshot?.data || null, etag: snapshot?.etag || null };
};

export function createImportHandler({ mode, deps = {} }) {
  if (!['preview', 'execute'].includes(mode)) throw new Error('Invalid handler mode');
  const get = deps.getStore || store;
  const directoryReader = deps.getPatientDirectory || getPatientDirectory;
  const directoryWriter = deps.insertApprovedPatientDirectory || insertApprovedPatientDirectory;
  return async request => {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const secret = String(process.env.BEST_CARE_OFFICE_SERVICE_TOKEN || '');
    const authorization = request.headers.get('authorization');
    if (secret.length < 32) return json({ error: 'Service identity unavailable' }, 503);
    if (!equal(authorization, `Bearer ${secret}`)) return json({ error: 'Service authorization required' }, 401);
    const key = request.headers.get('idempotency-key') || '';
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) return json({ error: 'Valid Idempotency-Key required' }, 400);
    if (!String(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return json({ error: 'JSON required' }, 415);
    const size = Number(request.headers.get('content-length') || 0);
    if (size > 1024 * 1024) return json({ error: 'Payload too large' }, 413);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    let normalized;
    try { normalized = normalizeImport(body?.payload); } catch (error) { return json({ error: error.message }, 400); }
    const payloadHash = hash(canonical(body.payload));
    const importId = hash(key).slice(0, 32);
    const journal = get('clinic-appointment-imports');
    const previewKey = `previews/${importId}`;
    const storedSnapshot = await journal.getWithMetadata(previewKey, { type: 'json', consistency: 'strong' });
    const stored = storedSnapshot?.data;
    if (stored && stored.payload_hash !== payloadHash) return json({ error: 'Idempotency-Key reused for different import' }, 409);
    if (mode === 'preview' && stored) return json(stored.preview);
    if (mode === 'execute') {
      if (!stored) return json({ error: 'Saved preview required' }, 409);
      if (stored.status === 'succeeded') return json(stored.result);
      if (stored.status !== 'previewed') return json({ error: 'Previous attempt has uncertain outcome', import_id: importId }, 409);
      if (!body.preview || canonical(body.preview) !== canonical(stored.preview)) return json({ error: 'Preview was modified' }, 409);
    }
    const days = get('clinic-dashboard-days');
    const keyDay = dayKey(normalized.clinicId, normalized.reportDate);
    const [{ day, etag }, directory] = await Promise.all([readDay(days, keyDay), directoryReader()]);
    const plan = planImport(normalized, directory, day);
    if (Number(day?.patients?.length || 0) + plan.counts.NEW > 300) return json({ error: 'Day patient limit exceeded' }, 422);
    const preview = {
      import_id: importId, report_date: normalized.reportDate, clinic_id: normalized.clinicId,
      image_hash: normalized.imageHash, appointments_detected: normalized.appointments.length,
      appointments_added: plan.counts.NEW, appointments_existing: plan.counts.EXISTING,
      appointments_updated: 0, appointments_conflicted: plan.counts.CONFLICT,
      appointments_review_required: plan.counts.REVIEW_REQUIRED,
      csv_backup_filename: normalized.csvBackupFilename, can_execute: plan.can_execute,
      day_revision: Number(day?.revision || 0), day_etag: etag,
      directory_revision: Number(directory?.revision || 0), diff_hash: plan.diff_hash, payload_hash: payloadHash,
      rows: plan.rows.map(row => ({ row: row.row, status: row.status, reason: row.reason || '' }))
    };
    if (mode === 'preview') {
      const saved = await journal.setJSON(previewKey, { import_id: importId, payload_hash: payloadHash,
        status: 'previewed', created_at: new Date().toISOString(), preview }, { onlyIfNew: true });
      if (!saved.modified) {
        const concurrent = await journal.get(previewKey, { type: 'json', consistency: 'strong' });
        if (concurrent?.payload_hash === payloadHash) return json(concurrent.preview);
        return json({ error: 'Idempotency-Key reused for different import' }, 409);
      }
      if (!plan.can_execute) await journal.setJSON(`review/${importId}`, {
        import_id: importId, report_date: normalized.reportDate, image_hash: normalized.imageHash,
        created_at: new Date().toISOString(), rows: plan.rows.filter(row => ['CONFLICT', 'REVIEW_REQUIRED'].includes(row.status))
      });
      return json(preview);
    }
    const accepted = stored.preview;
    if (accepted.can_execute !== true || !plan.can_execute || canonical(accepted) !== canonical(preview))
      return json({ error: 'Preview stale or review required' }, 409);
    const createdAt = new Date().toISOString();
    const reservation = await journal.setJSON(previewKey, { ...stored,
      status: 'executing', started_at: createdAt, report_date: normalized.reportDate,
      image_hash: normalized.imageHash, created_at: createdAt, appointments_detected: normalized.appointments.length,
      appointments_added: plan.counts.NEW, appointments_existing: plan.counts.EXISTING,
      appointments_updated: 0, appointments_conflicted: 0, appointments_review_required: 0,
      csv_backup_filename: normalized.csvBackupFilename
    }, { onlyIfMatch: storedSnapshot.etag });
    if (!reservation.modified) return json({ error: 'Import already reserved; inspect audit before retry', import_id: importId }, 409);
    const next = mergeDay(day, normalized, plan);
    const write = await days.setJSON(keyDay, next, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
    if (!write.modified) {
      await journal.setJSON(previewKey, { ...stored, status: 'revision_conflict',
        report_date: normalized.reportDate, created_at: createdAt });
      return json({ error: 'Day changed during import; preview again with a new key' }, 409);
    }
    const newMaster = plan.rows.filter(row => row.status === 'NEW' && row.newMaster).map(row => ({
      id: `import-${row.fingerprint.slice(0, 32)}`, name: row.name, file: row.file, phone: row.mobile,
      start: row.start, end: row.end, procedure: row.procedure
    }));
    let masterUpdated = false;
    try {
      if (newMaster.length) {
        const result = await directoryWriter(newMaster, { clinicId: normalized.clinicId, date: normalized.reportDate,
          expectedRevision: accepted.directory_revision, updatedAt: next.updatedAt, actor: 'office-service' });
        masterUpdated = Boolean(result?.changed);
      }
    } catch {
      const partial = { ...stored, status: 'partial', report_date: normalized.reportDate, image_hash: normalized.imageHash,
        created_at: createdAt, day_revision: next.revision, appointments_detected: normalized.appointments.length,
        appointments_added: plan.counts.NEW, appointments_existing: plan.counts.EXISTING,
        appointments_updated: 0, appointments_conflicted: 0, appointments_review_required: 0,
        csv_backup_filename: normalized.csvBackupFilename, error: 'Patient Master insert unconfirmed' };
      await journal.setJSON(previewKey, partial);
      return json({ error: 'Day saved; Patient Master insert unconfirmed', import_id: importId,
        status: 'partial', day_revision: next.revision, appointments_added: plan.counts.NEW }, 503);
    }
    const result = { status: 'succeeded', import_id: importId, report_date: normalized.reportDate,
      appointments_detected: normalized.appointments.length, appointments_added: plan.counts.NEW,
      appointments_existing: plan.counts.EXISTING, appointments_updated: 0,
      appointments_conflicted: 0, appointments_review_required: 0, day_revision: next.revision,
      patient_master_updated: masterUpdated, csv_backup_filename: normalized.csvBackupFilename };
    await journal.setJSON(previewKey, { ...stored, status: 'succeeded',
      report_date: normalized.reportDate, image_hash: normalized.imageHash, created_at: createdAt,
      appointments_detected: normalized.appointments.length, appointments_added: plan.counts.NEW,
      appointments_existing: plan.counts.EXISTING, appointments_updated: 0,
      appointments_conflicted: 0, appointments_review_required: 0,
      csv_backup_filename: normalized.csvBackupFilename, day_revision: next.revision, result });
    return json(result);
  };
}

