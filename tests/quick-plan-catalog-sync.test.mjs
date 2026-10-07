import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {refreshDraftCatalogItems,parseQuickEntry,reconcileQuickPlanItems} from '../quick-plan-core.js';
const original={id:'rct',name:'عصب',nameEn:'Root canal',aliases:['RCT'],category:'initial'};
function draft(){return reconcileQuickPlanItems([],parseQuickEntry('RCT 11',[original],'fdi')).items}
test('catalog rename/category sync preserves identity, tooth and original input in unsaved drafts',()=>{
 const items=draft(),snapshot=structuredClone(items),catalog=[{...original,name:'علاج عصب',nameEn:'Root canal treatment',category:'prosthetic',aliases:['ENDO']}];
 const result=refreshDraftCatalogItems(items,catalog);
 assert.equal(result[0].officialName,'علاج عصب');assert.equal(result[0].officialNameEn,'Root canal treatment');assert.equal(result[0].category,'prosthetic');
 assert.equal(result[0].procedureId,'rct');assert.equal(result[0].toothNumber,'11');assert.equal(result[0].originalInput,'RCT 11');assert.deepEqual(items,snapshot);
 assert.equal(reconcileQuickPlanItems(result,parseQuickEntry('RCT 11',catalog,'fdi')).items[0].procedureId,'rct');
});
test('disabled/deleted procedures remain visible as unresolved instead of silently changing IDs',()=>{
 for(const catalog of [[],[{...original,status:'inactive'}],[{...original,active:false}]]){
 const result=refreshDraftCatalogItems(draft(),catalog);assert.equal(result[0].matchState,'unmatched');assert.equal(result[0].procedureId,'rct');assert.equal(result[0].originalInput,'RCT 11');
 }
});
test('new aliases and procedures are parsed from the refreshed master only',()=>{
 const catalog=[original,{id:'new-procedure',name:'إجراء جديد',nameEn:'New procedure',aliases:['NEW'],category:'implant'}];
 assert.equal(parseQuickEntry('NEW 12',catalog,'fdi')[0].procedureId,'new-procedure');
 const edited={...draft()[0],toothNumber:'21',matchState:'manual',userEdited:true,manualId:'copy-1'};
 const result=refreshDraftCatalogItems([edited],catalog)[0];assert.equal(result.toothNumber,'21');assert.equal(result.matchState,'manual');assert.equal(result.manualId,'copy-1');
});
test('live sync skips unchanged renders and validates catalog before submitting',async()=>{
 const script=await readFile(new URL('../quick-plan.js',import.meta.url),'utf8');
 assert.match(script,/fingerprint===catalogFingerprint&&context===catalogContext/);
 assert.match(script,/setInterval\(\(\)=>refreshCatalogIfVisible\(\),30000\)/);
 assert.match(script,/document.hidden\|\|navigator.onLine===false/);
 assert.match(script,/if\(!previewMode\)await loadCatalog\(\);clearTimeout\(parseTimer\);parse\(\);await submit\(event\)/);
 assert.match(script,/catalog.some\(procedure=>procedure.id===item.procedureId\)/);
 const dashboard=await readFile(new URL('../dashboard.js',import.meta.url),'utf8');
 assert.match(dashboard,/setTreatmentCatalog\(data.items\|\|items\);notifyQuickPlanCatalogChanged\(\)/);
});

async function runtimeHarness(){
 const script=await readFile(new URL('../quick-plan.js',import.meta.url),'utf8');
 const block=(start,end)=>script.slice(script.indexOf(start),script.indexOf(end,script.indexOf(start)));
 const source=[block('async function loadCatalog(){','async function loadClinics(){'),block('async function toggleProcedureFavorite(','function clinicLabel('),block('async function submitWithCatalogRefresh(','async function submit(event)')].join('\n');
 return new Function('refreshDraftCatalogItems',`
 let catalog=[],catalogProfile={favorites:[],usage:{}},items=[],catalogGeneration=0,catalogFingerprint='',catalogContext='',catalogLastChecked=0,catalogSelectionContext='',catalogSelectionGeneration=0,favoriteRevision=0,favoriteUpdateQueue=Promise.resolve(),parseTimer=0,submitting=false;
 const previewMode=false,$=id=>({value:id==='clinicId'?'clinic-1':'Doctor'});
 let server={items:[{id:'rct',name:'RCT',nameEn:'Root canal'}],profile:{favorites:[],usage:{}}},patches=0,parsed=0,submittedParsed=-1,paletteRenders=0;
 const renderProcedurePalette=()=>paletteRenders++,renderShortcuts=()=>{},renderToothPicker=()=>{},clearTimeout=()=>{},parse=()=>parsed++,updateReady=()=>{},setError=message=>{throw Error(message)};
 const request=async(url,options={})=>{if(options.method==='PATCH'){patches++;const body=JSON.parse(options.body);server.profile={favorites:body.favorite?[body.procedureId]:[],usage:{}}}return{ok:true,json:async()=>structuredClone(server)}};
 const submit=async()=>{submittedParsed=parsed};
 ${source}
 return{load:loadCatalog,toggle:toggleProcedureFavorite,submit:()=>submitWithCatalogRefresh({preventDefault(){}}),profile:value=>{server.profile=value},flush:()=>favoriteUpdateQueue,state:()=>({patches,parsed,submittedParsed,paletteRenders,profile:catalogProfile}),gate:()=>{let release;favoriteUpdateQueue=new Promise(resolve=>release=resolve);return release}};
 `)(refreshDraftCatalogItems);
}
test('actual submit wrapper flushes pending parse even when catalog is unchanged',async()=>{
 const h=await runtimeHarness();await h.load();const before=h.state().parsed;await h.submit();assert.equal(h.state().submittedParsed,before+1);
});
test('actual refresh preserves queued favorite PATCHes for the same clinic and doctor',async()=>{
 const h=await runtimeHarness();await h.load();const release=h.gate();h.toggle('rct');const refresh=h.load();release();await refresh;await h.flush();assert.equal(h.state().patches,1);assert.deepEqual(h.state().profile.favorites,['rct']);
});
test('actual refresh applies profile-only server updates without reparsing the draft',async()=>{
 const h=await runtimeHarness();await h.load();const before=h.state();h.profile({favorites:['rct'],usage:{rct:15}});await h.load();const after=h.state();assert.deepEqual(after.profile,{favorites:['rct'],usage:{rct:15}});assert.equal(after.parsed,before.parsed);assert.equal(after.paletteRenders,before.paletteRenders+1);
});
