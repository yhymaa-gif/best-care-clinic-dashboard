import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  addMinutes,
  appointmentConflicts,
  buildAppointment,
  nextAvailableStart,
  normalizePatient,
  samePatient,
  validatePatient
} from '../appointment-entry-core.js';

const read=file=>readFile(new URL(`../${file}`,import.meta.url),'utf8');

test('appointment entry normalizes patient identity and requires complete scheduling data',()=>{
  assert.deepEqual(normalizePatient({fullName:'  ملاك   الحسن الحفظي ',fileNo:'٠٠٧٠٤١',mobile:'+966 50 123 4567',nationalId:'١٢٣٤٥٦٧٨٩٠'}),{
    id:'',name:'ملاك الحسن الحفظي',file:'007041',phone:'0501234567',nationalId:'1234567890'
  });
  assert.equal(validatePatient({name:'ملاك الحسن',file:'7041',phone:'0501234567'}).complete,true);
  assert.deepEqual(validatePatient({name:'ملاك',file:'0',phone:'50123'}).errors,['name','file','phone']);
});

test('appointment time helpers find overlaps and the next free time',()=>{
  const patients=[{id:'a',start:'14:00',end:'14:30',status:'waiting'},{id:'b',start:'14:30',end:'15:15',status:'waiting'}];
  assert.equal(addMinutes('15:15',30),'15:45');
  assert.equal(appointmentConflicts(patients,{start:'14:20',end:'14:40'}).length,2);
  assert.equal(appointmentConflicts(patients,{start:'15:15',end:'15:45'}).length,0);
  assert.equal(nextAvailableStart(patients,{minimum:'14:00'}),'15:15');
  assert.equal(nextAvailableStart([{start:'14:30',end:'15:00',status:'waiting'}],{minimum:'14:00'}),'14:00');
});

test('duplicate identity uses file number or national ID and builds one complete appointment',()=>{
  assert.equal(samePatient({file:'7041',nationalId:'1111111111'},{file:'7041',nationalId:''}),true);
  assert.equal(samePatient({file:'7041',nationalId:'1111111111'},{file:'9000',nationalId:'1111111111'}),true);
  const result=buildAppointment({patient:{name:'ملاك الحسن الحفظي',file:'7041',phone:'0501234567'},start:'16:00',duration:30,procedure:'مراجعة',id:'fixed-id',now:123});
  assert.equal(result.id,'fixed-id');assert.equal(result.end,'16:30');assert.equal(result.name,'ملاك الحسن الحفظي');
});

test('new appointment page uses central lookup and revision-safe shared day state',async()=>{
  const [html,script,serviceWorker,manifest]=await Promise.all([read('appointment-entry.html'),read('appointment-entry.js'),read('service-worker.js'),read('manifest.webmanifest')]);
  assert.match(html,/id="patientSearch"/);assert.match(html,/id="entryDate" type="date"/);assert.match(html,/id="entryClinic"/);assert.match(html,/id="startTime" type="time"/);
  assert.match(script,/\/api\/patient-lookup/);assert.match(script,/\/api\/patients/);assert.match(script,/\/api\/patient-profile/);assert.match(script,/\/api\/state/);
  assert.match(script,/method:'PATCH'/);assert.match(script,/clinic:'all'/);
  assert.match(script,/expectedRevision:latest\.revision/);assert.match(script,/response\.status===409/);assert.match(script,/for\(let attempt=0;attempt<3/);
  assert.match(script,/samePatient\(patient,checked\.patient\)/);assert.match(script,/appointmentConflicts/);assert.match(script,/bestcare-dashboard-sync-v1/);
  assert.match(serviceWorker,/appointment-entry\.html/);assert.match(serviceWorker,/20260905-photo-consent-alert/);assert.match(manifest,/appointment-entry\.html\?source=pwa/);
});

test('existing patient-list action remains and hands off to the appointment page',async()=>{
  const [html,dashboard]=await Promise.all([read('index.html'),read('dashboard.js')]);
  assert.match(html,/id="patientFormDirectorySearchBtn"/);assert.match(html,/id="patientProfileScheduleBtn"/);assert.match(html,/data-modern-action="add-appointments"/);
  assert.match(dashboard,/data-identity-schedule/);assert.match(dashboard,/bestcare_appointment_entry_draft_v1/);assert.match(dashboard,/appointment-entry\.html\?date=/);
  assert.match(dashboard,/patient:\{id:draft\.id\|\|'',name:draft\.fullName,file:draft\.fileNo,phone:draft\.mobile/);
});

test('appointment page does not persist patient details in browser durable storage',async()=>{
  const script=await read('appointment-entry.js');
  assert.doesNotMatch(script,/localStorage\.setItem\([^,]*(?:patient|appointment)/i);
  assert.match(script,/sessionStorage\.removeItem\(HANDOFF_KEY\)/);
});
