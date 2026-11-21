import { publicVapidKey,savePushSubscription,deletePushSubscription,pushSubscriptionStatus,sendTestNotification } from './lib/push.mjs';
import { apiHeaders, canAccessClinic, requireUser, sameOriginRequest } from './lib/session.mjs';

const headers=apiHeaders('GET,POST,DELETE,OPTIONS');
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});

export default async request=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method==='GET'){
    const publicKey=publicVapidKey();
    return publicKey?reply({publicKey}):reply({error:'Push notifications are not configured'},503);
  }
  if(!sameOriginRequest(request))return reply({error:'Invalid request origin'},403);
  let body;try{body=await request.json()}catch{return reply({error:'Invalid JSON'},400)}
  const auth=await requireUser(request);
  if(!auth.ok)return reply({error:auth.error},auth.status);
  const action=new URL(request.url).searchParams.get('action')||'';
  if(request.method==='POST'&&action==='status')return reply(await pushSubscriptionStatus(String(body.endpoint||''),auth.user));
  if(request.method==='POST'&&action==='test'){
    const result=await sendTestNotification(String(body.endpoint||''),auth.user);
    return reply(result,result.ok?200:result.reason==='not_configured'?503:result.reason==='not_registered'?404:502);
  }
  if(request.method==='POST'){
    const requestedClinic=auth.user.role==='admin'?String(body.clinicId||'clinic-1'):String(auth.user.clinicId||'');
    if(!canAccessClinic(auth.user,requestedClinic))return reply({error:'Clinic access denied'},403);
    try{await savePushSubscription(body.subscription,{user:auth.user,clientId:body.clientId,clinicId:requestedClinic,showPatientDetails:body.showPatientDetails,allowOutsideWorkHours:body.allowOutsideWorkHours,oldEndpoint:String(body.oldEndpoint||''),inherit:body.source==='service-worker'});return reply({ok:true})}
    catch{return reply({error:'Invalid subscription'},400)}
  }
  if(request.method==='DELETE'){
    const deleted=await deletePushSubscription(String(body.endpoint||''),auth.user);
    return deleted?reply({ok:true}):reply({error:'Subscription access denied'},403);
  }
  return reply({error:'Method not allowed'},405);
};
