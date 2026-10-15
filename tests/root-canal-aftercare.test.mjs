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
const sample={deliveryMode:'clinic',patient:{name:'Synthetic Patient',file:'TEST-1'},clinic:{name:'Synthetic Clinic'},source:{clinicId:'clinic-1',patientId:'test-id',date:'2026-10-15',paymentRequestedAt:1234},medications:[{type:'ibuprofen',name:'Ibuprofen',dose:'400 mg',frequency:'clinician supplied',duration:'clinician supplied'}]};

test('only clinician-selected analgesics can be attached; no antibiotic field is accepted',()=>{
  assert.deepEqual([...aftercare.medicationTypes],['ibuprofen','paracetamol']);
  assert.equal(aftercare.validateDocument(aftercare.cleanDocument(sample),'clinic'),'');
  assert.equal(aftercare.validateDocument(aftercare.cleanDocument({...sample,medications:[{...sample.medications[0],dose:'600 mg'}]}),'clinic'),'');
  assert.equal(aftercare.validateDocument(aftercare.cleanDocument({...sample,medications:[{...sample.medications[0],type:'paracetamol',dose:'500 mg'}]}),'clinic'),'');
  assert.match(aftercare.validateDocument(aftercare.cleanDocument({...sample,medications:[{...sample.medications[0],type:'antibiotic'}]}),'clinic'),/Only clinician-selected analgesics/);
  assert.match(aftercare.validateDocument(aftercare.cleanDocument({...sample,medications:[{...sample.medications[0],dose:''}]}),'clinic'),/incomplete/);
  for(const dose of ['200 mg','800 mg','500 mg','400mg'])assert.match(aftercare.validateDocument(aftercare.cleanDocument({...sample,medications:[{...sample.medications[0],dose}]}),'clinic'),/strength is not permitted/);
  assert.match(aftercare.validateDocument(aftercare.cleanDocument({...sample,medications:[{...sample.medications[0],type:'paracetamol',dose:'600 mg'}]}),'clinic'),/strength is not permitted/);
  assert.match(aftercare.validateDocument(aftercare.cleanDocument(sample),'admin'),/Delivery mode/);
  assert.equal(aftercare.validateDocument(aftercare.cleanDocument({...sample,deliveryMode:'admin-general',medications:[]}), 'admin'),'');
  assert.match(aftercare.validateDocument(aftercare.cleanDocument({...sample,deliveryMode:'admin-general'}),'admin'),/must not include medications/);
  assert.match(aftercare.validateDocument(aftercare.cleanDocument({...sample,deliveryMode:'admin-general',medications:[]}), 'clinic'),/Delivery mode/);
});

test('aftercare reminder and sharing counters survive daily-state cleaning',()=>{
  const cleaned=state.cleanPatient({id:'test-id',name:'Synthetic Patient',rootCanalAftercareRequiredAt:1234,rootCanalAftercareSentAt:2345,rootCanalAftercareSentOrderAt:1234,rootCanalAftercareCount:2,rootCanalAftercareLastEventId:'evt-test',rootCanalAftercareDocumentId:'abc_test_document_123456789',rootCanalAftercareDocumentOrderAt:1234,rootCanalAftercareDocumentIssuedAt:2000,rootCanalAftercareGeneralDocumentId:'general-doc',rootCanalAftercareGeneralDocumentOrderAt:1234,rootCanalAftercareGeneralDocumentIssuedAt:2100,rootCanalAftercareClinicDocumentId:'clinic-doc',rootCanalAftercareClinicDocumentOrderAt:1234,rootCanalAftercareClinicDocumentIssuedAt:2200});
  assert.equal(cleaned.rootCanalAftercareRequiredAt,1234);
  assert.equal(cleaned.rootCanalAftercareSentAt,2345);
  assert.equal(cleaned.rootCanalAftercareSentOrderAt,1234);
  assert.equal(cleaned.rootCanalAftercareCount,2);
  assert.equal(cleaned.rootCanalAftercareLastEventId,'evt-test');
  assert.equal(cleaned.rootCanalAftercareDocumentId,'abc_test_document_123456789');
  assert.equal(cleaned.rootCanalAftercareDocumentOrderAt,1234);
  assert.equal(cleaned.rootCanalAftercareDocumentIssuedAt,2000);
  assert.equal(cleaned.rootCanalAftercareGeneralDocumentId,'general-doc');
  assert.equal(cleaned.rootCanalAftercareGeneralDocumentOrderAt,1234);
  assert.equal(cleaned.rootCanalAftercareGeneralDocumentIssuedAt,2100);
  assert.equal(cleaned.rootCanalAftercareClinicDocumentId,'clinic-doc');
  assert.equal(cleaned.rootCanalAftercareClinicDocumentOrderAt,1234);
  assert.equal(cleaned.rootCanalAftercareClinicDocumentIssuedAt,2200);
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
  assert.match(dashboard,/if\(latest&&Number\(latest\.paymentRequestedAt\|\|0\)===aftercareLinkOrderAt&&String\(latest\[fields\.id\]\|\|''\)===data\.documentId/);
  assert.match(dashboard,/if\(current&&Number\(current\.paymentRequestedAt\|\|0\)===sentOrderAt&&rootCanalAftercareReference\(current,sentMode\)\.id===sentDocumentId/);
});

test('administration opens general aftercare directly without showing medication controls',async()=>{
  const dashboard=await read('dashboard.js');
  const openSource=dashboard.slice(dashboard.indexOf('function openRootCanalAftercare('),dashboard.indexOf('function selectedRootCanalAnalgesics('));
  const patient={id:'synthetic-id',name:'Synthetic Patient',file:'TEST-1',phone:'0500000000',paymentRequestedAt:1234,paymentItems:[{code:'root-canal'}],rootCanalAftercareDocumentId:''};
  const controls=new Map(),picker={hidden:false};
  const element=id=>{if(id==='rootCanalAftercareModal')return{querySelector:()=>picker};if(!controls.has(id))controls.set(id,{hidden:true,value:'',textContent:''});return controls.get(id)};
  let opened='';
  const context=vm.createContext({authUser:{role:'admin'},VIEW_MODE:'admin',lang:'ar',patientById:()=>patient,rootCanalAftercareRequired:items=>items.some(item=>item.code==='root-canal'),pendingAftercareId:null,aftercareLinkOrderAt:0,aftercareLoadGeneration:0,clearRootCanalAftercareDraft(){},$:element,patientWhatsappNumber:()=> '966500000000',openModal:id=>{opened=id}});
  const helpers=dashboard.slice(dashboard.indexOf('function rootCanalAftercareMode('),dashboard.indexOf('function rootCanalAftercareButtonMarkup('));
  vm.runInContext(`${helpers}\n${openSource}`,context);
  context.openRootCanalAftercare('synthetic-id');
  assert.equal(opened,'rootCanalAftercareModal');
  assert.equal(picker.hidden,true);
  assert.equal(controls.get('rootCanalAftercareGeneralNotice').hidden,false);
  assert.match(controls.get('rootCanalAftercareGeneralNotice').textContent,/تعليمات عامة فقط/);
  assert.equal(controls.get('rootCanalAftercarePhone').value,'966500000000');
  assert.equal(context.pendingAftercareId,'synthetic-id');
});

test('sent instructions remain a single gray reopen action, and a newer order restores the red reminder',async()=>{
  const dashboard=await read('dashboard.js');
  const source=dashboard.slice(dashboard.indexOf('function rootCanalAftercareRequired('),dashboard.indexOf('function installRootCanalAftercareUI('));
  const context=vm.createContext({lang:'ar',authUser:{role:'clinic'},VIEW_MODE:'clinic',escapeHtml:value=>String(value)});vm.runInContext(source,context);
  const patient={id:'synthetic-id',paymentItems:[{code:'root-canal'}],paymentRequestedAt:100,rootCanalAftercareRequiredAt:100,rootCanalAftercareSentAt:200,rootCanalAftercareSentOrderAt:100,rootCanalAftercareDocumentId:'doc-one',rootCanalAftercareDocumentOrderAt:100};
  const sent=context.rootCanalAftercareButtonMarkup(patient);
  assert.match(sent,/aftercare-sent/);assert.match(sent,/تم إرسال التعليمات/);assert.doesNotMatch(sent,/aftercare-pending/);
  assert.equal((sent.match(/data-aftercare-id=/g)||[]).length,1);
  const pending=context.rootCanalAftercareButtonMarkup({...patient,paymentRequestedAt:300,rootCanalAftercareRequiredAt:300,rootCanalAftercareSentAt:0,rootCanalAftercareSentOrderAt:0,rootCanalAftercareDocumentId:'',rootCanalAftercareDocumentOrderAt:0});
  assert.match(pending,/aftercare-pending/);assert.match(pending,/مشاركة تعليمات العصب/);assert.doesNotMatch(pending,/aftercare-sent/);
  const css=await read('dashboard.css');assert.match(css,/\.aftercare-row-btn\.aftercare-sent\{[^}]*animation:none/);
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

test('general and clinic instructions retain independent active links in either issuance order',async()=>{
  const general={documentId:'general-document-id-123456789',document:{deliveryMode:'admin-general',source:{paymentRequestedAt:1234}}};
  const clinic={documentId:'clinic-document-id-123456789',document:{deliveryMode:'clinic',source:{paymentRequestedAt:1234}}};
  const patient={rootCanalAftercareGeneralDocumentId:general.documentId,rootCanalAftercareGeneralDocumentOrderAt:1234,rootCanalAftercareClinicDocumentId:clinic.documentId,rootCanalAftercareClinicDocumentOrderAt:1234};
  assert.equal(aftercare.activeDocument(patient,general),true);
  assert.equal(aftercare.activeDocument(patient,clinic),true);
  assert.equal(aftercare.activeDocument({...patient,rootCanalAftercareGeneralDocumentId:'new-general-document'},general),false);
  assert.equal(aftercare.activeDocument({...patient,rootCanalAftercareGeneralDocumentId:'new-general-document'},clinic),true);
  assert.equal(aftercare.activeDocument({...patient,rootCanalAftercareClinicDocumentId:'new-clinic-document'},general),true);
  assert.equal(aftercare.activeDocument({...patient,rootCanalAftercareClinicDocumentId:'new-clinic-document'},clinic),false);
  const dashboard=await read('dashboard.js');
  const helpers=dashboard.slice(dashboard.indexOf('function rootCanalAftercareMode('),dashboard.indexOf('function rootCanalAftercareButtonMarkup('));
  const context=vm.createContext({authUser:{role:'admin'},VIEW_MODE:'admin'});vm.runInContext(helpers,context);
  assert.equal(context.rootCanalAftercareReference(patient,context.rootCanalAftercareMode()).id,general.documentId);
  context.authUser={role:'clinic'};context.VIEW_MODE='clinic';
  assert.equal(context.rootCanalAftercareReference(patient,context.rootCanalAftercareMode()).id,clinic.documentId);
  const required=dashboard.slice(dashboard.indexOf('function rootCanalAftercareRequired('),dashboard.indexOf('function rootCanalAftercareButtonMarkup('));
  const merge=dashboard.slice(dashboard.indexOf('function paymentReceiptStamp('),dashboard.indexOf('function announceSyncedState('));
  const mergedContext=vm.createContext({});vm.runInContext(`${required}\n${merge}`,mergedContext);
  const adminDevice={id:'p1',paymentRequestedAt:1234,paymentItems:[{code:'root-canal'}],rootCanalAftercareRequiredAt:1234,rootCanalAftercareGeneralDocumentId:general.documentId,rootCanalAftercareGeneralDocumentOrderAt:1234,rootCanalAftercareGeneralDocumentIssuedAt:2000};
  const clinicDevice={id:'p1',paymentRequestedAt:1234,paymentItems:[{code:'root-canal'}],rootCanalAftercareRequiredAt:1234,rootCanalAftercareClinicDocumentId:clinic.documentId,rootCanalAftercareClinicDocumentOrderAt:1234,rootCanalAftercareClinicDocumentIssuedAt:2100};
  for(const [remote,local] of [[adminDevice,clinicDevice],[clinicDevice,adminDevice]]){
    const merged=mergedContext.mergePatientVersions(remote,local);
    assert.equal(aftercare.activeDocument(merged,general),true);
    assert.equal(aftercare.activeDocument(merged,clinic),true);
  }
});

test('dashboard and public aftercare page expose the complete share/print workflow',async()=>{
  const [dashboard,html,patientPage,worker,routes]=await Promise.all(['dashboard.js','index.html','root-canal-aftercare.html','service-worker.js','netlify.toml'].map(read));
  assert.match(dashboard,/rootCanalAftercareRequired\(selection\.items\)/);
  assert.match(dashboard,/rootCanalAftercareButtonMarkup\(p\)/);
  assert.match(dashboard,/confirmRootCanalAftercareSent/);
  assert.match(dashboard,/function rootCanalAftercareContextCurrent\(/);
  assert.match(dashboard,/if\(!rootCanalAftercareContextCurrent\(\)\)/);
  assert.match(dashboard,/issueNewRootCanalAftercareBtn/);
  assert.match(dashboard,/current\[fields\.id\]=data\.documentId/);
  assert.match(dashboard,/documentId=\$\{encodeURIComponent\(documentId\)\}/);
  assert.match(dashboard,/id="printRootCanalAftercareBtn"/);
  assert.match(dashboard,/id="confirmRootCanalAftercareSentBtn"/);
  assert.match(dashboard,/adminGeneral=mode==='admin-general'/);
  assert.match(dashboard,/const medications=deliveryMode==='admin-general'\?\[\]:selectedRootCanalAnalgesics\(\)/);
  assert.match(dashboard,/rootCanalAftercareRecommendationCheck/);
  assert.match(dashboard,/choice\.hidden=!required\|\|VIEW_MODE!=='clinic'\|\|authUser\?\.role!=='clinic'/);
  assert.match(dashboard,/if\(saved===false&&openRecommendation\)\{openRecommendation=false/);
  assert.match(dashboard,/if\(openRecommendation\)\{pendingAftercareCompletionAction=finishFollowUp;openRootCanalAftercare\(p\.id\);return\}/);
  assert.match(dashboard,/Dear patient, please open your root-canal aftercare instructions at \$\{url\}, read and understand them, and follow the guidance/);
  assert.match(dashboard,/يرجى فتح تعليمات ما بعد علاج العصب عبر الرابط \$\{url\}، وقراءتها وفهمها واتباع الإرشادات/);
  assert.match(dashboard,/If you have any questions, please contact Best Care Dental Clinics/);
  assert.match(dashboard,/إذا كان لديك أي استفسار، تواصل مع عيادات أفضل عناية/);
  assert.match(dashboard,/Share root-canal instructions':'مشاركة تعليمات العصب/);
  assert.match(dashboard,/querySelectorAll\('\.patient-name-stack'\)\.forEach\(stack=>\{const button=stack\.closest\('td'\)\?\.querySelector\('\.aftercare-row-btn'\);if\(button\)stack\.append\(button\)\}/);
  assert.doesNotMatch(dashboard,/\$\('rootCanalAftercareDoctorConfirm'\)\.checked/);
  assert.doesNotMatch(dashboard,/aftercareAntibioticName/);
  assert.match(html,/id="paymentActionField"/);
  assert.match(patientPage,/id="printBtn"/);
  assert.match(patientPage,/id="generalModeNotice"/);
  const publicScript=await read('root-canal-aftercare.js');
  assert.match(publicScript,/adminGeneral=document\.deliveryMode==='admin-general'/);
  assert.match(publicScript,/\$\('doctorName'\)\.textContent='إدارة العيادة'/);
  const css=await read('dashboard.css');assert.match(css,/\.patient-name-stack \.aftercare-row-btn\.aftercare-pending\{border-color:#d7433b/);
  const release=JSON.parse(await read('release.json'));assert.match(release.summary.ar,/دون أدوية/);
  const printCss=await read('root-canal-aftercare-print.css');
  assert.match(printCss,/overflow:visible!important/);
  assert.match(printCss,/height:auto!important/);
  assert.match(worker,/root-canal-aftercare\.html/);
  assert.match(routes,/\/api\/root-canal-aftercare/);
});
