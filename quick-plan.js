import { parseQuickEntry, matchProcedure, normalizeToothNumber, procedureDisplayLabel, reconcileQuickPlanItems, refreshDraftCatalogItems, generatePatientFileSummary, TREATMENT_PHASES, treatmentPhase, treatmentPhaseLabel } from './quick-plan-core.js';
import { DEFAULT_CATALOG_ITEMS } from './procedure-catalog-defaults.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const request=async(url,options={})=>fetch(url,{credentials:'include',cache:'no-store',...options});
const previewMode=location.hostname==='127.0.0.1'&&new URLSearchParams(location.search).has('preview');
const previewCatalog=DEFAULT_CATALOG_ITEMS.map(item=>({...item,aliases:[...(item.aliases||[])],active:item.status!=='inactive'}));
const normalizeMrn=value=>String(value??'').replace(/[٠-٩]/g,char=>String(char.charCodeAt(0)-1632)).replace(/[۰-۹]/g,char=>String(char.charCodeAt(0)-1776)).replace(/[\s-]/g,'').toUpperCase();
const text={
  en:{title:'QUICK TREATMENT PLAN',subtitle:'Enter the MRN and type the proposed procedures like a WhatsApp message.',draftNotice:'This nurse entry is not a final treatment plan. A dentist must review and approve it.',signinRequired:'Sign-in required',signinHelp:'Open the dashboard and sign in, then return to this link.',openSignin:'OPEN SIGN-IN',mrn:'PATIENT MRN / FILE NUMBER *',find:'FIND',mrnHelp:'MRN is the primary patient identifier.',clinic:'CLINIC *',patientName:'PATIENT INITIALS / NAME (OPTIONAL)',patientAge:'PATIENT AGE (OPTIONAL)',dentist:'TREATING DENTIST (OPTIONAL)',numbering:'TOOTH NUMBERING',numberingHelp:'Numbers are stored exactly in the selected system and are never converted silently.',toothPicker:'SELECT TOOTH',toothPickerHelp:'Tap a tooth to open the complete visual procedure list.',multiProcedureHint:'Keep the tooth selected and tap every procedure it needs.',quickEntry:'QUICK ENTRY *',separatorHelp:'Use new lines, commas, or semicolons.',livePreview:'LIVE PREVIEW',checkMatches:'Check every match',matched:'Matched',confirm:'Confirm',unmatched:'Not matched',previewEmpty:'Your structured plan will appear here while you type.',notReady:'Complete the required fields',submitHelp:'All entries must have a valid tooth and confirmed procedure.',submit:'SUBMIT PLAN',submitted:'Treatment Plan Submitted',status:'Status',costPlanReady:'A costed treatment-plan draft was created with the patient details and official catalog prices.',openCostPlan:'OPEN COSTED PLAN',openSubmittedPlan:'OPEN AND EDIT QUICK PLAN',fileSummaryLabel:'PATIENT FILE NOTE',confirmExamination:'The plan is based on a clinical examination and assessment using periapical and panoramic radiographs.',confirmDiscussion:'The treatment plan was discussed with the patient and the proposed procedures were explained.',copyFileSummary:'COPY NOTE',clinicalRecordText:'CLINICAL RECORD SUMMARY',copyClinicalRecord:'COPY FOR PATIENT RECORD',another:'ENTER ANOTHER PLAN'},
  ar:{title:'الخطة العلاجية السريعة',subtitle:'أدخل رقم الملف ثم اكتب الإجراءات المقترحة مثل رسالة واتساب.',draftNotice:'إدخال الممرضة ليس خطة نهائية، ويجب أن يراجعه ويعتمده طبيب مخوّل.',signinRequired:'يلزم تسجيل الدخول',signinHelp:'افتح الداشبورد وسجل الدخول ثم ارجع إلى هذا الرابط.',openSignin:'فتح تسجيل الدخول',mrn:'رقم ملف المريض *',find:'بحث',mrnHelp:'رقم الملف هو المعرّف الأساسي للمريض.',clinic:'العيادة *',patientName:'اسم أو أحرف المريض (اختياري)',patientAge:'عمر المريض (اختياري)',dentist:'الطبيب المعالج (اختياري)',numbering:'نظام ترقيم الأسنان',numberingHelp:'يُحفظ الرقم وفق النظام المختار دون أي تحويل صامت.',toothPicker:'اختر السن',toothPickerHelp:'اضغط السن لتظهر جميع الإجراءات بصريًا.',multiProcedureHint:'أبقِ السن محددًا واضغط كل الإجراءات المطلوبة له.',quickEntry:'الإدخال السريع *',separatorHelp:'استخدم سطرًا جديدًا أو فاصلة أو فاصلة منقوطة.',livePreview:'المعاينة المباشرة',checkMatches:'راجع كل تطابق',matched:'مطابق',confirm:'يحتاج تأكيدًا',unmatched:'غير مطابق',previewEmpty:'ستظهر الخطة المنظمة هنا أثناء الكتابة.',notReady:'أكمل الحقول المطلوبة',submitHelp:'يجب تأكيد الإجراء ورقم السن لكل بند.',submit:'إرسال الخطة',submitted:'تم إرسال الخطة العلاجية',status:'الحالة',costPlanReady:'تم إنشاء مسودة الخطة ذات التكلفة ببيانات المريض وأسعار قائمة الإجراءات الرسمية.',openCostPlan:'فتح خطة التكلفة',openSubmittedPlan:'فتح وتعديل الخطة السريعة',fileSummaryLabel:'ملخص ملف المريض',confirmExamination:'تم إعداد الخطة بناءً على فحص إكلينيكي وتقييم شعاعي باستخدام الأشعة الذروية والبانورامية.',confirmDiscussion:'تمت مناقشة الخطة مع المريض وشرح الإجراءات المقترحة له.',copyFileSummary:'نسخ الملخص',clinicalRecordText:'ملخص سريري للملف',copyClinicalRecord:'نسخ الملخص إلى ملف المريض',another:'إدخال خطة أخرى'}
};
const requestedLanguage=new URLSearchParams(location.search).get('lang');
Object.assign(text.ar,{submit:'تأكيد الإرسال للإدارة',submitted:'تم حفظ الخطة وإرسالها إلى الإدارة',deliveryHelp:'الخطة متاحة في قسم مستقل لدى الإدارة. هذا تأكيد حفظ وإرسال، وليس تأكيدًا بأن الموظف قرأها.',openAdminInbox:'فتح الخطط المرسلة في الإدارة',receiptPatient:'المريض',receiptMrn:'رقم الملف',receiptTime:'وقت الإرسال',receiptReference:'مرجع الإرسال',pendingReview:'بانتظار المراجعة والاعتماد',approvedStatus:'معتمدة',completedStatus:'مكتملة',retryReceipt:'إعادة المحاولة'});
Object.assign(text.en,{submit:'CONFIRM SEND TO ADMINISTRATION',submitted:'Plan saved and sent to administration',deliveryHelp:'Available in a separate administration inbox. This confirms saving and sending, not that staff have read it.',openAdminInbox:'OPEN ADMINISTRATION INBOX',receiptPatient:'Patient',receiptMrn:'MRN / File number',receiptTime:'Submitted at',receiptReference:'Submission reference',pendingReview:'PENDING REVIEW AND APPROVAL',approvedStatus:'APPROVED',completedStatus:'COMPLETED',retryReceipt:'RETRY'});
let submittedPlan=null;
let language=requestedLanguage==='ar'?'ar':requestedLanguage==='en'?'en':localStorage.getItem('bestcare_lang')==='ar'?'ar':'en',catalog=[],catalogProfile={favorites:[],usage:{}},items=[],patient=null,patientLookupKey='',lookupGeneration=0,idempotencyKey=crypto.randomUUID(),parseTimer=0,deletedSourceKeys=new Set(),manualOrder=0,selectedTooth='',catalogGeneration=0,favoriteUpdateQueue=Promise.resolve();
const t=key=>text[language][key]||text.en[key]||key;
const currentPatientKey=()=>`${$('clinicId').value}|${normalizeMrn($('patientMrn').value)}`;
const quickPlanChannel='BroadcastChannel'in window?new BroadcastChannel('bestcare-quick-plans'):null;
let catalogFingerprint='',catalogContext='',catalogRefreshBusy=false,catalogLastChecked=0,submitting=false,catalogSelectionContext='',catalogSelectionGeneration=0,favoriteRevision=0;
async function refreshCatalogIfVisible(force=false){
  if(previewMode||document.hidden||navigator.onLine===false||catalogRefreshBusy||submitting||!catalogContext||$('quickPlanForm').hidden)return;
  if(!force&&Date.now()-catalogLastChecked<5000)return;
  catalogRefreshBusy=true;
  try{await loadCatalog()}catch{ /* Preserve the draft; submission retries a fresh server read. */ }
  finally{catalogRefreshBusy=false}
}
quickPlanChannel?.addEventListener('message',event=>{if(event.data?.type==='catalog-updated'&&event.data.clinicId===$('clinicId').value)refreshCatalogIfVisible(true)});
window.addEventListener('focus',()=>refreshCatalogIfVisible());
window.addEventListener('online',()=>refreshCatalogIfVisible(true));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshCatalogIfVisible()});
setInterval(()=>refreshCatalogIfVisible(),30000);

function applyLanguage(){
  document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';document.body.dir=document.documentElement.dir;
  document.querySelectorAll('[data-i18n]').forEach(node=>{const key=node.dataset.i18n;if(t(key))node.textContent=t(key)});
  $('languageToggle').textContent=language==='en'?'العربية':'English';
  renderToothPicker();
  renderShortcuts();
  if(submittedPlan)renderSubmissionReceipt();
}
function renderSubmissionReceipt(){
  if(!submittedPlan)return;
  const plan=submittedPlan,fields=[[t('receiptPatient'),plan.patientName||'—'],[t('receiptMrn'),plan.patientMrn||'—'],[t('receiptTime'),Number(plan.createdAt)>0?new Date(Number(plan.createdAt)).toLocaleString(language==='ar'?'ar-SA-u-ca-gregory-nu-latn':'en-GB',{timeZone:'Asia/Riyadh'}):'—'],[t('receiptReference'),String(plan.id).slice(0,12).toUpperCase()]];
  $('submissionReceipt').innerHTML=fields.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('');
  $('submittedPlanStatus').textContent=plan.status==='approved'?t('approvedStatus'):plan.status==='completed'?t('completedStatus'):t('pendingReview');
  $('submittedClinicalNote').value=language==='ar'?(plan.patientFileSummaryAr||''):(plan.patientFileSummaryEn||'');
  $('openAdminInbox').href=`./?${new URLSearchParams({view:'admin',clinic:plan.clinicId,lang:language})}#adminQuickPlanInbox`;
  $('openSubmittedPlan').href=`./quick-plan-review.html?${new URLSearchParams({clinic:plan.clinicId,id:plan.id,lang:language})}`;
  $('openSubmittedPlan').hidden=false;
  const costPlan=plan.costPlan;$('costPlanReady').hidden=!costPlan;$('openCostPlan').hidden=!costPlan;
  if(costPlan)$('openCostPlan').href=`./treatment-plan.html?${new URLSearchParams({patientId:costPlan.patientId,date:costPlan.date,planNo:costPlan.planNo,clinic:costPlan.clinicId,view:'admin',lang:language})}`;
}
function showSubmissionReceipt(plan,costPlan){
  if(!plan?.id||!plan.clinicId)throw new Error(language==='ar'?'تعذر تأكيد الحفظ. أعد المحاولة بنفس الخطة.':'Saving could not be confirmed. Retry the same plan.');
  submittedPlan={...plan,costPlan:costPlan||plan.costPlan};renderSubmissionReceipt();
  $('quickPlanForm').hidden=true;$('successCard').hidden=false;$('receiptRestoreError').hidden=true;$('fileSummaryBtn').hidden=true;$('fileSummaryPanel').hidden=true;
  const url=new URL(location.href);url.searchParams.set('sentPlan',plan.id);url.searchParams.set('clinic',plan.clinicId);url.searchParams.delete('mrn');history.replaceState(null,'',url);
  $('successCard').scrollIntoView({block:'start'});
}
async function restoreSubmissionReceipt(id){
  $('quickPlanForm').hidden=true;$('fileSummaryBtn').hidden=true;
  try{
    const response=await request(`/api/quick-treatment-plans?${new URLSearchParams({clinic:$('clinicId').value,id})}`),data=await response.json();
    if(!response.ok||!data.plan)throw new Error(language==='ar'?'تعذر تحميل تأكيد الخطة المحفوظة. أعد المحاولة أو افتح قسم الخطط لدى الإدارة.':'Could not load the saved plan receipt. Retry or open the administration inbox.');
    showSubmissionReceipt(data.plan);
  }catch(error){$('receiptRestoreError').hidden=false;$('receiptRestoreMessage').textContent=error.message}
}
function toothNumbers(){return $('numberingSystem').value==='fdi'?[['18','17','16','15','14','13','12','11'],['21','22','23','24','25','26','27','28'],['48','47','46','45','44','43','42','41'],['31','32','33','34','35','36','37','38']]:[Array.from({length:8},(_,index)=>String(index+1).padStart(2,'0')),Array.from({length:8},(_,index)=>String(index+9).padStart(2,'0')),Array.from({length:8},(_,index)=>String(32-index).padStart(2,'0')),Array.from({length:8},(_,index)=>String(24-index).padStart(2,'0'))]}
function toothShape(number){if($('numberingSystem').value!=='fdi')return'tooth-generic';const position=Number(String(number).slice(-1));return position<=2?'tooth-incisor':position===3?'tooth-canine':position<=5?'tooth-premolar':'tooth-molar'}
function toothIcon(shape){
  const paths={
    'tooth-incisor':'<path class="tooth-body" d="M10 8C13 4 27 4 30 8C32 14 31 25 28 31C26 35 23 37 20 37C17 37 14 35 12 31C9 25 8 14 10 8Z"/><path class="tooth-body" d="M14 32C15 43 16 54 20 62C24 54 25 43 26 32Z"/><path class="tooth-detail" d="M13 13C17 10 23 10 27 13M15 30C18 32 22 32 25 30"/>',
    'tooth-canine':'<path class="tooth-body" d="M9 14C10 9 15 5 20 2C25 5 30 9 31 14C31 22 28 31 24 36C22 39 18 39 16 36C12 31 9 22 9 14Z"/><path class="tooth-body" d="M15 34C16 45 17 56 20 63C23 56 24 45 25 34Z"/><path class="tooth-detail" d="M12 15C16 12 24 12 28 15M16 32C18 34 22 34 24 32"/>',
    'tooth-premolar':'<path class="tooth-body" d="M6 13C8 6 14 4 20 7C26 4 32 6 34 13C34 21 31 30 27 35C23 39 17 39 13 35C9 30 6 21 6 13Z"/><path class="tooth-body" d="M12 34C12 45 13 55 16 62C19 54 20 44 20 35Z"/><path class="tooth-body" d="M20 35C20 44 21 54 24 62C27 55 28 45 28 34Z"/><path class="tooth-detail" d="M10 14C14 10 17 11 20 14C23 11 27 10 30 14M12 29C17 32 23 32 28 29"/>',
    'tooth-molar':'<path class="tooth-body" d="M4 14C5 8 9 5 14 8C18 4 22 4 26 8C31 5 35 8 36 14C36 22 33 31 29 36C24 41 16 41 11 36C7 31 4 22 4 14Z"/><path class="tooth-body" d="M8 35C8 46 8 56 12 63C16 55 17 45 17 36Z"/><path class="tooth-body" d="M17 36C18 47 19 56 20 62C22 55 23 46 23 36Z"/><path class="tooth-body" d="M23 36C23 45 25 55 29 63C32 56 32 46 32 35Z"/><path class="tooth-detail" d="M8 14C11 10 15 11 18 14C21 10 25 10 28 14C30 12 32 12 34 14M9 28C15 33 25 33 31 28"/>',
    'tooth-generic':'<path class="tooth-body" d="M7 12C10 5 30 5 33 12C33 21 30 31 26 36C23 40 17 40 14 36C10 31 7 21 7 12Z"/><path class="tooth-body" d="M13 34C15 46 16 56 20 63C24 56 25 46 27 34Z"/><path class="tooth-detail" d="M11 14C16 10 24 10 29 14M13 30C18 33 22 33 27 30"/>'
  };
  return `<svg viewBox="0 0 40 64" focusable="false" aria-hidden="true"><defs><linearGradient id="toothEnamel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".58" stop-color="#fffdf2"/><stop offset="1" stop-color="#e8efe9"/></linearGradient></defs>${paths[shape]||paths['tooth-generic']}</svg>`;
}
function procedureIconType(procedure){
  const id=String(procedure?.id||'');
  if(/exam/.test(id))return'exam';
  if(/root-canal/.test(id))return'endo';
  if(/filling/.test(id))return'filling';
  if(/cleaning/.test(id))return'cleaning';
  if(/periodontal/.test(id))return'gum';
  if(/cbct|scan/.test(id))return'scan';
  if(/extraction/.test(id))return'extraction';
  if(/bone-graft/.test(id))return'bone';
  if(/sinus/.test(id))return'sinus';
  if(/implant/.test(id))return'implant';
  if(/post/.test(id))return'post';
  if(/crown|temporary/.test(id))return'crown';
  if(/veneer/.test(id))return'veneer';
  if(/smile/.test(id))return'smile';
  if(/whitening/.test(id))return'whitening';
  return'other';
}
function procedureIcon(procedure){
  const type=procedureIconType(procedure),icons={
    exam:'<circle cx="11" cy="11" r="5"/><path d="m15 15 5 5"/><path d="M7 4c2-2 6-2 8 0"/>',
    endo:'<path d="M8 4c3-2 7-2 10 0 3 3 1 8-1 11l-2 6-3-7-3 7-2-6C5 12 4 7 8 4Z"/><path d="M12 7v8"/>',
    filling:'<path d="M8 4c3-2 7-2 10 0 3 3 1 8-1 11l-2 6-3-7-3 7-2-6C5 12 4 7 8 4Z"/><circle cx="12" cy="8" r="2.4" class="icon-fill"/>',
    cleaning:'<path d="M8 5c3-2 7-2 9 0 3 3 1 7-1 10l-2 6-3-7-2 6-2-5C5 12 4 8 8 5Z"/><path d="m19 2 .7 2.2L22 5l-2.3.8L19 8l-.8-2.2L16 5l2.2-.8Z"/>',
    gum:'<path d="M3 15c3-5 5 4 8-1s5 4 10-1"/><path d="M6 8h12M8 5h8"/>',
    scan:'<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><circle cx="12" cy="12" r="4"/><path d="M12 6v12M6 12h12"/>',
    extraction:'<path d="M8 5c3-2 7-2 9 0 3 3 1 7-1 10l-2 6-3-7-2 6-2-5C5 12 4 8 8 5Z"/><path d="m17 7 4-4m0 0h-4m4 0v4"/>',
    bone:'<path d="M7 8a3 3 0 1 1-3-3 3 3 0 1 1 4-3l8 8a3 3 0 1 1 3 3 3 3 0 1 1-4 3Z"/>',
    sinus:'<path d="M3 15c4-8 14-8 18 0"/><path d="M6 16c3-4 9-4 12 0M12 4v5M9.5 6.5h5"/>',
    implant:'<path d="M8 3h8M10 6h4M9 8h6l-1 11-2 3-2-3Z"/><path d="m9.5 11 5-2m-5 5 5-2m-4.5 5 4-2"/>',
    post:'<path d="M7 4c3-2 7-2 10 0 2 3 1 6-1 9l-2 8-2-7-2 7-2-8C6 10 5 7 7 4Z"/><path d="M12 6v13M9 7h6"/>',
    crown:'<path d="m4 8 4 4 4-7 4 7 4-4-2 11H6Z"/><path d="M6 19h12"/>',
    veneer:'<path d="M7 4c3-2 7-2 10 0 3 3 1 8-1 12-1 3-2 5-4 5s-3-2-4-5C6 12 4 7 7 4Z"/><path d="M9 6c2-1 4-1 6 0"/>',
    smile:'<path d="M4 8c2 11 14 11 16 0"/><path d="M8 5h1m6 0h1"/>',
    whitening:'<path d="M5 15c3 6 11 6 14 0"/><path d="m12 2 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"/>',
    other:'<path d="M12 4v16M4 12h16"/>'
  };
  return `<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">${icons[type]}</svg>`;
}
function visualProcedureOrder(procedures){
  const usage=catalogProfile.usage||{},favorites=new Set(catalogProfile.favorites||[]);
  return [...procedures].sort((left,right)=>Number(favorites.has(right.id))-Number(favorites.has(left.id))||Number(usage[right.id]||0)-Number(usage[left.id]||0)||procedureDisplayLabel(left,language).localeCompare(procedureDisplayLabel(right,language),language));
}
function priorityProcedures(){
  const usage=catalogProfile.usage||{},favorites=new Set(catalogProfile.favorites||[]),ranked=visualProcedureOrder(catalog);
  const learned=ranked.filter(item=>favorites.has(item.id)||Number(usage[item.id]||0)>0);
  return (learned.length?learned:ranked).slice(0,6);
}
function visualProcedureCard(procedure,assignedCounts){
  const count=assignedCounts.get(procedure.id)||0,label=procedureDisplayLabel(procedure,language),favorite=(catalogProfile.favorites||[]).includes(procedure.id),usage=Number(catalogProfile.usage?.[procedure.id]||0);
  return `<div class="procedure-visual-shell"><button type="button" class="procedure-visual-card ${count?'is-assigned':''}" data-palette-procedure="${esc(procedure.id)}" aria-pressed="${Boolean(count)}" aria-label="${esc(label)}${count?` ×${count}`:''}"><span class="procedure-visual-icon">${procedureIcon(procedure)}</span><span class="procedure-visual-copy"><span class="procedure-visual-name">${esc(label)}</span>${usage?`<small>${language==='ar'?`استُخدم ${usage} مرة`:`Used ${usage} times`}</small>`:''}</span>${count?`<b class="procedure-visual-count">×${count}</b>`:''}</button><button type="button" class="procedure-favorite-toggle ${favorite?'is-favorite':''}" data-palette-favorite="${esc(procedure.id)}" aria-pressed="${favorite}" aria-label="${favorite?(language==='ar'?'إزالة من المفضلة':'Remove favorite'):(language==='ar'?'إضافة إلى المفضلة':'Add favorite')}">${favorite?'★':'☆'}</button></div>`;
}
function renderProcedurePalette(){
  const node=$('procedurePalette');if(!node)return;
  if(!selectedTooth){node.className='procedure-palette is-empty';node.innerHTML=`<p class="procedure-palette-empty"><span aria-hidden="true">☝</span>${language==='ar'?'اختر سنًا من المخطط، وستظهر هنا جميع الإجراءات مرتبة بصريًا.':'Select a tooth above to see every procedure in a visual, organized list.'}</p>`;return}
  const assignedCounts=new Map();items.filter(item=>item.toothNumber===selectedTooth&&item.procedureId).forEach(item=>assignedCounts.set(item.procedureId,(assignedCounts.get(item.procedureId)||0)+1));
  const priority=priorityProcedures(),prioritySection=priority.length?`<section class="procedure-phase procedure-phase-priority"><header><span class="phase-dot" aria-hidden="true"></span><h3>${language==='ar'?'المفضلة والأكثر استخدامًا':'FAVORITES & MOST USED'}</h3><small>${priority.length}</small></header><div class="procedure-visual-grid priority-grid">${priority.map(procedure=>visualProcedureCard(procedure,assignedCounts)).join('')}</div></section>`:'';
  const sections=TREATMENT_PHASES.map(phase=>{const options=visualProcedureOrder(catalog.filter(item=>treatmentPhase(item.category)===phase.id));if(!options.length)return'';return`<section class="procedure-phase procedure-phase-${phase.id}"><header><span class="phase-dot" aria-hidden="true"></span><h3>${esc(treatmentPhaseLabel(phase.id,language))}</h3><small>${options.length}</small></header><div class="procedure-visual-grid">${options.map(procedure=>visualProcedureCard(procedure,assignedCounts)).join('')}</div></section>`}).join('');
  node.className='procedure-palette';node.innerHTML=`<div class="procedure-palette-title"><strong>${language==='ar'?`إجراءات السن ${selectedTooth}`:`PROCEDURES FOR TOOTH ${selectedTooth}`}</strong><span>${language==='ar'?'يمكن اختيار أكثر من إجراء':'Select one or more'}</span></div>${prioritySection}${sections}`;
}
function renderToothPicker(){
  const grid=$('toothGrid');if(!grid)return;
  const rows=toothNumbers(),quadrants=[
    {position:'upper-left',jaw:'upper',label:language==='ar'?'علوي أيمن':'UPPER RIGHT',numbers:rows[0]||[]},
    {position:'upper-right',jaw:'upper',label:language==='ar'?'علوي أيسر':'UPPER LEFT',numbers:rows[1]||[]},
    {position:'lower-left',jaw:'lower',label:language==='ar'?'سفلي أيمن':'LOWER RIGHT',numbers:rows[2]||[]},
    {position:'lower-right',jaw:'lower',label:language==='ar'?'سفلي أيسر':'LOWER LEFT',numbers:rows[3]||[]}
  ];
  grid.innerHTML=`<div class="odontogram-grid">${quadrants.map(quadrant=>`<section class="tooth-quadrant ${quadrant.jaw} ${quadrant.position}" aria-label="${quadrant.label}"><span class="quadrant-label">${quadrant.label}</span><div class="tooth-row">${quadrant.numbers.map(number=>{const shape=toothShape(number);return`<button type="button" data-tooth-pick="${number}" class="${shape} ${selectedTooth===number?'selected':''}" aria-label="${language==='ar'?`السن ${number}`:`Tooth ${number}`}" aria-pressed="${selectedTooth===number}"><span class="tooth-icon">${toothIcon(shape)}</span><span class="tooth-number">${number}</span></button>`}).join('')}</div></section>`).join('')}</div>`;
  $('selectedToothLabel').textContent=selectedTooth?(language==='ar'?`السن ${selectedTooth}`:`Tooth ${selectedTooth}`):'—';
  renderProcedurePalette();
  renderSelectedToothProcedures();
}
function renderSelectedToothProcedures(){const node=$('selectedToothProcedures');if(!node)return;const assigned=selectedTooth?items.filter(item=>item.toothNumber===selectedTooth&&item.procedureId):[];node.hidden=!assigned.length;node.innerHTML=assigned.map(item=>`<span>${esc(procedureDisplayLabel(item,language))}</span>`).join('')}
function commonProcedures(){const favorites=new Set(catalogProfile.favorites||[]),usage=catalogProfile.usage||{};return[...catalog].sort((a,b)=>Number(favorites.has(b.id))-Number(favorites.has(a.id))||Number(usage[b.id]||0)-Number(usage[a.id]||0)).slice(0,8)}
function renderShortcuts(){const node=$('shortcutRow');if(!node)return;node.innerHTML=commonProcedures().map(item=>`<button type="button" data-procedure-id="${esc(item.id)}">${esc(procedureDisplayLabel(item,language))}</button>`).join('')}
function uniqueQuickToken(procedure){const candidates=[procedure.nameEn,procedure.code,...(procedure.aliases||[]),procedure.id].map(value=>String(value||'').trim()).filter(Boolean);return candidates.find(candidate=>{const match=matchProcedure(candidate,catalog);return match.matchState==='exact'&&match.procedure?.id===procedure.id})||procedure.id}
function insertQuickEntry(value,{focus=true}={}){const textarea=$('quickEntry'),line=String(value||'').trim();if(!line)return;textarea.value=`${textarea.value.trim()}${textarea.value.trim()?'\n':''}${line}`;if(focus)textarea.focus();scheduleParse()}
function removeAssignedProcedure(procedureId,toothNumber){
  const assigned=items.filter(item=>item.toothNumber===toothNumber&&item.procedureId===procedureId);
  if(!assigned.length)return false;
  const sourceIndices=new Set(assigned.filter(item=>item.sourceKey&&!item.manualId).map(item=>item.index));
  const textarea=$('quickEntry');
  if(sourceIndices.size){
    const segments=textarea.value.split(/[\n,;]+/).map(segment=>segment.trim()).filter(Boolean);
    const oldTagged=reconcileQuickPlanItems([],parseQuickEntry(textarea.value,catalog,$('numberingSystem').value),[]).items;
    textarea.value=segments.filter((segment,index)=>!sourceIndices.has(index)).join('\n');
    const newTagged=reconcileQuickPlanItems([],parseQuickEntry(textarea.value,catalog,$('numberingSystem').value),[]).items;
    const sourceRemap=new Map();
    oldTagged.forEach(item=>{
      if(sourceIndices.has(item.index))return;
      const nextIndex=item.index-[...sourceIndices].filter(index=>index<item.index).length;
      const replacement=newTagged.find(next=>next.index===nextIndex);
      if(replacement)sourceRemap.set(item.sourceKey,replacement);
    });
    deletedSourceKeys=new Set([...deletedSourceKeys].map(key=>sourceRemap.get(key)?.sourceKey).filter(Boolean));
    items=items.filter(item=>!assigned.includes(item)).map(item=>{
      if(item.manualId){const anchor=sourceRemap.get(item.afterSourceKey);return anchor?{...item,afterSourceKey:anchor.sourceKey}:item}
      if(!item.sourceKey)return item;
      const replacement=sourceRemap.get(item.sourceKey);
      return replacement?{...item,index:replacement.index,sourceKey:replacement.sourceKey}:item;
    });
  }else{
    items=items.filter(item=>!assigned.includes(item));
  }
  clearTimeout(parseTimer);
  parse();
  return true;
}
async function toggleProcedureFavorite(procedureId){
  favoriteRevision+=1;
  const previousFavorite=(catalogProfile.favorites||[]).includes(procedureId),favorites=new Set(catalogProfile.favorites||[]),favorite=!previousFavorite;
  if(favorite)favorites.add(procedureId);else favorites.delete(procedureId);
  catalogProfile={...catalogProfile,favorites:[...favorites]};renderProcedurePalette();renderShortcuts();
  if(previewMode)return;
  const context={generation:catalogSelectionGeneration,clinicId:$('clinicId').value,doctorKey:$('treatingDentist').value.trim(),procedureId,favorite,previousFavorite};
  favoriteUpdateQueue=favoriteUpdateQueue.catch(()=>{}).then(async()=>{
    if(context.generation!==catalogSelectionGeneration||context.clinicId!==$('clinicId').value||context.doctorKey!==$('treatingDentist').value.trim())return;
    try{
      const response=await request(`/api/treatment-catalog?clinic=${encodeURIComponent(context.clinicId)}&doctor=${encodeURIComponent(context.doctorKey)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'favorite',doctorKey:context.doctorKey,procedureId:context.procedureId,favorite:context.favorite})}),data=await response.json();
      if(!response.ok)throw new Error(data.error||'Could not update favorite');
      if(context.generation===catalogSelectionGeneration&&data.profile?.usage)catalogProfile={...catalogProfile,usage:{...catalogProfile.usage,...data.profile.usage}};
    }catch(error){
      if(context.generation===catalogSelectionGeneration){const current=new Set(catalogProfile.favorites||[]),stillDesired=current.has(context.procedureId)===context.favorite;if(stillDesired){if(context.previousFavorite)current.add(context.procedureId);else current.delete(context.procedureId);catalogProfile={...catalogProfile,favorites:[...current]};renderProcedurePalette();renderShortcuts()}setError(error.message)}
    }
  });
}
function clinicLabel(clinic){return `${clinic.name||clinic.id}${clinic.roomNumber?` · ${language==='ar'?'غرفة':'Room'} ${clinic.roomNumber}`:''}${clinic.doctorName?` · ${clinic.doctorName}`:''}`}
function setError(message=''){ $('formError').hidden=!message;$('formError').textContent=message }
function setLookup(message,state=''){const node=$('patientLookupState');node.textContent=message;node.className=state?`lookup-state-${state}`:''}
function itemReady(item){return Boolean(normalizeToothNumber(item.toothNumber,$('numberingSystem').value)&&catalog.some(procedure=>procedure.id===item.procedureId)&&['exact','manual'].includes(item.matchState))}
function updateReady(){
  const ready=Boolean(patient&&patientLookupKey===currentPatientKey()&&$('patientMrn').value.trim()&&items.length&&items.every(itemReady));
  $('submitPlan').disabled=submitting||!ready;$('readyState').textContent=ready?(language==='ar'?'جاهزة للإرسال':'Ready to submit'):t('notReady');
  $('parseSummary').textContent=language==='ar'?`${items.length} إجراء · ${items.filter(itemReady).length} جاهز`:`${items.length} item${items.length===1?'':'s'} · ${items.filter(itemReady).length} ready`;
}
function procedureOptions(item){
  return `<option value="">${language==='ar'?'اختر الإجراء':'SELECT PROCEDURE'}</option>`+TREATMENT_PHASES.map(phase=>{const options=catalog.filter(option=>treatmentPhase(option.category)===phase.id);return options.length?`<optgroup label="${esc(treatmentPhaseLabel(phase.id,language))}">${options.map(option=>`<option value="${esc(option.id)}" ${item.procedureId===option.id?'selected':''}>${esc(procedureDisplayLabel(option,language))}</option>`).join('')}</optgroup>`:''}).join('');
}
function renderProcedureCounts(){
  const node=$('procedureCounts');if(!node)return;
  const counts=new Map();items.forEach(item=>{if(!item.procedureId)return;counts.set(item.procedureId,(counts.get(item.procedureId)||0)+1)});
  node.hidden=!counts.size;node.innerHTML=[...counts.entries()].map(([procedureId,count])=>{const procedure=catalog.find(option=>option.id===procedureId),label=procedure?procedureDisplayLabel(procedure,language):procedureId;return`<span><b>${esc(label)}</b><strong>×${count}</strong></span>`}).join('');
}
function updateFileSummary(){const node=$('fileSummaryText');if(!node)return;node.value=generatePatientFileSummary(items,$('numberingSystem').value,{name:$('patientName').value.trim(),age:$('patientAge').value,mrn:$('patientMrn').value.trim(),examinationConfirmed:$('confirmExamination').checked,discussionConfirmed:$('confirmDiscussion').checked},language)}
function render(){
  renderProcedureCounts();renderSelectedToothProcedures();renderProcedurePalette();updateFileSummary();if(!items.length){$('previewList').innerHTML=`<p class="empty-preview">${esc(t('previewEmpty'))}</p>`;updateReady();return}
  $('previewList').innerHTML=items.map((item,index)=>{const state=itemReady(item)?'high':item.matchState==='possible'?'possible':'unmatched',label=state==='high'?t('matched'):state==='possible'?t('confirm'):t('unmatched'),duplicateLabel=language==='ar'?'نسخ البند':'Duplicate item',deleteLabel=language==='ar'?'حذف البند':'Delete item',phase=treatmentPhase(item.category);return `<article class="procedure-card match-${state} phase-${phase}" data-index="${index}"><input class="tooth-input" data-tooth aria-label="${language==='ar'?'رقم السن':'Tooth number'}" value="${esc(item.toothNumber||'')}" placeholder="${$('numberingSystem').value==='fdi'?'11':'09'}"><div class="card-copy"><select class="procedure-select" data-procedure aria-label="${language==='ar'?'الإجراء':'Procedure'}">${procedureOptions(item)}</select><small>${esc(item.originalInput||'')}</small><span class="phase-badge">${esc(treatmentPhaseLabel(phase,language))}</span><span class="match-badge">${state==='high'?'✓':state==='possible'?'?':'!'} ${esc(label)}</span></div><div class="card-actions"><button type="button" data-duplicate title="${duplicateLabel}" aria-label="${duplicateLabel}">⧉</button><button type="button" data-delete title="${deleteLabel}" aria-label="${deleteLabel}">×</button></div></article>`}).join('');
  updateReady();
}
function parse(){const next=parseQuickEntry($('quickEntry').value,catalog,$('numberingSystem').value),reconciled=reconcileQuickPlanItems(items,next,deletedSourceKeys);items=reconciled.items;deletedSourceKeys=new Set(reconciled.deletedSourceKeys);render()}
function scheduleParse(){clearTimeout(parseTimer);parseTimer=setTimeout(parse,100)}
function invalidatePatient(){lookupGeneration+=1;patient=null;patientLookupKey='';$('patientName').value='';$('patientAge').value='';$('confirmExamination').checked=false;$('confirmDiscussion').checked=false;setLookup(t('mrnHelp'));updateFileSummary();updateReady()}
async function loadCatalog(){
  const clinicId=$('clinicId').value;if(!clinicId)return;const generation=++catalogGeneration;
  const doctor=$('treatingDentist').value.trim(),selectionContext=`${clinicId}|${doctor}`;
  if(selectionContext!==catalogSelectionContext){catalogSelectionContext=selectionContext;catalogSelectionGeneration+=1}
  await favoriteUpdateQueue;
  const profileRevision=favoriteRevision,response=await request(`/api/treatment-catalog?clinic=${encodeURIComponent(clinicId)}&doctor=${encodeURIComponent(doctor)}`),data=await response.json();
  if(!response.ok)throw Object.assign(new Error(data.error||'Could not load procedures'),{status:response.status});
  if(generation!==catalogGeneration||clinicId!==$('clinicId').value||doctor!==$('treatingDentist').value.trim())return;
  const nextCatalog=Array.isArray(data.items)?data.items.filter(item=>item.active!==false&&item.status!=='inactive'):[],fingerprint=JSON.stringify(nextCatalog),context=`${clinicId}|${doctor}`;
  catalogLastChecked=Date.now();
  const profile=data.profile&&typeof data.profile==='object'?data.profile:{favorites:[],usage:{}};
  const profileChanged=profileRevision===favoriteRevision&&JSON.stringify(profile)!==JSON.stringify(catalogProfile);
  if(profileChanged)catalogProfile=profile;
  if(fingerprint===catalogFingerprint&&context===catalogContext){if(profileChanged){renderShortcuts();renderProcedurePalette()}return}
  // Capture any pending keystrokes against the old catalog before updating labels/aliases.
  clearTimeout(parseTimer);parse();
  catalog=nextCatalog;
  items=refreshDraftCatalogItems(items,catalog);catalogFingerprint=fingerprint;catalogContext=context;
  renderShortcuts();
  renderToothPicker();
  parse();
}
async function loadClinics(){
  const sentPlanId=new URLSearchParams(location.search).get('sentPlan');
  if(sentPlanId){$('quickPlanForm').hidden=true;$('fileSummaryBtn').hidden=true}
  if(previewMode){
    $('clinicId').innerHTML='<option value="clinic-1">Preview Clinic</option>';catalog=previewCatalog;
    $('treatingDentist').value='Preview Dentist';$('patientMrn').value='18417';patient={name:'Preview Patient',file:'18417'};patientLookupKey=currentPatientKey();$('patientName').value=patient.name;
    setLookup(language==='ar'?'معاينة محلية — لا يتم حفظ أي بيانات':'Local preview — no data is saved','ok');
    if(new URLSearchParams(location.search).has('sample')){selectedTooth='11';$('quickEntry').value='RCT 11\nRCT 12\nRCT 13\nRCT 14\nExtraction 21\nExtraction 22'}
    renderShortcuts();renderToothPicker();scheduleParse();return;
  }
  const session=await request('/api/auth?action=session'),sessionData=await session.json();
  if(!session.ok){$('authError').hidden=false;$('quickPlanForm').hidden=true;throw Object.assign(new Error(sessionData.error||'Authentication required'),{status:session.status})}
  const response=await request('/api/clinics'),data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load clinics');
  const active=(data.clinics||[]).filter(item=>item.active!==false);$('clinicId').innerHTML=active.map(item=>`<option value="${esc(item.id)}">${esc(clinicLabel(item))}</option>`).join('');
  const requested=new URLSearchParams(location.search).get('clinic');if(active.some(item=>item.id===requested))$('clinicId').value=requested;
  const clinic=active.find(item=>item.id===$('clinicId').value);if(clinic?.doctorName)$('treatingDentist').value=clinic.doctorName;
  if(sentPlanId){
    if(!active.some(item=>item.id===requested))throw new Error(language==='ar'?'تعذر الوصول لعيادة الخطة المحفوظة.':'The saved plan clinic is not accessible.');
    await restoreSubmissionReceipt(sentPlanId);return;
  }
  await loadCatalog();
  const requestedMrn=new URLSearchParams(location.search).get('mrn');
  if(requestedMrn){$('patientMrn').value=normalizeMrn(requestedMrn);await findPatient()}
}
async function findPatient(){
  const mrn=$('patientMrn').value.trim(),clinicId=$('clinicId').value,key=currentPatientKey(),generation=++lookupGeneration;patient=null;patientLookupKey='';updateReady();if(!mrn){setLookup(language==='ar'?'أدخل رقم الملف أولًا':'Enter the MRN first','error');return}
  if(previewMode){patient={name:'Preview Patient',file:mrn};patientLookupKey=key;$('patientName').value=patient.name;setLookup(language==='ar'?'معاينة محلية — تم اختيار مريض تجريبي':'Local preview — sample patient selected','ok');updateReady();return}
  setLookup(language==='ar'?'جارٍ البحث…':'Looking up patient…');
  try{const response=await request(`/api/patient-lookup?type=file&value=${encodeURIComponent(mrn)}&clinic=${encodeURIComponent(clinicId)}`),data=await response.json();if(generation!==lookupGeneration||key!==currentPatientKey())return;if(!response.ok)throw new Error(data.error||'Lookup failed');const exact=(data.matches||[]).find(match=>normalizeMrn(match.patient?.file)===normalizeMrn(mrn));if(!exact)throw new Error(language==='ar'?'رقم الملف غير موجود في هذه العيادة':'MRN was not found in this clinic');patient=exact.patient;patientLookupKey=key;$('patientName').value=patient.name||'';if(patient.age!==undefined&&patient.age!==null&&patient.age!=='')$('patientAge').value=String(patient.age);setLookup(language==='ar'?`تم العثور على ${patient.name||'المريض'}`:`Patient found${patient.name?`: ${patient.name}`:''}`,'ok');updateFileSummary();updateReady()}catch(error){if(generation===lookupGeneration)setLookup(error.message,'error')}
}
function resolvedItems(){return items.map(item=>{const procedure=catalog.find(option=>option.id===item.procedureId);return{toothNumber:normalizeToothNumber(item.toothNumber,$('numberingSystem').value),procedureId:item.procedureId,procedureCode:procedure?.code||procedure?.id||item.procedureId,officialName:procedure?.name||'',officialNameEn:procedure?.nameEn||'',category:treatmentPhase(procedure?.category),originalInput:item.originalInput,matchState:item.matchState}})}
async function submitWithCatalogRefresh(event){
  event.preventDefault();if(submitting)return;
  submitting=true;updateReady();
  try{if(!previewMode)await loadCatalog();clearTimeout(parseTimer);parse();await submit(event)}
  catch(error){setError(error.message)}
  finally{submitting=false;updateReady()}
}
async function submit(event){
  event.preventDefault();setError();if(!patient||!items.length||!items.every(itemReady)){setError(language==='ar'?'أكمل جميع المطابقات قبل الإرسال.':'Resolve every entry before submission.');return}
  if(previewMode){setError(language==='ar'?'هذه معاينة محلية فقط ولا تحفظ بيانات المرضى.':'This local preview does not save patient data.');return}
  if(!window.confirm(language==='ar'?`إرسال خطة ${$('patientName').value||'المريض'}، ملف ${$('patientMrn').value} إلى الإدارة؟\nعدد الإجراءات: ${items.length}. ستظهر كمسودة مستقلة بانتظار المراجعة.`:`Send the plan for ${$('patientName').value||'this patient'}, MRN ${$('patientMrn').value}, to administration?\n${items.length} procedure(s). It will appear as a separate draft pending review.`))return;
  $('submitPlan').disabled=true;
  try{if(patientLookupKey!==currentPatientKey())throw new Error(language==='ar'?'أعد التحقق من رقم الملف قبل الإرسال.':'Verify the current MRN before submission.');const body={clinicId:$('clinicId').value,patientMrn:$('patientMrn').value.trim(),patientName:$('patientName').value.trim(),patientAge:$('patientAge').value,treatingDentist:$('treatingDentist').value.trim(),numberingSystem:$('numberingSystem').value,originalInput:$('quickEntry').value.trim(),items:resolvedItems(),examinationConfirmed:$('confirmExamination').checked,discussionConfirmed:$('confirmDiscussion').checked,idempotencyKey};const response=await request('/api/quick-treatment-plans',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw new Error(data.error||'Could not submit plan');const quantities=Object.entries(body.items.reduce((result,item)=>(result[item.procedureId]=(result[item.procedureId]||0)+1,result),{})).map(([code,quantity])=>({code,quantity}));request(`/api/treatment-catalog?clinic=${encodeURIComponent(body.clinicId)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'usage',doctorKey:body.treatingDentist,items:quantities})}).catch(()=>{});showSubmissionReceipt(data.plan,data.costPlan);quickPlanChannel?.postMessage({type:'submitted',clinicId:body.clinicId,id:data.plan.id,costPlanNo:submittedPlan.costPlan?.planNo||'',at:Date.now()});}catch(error){setError(error.message);$('submitPlan').disabled=false}
}

$('retryReceipt').addEventListener('click',startQuickPlanPage);
$('newPlan').addEventListener('click',async()=>{submittedPlan=null;const url=new URL(location.href);url.searchParams.delete('sentPlan');history.replaceState(null,'',url);$('fileSummaryBtn').hidden=false;await loadEntryCatalog()});
$('catalogRetry').addEventListener('click',loadEntryCatalog);
async function loadEntryCatalog(){
  $('catalogRetry').disabled=true;setError();
  try{await loadCatalog();$('catalogRetry').hidden=true}
  catch(error){setError(error.message);$('catalogRetry').hidden=false}
  finally{$('catalogRetry').disabled=false}
}
$('languageToggle').addEventListener('click',()=>{language=language==='en'?'ar':'en';localStorage.setItem('bestcare_lang',language);applyLanguage();render()});
$('clinicId').addEventListener('change',async()=>{invalidatePatient();const selected=$('clinicId').selectedOptions[0]?.textContent||'';if(selected)$('treatingDentist').value='';try{await loadCatalog()}catch(error){setError(error.message)}updateReady()});
$('numberingSystem').addEventListener('change',()=>{selectedTooth='';renderToothPicker();parse()});$('quickEntry').addEventListener('input',scheduleParse);$('lookupPatient').addEventListener('click',findPatient);$('patientMrn').addEventListener('change',findPatient);$('quickPlanForm').addEventListener('submit',submitWithCatalogRefresh);
$('patientMrn').addEventListener('input',()=>{if(patientLookupKey&&patientLookupKey!==currentPatientKey())invalidatePatient()});
$('toothGrid').addEventListener('click',event=>{const button=event.target.closest('[data-tooth-pick]');if(!button)return;selectedTooth=button.dataset.toothPick||'';renderToothPicker();$('procedurePalette').querySelector('[data-palette-procedure]')?.focus()});
$('procedurePalette').addEventListener('click',event=>{const favoriteButton=event.target.closest('[data-palette-favorite]');if(favoriteButton){toggleProcedureFavorite(favoriteButton.dataset.paletteFavorite);return}const button=event.target.closest('[data-palette-procedure]');if(!button||!selectedTooth)return;const procedure=catalog.find(item=>item.id===button.dataset.paletteProcedure);if(!procedure)return;clearTimeout(parseTimer);parse();if(removeAssignedProcedure(procedure.id,selectedTooth))return;insertQuickEntry(`${uniqueQuickToken(procedure)} ${selectedTooth}`,{focus:false});clearTimeout(parseTimer);parse()});
$('shortcutRow').addEventListener('click',event=>{const button=event.target.closest('[data-procedure-id]');if(!button)return;const procedure=catalog.find(item=>item.id===button.dataset.procedureId);if(!procedure)return;const value=uniqueQuickToken(procedure);insertQuickEntry(selectedTooth?`${value} ${selectedTooth}`:`${value} `)});
$('previewList').addEventListener('input',event=>{if(!event.target.matches('[data-tooth]'))return;const card=event.target.closest('[data-index]');if(!card)return;const item=items[Number(card.dataset.index)];item.toothNumber=event.target.value.trim();item.userEdited=true;if(item.procedureId)item.matchState='manual';renderSelectedToothProcedures();updateFileSummary();updateReady()});
$('previewList').addEventListener('change',event=>{if(!event.target.matches('[data-procedure]'))return;const card=event.target.closest('[data-index]');if(!card)return;const item=items[Number(card.dataset.index)],procedure=catalog.find(option=>option.id===event.target.value);item.procedureId=procedure?.id||'';item.procedureCode=procedure?.code||procedure?.id||'';item.officialName=procedure?.name||'';item.officialNameEn=procedure?.nameEn||'';item.category=treatmentPhase(procedure?.category);item.matchState=procedure?'manual':'unmatched';item.userEdited=true;render()});
$('previewList').addEventListener('click',event=>{const card=event.target.closest('[data-index]');if(!card)return;const index=Number(card.dataset.index),item=items[index];if(event.target.closest('[data-delete]')){if(item.sourceKey)deletedSourceKeys.add(item.sourceKey);items.splice(index,1)}else if(event.target.closest('[data-duplicate]'))items.splice(index+1,0,{...item,sourceKey:'',manualId:crypto.randomUUID(),manualOrder:++manualOrder,afterSourceKey:item.sourceKey||item.afterSourceKey||'',originalInput:`${item.originalInput} (duplicate)`,userEdited:true,matchState:item.procedureId?'manual':'unmatched'});else return;render()});
$('copySubmittedClinicalNote').addEventListener('click',async()=>{const button=$('copySubmittedClinicalNote');await navigator.clipboard.writeText($('submittedClinicalNote').value);const previous=button.textContent;button.textContent=language==='ar'?'تم النسخ':'COPIED';setTimeout(()=>{button.textContent=previous},1200)});
$('fileSummaryBtn').addEventListener('click',()=>{updateFileSummary();const panel=$('fileSummaryPanel'),open=panel.hidden;panel.hidden=!open;$('fileSummaryBtn').setAttribute('aria-expanded',String(open))});
$('closeFileSummary').addEventListener('click',()=>{$('fileSummaryPanel').hidden=true;$('fileSummaryBtn').setAttribute('aria-expanded','false')});
$('copyFileSummary').addEventListener('click',async()=>{updateFileSummary();const button=$('copyFileSummary');await navigator.clipboard.writeText($('fileSummaryText').value);const previous=button.textContent;button.textContent=language==='ar'?'تم النسخ':'COPIED';setTimeout(()=>{button.textContent=previous},1200)});
$('patientName').addEventListener('input',updateFileSummary);$('patientAge').addEventListener('input',updateFileSummary);$('patientMrn').addEventListener('input',updateFileSummary);
$('confirmExamination').addEventListener('change',updateFileSummary);$('confirmDiscussion').addEventListener('change',updateFileSummary);
$('newPlan').addEventListener('click',()=>{lookupGeneration+=1;patient=null;patientLookupKey='';items=[];selectedTooth='';deletedSourceKeys=new Set();manualOrder=0;idempotencyKey=crypto.randomUUID();$('patientMrn').value='';$('patientName').value='';$('patientAge').value='';$('quickEntry').value='';$('confirmExamination').checked=false;$('confirmDiscussion').checked=false;$('openSubmittedPlan').hidden=true;$('successCard').hidden=true;$('quickPlanForm').hidden=false;setLookup(t('mrnHelp'));renderToothPicker();render()});

async function startQuickPlanPage(){
  const receiptMode=Boolean(new URLSearchParams(location.search).get('sentPlan'));
  if(receiptMode){$('quickPlanForm').hidden=true;$('fileSummaryBtn').hidden=true}
  $('retryReceipt').disabled=true;
  try{await loadClinics()}
  catch(error){
    if(receiptMode){$('quickPlanForm').hidden=true;$('receiptRestoreError').hidden=false;$('receiptRestoreMessage').textContent=language==='ar'?'تعذر تحميل الخطة المحفوظة. تحقق من الاتصال وتسجيل الدخول ثم أعد المحاولة؛ لا يلزم إرسال خطة جديدة.':'Could not load the saved plan. Check your connection and sign-in, then retry. Do not submit a new plan.'}
    else if(error.status!==401){setError(error.message);$('quickPlanForm').hidden=false}
  }finally{$('retryReceipt').disabled=false}
}
applyLanguage();startQuickPlanPage();
