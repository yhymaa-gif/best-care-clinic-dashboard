import { publicVapidKey,savePushSubscription,deletePushSubscription } from './lib/push.mjs';

const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,DELETE,OPTIONS','access-control-allow-headers':'content-type'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});

export default async request=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method==='GET'){
    const publicKey=publicVapidKey();
    return publicKey?reply({publicKey}):reply({error:'Push notifications are not configured'},503);
  }
  let body;try{body=await request.json()}catch{return reply({error:'Invalid JSON'},400)}
  if(request.method==='POST'){
    try{await savePushSubscription(body.subscription,{role:body.role,clientId:body.clientId});return reply({ok:true})}
    catch{return reply({error:'Invalid subscription'},400)}
  }
  if(request.method==='DELETE'){
    await deletePushSubscription(String(body.endpoint||''));return reply({ok:true});
  }
  return reply({error:'Method not allowed'},405);
};
