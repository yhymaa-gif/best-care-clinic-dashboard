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
          { file: '100', phone: '0500000001', status: 'done', start: '14:00', arrivedAt: Date.UTC(2026, 6, 30, 11), completedAt: Date.UTC(2026, 6, 30, 12, 30), actualStartedAt: Date.UTC(2026, 6, 30, 11, 10), paymentRequired: true, paymentCompletedAt: 1, paymentReceipts: [{ id: 'pay-1', amountCents: 125050, paidAt: Date.UTC(2026, 6, 30, 12), updatedAt: Date.UTC(2026, 6, 30, 12) }] },
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
  assert.equal(output.summary.revenueCents, 125050);
  assert.equal(output.summary.paymentTransactionCount, 1);
  assert.equal(output.daily[0].revenueCents, 125050);
  assert.equal(output.daily[0].paymentCount, 1);
  assert.equal(output.clinics[0].revenueCents, 125050);
  assert.equal(output.summary.planTotal, 1);
  assert.equal(output.summary.labActive, 1);
  assert.equal(output.summary.averageDelayMinutes, 10);
  assert.equal(output.summary.averageStayMinutes, 90);
  assert.equal(output.summary.stayMeasured, 1);
  assert.equal(output.clinics[0].averageStayMinutes, 90);
  assert.equal(output.summary.reviewWhatsappShares, 2);
  assert.deepEqual(output.communicationCounts, { planWhatsapp: 1, reviewWhatsapp: 2 });
});

test('payment receipts are de-duplicated by transaction id', () => {
  const receipt = { id: 'same-payment', amountCents: 50000, paidAt: Date.UTC(2026, 6, 30, 9) };
  const output = stats.summarize({
    from: '2026-07-30', to: '2026-07-30', clinicFilter: 'all',
    clinics: [{ id: 'clinic-1', name: 'العيادة 1', doctorName: '', roomNumber: '1' }],
    records: [{ clinicId: 'clinic-1', date: '2026-07-30', patients: [{ id: '1', status: 'done', paymentReceipts: [receipt] }, { id: '2', status: 'done', paymentReceipts: [receipt] }] }],
    plans: [], labCases: [],
  });
  assert.equal(output.summary.revenueCents, 50000);
  assert.equal(output.summary.paymentTransactionCount, 1);
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
  assert.equal(output.summary.averageStayMinutes, 0);
  assert.equal(output.summary.stayMeasured, 0);
  assert.equal(output.summary.reviewWhatsappShares, 0);
});

test('procedures are counted from completed payment items and grouped by procedure', () => {
  const output = stats.summarize({
    from: '2026-07-30', to: '2026-07-30', clinicFilter: 'all',
    clinics: [
      { id: 'clinic-1', name: 'العيادة 1', doctorName: '', roomNumber: '1' },
      { id: 'clinic-2', name: 'العيادة 2', doctorName: '', roomNumber: '2' },
    ],
    records: [
      { clinicId: 'clinic-1', date: '2026-07-30', patients: [
        { file: '1', status: 'done', paymentItems: [{ code: 'root-canal', name: 'علاج عصب', quantity: 2 }, { code: 'examination', name: 'كشف', quantity: 1, free: true }] },
        { file: '2', status: 'done', paymentItems: [] },
        { file: '3', status: 'cancel', paymentItems: [{ code: 'root-canal', name: 'علاج عصب', quantity: 1 }] },
      ] },
      { clinicId: 'clinic-2', date: '2026-07-30', patients: [
        { file: '1', status: 'done', paymentItems: [{ code: 'root-canal', name: 'علاج عصب', quantity: 1 }, { code: 'other', name: 'إجراء خاص', quantity: 1 }] },
      ] },
    ],
    plans: [], labCases: [],
  });
  assert.equal(output.summary.procedureUnits, 5);
  assert.equal(output.summary.procedureLines, 4);
  assert.equal(output.summary.procedureFreeUnits, 1);
  assert.equal(output.summary.visitsWithProcedures, 2);
  assert.equal(output.summary.completedWithoutProcedure, 1);
  assert.equal(output.summary.treatedPatients, 2);
  assert.equal(output.topProcedures[0].name, 'علاج عصب');
  assert.equal(output.topProcedures[0].count, 3);
  assert.equal(output.topProcedures[0].visits, 2);
  assert.equal(output.daily[0].procedures, 5);
  assert.equal(output.clinics[0].procedures, 3);
  assert.equal(output.clinics[0].treatedPatients, 2);
  assert.equal(output.clinics[1].procedures, 2);
});

test('lab cases sent, received, delivered and overdue follow their own timestamps', () => {
  const day = (d, h = 9) => Date.UTC(2026, 6, d, h);
  const output = stats.summarize({
    from: '2026-07-30', to: '2026-07-30', clinicFilter: 'all', now: day(31),
    clinics: [{ id: 'clinic-1', name: 'العيادة 1', doctorName: '', roomNumber: '1' }],
    records: [], plans: [],
    labCases: [
      { clinicId: 'clinic-1', status: 'in_production', createdAt: day(29), sentAt: day(30), units: 3, labName: 'معمل النخبة', items: [{ name: 'تركيب تاج', quantity: 3 }], expectedAt: day(30, 20) },
      { clinicId: 'clinic-1', status: 'delivered_patient', createdAt: day(30), sentAt: day(30), receivedAt: day(30), deliveredAt: day(30), units: 1, labName: 'other', customLabName: 'معمل خارجي', items: [{ name: 'فينير', quantity: 1 }] },
      { clinicId: 'clinic-1', status: 'pending_send', createdAt: day(30) },
      { clinicId: 'clinic-1', status: 'sent_coordination', createdAt: day(30) },
      { clinicId: 'clinic-1', status: 'cancelled', createdAt: day(30), sentAt: day(30) },
      { clinicId: 'clinic-1', status: 'sent', createdAt: day(28), sentAt: day(28) },
    ],
  });
  assert.equal(output.summary.labSent, 2);
  assert.equal(output.summary.labSentUnits, 4);
  assert.equal(output.summary.labReceived, 1);
  assert.equal(output.summary.labDelivered, 1);
  assert.equal(output.summary.labOverdue, 1);
  assert.equal(output.summary.labWaitingToSend, 2);
  assert.equal(output.summary.labOpenNow, 4);
  assert.equal(output.labStatusCounts.sent_coordination, 1);
  assert.equal(output.summary.labCreated, 4);
  assert.equal(output.topLabWork[0].name, 'تركيب تاج');
  assert.equal(output.topLabWork[0].count, 3);
  assert.deepEqual(output.labVendors.map(item => item.name).sort(), ['معمل النخبة', 'معمل خارجي'].sort());
  assert.equal(output.daily[0].labSent, 2);
  assert.equal(output.clinics[0].labSent, 2);
});

test('small windows read day blobs directly instead of listing history', () => {
  const clinics = [{ id: 'clinic-1' }, { id: 'clinic-3' }];
  assert.deepEqual(stats.directDayKeys(clinics, '2026-07-30', '2026-07-30', 'all'), ['days/2026-07-30', 'clinics/clinic-1/days/2026-07-30', 'clinics/clinic-3/days/2026-07-30']);
  assert.deepEqual(stats.directDayKeys(clinics, '2026-07-30', '2026-07-30', 'clinic-3'), ['clinics/clinic-3/days/2026-07-30']);
  assert.equal(stats.directDayKeys(clinics, '2026-01-01', '2026-07-30', 'all'), null);
});

test('day digests feed monthly and all-time totals with de-duplicated patients', () => {
  const a = stats.dayDigest('clinic-1', '2026-09-10', [
    { file: '1', status: 'done', paymentItems: [{ name: 'كشف', quantity: 1 }] },
    { file: '2', status: 'cancel', paymentItems: [{ name: 'كشف', quantity: 1 }] },
  ]);
  const b = stats.dayDigest('clinic-2', '2026-11-02', [
    { file: '1', status: 'done', paymentItems: [{ name: 'علاج عصب', quantity: 2 }] },
    { file: '3', status: 'waiting' },
  ]);
  assert.equal(a.procedureUnits, 1);
  assert.equal(a.ids.length, 2);
  assert.equal(a.treated.length, 1);
  assert.ok(!JSON.stringify(a).includes('"1"'), 'identities are stored hashed');
  const report = stats.aggregateMonths({
    digests: [a, b],
    labCases: [
      { clinicId: 'clinic-1', status: 'delivered_patient', createdAt: Date.UTC(2026, 8, 9), sentAt: Date.UTC(2026, 8, 10), deliveredAt: Date.UTC(2026, 10, 1), units: 2 },
      { clinicId: 'clinic-2', status: 'cancelled', createdAt: Date.UTC(2026, 10, 1), sentAt: Date.UTC(2026, 10, 1) },
    ],
    clinicFilter: 'all',
    currentMonth: '2026-11',
  });
  assert.deepEqual(report.months.map(item => item.month), ['2026-11', '2026-10', '2026-09']);
  assert.equal(report.months[2].labSent, 1);
  assert.equal(report.months[2].labSentUnits, 2);
  assert.equal(report.months[0].labDelivered, 1);
  assert.equal(report.months[0].procedureUnits, 2);
  assert.equal(report.total.appointments, 4);
  assert.equal(report.total.procedureUnits, 3);
  assert.equal(report.total.uniquePatients, 3);
  assert.equal(report.total.treatedPatients, 1);
  assert.equal(report.total.labSent, 1);
  assert.equal(report.total.firstMonth, '2026-09');
  const clinicTwo = stats.aggregateMonths({ digests: [a, b], labCases: [], clinicFilter: 'clinic-2', currentMonth: '2026-11' });
  assert.equal(clinicTwo.total.uniquePatients, 2);
  assert.deepEqual(clinicTwo.months.map(item => item.month), ['2026-11']);
});

test('lab attention lists overdue cases first, then cases waiting to be sent', () => {
  const day = (d, h = 9) => Date.UTC(2026, 6, d, h);
  const output = stats.summarize({
    from: '2026-07-30', to: '2026-07-30', clinicFilter: 'all', now: day(31),
    clinics: [{ id: 'clinic-1', name: 'العيادة 1', doctorName: '', roomNumber: '1' }],
    records: [], plans: [],
    labCases: [
      { id: 'w', clinicId: 'clinic-1', status: 'pending_send', createdAt: day(29), patient: { name: 'منتظر', file: '9' } },
      { id: 'o', clinicId: 'clinic-1', status: 'sent', sentAt: day(20), expectedAt: day(25), patient: { name: 'متأخر', file: '7' }, labName: 'other', customLabName: 'معمل خارجي', items: [{ name: 'تاج' }] },
      { id: 'ok', clinicId: 'clinic-1', status: 'received_clinic', expectedAt: day(25) },
    ],
  });
  assert.deepEqual(output.labAttention.map(item => [item.id, item.reason]), [['o', 'overdue'], ['w', 'waiting']]);
  assert.equal(output.labAttention[0].labName, 'معمل خارجي');
  assert.equal(output.labAttention[0].work, 'تاج');
});

test('procedures are grouped by clinical type with shares, patients and clinic split', async () => {
  const { procedureType } = await import('../netlify/functions/lib/procedure-types.mjs');
  assert.equal(procedureType('root-canal', 'علاج عصب'), 'endo');
  assert.equal(procedureType('other', 'زراعة سن أمامي'), 'implant');
  assert.equal(procedureType('', 'تاج زيركون'), 'prosthetic');
  assert.equal(procedureType('', 'فينير'), 'cosmetic');
  assert.equal(procedureType('', 'شيء غير معروف'), 'other');
  const output = stats.summarize({
    from: '2026-07-30', to: '2026-07-30', clinicFilter: 'all',
    clinics: [{ id: 'clinic-1', name: 'ع1', doctorName: '', roomNumber: '1' }, { id: 'clinic-2', name: 'ع2', doctorName: '', roomNumber: '2' }],
    records: [
      { clinicId: 'clinic-1', date: '2026-07-30', patients: [
        { file: '1', status: 'done', paymentItems: [{ code: 'root-canal', name: 'علاج عصب', quantity: 2 }, { code: 'examination', name: 'كشف', quantity: 1, free: true }] },
        { file: '2', status: 'done', paymentItems: [{ code: 'root-canal-retreatment', name: 'إعادة علاج عصب', quantity: 1 }] },
      ] },
      { clinicId: 'clinic-2', date: '2026-07-30', patients: [{ file: '3', status: 'done', paymentItems: [{ code: 'other', name: 'زراعة', quantity: 1 }] }] },
    ],
    plans: [], labCases: [],
  });
  const endo = output.procedureTypes.find(item => item.type === 'endo');
  assert.equal(output.procedureTypes[0].type, 'endo');
  assert.equal(endo.count, 3);
  assert.equal(endo.patients, 2);
  assert.equal(endo.share, 60);
  assert.equal(endo.procedures.length, 2);
  assert.equal(output.procedureTypes.find(item => item.type === 'diagnostic').free, 1);
  assert.deepEqual(output.clinics[0].procedureTypes, { endo: 3, diagnostic: 1 });
  assert.deepEqual(output.clinics[1].procedureTypes, { implant: 1 });
  const digest = stats.dayDigest('clinic-1', '2026-07-30', [{ status: 'done', paymentItems: [{ code: 'ceramic-crown', name: 'تاج', quantity: 2 }] }, { status: 'cancel', paymentItems: [{ code: 'extraction', name: 'خلع' }] }]);
  assert.deepEqual(digest.types, { prosthetic: 2 });
  const report = stats.aggregateMonths({ digests: [digest], labCases: [], clinicFilter: 'all', currentMonth: '2026-07' });
  assert.deepEqual(report.months[0].types, { prosthetic: 2 });
  assert.deepEqual(report.total.types, { prosthetic: 2 });
});

test('all-time totals list every procedure and type since the first recorded day', () => {
  const a = stats.dayDigest('clinic-1', '2026-03-04', [{ status: 'done', paymentItems: [{ code: 'root-canal', name: 'علاج عصب', quantity: 2 }, { code: 'cosmetic-filling', name: 'حشوة تجميلية' }] }]);
  const b = stats.dayDigest('clinic-2', '2026-11-20', [{ status: 'done', paymentItems: [{ code: 'root-canal', name: 'علاج عصب' }, { code: 'post-rct-filling', name: 'حشوة بعد العصب', quantity: 3 }] }]);
  const report = stats.aggregateMonths({ digests: [b, a], labCases: [], clinicFilter: 'all', currentMonth: '2026-11' });
  assert.equal(report.total.firstDate, '2026-03-04');
  assert.deepEqual(report.total.procedures.map(item => [item.name, item.count, item.type]), [['حشوة بعد العصب', 3, 'fillings'], ['علاج عصب', 3, 'endo'], ['حشوة تجميلية', 1, 'fillings']]);
  assert.deepEqual(report.total.typeList.map(item => [item.type, item.count, item.share]), [['fillings', 4, 57.1], ['endo', 3, 42.9]]);
  assert.deepEqual(report.total.clinicTypes, { 'clinic-1': { endo: 2, fillings: 1 }, 'clinic-2': { endo: 1, fillings: 3 } });
  const onlyTwo = stats.aggregateMonths({ digests: [b, a], labCases: [], clinicFilter: 'clinic-2', currentMonth: '2026-11' });
  assert.equal(onlyTwo.total.firstDate, '2026-11-20');
  assert.equal(onlyTwo.total.procedures.length, 2);
});
