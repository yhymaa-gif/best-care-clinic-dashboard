import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {__test as directory} from '../netlify/functions/lib/patient-directory.mjs';
import {patientIdentityKeys,normalizePatientFile,normalizePatientNationalId} from '../netlify/functions/lib/patient-identity.mjs';
import {validatePatient,samePatient} from '../appointment-entry-core.js';

test('ID-only registration needs neither a mobile nor a file, but keeps invalid mobiles invalid',()=>{
  assert.equal(validatePatient({name:'ملاك الحسن',nationalId:'1234567890'}).complete,true);
  assert.equal(validatePatient({name:'ملاك الحسن',nationalId:'1234567890',phone:'123'}).complete,false);
  assert.equal(validatePatient({name:'ملاك الحسن',phone:'0501112233'}).complete,false);
  assert.equal(samePatient({nationalId:'1234567890'},{nationalId:'2234567890'}),false);
});
test('a unique mobile and even an identical name cannot enrich or merge another patient',()=>{
  const first=directory.directoryPatient({name:'أحمد محمد',file:'100',nationalId:'1234567890',phone:'0501112233'});
  const registry={records:{one:first},aliases:{'file:100':'one','national:1234567890':'one','phone:0501112233':'one'}};
  for(const patient of [{name:'أحمد محمد',phone:first.mobile},{name:'أحمد محمد',file:'200',phone:first.mobile},{name:'أحمد محمد',nationalId:'2234567890',phone:first.mobile}]){
    assert.equal(directory.resolveDirectoryPatient(registry,patient),null);
    assert.deepEqual(directory.enrichPatientFromDirectory(registry,patient),patient);
    assert.notEqual(directory.resolveCanonical(registry.records,registry.aliases,directory.directoryPatient(patient)).canonical,'one');
  }
  assert.equal(directory.resolveDirectoryPatient(registry,{file:'100',phone:'0509999999'}),first);
  assert.equal(directory.resolveDirectoryPatient(registry,{nationalId:'1234567890'}),first);
  assert.equal(directory.resolveCanonical(registry.records,registry.aliases,directory.directoryPatient({file:'200',nationalId:'1234567890'})).conflict,true);
});
test('relationship metadata survives normalization without becoming an identity',()=>{
  const patient=directory.directoryPatient({fullName:'طفل مريض',nationalId:'1234567890',mobile:'0501112233',phoneRelationship:'father'});
  assert.equal(patient.phoneRelationship,'father');
  assert.deepEqual(patientIdentityKeys(patient),['national:1234567890']);
  assert.deepEqual(directory.reviewFlagsFor({fullName:'طفل مريض',nationalId:'1234567890'}),[]);
  assert.equal(directory.directoryPatient({phoneRelationship:'injected'}).phoneRelationship,'');
});
test('automatic cleanup retains conflicting identities instead of merging them by file',()=>{
  const records={one:{canonical:'one',fileNo:'12',nationalId:'1234567890',fullName:'أحمد محمد'},two:{canonical:'two',fileNo:'12',nationalId:'2234567890',fullName:'أحمد علي'}};
  const result=directory.reconcileDirectorySnapshot({records,aliases:{'file:12':'one'}});
  assert.equal(Object.keys(result.registry.records).length,2);
  assert.equal(result.duplicateRecordsMerged,0);
  assert.ok(result.registry.records.one.dataQualityFlags.includes('identity_conflict'));
  assert.equal(records.one.fullName,'أحمد محمد');
});
const source=readFileSync(new URL('../dashboard.js',import.meta.url),'utf8');
const scope=vm.createContext({normalizedPlanFile:normalizePatientFile,planRegistryNationalId:normalizePatientNationalId,cleanDirectoryName:String,directoryNameScore:value=>String(value).length,patientDirectoryAliases:row=>patientIdentityKeys(row)});
vm.runInContext(source.slice(source.indexOf('function labCaseMatchesPatient('),source.indexOf('function patientLabCases(')),scope);
vm.runInContext(source.slice(source.indexOf('function mergePatientDirectoryImportRows('),source.indexOf('function parsePatientDirectoryCsv(')),scope);
test('laboratory cases cannot attach through a shared phone or placeholder file',()=>{
  assert.equal(scope.labCaseMatchesPatient({patient:{file:'0',phone:'0501112233'}},{file:'0',phone:'0501112233'}),false);
  assert.equal(scope.labCaseMatchesPatient({patient:{file:'1',phone:'0501112233'}},{file:'2',phone:'0501112233'}),false);
  assert.equal(scope.labCaseMatchesPatient({patient:{nationalId:'1234567890'}},{nationalId:'1234567890'}),true);
});
test('CSV keeps relatives apart, flags their shared mobile and still merges an exact file',()=>{
  const row=(fileNo,nationalId,fullName)=>({fileNo,nationalId,fullName,mobile:'0501112233',sourceRow:1});
  const result=scope.mergePatientDirectoryImportRows([row('1','','أحمد محمد'),row('2','','أحمد محمد'),row('','1234567890','أحمد محمد'),row('1','','أحمد محمد علي')]);
  assert.equal(result.validRows.length,3);
  assert.equal(result.validRows[0].fullName,'أحمد محمد علي');
  assert.equal(result.validRows[1].fullName,'أحمد محمد');
  assert.ok(result.validRows[1].reviewFlags.includes('shared_phone'));
});
