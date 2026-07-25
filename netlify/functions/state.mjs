import { getStore } from "@netlify/blobs";
import { sendPushNotifications } from './lib/push.mjs';
import { apiHeaders, canAccessClinic, requireUser, sameOriginRequest } from './lib/session.mjs';
const headers=apiHeaders('GET,PUT,POST,OPTIONS');
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||"");
const validClinic=v=>/^clinic-([1-9]|1[0-5])$/.test(v||'');
const cleanAlert=v=>({active:Boolean(v?.active),message:String(v?.message||"").slice(0,200),updatedAt:Number(v?.updatedAt||0),kind:String(v?.kind||"").slice(0,30)});
const allowedStatuses=new Set(['waiting','arrived','early_arrival','active','done','late','cancel','left','asks_delay']);
const cleanPaymentItems=items=>(Array.isArray(items)?items:[]).slice(0,10).map(item=>({code:String(item?.code||'other').slice(0,40),name:String(item?.name||'').slice(0,100),quantity:Math.max(1,Math.min(99,Number(item?.quantity||1))),free:Boolean(item?.free)})).filter(item=>item.name);
const cleanPatient=p=>({
 id:String(p?.id||'').slice(0,80),
 name:String(p?.name||'').slice(0,80),
 file:String(p?.file||'').slice(0,40),
 phone:String(p?.phone||'').replace(/[^\d+]/g,'').slice(0,20),
 start:String(p?.start||'').slice(0,8),
 end:String(p?.end||'').slice(0,8),
 procedure:String(p?.procedure||'').slice(0,180),
 status:allowedStatuses.has(p?.status)?p.status:'waiting',
 arrivedAt:Number(p?.arrivedAt||0),
 actualStartedAt:Number(p?.actualStartedAt||0),
 completedAt:Number(p?.completedAt||0),
 lastCalledAt:Number(p?.lastCalledAt||0),
 callCount:Math.max(0,Math.min(99,Number(p?.callCount||0))),
 paymentRequired:Boolean(p?.paymentRequired),
 paymentAction:String(p?.paymentAction||'').slice(0,120),
 paymentItems:cleanPaymentItems(p?.paymentItems),
 paymentDiscount:String(p?.paymentDiscount||'').slice(0,120),
 paymentRequestedAt:Number(p?.paymentRequestedAt||0),
 paymentAcknowledgedAt:Number(p?.paymentAcknowledgedAt||0),
 paymentCompletedAt:Number(p?.paymentCompletedAt||0),
 treatmentPlanStatus:['draft','submitted','patient_accepted','approved','approved_signed','rejected'].includes(p?.treatmentPlanStatus)?p.treatmentPlanStatus:'',
 treatmentPlanUpdatedAt:Number(p?.treatmentPlanUpdatedAt||0),
 adminUpdatedAt:Number(p?.adminUpdatedAt||0)
});
const pushEvents=(before=[],after=[],previousAlert={},nextAlert={},clinic={})=>{
 const oldMap=new Map(before.map(patient=>[String(patient.id),patient])),events=[];
 const doctorName=String(clinic.doctorName||'').trim(),doctorLabel=/^(?:د\.?|الدكتور)\s*/.test(doctorName)?doctorName:`د. ${doctorName}`;
 const decorate=(event,patient)=>({...event,patientName:String(patient?.name||'').slice(0,80),patientFile:String(patient?.file||'').slice(0,40),clinicId:clinic.id,clinicLabel:`${clinic.name||'العيادة'} · رقم ${clinic.roomNumber||''}${doctorName?` · ${doctorLabel}`:''}`});
 for(const patient of after){
  const old=oldMap.get(String(patient.id));
  if(!old){events.push(decorate({type:'patient',title:'تحديث جديد على المرضى',body:'تمت إضافة مريض إلى قائمة اليوم.',tag:`patient-${patient.id}`},patient));continue}
  if(Number(patient.paymentRequestedAt||0)>Number(old.paymentRequestedAt||0))events.push(decorate({type:'payment',title:'أمر دفع جديد',body:'يوجد أمر دفع جديد بانتظار الإدارة.',tag:`payment-request-${patient.id}`},patient));
  else if(Number(patient.paymentAcknowledgedAt||0)>Number(old.paymentAcknowledgedAt||0))events.push(decorate({type:'payment',title:'تم استلام أمر الدفع',body:'أكدت الإدارة استلام طلب الدفع.',tag:`payment-ack-${patient.id}`},patient));
  else if(Number(patient.paymentCompletedAt||0)>Number(old.paymentCompletedAt||0))events.push(decorate({type:'payment',title:'تم تنفيذ الدفع',body:'اكتمل تنفيذ أحد أوامر الدفع.',tag:`payment-done-${patient.id}`},patient));
  else if(String(patient.treatmentPlanStatus||'')!==String(old.treatmentPlanStatus||'')){
   const planStatus=patient.treatmentPlanStatus;
   const statusCopy={
    submitted:{title:'خطة علاجية بانتظار الإدارة',body:'اعتمد الطبيب الخطة الأولية وأرسلها للإدارة لإكمال الأسعار وإرسال المسودة للمريض.'},
    patient_accepted:{title:'المريض وافق ووقّع على الخطة',body:'تم توثيق موافقة وتوقيع المريض، والخطة جاهزة للاعتماد النهائي من الإدارة.'},
    approved:{title:'تم اعتماد الخطة العلاجية',body:'اعتمدت الإدارة الإجراءات والأسعار النهائية.'},
    approved_signed:{title:'خطة معتمدة وموقعة',body:'اكتملت موافقة وتوقيع المريض واعتماد الإدارة النهائي للخطة.'},
    rejected:{title:'الخطة العلاجية تحتاج تعديل',body:'أعادت الإدارة الخطة إلى العيادة للمراجعة والتعديل.'}
   }[planStatus]||{title:'تم تحديث الخطة العلاجية',body:'توجد حالة جديدة للخطة العلاجية.'};
   events.push(decorate({type:'patient',title:statusCopy.title,body:statusCopy.body,tag:`treatment-plan-${patient.id}`},patient));
  }
  else if(String(patient.status||'')!==String(old.status||''))events.push(decorate({type:'patient',title:'تحديث حالة مريض',body:'تم تحديث حالة أحد مرضى اليوم.',tag:`patient-${patient.id}`},patient));
 }
 if(!events.length&&nextAlert?.active&&Number(nextAlert.updatedAt||0)>Number(previousAlert?.updatedAt||0))events.push(decorate({type:String(nextAlert.kind||'').startsWith('payment')?'payment':'patient',title:'تنبيه جديد من أفضل عناية',body:'يوجد تحديث جديد داخل لوحة المتابعة.',tag:`alert-${nextAlert.kind||'update'}`},after.find(patient=>String(nextAlert.message||'').includes(String(patient.name||'')))||{}));
 return events.slice(0,4);
};
export default async request=>{
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='GET'&&!sameOriginRequest(request))return reply({error:'Invalid request origin'},403);
 const auth=await requireUser(request);
 if(!auth.ok)return reply({error:auth.error},auth.status);
 const url=new URL(request.url),date=url.searchParams.get('date'),clinicId=url.searchParams.get('clinic')||'clinic-1';
 if(!validDate(date))return reply({error:'Invalid date'},400);
 if(!validClinic(clinicId))return reply({error:'Invalid clinic'},400);
 if(!canAccessClinic(auth.user,clinicId))return reply({error:'Clinic access denied'},403);
 const store=getStore({name:'clinic-dashboard-days',consistency:'strong'}),key=clinicId==='clinic-1'?`days/${date}`:`clinics/${clinicId}/days/${date}`;
 if(request.method==='GET'){const state=await store.get(key,{type:'json',consistency:'strong'});return state?reply({exists:true,...state,updateAlert:cleanAlert(state.updateAlert)}):reply({exists:false,date,patients:[],notes:'',updateAlert:cleanAlert(null),revision:0,updatedAt:0})}
 if(request.method==='PUT'||request.method==='POST'){let body;try{body=await request.json()}catch{return reply({error:'Invalid JSON'},400)}if(!Array.isArray(body.patients)||body.patients.length>300)return reply({error:'Invalid patients'},400);const clinic={id:clinicId,name:String(body.clinic?.name||'').slice(0,80),doctorName:String(body.clinic?.doctorName||'').slice(0,80),roomNumber:String(body.clinic?.roomNumber||'').slice(0,20)};const existing=await store.get(key,{type:'json',consistency:'strong'});const expected=Number(body.expectedRevision);const currentRevision=Number(existing?.revision||0);if(Number.isFinite(expected)&&expected>=0&&expected!==currentRevision)return reply({error:'Revision conflict',revision:currentRevision,updatedAt:Number(existing?.updatedAt||0)},409);const existingPatients=new Map((existing?.patients||[]).map(patient=>[String(patient.id),patient]));const cleanedPatients=body.patients.map(cleanPatient).map(patient=>{if(auth.user?.role==='admin')return patient;const previous=existingPatients.get(String(patient.id));patient.paymentAcknowledgedAt=Number(previous?.paymentAcknowledgedAt||0);patient.paymentCompletedAt=Number(previous?.paymentCompletedAt||0);if(['patient_accepted','approved','approved_signed'].includes(patient.treatmentPlanStatus))patient.treatmentPlanStatus=String(previous?.treatmentPlanStatus||'');return patient});const state={date,clinic,patients:cleanedPatients,notes:String(body.notes||'').slice(0,5000),updateAlert:cleanAlert(body.updateAlert),clientId:String(body.clientId||'').slice(0,100),revision:currentRevision+1,updatedAt:Date.now(),updatedBy:String(auth.user?.displayName||auth.user?.username||'').slice(0,120)};await store.setJSON(key,state);const events=pushEvents(existing?.patients||[],state.patients,existing?.updateAlert||{},state.updateAlert,clinic);await Promise.allSettled(events.map(event=>sendPushNotifications(event,{excludeClientId:state.clientId})));return reply({ok:true,revision:state.revision,updatedAt:state.updatedAt,pushEvents:events.length})}
 return reply({error:'Method not allowed'},405);
};
