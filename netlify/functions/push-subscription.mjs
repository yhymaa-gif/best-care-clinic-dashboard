import { publicVapidKey,savePushSubscription,deletePushSubscription } from './lib/push.mjs';
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
  if(request.method==='POST'){
    const requestedClinic=auth.user.role==='admin'?String(body.clinicId||'clinic-1'):String(auth.user.clinicId||'');
    if(!canAccessClinic(auth.user,requestedClinic))return reply({error:'Clinic access denied'},403);
    try{await savePushSubscription(body.subscription,{user:auth.user,clientId:body.clientId,clinicId:requestedClinic,showPatientDetails:body.showPatientDetails});return reply({ok:true})}
    catch{return reply({error:'Invalid subscription'},400)}
  }
  if(request.method==='DELETE'){
    const deleted=await deletePushSubscription(String(body.endpoint||''),auth.user);
    return deleted?reply({ok:true}):reply({error:'Subscription access denied'},403);
  }
  return reply({error:'Method not allowed'},405);
};
