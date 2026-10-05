import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __test as profile } from '../netlify/functions/patient-profile.mjs';

test('patient profile normalizes exact identity lookups', () => {
  assert.equal(profile.normalizeLookup('file', ' A-120 '), 'A120');
  assert.equal(profile.normalizeLookup('phone', '+966 50 123 4567'), '0501234567');
  assert.equal(profile.normalizeLookup('national', '1234567890'), '1234567890');
  assert.equal(profile.normalizeLookup('file', '0'), '');
});

test('patient profile links appointments by any stable patient identity', () => {
  const aliases = new Set(['file:A120', 'phone:0501234567']);
  assert.equal(profile.hasAlias({ file: 'A-120', phone: '' }, aliases), true);
  assert.equal(profile.hasAlias({ file: '', phone: '+966501234567' }, aliases), false);
  assert.equal(profile.hasAlias({ file: 'A121', phone: '0500000000' }, aliases), false);
});

test('patient profile retains the doctor no-payment decision', () => {
  const output=profile.profilePayload({id:'p1',name:'مريض'},[{clinicId:'clinic-1',date:'2026-10-06',state:{updatedAt:10},matches:[{id:'p1',status:'done',paymentRequired:false,paymentNotRequiredAt:1234}]}],[],[]);
  assert.equal(output.appointments[0].paymentNotRequiredAt,1234);
  assert.equal(output.summary.openPayments,0);
});

test('identity correction retries with ETag and preserves a concurrent patient status update', async () => {
  let current={patients:[{id:'p1',file:'100',name:'Old name',status:'waiting'}],revision:1,updatedAt:1};
  let etag='v1',firstWrite=true;
  const daysStore={
    async getWithMetadata(){return{data:structuredClone(current),etag}},
    async setJSON(key,value,options){
      assert.equal(options.onlyIfMatch,etag);
      if(firstWrite){
        firstWrite=false;
        current={...current,patients:current.patients.map(item=>({...item,status:'done'})),revision:2,updatedAt:2};
        etag='v2';
        return{modified:false};
      }
      current=structuredClone(value);etag='v3';return{modified:true,etag};
    }
  };
  const updated=await profile.updateMatchedDayIdentity(daysStore,{key:'days/2026-10-06'},new Set(['file:100']),{name:'Correct name',file:'100',phone:'',nationalId:''},'Admin');
  assert.equal(updated,1);
  assert.equal(current.patients[0].name,'Correct name');
  assert.equal(current.patients[0].status,'done');
  assert.equal(current.revision,3);
});

test('patient profile hydrates historical treatment plans before matching a searched patient', async () => {
  const source = await readFile(new URL('../netlify/functions/patient-profile.mjs', import.meta.url), 'utf8');
  assert.match(source, /hydrateTreatmentPlanRegistry/);
  assert.match(source, /historyClinics/);
  assert.match(source, /planStore: plansStore/);
});

test('patient profile parses both legacy and clinic-scoped appointment keys', () => {
  assert.deepEqual(profile.parseDayKey('days/2026-08-02'), { clinicId: 'clinic-1', date: '2026-08-02' });
  assert.deepEqual(profile.parseDayKey('clinics/clinic-15/days/2026-08-03'), { clinicId: 'clinic-15', date: '2026-08-03' });
  assert.equal(profile.parseDayKey('clinics/clinic-16/days/2026-08-03'), null);
});

test('patient profile summarizes WhatsApp plan and review communication events', () => {
  const summary = profile.communicationPayload([{ canonical: 'patient-1', record: {
    counts: { planWhatsapp: 3, reviewWhatsapp: 2 },
    lastAt: { planWhatsapp: 300, reviewWhatsapp: 250 },
    events: [
      { id: 'p-3', kind: 'plan_whatsapp', at: 300 },
      { id: 'r-2', kind: 'review_whatsapp', at: 250 }
    ]
  } }]);
  assert.equal(summary.planWhatsappCount, 3);
  assert.equal(summary.reviewWhatsappCount, 2);
  assert.equal(summary.lastPlanWhatsappAt, 300);
  assert.equal(summary.lastReviewWhatsappAt, 250);
  assert.deepEqual(summary.events.map(event => event.id), ['p-3', 'r-2']);
});

test('dashboard exposes a unified patient record and local theme control', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="patientProfileForm"/);
  assert.match(html, /data-profile-tab="appointments"/);
  assert.match(html, /data-profile-tab="plans"/);
  assert.match(html, /data-profile-tab="prescriptions"/);
  assert.match(html, /data-profile-tab="payments"/);
  assert.match(html, /data-profile-tab="labs"/);
  assert.match(html, /id="themeToggleBtn"/);
  assert.match(html, /id="patientProfilePlanWhatsappCount"/);
  assert.match(html, /id="patientProfileReviewWhatsappCount"/);
  assert.match(html, /data-profile-tab="communications"/);
});

test('successful WhatsApp actions record central patient communication', async () => {
  const dashboard = await readFile(new URL('../dashboard.js', import.meta.url), 'utf8');
  const state = await readFile(new URL('../netlify/functions/state.mjs', import.meta.url), 'utf8');
  const plan = await readFile(new URL('../treatment-plan.js', import.meta.url), 'utf8');
  assert.match(dashboard, /recordPatientCommunication\(patient,'review_whatsapp'/);
  assert.match(dashboard, /patient\.reviewRequestedAt=requestedAt/);
  assert.match(dashboard, /if\(sendButton\?\.disabled\)return/);
  assert.match(dashboard, /review-requested/);
  assert.match(dashboard, /review-request-count/);
  assert.match(dashboard, /أُرسل طلب التقييم/);
  assert.match(state, /reviewRequestedAt:Number/);
  assert.match(state, /reviewRequestCount:Math\.max/);
  assert.match(state, /reviewLastEventId:String/);
  assert.match(plan, /recordPlanWhatsappCommunication\(\)/);
  assert.match(plan, /kind:'plan_whatsapp'/);
});
