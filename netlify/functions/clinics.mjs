import { getStore } from '@netlify/blobs';

const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-methods':'GET,PUT,OPTIONS','access-control-allow-headers':'content-type'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const defaults=()=>Array.from({length:15},(_,index)=>({id:`clinic-${index+1}`,name:`العيادة ${index+1}`,doctorName:'',roomNumber:String(index+1),active:true}));
const clean=clinic=>({id:/^clinic-([1-9]|1[0-5])$/.test(String(clinic?.id||''))?String(clinic.id):'',name:String(clinic?.name||'').slice(0,80),doctorName:String(clinic?.doctorName||'').slice(0,80),roomNumber:String(clinic?.roomNumber||'').slice(0,20),active:Boolean(clinic?.active)});

export default async request=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  const store=getStore({name:'clinic-dashboard-config',consistency:'strong'}),key='clinics';
  if(request.method==='GET'){
    const saved=await store.get(key,{type:'json',consistency:'strong'});
    return reply({clinics:Array.isArray(saved?.clinics)&&saved.clinics.length?saved.clinics:defaults(),updatedAt:Number(saved?.updatedAt||0)});
  }
  if(request.method==='PUT'){
    let body;try{body=await request.json()}catch{return reply({error:'Invalid JSON'},400)}
    if(!Array.isArray(body.clinics))return reply({error:'Invalid clinics'},400);
    const incoming=new Map(body.clinics.map(item=>{const value=clean(item);return[value.id,value]}).filter(([id])=>id));
    const clinics=defaults().map(item=>incoming.has(item.id)?{...item,...incoming.get(item.id)}:item);
    const state={clinics,updatedAt:Date.now()};await store.setJSON(key,state);return reply({ok:true,...state});
  }
  return reply({error:'Method not allowed'},405);
};
