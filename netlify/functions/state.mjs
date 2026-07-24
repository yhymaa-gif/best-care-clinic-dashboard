import { getStore } from "@netlify/blobs";
import { sendPushNotifications } from './lib/push.mjs';
import { createHash, createHmac } from 'node:crypto';
const headers={"content-type":"application/json; charset=utf-8","cache-control":"no-store, no-cache, must-revalidate","access-control-allow-origin":"*","access-control-allow-methods":"GET,PUT,POST,OPTIONS","access-control-allow-headers":"content-type,accept"};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const authSession=async request=>{
 if(process.env.AUTH_ENABLED!=='true')return true;
 const raw=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('bc_session='))?.slice(11);
 if(!raw)return false;
 const key=`sessions/${createHash('sha256').update(raw).digest('hex')}`;
 const sessionStore=getStore({name:'clinic-dashboard-auth-sessions',consistency:'strong'});
 const session=await sessionStore.get(key,{type:'json',consistency:'strong'}); const now=Date.now();
 const signature=createHmac('sha256',process.env.AUTH_SESSION_SECRET||'change-me-before-production').update(raw).digest('hex');
 if(!session||session.tokenSignature!==signature||now-Number(session.lastSeenAt||0)>3*60*60*1000||now>Number(session.expiresAt||0)){if(session)await sessionStore.delete(key);return false}
 session.lastSeenAt=now;await sessionStore.setJSON(key,session);return true;
};
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
 treatmentPlanStatus:['draft','submitted','approved','rejected'].includes(p?.treatmentPlanStatus)?p.treatmentPlanStatus:'',
 treatmentPlanUpdatedAt:Number(p?.treatmentPlanUpdatedAt||0)
});
const pushEvents=(before=[],after=[],previousAlert={},nextAlert={},clinic={})=>{
 const oldMap=new Map(before.map(patient=>[String(patient.id),patient])),events=[];
 const decorate=(event,patient)=>({...event,patientName:String(patient?.name||'').slice(0,80),patientFile:String(patient?.file||'').slice(0,40),clinicId:clinic.id,clinicLabel:`${clinic.name||'العيادة'} · رقم ${clinic.roomNumber||''}${clinic.doctorName?` · د. ${clinic.doctorName}`:''}`});
 for(const patient of after){
  const old=oldMap.get(String(patient.id));
  if(!old){events.push(decorate({type:'patient',title:'تحديث جديد على المرضى',body:'تمت إضافة مريض إلى قائمة اليوم.',tag:`patient-${patient.id}`},patient));continue}
  if(Number(patient.paymentRequestedAt||0)>Number(old.paymentRequestedAt||0))events.push(decorate({type:'payment',title:'أمر دفع جديد',body:'يوجد أمر دفع جديد بانتظار الإدارة.',tag:`payment-request-${patient.id}`},patient));
  else if(Number(patient.paymentAcknowledgedAt||0)>Number(old.paymentAcknowledgedAt||0))events.push(decorate({type:'payment',title:'تم استلام أمر الدفع',body:'أكدت الإدارة استلام طلب الدفع.',tag:`payment-ack-${patient.id}`},patient));
  else if(Number(patient.paymentCompletedAt||0)>Number(old.paymentCompletedAt||0))events.push(decorate({type:'payment',title:'تم تنفيذ الدفع',body:'اكتمل تنفيذ أحد أوامر الدفع.',tag:`payment-done-${patient.id}`},patient));
  else if(String(patient.treatmentPlanStatus||'')!==String(old.treatmentPlanStatus||'')){
   const approved=patient.treatmentPlanStatus==='approved',rejected=patient.treatmentPlanStatus==='rejected';
   events.push(decorate({type:'patient',title:approved?'تم اعتماد الخطة العلاجية':rejected?'لم تُعتمد الخطة العلاجية':'خطة علاجية بانتظار الإدارة',body:approved?'اعتمدت الإدارة الإجراءات والأسعار النهائية.':rejected?'أعادت الإدارة الخطة إلى العيادة للتعديل.':'أرسلت العيادة خطة علاجية للمراجعة والتسعير.',tag:`treatment-plan-${patient.id}`},patient));
  }
  else if(String(patient.status||'')!==String(old.status||''))events.push(decorate({type:'patient',title:'تحديث حالة مريض',body:'تم تحديث حالة أحد مرضى اليوم.',tag:`patient-${patient.id}`},patient));
 }
 if(!events.length&&nextAlert?.active&&Number(nextAlert.updatedAt||0)>Number(previousAlert?.updatedAt||0))events.push(decorate({type:String(nextAlert.kind||'').startsWith('payment')?'payment':'patient',title:'تنبيه جديد من أفضل عناية',body:'يوجد تحديث جديد داخل لوحة المتابعة.',tag:`alert-${nextAlert.kind||'update'}`},after.find(patient=>String(nextAlert.message||'').includes(String(patient.name||'')))||{}));
 return events.slice(0,4);
};
export default async request=>{
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(!(await authSession(request)))return reply({error:'Authentication required'},401);
 const url=new URL(request.url),date=url.searchParams.get('date'),clinicId=url.searchParams.get('clinic')||'clinic-1';
 if(!validDate(date))return reply({error:'Invalid date'},400);
 if(!validClinic(clinicId))return reply({error:'Invalid clinic'},400);
 const store=getStore({name:'clinic-dashboard-days',consistency:'strong'}),key=clinicId==='clinic-1'?`days/${date}`:`clinics/${clinicId}/days/${date}`;
 if(request.method==='GET'){const state=await store.get(key,{type:'json',consistency:'strong'});return state?reply({exists:true,...state,updateAlert:cleanAlert(state.updateAlert)}):reply({exists:false,date,patients:[],notes:'',updateAlert:cleanAlert(null),revision:0,updatedAt:0})}
 if(request.method==='PUT'||request.method==='POST'){let body;try{body=await request.json()}catch{return reply({error:'Invalid JSON'},400)}if(!Array.isArray(body.patients)||body.patients.length>300)return reply({error:'Invalid patients'},400);const clinic={id:clinicId,name:String(body.clinic?.name||'').slice(0,80),doctorName:String(body.clinic?.doctorName||'').slice(0,80),roomNumber:String(body.clinic?.roomNumber||'').slice(0,20)};const existing=await store.get(key,{type:'json',consistency:'strong'});const state={date,clinic,patients:body.patients.map(cleanPatient),notes:String(body.notes||'').slice(0,5000),updateAlert:cleanAlert(body.updateAlert),clientId:String(body.clientId||'').slice(0,100),revision:Number(existing?.revision||0)+1,updatedAt:Date.now()};await store.setJSON(key,state);const events=pushEvents(existing?.patients||[],state.patients,existing?.updateAlert||{},state.updateAlert,clinic);await Promise.allSettled(events.map(event=>sendPushNotifications(event,{excludeClientId:state.clientId})));return reply({ok:true,revision:state.revision,updatedAt:state.updatedAt,pushEvents:events.length})}
 return reply({error:'Method not allowed'},405);
};
