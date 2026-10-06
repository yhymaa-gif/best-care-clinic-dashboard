export const DRAFT_NOTICE = 'DRAFT — NOT MEDICAL ADVICE — DOCUMENTATION-ONLY — AUTHORIZED CLINICIAN SIGN-OFF REQUIRED';

const digits = value => String(value ?? '').replace(/[٠-٩]/g, digit => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit)).replace(/[۰-۹]/g, digit => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit));
export const normalizeAlias = value => digits(value).normalize('NFKC').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ').replace(/\s+/g, ' ').trim();
export function normalizeToothNumber(value, system = 'universal') {
  const raw = digits(value).trim().replace(/^#/, '').trim();
  if (!/^\d{1,2}$/.test(raw)) return null;
  const number = Number(raw);
  if (system === 'universal' && number >= 1 && number <= 32) return String(number).padStart(2, '0');
  if (system === 'fdi' && /^[1-4][1-8]$/.test(raw)) return raw;
  return null;
}

function distanceOne(left, right) {
  if (Math.abs(left.length - right.length) > 1) return false;
  if (left === right) return true;
  let i = 0, j = 0, changes = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { i++; j++; continue; }
    if (++changes > 1) return false;
    if (left.length > right.length) i++;
    else if (right.length > left.length) j++;
    else { i++; j++; }
  }
  return changes + Number(i < left.length || j < right.length) <= 1;
}

function procedureTerms(item) {
  return [item.name, item.nameEn, item.officialName, item.code, item.id, ...(Array.isArray(item.aliases) ? item.aliases : [])]
    .map(normalizeAlias).filter(Boolean);
}

export function matchProcedure(value, catalog) {
  const term = normalizeAlias(value);
  const active = (Array.isArray(catalog) ? catalog : []).filter(item => item && item.status !== 'inactive' && item.active !== false);
  if (!term) return { matchState: 'unmatched', suggestions: [] };
  const exact = active.filter(item => procedureTerms(item).includes(term));
  if (exact.length === 1) return { matchState: 'exact', procedure: exact[0], suggestions: [] };
  if (exact.length > 1) return { matchState: 'possible', suggestions: exact.slice(0, 6) };
  const possible = active.filter(item => procedureTerms(item).some(alias => alias.length >= 5 && term.length >= 5 && distanceOne(alias, term)));
  return possible.length ? { matchState: 'possible', suggestions: possible.slice(0, 6) } : { matchState: 'unmatched', suggestions: [] };
}

const quickEntrySegments = input => String(input ?? '').split(/[\n,;]+/).map(raw => raw.trim()).filter(Boolean);
export const countQuickEntries = input => quickEntrySegments(input).length;
export function parseQuickEntry(input, catalog, numberingSystem = 'universal') {
  const segments = quickEntrySegments(input);
  const parsed = segments.slice(0, 60).map((raw, index) => {
    const text = digits(raw);
    const located = /(?:^|\s|#)(#?\d{1,2})\s*$/.exec(text) || /([A-Za-z][A-Za-z&+\s.-]*?)(#?\d{1,2})\s*$/.exec(text);
    const toothNumber = located ? normalizeToothNumber(located[1] && /^#?\d/.test(located[1]) ? located[1] : located[2], numberingSystem) : null;
    const procedureText = located ? text.slice(0, located.index).trim() || (located[1] && !/^#?\d/.test(located[1]) ? located[1].trim() : '') : text.trim();
    const matched = matchProcedure(procedureText, catalog);
    const procedure = matched.procedure;
    return {
      index,
      originalInput: raw,
      toothNumber,
      procedureText,
      procedureId: procedure?.id || '',
      procedureCode: procedure?.code || procedure?.id || '',
      officialName: procedure?.name || procedure?.officialName || '',
      officialNameEn: procedure?.nameEn || '',
      matchState: toothNumber ? matched.matchState : 'unmatched',
      suggestions: matched.suggestions.map(item => ({ id: item.id, name: item.name }))
    };
  });
  if (segments.length > 60) {
    parsed.push({ index: 60, originalInput: 'Too many entries (maximum 60)', toothNumber: null, procedureText: '', procedureId: '', procedureCode: '', officialName: '', matchState: 'unmatched', error: 'too_many_items' });
    parsed.error = 'too_many_items';
    parsed.totalEntries = segments.length;
  }
  return parsed;
}

const sourceKeyBase = item => normalizeAlias(item?.originalInput || '') || `entry ${Number(item?.index) || 0}`;
export function reconcileQuickPlanItems(previousItems, parsedItems, deletedSourceKeys = []) {
  const counts = new Map();
  const tagged = (Array.isArray(parsedItems) ? parsedItems : []).map(item => {
    const base = sourceKeyBase(item), occurrence = (counts.get(base) || 0) + 1;
    counts.set(base, occurrence);
    return { ...item, sourceKey: `${base}::${occurrence}` };
  });
  const presentKeys = new Set(tagged.map(item => item.sourceKey));
  const deleted = new Set([...deletedSourceKeys].filter(key => presentKeys.has(key)));
  const previous = Array.isArray(previousItems) ? previousItems : [];
  const priorBySource = new Map(previous.filter(item => item?.sourceKey).map(item => [item.sourceKey, item]));
  const manual = previous.filter(item => item?.manualId);
  const sourceItems = tagged.filter(item => !deleted.has(item.sourceKey)).map(item => {
    const prior = priorBySource.get(item.sourceKey);
    if (!prior?.userEdited) return item;
    return {
      ...item,
      toothNumber: prior.toothNumber,
      procedureId: prior.procedureId,
      procedureCode: prior.procedureCode,
      officialName: prior.officialName,
      officialNameEn: prior.officialNameEn,
      matchState: prior.matchState,
      userEdited: true
    };
  });
  const result = [];
  for (const item of sourceItems) {
    result.push(item);
    result.push(...manual.filter(entry => entry.afterSourceKey === item.sourceKey).sort((a, b) => Number(a.manualOrder || 0) - Number(b.manualOrder || 0)));
  }
  result.push(...manual.filter(entry => !entry.afterSourceKey || !sourceItems.some(item => item.sourceKey === entry.afterSourceKey)).sort((a, b) => Number(a.manualOrder || 0) - Number(b.manualOrder || 0)));
  return { items: result, deletedSourceKeys: [...deleted] };
}

const itemLabel = item => `Tooth #${item.toothNumber} — ${item.officialNameEn || item.officialName || item.procedureName || item.procedureId}`;
const numberingLabel = system => system === 'fdi' ? 'FDI two-digit tooth numbering' : 'Universal tooth numbering (#01–#32)';
export function generateTreatmentPlanText(items, numberingSystem = 'universal') {
  return `${DRAFT_NOTICE}\n\nPROPOSED TREATMENT PLAN\nTooth numbering: ${numberingLabel(numberingSystem)}\n${(items || []).map(item => `• ${itemLabel(item)}.`).join('\n')}`;
}
export function generateClinicalNote(items, clinicianData = {}, numberingSystem = 'universal') {
  const offered = (items || []).map(item => `tooth #${item.toothNumber} — ${item.officialNameEn || item.officialName || item.procedureName || item.procedureId}`);
  const fields = [['Chief complaint', 'chiefComplaint'], ['Diagnosis', 'diagnosis'], ['Clinical findings', 'clinicalFindings'], ['Radiographic findings', 'radiographicFindings'], ['Clinical notes', 'clinicalNotes'], ['Special considerations', 'specialConsiderations']]
    .filter(([, key]) => String(clinicianData?.[key] || '').trim())
    .map(([label, key]) => `${label}: ${String(clinicianData[key]).trim()}`);
  return `${DRAFT_NOTICE}\n\nCLINICAL NOTE\nTooth numbering: ${numberingLabel(numberingSystem)}. Proposed treatment plan: ${offered.join('; ')}. Final treatment is subject to clinical assessment by the treating dentist.${fields.length ? `\n${fields.join('\n')}` : ''}`;
}
export function generateWhatsAppText(items, numberingSystem = 'universal') {
  return `${DRAFT_NOTICE}\n\nTreatment Plan\nTooth numbering: ${numberingLabel(numberingSystem)}\n${(items || []).map(item => `#${item.toothNumber} – ${item.procedureCode || item.officialName || item.procedureId}`).join('\n')}`;
}
