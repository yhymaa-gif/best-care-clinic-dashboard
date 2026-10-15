import { getStore } from '@netlify/blobs';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { apiHeaders, canAccessClinic, requireUser, sameOriginRequest } from './lib/session.mjs';

const headers=apiHeaders('GET,POST,OPTIONS');
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const aftercareStore=()=>getStore({name:'clinic-root-canal-aftercare',consistency:'strong'});
const hash=value=>createHash('sha256').update(String(value)).digest('hex');
const text=(value,max=240)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
const validToken=value=>/^[a-zA-Z0-9_-]{40,120}$/.test(String(value||''));
const validDocumentId=value=>/^[a-zA-Z0-9_-]{24,60}$/.test(String(value||''));
const medicationTypes=new Set(['ibuprofen','paracetamol']);
const allowedDoses={ibuprofen:new Set(['400 mg','600 mg']),paracetamol:new Set(['500 mg'])};
const rootCanalCodes=new Set(['root-canal','root-canal-retreatment']);
const linkLifetimeMs=90*24*60*60*1000;
const tokenKey=value=>`tokens/${hash(value)}`;
const documentKey=value=>`documents/${value}`;
const dayKeyFor=source=>source.clinicId==='clinic-1'?`days/${source.date}`:`clinics/${source.clinicId}/days/${source.date}`;
const dayStore=()=>getStore({name:'clinic-dashboard-days',consistency:'strong'});
const identityFingerprint=(patient,source,secret)=>createHmac('sha256',secret).update(JSON.stringify({clinicId:source.clinicId,date:source.date,patientId:String(patient?.id||''),file:text(patient?.file,40).toLowerCase(),nationalId:text(patient?.nationalId,20),name:text(patient?.name,120).toLowerCase()})).digest('hex');
const sameFingerprint=(expected,actual)=>typeof expected==='string'&&/^[a-f0-9]{64}$/.test(expected)&&timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(actual,'hex'));
const matchesCurrentOrder=(patient,source)=>Boolean(patient&&Number(patient.paymentRequestedAt)>0&&Number(patient.paymentRequestedAt)===Number(source.paymentRequestedAt)&&(patient.paymentItems||[]).some(item=>rootCanalCodes.has(item.code)));
const currentDocument=(record,day,secret)=>{
  const source=record?.document?.source;
  if(!source)return null;
  const patient=(day?.patients||[]).find(item=>String(item.id)===source.patientId);
  return matchesCurrentOrder(patient,source)&&sameFingerprint(record.identityFingerprint,identityFingerprint(patient,source,secret))?patient:null;
};
const activeDocument=(patient,record)=>{
  if(!patient||!record?.documentId)return false;
  const orderAt=Number(record.document?.source?.paymentRequestedAt||0),general=record.document?.deliveryMode==='admin-general';
  const id=general?patient.rootCanalAftercareGeneralDocumentId:(patient.rootCanalAftercareClinicDocumentId||patient.rootCanalAftercareDocumentId);
  const savedOrder=general?patient.rootCanalAftercareGeneralDocumentOrderAt:(patient.rootCanalAftercareClinicDocumentId?patient.rootCanalAftercareClinicDocumentOrderAt:patient.rootCanalAftercareDocumentOrderAt);
  return orderAt>0&&String(id||'')===record.documentId&&Number(savedOrder||0)===orderAt;
};

const cleanMedication=value=>({
  type:medicationTypes.has(value?.type)?value.type:'',
  name:text(value?.name,100),
  dose:text(value?.dose,80),
  frequency:text(value?.frequency,100),
  duration:text(value?.duration,80),
  notes:text(value?.notes,240)
});

const cleanDocument=value=>({
  deliveryMode:value?.deliveryMode==='admin-general'?'admin-general':value?.deliveryMode==='clinic'?'clinic':'',
  patient:{name:text(value?.patient?.name,120),file:text(value?.patient?.file,40)},
  clinic:{name:text(value?.clinic?.name,120),doctorName:text(value?.clinic?.doctorName,120),phone:text(value?.clinic?.phone,30)},
  source:{clinicId:text(value?.source?.clinicId,20),patientId:text(value?.source?.patientId,80),date:text(value?.source?.date,10),paymentRequestedAt:Number(value?.source?.paymentRequestedAt||0)},
  medications:(Array.isArray(value?.medications)?value.medications:[]).slice(0,3).map(cleanMedication),
  notice:'DRAFT — NOT MEDICAL ADVICE — DOCUMENTATION-ONLY — AUTHORIZED CLINICIAN SIGN-OFF REQUIRED'
});

function validateDocument(document,role){
  if(!document.patient.name||!document.source.clinicId||!/^clinic-([1-9]|1[0-5])$/.test(document.source.clinicId)||!/^\d{4}-\d{2}-\d{2}$/.test(document.source.date))return'Patient context is incomplete';
  if((role==='admin'&&document.deliveryMode!=='admin-general')||(role==='clinic'&&document.deliveryMode!=='clinic')||!['admin','clinic'].includes(role))return'Delivery mode is not authorized for this role';
  if(document.deliveryMode==='admin-general'&&document.medications.length)return'Administration instructions must not include medications';
  if(document.medications.length>2||new Set(document.medications.map(item=>item.type)).size!==document.medications.length)return'Duplicate or excessive analgesics';
  if(document.medications.some(item=>!item.name||!item.dose||!item.frequency||!item.duration))return'Medication instructions are incomplete';
  if(document.medications.some(item=>!medicationTypes.has(item.type)))return'Only clinician-selected analgesics may be attached';
  if(document.medications.some(item=>!allowedDoses[item.type]?.has(item.dose)))return'Medication strength is not permitted';
  return'';
}

export default async request=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  const url=new URL(request.url);
  if(request.method==='GET'){
    const token=text(url.searchParams.get('token'),120);
    const documentId=text(url.searchParams.get('documentId'),60);
    if(!validToken(token)&&!validDocumentId(documentId))return reply({error:'Invalid aftercare reference'},400);
    let record,shareToken=token;
    if(validDocumentId(documentId)){
      const auth=await requireUser(request);if(!auth.ok)return reply({error:auth.error},auth.status);
      const index=await aftercareStore().get(documentKey(documentId),{type:'json',consistency:'strong'});
      if(!index||!canAccessClinic(auth.user,index.source?.clinicId))return reply({error:'Aftercare document unavailable'},404);
      shareToken=text(index.token,120);
      record=await aftercareStore().get(tokenKey(shareToken),{type:'json',consistency:'strong'});
      if(record?.documentId!==documentId)return reply({error:'Aftercare document unavailable'},404);
      if(auth.user?.role==='admin'&&record.document?.deliveryMode!=='admin-general')return reply({error:'Clinician-issued instructions must be opened by clinic staff'},403);
    }else record=await aftercareStore().get(tokenKey(token),{type:'json',consistency:'strong'});
    if(!record)return reply({error:'Aftercare link not found'},404);
    if(Date.now()>Number(record.issuedAt||0)+linkLifetimeMs)return reply({error:'Aftercare link expired'},410);
    const secret=String(process.env.AUTH_SESSION_SECRET||'');if(secret.length<32)return reply({error:'Aftercare links are not configured'},503);
    const day=await dayStore().get(dayKeyFor(record.document.source),{type:'json',consistency:'strong'});
    const patient=currentDocument(record,day,secret);
    if(!patient)return reply({error:'Aftercare record no longer matches the patient or payment order'},410);
    if(!activeDocument(patient,record))return reply({error:'Aftercare document is no longer active'},410);
    const document={...record.document,patient:{name:text(patient.name,120),file:text(patient.file,40)},clinic:{name:text(day.clinic?.name,120),doctorName:text(record.document.clinic?.doctorName||record.issuedBy,120),phone:''}};
    if(validDocumentId(documentId)){const shareUrl=new URL('/root-canal-aftercare.html',request.url);shareUrl.searchParams.set('token',shareToken);return reply({ok:true,documentId,url:shareUrl.toString(),document,issuedAt:Number(record.issuedAt||0),issuedBy:text(record.issuedBy,120)})}
    return reply({ok:true,document,issuedAt:Number(record.issuedAt||0),issuedBy:text(record.issuedBy,120)});
  }
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  if(!sameOriginRequest(request))return reply({error:'Invalid request origin'},403);
  const auth=await requireUser(request);if(!auth.ok)return reply({error:auth.error},auth.status);
  const body=await request.json().catch(()=>null),document=cleanDocument(body?.document),error=validateDocument(document,auth.user?.role);
  if(error)return reply({error},400);
  if(!canAccessClinic(auth.user,document.source.clinicId))return reply({error:'Clinic access required'},403);
  const day=await dayStore().get(dayKeyFor(document.source),{type:'json',consistency:'strong'});
  const patient=(day?.patients||[]).find(item=>String(item.id)===document.source.patientId);
  if(!matchesCurrentOrder(patient,document.source))return reply({error:'A matching root-canal payment order is required'},409);
  document.patient={name:text(patient.name,120),file:text(patient.file,40)};
  document.clinic={name:text(day.clinic?.name,120),doctorName:text(day.clinic?.doctorName||auth.user?.displayName,120),phone:text(day.clinic?.phone,30)};
  const secret=String(process.env.AUTH_SESSION_SECRET||'');
  if(secret.length<32)return reply({error:'Aftercare links are not configured'},503);
  const issuedAt=Date.now(),issuedBy=text(auth.user?.displayName||auth.user?.username,120);
  const documentId=randomBytes(24).toString('base64url');
  const token=createHmac('sha256',secret).update(`${JSON.stringify(document)}|${issuedAt}|${randomBytes(24).toString('hex')}`).digest('base64url');
  const minimumDocument={...document,patient:{},clinic:{doctorName:document.clinic.doctorName}};
  await aftercareStore().setJSON(tokenKey(token),{document:minimumDocument,identityFingerprint:identityFingerprint(patient,document.source,secret),documentId,issuedAt,issuedBy});
  await aftercareStore().setJSON(documentKey(documentId),{token,source:document.source,issuedAt});
  const shareUrl=new URL('/root-canal-aftercare.html',request.url);shareUrl.searchParams.set('token',token);
  return reply({ok:true,documentId,url:shareUrl.toString(),issuedAt,expiresAt:issuedAt+linkLifetimeMs,issuedBy});
};

export const __test={cleanMedication,cleanDocument,validateDocument,validToken,validDocumentId,identityFingerprint,sameFingerprint,matchesCurrentOrder,currentDocument,activeDocument,medicationTypes};
