// Local-only synthetic fixture. Never proxies Netlify or stores patient data.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const today=new Date(Date.now()+3*3600000).toISOString().slice(0,10);
const past=days=>new Date(Date.now()+3*3600000-days*86400000).toISOString().slice(0,10);
const patient={id:'summary-demo',name:'مريض تجريبي للمعاينة فقط',file:'TEST-120',phone:'',nationalId:'',start:'16:00',end:'16:30',status:'waiting',procedure:'مراجعة علاج',addedAt:0};
const previous={...patient,id:'summary-previous',date:past(7),clinicId:'clinic-1',status:'done',paymentRequired:true,paymentCompletedAt:Date.now()-7*86400000,paymentItems:[{name:'حشوة تجميلية',code:'cosmetic-filling',quantity:3},{name:'تنظيف الأسنان',code:'cleaning',quantity:1}]};
const plan={canonical:'demo-plan',planNo:'DEMO-PLAN-1',status:'approved_signed',clinicId:'clinic-1',sourcePatientId:previous.id,sourceDate:previous.date,fullName:patient.name,fileNo:patient.file};
const lab={id:'demo-lab',patient,clinicId:'clinic-1',labName:'معمل تجريبي',status:'sent',sentAt:Date.now()-2*86400000,items:[{name:'تاج',quantity:1}]};
const profile={found:true,patient,appointments:[previous,{...patient,date:today,clinicId:'clinic-1'}],plans:[plan],planDetails:[{canonical:plan.canonical,detailsAvailable:true,items:[{name:'تركيب تاج',quantity:1},{name:'حشوة تجميلية',quantity:2}]}],labs:[lab],prescriptions:[{prescriptionNo:'DEMO-RX',updatedAt:Date.now(),medicineCount:1}],summary:{appointments:2,plans:1,prescriptions:1,labs:1,openPayments:0},communications:{planWhatsappCount:2,reviewWhatsappCount:1,events:[]},directory:{adminNotes:'بيانات اختبار مصطنعة — لا تخص مريضًا حقيقيًا.'}};
const routes=new Map();
const counts=new Map();
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.webmanifest':'application/manifest+json','.ttf':'font/ttf'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');const path=url.pathname;
  res.setHeader('cache-control','no-store');
  const json=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
  if(path==='/__fixture/stats')return json(Object.fromEntries(counts));
  if(path==='/__fixture/fail-summary'){routes.set('fail',url.searchParams.get('enabled')==='1');return json({ok:true});}
  if(path==='/api/patient-profile'&&req.method==='GET'){
    const key=url.searchParams.get('summary')==='1'?'summaryReads':'profileReads';counts.set(key,(counts.get(key)||0)+1);
    if(routes.get('fail'))return json({error:'Synthetic offline scenario'},503);
    return setTimeout(()=>json(profile),180);
  }
  if(path.startsWith('/api/')){
    if(['POST','PUT','PATCH','DELETE'].includes(req.method)&&path!=='/api/presence'){counts.set(`blocked:${req.method}:${path}`,(counts.get(`blocked:${req.method}:${path}`)||0)+1);return json({error:'Read-only test fixture'},405);}
    if(path==='/api/auth')return json({enabled:true,authenticated:true,user:{role:'admin',username:'summary-fixture',displayName:'حساب اختبار محلي',clinicId:'clinic-1'}});
    if(path==='/api/state')return json({exists:true,date:today,clinic:{id:'clinic-1',name:'عيادة اختبار'},patients:[patient,{...patient,id:'summary-missing',name:'مريض تجريبي ناقص البيانات',file:'0',start:'17:00',end:'17:30'}],notes:'',revision:1,updatedAt:1});
    if(path==='/api/patients')return json({records:{demo:{fullName:patient.name,fileNo:patient.file,mobile:'',clinicIds:['clinic-1']}},revision:1,updatedAt:1});
    if(path==='/api/treatment-plan-registry')return json({records:{demo:plan},aliases:{},revision:1});
    if(path==='/api/lab-cases')return json({cases:[lab],revision:1});
    if(path==='/api/presence')return json({count:1,devices:[]});
    if(path==='/api/clinics')return json({clinics:[{id:'clinic-1',name:'عيادة اختبار',active:true}],revision:1});
    return json({ok:true,items:[],requests:[],records:{},patients:[],clinics:[],cases:[],revision:1,updatedAt:1});
  }
  try{
    const file=resolve(root,`.${decodeURIComponent(path==='/'?'/index.html':path)}`);
    if(!file.startsWith(root+sep)&&!file.startsWith(root))return json({},403);
    if(!mime[extname(file)]||file.includes(`${sep}netlify${sep}`)||file.includes(`${sep}node_modules${sep}`))return json({},404);
    const content=await readFile(file);res.writeHead(200,{'content-type':mime[extname(file)]});res.end(content);
  }catch{json({},404);}
});
server.listen(8779,'127.0.0.1',()=>console.log('Synthetic patient-summary test: http://127.0.0.1:8779/?view=admin&clinic=clinic-1'));
