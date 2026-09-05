import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __test as directory } from '../netlify/functions/lib/patient-directory.mjs';
import { __test as patients } from '../netlify/functions/patients.mjs';
import { normalizePatientFile } from '../netlify/functions/lib/patient-identity.mjs';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('central patient directory preserves a complete normalized identity', () => {
  assert.deepEqual(directory.directoryPatient({
    id: ' patient-1 ',
    name: '  أحمد   محمد علي  ',
    file: '7041',
    phone: '+966 55 123 4567',
    nationalId: '1234567890'
  }), {
    id: 'patient-1',
    fullName: 'أحمد محمد علي',
    fileNo: '7041',
    mobile: '0551234567',
    nationalId: '1234567890',
    adminNotes: '',
    notesReviewed: false
  });
});

test('central patient directory prefers the more complete name and keeps corrected fields locked', () => {
  assert.equal(directory.preferValue('أحمد', 'أحمد محمد علي', { name: true }), 'أحمد محمد علي');
  assert.equal(directory.preferValue('أحمد محمد علي', 'أحمد', { name: true }), 'أحمد محمد علي');
  assert.equal(directory.preferValue('7041', '9999', { locked: true }), '7041');
  assert.equal(directory.preferValue('7041', '9999', { force: true, locked: true }), '9999');
});

test('CSV import uses an existing file number to correct the name without blank-data regression', () => {
  assert.equal(directory.authoritativeImportName('دعاء الحسن العطوي', 'ملاك الحسن الحفظي', { matchedByFile: true, locked: true }), 'ملاك الحسن الحفظي');
  assert.equal(directory.authoritativeImportName('ملاك الحسن الحفظي', 'ملاك', { matchedByFile: true, locked: true }), 'ملاك الحسن الحفظي');
  assert.equal(directory.authoritativeImportField('0551112233', '', { matchedByFile: true }), '0551112233');
  assert.equal(directory.authoritativeImportField('0551112233', '0559998877', { matchedByFile: true, valid: true }), '0559998877');
  assert.equal(directory.authoritativeImportField('0551112233', '123', { matchedByFile: true, valid: false }), '0551112233');
});

test('literal name audit restores the exact imported name and removes hidden formatting', () => {
  const registry = {
    records: {
      patient: {
        canonical: 'patient',
        fullName: 'دعاء الحسن العطوي',
        authoritativeFullName: '\u200fملاك   الحسن الحفظي\ufeff',
        fileNo: '١٢٬٢٠٦',
        aliases: ['file:12206'],
        importedAt: 50,
        nameVerifiedAt: 50,
        nameVerificationSource: 'file_import'
      }
    },
    aliases: { 'file:12206': 'patient' },
    revision: 3,
    updatedAt: 20
  };
  const result = directory.reconcileDirectorySnapshot(registry, { now: 100, actor: 'literal-audit' });
  assert.equal(directory.enrichPatientFromDirectory(registry, { name: 'دعاء', file: '12206' }).name, 'ملاك الحسن الحفظي');
  assert.equal(result.changed, true);
  assert.equal(result.correctedNames, 1);
  assert.equal(result.registry.records.patient.fullName, 'ملاك الحسن الحفظي');
  assert.equal(result.registry.records.patient.authoritativeFullName, 'ملاك الحسن الحفظي');
  assert.equal(result.registry.records.patient.fileNo, '12206');
  assert.ok(result.registry.records.patient.lockedFields.includes('fullName'));
  assert.equal(normalizePatientFile('١٢٬٢٠٦.0'), '12206');
});

test('an exact imported name remains authoritative over an older appointment spelling', () => {
  const registry = {
    records: {
      patient: {
        canonical: 'patient',
        fullName: 'ملاك الحسن الحفظي',
        authoritativeFullName: 'ملاك الحسن الحفظي',
        fileNo: '12206',
        importedAt: 80,
        lockedFields: ['fullName'],
        aliases: ['file:12206']
      }
    },
    aliases: { 'file:12206': 'patient' }
  };
  const enriched = directory.enrichPatientFromDirectory(registry, { name: 'دعاء الحسن العطوي', file: '12206' });
  assert.equal(enriched.name, 'ملاك الحسن الحفظي');
  assert.equal(directory.nameForRoutineUpdate(registry.records.patient, 'دعاء الحسن العطوي'), 'ملاك الحسن الحفظي');
});

test('the smart audit promotes names from earlier imports into protected literal references', () => {
  const registry = {
    records: { patient: { canonical: 'patient', fullName: 'ملاك الحسن الحفظي', fileNo: '12206', importedAt: 80, aliases: ['file:12206'] } },
    aliases: { 'file:12206': 'patient' },
    revision: 1
  };
  const first = directory.reconcileDirectorySnapshot(registry, { now: 100 });
  assert.equal(first.changed, true);
  assert.equal(first.registry.records.patient.authoritativeFullName, 'ملاك الحسن الحفظي');
  assert.ok(first.registry.records.patient.lockedFields.includes('fullName'));
  const second = directory.reconcileDirectorySnapshot(first.registry, { now: 110 });
  assert.equal(second.changed, false);
  assert.equal(second.registry.revision, first.registry.revision);
});

test('smart reconciliation keeps one complete patient record per file number', () => {
  const registry = {
    records: {
      old: { canonical: 'old', fullName: 'ملاك', fileNo: '7041', mobile: '0501111111', aliases: ['file:7041'], updatedAt: 10 },
      updated: { canonical: 'updated', fullName: 'ملاك الحسن الحفظي', fileNo: '7041', nationalId: '1234567890', aliases: ['file:7041', 'national:1234567890'], importedAt: 20, updatedAt: 20 },
      separate: { canonical: 'separate', fullName: 'مريض آخر كامل', fileNo: '9000', mobile: '0501111111', aliases: ['file:9000'], updatedAt: 30 }
    },
    aliases: { 'file:7041': 'updated', 'national:1234567890': 'updated', 'file:9000': 'separate', 'phone:0501111111': 'old' },
    revision: 5,
    updatedAt: 5
  };
  const result = directory.reconcileDirectorySnapshot(registry, { now: 100, actor: 'test' });
  assert.equal(result.changed, true);
  assert.equal(result.duplicateRecordsMerged, 1);
  assert.equal(result.correctedNames, 1);
  assert.equal(Object.keys(result.registry.records).length, 2);
  assert.equal(result.registry.records.updated.fullName, 'ملاك الحسن الحفظي');
  assert.equal(result.registry.records.updated.mobile, '0501111111');
  assert.equal(result.registry.aliases['file:7041'], 'updated');
  assert.equal(result.registry.records.separate.fullName, 'مريض آخر كامل');
});

test('smart name correction is idempotent after duplicate cleanup', () => {
  const registry = { records: { one: { canonical: 'one', fullName: 'اسم مريض كامل', fileNo: '12', aliases: ['file:12'] } }, aliases: { 'file:12': 'one' }, revision: 2, updatedAt: 1 };
  const result = directory.reconcileDirectorySnapshot(registry, { now: 100 });
  assert.equal(result.changed, false);
  assert.equal(result.duplicateRecordsMerged, 0);
  assert.equal(result.registry.revision, 2);
});

test('administration exposes an intelligent file-based name correction control', async () => {
  const [html, dashboard, endpoint, source, styles] = await Promise.all([read('index.html'), read('dashboard.js'), read('netlify/functions/patients.mjs'), read('netlify/functions/lib/patient-directory.mjs'), read('dashboard.css')]);
  assert.match(html, /id="patientNameSmartCorrectionBtn"/);
  assert.match(dashboard, /function runSmartPatientNameCorrection\(/);
  assert.match(dashboard, /action:'reconcile_names'/);
  assert.match(endpoint, /body\?\.action === 'reconcile_names'/);
  assert.match(source, /reconcileDirectorySnapshot\(nextRegistry/);
  assert.match(styles, /patient-directory-action\.smart-correction/);
});

test('legacy appointments resolve to the complete central patient identity', () => {
  const record = {
    canonical: 'patient-7041',
    fullName: 'دعاء الحسن العطوي',
    fileNo: '7041',
    mobile: '0551234567',
    nationalId: '1234567890',
    aliases: ['file:7041', 'file:OLD7041', 'phone:0551234567', 'national:1234567890']
  };
  const registry = {
    records: { 'patient-7041': record },
    aliases: {
      'file:7041': 'patient-7041',
      'file:OLD7041': 'patient-7041',
      'phone:0551234567': 'patient-7041',
      'national:1234567890': 'patient-7041'
    }
  };
  assert.equal(directory.resolveDirectoryPatient(registry, { name: 'دعاء', file: 'OLD-7041' }), record);
  assert.deepEqual(directory.enrichPatientFromDirectory(registry, { id: 'appointment-1', name: 'دعاء', file: '7041' }), {
    id: 'appointment-1',
    name: 'دعاء الحسن العطوي',
    fullName: 'دعاء الحسن العطوي',
    file: '7041',
    fileNo: '7041',
    phone: '0551234567',
    mobile: '0551234567',
    nationalId: '1234567890'
  });
});

test('mobile fallback refuses to guess when a number is shared', () => {
  const registry = { records: {
    first: { canonical: 'first', fullName: 'المريض الأول', mobile: '0551112233', aliases: ['phone:0551112233'] },
    second: { canonical: 'second', fullName: 'المريض الثاني', mobile: '0551112233', aliases: ['phone:0551112233'] }
  }, aliases: { 'phone:0551112233': 'first' } };
  assert.equal(directory.resolveDirectoryPatient(registry, { name: 'مريض', phone: '0551112233' }), null);
});

test('central patient directory keeps recent appointment context for future visits', () => {
  const snapshot = directory.appointmentSnapshot({
    id: 'p-1', start: '15:30', end: '16:00', status: 'arrived', procedure: 'مراجعة', treatmentPlanStatus: 'doctor_approved'
  }, { clinicId: 'clinic-3', date: '2026-08-05', updatedAt: 1000 });
  assert.equal(snapshot.key, 'clinic-3|2026-08-05|p-1');
  assert.equal(snapshot.treatmentPlanStatus, 'doctor_approved');
  assert.equal(snapshot.updatedAt, 1000);
});

test('central patient endpoint understands legacy and multi-clinic appointment storage', () => {
  assert.deepEqual(patients.parseDayKey('days/2026-08-05'), { clinicId: 'clinic-1', date: '2026-08-05' });
  assert.deepEqual(patients.parseDayKey('clinics/clinic-15/days/2026-08-05'), { clinicId: 'clinic-15', date: '2026-08-05' });
  assert.equal(patients.parseDayKey('clinics/clinic-16/days/2026-08-05'), null);
});

test('patient corrections propagate to appointments, plans, prescriptions, labs, and the directory', async () => {
  const [profile, state, dashboard, prescription, treatmentPlan, toml] = await Promise.all([
    read('netlify/functions/patient-profile.mjs'),
    read('netlify/functions/state.mjs'),
    read('dashboard.js'),
    read('prescription.js'),
    read('treatment-plan.js'),
    read('netlify.toml')
  ]);
  assert.match(profile, /clinic-prescriptions/);
  assert.match(profile, /correctDirectoryPatient/);
  assert.match(profile, /prescriptionUpdates/);
  assert.match(profile, /labUpdates/);
  assert.match(profile, /planUpdates/);
  assert.match(state, /upsertPatientDirectory/);
  assert.match(dashboard, /const PATIENTS_API='\/api\/patients'/);
  assert.match(dashboard, /VIEW_MODE==='admin'\?\(String\(displayPatient\.name/);
  assert.match(dashboard, /function patientWithDirectoryIdentity\(patient\)/);
  assert.match(dashboard, /name:rawName\?rawName\.replace/);
  assert.match(prescription, /preferCompleteName\(patient\.name,storedPatient\.name\)/);
  assert.match(treatmentPlan, /preferCompleteName\(state\.patient\.fullName,source\.name\)/);
  assert.match(treatmentPlan, /state\.patient\.fullName\|\|'—'/);
  assert.match(toml, /from = "\/api\/patients"/);
});

test('editing a scheduled patient queues one central identity correction with the same save', async () => {
  const [dashboard, profileSource, directorySource] = await Promise.all([
    read('dashboard.js'),
    read('netlify/functions/patient-profile.mjs'),
    read('netlify/functions/lib/patient-directory.mjs')
  ]);
  assert.match(dashboard, /directoryCorrections:\[\]/);
  assert.match(dashboard, /function queuePatientDirectoryCorrection\(/);
  assert.match(dashboard, /function flushPatientDirectoryCorrections\(/);
  assert.match(dashboard, /directoryCorrections:sync\.directoryCorrections\.map/);
  assert.match(dashboard, /queuePatientDirectoryCorrection\(existing,item\)/);
  assert.match(dashboard, /allowIncomplete:true/);
  assert.match(profileSource, /allowIncomplete/);
  assert.match(profileSource, /correctionId/);
  assert.match(directorySource, /lastCorrectionId/);
});

test('patient lookup searches the central directory before historical appointments', async () => {
  const source = await read('netlify/functions/patient-lookup.mjs');
  assert.match(source, /getPatientDirectory/);
  assert.match(source, /source:'directory'/);
  assert.match(source, /directoryRecordInScope/);
});

test('manual patient additions retain a tiny recent-addition marker through state cleaning', async () => {
  const [dashboard, state, styles] = await Promise.all([
    read('dashboard.js'),
    read('netlify/functions/state.mjs'),
    read('dashboard.css')
  ]);
  assert.match(dashboard, /addedAt:Number\(existing\?\.addedAt\|\|\(!editingId\?Date\.now\(\):0\)\)/);
  assert.match(dashboard, /patient-new-badge/);
  assert.match(state, /addedAt:Number\(p\?\.addedAt\|\|0\)/);
  assert.match(styles, /patient-new-badge/);
});

test('operations center exposes an independent visible close action', async () => {
  const [dashboard, html, styles] = await Promise.all([
    read('dashboard.js'),
    read('index.html'),
    read('dashboard.css')
  ]);
  assert.match(html, /id="treatmentPlanCenterClose"/);
  assert.match(html, /id="treatmentPlanCenterDone"/);
  assert.match(dashboard, /data-center-close/);
  assert.match(dashboard, /closeModal\('treatmentPlanCenterModal'\)/);
  assert.match(styles, /treatment-plan-center-footer/);
});

test('central patient list import preserves full names and updates matched identities', async () => {
  const [dashboard, html, endpoint, directorySource] = await Promise.all([
    read('dashboard.js'),
    read('index.html'),
    read('netlify/functions/patients.mjs'),
    read('netlify/functions/lib/patient-directory.mjs')
  ]);
  assert.match(html, /id="patientDirectoryImportShortcutBtn"/);
  assert.match(html, /id="patientDirectoryFileInput"/);
  assert.match(html, /استيراد قائمة مرضى كاملة/);
  assert.match(dashboard, /function parsePatientDirectoryCsv\(/);
  assert.match(dashboard, /function mergePatientDirectoryImportRows\(/);
  assert.match(dashboard, /input\.click\(\);/);
  assert.match(dashboard, /openModal\('patientIdentitySearchModal'\);showPatientIdentitySearchView\(\);closePatientDirectoryPanels\(\);/);
  assert.match(dashboard, /الاسم غير مكتمل/);
  assert.match(dashboard, /جارٍ المطابقة والتحديث/);
  assert.match(endpoint, /request\.method === 'POST'/);
  assert.match(endpoint, /importPatientDirectory/);
  assert.match(directorySource, /fullName: preferValue\(existing\.fullName, patient\.fullName/);
  assert.match(directorySource, /resolveCanonical\(records, aliases, patient\)/);
  assert.match(directorySource, /result\.updated \+= 1/);
});

test('shared mobile numbers never merge patients with different file numbers', () => {
  const first = directory.directoryPatient({ fullName: 'مريض أول كامل', fileNo: '1001', mobile: '0551112233' });
  const second = directory.directoryPatient({ fullName: 'مريض ثان كامل', fileNo: '1002', mobile: '0551112233' });
  const firstCanonical = 'first-canonical';
  const records = { [firstCanonical]: { ...first, canonical: firstCanonical } };
  const aliases = { 'file:1001': firstCanonical, 'phone:0551112233': firstCanonical };
  const resolution = directory.resolveCanonical(records, aliases, second);
  assert.notEqual(resolution.canonical, firstCanonical);
  assert.equal(resolution.sharedPhoneCanonical, firstCanonical);
  assert.deepEqual(directory.reviewFlagsFor(second, { sharedPhone: true }), ['shared_phone']);
});

test('incomplete imported identities are retained for explicit admin correction', () => {
  assert.deepEqual(directory.reviewFlagsFor({ fullName: 'هند', fileNo: '', mobile: '0551234567' }), ['full_name_required', 'missing_file']);
  assert.deepEqual(directory.reviewFlagsFor({ fullName: 'هند محمد', fileNo: '7041', mobile: '' }), ['missing_phone']);
});

test('patient import deployment cannot mix a fresh page with stale cached controls', async () => {
  const [dashboard, html, serviceWorker] = await Promise.all([
    read('dashboard.js'),
    read('index.html'),
    read('service-worker.js')
  ]);
  assert.match(dashboard, /patientDirectoryImportShortcutBtn'\)\?\.addEventListener/);
  assert.match(dashboard, /patientDirectoryFileInput'\)\?\.addEventListener/);
  assert.match(html, /dashboard\.js\?v=20260902-literal-name-audit/);
  assert.match(serviceWorker, /request\.destination==='script'\|\|request\.destination==='style'/);
  assert.match(serviceWorker, /20260905-photo-consent-legacy/);
});

test('administration endpoints enrich names without exposing full names to the clinic response', async () => {
  const [state, adminPatients] = await Promise.all([
    read('netlify/functions/state.mjs'),
    read('netlify/functions/admin-patients.mjs')
  ]);
  assert.match(state, /if\(auth\.user\?\.role!=='admin'\)return reply\(\{exists:true,\.\.\.state/);
  assert.match(state, /enrichPatientFromDirectory\(patientDirectory,patient\)/);
  assert.match(adminPatients, /patients\.map\(patient =>/);
  assert.match(adminPatients, /enrichPatientFromDirectory\(patientDirectory, patient\)/);
});

test('central patient directory visually distinguishes complete and incomplete records', async () => {
  const [dashboard, styles] = await Promise.all([read('dashboard.js'), read('dashboard.css')]);
  assert.match(dashboard, /scheduleReady=completeName&&completeFile&&completeMobile,recordComplete=scheduleReady/);
  assert.match(dashboard, /patient-directory-table-head/);
  assert.match(dashboard, /عرض التفاصيل/);
  assert.match(styles, /patient-identity-result\.complete/);
  assert.match(styles, /patient-identity-result\.incomplete/);
  assert.match(styles, /patient-directory-table-row/);
});

test('clinic flow exposes an actionable next-patient hand-off with complete timing details', async () => {
  const [dashboard, html, styles] = await Promise.all([
    read('dashboard.js'),
    read('index.html'),
    read('dashboard.css')
  ]);
  assert.match(html, /id="nextPatientCallout"/);
  assert.match(html, /id="nextPatientStart"/);
  assert.match(html, /id="nextPatientEnd"/);
  assert.match(html, /id="nextPatientDuration"/);
  assert.match(html, /id="nextPatientCallBtn"/);
  assert.match(dashboard, /nextPatientCallBtn/);
  assert.match(dashboard, /button.dataset.nextCallId/);
  assert.match(dashboard, /appointmentExitTime\(nextPatient\)/);
  assert.match(styles, /next-patient-detail-grid/);
  assert.match(styles, /next-patient-actions/);
});
