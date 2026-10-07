export const DRAFT_NOTICE = 'DRAFT — NOT MEDICAL ADVICE — DOCUMENTATION-ONLY — AUTHORIZED CLINICIAN SIGN-OFF REQUIRED';
export const TREATMENT_PHASES = Object.freeze([
  Object.freeze({ id: 'initial', ar: 'المعالجات الأولية', en: 'INITIAL TREATMENTS' }),
  Object.freeze({ id: 'implant', ar: 'الجراحة والزراعة', en: 'SURGERY & IMPLANTS' }),
  Object.freeze({ id: 'prosthetic', ar: 'التركيبات', en: 'PROSTHETICS' }),
  Object.freeze({ id: 'all', ar: 'إجراءات أخرى', en: 'OTHER PROCEDURES' })
]);
export const treatmentPhase = value => TREATMENT_PHASES.some(phase => phase.id === value) ? value : 'initial';
export const treatmentPhaseLabel = (value, language = 'en') => {
  const phase = TREATMENT_PHASES.find(entry => entry.id === treatmentPhase(value)) || TREATMENT_PHASES[0];
  return language === 'ar' ? phase.ar : phase.en;
};
export const orderTreatmentItems = items => (Array.isArray(items) ? items : [])
  .map((item, index) => ({ item, index }))
  .sort((left, right) => TREATMENT_PHASES.findIndex(phase => phase.id === treatmentPhase(left.item?.category)) - TREATMENT_PHASES.findIndex(phase => phase.id === treatmentPhase(right.item?.category)) || left.index - right.index)
  .map(entry => entry.item);

const digits = value => String(value ?? '').replace(/[٠-٩]/g, digit => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit)).replace(/[۰-۹]/g, digit => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit));
export const normalizeAlias = value => digits(value).normalize('NFKC').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ').replace(/\s+/g, ' ').trim();
const hasArabic = value => /[\u0600-\u06ff]/.test(String(value || ''));
export function procedureDisplayLabel(item, language = 'en') {
  if (language === 'ar') return String(item?.name || item?.officialName || item?.nameEn || item?.code || item?.id || '').trim();
  const translated = String(item?.nameEn || item?.officialNameEn || '').trim();
  if (translated) return translated;
  const code = String(item?.code || '').trim();
  if (code && !hasArabic(code)) return code;
  const id = String(item?.id || item?.procedureId || '').trim();
  return id ? id.replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : 'Procedure';
}
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
    const trailing = /#?(\d{1,2})\s*$/.exec(text);
    const leading = /^\s*#?(\d{1,2})(?:\s+|(?=[A-Za-z\u0600-\u06ff]))/.exec(text);
    const located = trailing || leading;
    const toothNumber = located ? normalizeToothNumber(located[1], numberingSystem) : null;
    const procedureText = trailing
      ? text.slice(0, trailing.index).trim()
      : leading
        ? text.slice(leading[0].length).trim()
        : text.trim();
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
      category: procedure?.category || '',
      matchState: toothNumber ? matched.matchState : 'unmatched',
      suggestions: matched.suggestions.map(item => ({ id: item.id, name: item.name, nameEn: item.nameEn || '' }))
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
      category: prior.category,
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
// Keep clinical ordering bound to stable procedure IDs/codes. Labels such as
// "implant uncovering" (كشف الزراعة) and "implant digital scan" contain words
// that resemble diagnostics, although they are treatment/prosthetic steps.
const DIAGNOSTIC_PROCEDURE_IDS = new Set([
  'examination', 'cbct-scan', 'smile-analysis', 'panoramic-xray',
  'panoramic-radiograph', 'opg', 'periapical-xray', 'bitewing-xray'
]);
const isDiagnosticProcedure = item => {
  const identifiers = [item?.procedureId, item?.procedureCode].map(normalizeAlias).filter(Boolean);
  return identifiers.some(identifier => DIAGNOSTIC_PROCEDURE_IDS.has(identifier)
    || /(^| )(cbct|panoramic xray|panoramic radiograph|opg|periapical xray|bitewing xray|radiograph|radiography|examination|exam)( |$)/.test(identifier));
};
const documentationStages = items => {
  const source = orderTreatmentItems(items);
  const diagnostic = source.filter(isDiagnosticProcedure);
  const diagnosticSet = new Set(diagnostic);
  return {
    diagnostic,
    initial: source.filter(item => !diagnosticSet.has(item) && treatmentPhase(item?.category) === 'initial'),
    implant: source.filter(item => !diagnosticSet.has(item) && treatmentPhase(item?.category) === 'implant'),
    prosthetic: source.filter(item => !diagnosticSet.has(item) && treatmentPhase(item?.category) === 'prosthetic'),
    other: source.filter(item => !diagnosticSet.has(item) && treatmentPhase(item?.category) === 'all')
  };
};
export function generateTreatmentPlanText(items, numberingSystem = 'universal') {
  const ordered = orderTreatmentItems(items);
  const sections = TREATMENT_PHASES.map(phase => {
    const phaseItems = ordered.filter(item => treatmentPhase(item?.category) === phase.id);
    return phaseItems.length ? `${phase.en}\n${phaseItems.map(item => `• ${itemLabel(item)}.`).join('\n')}` : '';
  }).filter(Boolean).join('\n\n');
  return `${DRAFT_NOTICE}\n\nPROPOSED TREATMENT PLAN\nTooth numbering: ${numberingLabel(numberingSystem)}\n${sections}`;
}
export function generateClinicalNote(items, clinicianData = {}, numberingSystem = 'universal', patient = {}) {
  const stages = documentationStages(items),stageText = [];
  if (stages.diagnostic.length) stageText.push(`Diagnostic procedures recorded for completion and treating-dentist assessment: ${stages.diagnostic.map(itemLabel).join('; ')}`);
  if (stages.initial.length) stageText.push(`Initial treatment procedures recorded for commencement: ${stages.initial.map(itemLabel).join('; ')}`);
  if (stages.implant.length) stageText.push(`Surgical and implant procedures recorded: ${stages.implant.map(itemLabel).join('; ')}`);
  if (stages.prosthetic.length) stageText.push(`Prosthetic procedures recorded: ${stages.prosthetic.map(itemLabel).join('; ')}`);
  if (stages.other.length) stageText.push(`Other recorded procedures: ${stages.other.map(itemLabel).join('; ')}`);
  const patientContext = [String(patient?.name || '').trim() ? `Patient: ${String(patient.name).trim()}` : '', Number(patient?.age) > 0 ? `Age: ${Number(patient.age)} years` : '', String(patient?.mrn || '').trim() ? `MRN: ${String(patient.mrn).trim()}` : ''].filter(Boolean).join(' · ');
  const fields = [['Chief complaint', 'chiefComplaint'], ['Diagnosis', 'diagnosis'], ['Clinical findings', 'clinicalFindings'], ['Radiographic findings', 'radiographicFindings'], ['Clinical notes', 'clinicalNotes'], ['Special considerations', 'specialConsiderations']]
    .filter(([, key]) => String(clinicianData?.[key] || '').trim())
    .map(([label, key]) => `${label}: ${String(clinicianData[key]).trim()}`);
  return `${DRAFT_NOTICE}\n\nCLINICAL NOTE\n${patientContext?`${patientContext}.\n`:''}Tooth numbering: ${numberingLabel(numberingSystem)}. ${stageText.join('. ')}. The sequence, suitability, and final scope remain subject to documented clinical and radiographic assessment by the treating dentist.${fields.length ? `\n${fields.join('\n')}` : ''}`;
}
export function generatePatientFileSummary(items, numberingSystem = 'fdi', patient = {}, language = 'ar') {
  const validItems = (items || []).filter(item => item?.procedureId && item?.toothNumber), stages = documentationStages(validItems);
  const groupedRows = source => {
    const rows = new Map();
    for (const item of source) {
      const key = item.procedureId;
      if (!rows.has(key)) rows.set(key, { label: procedureDisplayLabel(item, language), teeth: [] });
      rows.get(key).teeth.push(String(item.toothNumber));
    }
    return [...rows.values()];
  };
  const rowText = source => groupedRows(source).map(row => language === 'ar' ? `${row.label}: الأسنان ${row.teeth.join('، ')} (العدد ${row.teeth.length})` : `${row.label}: teeth ${row.teeth.join(', ')} (count ${row.teeth.length})`).join(language === 'ar' ? '؛ ' : '; ');
  const name = String(patient?.name || '').trim();
  const age = Number(patient?.age) > 0 ? Number(patient.age) : 0;
  const mrn = String(patient?.mrn || '').trim();
  const examinationConfirmed = patient?.examinationConfirmed === true;
  const discussionConfirmed = patient?.discussionConfirmed === true;
  if (language === 'ar') {
    const identity = [name ? `المريض/ة ${name}` : 'المريض/ة', age ? `العمر ${age} سنة` : '', mrn ? `رقم الملف ${mrn}` : ''].filter(Boolean).join('، ');
    const sentences = [`${identity}.`, `هذه مسودة خطة علاجية مقترحة، وتبقى قيد مراجعة واعتماد الطبيب المخوّل. نظام ترقيم الأسنان: ${numberingLabel(numberingSystem)}.`];
    if (examinationConfirmed) sentences.push('تم إعداد هذه الخطة العلاجية بناءً على فحص إكلينيكي وتقييم شعاعي باستخدام الأشعة الذروية والأشعة البانورامية.');
    if (stages.diagnostic.length) sentences.push(`الإجراءات التشخيصية المطلوبة: ${rowText(stages.diagnostic)}.`);
    const treatment = [];
    if (stages.initial.length) treatment.push(`المعالجات الأولية: ${rowText(stages.initial)}`);
    if (stages.implant.length) treatment.push(`الجراحة والزراعة: ${rowText(stages.implant)}`);
    if (stages.prosthetic.length) treatment.push(`التركيبات: ${rowText(stages.prosthetic)}`);
    if (stages.other.length) treatment.push(`إجراءات أخرى: ${rowText(stages.other)}`);
    if (treatment.length) sentences.push(`يحتاج المريض إلى الإجراءات العلاجية التالية: ${treatment.join('؛ ')}.`);
    if (!validItems.length) sentences.push('لم تُسجّل إجراءات بعد.');
    if (discussionConfirmed) sentences.push('تمت مناقشة هذه الخطة العلاجية مع المريض وشرح الإجراءات المقترحة له.');
    return sentences.join(' ');
  }
  const identity = [name ? `Patient ${name}` : 'The patient', age ? `age ${age}` : '', mrn ? `MRN ${mrn}` : ''].filter(Boolean).join(', ');
  const sentences = [`${identity}.`, `This is a proposed treatment-plan draft pending review and approval by the authorized dentist. Tooth numbering: ${numberingLabel(numberingSystem)}.`];
  if (examinationConfirmed) sentences.push('This treatment plan was prepared based on a clinical examination and radiographic assessment using periapical and panoramic radiographs.');
  if (stages.diagnostic.length) sentences.push(`Required diagnostic procedures: ${rowText(stages.diagnostic)}.`);
  const treatment = [];
  if (stages.initial.length) treatment.push(`initial treatment: ${rowText(stages.initial)}`);
  if (stages.implant.length) treatment.push(`surgical and implant treatment: ${rowText(stages.implant)}`);
  if (stages.prosthetic.length) treatment.push(`prosthetic treatment: ${rowText(stages.prosthetic)}`);
  if (stages.other.length) treatment.push(`other procedures: ${rowText(stages.other)}`);
  if (treatment.length) sentences.push(`The patient requires the following treatment procedures: ${treatment.join('; ')}.`);
  if (!validItems.length) sentences.push('No procedures have been recorded yet.');
  if (discussionConfirmed) sentences.push('This treatment plan was discussed with the patient, and the proposed procedures were explained.');
  return sentences.join(' ');
}
export function generateWhatsAppText(items, numberingSystem = 'universal') {
  const ordered = orderTreatmentItems(items);
  const sections = TREATMENT_PHASES.map(phase => {
    const phaseItems = ordered.filter(item => treatmentPhase(item?.category) === phase.id);
    return phaseItems.length ? `${phase.en}\n${phaseItems.map(item => `#${item.toothNumber} – ${item.procedureCode || item.officialName || item.procedureId}`).join('\n')}` : '';
  }).filter(Boolean).join('\n\n');
  return `${DRAFT_NOTICE}\n\nTreatment Plan\nTooth numbering: ${numberingLabel(numberingSystem)}\n${sections}`;
}
