import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';
import webpush from 'web-push';

const store=()=>getStore({name:'clinic-dashboard-push-subscriptions',consistency:'strong'});
const keyFor=endpoint=>`subscriptions/${crypto.createHash('sha256').update(endpoint).digest('hex')}`;
const configured=()=>Boolean(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY);
const safeRole=role=>role==='admin'?'admin':'clinic';

export const publicVapidKey=()=>process.env.VAPID_PUBLIC_KEY||'';

export async function savePushSubscription(subscription,{role='clinic',clientId=''}={}){
  if(!subscription?.endpoint||!subscription?.keys?.p256dh||!subscription?.keys?.auth)throw new Error('Invalid push subscription');
  await store().setJSON(keyFor(subscription.endpoint),{
    subscription,
    role:safeRole(role),
    clientId:String(clientId||'').slice(0,100),
    updatedAt:Date.now()
  });
}

export async function deletePushSubscription(endpoint){
  if(endpoint)await store().delete(keyFor(endpoint));
}

export async function sendPushNotifications(event,{excludeClientId=''}={}){
  if(!configured()||!event?.title)return {sent:0,skipped:true};
  webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:notifications@bestcare.sa',process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
  const pushStore=store();
  const listed=await pushStore.list({prefix:'subscriptions/'});
  const entries=Array.isArray(listed?.blobs)?listed.blobs:[];
  let sent=0;
  await Promise.allSettled(entries.map(async entry=>{
    const record=await pushStore.get(entry.key,{type:'json',consistency:'strong'});
    if(!record?.subscription?.endpoint)return;
    if(excludeClientId&&record.clientId===excludeClientId)return;
    if(event.type==='payment'&&record.role!=='admin')return;
    const payload={title:event.title,body:event.body,type:event.type||'patient',tag:event.tag||`bestcare-${event.type||'update'}`,url:event.type==='payment'?'/?view=admin':'/?view='+record.role};
    try{
      await webpush.sendNotification(record.subscription,JSON.stringify(payload),{TTL:300,urgency:'high'});
      sent+=1;
    }catch(error){
      if(error?.statusCode===404||error?.statusCode===410)await pushStore.delete(entry.key);
      else console.warn('Push delivery failed',error?.statusCode||error?.message);
    }
  }));
  return {sent};
}
