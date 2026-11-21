import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../trends.js', import.meta.url), 'utf8');
const sandbox = {};
vm.runInNewContext(source, sandbox);
const T = sandbox.BestCareTrends;

test('rising activity with fewer cancellations reads as improving', () => {
  const result = T.compareSummaries(
    { uniquePatients: 120, procedureUnits: 300, revenueCents: 9_000_000, treatedPatients: 100, completed: 110, completionRate: 92, appointments: 130, cancelled: 6, labSent: 20, planTotal: 30, averageDelayMinutes: 8, paymentPending: 2, reviewWhatsappShares: 40 },
    { uniquePatients: 100, procedureUnits: 250, revenueCents: 8_000_000, treatedPatients: 85, completed: 95, completionRate: 88, appointments: 120, cancelled: 12, labSent: 18, planTotal: 28, averageDelayMinutes: 12, paymentPending: 4, reviewWhatsappShares: 30 },
  );
  assert.equal(result.verdict, 'improving');
  assert.ok(result.score > 5);
  const byKey = Object.fromEntries(result.rows.map(row => [row.key, row]));
  assert.equal(byKey.uniquePatients.status, 'improving');
  assert.equal(byKey.uniquePatients.pct, 20);
  assert.equal(byKey.cancelRate.status, 'improving');
  assert.equal(byKey.cancelRate.direction, 'down');
  assert.equal(byKey.averageDelayMinutes.status, 'improving');
  assert.equal(result.improving[0].key in byKey, true);
});

test('a broad drop reads as declining and small numbers are not judged', () => {
  const result = T.compareSummaries(
    { uniquePatients: 70, procedureUnits: 150, completed: 60, completionRate: 80, appointments: 90, cancelled: 15, labSent: 2, paymentPending: 1 },
    { uniquePatients: 100, procedureUnits: 240, completed: 90, completionRate: 90, appointments: 100, cancelled: 5, labSent: 3, paymentPending: 1 },
  );
  assert.equal(result.verdict, 'declining');
  const byKey = Object.fromEntries(result.rows.map(row => [row.key, row]));
  assert.equal(byKey.labSent.status, 'insufficient');
  assert.equal(byKey.procedureUnits.status, 'declining');
  assert.equal(result.declining[0].key, 'procedureUnits');
});

test('changes inside the stable band read as stable; empty data is insufficient', () => {
  const stable = T.compareSummaries({ uniquePatients: 102, procedureUnits: 198, completed: 90, appointments: 100, cancelled: 5, completionRate: 90 }, { uniquePatients: 100, procedureUnits: 200, completed: 92, appointments: 100, cancelled: 6, completionRate: 91 });
  assert.equal(stable.verdict, 'stable');
  assert.equal(T.compareSummaries({}, {}).verdict, 'insufficient');
});

test('clinic movers, monthly slope and month pace', () => {
  const moves = T.movers([{ clinicId: 'c1', name: 'A', procedures: 40 }, { clinicId: 'c2', name: 'B', procedures: 10 }], [{ clinicId: 'c1', procedures: 20 }, { clinicId: 'c2', procedures: 30 }]);
  assert.equal(moves[0].id, 'c2');
  assert.equal(moves.at(-1).id, 'c1');
  const months = [
    { month: '2026-08', procedureUnits: 300 }, { month: '2026-09', procedureUnits: 260 }, { month: '2026-10', procedureUnits: 220 }, { month: '2026-11', procedureUnits: 150 },
  ];
  const trend = T.monthlyTrend(months, 'procedureUnits', { currentMonth: '2026-11' });
  assert.equal(trend.direction, 'down');
  assert.equal(trend.from, '2026-08');
  const pace = T.monthPace(months, 'procedureUnits', { today: '2026-11-15' });
  assert.equal(pace.projected, 300);
  assert.equal(pace.pct, 36);
  assert.equal(pace.reliable, true);
});
