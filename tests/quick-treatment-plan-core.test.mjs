import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeToothNumber, countQuickEntries, parseQuickEntry, procedureDisplayLabel, reconcileQuickPlanItems, generateTreatmentPlanText, generateClinicalNote, generatePatientFileSummary, generateWhatsAppText, treatmentPhase, treatmentPhaseLabel, DRAFT_NOTICE } from '../quick-plan-core.js';
import { DEFAULT_CATALOG_ITEMS } from '../netlify/functions/treatment-catalog.mjs';

test('tooth numbers normalize only within explicitly selected system', () => {
  assert.equal(normalizeToothNumber('#9'), '09');
  assert.equal(normalizeToothNumber('09'), '09');
  assert.equal(normalizeToothNumber('33'), null);
  assert.equal(normalizeToothNumber('11', 'fdi'), '11');
  assert.equal(normalizeToothNumber('09', 'fdi'), null);
});

test('WhatsApp-style sample maps only unambiguous existing procedures', () => {
  const parsed = parseQuickEntry('RCT #09\nPost #05\nTemp crown #07\nExtraction #02\nCrown removal #08', DEFAULT_CATALOG_ITEMS);
  assert.deepEqual(parsed.map(item => item.toothNumber), ['09', '05', '07', '02', '08']);
  assert.deepEqual(parsed.map(item => item.procedureId), ['root-canal', 'place-post', '', 'extraction', 'remove-crown']);
  assert.equal(parsed[2].matchState, 'possible');
  assert.deepEqual(parsed[2].suggestions.map(item => item.id), ['implant-temporary', 'temporary'].sort((a,b) => DEFAULT_CATALOG_ITEMS.findIndex(item=>item.id===a)-DEFAULT_CATALOG_ITEMS.findIndex(item=>item.id===b)));
  assert.equal(parsed.every(item => DEFAULT_CATALOG_ITEMS.some(candidate => candidate.id === item.procedureId) || item.matchState === 'possible'), true);
});

test('parser handles commas, semicolons, compact forms and conservative misspellings', () => {
  const parsed = parseQuickEntry('rct9, EXTrACTION #02; Crown removal 08; rctt 11', DEFAULT_CATALOG_ITEMS);
  assert.equal(parsed.length, 4);
  assert.equal(parsed[0].procedureId, 'root-canal');
  assert.equal(parsed[1].procedureId, 'extraction');
  assert.equal(parsed[2].procedureId, 'remove-crown');
  assert.equal(parsed[3].matchState, 'unmatched');
  assert.equal(parseQuickEntry('RCT 99', DEFAULT_CATALOG_ITEMS)[0].matchState, 'unmatched');
});

test('parser accepts tooth-first shorthand and common crown variants', () => {
  const parsed = parseQuickEntry('RCT 2\n3 crowns\n1 post\nrecement-crown 8', DEFAULT_CATALOG_ITEMS);
  assert.deepEqual(parsed.map(item => item.toothNumber), ['02', '03', '01', '08']);
  assert.deepEqual(parsed.map(item => item.procedureId), ['root-canal', 'ceramic-crown', 'place-post', 'recement-crown']);
  assert.equal(parsed.every(item => item.matchState === 'exact'), true);
});

test('English procedure labels never fall back to an Arabic official name', () => {
  assert.equal(procedureDisplayLabel({ id: 'root-canal', name: 'علاج عصب', nameEn: 'Root canal treatment' }, 'en'), 'Root canal treatment');
  assert.equal(procedureDisplayLabel({ id: 'custom-procedure', name: 'إجراء مخصص', nameEn: '' }, 'en'), 'Custom Procedure');
  assert.equal(procedureDisplayLabel({ id: 'root-canal', name: 'علاج عصب', nameEn: 'Root canal treatment' }, 'ar'), 'علاج عصب');
});

test('a 61st entry is explicit and prevents silent submission of a truncated plan', () => {
  const parsed = parseQuickEntry(Array.from({ length: 61 }, (_, index) => `RCT ${String(index % 32 + 1).padStart(2, '0')}`).join('\n'), DEFAULT_CATALOG_ITEMS);
  assert.equal(parsed.length, 61);
  assert.equal(parsed.error, 'too_many_items');
  assert.equal(parsed.totalEntries, 61);
  assert.equal(parsed[60].matchState, 'unmatched');
  assert.equal(parsed[60].error, 'too_many_items');
  assert.equal(countQuickEntries(Array.from({ length: 61 }, () => 'RCT 09').join(';')), 61);
});

test('manual tooth corrections, deletions, and duplicates survive continued typing', () => {
  let state = reconcileQuickPlanItems([], parseQuickEntry('RCT 11\nExtraction 22', DEFAULT_CATALOG_ITEMS, 'fdi'));
  state.items[0] = { ...state.items[0], toothNumber: '12', matchState: 'manual', userEdited: true };
  const deletedKey = state.items[1].sourceKey;
  const duplicate = { ...state.items[0], sourceKey: '', manualId: 'manual-1', manualOrder: 1, afterSourceKey: state.items[0].sourceKey, originalInput: 'RCT 11 (duplicate)', userEdited: true };
  state.items.push(duplicate);
  state = reconcileQuickPlanItems(state.items, parseQuickEntry('RCT 11\nExtraction 22\nPost 13', DEFAULT_CATALOG_ITEMS, 'fdi'), [deletedKey]);
  assert.equal(state.items.find(item => item.sourceKey?.startsWith('rct 11::'))?.toothNumber, '12');
  assert.equal(state.items.some(item => item.sourceKey === deletedKey), false);
  assert.equal(state.items.filter(item => item.manualId === 'manual-1').length, 1);
  assert.equal(state.items.some(item => item.procedureId === 'place-post'), true);
});

test('generated documentation is source-bound and visibly draft', () => {
  const items = [{ toothNumber: '09', procedureId: 'root-canal', procedureCode: 'root-canal', officialName: 'علاج عصب' }];
  for (const result of [generateTreatmentPlanText(items), generateClinicalNote(items), generateWhatsAppText(items)]) {
    assert.match(result, new RegExp(DRAFT_NOTICE));
    assert.doesNotMatch(result, /irreversible pulpitis|diagnosed|prognosis/i);
  }
  assert.doesNotMatch(generateClinicalNote(items), /Chief complaint:/);
  assert.match(generateClinicalNote(items, { chiefComplaint: 'Clinician supplied text' }), /Chief complaint: Clinician supplied text/);
  assert.match(generateTreatmentPlanText(items, 'fdi'), /FDI two-digit tooth numbering/);
  assert.match(generateClinicalNote(items, {}, 'fdi'), /FDI two-digit tooth numbering/);
  assert.match(generateWhatsAppText(items, 'fdi'), /FDI two-digit tooth numbering/);
  assert.match(generateTreatmentPlanText(items, 'universal'), /Universal tooth numbering/);
  assert.match(generateClinicalNote(items, {}, 'universal', { name: 'Test Patient', age: 42, mrn: '18417' }), /Patient: Test Patient · Age: 42 years · MRN: 18417/);
});

test('treatment-plan outputs use the dashboard three-phase clinical organization', () => {
  const items = [
    { toothNumber: '21', procedureId: 'ceramic-crown', procedureCode: 'ceramic-crown', officialNameEn: 'Ceramic crown', category: 'prosthetic' },
    { toothNumber: '11', procedureId: 'root-canal', procedureCode: 'root-canal', officialNameEn: 'Root canal treatment', category: 'initial' },
    { toothNumber: '14', procedureId: 'implant-surgery', procedureCode: 'implant-surgery', officialNameEn: 'Dental implant — surgical stage', category: 'implant' },
    { toothNumber: '16', procedureId: 'cbct-scan', procedureCode: 'cbct-scan', officialName: 'أشعة مقطعية', officialNameEn: 'CBCT scan', category: 'implant' }
  ];
  const plan = generateTreatmentPlanText(items, 'fdi');
  assert.ok(plan.indexOf('INITIAL TREATMENTS') < plan.indexOf('SURGERY & IMPLANTS'));
  assert.ok(plan.indexOf('SURGERY & IMPLANTS') < plan.indexOf('PROSTHETICS'));
  assert.match(generateWhatsAppText(items, 'fdi'), /INITIAL TREATMENTS[\s\S]*SURGERY & IMPLANTS[\s\S]*PROSTHETICS/);
  assert.equal(treatmentPhase('unknown'), 'initial');
  assert.equal(treatmentPhaseLabel('prosthetic', 'ar'), 'التركيبات');
  const note = generateClinicalNote(items, {}, 'fdi');
  assert.ok(note.indexOf('Diagnostic procedures') < note.indexOf('Initial treatment procedures'));
  assert.ok(note.indexOf('Initial treatment procedures') < note.indexOf('Surgical and implant procedures'));
  assert.ok(note.indexOf('Surgical and implant procedures') < note.indexOf('Prosthetic procedures'));
  assert.doesNotMatch(note, /diagnosed|irreversible pulpitis/i);
  const arabicNote = generatePatientFileSummary(items, 'fdi', {}, 'ar');
  assert.ok(arabicNote.indexOf('الإجراءات التشخيصية') < arabicNote.indexOf('المعالجات الأولية'));
  assert.ok(arabicNote.indexOf('المعالجات الأولية') < arabicNote.indexOf('الجراحة والزراعة'));
  assert.ok(arabicNote.indexOf('الجراحة والزراعة') < arabicNote.indexOf('التركيبات'));
});

test('patient file summary groups procedure counts without inventing diagnosis', () => {
  const items = [
    { toothNumber: '11', procedureId: 'root-canal', officialName: 'علاج عصب', officialNameEn: 'Root canal treatment' },
    { toothNumber: '12', procedureId: 'root-canal', officialName: 'علاج عصب', officialNameEn: 'Root canal treatment' },
    { toothNumber: '23', procedureId: 'extraction', officialName: 'خلع الأسنان', officialNameEn: 'Tooth extraction' }
  ];
  const arabic = generatePatientFileSummary(items, 'fdi', { name: 'مريض تجريبي', age: 40, mrn: '18417' }, 'ar');
  assert.match(arabic, /يحتاج المريض إلى الإجراءات العلاجية التالية/);
  assert.match(arabic, /مسودة خطة علاجية مقترحة، وتبقى قيد مراجعة واعتماد الطبيب المخوّل/);
  assert.match(arabic, /نظام ترقيم الأسنان: FDI/);
  assert.doesNotMatch(arabic, new RegExp(DRAFT_NOTICE));
  assert.match(arabic, /علاج عصب: الأسنان 11، 12 \(العدد 2\)/);
  assert.match(arabic, /خلع الأسنان: الأسنان 23 \(العدد 1\)/);
  assert.doesNotMatch(arabic, /حضر|راجَع العيادة/);
  assert.doesNotMatch(arabic, /تم الفحص الإكلينيكي|تمت مناقشة الخطة/);
  assert.doesNotMatch(arabic, /التهاب|تسوس|غير قابل للعكس/);
  const english = generatePatientFileSummary(items, 'fdi', { name: 'Test Patient', mrn: '18417' }, 'en');
  assert.match(english, /The patient requires the following treatment procedures/);
  assert.match(english, /proposed treatment-plan draft pending review and approval by the authorized dentist/);
  assert.match(english, /Tooth numbering: FDI/);
  assert.doesNotMatch(english, new RegExp(DRAFT_NOTICE));
  assert.doesNotMatch(english, /attended|presented for/i);
  assert.match(english, /Root canal treatment: teeth 11, 12 \(count 2\)/);
});

test('patient file summary documents examination and discussion only when explicitly confirmed',()=>{
  const items=[{toothNumber:'11',procedureId:'root-canal',officialName:'علاج عصب',officialNameEn:'Root canal treatment',category:'initial'}];
  for(const language of ['ar','en']){
    const unconfirmed=generatePatientFileSummary(items,'fdi',{name:'Test'},language);
    const confirmed=generatePatientFileSummary(items,'fdi',{name:'Test',examinationConfirmed:true,discussionConfirmed:true},language);
    if(language==='ar'){
      assert.doesNotMatch(unconfirmed,/تم الفحص الإكلينيكي|تمت مناقشة الخطة/);
      assert.match(confirmed,/تم إعداد هذه الخطة العلاجية بناءً على فحص إكلينيكي وتقييم شعاعي باستخدام الأشعة الذروية والأشعة البانورامية/);
      assert.match(confirmed,/تمت مناقشة هذه الخطة العلاجية مع المريض وشرح الإجراءات المقترحة له/);
    }else{
      assert.doesNotMatch(unconfirmed,/prepared based on a clinical examination|was discussed with the patient/);
      assert.match(confirmed,/prepared based on a clinical examination and radiographic assessment using periapical and panoramic radiographs/);
      assert.match(confirmed,/was discussed with the patient, and the proposed procedures were explained/);
    }
  }
});

test('diagnostic ordering never misclassifies implant uncovering or implant impression', () => {
  const items = [
    { toothNumber: '11', procedureId: 'implant-uncovering', procedureCode: 'implant-uncovering', officialNameEn: 'Implant uncovering', category: 'implant' },
    { toothNumber: '12', procedureId: 'implant-impression', procedureCode: 'implant-impression', officialNameEn: 'Implant impression or digital scan', category: 'prosthetic' },
    { toothNumber: '13', procedureId: 'cbct-scan', procedureCode: 'cbct-scan', officialNameEn: 'CBCT scan', category: 'implant' }
  ];
  const note = generateClinicalNote(items, {}, 'fdi');
  assert.ok(note.indexOf('CBCT scan') < note.indexOf('Implant uncovering'));
  assert.match(note, /Surgical and implant procedures recorded: Tooth #11 — Implant uncovering/);
  assert.match(note, /Prosthetic procedures recorded: Tooth #12 — Implant impression or digital scan/);
  const arabic = generatePatientFileSummary(items, 'fdi', {}, 'ar');
  assert.ok(arabic.indexOf('الإجراءات التشخيصية') < arabic.indexOf('الجراحة والزراعة'));
});
