import { createHash } from 'node:crypto';
import { normalizePatientFile, normalizePatientNationalId } from './patient-identity.mjs';

const hash = value => createHash('sha256').update(String(value)).digest('hex');
const text = (value, limit = 160) => String(value ?? '').trim().slice(0, limit);

// A shared telephone number is never sufficient to join clinical histories.
export function matchesSummaryIdentity(patient, identity) {
  const file = normalizePatientFile(patient?.fileNo ?? patient?.file);
  const national = normalizePatientNationalId(patient?.nationalId);
  const expectedFile = normalizePatientFile(identity?.fileNo ?? identity?.file);
  const expectedNational = normalizePatientNationalId(identity?.nationalId);
  if (national && expectedNational && national !== expectedNational) return false;
  if (national && national === expectedNational) return true;
  return Boolean(file && expectedFile && file === expectedFile);
}

export function planSummaryItems(plan) {
  return (Array.isArray(plan?.phases) ? plan.phases : []).slice(0, 12).flatMap(phase =>
    (Array.isArray(phase?.items) ? phase.items : []).slice(0, 30).map(item => ({
      name: text(item?.code === 'other' ? item.customService || item.service : item?.service),
      quantity: Number.isFinite(Number(item?.qty)) && Number(item.qty) > 0 ? Math.min(99, Number(item.qty)) : null,
      phase: text(phase?.title, 100)
    })).filter(item => item.name));
}

// Read only a small set of the newest plans; never include signatures or prices.
// Exact plan numbers prevent an addendum from replacing an older plan summary.
export async function loadPlanSummaries(plansStore, plans, limit = 4) {
  const result = [];
  for (const { canonical, record } of plans.slice(0, limit)) {
    const clinic = record.clinicId;
    const date = record.sourceDate;
    const patientId = record.sourcePatientId;
    const keys = [];
    if (date && patientId && record.planNo) keys.push(`clinics/${clinic}/versions/${hash(`${date}|${patientId}|${record.planNo}`)}`);
    if (date && patientId) {
      keys.push(`clinics/${clinic}/days/${date}/patients/${hash(patientId)}`);
      if (clinic === 'clinic-1') keys.push(`days/${date}/patients/${hash(patientId)}`);
    }
    let plan = null;
    for (const key of keys) {
      const saved = await plansStore.get(key, { type: 'json', consistency: 'strong' });
      if (saved?.plan && (!record.planNo || saved.plan.meta?.planNo === record.planNo)) { plan = saved.plan; break; }
    }
    result.push({ canonical, items: planSummaryItems(plan), detailsAvailable: Boolean(plan) });
  }
  return result;
}
