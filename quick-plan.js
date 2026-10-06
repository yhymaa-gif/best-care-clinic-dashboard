import { parseQuickEntry, normalizeToothNumber, reconcileQuickPlanItems } from './quick-plan-core.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const request=async(url,options={})=>fetch(url,{credentials:'include',cache:'no-store',...options});
const normalizeMrn=value=>String(value??'').replace(/[٠-٩]/g,char=>String(char.charCodeAt(0)-1632)).replace(/[۰-۹]/g,char=>String(char.charCodeAt(0)-1776)).replace(/[\s-]/g,'').toUpperCase();
const text={
  en:{title:'QUICK TREATMENT PLAN',subtitle:'Enter the MRN and type the proposed procedures like a WhatsApp message.',draftNotice:'This nurse entry is not a final treatment plan. A dentist must review and approve it.',signinRequired:'Sign-in required',signinHelp:'Open the dashboard and sign in, then return to this link.',openSignin:'OPEN SIGN-IN',mrn:'PATIENT MRN / FILE NUMBER *',find:'FIND',mrnHelp:'MRN is the primary patient identifier.',clinic:'CLINIC *',patientName:'PATIENT INITIALS / NAME (OPTIONAL)',dentist:'TREATING DENTIST (OPTIONAL)',numbering:'TOOTH NUMBERING',numberingHelp:'Numbers are stored exactly in the selected system and are never converted silently.',quickEntry:'QUICK ENTRY *',separatorHelp:'Use new lines, commas, or semicolons.',livePreview:'LIVE PREVIEW',checkMatches:'Check every match',matched:'Matched',confirm:'Confirm',unmatched:'Not matched',previewEmpty:'Your structured plan will appear here while you type.',notReady:'Complete the required fields',submitHelp:'All entries must have a valid tooth and confirmed procedure.',submit:'SUBMIT PLAN',submitted:'Treatment Plan Submitted',status:'Status',another:'ENTER ANOTHER PLAN'},
  ar:{title:'الخطة العلاجية السريعة',subtitle:'أدخل رقم الملف ثم اكتب الإجراءات المقترحة مثل رسالة واتساب.',draftNotice:'إدخال الممرضة ليس خطة نهائية، ويجب أن يراجعه ويعتمده طبيب مخوّل.',signinRequired:'يلزم تسجيل الدخول',signinHelp:'افتح الداشبورد وسجل الدخول ثم ارجع إلى هذا الرابط.',openSignin:'فتح تسجيل الدخول',mrn:'رقم ملف المريض *',find:'بحث',mrnHelp:'رقم الملف هو المعرّف الأساسي للمريض.',clinic:'العيادة *',patientName:'اسم أو أحرف المريض (اختياري)',dentist:'الطبيب المعالج (اختياري)',numbering:'نظام ترقيم الأسنان',numberingHelp:'يُحفظ الرقم وفق النظام المختار دون أي تحويل صامت.',quickEntry:'الإدخال السريع *',separatorHelp:'استخدم سطرًا جديدًا أو فاصلة أو فاصلة منقوطة.',livePreview:'المعاينة المباشرة',checkMatches:'راجع كل تطابق',matched:'مطابق',confirm:'يحتاج تأكيدًا',unmatched:'غير مطابق',previewEmpty:'ستظهر الخطة المنظمة هنا أثناء الكتابة.',notReady:'أكمل الحقول المطلوبة',submitHelp:'يجب تأكيد الإجراء ورقم السن لكل بند.',submit:'إرسال الخطة',submitted:'تم إرسال الخطة العلاجية',status:'الحالة',another:'إدخال خطة أخرى'}
};
let language=localStorage.getItem('bestcare_lang')==='ar'?'ar':'en',catalog=[],items=[],patient=null,patientLookupKey='',lookupGeneration=0,idempotencyKey=crypto.randomUUID(),parseTimer=0,deletedSourceKeys=new Set(),manualOrder=0;
const t=key=>text[language][key]||text.en[key]||key;
const currentPatientKey=()=>`${$('clinicId').value}|${normalizeMrn($('patientMrn').value)}`;
const quickPlanChannel='BroadcastChannel'in window?new BroadcastChannel('bestcare-quick-plans'):null;

function applyLanguage(){
  document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';document.body.dir=document.documentElement.dir;
  document.querySelectorAll('[data-i18n]').forEach(node=>{const key=node.dataset.i18n;if(t(key))node.textContent=t(key)});
  $('languageToggle').textContent=language==='en'?'العربية':'English';
}
function clinicLabel(clinic){return `${clinic.name||clinic.id}${clinic.roomNumber?` · ${language==='ar'?'غرفة':'Room'} ${clinic.roomNumber}`:''}${clinic.doctorName?` · ${clinic.doctorName}`:''}`}
function setError(message=''){ $('formError').hidden=!message;$('formError').textContent=message }
function setLookup(message,state=''){const node=$('patientLookupState');node.textContent=message;node.className=state?`lookup-state-${state}`:''}
function itemReady(item){return Boolean(normalizeToothNumber(item.toothNumber,$('numberingSystem').value)&&item.procedureId&&['exact','manual'].includes(item.matchState))}
function updateReady(){
  const ready=Boolean(patient&&patientLookupKey===currentPatientKey()&&$('patientMrn').value.trim()&&items.length&&items.every(itemReady));
  $('submitPlan').disabled=!ready;$('readyState').textContent=ready?(language==='ar'?'جاهزة للإرسال':'Ready to submit'):t('notReady');
  $('parseSummary').textContent=language==='ar'?`${items.length} إجراء · ${items.filter(itemReady).length} جاهز`:`${items.length} item${items.length===1?'':'s'} · ${items.filter(itemReady).length} ready`;
}
function procedureOptions(item){
  return `<option value="">${language==='ar'?'اختر الإجراء':'SELECT PROCEDURE'}</option>`+catalog.map(option=>`<option value="${esc(option.id)}" ${item.procedureId===option.id?'selected':''}>${esc(language==='en'?(option.nameEn||option.name):option.name)}</option>`).join('');
}
function render(){
  if(!items.length){$('previewList').innerHTML=`<p class="empty-preview">${esc(t('previewEmpty'))}</p>`;updateReady();return}
  $('previewList').innerHTML=items.map((item,index)=>{const state=itemReady(item)?'high':item.matchState==='possible'?'possible':'unmatched',label=state==='high'?t('matched'):state==='possible'?t('confirm'):t('unmatched');return `<article class="procedure-card match-${state}" data-index="${index}"><input class="tooth-input" data-tooth aria-label="Tooth number" value="${esc(item.toothNumber||'')}" placeholder="${$('numberingSystem').value==='fdi'?'11':'09'}"><div class="card-copy"><select class="procedure-select" data-procedure aria-label="Procedure">${procedureOptions(item)}</select><small>${esc(item.originalInput||'')}</small><span class="match-badge">${state==='high'?'✓':state==='possible'?'?':'!'} ${esc(label)}</span></div><div class="card-actions"><button type="button" data-duplicate title="Duplicate">＋ ${language==='ar'?'نسخ':'Duplicate'}</button><button type="button" data-delete title="Delete">× ${language==='ar'?'حذف':'Delete'}</button></div></article>`}).join('');
  updateReady();
}
function parse(){const next=parseQuickEntry($('quickEntry').value,catalog,$('numberingSystem').value),reconciled=reconcileQuickPlanItems(items,next,deletedSourceKeys);items=reconciled.items;deletedSourceKeys=new Set(reconciled.deletedSourceKeys);render()}
function scheduleParse(){clearTimeout(parseTimer);parseTimer=setTimeout(parse,100)}
function invalidatePatient(){lookupGeneration+=1;patient=null;patientLookupKey='';$('patientName').value='';setLookup(t('mrnHelp'));updateReady()}
async function loadCatalog(){
  const clinicId=$('clinicId').value;if(!clinicId)return;
  const response=await request(`/api/treatment-catalog?clinic=${encodeURIComponent(clinicId)}`),data=await response.json();
  if(!response.ok)throw Object.assign(new Error(data.error||'Could not load procedures'),{status:response.status});
  catalog=Array.isArray(data.items)?data.items.filter(item=>item.active!==false&&item.status!=='inactive'):[];
  const common=[...catalog].sort((a,b)=>Number(b.usage||0)-Number(a.usage||0)).slice(0,8);
  $('shortcutRow').innerHTML=common.map(item=>`<button type="button" data-shortcut="${esc((item.aliases||[])[0]||item.code||item.id)}">${esc(language==='en'?(item.nameEn||item.name):item.name)}</button>`).join('');
  scheduleParse();
}
async function loadClinics(){
  const session=await request('/api/auth?action=session'),sessionData=await session.json();
  if(!session.ok){$('authError').hidden=false;$('quickPlanForm').hidden=true;throw Object.assign(new Error(sessionData.error||'Authentication required'),{status:session.status})}
  const response=await request('/api/clinics'),data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load clinics');
  const active=(data.clinics||[]).filter(item=>item.active!==false);$('clinicId').innerHTML=active.map(item=>`<option value="${esc(item.id)}">${esc(clinicLabel(item))}</option>`).join('');
  const requested=new URLSearchParams(location.search).get('clinic');if(active.some(item=>item.id===requested))$('clinicId').value=requested;
  const clinic=active.find(item=>item.id===$('clinicId').value);if(clinic?.doctorName)$('treatingDentist').value=clinic.doctorName;
  await loadCatalog();
}
async function findPatient(){
  const mrn=$('patientMrn').value.trim(),clinicId=$('clinicId').value,key=currentPatientKey(),generation=++lookupGeneration;patient=null;patientLookupKey='';updateReady();if(!mrn){setLookup(language==='ar'?'أدخل رقم الملف أولًا':'Enter the MRN first','error');return}
  setLookup(language==='ar'?'جارٍ البحث…':'Looking up patient…');
  try{const response=await request(`/api/patient-lookup?type=file&value=${encodeURIComponent(mrn)}&clinic=${encodeURIComponent(clinicId)}`),data=await response.json();if(generation!==lookupGeneration||key!==currentPatientKey())return;if(!response.ok)throw new Error(data.error||'Lookup failed');const exact=(data.matches||[]).find(match=>normalizeMrn(match.patient?.file)===normalizeMrn(mrn));if(!exact)throw new Error(language==='ar'?'رقم الملف غير موجود في هذه العيادة':'MRN was not found in this clinic');patient=exact.patient;patientLookupKey=key;$('patientName').value=patient.name||'';setLookup(language==='ar'?`تم العثور على ${patient.name||'المريض'}`:`Patient found${patient.name?`: ${patient.name}`:''}`,'ok');updateReady()}catch(error){if(generation===lookupGeneration)setLookup(error.message,'error')}
}
function resolvedItems(){return items.map(item=>{const procedure=catalog.find(option=>option.id===item.procedureId);return{toothNumber:normalizeToothNumber(item.toothNumber,$('numberingSystem').value),procedureId:item.procedureId,procedureCode:procedure?.code||procedure?.id||item.procedureId,officialName:procedure?.name||'',officialNameEn:procedure?.nameEn||'',originalInput:item.originalInput,matchState:item.matchState}})}
async function submit(event){
  event.preventDefault();setError();if(!patient||!items.length||!items.every(itemReady)){setError(language==='ar'?'أكمل جميع المطابقات قبل الإرسال.':'Resolve every entry before submission.');return}
  $('submitPlan').disabled=true;
  try{if(patientLookupKey!==currentPatientKey())throw new Error(language==='ar'?'أعد التحقق من رقم الملف قبل الإرسال.':'Verify the current MRN before submission.');const body={clinicId:$('clinicId').value,patientMrn:$('patientMrn').value.trim(),patientName:$('patientName').value.trim(),patientId:patient.id||'',treatingDentist:$('treatingDentist').value.trim(),numberingSystem:$('numberingSystem').value,originalInput:$('quickEntry').value.trim(),items:resolvedItems(),idempotencyKey};const response=await request('/api/quick-treatment-plans',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw new Error(data.error||'Could not submit plan');quickPlanChannel?.postMessage({type:'submitted',clinicId:body.clinicId,id:data.plan?.id||'',at:Date.now()});$('quickPlanForm').hidden=true;$('successCard').hidden=false}catch(error){setError(error.message);$('submitPlan').disabled=false}
}

$('languageToggle').addEventListener('click',()=>{language=language==='en'?'ar':'en';localStorage.setItem('bestcare_lang',language);applyLanguage();render()});
$('clinicId').addEventListener('change',async()=>{invalidatePatient();const selected=$('clinicId').selectedOptions[0]?.textContent||'';if(selected)$('treatingDentist').value='';try{await loadCatalog()}catch(error){setError(error.message)}updateReady()});
$('numberingSystem').addEventListener('change',parse);$('quickEntry').addEventListener('input',scheduleParse);$('lookupPatient').addEventListener('click',findPatient);$('patientMrn').addEventListener('change',findPatient);$('quickPlanForm').addEventListener('submit',submit);
$('patientMrn').addEventListener('input',()=>{if(patientLookupKey&&patientLookupKey!==currentPatientKey())invalidatePatient()});
$('shortcutRow').addEventListener('click',event=>{const button=event.target.closest('[data-shortcut]');if(!button)return;const value=button.dataset.shortcut||'',textarea=$('quickEntry');textarea.value=`${textarea.value.trim()}${textarea.value.trim()?'\n':''}${value} `;textarea.focus();scheduleParse()});
$('previewList').addEventListener('input',event=>{if(!event.target.matches('[data-tooth]'))return;const card=event.target.closest('[data-index]');if(!card)return;const item=items[Number(card.dataset.index)];item.toothNumber=event.target.value.trim();item.userEdited=true;if(item.procedureId)item.matchState='manual';updateReady()});
$('previewList').addEventListener('change',event=>{if(!event.target.matches('[data-procedure]'))return;const card=event.target.closest('[data-index]');if(!card)return;const item=items[Number(card.dataset.index)],procedure=catalog.find(option=>option.id===event.target.value);item.procedureId=procedure?.id||'';item.procedureCode=procedure?.code||procedure?.id||'';item.officialName=procedure?.name||'';item.officialNameEn=procedure?.nameEn||'';item.matchState=procedure?'manual':'unmatched';item.userEdited=true;render()});
$('previewList').addEventListener('click',event=>{const card=event.target.closest('[data-index]');if(!card)return;const index=Number(card.dataset.index),item=items[index];if(event.target.closest('[data-delete]')){if(item.sourceKey)deletedSourceKeys.add(item.sourceKey);items.splice(index,1)}else if(event.target.closest('[data-duplicate]'))items.splice(index+1,0,{...item,sourceKey:'',manualId:crypto.randomUUID(),manualOrder:++manualOrder,afterSourceKey:item.sourceKey||item.afterSourceKey||'',originalInput:`${item.originalInput} (duplicate)`,userEdited:true,matchState:item.procedureId?'manual':'unmatched'});else return;render()});
$('newPlan').addEventListener('click',()=>{lookupGeneration+=1;patient=null;patientLookupKey='';items=[];deletedSourceKeys=new Set();manualOrder=0;idempotencyKey=crypto.randomUUID();$('patientMrn').value='';$('patientName').value='';$('quickEntry').value='';$('successCard').hidden=true;$('quickPlanForm').hidden=false;setLookup(t('mrnHelp'));render()});

applyLanguage();loadClinics().catch(error=>{if(error.status!==401){setError(error.message);$('quickPlanForm').hidden=false}});
