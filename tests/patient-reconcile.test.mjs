import assert from 'node:assert/strict';
import test from 'node:test';

import { __test as reconcile } from '../netlify/functions/patient-reconcile.mjs';

test('normalizes Saudi mobile formats and Arabic name variants', () => {
  assert.equal(reconcile.normalizePhone('966 50 123 4567'), '0501234567');
  assert.equal(reconcile.normalizePhone('+966501234567'), '0501234567');
  assert.equal(reconcile.normalizePhone('0501234567'), '0501234567');
  assert.equal(reconcile.normalizePhone('12345'), '');
  assert.equal(reconcile.normalizeName('حَلِيمَة'), reconcile.normalizeName('حليمه'));
});

test('treats an exact file number as a safe current-record correction', () => {
  const row = { id: 'r1', name: 'حليبه مسفر', file: '17887', phone: '' };
  const patients = [{
    id: 'p1',
    name: 'حليمة مسفر حامد الجايري',
    file: '17887',
    phone: '0535620106',
    sourceDate: '2026-08-04',
    updatedAt: 100,
  }];
  const result = reconcile.reconcileRow(row, patients);
  assert.equal(result.status, 'exact');
  assert.equal(result.matchType, 'file');
  assert.deepEqual(result.corrections.sort(), ['name', 'phone']);
  assert.equal(result.patient.name, 'حليمة مسفر حامد الجايري');
});

test('does not auto-apply a shared family phone number', () => {
  const row = { id: 'r2', name: 'جهانه عبدالله', file: '', phone: '0500216181' };
  const patients = [
    { name: 'جهانه عبدالله', file: '18001', phone: '0500216181', sourceDate: '2026-08-04', updatedAt: 100 },
    { name: 'شيهانة عبدالله علي القحطاني', file: '17332', phone: '0500216181', sourceDate: '2026-07-19', updatedAt: 90 },
  ];
  const result = reconcile.reconcileRow(row, patients);
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.matchType, 'phone');
  assert.equal(result.alternatives.length, 1);
});

test('allows a unique phone match only when the name supports it', () => {
  const patients = [{ name: 'خالد صلاح صالح الميلبي', file: '18023', phone: '0500010208', sourceDate: '2026-08-04', updatedAt: 100 }];
  const supported = reconcile.reconcileRow({ id: 'r3', name: 'خالد صلاح', file: '', phone: '0500010208' }, patients);
  const unsupported = reconcile.reconcileRow({ id: 'r4', name: 'محمد علي', file: '', phone: '0500010208' }, patients);
  assert.equal(supported.status, 'exact');
  assert.equal(unsupported.status, 'review');
});
