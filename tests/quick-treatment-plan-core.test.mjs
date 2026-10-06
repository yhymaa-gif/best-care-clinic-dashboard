import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeToothNumber, countQuickEntries, parseQuickEntry, reconcileQuickPlanItems, generateTreatmentPlanText, generateClinicalNote, generateWhatsAppText, DRAFT_NOTICE } from '../quick-plan-core.js';
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
});
