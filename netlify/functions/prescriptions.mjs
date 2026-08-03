import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
import { apiHeaders, canAccessClinic, requireUser, sameOriginRequest } from './lib/session.mjs';
import { patientIdentityKeys } from './lib/patient-identity.mjs';

const headers=apiHeaders('GET,PUT,OPTIONS');
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const store=getStore({name:'clinic-prescriptions',consistency:'strong'});
const hash=value=>createHash('sha256').update(String(value)).digest('hex');
const text=(value,max=500)=>String(value??'').trim().slice(0,max);
const validClinic=value=>/^clinic-([1-9]|1[0-5])$/.test(value||'');
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'');
const validPatient=value=>/^[a-zA-Z0-9._:-]{1,80}$/.test(value||'');
const statusValues=new Set(['draft','ready_for_admin','shared']);
const categoryValues=new Set(['antibiotic','analgesic','mouthwash','legacy']);
const registryKey='registry/global';
const legacyKey=(clinicId,date,patientId)=>`clinics/${clinicId}/days/${date}/patients/${hash(patientId)}`;
const permanentKey=(clinicId,canonical)=>`clinics/${clinicId}/patients/${hash(canonical)}`;

const cleanMedicine=value=>({
  category:categoryValues.has(value?.category)?value.category:'legacy',
  template:text(value?.template,60)||'custom',
  name:text(value?.name,100),strength:text(value?.strength,60),dose:text(value?.dose,80),
  frequency:text(value?.frequency,100),duration:text(value?.duration,60),instructions:text(value?.instructions,500)
});
const cleanPatient=value=>({id:text(value?.id,80),name:text(value?.name,120),file:text(value?.file,40),phone:text(value?.phone,20),nationalId:text(value?.nationalId,10)});
const cleanPrescription=value=>({
  patient:cleanPatient(value?.patient),diagnosis:text(value?.diagnosis,500),
  medicines:(Array.isArray(value?.medicines)?value.medicines:[]).slice(0,12).map(cleanMedicine).filter(item=>item.name),
  notes:text(value?.notes,500),medicalReview:Boolean(value?.medicalReview),doctorConfirmed:Boolean(value?.doctorConfirmed),
  notice:'DRAFT — NOT MEDICAL ADVICE — DOCUMENTATION-ONLY — AUTHORIZED CLINICIAN SIGN-OFF REQUIRED',
  status:statusValues.has(value?.status)?value.status:'draft',issuedAt:text(value?.issuedAt,40),
  sourcePatientId:text(value?.sourcePatientId,80),sourceDate:text(value?.sourceDate,10)
});
const cleanHistory=value=>(Array.isArray(value)?value:[]).slice(-29).map(entry=>({
  at:Number(entry?.at||0),status:statusValues.has(entry?.status)?entry.status:'draft',by:text(entry?.by,120),prescription:cleanPrescription(entry?.prescription)
})).filter(entry=>entry.at>0);
const registryRecord=(record,canonical)=>({
  canonical,clinicId:text(record?.clinicId,20),patient:cleanPatient(record?.prescription?.patient),status:statusValues.has(record?.status)?record.status:'draft',
  sourcePatientId:text(record?.sourcePatientId||record?.patientId,80),sourceDate:text(record?.sourceDate||record?.date,10),
  medicineCount:Array.isArray(record?.prescription?.medicines)?record.prescription.medicines.length:0,
  revision:Number(record?.revision||0),updatedAt:Number(record?.updatedAt||0),updatedBy:text(record?.updatedBy,120),
  sharedAt:Number(record?.sharedAt||0),sharedCount:Number(record?.sharedCount||0)
});
const requestedIdentity=url=>patientIdentityKeys({file:url.searchParams.get('file'),phone:url.searchParams.get('phone'),nationalId:url.searchParams.get('nationalId')});

export default async request=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(!['GET','PUT'].includes(request.method))return reply({error:'Method not allowed'},405);
  if(request.method==='PUT'&&!sameOriginRequest(request))return reply({error:'Invalid request origin'},403);
  const auth=await requireUser(request);if(!auth.ok)return reply({error:auth.error},auth.status);
  const url=new URL(request.url);
  if(request.method==='GET'&&url.searchParams.get('scope')==='all'){
    if(auth.user?.role!=='admin')return reply({error:'Admin role required'},403);
    const registry=await store.get(registryKey,{type:'json',consistency:'strong'})||{};
    const records=Object.entries(registry.records||{}).map(([canonical,value])=>({...value,canonical})).sort((a,b)=>Number(b.updatedAt||0)-Number(a.updatedAt||0)).slice(0,1000);
    return reply({ok:true,records,revision:Number(registry.revision||0),updatedAt:Number(registry.updatedAt||0)});
  }
  const patientId=url.searchParams.get('patientId')||'',date=url.searchParams.get('date')||'',clinicId=url.searchParams.get('clinic')||'';
  if(!validPatient(patientId)||!validDate(date)||!validClinic(clinicId))return reply({error:'Invalid prescription key'},400);
  if(!canAccessClinic(auth.user,clinicId))return reply({error:'Clinic access denied'},403);
  const registry=await store.get(registryKey,{type:'json',consistency:'strong'})||{records:{},aliases:{},revision:0};
  const queryKeys=requestedIdentity(url),canonical=queryKeys.map(key=>registry.aliases?.[key]).find(Boolean);
  if(request.method==='GET'){
    const record=canonical?await store.get(permanentKey(clinicId,canonical),{type:'json',consistency:'strong'}):null;
    const legacy=record?null:await store.get(legacyKey(clinicId,date,patientId),{type:'json',consistency:'strong'});
    return reply({ok:true,record:record||legacy||null});
  }
  const body=await request.json().catch(()=>null),prescription=cleanPrescription(body?.prescription);
  if(!prescription.diagnosis||!prescription.medicines.length||!prescription.medicalReview||!prescription.doctorConfirmed)return reply({error:'Prescription review is incomplete'},400);
  if(prescription.medicines.some(item=>!item.name||!item.dose||!item.frequency||!item.duration))return reply({error:'Medication fields are incomplete'},400);
  if(prescription.status==='shared'&&auth.user?.role!=='admin')prescription.status='ready_for_admin';
  const identityKeys=patientIdentityKeys(prescription.patient),resolvedCanonical=identityKeys.map(key=>registry.aliases?.[key]).find(Boolean)||canonical||identityKeys[0]||`visit:${clinicId}:${date}:${patientId}`;
  const key=permanentKey(clinicId,resolvedCanonical),existing=await store.get(key,{type:'json',consistency:'strong'})||await store.get(legacyKey(clinicId,date,patientId),{type:'json',consistency:'strong'});
  const expected=Number(body?.expectedRevision||0),currentRevision=Number(existing?.revision||0);if(expected&&expected!==currentRevision)return reply({error:'Prescription was updated by another user',revision:currentRevision},409);
  const now=Date.now(),actor=text(auth.user?.displayName||auth.user?.username,120),history=[...cleanHistory(existing?.history),{at:now,status:prescription.status,by:actor,prescription}].slice(-30);
  const record={patientId,clinicId,date,sourcePatientId:prescription.sourcePatientId||patientId,sourceDate:prescription.sourceDate||date,prescription,status:prescription.status,history,revision:currentRevision+1,updatedAt:now,updatedBy:actor,sharedAt:prescription.status==='shared'?now:Number(existing?.sharedAt||0),sharedCount:Number(existing?.sharedCount||0)+(prescription.status==='shared'?1:0)};
  await store.setJSON(key,record);
  const records={...(registry.records||{})},aliases={...(registry.aliases||{})};records[resolvedCanonical]=registryRecord(record,resolvedCanonical);identityKeys.forEach(alias=>{aliases[alias]=resolvedCanonical});
  const limited=Object.keys(records).sort((a,b)=>Number(records[b]?.updatedAt||0)-Number(records[a]?.updatedAt||0)).slice(0,5000),allowed=new Set(limited);
  const nextRegistry={records:Object.fromEntries(limited.map(item=>[item,records[item]])),aliases:Object.fromEntries(Object.entries(aliases).filter(([,target])=>allowed.has(target))),revision:Number(registry.revision||0)+1,updatedAt:now};
  await store.setJSON(registryKey,nextRegistry);
  return reply({ok:true,record});
};

export const __test={cleanMedicine,cleanPrescription,registryRecord,statusValues,categoryValues};
