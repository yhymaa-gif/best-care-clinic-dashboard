import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { __test as aftercare } from '../netlify/functions/root-canal-aftercare.mjs';
import { __test as state } from '../netlify/functions/state.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const read=async file=>readFile(join(root,file),'utf8');
const sample={patient:{name:'Synthetic Patient',file:'TEST-1'},clinic:{name:'Synthetic Clinic'},source:{clinicId:'clinic-1',patientId:'test-id',date:'2026-10-15',paymentRequestedAt:1234},doctorConfirmed:true,medications:[{type:'ibuprofen',name:'Ibuprofen',dose:'clinician supplied',frequency:'clinician supplied',duration:'clinician supplied'}]};

test('only clinician-selected analgesics can be attached; no antibiotic field is accepted',()=>{
  assert.deepEqual([...aftercare.medicationTypes],['ibuprofen','paracetamol']);
  assert.equal(aftercare.validateDocument(aftercare.cleanDocument(sample)),'');
  assert.match(aftercare.validateDocument(aftercare.cleanDocument({...sample,medications:[{...sample.medications[0],type:'antibiotic'}]})),/Only clinician-selected analgesics/);
  assert.match(aftercare.validateDocument(aftercare.cleanDocument({...sample,medications:[{...sample.medications[0],dose:''}]})),/incomplete/);
  assert.match(aftercare.validateDocument(aftercare.cleanDocument({...sample,doctorConfirmed:false})),/confirmation/);
});

test('aftercare reminder and sharing counters survive daily-state cleaning',()=>{
  const cleaned=state.cleanPatient({id:'test-id',name:'Synthetic Patient',rootCanalAftercareRequiredAt:1234,rootCanalAftercareSentAt:2345,rootCanalAftercareSentOrderAt:1234,rootCanalAftercareCount:2,rootCanalAftercareLastEventId:'evt-test',rootCanalAftercareDocumentId:'abc_test_document_123456789',rootCanalAftercareDocumentOrderAt:1234,rootCanalAftercareDocumentIssuedAt:2000});
  assert.equal(cleaned.rootCanalAftercareRequiredAt,1234);
  assert.equal(cleaned.rootCanalAftercareSentAt,2345);
  assert.equal(cleaned.rootCanalAftercareSentOrderAt,1234);
  assert.equal(cleaned.rootCanalAftercareCount,2);
  assert.equal(cleaned.rootCanalAftercareLastEventId,'evt-test');
  assert.equal(cleaned.rootCanalAftercareDocumentId,'abc_test_document_123456789');
  assert.equal(cleaned.rootCanalAftercareDocumentOrderAt,1234);
  assert.equal(cleaned.rootCanalAftercareDocumentIssuedAt,2000);
});

test('two-device merge keeps the newer root-canal payment reminder over an older sent document',async()=>{
  const dashboard=await read('dashboard.js');
  const required=dashboard.slice(dashboard.indexOf('function rootCanalAftercareRequired('),dashboard.indexOf('function rootCanalAftercareButtonMarkup('));
  const merge=dashboard.slice(dashboard.indexOf('function paymentReceiptStamp('),dashboard.indexOf('function announceSyncedState('));
  const context=vm.createContext({});vm.runInContext(`${required}\n${merge}`,context);
  const oldDevice={id:'p1',paymentRequired:true,paymentItems:[{code:'root-canal'}],paymentRequestedAt:100,rootCanalAftercareRequiredAt:100,rootCanalAftercareSentAt:300,rootCanalAftercareSentOrderAt:100,rootCanalAftercareDocumentId:'old-document',rootCanalAftercareDocumentOrderAt:100,rootCanalAftercareDocumentIssuedAt:250,recordUpdatedAt:500};
  const newDevice={id:'p1',paymentRequired:true,paymentItems:[{code:'root-canal-retreatment'}],paymentRequestedAt:200,rootCanalAftercareRequiredAt:200,rootCanalAftercareSentAt:0,rootCanalAftercareSentOrderAt:0,rootCanalAftercareDocumentId:'',rootCanalAftercareDocumentOrderAt:0,rootCanalAftercareDocumentIssuedAt:0,recordUpdatedAt:400};
  for(const [remote,local] of [[oldDevice,newDevice],[newDevice,oldDevice]]){
    const merged=context.mergePatientVersions(remote,local);
    assert.equal(merged.paymentRequestedAt,200);
    assert.equal(merged.rootCanalAftercareRequiredAt,200);
    assert.equal(merged.rootCanalAftercareSentAt,0);
    assert.equal(merged.rootCanalAftercareSentOrderAt,0);
    assert.equal(merged.rootCanalAftercareDocumentId,'');
    assert.equal(context.rootCanalAftercarePending(merged),true);
  }
  assert.match(dashboard,/if\(latest&&Number\(latest\.paymentRequestedAt\|\|0\)===aftercareLinkOrderAt&&String\(latest\.rootCanalAftercareDocumentId\|\|''\)===data\.documentId/);
  assert.match(dashboard,/if\(current&&Number\(current\.paymentRequestedAt\|\|0\)===sentOrderAt&&String\(current\.rootCanalAftercareDocumentId\|\|''\)===sentDocumentId&&String\(current\.rootCanalAftercareLastEventId\|\|''\)===eventId/);
});

test('public document fingerprint rejects a changed patient identity or payment order',()=>{
  const secret='synthetic-secret-with-at-least-thirty-two-characters';
  const source={clinicId:'clinic-1',date:'2026-10-15',patientId:'appointment-1',paymentRequestedAt:1234};
  const original={id:'appointment-1',name:'Synthetic Patient',file:'TEST-1',nationalId:'',paymentRequestedAt:1234,paymentItems:[{code:'root-canal'}]};
  const record={document:{source},identityFingerprint:aftercare.identityFingerprint(original,source,secret)};
  assert.equal(aftercare.currentDocument(record,{patients:[original]},secret),original);
  for(const changed of [{...original,name:'Another Patient'},{...original,file:'TEST-2'},{...original,nationalId:'9999999999'},{...original,paymentRequestedAt:2345},{...original,paymentItems:[{code:'cleaning-standard'}]}]){
    assert.equal(aftercare.currentDocument(record,{patients:[changed]},secret),null);
  }
  assert.equal(aftercare.currentDocument(record,{patients:[]},secret),null);
});

test('only the current document for the current payment order may be opened',()=>{
  const record={documentId:'current-document-id-123456789',document:{source:{paymentRequestedAt:1234}}};
  const patient={rootCanalAftercareDocumentId:record.documentId,rootCanalAftercareDocumentOrderAt:1234};
  assert.equal(aftercare.activeDocument(patient,record),true);
  assert.equal(aftercare.activeDocument({...patient,rootCanalAftercareDocumentId:'replacement-document-id'},record),false);
  assert.equal(aftercare.activeDocument({...patient,rootCanalAftercareDocumentOrderAt:2345},record),false);
  assert.equal(aftercare.activeDocument({...patient,rootCanalAftercareDocumentId:''},record),false);
});

test('dashboard and public aftercare page expose the complete share/print workflow',async()=>{
  const [dashboard,html,patientPage,worker,routes]=await Promise.all(['dashboard.js','index.html','root-canal-aftercare.html','service-worker.js','netlify.toml'].map(read));
  assert.match(dashboard,/rootCanalAftercareRequired\(selection\.items\)/);
  assert.match(dashboard,/rootCanalAftercareButtonMarkup\(p\)/);
  assert.match(dashboard,/confirmRootCanalAftercareSent/);
  assert.match(dashboard,/function rootCanalAftercareContextCurrent\(/);
  assert.match(dashboard,/if\(!rootCanalAftercareContextCurrent\(\)\)/);
  assert.match(dashboard,/issueNewRootCanalAftercareBtn/);
  assert.match(dashboard,/rootCanalAftercareDocumentId=data\.documentId/);
  assert.match(dashboard,/documentId=\$\{encodeURIComponent\(documentId\)\}/);
  assert.match(dashboard,/id="printRootCanalAftercareBtn"/);
  assert.match(dashboard,/id="confirmRootCanalAftercareSentBtn"/);
  assert.doesNotMatch(dashboard,/aftercareAntibioticName/);
  assert.match(html,/id="paymentActionField"/);
  assert.match(patientPage,/id="printBtn"/);
  const printCss=await read('root-canal-aftercare-print.css');
  assert.match(printCss,/overflow:visible!important/);
  assert.match(printCss,/height:auto!important/);
  assert.match(worker,/root-canal-aftercare\.html/);
  assert.match(routes,/\/api\/root-canal-aftercare/);
});
