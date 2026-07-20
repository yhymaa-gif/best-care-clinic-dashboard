import { getStore } from "@netlify/blobs";
const headers={"content-type":"application/json; charset=utf-8","cache-control":"no-store, no-cache, must-revalidate","access-control-allow-origin":"*","access-control-allow-methods":"GET,PUT,POST,OPTIONS","access-control-allow-headers":"content-type,accept"};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||"");
const cleanAlert=v=>({active:Boolean(v?.active),message:String(v?.message||"").slice(0,200),updatedAt:Number(v?.updatedAt||0),kind:String(v?.kind||"").slice(0,30)});
const allowedStatuses=new Set(['waiting','arrived','early_arrival','active','done','late','cancel','left','asks_delay']);
const cleanPaymentItems=items=>(Array.isArray(items)?items:[]).slice(0,10).map(item=>({code:String(item?.code||'other').slice(0,40),name:String(item?.name||'').slice(0,100),quantity:Math.max(1,Math.min(99,Number(item?.quantity||1))),free:Boolean(item?.free)})).filter(item=>item.name);
const cleanPatient=p=>({
 id:String(p?.id||'').slice(0,80),
 name:String(p?.name||'').slice(0,80),
 file:String(p?.file||'').slice(0,40),
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
 paymentCompletedAt:Number(p?.paymentCompletedAt||0)
});
export default async request=>{
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 const url=new URL(request.url),date=url.searchParams.get('date');
 if(!validDate(date))return reply({error:'Invalid date'},400);
 const store=getStore({name:'clinic-dashboard-days',consistency:'strong'}),key=`days/${date}`;
 if(request.method==='GET'){const state=await store.get(key,{type:'json',consistency:'strong'});return state?reply({exists:true,...state,updateAlert:cleanAlert(state.updateAlert)}):reply({exists:false,date,patients:[],notes:'',updateAlert:cleanAlert(null),revision:0,updatedAt:0})}
 if(request.method==='PUT'||request.method==='POST'){let body;try{body=await request.json()}catch{return reply({error:'Invalid JSON'},400)}if(!Array.isArray(body.patients)||body.patients.length>300)return reply({error:'Invalid patients'},400);const existing=await store.get(key,{type:'json',consistency:'strong'});const state={date,patients:body.patients.map(cleanPatient),notes:String(body.notes||'').slice(0,5000),updateAlert:cleanAlert(body.updateAlert),clientId:String(body.clientId||'').slice(0,100),revision:Number(existing?.revision||0)+1,updatedAt:Date.now()};await store.setJSON(key,state);return reply({ok:true,revision:state.revision,updatedAt:state.updatedAt})}
 return reply({error:'Method not allowed'},405);
};
