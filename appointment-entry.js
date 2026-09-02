import {
  addMinutes,
  appointmentConflicts,
  buildAppointment,
  nextAvailableStart,
  normalizePatient,
  samePatient,
  validatePatient
} from './appointment-entry-core.js';

const $=id=>document.getElementById(id);
const API={auth:'/api/auth?action=session',clinics:'/api/clinics',lookup:'/api/patient-lookup',patients:'/api/patients',profile:'/api/patient-profile',state:'/api/state'};
const HANDOFF_KEY='bestcare_appointment_entry_draft_v1';
const SIGNAL_KEY='bestcare_sync_signal_v1';
const CLIENT_ID=globalThis.crypto?.randomUUID?.()||`appointment-entry-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const params=new URLSearchParams(location.search);
const lang=localStorage.getItem('bestcare_lang')==='en'?'en':'ar';
const copy={
  ar:{
    workspace:'مساحة الإدارة',title:'إضافة المواعيد',subtitle:'إضافة سريعة من قاعدة المرضى إلى قائمة العيادة',requests:'طلبات المواعيد',admin:'العودة للإدارة',contextKicker:'حدد مسار الموعد',contextTitle:'التاريخ والعيادة',date:'التاريخ',clinic:'العيادة والطبيب',today:'اليوم',tomorrow:'غدًا',finderKicker:'الخطوة 1',finderTitle:'ابحث عن المريض',finderHelp:'اكتب الاسم أو رقم الملف أو الجوال أو الهوية.',searchPlaceholder:'ابدأ بالاسم أو رقم الملف…',searchHint:'أدخل حرفين من الاسم أو ثلاثة أرقام على الأقل.',searching:'جارٍ البحث في قاعدة المرضى…',noResults:'لا توجد نتيجة مطابقة. راجع الاسم أو رقم الملف.',select:'اختيار',complete:'إكمال البيانات',ready:'بيانات مكتملة',incomplete:'تحتاج تصحيح',file:'ملف',phone:'جوال',id:'هوية',correctionKicker:'تصحيح قبل الإضافة',correctionTitle:'أكمل بيانات المريض',correctionHelp:'لن يُنشأ موعد حتى تكتمل البيانات، وسيُحدّث السجل المركزي نفسه.',fullName:'الاسم الكامل',fileNumber:'رقم الملف',mobile:'الجوال',national:'الهوية',saveCorrection:'حفظ التصحيح والمتابعة',selected:'المريض المحدد',change:'تغيير',composerKicker:'الخطوة 2',composerTitle:'حدد الوقت والإجراء',start:'وقت البداية',duration:'مدة الموعد',minute:'دقيقة',end:'وقت النهاية',procedure:'الإجراء',procedurePlaceholder:'مثال: كشف جديد',conflictTitle:'تنبيه تداخل في الوقت',allowOverlap:'راجعت التعارض وأرغب بالإضافة رغم ذلك',addTitle:'إضافة إلى قائمة المواعيد',editTitle:'حفظ تعديل الموعد',saveHelp:'حفظ فوري مع المزامنة بين الأجهزة',boardKicker:'قائمة التاريخ المحدد',boardTitle:'المواعيد المحفوظة',boardHelp:'تظهر أحدث البيانات من نفس قائمة الداشبورد.',count:'موعد',available:'أقرب وقت شاغر',loading:'جارٍ تحميل قائمة اليوم…',synced:'القائمة محدثة ومتزامنة',loadFailed:'تعذر تحميل القائمة. تحقق من الاتصال وأعد المحاولة.',empty:'لا توجد مواعيد في هذا التاريخ.',edit:'تعديل',remove:'حذف',undo:'تراجع',recent:'آخر الإضافات:',duplicate:'المريض موجود بالفعل في هذه العيادة والتاريخ. تم فتح الموعد الموجود.',overlap:'يتداخل هذا الموعد مع',overlapConfirm:'أكد مراجعة التداخل قبل الحفظ.',incompleteError:'أكمل الاسم الكامل ورقم الملف والجوال الصحيح.',invalidAppointment:'أدخل وقت بداية ومدة صحيحة.',saving:'جارٍ الحفظ والمزامنة…',saved:'تمت إضافة الموعد ومزامنته.',updated:'تم تعديل الموعد ومزامنته.',deleted:'تم حذف الموعد من قائمة اليوم.',deleteConfirm:'هل تريد حذف هذا الموعد من قائمة اليوم؟',conflictChanged:'تغير هذا الموعد على جهاز آخر. تم تحديث القائمة دون الكتابة على التعديل الجديد.',correctionSaved:'تم تصحيح سجل المريض المركزي.',correctionFailed:'تعذر حفظ التصحيح.',saveFailed:'تعذر حفظ الموعد. لم تفقد القائمة الحالية أي بيانات.',session:'انتهت الجلسة؛ سجّل الدخول من شاشة الإدارة.',active:'قيد العلاج',waiting:'بانتظار الموعد',done:'مكتمل',cancel:'ملغى',left:'غادر',late:'متأخر',procedureDefault:'موعد مريض',undoFailed:'تعذر التراجع لأن السجل تغير على جهاز آخر.',noName:'مريض دون اسم'
  },
  en:{
    workspace:'Administration workspace',title:'Add appointments',subtitle:'Quickly add a patient from the central database to a clinic list',requests:'Appointment requests',admin:'Back to administration',contextKicker:'Appointment destination',contextTitle:'Date and clinic',date:'Date',clinic:'Clinic and doctor',today:'Today',tomorrow:'Tomorrow',finderKicker:'Step 1',finderTitle:'Find a patient',finderHelp:'Search by name, file number, mobile, or national ID.',searchPlaceholder:'Start with a name or file number…',searchHint:'Enter at least two letters or three digits.',searching:'Searching the patient database…',noResults:'No matching patient. Check the name or file number.',select:'Select',complete:'Complete data',ready:'Complete record',incomplete:'Needs correction',file:'File',phone:'Mobile',id:'ID',correctionKicker:'Correct before adding',correctionTitle:'Complete patient details',correctionHelp:'No appointment is created until required fields are complete. The same central record will be updated.',fullName:'Full name',fileNumber:'File number',mobile:'Mobile',national:'National ID',saveCorrection:'Save correction and continue',selected:'Selected patient',change:'Change',composerKicker:'Step 2',composerTitle:'Choose time and procedure',start:'Start time',duration:'Duration',minute:'minutes',end:'End time',procedure:'Procedure',procedurePlaceholder:'Example: New examination',conflictTitle:'Time overlap',allowOverlap:'I reviewed the conflict and still want to add this appointment',addTitle:'Add to appointment list',editTitle:'Save appointment changes',saveHelp:'Saved immediately with multi-device synchronization',boardKicker:'Selected date list',boardTitle:'Saved appointments',boardHelp:'This is the same live list used by the dashboard.',count:'appointments',available:'Next available time',loading:'Loading the day list…',synced:'The list is current and synchronized',loadFailed:'Could not load the list. Check the connection and try again.',empty:'No appointments on this date.',edit:'Edit',remove:'Delete',undo:'Undo',recent:'Recent additions:',duplicate:'This patient is already on this clinic and date. The existing appointment was opened.',overlap:'This appointment overlaps',overlapConfirm:'Confirm that you reviewed the overlap before saving.',incompleteError:'Enter a full name, valid file number, and valid mobile.',invalidAppointment:'Enter a valid start time and duration.',saving:'Saving and synchronizing…',saved:'Appointment added and synchronized.',updated:'Appointment updated and synchronized.',deleted:'Appointment removed from the day list.',deleteConfirm:'Delete this appointment from the day list?',conflictChanged:'This appointment changed on another device. The latest list was loaded without overwriting it.',correctionSaved:'The central patient record was corrected.',correctionFailed:'Could not save the correction.',saveFailed:'Could not save the appointment. No current list data was lost.',session:'Your session ended. Sign in from the administration screen.',active:'In treatment',waiting:'Waiting',done:'Completed',cancel:'Cancelled',left:'Left',late:'Late',procedureDefault:'Patient appointment',undoFailed:'Undo is unavailable because the record changed on another device.',noName:'Unnamed patient'
  }
}[lang];

let clinics=[];
let dayState={patients:[],notes:'',updateAlert:{active:false,message:'',createdAt:0},revision:0,updatedAt:0};
let selectedPatient=null;
let editing=null;
let duration=30;
let searchTimer=0;
let loadSequence=0;
let searchSequence=0;
let recent=[];
let syncChannel=null;

const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const riyadhDate=(offset=0)=>{const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(Date.now()+offset*86400000)),read=type=>parts.find(item=>item.type===type)?.value||'';return`${read('year')}-${read('month')}-${read('day')}`};
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
const activeClinic=()=>clinics.find(item=>item.id===$('entryClinic').value)||clinics[0]||{id:'clinic-1',name:'العيادة 1',doctorName:'',roomNumber:'1'};
const statusLabel=status=>copy[{active:'active',waiting:'waiting',done:'done',cancel:'cancel',left:'left'}[status]||'waiting'];
const patientStamp=patient=>Number(patient?.adminUpdatedAt||patient?.recordUpdatedAt||patient?.statusUpdatedAt||patient?.addedAt||0);

async function request(url,options={},timeout=15000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetch(url,{...options,signal:controller.signal,cache:'no-store',headers:{accept:'application/json',...(options.headers||{})}});
    const data=await response.json().catch(()=>({}));
    return{response,data};
  }finally{clearTimeout(timer)}
}
function setSync(state,message){const node=$('syncState');node.className=`entry-sync ${state||''}`.trim();node.querySelector('span').textContent=message}
function errorMessage(error,fallback){if(error?.name==='AbortError')return lang==='en'?'The request timed out. Try again.':'انتهت مهلة الاتصال. أعد المحاولة.';return String(error?.message||fallback)}
function toast(title,message=''){
  const node=document.createElement('div');node.className='entry-toast';
  const strong=document.createElement('strong'),span=document.createElement('span');strong.textContent=title;span.textContent=message;node.append(strong,span);$('toastWrap').append(node);
  setTimeout(()=>node.remove(),4200);
}
function showError(id,message=''){const node=$(id);node.hidden=!message;node.textContent=message}
function appointmentUrl(){const query=new URLSearchParams({date:$('entryDate').value,clinic:$('entryClinic').value});return`./?view=admin&${query.toString()}`}

function applyLanguage(){
  document.documentElement.lang=lang;document.documentElement.dir=lang==='en'?'ltr':'rtl';document.title=`${copy.title} | Best Care`;
  const texts={pageKicker:'workspace',pageTitle:'title',pageSubtitle:'subtitle',requestsLink:'requests',adminLink:'admin',contextKicker:'contextKicker',contextTitle:'contextTitle',dateLabel:'date',clinicLabel:'clinic',todayBtn:'today',tomorrowBtn:'tomorrow',finderKicker:'finderKicker',finderTitle:'finderTitle',finderHelp:'finderHelp',correctionKicker:'correctionKicker',correctionTitle:'correctionTitle',correctionHelp:'correctionHelp',selectedLabel:'selected',changePatient:'change',composerKicker:'composerKicker',composerTitle:'composerTitle',startLabel:'start',durationLabel:'duration',minuteLabel:'minute',endLabel:'end',procedureLabel:'procedure',conflictTitle:'conflictTitle',allowOverlapLabel:'allowOverlap',saveAppointmentHelp:'saveHelp',boardKicker:'boardKicker',boardTitle:'boardTitle',boardHelp:'boardHelp',countLabel:'count',availableLabel:'available'};
  Object.entries(texts).forEach(([id,key])=>{if($(id))$(id).textContent=copy[key]});
  $('patientSearch').placeholder=copy.searchPlaceholder;$('procedure').placeholder=copy.procedurePlaceholder;
  $('clearSearch').setAttribute('aria-label',lang==='en'?'Clear search':'مسح البحث');$('refreshBtn').title=lang==='en'?'Refresh':'تحديث';
  const labels=$('patientCorrection').querySelectorAll('.correction-grid label span');[copy.fullName,copy.fileNumber,copy.mobile,copy.national].forEach((value,index)=>{labels[index].textContent=value});
  $('saveCorrection').textContent=copy.saveCorrection;$('saveAppointmentTitle').textContent=copy.addTitle;
  $('adminLink').href=appointmentUrl();
  if(lang==='en')$('procedureOptions').innerHTML='<option value="New examination"><option value="Follow-up"><option value="Filling"><option value="Root canal treatment"><option value="Prosthodontics"><option value="Cleaning">';
}

async function ensureSession(){
  const {response,data}=await request(API.auth);
  if(!response.ok||!data.authenticated||data.user?.role!=='admin'){
    sessionStorage.setItem(HANDOFF_KEY,JSON.stringify({date:$('entryDate').value||riyadhDate(),clinicId:$('entryClinic').value||params.get('clinic')||'clinic-1',at:Date.now()}));
    location.replace(`./?view=admin&date=${encodeURIComponent($('entryDate').value||riyadhDate())}`);
    throw new Error(copy.session);
  }
}
async function loadClinics(){
  const {response,data}=await request(API.clinics);
  if(response.status===401)throw new Error(copy.session);
  if(!response.ok)throw new Error(data.error||copy.loadFailed);
  clinics=(Array.isArray(data.clinics)?data.clinics:[]).filter(item=>item?.active);
  if(!clinics.length)clinics=[{id:'clinic-1',name:'العيادة 1',doctorName:'',roomNumber:'1',active:true}];
  $('entryClinic').innerHTML=clinics.map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(`${item.name||`${lang==='en'?'Clinic':'العيادة'} ${item.roomNumber||''}`}${item.doctorName?` · ${lang==='en'?'Dr.':'د.'} ${item.doctorName}`:''}`)}</option>`).join('');
  const requested=params.get('clinic');$('entryClinic').value=clinics.some(item=>item.id===requested)?requested:clinics[0].id;
}
async function fetchDay(date=$('entryDate').value,clinicId=$('entryClinic').value){
  const query=new URLSearchParams({date,clinic:clinicId});
  const {response,data}=await request(`${API.state}?${query}`);
  if(response.status===401)throw new Error(copy.session);
  if(!response.ok)throw new Error(data.error||copy.loadFailed);
  return{patients:Array.isArray(data.patients)?data.patients:[],notes:String(data.notes||''),updateAlert:data.updateAlert||{active:false,message:'',createdAt:0},revision:Number(data.revision||0),updatedAt:Number(data.updatedAt||0),clinic:data.clinic||activeClinic()};
}
async function loadDay(){
  const sequence=++loadSequence;setSync('loading',copy.loading);$('dayList').innerHTML=`<div class="empty-state">${escapeHtml(copy.loading)}</div>`;
  try{
    const latest=await fetchDay();if(sequence!==loadSequence)return;dayState=latest;renderDay();setSync('',copy.synced);suggestStart();
  }catch(error){if(sequence!==loadSequence)return;setSync('error',errorMessage(error,copy.loadFailed));$('dayList').innerHTML=`<div class="empty-state">${escapeHtml(copy.loadFailed)}</div>`}
}
function renderDay(){
  const patients=[...dayState.patients].sort((left,right)=>String(left.start||'99:99').localeCompare(String(right.start||'99:99')));
  $('appointmentCount').textContent=patients.length;$('availableTime').textContent=nextAvailableStart(patients,{minimum:riyadhDate()===$('entryDate').value?roundedNow():'14:00',duration});
  $('adminLink').href=appointmentUrl();
  if(!patients.length){$('dayList').innerHTML=`<div class="empty-state">${escapeHtml(copy.empty)}</div>`;renderRecent();return}
  $('dayList').innerHTML=patients.map(patient=>{
    const start=String(patient.start||'--:--'),end=String(patient.end||'--:--'),minutes=Math.max(0,(Number(end.slice(0,2))*60+Number(end.slice(3,5)))-(Number(start.slice(0,2))*60+Number(start.slice(3,5))));
    return`<article class="day-row ${escapeHtml(patient.status||'waiting')}" data-row-id="${escapeHtml(patient.id)}"><div class="day-time">${escapeHtml(start)}<small>– ${escapeHtml(end)}</small></div><div class="day-patient"><strong>${escapeHtml(patient.name||copy.noName)}</strong><small>${escapeHtml(copy.file)} ${escapeHtml(patient.file||'—')} · ${escapeHtml(patient.phone||'—')}</small></div><div class="day-duration">${minutes||'—'} ${escapeHtml(copy.minute)}</div><div class="day-procedure"><strong>${escapeHtml(patient.procedure||copy.procedureDefault)}</strong><small>${escapeHtml(statusLabel(patient.status))}</small></div><div class="day-actions"><button type="button" data-edit-id="${escapeHtml(patient.id)}">${escapeHtml(copy.edit)}</button><button class="danger" type="button" data-delete-id="${escapeHtml(patient.id)}">${escapeHtml(copy.remove)}</button></div></article>`;
  }).join('');renderRecent();
}
function renderRecent(){
  const relevant=recent.filter(item=>item.date===$('entryDate').value&&item.clinicId===$('entryClinic').value).slice(-3).reverse();
  $('recentActions').hidden=!relevant.length;
  $('recentActions').innerHTML=relevant.length?`<span>${escapeHtml(copy.recent)}</span>${relevant.map(item=>`<button type="button" data-undo-id="${escapeHtml(item.id)}">${escapeHtml(copy.undo)}: ${escapeHtml(item.name)}</button>`).join('')}`:'';
}
function roundedNow(){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Riyadh',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const hour=Number(parts.find(item=>item.type==='hour')?.value||14),minute=Number(parts.find(item=>item.type==='minute')?.value||0),total=Math.min(23*60+45,Math.ceil((hour*60+minute)/15)*15);
  return`${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}
function suggestStart(){if(editing)return;const minimum=$('entryDate').value===riyadhDate()?roundedNow():'14:00';$('startTime').value=nextAvailableStart(dayState.patients,{minimum,duration});updateEnd()}
function updateDateButtons(){$('todayBtn').classList.toggle('active',$('entryDate').value===riyadhDate());$('tomorrowBtn').classList.toggle('active',$('entryDate').value===riyadhDate(1))}
function updateEnd(){$('endTime').textContent=addMinutes($('startTime').value,duration)||'—';renderConflict()}
function currentCandidate(){return{start:$('startTime').value,end:addMinutes($('startTime').value,duration)}}
function currentConflicts(){return appointmentConflicts(dayState.patients,currentCandidate(),{excludeId:editing?.id||''})}
function renderConflict(){
  const conflicts=currentConflicts(),box=$('conflictBox');box.hidden=!conflicts.length;$('allowOverlap').checked=false;
  if(conflicts.length)$('conflictText').textContent=`${copy.overlap}: ${conflicts.map(item=>`${item.name} (${item.start}–${item.end})`).join('، ')}`;
}

function resultPatient(match){return normalizePatient({...match?.patient,id:match?.patient?.id||''})}
async function searchPatients(){
  const value=$('patientSearch').value.trim(),digits=value.replace(/\D/g,'');
  if(value.length<2&&digits.length<3){$('patientResults').innerHTML='';$('searchState').textContent=copy.searchHint;return}
  const sequence=++searchSequence;$('searchState').textContent=copy.searching;
  try{
    const query=new URLSearchParams({type:'query',value,clinic:'all'}),{response,data}=await request(`${API.lookup}?${query}`);
    if(sequence!==searchSequence)return;if(response.status===401)throw new Error(copy.session);if(!response.ok)throw new Error(data.error||copy.noResults);
    const matches=Array.isArray(data.matches)?data.matches:[];$('searchState').textContent=matches.length?`${matches.length} ${copy.count}`:copy.noResults;
    $('patientResults').innerHTML=matches.map((match,index)=>{
      const patient=resultPatient(match),quality=validatePatient(patient),identity=[patient.file&&`${copy.file} ${patient.file}`,patient.phone&&`${copy.phone} ${patient.phone}`,patient.nationalId&&`${copy.id} ${patient.nationalId}`].filter(Boolean).join(' · ');
      return`<article class="patient-result ${quality.complete?'complete':'incomplete'}"><div><strong>${escapeHtml(patient.name||copy.noName)}</strong><small>${escapeHtml(identity||'—')}</small><span class="quality">${escapeHtml(quality.complete?copy.ready:copy.incomplete)}</span></div><button type="button" data-result-index="${index}">${escapeHtml(quality.complete?copy.select:copy.complete)}</button></article>`;
    }).join('');$('patientResults')._matches=matches;
  }catch(error){if(sequence!==searchSequence)return;$('searchState').textContent=errorMessage(error,copy.noResults);$('patientResults').innerHTML=''}
}
function selectPatient(value){
  const checked=validatePatient(value);selectedPatient=checked.patient;
  $('patientCorrection').hidden=checked.complete;$('appointmentComposer').hidden=!checked.complete;
  if(!checked.complete){$('correctName').value=checked.patient.name;$('correctFile').value=checked.patient.file;$('correctPhone').value=checked.patient.phone;$('correctNational').value=checked.patient.nationalId;showError('correctionError',copy.incompleteError);$('patientCorrection').scrollIntoView({behavior:'smooth',block:'center'});return}
  showError('correctionError');$('selectedName').textContent=checked.patient.name;$('selectedIdentity').textContent=`${copy.file} ${checked.patient.file} · ${checked.patient.phone}${checked.patient.nationalId?` · ${copy.id} ${checked.patient.nationalId}`:''}`;
  $('appointmentComposer').scrollIntoView({behavior:'smooth',block:'center'});suggestStart();
}
async function saveCorrection(){
  const checked=validatePatient({id:selectedPatient?.id,name:$('correctName').value,file:$('correctFile').value,phone:$('correctPhone').value,nationalId:$('correctNational').value});
  if(!checked.complete){showError('correctionError',copy.incompleteError);return}
  const button=$('saveCorrection');button.disabled=true;
  try{
    const clinicId=$('entryClinic').value,original=normalizePatient(selectedPatient),lookup=original.file?{type:'file',value:original.file}:original.nationalId?{type:'national',value:original.nationalId}:original.phone?{type:'phone',value:original.phone}:null;
    const options=lookup
      ?{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({lookup,clinic:'all',correctionId:globalThis.crypto?.randomUUID?.()||`correction-${Date.now()}`,patient:checked.patient})}
      :{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({clinicId,patients:[{id:checked.patient.id,fullName:checked.patient.name,fileNo:checked.patient.file,mobile:checked.patient.phone,nationalId:checked.patient.nationalId}]})};
    const {response,data}=await request(lookup?API.profile:API.patients,options,45000);
    if(!response.ok)throw new Error(data.error||copy.correctionFailed);toast(copy.correctionSaved);selectPatient(checked.patient);
  }catch(error){showError('correctionError',errorMessage(error,copy.correctionFailed))}finally{button.disabled=false}
}

function broadcast(revision){
  const message={source:CLIENT_ID,clinicId:$('entryClinic').value,date:$('entryDate').value,revision:Number(revision||0),at:Date.now()};
  try{syncChannel?.postMessage(message)}catch{}try{localStorage.setItem(SIGNAL_KEY,JSON.stringify(message))}catch{}
}
async function mutateDay(mutator,{verify}={}){
  for(let attempt=0;attempt<3;attempt+=1){
    const latest=await fetchDay();if(verify&&!verify(latest))return{conflicted:true,state:latest};
    const outcome=mutator(latest);if(outcome?.done)return{state:latest,...outcome};
    const clinic=activeClinic(),query=new URLSearchParams({date:$('entryDate').value,clinic:clinic.id}),payload={date:$('entryDate').value,clinic:{id:clinic.id,name:clinic.name||'',doctorName:clinic.doctorName||'',roomNumber:clinic.roomNumber||''},patients:outcome.patients,notes:latest.notes,updateAlert:latest.updateAlert,clientId:CLIENT_ID,expectedRevision:latest.revision};
    let response,data;
    try{({response,data}=await request(`${API.state}?${query}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(payload)},20000))}catch(error){if(attempt<2)continue;throw error}
    if(response.status===409)continue;if(response.status===401)throw new Error(copy.session);if(!response.ok)throw new Error(data.error||copy.saveFailed);
    const state={patients:Array.isArray(data.patients)?data.patients:outcome.patients,notes:String(data.notes??latest.notes),updateAlert:data.updateAlert||latest.updateAlert,revision:Number(data.revision||latest.revision+1),updatedAt:Number(data.updatedAt||Date.now()),clinic:data.clinic||clinic};broadcast(state.revision);return{state,...outcome};
  }
  throw new Error(lang==='en'?'The list changed repeatedly on another device. Refresh and retry.':'تغيرت القائمة عدة مرات من جهاز آخر. حدّث ثم أعد المحاولة.');
}
async function saveAppointment(){
  showError('composerError');const checked=validatePatient(selectedPatient),start=$('startTime').value,end=addMinutes(start,duration),procedure=$('procedure').value.trim()||copy.procedureDefault;
  if(!checked.complete){showError('composerError',copy.incompleteError);return}if(!end){showError('composerError',copy.invalidAppointment);return}
  const conflicts=currentConflicts();if(conflicts.length&&!$('allowOverlap').checked){showError('composerError',copy.overlapConfirm);return}
  const button=$('saveAppointment');button.disabled=true;setSync('loading',copy.saving);
  const fixedId=editing?.id||globalThis.crypto?.randomUUID?.()||`patient-${Date.now()}`,baseline=editing?.stamp||0,isEdit=Boolean(editing);
  try{
    const result=await mutateDay(latest=>{
      const savedById=latest.patients.find(patient=>String(patient.id)===String(fixedId));
      if(!isEdit&&savedById)return{done:true,alreadySaved:true,appointment:savedById};
      const duplicate=latest.patients.find(patient=>samePatient(patient,checked.patient)&&String(patient.id)!==String(fixedId));
      if(duplicate)return{done:true,duplicate};
      const current=isEdit?latest.patients.find(patient=>String(patient.id)===String(fixedId)):null;
      if(isEdit&&!current)return{done:true,missing:true};
      if(isEdit&&patientStamp(current)!==baseline)return{done:true,conflicted:true};
      const serverConflicts=appointmentConflicts(latest.patients,{start,end},{excludeId:fixedId});
      if(serverConflicts.length&&!$('allowOverlap').checked)return{done:true,overlap:true,serverConflicts};
      const built=buildAppointment({patient:checked.patient,start,duration,procedure,status:current?.status||'waiting',id:fixedId,now:Date.now()});
      const appointment=current?{...current,...built,id:current.id,addedAt:Number(current.addedAt||built.addedAt),adminUpdatedAt:built.adminUpdatedAt}:built;
      return{patients:current?latest.patients.map(item=>String(item.id)===String(fixedId)?appointment:item):[...latest.patients,appointment],appointment};
    });
    dayState=result.state;
    if(result.duplicate){renderDay();editAppointment(result.duplicate.id);toast(copy.duplicate);return}
    if(result.conflicted||result.missing){renderDay();resetComposer();toast(copy.conflictChanged);return}
    if(result.overlap){renderDay();renderConflict();showError('composerError',copy.overlapConfirm);return}
    if(!isEdit&&!recent.some(item=>item.id===fixedId))recent.push({id:fixedId,name:checked.patient.name,date:$('entryDate').value,clinicId:$('entryClinic').value,stamp:patientStamp(result.appointment)});
    renderDay();setSync('',copy.synced);toast(isEdit?copy.updated:copy.saved);resetComposer();
  }catch(error){setSync('error',copy.saveFailed);showError('composerError',errorMessage(error,copy.saveFailed))}finally{button.disabled=false}
}
function editAppointment(id){
  const patient=dayState.patients.find(item=>String(item.id)===String(id));if(!patient)return;
  selectedPatient=normalizePatient(patient);editing={id:patient.id,stamp:patientStamp(patient)};$('patientCorrection').hidden=true;$('appointmentComposer').hidden=false;
  $('selectedName').textContent=patient.name;$('selectedIdentity').textContent=`${copy.file} ${patient.file} · ${patient.phone||'—'}`;$('startTime').value=patient.start||'';
  const computed=Math.max(5,Math.round(((Number(String(patient.end||'').slice(0,2))*60+Number(String(patient.end||'').slice(3,5)))-(Number(String(patient.start||'').slice(0,2))*60+Number(String(patient.start||'').slice(3,5))))/5)*5);setDuration(computed||30);$('procedure').value=patient.procedure||'';$('saveAppointmentTitle').textContent=copy.editTitle;updateEnd();$('appointmentComposer').scrollIntoView({behavior:'smooth',block:'center'});
}
function resetComposer(){selectedPatient=null;editing=null;$('appointmentComposer').hidden=true;$('patientCorrection').hidden=true;$('procedure').value='';$('saveAppointmentTitle').textContent=copy.addTitle;showError('composerError');$('patientSearch').value='';$('patientResults').innerHTML='';$('searchState').textContent=copy.searchHint;$('patientSearch').focus()}
async function deleteAppointment(id,{undo=false}={}){
  const current=dayState.patients.find(item=>String(item.id)===String(id));if(!current)return;if(!undo&&!confirm(copy.deleteConfirm))return;
  const baseline=patientStamp(current);
  try{
    const result=await mutateDay(latest=>{const target=latest.patients.find(item=>String(item.id)===String(id));if(!target)return{done:true,alreadyDeleted:true};if(patientStamp(target)!==baseline)return{done:true,conflicted:true};return{patients:latest.patients.filter(item=>String(item.id)!==String(id))}});
    dayState=result.state;if(result.conflicted){renderDay();toast(copy.undoFailed);return}recent=recent.filter(item=>item.id!==id);renderDay();toast(copy.deleted);
  }catch(error){toast(copy.saveFailed,errorMessage(error,copy.saveFailed))}
}
function setDuration(value){duration=Math.max(5,Math.min(240,Number(value)||30));document.querySelectorAll('[data-duration]').forEach(button=>button.classList.toggle('active',Number(button.dataset.duration)===duration));$('customDuration').value=[15,30,45,60].includes(duration)?'':duration;updateEnd()}
function readHandoff(){
  try{const raw=sessionStorage.getItem(HANDOFF_KEY);sessionStorage.removeItem(HANDOFF_KEY);if(!raw)return null;const value=JSON.parse(raw);return Date.now()-Number(value.at||0)<15*60*1000?value:null}catch{return null}
}
function bind(){
  $('todayBtn').addEventListener('click',()=>{$('entryDate').value=riyadhDate();updateDateButtons();loadDay()});$('tomorrowBtn').addEventListener('click',()=>{$('entryDate').value=riyadhDate(1);updateDateButtons();loadDay()});
  $('entryDate').addEventListener('change',()=>{if(!validDate($('entryDate').value))$('entryDate').value=riyadhDate();updateDateButtons();resetComposer();loadDay()});$('entryClinic').addEventListener('change',()=>{resetComposer();loadDay()});$('refreshBtn').addEventListener('click',loadDay);
  $('patientSearch').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(searchPatients,260)});$('clearSearch').addEventListener('click',resetComposer);
  $('patientResults').addEventListener('click',event=>{const button=event.target.closest('[data-result-index]');if(!button)return;const match=$('patientResults')._matches?.[Number(button.dataset.resultIndex)];if(match)selectPatient(resultPatient(match))});
  $('saveCorrection').addEventListener('click',saveCorrection);$('changePatient').addEventListener('click',resetComposer);$('startTime').addEventListener('input',updateEnd);$('procedure').addEventListener('input',()=>showError('composerError'));
  document.querySelector('.duration-options').addEventListener('click',event=>{const button=event.target.closest('[data-duration]');if(button)setDuration(button.dataset.duration)});$('customDuration').addEventListener('input',()=>setDuration($('customDuration').value));$('saveAppointment').addEventListener('click',saveAppointment);
  $('dayList').addEventListener('click',event=>{const edit=event.target.closest('[data-edit-id]'),remove=event.target.closest('[data-delete-id]');if(edit)editAppointment(edit.dataset.editId);if(remove)deleteAppointment(remove.dataset.deleteId)});
  $('recentActions').addEventListener('click',event=>{const button=event.target.closest('[data-undo-id]');if(button)deleteAppointment(button.dataset.undoId,{undo:true})});
  window.addEventListener('storage',event=>{if(event.key!==SIGNAL_KEY||!event.newValue)return;try{const signal=JSON.parse(event.newValue);if(signal.source!==CLIENT_ID&&signal.clinicId===$('entryClinic').value&&signal.date===$('entryDate').value)loadDay()}catch{}});
  if('BroadcastChannel'in window){syncChannel=new BroadcastChannel('bestcare-dashboard-sync-v1');syncChannel.addEventListener('message',event=>{const signal=event.data;if(signal?.source!==CLIENT_ID&&signal?.clinicId===$('entryClinic').value&&signal?.date===$('entryDate').value)loadDay()})}
}
async function init(){
  applyLanguage();const handoff=readHandoff();$('entryDate').value=validDate(handoff?.date)?handoff.date:(validDate(params.get('date'))?params.get('date'):riyadhDate());updateDateButtons();
  try{await ensureSession();await loadClinics();if(handoff?.clinicId&&clinics.some(item=>item.id===handoff.clinicId))$('entryClinic').value=handoff.clinicId;applyLanguage();bind();await loadDay();if(handoff?.patient)selectPatient(handoff.patient)}catch(error){setSync('error',errorMessage(error,copy.loadFailed))}
}

init();
