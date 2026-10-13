import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { __test as patientsApi } from '../netlify/functions/patients.mjs';
import { resolveDirectoryPatient } from '../netlify/functions/lib/patient-directory.mjs';

const source = await readFile(new URL('../dashboard.js', import.meta.url), 'utf8');
const clientSource = source.slice(source.indexOf('function rebuildPatientIdentityAliasIndex('), source.indexOf('function applyPatientDirectoryCorrectionLocally('));
const context = vm.createContext({
  patientIdentityDirectory: { records: {} },
  patientIdentityAliasIndex: new Map(),
  cleanDirectoryName: value => String(value || '').replace(/\s+/g, ' ').trim(),
  normalizeDirectoryFile: value => String(value || '').toUpperCase().replace(/[\s-]+/g, ''),
  normalizeDirectoryNationalId: value => String(value || '').replace(/\D/g, '').slice(0, 10),
  fileAlias: value => value ? `file:${String(value).toUpperCase().replace(/[\s-]+/g, '')}` : ''
});
vm.runInContext(clientSource, context);
const load = records => {
  context.patientIdentityDirectory.records = records;
  vm.runInContext('rebuildPatientIdentityAliasIndex()', context);
};
const enrich = patient => context.patientWithDirectoryIdentity(patient);

test('unrelated longer directory name never changes Khairiyah appointment or contact', () => {
  load({ one: { fullName: 'مريضة أخرى للاختبار فقط', authoritativeFullName: 'مريضة أخرى للاختبار فقط', fileNo: 'TEST18252', mobile: '0559999999' } });
  const raw = { id: 'appointment-1', name: 'خيرية', file: 'TEST18252', phone: '0551111111' };
  assert.equal(enrich(raw), raw);
  assert.equal(context.directoryPatientFor(raw), null);
});

test('compatible partial name completes only with a unique strong identifier', () => {
  load({ one: { fullName: 'خيرية محمد علي', fileNo: 'TEST18252', mobile: '0559999999' } });
  assert.equal(enrich({ name: 'خيرية', file: 'TEST18252' }).name, 'خيرية محمد علي');
  assert.equal(enrich({ name: 'خيرية محمدان', file: 'TEST18252' }).name, 'خيرية محمدان');
  assert.equal(context.directoryNamesCompatible('خيرية محمد', 'خيرية محمد علي'), true);
  assert.equal(context.directoryNamesCompatible('خيرية محمد', 'خيرية محمدان علي'), false);
});

test('ambiguous file fails closed despite valid national ID, and unproven old aliases are ignored', () => {
  load({
    one: { fullName: 'خيرية محمد', fileNo: '1', nationalId: '1234567890', aliases: ['file:OLD'] },
    two: { fullName: 'خيرية محمد', fileNo: '1', nationalId: '2234567890' }
  });
  assert.equal(context.directoryPatientFor({ name: 'خيرية', file: '1', nationalId: '1234567890' }), null);
  assert.equal(context.directoryPatientFor({ name: 'خيرية', file: 'OLD' }), null);
});

test('only explicitly bound correction provenance permits old-name and old-file link', () => {
  load({ one: {
    fullName: 'ملاك الحسن', authoritativeFullName: 'ملاك الحسن', fileNo: 'NEW1', aliases: ['file:OLD1'],
    nameCorrections: [{ from: 'دعاء الحسن', to: 'ملاك الحسن', fromAliases: ['file:OLD1'], toAliases: ['file:NEW1'] }]
  } });
  assert.equal(enrich({ name: 'دعاء الحسن', file: 'OLD1' }).name, 'ملاك الحسن');
  assert.equal(enrich({ name: 'سارة الحسن', file: 'OLD1' }).name, 'سارة الحسن');
});

test('stale competing ownership blocks client resolution just as it blocks the server',()=>{
  const records={
    one:{fullName:'Alpha Beta',fileNo:'1',mobile:'0500000001'},
    two:{fullName:'Other Person',fileNo:'2',aliases:['file:1']}
  };
  const raw={name:'Alpha',file:'1',phone:'0500000009'};
  load(records);
  assert.equal(resolveDirectoryPatient({records,aliases:{'file:1':'one','file:2':'two'}},raw),null);
  assert.equal(enrich(raw),raw);
});

test('patient API retains source-name disagreement and client never enriches flagged identities',()=>{
  for(const flagged of [false,true]){
    const record={fullName:'Alpha Beta',authoritativeFullName:'Other Patient',fileNo:'1',mobile:'0500000001',...(flagged?{dataQualityFlags:['name_conflict']}: {})};
    const projected={...record,fullName:patientsApi.directoryDisplayName(record)};
    assert.equal(projected.fullName,'Alpha Beta');
    load({one:projected});
    const raw={name:'Other Patient',file:'1',phone:'0500000009'};
    assert.equal(enrich(raw),raw);
    assert.equal(resolveDirectoryPatient({records:{one:record},aliases:{'file:1':'one'}},raw),null);
  }
  const flagged={fullName:'Test Patient',fileNo:'1',dataQualityFlags:['identity_conflict']};
  load({one:flagged});
  const raw={name:'Test Patient',file:'1'};
  assert.equal(enrich(raw),raw);
  assert.equal(resolveDirectoryPatient({records:{one:flagged},aliases:{'file:1':'one'}},raw),null);
});
