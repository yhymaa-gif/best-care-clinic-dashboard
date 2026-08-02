import test from 'node:test';
import assert from 'node:assert/strict';
import { __test as stats } from '../netlify/functions/statistics.mjs';

test('date helpers include both boundaries', () => {
  assert.equal(stats.daysBetween('2026-07-01', '2026-07-30'), 30);
  assert.equal(stats.addDays('2026-07-30', 1), '2026-07-31');
});

test('day keys support clinic one legacy storage and scoped clinics', () => {
  assert.deepEqual(stats.parseDayKey('days/2026-07-30'), { clinicId: 'clinic-1', date: '2026-07-30' });
  assert.deepEqual(stats.parseDayKey('clinics/clinic-15/days/2026-07-30'), { clinicId: 'clinic-15', date: '2026-07-30' });
  assert.equal(stats.parseDayKey('clinics/clinic-16/days/2026-07-30'), null);
});

test('summary counts appointments, unique patients, payments, plans and lab cases', () => {
  const clinics = [
    { id: 'clinic-1', name: 'العيادة 1', doctorName: 'طبيب 1', roomNumber: '1' },
    { id: 'clinic-2', name: 'العيادة 2', doctorName: 'طبيب 2', roomNumber: '2' },
  ];
  const output = stats.summarize({
    from: '2026-07-30',
    to: '2026-07-30',
    clinicFilter: 'all',
    clinics,
    records: [
      {
        clinicId: 'clinic-1',
        date: '2026-07-30',
        patients: [
          { file: '100', phone: '0500000001', status: 'done', start: '14:00', actualStartedAt: Date.UTC(2026, 6, 30, 11, 10), paymentRequired: true, paymentCompletedAt: 1 },
          { file: '200', phone: '0500000002', status: 'cancel', start: '15:00' },
        ],
      },
      {
        clinicId: 'clinic-2',
        date: '2026-07-30',
        patients: [
          { file: '100', phone: '0500000001', status: 'waiting', start: '16:00', paymentRequired: true },
        ],
      },
    ],
    plans: [{ clinicId: 'clinic-1', status: 'submitted', updatedAt: Date.UTC(2026, 6, 30, 9) }],
    labCases: [{ clinicId: 'clinic-2', status: 'in_production', createdAt: Date.UTC(2026, 6, 30, 9) }],
    communicationEvents: [
      { id: 'review-1', kind: 'review_whatsapp', clinicId: 'clinic-1', at: Date.UTC(2026, 6, 30, 9) },
      { id: 'review-2', kind: 'review_whatsapp', clinicId: 'clinic-2', at: Date.UTC(2026, 6, 30, 10) },
      { id: 'plan-1', kind: 'plan_whatsapp', clinicId: 'clinic-1', at: Date.UTC(2026, 6, 30, 11) },
      { id: 'review-outside', kind: 'review_whatsapp', clinicId: 'clinic-1', at: Date.UTC(2026, 6, 29, 9) },
      { id: 'review-1', kind: 'review_whatsapp', clinicId: 'clinic-1', at: Date.UTC(2026, 6, 30, 9) },
    ],
  });
  assert.equal(output.summary.appointments, 3);
  assert.equal(output.summary.uniquePatients, 2);
  assert.equal(output.summary.completed, 1);
  assert.equal(output.summary.cancelled, 1);
  assert.equal(output.summary.paymentPending, 1);
  assert.equal(output.summary.planTotal, 1);
  assert.equal(output.summary.labActive, 1);
  assert.equal(output.summary.averageDelayMinutes, 10);
  assert.equal(output.summary.reviewWhatsappShares, 2);
  assert.deepEqual(output.communicationCounts, { planWhatsapp: 1, reviewWhatsapp: 2 });
});

test('WhatsApp communication statistics respect clinic and Riyadh date filters', () => {
  const output = stats.summarize({
    from: '2026-07-30',
    to: '2026-07-30',
    clinicFilter: 'clinic-1',
    clinics: [{ id: 'clinic-1', name: 'العيادة 1', doctorName: '', roomNumber: '1' }],
    records: [], plans: [], labCases: [],
    communicationEvents: [
      { id: 'one', kind: 'review_whatsapp', clinicId: 'clinic-1', at: Date.UTC(2026, 6, 29, 21, 30) },
      { id: 'two', kind: 'review_whatsapp', clinicId: 'clinic-2', at: Date.UTC(2026, 6, 29, 22) },
      { id: 'three', kind: 'plan_whatsapp', clinicId: 'clinic-1', at: Date.UTC(2026, 6, 30, 8) },
    ],
  });
  assert.equal(output.summary.reviewWhatsappShares, 1);
  assert.deepEqual(output.communicationCounts, { planWhatsapp: 1, reviewWhatsapp: 1 });
});

test('empty summary remains finite and zeroed', () => {
  const output = stats.summarize({
    from: '2026-07-30',
    to: '2026-07-30',
    clinicFilter: 'all',
    clinics: [],
    records: [],
    plans: [],
    labCases: [],
  });
  assert.equal(output.summary.appointments, 0);
  assert.equal(output.summary.completionRate, 0);
  assert.equal(output.summary.averageDelayMinutes, 0);
  assert.equal(output.summary.reviewWhatsappShares, 0);
});
