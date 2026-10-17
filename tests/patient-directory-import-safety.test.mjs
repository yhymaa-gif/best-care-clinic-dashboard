import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let fixtureSequence=0;
async function localDirectoryFixture(registry){
  let source=await readFile(new URL('../netlify/functions/lib/patient-directory.mjs',import.meta.url),'utf8');
  source=source.replace("import { getStore } from '@netlify/blobs';",`
    let fixtureData=${JSON.stringify(registry)}, fixtureWriteCount=0, fixtureEtag='fixture-0';
    const getStore=()=>({
      get:async()=>structuredClone(fixtureData),
      getWithMetadata:async()=>({data:structuredClone(fixtureData),etag:fixtureEtag}),
      setJSON:async(_key,value,condition={})=>{
        if(condition.onlyIfMatch && condition.onlyIfMatch!==fixtureEtag) return {modified:false};
        if(condition.onlyIfNew && fixtureData) return {modified:false};
        fixtureData=structuredClone(value);fixtureWriteCount++;fixtureEtag='fixture-'+fixtureWriteCount;return {modified:true};
      }
    });
    export const inspectFixture=()=>({registry:structuredClone(fixtureData),writes:fixtureWriteCount});
  `).replace("from './patient-identity.mjs'",`from ${JSON.stringify(new URL('../netlify/functions/lib/patient-identity.mjs',import.meta.url).href)}`);
  return import(`data:text/javascript;base64,${Buffer.from(source+`\n// isolated fixture ${++fixtureSequence}`).toString('base64')}`);
}
const registryFor=record=>({records:{one:{canonical:'one',fileNo:'TEST1',aliases:['file:TEST1'],...record}},aliases:{'file:TEST1':'one'},revision:1});

test('old-name imports cannot reverse a verified correction or overwrite its contacts',async()=>{
  const module=await localDirectoryFixture(registryFor({fullName:'Old Person',mobile:'0500000001'}));
  await module.correctDirectoryPatient(['file:TEST1'],{name:'New Patient',file:'TEST1',phone:'0500000002'},{actor:'test-admin',correctionId:'fixture-correction'});
  const before=module.inspectFixture();
  const result=await module.importPatientDirectory([{fullName:'Old Person',fileNo:'TEST1',mobile:'0500000003'}],{actor:'fixture-import'});
  assert.equal(result.conflicts,1);
  assert.deepEqual(module.inspectFixture(),before);
  assert.equal(module.enrichPatientFromDirectory(before.registry,{name:'Old Person',file:'TEST1'}).name,'New Patient');
  await module.importPatientDirectory([{fullName:'New Patient',fileNo:'TEST1',mobile:'0500000004'}],{actor:'fixture-import'});
  const after=module.inspectFixture().registry.records.one;
  assert.equal(after.fullName,'New Patient');
  assert.equal(after.authoritativeFullName,'New Patient');
  assert.equal(after.mobile,'0500000002');
  assert.equal(after.nameVerificationSource,'admin_correction');
});

test('short-name import cannot bridge two incompatible full names across batches',async()=>{
  const module=await localDirectoryFixture(registryFor({fullName:'Alpha Beta Gamma',mobile:'0500000001'}));
  await module.importPatientDirectory([{fullName:'Alpha Beta',fileNo:'TEST1'}]);
  const afterShort=module.inspectFixture();
  assert.equal(afterShort.registry.records.one.fullName,'Alpha Beta Gamma');
  assert.equal(afterShort.registry.records.one.authoritativeFullName,'Alpha Beta Gamma');
  const result=await module.importPatientDirectory([{fullName:'Alpha Beta Delta',fileNo:'TEST1',mobile:'0500000009'}]);
  assert.equal(result.conflicts,1);
  assert.deepEqual(module.inspectFixture(),afterShort);
});

test('explicit file-only correction retains a verified old identifier and is idempotent',async()=>{
  const module=await localDirectoryFixture(registryFor({fullName:'Test Patient'}));
  const input={name:'Test Patient',file:'TEST2'};
  await module.correctDirectoryPatient(['file:TEST1'],input,{correctionId:'file-only',actor:'test-admin'});
  const first=module.inspectFixture();
  assert.equal(module.enrichPatientFromDirectory(first.registry,{name:'Test Patient',file:'TEST1'}).file,'TEST2');
  const retry=await module.correctDirectoryPatient(['file:TEST1'],input,{correctionId:'file-only',actor:'test-admin'});
  assert.equal(retry.duplicate,true);
  assert.deepEqual(module.inspectFixture(),first);
});

test('a correction cannot steal another identity and makes no writes on rejection',async()=>{
  const registry=registryFor({fullName:'First Patient'});
  registry.records.two={canonical:'two',fullName:'Second Patient',fileNo:'TEST2',aliases:['file:TEST2']};
  registry.aliases['file:TEST2']='two';
  const module=await localDirectoryFixture(registry);
  await assert.rejects(module.correctDirectoryPatient(['file:TEST1'],{name:'First Patient',file:'TEST2'}),/identity_conflict/);
  assert.equal(module.inspectFixture().writes,0);
  assert.deepEqual(module.inspectFixture().registry,registry);
});
