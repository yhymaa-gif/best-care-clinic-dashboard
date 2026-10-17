import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeImport, planImport, mergeDay } from '../netlify/functions/lib/appointment-import-model.mjs';
import { createImportHandler } from '../netlify/functions/lib/appointment-import-handler.mjs';
import { insertApprovedPatientDirectory } from '../netlify/functions/lib/patient-directory.mjs';

const source = (overrides = {}) => ({
  source: 'secretary_image_import', report_date: '2026-10-04', clinic_id: 'clinic-3',
  image_hash: 'a'.repeat(64), row_count: 1,
  appointments: [{ name: 'أحمد محمد', file_number: '4934', mobile: '0501234567',
    start_time: '17:40', end_time: '18:15', procedure: 'مراجعة' }], ...overrides
});
const directory = { records: {}, aliases: {}, revision: 0 };

test('validates report date, count, mobile, and times without defaulting to today', () => {
  assert.throws(() => normalizeImport(source({ report_date: '2026-02-30' })), /report_date/);
  assert.throws(() => normalizeImport(source({ row_count: 2 })), /row count/);
  const invalid = normalizeImport(source({ appointments: [{ ...source().appointments[0], mobile: '123', end_time: '16:00' }] }));
  assert.deepEqual(invalid.appointments[0].issues, ['mobile_invalid', 'time_invalid']);
});

test('merge preserves unrelated patients and detects existing/time update/duplicates', () => {
  const input = normalizeImport(source());
  const plan = planImport(input, directory, { patients: [] });
  assert.equal(plan.counts.NEW, 1);
  const unrelated = { id: 'other', name: 'خالد محمد', file: '999', phone: '0511111111', start: '12:00', end: '13:00' };
  const merged = mergeDay({ patients: [unrelated], revision: 2, notes: 'keep' }, input, plan, 10);
  assert.equal(merged.patients.length, 2);
  assert.equal(merged.patients[0], unrelated);
  assert.equal(merged.notes, 'keep');
  assert.equal(merged.date, '2026-10-04');
  assert.equal(planImport(input, directory, merged).counts.EXISTING, 1);
  const moved = normalizeImport(source({ appointments: [{ ...source().appointments[0], start_time: '18:00', end_time: '18:30' }] }));
  assert.equal(planImport(moved, directory, merged).counts.REVIEW_REQUIRED, 1);
  const repeated = normalizeImport(source({ row_count: 2, appointments: [source().appointments[0], source().appointments[0]] }));
  assert.equal(planImport(repeated, directory, { patients: [] }).counts.CONFLICT, 1);
});

test('a previously deleted imported appointment remains in review', () => {
  const input = normalizeImport(source());
  const initial = planImport(input, directory, { patients: [] });
  const deletedId = `import-${initial.rows[0].fingerprint.slice(0, 32)}`;
  const plan = planImport(input, directory, { patients: [], deletedPatientIds: [deletedId] });
  assert.equal(plan.counts.REVIEW_REQUIRED, 1);
  assert.equal(plan.rows[0].reason, 'previously_deleted');
  assert.equal(plan.can_execute, false);
});

test('shared mobile and name conflict are never auto-published', () => {
  const input = normalizeImport(source());
  const shared = { records: { a: { canonical: 'a', fullName: 'أحمد محمد', mobile: '0501234567' },
    b: { canonical: 'b', fullName: 'محمد أحمد', mobile: '0501234567' } } };
  assert.equal(planImport(input, shared, { patients: [] }).counts.REVIEW_REQUIRED, 1);
  const wrong = { records: { a: { canonical: 'a', fullName: 'شخص مختلف', fileNo: '4934', mobile: '0501234567' } } };
  assert.equal(planImport(input, wrong, { patients: [] }).counts.CONFLICT, 1);
});

test('a same-day identity or appointment detail change is never EXISTING', () => {
  const input = normalizeImport(source());
  const base = { id: 'p1', file: '4934', phone: '0501234567', name: 'أحمد محمد',
    start: '17:40', end: '18:15', procedure: 'مراجعة' };
  assert.equal(planImport(input, directory, { patients: [{ ...base, name: 'محمد صالح' }] }).counts.CONFLICT, 1);
  assert.equal(planImport(input, directory, { patients: [{ ...base, procedure: 'كشف جديد' }] }).counts.REVIEW_REQUIRED, 1);
  assert.equal(planImport(input, directory, { patients: [{ ...base, end: '18:30' }] }).counts.REVIEW_REQUIRED, 1);
  assert.equal(planImport(input, directory, { patients: [{ ...base, start: '17:45' }] }).counts.REVIEW_REQUIRED, 1);
});

test('file and date reject objects, oversize values, and silent truncation', () => {
  assert.throws(() => normalizeImport(source({ report_date: { value: '2026-10-04' } })), /report_date/);
  assert.throws(() => normalizeImport(source({ report_date: '2026-10-04-extra' })), /report_date/);
  assert.throws(() => normalizeImport(source({ appointments: [{ ...source().appointments[0], file_number: { value: '4934' } }] })), /file_number/);
  assert.throws(() => normalizeImport(source({ appointments: [{ ...source().appointments[0], file_number: 'A'.repeat(41) }] })), /file_number/);
  assert.throws(() => normalizeImport(source({ appointments: [{ ...source().appointments[0], appointment_date: { value: '2026-10-04' } }] })), /appointment_date/);
});

function memoryStores() {
  const blobs = new Map(); let version = 0;
  const stores = new Map();
  return name => {
    if (!stores.has(name)) stores.set(name, {
      async get(key) { return blobs.get(`${name}:${key}`)?.data || null; },
      async getWithMetadata(key) { const item = blobs.get(`${name}:${key}`); return item ? { data: item.data, etag: item.etag } : null; },
      async setJSON(key, data, options = {}) {
        const id = `${name}:${key}`; const current = blobs.get(id);
        if (options.onlyIfNew && current || options.onlyIfMatch && current?.etag !== options.onlyIfMatch) return { modified: false };
        const etag = `etag-${++version}`; blobs.set(id, { data, etag }); return { modified: true, etag };
      }
    });
    return stores.get(name);
  };
}

test('service preview and execute are idempotent and use conditional day merge', async () => {
  const priorSecret = process.env.BEST_CARE_OFFICE_SERVICE_TOKEN;
  process.env.BEST_CARE_OFFICE_SERVICE_TOKEN = 's'.repeat(40);
  try {
    const getStore = memoryStores();
    const deps = { getStore, getPatientDirectory: async () => directory,
      insertApprovedPatientDirectory: async () => ({ changed: true }) };
    const call = async (mode, body, key = 'import-key-123') => {
      const handler = createImportHandler({ mode, deps });
      const response = await handler(new Request('https://example.net/api/appointment-imports', {
        method: 'POST', headers: { authorization: `Bearer ${process.env.BEST_CARE_OFFICE_SERVICE_TOKEN}`,
          'idempotency-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body)
      }));
      return { status: response.status, data: await response.json() };
    };
    const payload = source();
    const withoutPreview = await call('execute', { payload, preview: { can_execute: true } });
    assert.equal(withoutPreview.status, 409);
    assert.match(withoutPreview.data.error, /Saved preview/);
    const preview = await call('preview', { payload });
    assert.equal(preview.status, 200);
    assert.equal(preview.data.can_execute, true);
    const tampered = await call('execute', { payload, preview: { ...preview.data, appointments_added: 0 } });
    assert.equal(tampered.status, 409);
    assert.match(tampered.data.error, /modified/);
    const saved = await call('execute', { payload, preview: preview.data });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.appointments_added, 1);
    const retry = await call('execute', { payload, preview: preview.data });
    assert.deepEqual(retry.data, saved.data);
    const day = await getStore('clinic-dashboard-days').get('clinics/clinic-3/days/2026-10-04');
    assert.equal(day.patients.length, 1);
    const secondPreview = await call('preview', { payload }, 'import-key-456');
    assert.equal(secondPreview.data.appointments_existing, 1);
  } finally {
    if (priorSecret === undefined) delete process.env.BEST_CARE_OFFICE_SERVICE_TOKEN;
    else process.env.BEST_CARE_OFFICE_SERVICE_TOKEN = priorSecret;
  }
});

test('insert-only Patient Master rejects a claimed identity and preserves all existing records', async () => {
  const original = { canonical: 'old', fullName: 'اسم أصلي', fileNo: '111', mobile: '0511111111' };
  const saved = { records: { old: original }, aliases: { 'file:111': 'old', 'phone:0511111111': 'old' }, revision: 1 };
  let etag = 'e1'; let writes = 0;
  const fakeStore = {
    async getWithMetadata() { return { data: saved, etag }; },
    async setJSON(key, value, conditions) { writes += 1; assert.deepEqual(conditions, { onlyIfMatch: 'e1' });
      Object.assign(saved, value); etag = 'e2'; return { modified: true }; }
  };
  const base = { id: 'n1', name: 'أحمد محمد', file: '4934', phone: '0501234567' };
  await assert.rejects(insertApprovedPatientDirectory([base], { store: fakeStore, expectedRevision: 0 }), /revision conflict/);
  await assert.rejects(insertApprovedPatientDirectory([{ ...base, file: '111' }], { store: fakeStore, expectedRevision: 1 }), /appeared/);
  assert.equal(writes, 0);
  await insertApprovedPatientDirectory([base], { store: fakeStore, expectedRevision: 1 });
  assert.equal(writes, 1);
  assert.equal(saved.records.old, original);
  assert.equal(Object.keys(saved.records).length, 2);
  await assert.rejects(insertApprovedPatientDirectory([base], { store: fakeStore, expectedRevision: 2 }), /appeared/);
  assert.equal(writes, 1);
});

test('insert-only Patient Master detects a directory race at conditional save', async () => {
  let attempted = 0;
  const fakeStore = {
    async getWithMetadata() { return { data: { records: {}, aliases: {}, revision: 0 }, etag: 'old' }; },
    async setJSON(key, value, options) { attempted += 1; assert.deepEqual(options, { onlyIfMatch: 'old' }); return { modified: false }; }
  };
  await assert.rejects(insertApprovedPatientDirectory([{ id: 'n1', name: 'أحمد محمد', file: '4934', phone: '0501234567' }],
    { store: fakeStore, expectedRevision: 0 }), /revision conflict/);
  assert.equal(attempted, 1);
});

test('directory race after day save is a persistent partial result, never success', async () => {
  const previous = process.env.BEST_CARE_OFFICE_SERVICE_TOKEN;
  process.env.BEST_CARE_OFFICE_SERVICE_TOKEN = 's'.repeat(40);
  try {
    const getStore = memoryStores();
    const deps = { getStore, getPatientDirectory: async () => directory,
      insertApprovedPatientDirectory: async () => { throw new Error('Directory revision conflict'); } };
    const key = 'partial-key-123'; const payload = source();
    const send = async (mode, body) => {
      const response = await createImportHandler({ mode, deps })(new Request('https://example.net/api/appointment-imports', {
        method: 'POST', headers: { authorization: `Bearer ${process.env.BEST_CARE_OFFICE_SERVICE_TOKEN}`,
          'idempotency-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body)
      }));
      return { status: response.status, data: await response.json() };
    };
    const preview = await send('preview', { payload });
    const result = await send('execute', { payload, preview: preview.data });
    assert.equal(result.status, 503);
    assert.equal(result.data.status, 'partial');
    const day = await getStore('clinic-dashboard-days').get('clinics/clinic-3/days/2026-10-04');
    assert.equal(day.patients.length, 1);
    const audit = await getStore('clinic-appointment-imports').get(`previews/${preview.data.import_id}`);
    assert.equal(audit.status, 'partial');
    assert.equal(audit.appointments_added, 1);
    const replay = await send('execute', { payload, preview: preview.data });
    assert.equal(replay.status, 409);
  } finally {
    if (previous === undefined) delete process.env.BEST_CARE_OFFICE_SERVICE_TOKEN;
    else process.env.BEST_CARE_OFFICE_SERVICE_TOKEN = previous;
  }
});

