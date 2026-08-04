(()=>{
'use strict';
const $=id=>document.getElementById(id);
const THEME_KEY='bestcare_dashboard_theme_v1';
const ADMIN_LAYOUT_KEY='bestcare_admin_layout_v1';
const ADMIN_SIDEBAR_COLLAPSED_KEY='bestcare_admin_sidebar_collapsed_v1';
function preferredTheme(){try{const stored=localStorage.getItem(THEME_KEY);if(['light','dark'].includes(stored))return stored}catch{}return matchMedia?.('(prefers-color-scheme: dark)')?.matches?'dark':'light'}
let currentTheme=preferredTheme();
let adminLayoutMode=(()=>{try{return localStorage.getItem(ADMIN_LAYOUT_KEY)==='modern'?'modern':'classic'}catch{return'classic'}})();
let modernSidebarCollapsed=(()=>{try{const stored=localStorage.getItem(ADMIN_SIDEBAR_COLLAPSED_KEY);return stored===null?Boolean(matchMedia?.('(max-width: 1400px)')?.matches):stored==='1'}catch{return false}})();
function applyTheme(theme,{save=false}={}){
  currentTheme=theme==='dark'?'dark':'light';document.documentElement.dataset.theme=currentTheme;document.body?.classList.toggle('dark-theme',currentTheme==='dark');
  const button=$('themeToggleBtn'),icon=$('themeToggleIcon');if(icon)icon.textContent=currentTheme==='dark'?'☀':'☾';if(button){const label=currentTheme==='dark'?'تفعيل الوضع الفاتح':'تفعيل الوضع الداكن';button.setAttribute('aria-label',label);button.title=label;button.setAttribute('aria-pressed',String(currentTheme==='dark'))}
  if(save)try{localStorage.setItem(THEME_KEY,currentTheme)}catch{}
}
function applyModernSidebarCollapsed(collapsed,{save=false}={}){
  modernSidebarCollapsed=Boolean(collapsed);
  document.body.classList.toggle('admin-sidebar-collapsed',modernSidebarCollapsed);
  const button=$('modernSidebarCollapseBtn');
  if(button){
    const isArabic=lang!=='en';
    button.textContent=modernSidebarCollapsed?'‹':'›';
    button.setAttribute('aria-expanded',String(!modernSidebarCollapsed));
    const label=modernSidebarCollapsed?(isArabic?'فتح القائمة':'Expand menu'):(isArabic?'طي القائمة إلى اليمين':'Collapse menu to the right');
    button.setAttribute('aria-label',label);button.title=label;
  }
  if(save)try{localStorage.setItem(ADMIN_SIDEBAR_COLLAPSED_KEY,modernSidebarCollapsed?'1':'0')}catch{}
}
function applyAdminLayout(mode,{save=false}={}){
  adminLayoutMode=mode==='modern'?'modern':'classic';
  const active=VIEW_MODE==='admin'&&adminLayoutMode==='modern';
  document.body.classList.toggle('admin-layout-modern',active);
  const sidebar=$('modernAdminSidebar'),overview=$('modernAdminOverview'),button=$('adminLayoutModeBtn');
  if(sidebar)sidebar.hidden=!active;
  if(overview)overview.hidden=!active;
  applyModernSidebarCollapsed(modernSidebarCollapsed);
  if(button){
    button.setAttribute('aria-pressed',String(active));
    button.classList.toggle('is-modern',active);
    const strong=button.querySelector('strong'),small=button.querySelector('small');
    if(strong)strong.textContent=active?(lang==='en'?'Classic interface':'الواجهة الكلاسيكية'):(lang==='en'?'Modern interface':'الواجهة الحديثة');
    if(small)small.textContent=active?(lang==='en'?'Return to the familiar layout':'العودة للتصميم المعتاد'):(lang==='en'?'Organized administration workspace':'تنظيم جانبي للعمل');
  }
  updateModernAdminSidebar();
  renderModernAdminCopy();
  if(save)try{localStorage.setItem(ADMIN_LAYOUT_KEY,adminLayoutMode)}catch{}
}
const MODERN_ADMIN_COPY={
  ar:{brand:'إدارة أفضل عناية',workspace:'مساحة العمل الحديثة',home:'نظرة عامة',groups:['الطلبات والمتابعة','المرضى والمواعيد','الإعدادات والإدارة','الوصول والتفضيلات'],overviewKicker:'مساحة العمل الحديثة',overviewTitle:'الأولوية الآن',overviewHelp:'الوصول إلى الطلبات التي تحتاج إجراءً دون مغادرة لوحة اليوم.',metrics:['مواعيد جديدة','طلبات دفع','خطط تحتاج مراجعة'],actions:{appointments:['طلبات المواعيد','طلبات الرابط العام'],payments:['إجراءات الدفع','بانتظار تدخل الإدارة'],plans:['الخطط العلاجية','اعتماد ومراجعة الخطط'],labs:['حالات المعمل','متابعة الحالات النشطة'],'patient-record':['ملف المريض','بحث وتعديل وتتبع'],patients:['مرضى اليوم','القائمة والتحديثات'],'add-patient':['إضافة مريض','موعد جديد'],alert:['إرسال تنبيه','عام أو لعيادة محددة'],statistics:['الإحصائيات','مؤشرات الأداء'],clinics:['العيادات والأطباء','إدارة حتى 15 عيادة'],catalog:['الخدمات والأسعار','إجراءات الدفع والخطط'],import:['استيراد قائمة','CSV أو Excel'],settings:['كل الإعدادات','أدوات النظام'],doctor:['صفحة الطبيب','فتح العيادة المحددة'],language:['تبديل اللغة','العربية أو الإنجليزية'],theme:['مظهر التطبيق','فاتح أو داكن'],notifications:['إشعارات النظام','تفعيل أو إيقاف الإشعارات'],sound:['التنبيهات الصوتية','التحكم بصوت التنبيه'],export:['تصدير القائمة','تنزيل ملف CSV'],logout:['تسجيل الخروج','إنهاء الجلسة بأمان'],classic:['الواجهة الكلاسيكية','العودة للتصميم السابق']}},
  en:{brand:'Best Care Administration',workspace:'Modern workspace',home:'Overview',groups:['Requests and follow-up','Patients and appointments','Settings and management','Access and preferences'],overviewKicker:'Modern workspace',overviewTitle:'Priority now',overviewHelp:'Reach every request that needs action without leaving today’s dashboard.',metrics:['New appointments','Payment requests','Plans to review'],actions:{appointments:['Appointment requests','Public booking requests'],payments:['Payment actions','Waiting for administration'],plans:['Treatment plans','Review and approval'],labs:['Dental lab cases','Track active cases'],'patient-record':['Patient record','Search, edit, and follow up'],patients:["Today’s patients",'List and updates'],'add-patient':['Add patient','New appointment'],alert:['Send alert','All clinics or one clinic'],statistics:['Statistics','Performance indicators'],clinics:['Clinics and doctors','Manage up to 15 clinics'],catalog:['Services and prices','Payments and plans'],import:['Import list','CSV or Excel'],settings:['All settings','System tools'],doctor:['Doctor page','Open selected clinic'],language:['Switch language','Arabic or English'],theme:['App appearance','Light or dark'],notifications:['System notifications','Enable or disable notifications'],sound:['Sound alerts','Control alert sound'],export:['Export list','Download CSV file'],logout:['Sign out','End the session securely'],classic:['Classic interface','Return to previous design']}}
};
function renderModernAdminCopy(){
  const copy=MODERN_ADMIN_COPY[lang]||MODERN_ADMIN_COPY.ar,sidebar=$('modernAdminSidebar');if(!sidebar)return;
  const brand=sidebar.querySelector('.modern-sidebar-brand');if(brand){brand.querySelector('strong').textContent=copy.brand;brand.querySelector('small').textContent=copy.workspace}
  const home=sidebar.querySelector('.modern-sidebar-home span:last-child');if(home)home.textContent=copy.home;
  sidebar.querySelectorAll('.modern-sidebar-group>summary strong').forEach((node,index)=>{if(copy.groups[index])node.textContent=copy.groups[index]});
  Object.entries(copy.actions).forEach(([action,values])=>sidebar.querySelectorAll(`[data-modern-action="${action}"]`).forEach(button=>{const strong=button.querySelector('strong'),small=button.querySelector('small');if(strong)strong.textContent=values[0];if(small)small.textContent=values[1]}));
  setText('#modernAdminOverview .modern-overview-copy small',copy.overviewKicker);setText('#modernAdminOverview .modern-overview-copy h2',copy.overviewTitle);setText('#modernAdminOverview .modern-overview-copy p',copy.overviewHelp);
  document.querySelectorAll('#modernAdminOverview .modern-overview-metrics small').forEach((node,index)=>{if(copy.metrics[index])node.textContent=copy.metrics[index]});
  applyModernSidebarCollapsed(modernSidebarCollapsed);
}
function numericNodeValue(id){const value=Number(String($(id)?.textContent||'0').replace(/[^0-9]/g,''));return Number.isFinite(value)?value:0}
function updateModernAdminSidebar(){
  const appointments=numericNodeValue('appointmentRequestCount'),payments=numericNodeValue('paymentCount'),plans=numericNodeValue('operationPlansCount'),labs=numericNodeValue('floatingLabCount'),patientsCount=numericNodeValue('statTotal'),presenceCount=numericNodeValue('presenceCount');
  const values={modernAppointmentsCount:appointments,modernPaymentsCount:payments,modernPlansCount:plans,modernLabsCount:labs,modernPatientsCount:patientsCount,modernOverviewAppointments:appointments,modernOverviewPayments:payments,modernOverviewPlans:plans,modernRequestsTotal:appointments+payments+plans+labs};
  Object.entries(values).forEach(([id,value])=>{const node=$(id);if(node){node.textContent=String(value);node.closest('button,summary')?.classList.toggle('has-work',value>0)}});
  const presence=$('modernPresenceCount');if(presence)presence.textContent=lang==='en'?`${presenceCount} devices online`:`${presenceCount} أجهزة متصلة`;
  const sync=$('modernSyncLabel');if(sync)sync.textContent=$('syncBadge')?.textContent||syncCadenceCopy();
}
function setupModernAdminMetrics(){
  const sources=['appointmentRequestCount','paymentCount','operationPlansCount','floatingLabCount','statTotal','presenceCount','syncBadge'].map($).filter(Boolean);
  if(!sources.length)return;
  const observer=new MutationObserver(updateModernAdminSidebar);
  sources.forEach(node=>observer.observe(node,{childList:true,subtree:true,characterData:true,attributes:true}));
  updateModernAdminSidebar();
}
function setupModernSidebarScroll(){
  const sidebar=$('modernAdminSidebar'),scroller=sidebar?.querySelector('.modern-sidebar-scroll');
  if(!sidebar||!scroller||sidebar.dataset.scrollReady==='1')return;
  sidebar.dataset.scrollReady='1';
  sidebar.addEventListener('wheel',event=>{
    if(event.ctrlKey||!event.deltaY||event.target.closest('.modern-sidebar-scroll'))return;
    const previous=scroller.scrollTop;
    scroller.scrollTop+=event.deltaY;
    if(scroller.scrollTop!==previous)event.preventDefault();
  },{passive:false});
}
const API='/api/state';
const PLAN_REGISTRY_API='/api/treatment-plan-registry';
const PRESCRIPTIONS_API='/api/prescriptions';
const PUSH_API='/api/push';
const PRESENCE_API='/api/presence';
const ALERTS_API='/api/alerts';
const ADMIN_PATIENTS_API='/api/admin-patients';
const PATIENT_PROFILE_API='/api/patient-profile';
const PATIENTS_API='/api/patients';
const PATIENT_LOOKUP_API='/api/patient-lookup';
const ALERT_DISPLAY_MS=5*60*1000;
const POLL_MS=5000;
const SYNC_WORK_HIDDEN_MS=60000;
const SYNC_OFF_HOURS_MS=5*60*1000;
const SYNC_OFF_HOURS_HIDDEN_MS=15*60*1000;
const RIYADH_OFFSET_MS=3*60*60*1000;
function syncCadence(now=Date.now()){
  const riyadh=new Date(now+RIYADH_OFFSET_MS);
  const day=riyadh.getUTCDay(),hour=riyadh.getUTCHours();
  const friday=day===5;
  const workHours=!friday&&hour>=14&&hour<23;
  const hidden=document.hidden;
  return {
    friday,
    workHours,
    delay:workHours?(hidden?SYNC_WORK_HIDDEN_MS:POLL_MS):(hidden?SYNC_OFF_HOURS_HIDDEN_MS:SYNC_OFF_HOURS_MS)
  };
}
function syncCadenceCopy(cadence=syncCadence()){
  if(cadence.workHours)return lang==='en'?'Live sync active':'المزامنة المباشرة مفعلة';
  if(cadence.friday)return lang==='en'?'Reduced sync — Friday':'مزامنة مخفّضة — يوم الجمعة';
  return lang==='en'?'Reduced sync outside working hours':'مزامنة مخفّضة خارج أوقات العمل';
}
function presenceCadence(){
  const cadence=syncCadence();
  if(cadence.workHours)return document.hidden?5*60*1000:60*1000;
  return document.hidden?30*60*1000:10*60*1000;
}
function adminHubCadence(){
  const cadence=syncCadence();
  if(cadence.workHours)return document.hidden?5*60*1000:20*1000;
  return document.hidden?30*60*1000:10*60*1000;
}
const DASHBOARD_BUILD='7.61-realtime-sync';
const DEFAULT_GOOGLE_REVIEW_URL='https://bestcaredentalclinicsdash.netlify.app/review';
const CLIENT_ID=(crypto.randomUUID?.()||('client-'+Date.now()+'-'+Math.random().toString(36).slice(2)));
const DEVICE_ID=(()=>{
  const key='bestcare_device_id_v1';
  try{
    let value=localStorage.getItem(key)||'';
    if(!/^[a-zA-Z0-9_-]{12,120}$/.test(value)){
      value=(crypto.randomUUID?.()||('device-'+Date.now()+'-'+Math.random().toString(36).slice(2))).replace(/[^a-zA-Z0-9_-]/g,'');
      localStorage.setItem(key,value);
    }
    return value;
  }catch{
    return ('device-'+CLIENT_ID).replace(/[^a-zA-Z0-9_-]/g,'');
  }
})();
const STATUS={waiting:'بانتظار الموعد',arrived:'وصل المريض',early_arrival:'وصول مبكر',active:'قيد العلاج',done:'مكتمل',late:'متأخر',cancel:'ملغي',left:'المريض غادر',asks_delay:'يستفسر عن التأخير'};
const EN={waiting:'Waiting',arrived:'Patient arrived',early_arrival:'Early arrival',active:'In treatment',done:'Completed',late:'Overdue',cancel:'Cancelled',left:'Patient left',asks_delay:'Asking about delay'};
const PLAN_STATUS_VALUES=['draft','submitted','patient_accepted','approved','approved_signed','rejected','cancelled'];
const I18N={
  ar:{documentTitle:'عيادات أفضل عناية الاستشارية للأسنان',pageTitle:'عيادات أفضل عناية الاستشارية للأسنان',pageSubtitle:'شاشة استقبال ومتابعة المرضى — مزامنة مباشرة بين الأجهزة',updateToday:'تحديث قائمة اليوم',addPatient:'إضافة مريض',screenMode:'وضع الشاشة',installApp:'تثبيت التطبيق',settings:'الإعدادات ▾',imageOcr:'📷 قراءة صورة المواعيد',importCsv:'📥 استيراد CSV',exportCsv:'📤 تصدير CSV',testSync:'🧪 اختبار المزامنة',clearToday:'🗑 مسح قائمة اليوم',alertTitle:'تنبيه تعديل',alertInactiveHint:'إرسال ملاحظة للطبيب',alertActiveHint:'تنبيه فعّال — اضغط للإدارة',defaultAlert:'يوجد تعديل جديد على قائمة المواعيد',updateAvailable:'يتوفر تحديث جديد للتطبيق.',updateNow:'تحديث الآن',totalPatients:'إجمالي المرضى',completed:'تم الإنجاز',inTreatment:'قيد العلاج',remaining:'المتبقي',cancelled:'الملغاة',completionRate:'نسبة الإنجاز',originalTime:'وقت الموعد الأصلي',originalHint:'يبقى محفوظًا حسب جدول الموعد',actualDuration:'مدة العلاج الفعلية',actualStartHint:'يبدأ عند دخول المريض',upcomingPatients:'المرضى القادمون',upcomingHint:'خريطة أحجام حسب ترتيب الموعد',addNewPatient:'إضافة مريض جديد',editPatient:'تعديل بيانات المريض',add:'إضافة',editing:'تعديل',formIntro:'أدخل بيانات الموعد ثم اضغط حفظ؛ ستتم المزامنة تلقائيًا مع الأجهزة الأخرى.',firstName:'الاسم الكامل',fileNumber:'رقم الملف',appointmentDate:'تاريخ الموعد',startTime:'وقت البداية',endTime:'وقت النهاية',procedure:'الإجراء العلاجي',status:'الحالة',namePlaceholder:'اسم المريض الكامل',filePlaceholder:'رقم الملف',procedurePlaceholder:'مثال: مراجعة، كشف جديد',resetFields:'تفريغ الحقول',cancelEdit:'إلغاء التعديل',saveAdd:'حفظ وإضافة المريض',saveChanges:'حفظ التعديل',patientUpdated:'تم حفظ التعديل',patientAdded:'تمت إضافة المريض',movingPatient:'جارٍ نقل الموعد…',dateMoveFailed:'تعذر تغيير تاريخ الموعد',sourceSaveFailed:'تعذر حفظ قائمة اليوم القديم',targetLoadFailed:'تعذر قراءة قائمة اليوم الجديد',targetSaveFailed:'تعذر حفظ المريض في اليوم الجديد',patientList:'قائمة المرضى اليومية',searchPlaceholder:'بحث بالاسم أو الجوال أو رقم الملف',allStatuses:'كل الحالات',name:'الاسم',start:'البداية',end:'النهاية',action:'إجراء',todayNotes:'ملاحظات اليوم',notesPlaceholder:'اكتب ملاحظات اليوم...',exitFullscreen:'⤢ إلغاء ملء الشاشة',bulkTitle:'تحديث قائمة اليوم',bulkHelp:'كل مريض في سطر: الاسم الكامل، رقم الملف، البداية، النهاية، الإجراء',cancel:'إلغاء',saveList:'حفظ القائمة',alertModalTitle:'🔔 إرسال تنبيه تعديل',alertModalHelp:'اكتب ملاحظة مختصرة وواضحة لتظهر فورًا على الأجهزة المتصلة.',alertMessage:'رسالة التنبيه',alertPlaceholder:'مثال: تم تعديل موعد المريض التالي، يرجى مراجعة القائمة',alertTip:'يظهر التنبيه باللون الأحمر وينتقل عبر المزامنة المباشرة. يمكنك إلغاؤه بعد اطلاع الطبيب.',close:'إغلاق',clearAlert:'إلغاء التنبيه الحالي',publishAlert:'نشر التنبيه',noAppointments:'لا توجد مواعيد لهذا اليوم',noUpcoming:'لا يوجد مرضى قادمون',edit:'تعديل',delete:'حذف',currentPatient:'المريض الحالي',nextToCall:'التالي للاستدعاء',noCurrent:'لا يوجد مريض قيد العلاج',noSchedule:'أضف قائمة المرضى لبدء المتابعة',fileLabel:'رقم الملف',nextDirect:'التالي مباشرة',patientNumber:'المريض رقم',lastCall:'آخر استدعاء',recall:'🔔 إعادة الاستدعاء',callNext:'🔔 استدعاء التالي',callPatient:'🔔 استدعاء المريض',startActual:'▶ بدء وقت الدخول الفعلي',actualRunning:'✓ الوقت الفعلي يعمل',finishPatient:'✓ إنهاء المريض',startedAt:'بدأ',developerRights:'جميع الحقوق محفوظة — تطوير يحيى هادي',ocrTitle:'📷 تحويل صورة المواعيد إلى قائمة مرضى',ocrHelp:'تتم قراءة الصورة داخل جهازك. راجع المسودة ثم ادمج الصفوف الصحيحة مباشرة في قائمة اليوم.',ocrPrivacy:'🔒 معالجة محلية — لا تُرفع الصورة',ocrChoose:'اختيار صورة من الجهاز',ocrDrop:'أو اسحب صورة جدول المواعيد هنا',ocrDropHint:'JPG أو PNG أو WEBP — حتى 20 MB',ocrNoFile:'لم يتم اختيار صورة',ocrRotate:'↻ تدوير الصورة 90°',ocrReady:'جاهز للاستخراج',ocrInitialHint:'اختر صورة واضحة يظهر فيها الجدول كاملًا.',ocrReviewTitle:'مسودة المراجعة',ocrReviewCaption:'يمكنك تعديل أي خانة قبل الدمج',ocrConfidence:'دقة القراءة',ocrStart:'بدء الاستخراج',ocrDownload:'تنزيل CSV',ocrMerge:'دمج في قائمة اليوم'},
  en:{documentTitle:'Best Care Clinic Reception Dashboard',pageTitle:'Best Care Dental Clinics',pageSubtitle:'Patient reception and tracking — live sync across devices',updateToday:"Update today's list",addPatient:'Add patient',screenMode:'Screen mode',installApp:'Install app',settings:'Settings ▾',imageOcr:'📷 Read appointment image',importCsv:'📥 Import CSV',exportCsv:'📤 Export CSV',testSync:'🧪 Test sync',clearToday:"🗑 Clear today's list",alertTitle:'Update alert',alertInactiveHint:'Send a note to the doctor',alertActiveHint:'Alert active — tap to manage',defaultAlert:'A new update was made to the appointment list',updateAvailable:'A new app update is available.',updateNow:'Update now',totalPatients:'Total patients',completed:'Completed',inTreatment:'In treatment',remaining:'Remaining',cancelled:'Cancelled',completionRate:'Completion rate',originalTime:'Original appointment',originalHint:'Kept according to the appointment schedule',actualDuration:'Actual treatment duration',actualStartHint:'Starts when the patient enters',upcomingPatients:'Upcoming patients',upcomingHint:'Cards resize automatically as appointments approach',addNewPatient:'Add new patient',editPatient:'Edit patient',add:'Add',editing:'Editing',formIntro:'Enter the appointment details and save; changes sync automatically across devices.',firstName:'Full name',fileNumber:'File number',appointmentDate:'Appointment date',startTime:'Start time',endTime:'End time',procedure:'Procedure',status:'Status',namePlaceholder:'Full patient name',filePlaceholder:'File number',procedurePlaceholder:'Example: Review, new consultation',resetFields:'Clear fields',cancelEdit:'Cancel editing',saveAdd:'Save and add patient',saveChanges:'Save changes',patientUpdated:'Patient updated',patientAdded:'Patient added',movingPatient:'Moving appointment…',dateMoveFailed:'Could not change appointment date',sourceSaveFailed:'Could not save the original day list',targetLoadFailed:'Could not load the new day list',targetSaveFailed:'Could not save the patient on the new day',patientList:'Daily patient list',searchPlaceholder:'Search by name, mobile, or file number',allStatuses:'All statuses',name:'Name',start:'Start',end:'End',action:'Actions',todayNotes:"Today's notes",notesPlaceholder:"Write today's notes...",exitFullscreen:'⤢ Exit fullscreen',bulkTitle:"Update today's list",bulkHelp:'One patient per line: full name, file number, start, end, procedure',cancel:'Cancel',saveList:'Save list',alertModalTitle:'🔔 Send update alert',alertModalHelp:'Write a short, clear note to appear immediately on connected devices.',alertMessage:'Alert message',alertPlaceholder:'Example: The next appointment was updated; please review the list',alertTip:'The alert appears in red and syncs live. Clear it after the doctor has reviewed it.',close:'Close',clearAlert:'Clear current alert',publishAlert:'Publish alert',noAppointments:'No appointments for this day',noUpcoming:'No upcoming patients',edit:'Edit',delete:'Delete',currentPatient:'Current patient',nextToCall:'Next to call',noCurrent:'No patient currently in treatment',noSchedule:'Add patients to start tracking',fileLabel:'File number',nextDirect:'Next',patientNumber:'Patient number',lastCall:'Last call',recall:'🔔 Recall',callNext:'🔔 Call next',callPatient:'🔔 Call patient',startActual:'▶ Start actual entry time',actualRunning:'✓ Actual timer running',finishPatient:'✓ Finish patient',startedAt:'Started',developerRights:'All rights reserved — Developed by Yahya Hadi',ocrTitle:'📷 Convert appointment image to patient list',ocrHelp:'The image is read on this device. Review the draft, then merge valid rows into today’s list.',ocrPrivacy:'🔒 Local processing — image is not uploaded',ocrChoose:'Choose image',ocrDrop:'or drop the appointment image here',ocrDropHint:'JPG, PNG, or WEBP — up to 20 MB',ocrNoFile:'No image selected',ocrRotate:'↻ Rotate image 90°',ocrReady:'Ready to extract',ocrInitialHint:'Choose a clear image showing the full table.',ocrReviewTitle:'Review draft',ocrReviewCaption:'Edit any field before merging',ocrConfidence:'Reading confidence',ocrStart:'Start extraction',ocrDownload:'Download CSV',ocrMerge:"Merge into today's list"}
};
const IOS_INSTALL_COPY={
  ar:{menu:'📱 تثبيت التطبيق على iPhone',title:'تثبيت التطبيق على iPhone',help:'أربع خطوات بسيطة من متصفح Safari — دون متجر التطبيقات.',steps:[['افتح الرابط في Safari','إذا كنت تستخدم Chrome، انسخ الرابط وافتحه في Safari أولًا.'],['اضغط زر المشاركة','اضغط رمز المربع والسهم ↑ أسفل شاشة Safari.'],['اختر «إضافة إلى الشاشة الرئيسية»','مرّر قائمة المشاركة إلى أسفل إذا لم يظهر الخيار مباشرة.'],['اضغط «إضافة»','ستظهر أيقونة Best Care على الشاشة الرئيسية وتفتح كتطبيق مستقل.']],note:'مهم: استخدم Safari للتثبيت. بعد التثبيت افتح التطبيق من الأيقونة الجديدة، وستبقى المزامنة مرتبطة بنفس رابط العيادة.',shareTitle:'مشاركة التطبيق مع جهاز آخر',shareText:'انسخ الرابط وأرسله لمستخدم iPhone، ثم يتبع الخطوات أعلاه.',copy:'نسخ رابط التطبيق',close:'تم، فهمت الخطوات',copiedTitle:'تم نسخ الرابط',copiedText:'أرسله الآن إلى مستخدم iPhone لفتح التطبيق وتثبيته.',alreadyTitle:'التطبيق مثبت',alreadyText:'أنت تستخدم التطبيق الآن من وضع الشاشة المستقلة.'},
  en:{menu:'📱 Install on iPhone',title:'Install the app on iPhone',help:'Four simple steps in Safari — no App Store required.',steps:[['Open the link in Safari','If you are using Chrome, copy the link and open it in Safari first.'],['Tap the Share button','Tap the square-with-up-arrow icon at the bottom of Safari.'],['Choose “Add to Home Screen”','Scroll down in the Share sheet if the option is not immediately visible.'],['Tap “Add”','The Best Care icon will appear on your Home Screen and open as a standalone app.']],note:'Important: use Safari to install. Then open the new icon; live sync continues through the same clinic link.',shareTitle:'Share the app with another device',shareText:'Copy the link and send it to the iPhone user, then follow the steps above.',copy:'Copy app link',close:'Done, I understand',copiedTitle:'Link copied',copiedText:'Send it to the iPhone user to open and install the app.',alreadyTitle:'App installed',alreadyText:'You are already using the standalone app.'}
};
const els={datePicker:$('datePicker'),syncBadge:$('syncBadge'),presenceBadge:$('presenceBadge'),settingsBtn:$('settingsBtn'),settingsMenu:$('settingsMenu'),csvInput:$('csvInput'),patientRows:$('patientRows'),notes:$('notes'),search:$('searchInput'),filter:$('filterStatus'),alertRow:$('alertRow'),alertText:$('alertText'),alertRowDismissBtn:$('alertRowDismissBtn'),alertBtn:$('alertBtn'),alertBtnHint:$('alertBtnHint'),alertMessageInput:$('alertMessageInput'),clearAlertBtn:$('clearAlertBtn'),alertTargetClinic:$('alertTargetClinic'),alertClinicPicker:$('alertClinicPicker'),alertTargetSummary:$('alertTargetSummary')};
let selectedDate=''; let patients=[]; let notes=''; let updateAlert={active:false,message:'',updatedAt:0,kind:''}; let manualAlert={active:false,message:'',updatedAt:0,kind:'manual',scope:'all',targetClinicId:'',targetClinicLabel:''}; let editingId=null; let pendingCompletionId=null; let pendingReviewId=null; let lang=localStorage.getItem('bestcare_lang')||'ar';
let manualAlertFetchedAt=0;
let audioContext=null;
let presence={online:0,administration:0,clinics:0,desktop:0,mobile:0,tablet:0,byClinic:{},updatedAt:0,timer:null,started:false,busy:false,error:''};
let adminPatientHub={records:[],updatedAt:0,date:'',loading:false,error:'',timer:null,started:false};
let appointmentRequests={items:[],timer:null,started:false,busy:false,lastNewestAt:Number(sessionStorage.getItem('bestcare_appointment_request_seen_at')||0),peekTimer:null};
let appointmentRequestChannel=null;
let doctorAlertPeekTimer=null;
let alertAutoHideTimer=null;
let dismissedAlertKeys=new Set((()=>{try{const saved=JSON.parse(sessionStorage.getItem('bestcare_dismissed_alerts')||'[]');return Array.isArray(saved)?saved:[]}catch{return[]}})());
const alertFirstSeenAt=new Map();
let lastDoctorFloatingAlertAt=Number(sessionStorage.getItem('bestcare_doctor_alert_seen_at')||0);
let treatmentPlanRegistry={records:{},aliases:{},revision:0,updatedAt:0,lastFetchedAt:0};
let treatmentPlanCenter={records:{},aliases:{},loading:false,error:'',loadedAt:0};
let operationsCenter={filter:'all',labCases:[],labLoading:false,labError:'',labLoadedAt:0,prescriptions:[],prescriptionsLoading:false,prescriptionsError:'',prescriptionsLoadedAt:0,prescriptionsTimer:null,prescriptionsStarted:false};
let patientIdentityDirectory={records:{},revision:0,updatedAt:0,loading:false,error:''};
let patientIdentityRemote={query:'',matches:[],loading:false,error:'',timer:null,requestId:0};
let patientIdentityDisplayLimit=120;
let patientDirectoryImportDraft={fileName:'',rows:[],validRows:[],invalidRows:[]};
let patientProfileState={lookup:null,profile:null,loading:false,error:'',tab:'appointments'};
let labCasesState={cases:[],revision:0,updatedAt:0,lastFetchedAt:0,loading:false};
const REQUESTED_VIEW=new URLSearchParams(location.search).get('view');
const VIEW_MODE=REQUESTED_VIEW==='admin'?'admin':'clinic';
const ACTIVE_CLINIC_ID=/^clinic-([1-9]|1[0-5])$/.test(new URLSearchParams(location.search).get('clinic')||'')?new URLSearchParams(location.search).get('clinic'):'clinic-1';
const NEED_ROLE_CHOICE=!['admin','clinic'].includes(REQUESTED_VIEW);
const clinicNumber=id=>Math.max(1,Math.min(15,Number(String(id||'clinic-1').split('-')[1])||1));
const defaultClinic=index=>({id:`clinic-${index}`,name:`العيادة ${index}`,doctorName:'',roomNumber:String(index),active:index===1});
let clinicDirectory=Array.from({length:15},(_,index)=>defaultClinic(index+1));
let currentClinic={...clinicDirectory[clinicNumber(ACTIVE_CLINIC_ID)-1]};
const tr=key=>I18N[lang]?.[key]??I18N.ar[key]??key;
let authChallenge=''; let authLastActivity=0; let authKeepAliveAt=0; let authReady=false; let authMethod='email'; let localStateHydrated=false; let authUser=null;
function setupEmailAuth(){const step=$('authRequestStep'),phone=$('authPhone');if(!step||!phone||$('authEmail'))return;const methods=document.createElement('div');methods.className='auth-methods';methods.innerHTML='<label><input type="radio" name="authMethod" value="email" checked> البريد الإلكتروني</label><label><input type="radio" name="authMethod" value="phone"> الجوال</label>';const emailLabel=document.createElement('label');emailLabel.id='authEmailLabel';emailLabel.innerHTML='البريد الإلكتروني<input id="authEmail" type="email" autocomplete="email" placeholder="name@example.com">';step.insertBefore(methods,phone.parentElement);step.insertBefore(emailLabel,phone.parentElement);phone.parentElement.id='authPhoneLabel';phone.parentElement.hidden=true;methods.querySelectorAll('input').forEach(input=>input.addEventListener('change',()=>{authMethod=input.value;emailLabel.hidden=authMethod!=='email';phone.parentElement.hidden=authMethod!=='phone'}));}
const authErrorMessage=message=>{const node=$('authError');if(node)node.textContent=message||''};
async function authRequest(path,options={}){
  let response;
  try{
    response=await fetch(`/api/auth${path}`,{credentials:'include',cache:'no-store',...options});
  }catch{
    throw new Error('تعذر الوصول إلى خدمة الدخول. تحقق من الاتصال ثم أعد المحاولة.');
  }
  const contentType=String(response.headers.get('content-type')||'').toLowerCase();
  let data={};
  if(contentType.includes('application/json')){
    try{data=await response.json()}catch{}
  }
  if(!response.ok&&response.status!==401){
    const unavailable=response.status>=500||!contentType.includes('application/json');
    throw new Error(data.error||(unavailable?'خدمة الدخول غير متاحة في النسخة المنشورة. يلزم إعادة نشر المشروع من GitHub مع وظائف Netlify.':'تعذر الاتصال بخدمة الدخول'));
  }
  if(response.ok&&!contentType.includes('application/json'))throw new Error('استجابة خدمة الدخول غير مكتملة. أعد تحميل التطبيق بعد اكتمال النشر.');
  return{response,data};
}
function setProtectedUiLocked(locked){
  const app=document.querySelector('.app');
  if(app){
    app.toggleAttribute('inert',locked);
    app.setAttribute('aria-hidden',locked?'true':'false');
  }
  const gate=$('authGate');
  if(gate)gate.setAttribute('aria-hidden',locked?'false':'true');
  if(locked){
    document.querySelectorAll('.modal.open').forEach(modal=>{
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden','true');
    });
    modalReturnFocus?.clear?.();
  }
}
function startSyncAfterAuth(){
  if(!localStateHydrated){
    cleanupOldLocalPatientData();
    loadLocal(selectedDate);
    localStateHydrated=true;
  }
  if(window.__syncStarted)return;
  window.__syncStarted=true;
  startAutomaticSync().catch(error=>{console.error('Automatic synchronization failed to start',error);sync.error=String(error?.message||error);setBadge('error',lang==='en'?'Auto sync failed — retrying':'تعذر بدء المزامنة — ستتم إعادة المحاولة',sync.error);scheduleAutomaticSync(syncCadence().workHours?30000:syncCadence().delay)})
}
function unlockApp(user=null){
  authUser=user||authUser;
  const assignedClinic=/^clinic-([1-9]|1[0-5])$/.test(String(authUser?.clinicId||''))?String(authUser.clinicId):'clinic-1';
  if(authUser?.role==='clinic'&&(VIEW_MODE!=='clinic'||ACTIVE_CLINIC_ID!==assignedClinic)){
    location.replace(viewUrl('clinic',assignedClinic));
    return;
  }
  document.body.classList.toggle('role-clinic',authUser?.role==='clinic');
  document.body.classList.toggle('role-admin',authUser?.role==='admin');
  document.body.classList.remove('auth-checking','auth-locked');
  $('authGate').hidden=true;
  setProtectedUiLocked(false);
  authReady=true;
  authLastActivity=Date.now();
  authKeepAliveAt=Date.now();
  if(audioContext)playLoginSignature();
  startAuthIdleProtection();
  startPresence();
  loadClinicDirectory().catch(error=>console.warn('Clinic directory unavailable',error)).finally(()=>{
    startSyncAfterAuth();
    if(VIEW_MODE==='admin'){startAdminPatientHub();startAppointmentRequests();startOperationsPrescriptionPolling()}
    if(NEED_ROLE_CHOICE&&authUser?.role==='admin')requestAnimationFrame(()=>openRoleChoice());
  });
}
function lockApp(message='انتهت الجلسة بسبب الخمول. سجّل الدخول مرة أخرى.'){
  stopPresence(false);
  stopAdminPatientHub();
  stopAppointmentRequests();
  stopOperationsPrescriptionPolling();
  authReady=false;
  authUser=null;
  purgeSensitiveLocalData();
  clearTimeout(sync?.autoTimer);
  clearTimeout(sync?.pushTimer);
  sync.autoStarted=false;
  window.__syncStarted=false;
  localStateHydrated=false;
  patients=[];notes='';updateAlert={active:false,message:'',updatedAt:0,kind:''};manualAlert=normalizeManualAlert(null);manualAlertFetchedAt=0;
  if(els.notes)els.notes.value='';
  treatmentPlanRegistry={records:{},aliases:{},revision:0,updatedAt:0,lastFetchedAt:0};
  patientIdentityDirectory={records:{},revision:0,updatedAt:0,loading:false,error:''};
  render();
  document.body.classList.remove('auth-checking');
  document.body.classList.add('auth-locked');
  $('authGate').hidden=false;
  setProtectedUiLocked(true);
  $('authRequestStep').hidden=false;
  $('authVerifyStep').hidden=true;
  if($('authCode'))$('authCode').value='';
  // Never keep or reuse a password filled by an old browser/PWA session.
  if($('authPassword'))$('authPassword').value='';
  authErrorMessage(message);
  requestAnimationFrame(()=>$('authUsername')?.focus());
}
async function initAuth(){document.body.classList.add('auth-checking');document.body.classList.remove('auth-locked');$('authGate').hidden=true;try{const {response,data}=await authRequest('?action=session');if(!data.enabled){lockApp('الحماية غير مفعّلة بعد. يجب ضبط AUTH_ENABLED في Netlify قبل استخدام التطبيق.');return}if(data.authenticated){unlockApp(data.user);return}lockApp('')}catch(error){lockApp(error.message||'تعذر التحقق من الجلسة')}}
async function requestAuthOtp(){prepareAudio();const username=$('authUsername').value.trim(),password=$('authPassword').value;if(!username||!password){authErrorMessage('أدخل اسم المستخدم وكلمة المرور.');return}authErrorMessage('جارٍ تسجيل الدخول…');try{const {data}=await authRequest('?action=password-login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})});if(!data.ok){if($('authPassword'))$('authPassword').value='';authErrorMessage(data.error||'اسم المستخدم أو كلمة المرور غير صحيحة. أعد كتابة كلمة المرور الجديدة يدويًا.');return}if($('authPassword'))$('authPassword').value='';unlockApp(data.user)}catch(error){if($('authPassword'))$('authPassword').value='';authErrorMessage(error.message)}}
async function verifyAuthOtp(){const code=$('authCode').value.trim();if(!/^\d{4}$/.test(code)){authErrorMessage('أدخل رمز التحقق المكوّن من 4 أرقام.');return}authErrorMessage('جارٍ التحقق…');try{const {data}=await authRequest('?action=verify-otp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({challengeId:authChallenge,code})});if(!data.ok){authErrorMessage(data.error||'الرمز غير صحيح أو منتهي.');return}unlockApp(data.user)}catch(error){authErrorMessage(error.message)}}
function openUsersModal(){openModal('usersModal');$('usersError').textContent=''}
function normalizeClinicDirectory(items){
  const source=new Map((Array.isArray(items)?items:[]).map(item=>[String(item?.id||''),item]));
  return Array.from({length:15},(_,offset)=>{
    const fallback=defaultClinic(offset+1),saved=source.get(fallback.id)||{};
    return {...fallback,name:String(saved.name||fallback.name).slice(0,80),doctorName:String(saved.doctorName||'').slice(0,80),roomNumber:String(saved.roomNumber||fallback.roomNumber).slice(0,20),active:fallback.id==='clinic-1'?true:Boolean(saved.active)};
  });
}
function clinicDisplayName(clinic,{compact=false}={}){
  const name=String(clinic?.name||`العيادة ${clinicNumber(clinic?.id)}`);
  const room=String(clinic?.roomNumber||clinicNumber(clinic?.id));
  const doctor=String(clinic?.doctorName||'').trim();
  const doctorEn=/^(?:dr\.?|doctor)\s/i.test(doctor)?doctor:`Dr. ${doctor}`;
  const doctorAr=/^(?:د\.?|الدكتور)\s*/.test(doctor)?doctor:`د. ${doctor}`;
  if(lang==='en')return `${name} · Room ${room}${doctor&&!compact?` · ${doctorEn}`:''}`;
  return `${name} · رقم ${room}${doctor&&!compact?` · ${doctorAr}`:''}`;
}
function renderClinicSwitcher(){
  const active=clinicDirectory.filter(clinic=>clinic.active);
  currentClinic={...(clinicDirectory.find(clinic=>clinic.id===ACTIVE_CLINIC_ID)||defaultClinic(clinicNumber(ACTIVE_CLINIC_ID)))};
  const selector=$('clinicSwitcher'),wrap=$('clinicSwitcherWrap');
  if(selector){
    selector.innerHTML=active.map(clinic=>`<option value="${clinic.id}">${escapeHtml(clinicDisplayName(clinic,{compact:true}))}</option>`).join('');
    if(active.some(clinic=>clinic.id===ACTIVE_CLINIC_ID))selector.value=ACTIVE_CLINIC_ID;
  }
  if(wrap)wrap.hidden=active.length<=1;
  if($('currentClinicContext'))$('currentClinicContext').textContent=clinicDisplayName(currentClinic);
  renderPresence();
}
function roleClinicOptionLabel(clinic){
  const name=String(clinic?.name||`العيادة ${clinicNumber(clinic?.id)}`).trim();
  const room=String(clinic?.roomNumber||clinicNumber(clinic?.id)).trim();
  const doctor=String(clinic?.doctorName||'').trim();
  const doctorEn=/^(?:dr\.?|doctor)\s/i.test(doctor)?doctor:`Dr. ${doctor}`;
  const doctorAr=/^(?:د\.?|الدكتور)\s*/.test(doctor)?doctor:`د. ${doctor}`;
  if(lang==='en')return doctor?`${name} — Room ${room} — ${doctorEn}`:`${name} — Room ${room} — No doctor assigned`;
  return doctor?`${name} — عيادة رقم ${room} — ${doctorAr}`:`${name} — عيادة رقم ${room} — لم يحدد طبيب`;
}
function resetClinicRolePicker(){
  $('clinicRolePicker').hidden=true;
  document.querySelector('.clinic-option')?.classList.remove('is-selected');
  $('roleClinicSelect').value='';
  $('roleClinicContinueBtn').disabled=true;
  $('roleClinicError').textContent='';
}
function syncCombinedClinicDoctorPicker(){
  const clinic=clinicDirectory.find(item=>item.active&&item.id===$('roleClinicSelect').value);
  const doctor=String(clinic?.doctorName||'').trim();
  $('roleClinicContinueBtn').disabled=!clinic||!doctor;
  $('roleClinicError').textContent=clinic&&!doctor
    ?(lang==='en'?'No doctor is assigned to this clinic. Add the doctor from Administration → Settings → Clinics.':'لا يوجد طبيب مسجل لهذه العيادة. أضف الطبيب من صفحة الإدارة ← الإعدادات ← العيادات.')
    :'';
}
function renderClinicRolePicker(){
  const active=clinicDirectory.filter(clinic=>clinic.active);
  $('roleClinicSelect').innerHTML=`<option value="">${lang==='en'?'Choose clinic and doctor':'اختر العيادة والطبيب'}</option>${active.map(clinic=>`<option value="${clinic.id}"${String(clinic.doctorName||'').trim()?'':' disabled'}>${escapeHtml(roleClinicOptionLabel(clinic))}</option>`).join('')}`;
  $('roleClinicSelect').value='';
  syncCombinedClinicDoctorPicker();
  if(active.length&&!active.some(clinic=>String(clinic.doctorName||'').trim())){
    $('roleClinicError').textContent=lang==='en'?'No active clinic has an assigned doctor. Add one from Administration → Settings → Clinics.':'لا توجد عيادة مفعلة مرتبطة بطبيب. أضف الطبيب من صفحة الإدارة ← الإعدادات ← العيادات.';
  }
}
async function openClinicRolePicker(){
  $('clinicRolePicker').hidden=false;
  document.querySelector('.clinic-option')?.classList.add('is-selected');
  $('roleClinicError').textContent=lang==='en'?'Loading clinics…':'جارٍ تحميل العيادات…';
  try{
    await loadClinicDirectory({redirect:false});
    renderClinicRolePicker();
    $('roleClinicSelect').focus();
  }catch(error){
    renderClinicRolePicker();
    $('roleClinicError').textContent=lang==='en'?'Clinics could not be loaded. Check the connection and try again.':'تعذر تحميل العيادات. تحقق من الاتصال وحاول مرة أخرى.';
  }
}
function openRoleChoice({clinic=false}={}){
  resetClinicRolePicker();
  openModal('roleModal');
  if(clinic)openClinicRolePicker();
}
async function loadClinicDirectory({redirect=true}={}){
  const response=await request('/api/clinics');
  if(response.status===401){lockApp('انتهت الجلسة. سجّل الدخول مرة أخرى.');throw new Error('Authentication required')}
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'تعذر تحميل إعدادات العيادات');
  clinicDirectory=normalizeClinicDirectory(data.clinics);
  if(authUser?.role==='clinic'){
    const assignedClinic=String(authUser.clinicId||'');
    clinicDirectory=clinicDirectory.map(clinic=>({
      ...clinic,
      active:clinic.id===assignedClinic,
      doctorName:clinic.id===assignedClinic
        ?String(clinic.doctorName||authUser.displayName||authUser.username||'').slice(0,80)
        :clinic.doctorName
    }));
  }
  const active=clinicDirectory.filter(clinic=>clinic.active);
  if(redirect&&!active.some(clinic=>clinic.id===ACTIVE_CLINIC_ID)){
    const params=new URLSearchParams(location.search);
    params.set('clinic',(active[0]||defaultClinic(1)).id);
    location.replace(`${location.pathname}?${params.toString()}`);
    return;
  }
  renderClinicSwitcher();
  syncAdminHubClinicOptions();
}
function renderClinicDirectoryEditor(){
  const active=clinicDirectory.filter(clinic=>clinic.active);
  $('clinicCapacity').textContent=lang==='en'?`${active.length} of 15`:`${active.length} من 15`;
  $('addClinicSlotBtn').disabled=active.length>=15;
  $('clinicDirectoryList').innerHTML=active.map(clinic=>{
    const number=clinicNumber(clinic.id),isPrimary=number===1,isCurrent=clinic.id===ACTIVE_CLINIC_ID;
    return `<div class="clinic-config-row" data-clinic-row="${clinic.id}">
      <div class="clinic-slot"><span>عيادة</span><strong>${number}</strong></div>
      <label>اسم العيادة<input data-clinic-field="name" maxlength="80" value="${escapeHtml(clinic.name)}" placeholder="مثال: عيادة التركيبات"></label>
      <label>رقم العيادة<input data-clinic-field="roomNumber" maxlength="20" value="${escapeHtml(clinic.roomNumber)}" placeholder="${number}"></label>
      <label>اسم الطبيب<input data-clinic-field="doctorName" maxlength="80" value="${escapeHtml(clinic.doctorName)}" placeholder="اسم الطبيب"></label>
      <button class="clinic-hide-btn" type="button" data-hide-clinic="${clinic.id}" ${isPrimary||isCurrent?'disabled':''}>${isPrimary?'العيادة الرئيسية':isCurrent?'مفتوحة الآن':'إخفاء'}</button>
    </div>`;
  }).join('');
}
function collectClinicDirectoryEditor(){
  document.querySelectorAll('[data-clinic-row]').forEach(row=>{
    const clinic=clinicDirectory.find(item=>item.id===row.dataset.clinicRow);
    if(!clinic)return;
    row.querySelectorAll('[data-clinic-field]').forEach(input=>clinic[input.dataset.clinicField]=input.value.trim());
  });
}
async function openClinicDirectory(){
  setSettingsMenuOpen(false);
  $('clinicsError').textContent='جارٍ تحميل العيادات…';
  openModal('clinicsModal');
  try{await loadClinicDirectory({redirect:false});$('clinicsError').textContent='';renderClinicDirectoryEditor()}catch(error){$('clinicsError').textContent=error.message}
}
function addClinicSlot(){
  collectClinicDirectoryEditor();
  const clinic=clinicDirectory.find(item=>!item.active);
  if(!clinic)return;
  clinic.active=true;
  renderClinicDirectoryEditor();
  document.querySelector(`[data-clinic-row="${clinic.id}"] [data-clinic-field="name"]`)?.select();
}
async function saveClinicDirectory(){
  collectClinicDirectoryEditor();
  const invalid=clinicDirectory.find(clinic=>clinic.active&&(!clinic.name.trim()||!clinic.roomNumber.trim()));
  if(invalid){$('clinicsError').textContent=`أكمل اسم ورقم العيادة ${clinicNumber(invalid.id)}.`;return}
  $('clinicsError').textContent='جارٍ حفظ إعدادات العيادات…';
  $('saveClinicsBtn').disabled=true;
  try{
    const response=await request('/api/clinics',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({clinics:clinicDirectory})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'تعذر حفظ إعدادات العيادات');
    clinicDirectory=normalizeClinicDirectory(data.clinics);
    renderClinicSwitcher();
    closeModal('clinicsModal');
    toast('تم تحديث العيادات','ستظهر فقط العيادات المفعلة، ولكل عيادة قائمة وبيانات مستقلة.');
  }catch(error){$('clinicsError').textContent=error.message}
  finally{$('saveClinicsBtn').disabled=false}
}
function switchClinic(clinicId){
  if(!clinicDirectory.some(clinic=>clinic.id===clinicId&&clinic.active))return;
  const params=new URLSearchParams(location.search);
  params.set('clinic',clinicId);
  params.set('view',VIEW_MODE);
  params.set('date',selectedDate||today());
  location.href=`${location.pathname}?${params.toString()}`;
}
let treatmentCatalog=[];
let treatmentCatalogLoadedAt=0;
let paymentCatalogProfile={favorites:[],usage:{}};
const DEFAULT_TREATMENT_CATALOG=[
  ['cosmetic-filling','حشوة تجميلية'],['post-rct-filling','حشوة تجميلية بعد علاج العصب'],
  ['root-canal','علاج عصب'],['root-canal-retreatment','إعادة علاج عصب'],
  ['remove-post','إزالة وتد'],['place-post','تركيب وتد'],['remove-crown','إزالة تاج'],
  ['recement-crown','إعادة تثبيت تاج'],['ceramic-crown','تركيب سيراميك تاج'],
  ['ceramic-veneer','تركيب سيراميك فينير'],['implant-crown','تركيبة زراعة'],
  ['implant-surgery','زراعة — الجزء الجراحي'],['extraction','خلع الأسنان'],
  ['temporary','تركيب مؤقت'],['smile-design','تصميم ابتسامة'],
  ['smile-analysis','تحليل ابتسامة'],['cleaning-standard','تنظيف أسنان عادي'],
  ['cleaning-gbt','تنظيف أسنان GBT'],['whitening-trays','قوالب تبييض'],['other','إجراء آخر']
].map(([id,name])=>({id,name,beforePrice:'',afterPrice:''}));
const treatmentCatalogLocalKey=()=>`bestcare_treatment_catalog_${ACTIVE_CLINIC_ID}`;
function paymentDoctorKey(){
  const doctor=String(currentClinic?.doctorName||authUser?.displayName||authUser?.username||'').trim().toLocaleLowerCase('ar').replace(/\s+/g,' ');
  return doctor||`${ACTIVE_CLINIC_ID}-default`;
}
const paymentProfileLocalKey=()=>`bestcare_payment_profile_${ACTIVE_CLINIC_ID}_${paymentDoctorKey()}`;
function normalizePaymentProfile(value){
  const validIds=new Set((treatmentCatalog.length?treatmentCatalog:DEFAULT_TREATMENT_CATALOG).map(item=>String(item.id)));
  const favorites=[...new Set((Array.isArray(value?.favorites)?value.favorites:[]).map(String).filter(id=>validIds.has(id)))];
  const usage={};
  Object.entries(value?.usage&&typeof value.usage==='object'?value.usage:{}).forEach(([id,count])=>{
    if(validIds.has(id))usage[id]=Math.max(0,Math.min(1000000,Math.round(Number(count)||0)));
  });
  return{favorites,usage};
}
function localPaymentProfile(){
  try{return normalizePaymentProfile(JSON.parse(localStorage.getItem(paymentProfileLocalKey())||'null'))}
  catch{return normalizePaymentProfile(null)}
}
function setPaymentProfile(profile){
  paymentCatalogProfile=normalizePaymentProfile(profile);
  localStorage.setItem(paymentProfileLocalKey(),JSON.stringify(paymentCatalogProfile));
  return paymentCatalogProfile;
}
function normalizeTreatmentCatalog(items){
  const seen=new Set();
  return (Array.isArray(items)?items:[]).map((item,index)=>{
    const name=String(item?.name||'').trim().slice(0,120);
    let id=String(item?.id||`service-${index+1}`).trim().replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,80)||`service-${index+1}`;
    while(seen.has(id))id=`${id}-${index+1}`;
    seen.add(id);
    const before=item?.beforePrice===''?'':Number(item?.beforePrice);
    const after=(item?.afterPrice??item?.price)===''?'':Number(item?.afterPrice??item?.price);
    return{id,name,beforePrice:Number.isFinite(before)?before:'',afterPrice:Number.isFinite(after)?after:''};
  }).filter(item=>item.name);
}
function localTreatmentCatalog(){
  try{
    const items=JSON.parse(localStorage.getItem(treatmentCatalogLocalKey())||'null');
    return Array.isArray(items)&&items.length?normalizeTreatmentCatalog(items):DEFAULT_TREATMENT_CATALOG.map(item=>({...item}));
  }catch{return DEFAULT_TREATMENT_CATALOG.map(item=>({...item}))}
}
function setTreatmentCatalog(items){
  treatmentCatalog=normalizeTreatmentCatalog(items);
  if(!treatmentCatalog.length)treatmentCatalog=DEFAULT_TREATMENT_CATALOG.map(item=>({...item}));
  localStorage.setItem(treatmentCatalogLocalKey(),JSON.stringify(treatmentCatalog));
  treatmentCatalogLoadedAt=Date.now();
  return treatmentCatalog;
}
function paymentProcedureCatalog(){
  const source=treatmentCatalog.length?treatmentCatalog:localTreatmentCatalog();
  const profile=paymentCatalogProfile?.favorites?paymentCatalogProfile:localPaymentProfile();
  const favorites=new Set(profile.favorites||[]);
  const originalOrder=new Map(source.map((item,index)=>[item.id,index]));
  return source.filter(item=>item.id!=='other'&&String(item.name||'').trim()).sort((a,b)=>{
    const favoriteDelta=Number(favorites.has(b.id))-Number(favorites.has(a.id));
    if(favoriteDelta)return favoriteDelta;
    const usageDelta=Number(profile.usage?.[b.id]||0)-Number(profile.usage?.[a.id]||0);
    return usageDelta||Number(originalOrder.get(a.id)||0)-Number(originalOrder.get(b.id)||0);
  });
}
async function refreshTreatmentCatalog({force=false}={}){
  if(!treatmentCatalog.length)treatmentCatalog=localTreatmentCatalog();
  if(!paymentCatalogProfile.favorites.length&&!Object.keys(paymentCatalogProfile.usage||{}).length)paymentCatalogProfile=localPaymentProfile();
  if(!force&&treatmentCatalogLoadedAt&&Date.now()-treatmentCatalogLoadedAt<30000)return treatmentCatalog;
  const response=await request(`/api/treatment-catalog?clinic=${encodeURIComponent(ACTIVE_CLINIC_ID)}&doctor=${encodeURIComponent(paymentDoctorKey())}`);
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'تعذر تحميل الإجراءات');
  setTreatmentCatalog(Array.isArray(data.items)&&data.items.length?data.items:DEFAULT_TREATMENT_CATALOG);
  setPaymentProfile(data.profile);
  return treatmentCatalog;
}
const catalogEscape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function renderTreatmentCatalog(){
  const list=$('treatmentCatalogList');
  list.innerHTML=treatmentCatalog.length?treatmentCatalog.map((item,index)=>`<div class="catalog-row" data-catalog-index="${index}"><input data-catalog-name maxlength="120" value="${catalogEscape(item.name)}" aria-label="اسم الإجراء"><input class="catalog-price" data-catalog-before-price type="number" min="0" step="0.01" inputmode="decimal" value="${catalogEscape(item.beforePrice??'')}" placeholder="قبل الخصم" aria-label="السعر قبل الخصم"><input class="catalog-price" data-catalog-after-price type="number" min="0" step="0.01" inputmode="decimal" value="${catalogEscape(item.afterPrice??item.price??'')}" placeholder="بعد الخصم" aria-label="السعر بعد الخصم"><button class="catalog-delete" type="button" data-catalog-delete="${index}" title="حذف">×</button></div>`).join(''):'<div class="catalog-empty">لا توجد إجراءات. أضف أول إجراء من الزر أدناه.</div>';
}
async function openTreatmentCatalog(){
  setSettingsMenuOpen(false);
  treatmentCatalog=localTreatmentCatalog();
  $('treatmentCatalogError').textContent='جارٍ مزامنة القائمة المركزية…';
  renderTreatmentCatalog();
  openModal('treatmentCatalogModal');
  try{
    await refreshTreatmentCatalog({force:true});
    $('treatmentCatalogError').textContent='';$('treatmentCatalogError').classList.remove('catalog-warning');
    renderTreatmentCatalog();
  }catch(error){
    $('treatmentCatalogError').textContent='تم فتح قائمة الإجراءات المتاحة ويمكنك المتابعة؛ ستُعاد محاولة المزامنة المركزية عند الحفظ.';$('treatmentCatalogError').classList.add('catalog-warning');
    console.warn('Treatment catalog fallback used',error);
  }
}
function collectTreatmentCatalog(){
  document.querySelectorAll('[data-catalog-index]').forEach(row=>{const item=treatmentCatalog[Number(row.dataset.catalogIndex)];if(!item)return;item.name=row.querySelector('[data-catalog-name]').value.trim();const before=row.querySelector('[data-catalog-before-price]').value,after=row.querySelector('[data-catalog-after-price]').value;item.beforePrice=before===''?'':Number(before);item.afterPrice=after===''?'':Number(after);delete item.requiresLab;delete item.price});
}
async function saveTreatmentCatalog(){
  collectTreatmentCatalog();const items=treatmentCatalog.filter(item=>item.name);$('treatmentCatalogError').classList.remove('catalog-warning');$('treatmentCatalogError').textContent='جارٍ الحفظ…';
  setTreatmentCatalog(items);
  try{const response=await request(`/api/treatment-catalog?clinic=${encodeURIComponent(ACTIVE_CLINIC_ID)}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({items})});const data=await response.json();if(!response.ok)throw new Error(data.error||'تعذر حفظ القائمة');setTreatmentCatalog(data.items||items);if($('paymentModal').classList.contains('open'))renderPaymentProcedureOptions(true);$('treatmentCatalogError').textContent='';closeModal('treatmentCatalogModal');toast('تم تحديث الإجراءات والخدمات','حُفظت القائمة مركزيًا وستظهر تلقائيًا في الخطط العلاجية وأوامر الدفع لهذه العيادة.')}catch(error){$('treatmentCatalogError').textContent='حُفظت التعديلات على هذا الجهاز، لكن تعذر حفظها مركزيًا. تحقق من الاتصال ثم أعد المحاولة.';console.error('Treatment catalog central save failed',error)}
}
async function saveUser(){const body={username:$('newUsername').value.trim(),displayName:$('newDisplayName').value.trim(),phone:$('newPhone').value.trim(),role:$('newRole').value,clinicId:$('newClinicId').value.trim()};$('usersError').textContent='جارٍ الحفظ…';try{const {data}=await authRequest('?action=users',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!data.ok){$('usersError').textContent=data.error||'تعذر حفظ المستخدم';return}closeModal('usersModal');toast('تم حفظ المستخدم','سيتمكن من الدخول برمز تحقق SMS بعد ضبط مزود الرسائل.')}catch(error){$('usersError').textContent=error.message}}
async function logoutApp(){
  setSettingsMenuOpen(false);
  if(!confirm(lang==='en'?'Sign out from this device?':'تسجيل الخروج من هذا الجهاز؟'))return;
  try{await stopPresence(true);await authRequest('?action=logout',{method:'POST'})}catch(error){console.warn('Logout request failed',error)}
  finally{
    authLastActivity=0;
    lockApp(lang==='en'?'Signed out securely.':'تم تسجيل الخروج بأمان.');
    $('authUsername')?.focus();
  }
}
function isProtectedWorkWindow(value=Date.now()){const hour=Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Riyadh',hour:'2-digit',hourCycle:'h23'}).format(new Date(value)));return hour>=14&&hour<23}
function startAuthIdleProtection(){if(window.__authIdleStarted)return;window.__authIdleStarted=true;const touch=()=>{authLastActivity=Date.now()};['click','keydown','touchstart','pointermove'].forEach(type=>window.addEventListener(type,touch,{passive:true}));setInterval(async()=>{if(!authLastActivity)return;if(isProtectedWorkWindow()){authLastActivity=Date.now()}else if(Date.now()-authLastActivity>=5*60*60*1000){try{await authRequest('?action=logout',{method:'POST'})}finally{lockApp();return}}if(Date.now()-authKeepAliveAt>10*60*1000){authKeepAliveAt=Date.now();try{const {response}=await authRequest('?action=session');if(response.status===401)lockApp()}catch{}}},60000)}
const statusText=status=>(lang==='en'?EN[status]:STATUS[status])||status;
let sync={
  revision:0,
  updatedAt:0,
  dirty:false,
  pushing:false,
  pulling:false,
  ready:false,
  error:'',
  pushTimer:null,
  pollTimer:null,
  autoTimer:null,
  autoStarted:false,
  lastSync:0,
  localVersion:0,
  localUpdatedAt:0
};
let syncChannel=null;
const localKey=d=>`bestcare_dashboard_v4_${ACTIVE_CLINIC_ID}_${d}`;
function cleanupOldLocalPatientData(){
  const cutoff=Date.now()-24*60*60*1000;
  const prefix='bestcare_dashboard_v4_';
  for(let index=localStorage.length-1;index>=0;index--){
    const key=localStorage.key(index);
    if(!key?.startsWith(prefix))continue;
    try{
      const record=JSON.parse(localStorage.getItem(key)||'null');
      if(!record||!record.pending||Number(record.localUpdatedAt||0)<cutoff)localStorage.removeItem(key);
    }catch{localStorage.removeItem(key)}
  }
}
function purgeSensitiveLocalData(){
  const prefixes=['bestcare_dashboard_v4_','bestcare_treatment_source_','bestcare_treatment_plan_'];
  for(let index=localStorage.length-1;index>=0;index--){
    const key=localStorage.key(index);
    if(prefixes.some(prefix=>key?.startsWith(prefix)))localStorage.removeItem(key);
  }
}
const stateUrl=(date,nonce=false)=>`${API}?date=${encodeURIComponent(date)}&clinic=${encodeURIComponent(ACTIVE_CLINIC_ID)}${nonce?`&_=${Date.now()}`:''}`;
const today=()=>{const d=new Date();const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`;};
const firstName=v=>String(v||'مريض').trim().split(/\s+/)[0];
const mins=t=>{const [h,m]=String(t||'0:0').split(':').map(Number);return h*60+m};
const timeDate=t=>{const d=/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)?new Date(`${selectedDate}T00:00:00`):new Date();const [h,m]=String(t||'0:0').split(':').map(Number);d.setHours(h,m,0,0);return d};
const fmtMs=ms=>{const sign=ms<0?'-':'';ms=Math.abs(ms);const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000);return sign+[h,m,s].map(v=>String(v).padStart(2,'0')).join(':')};
function toast(title,msg){const el=document.createElement('div');el.className='toast';el.innerHTML=`<strong>${escapeHtml(title)}</strong><div>${escapeHtml(msg)}</div>`;$('toastWrap').appendChild(el);setTimeout(()=>el.remove(),4200)}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function soundAlertsEnabled(){return localStorage.getItem('bestcare_sound_alerts')!=='disabled'}
function prepareAudio(){
  try{
    audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();
    if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
    return audioContext;
  }catch{return null}
}
function playToneSequence(notes,{volume=.13,type='sine'}={}){
  if(!soundAlertsEnabled())return false;
  const context=prepareAudio();if(!context||context.state==='closed')return false;
  const start=context.currentTime+.025;
  notes.forEach((note,index)=>{
    const oscillator=context.createOscillator(),gain=context.createGain();
    const at=start+Number(note.at??index*.12),duration=Number(note.duration||.14);
    oscillator.type=note.type||type;
    oscillator.frequency.setValueAtTime(Number(note.frequency||440),at);
    gain.gain.setValueAtTime(.0001,at);
    gain.gain.exponentialRampToValueAtTime(Math.max(.001,Number(note.volume||volume)),at+.018);
    gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);oscillator.stop(at+duration+.025);
  });
  return true;
}
function playLoginSignature(){
  playToneSequence([
    {frequency:523.25,at:0,duration:.16,volume:.075},
    {frequency:659.25,at:.11,duration:.18,volume:.085},
    {frequency:783.99,at:.23,duration:.25,volume:.095},
    {frequency:1046.5,at:.38,duration:.34,volume:.075}
  ],{type:'sine'});
}
function playAlertSound(kind='manual'){
  const important=String(kind).includes('cancel')||String(kind).includes('delay')||kind==='manual';
  playToneSequence(important?[
    {frequency:740,at:0,duration:.18,volume:.13,type:'triangle'},
    {frequency:554,at:.18,duration:.2,volume:.15,type:'triangle'},
    {frequency:740,at:.42,duration:.24,volume:.13,type:'triangle'}
  ]:[
    {frequency:659.25,at:0,duration:.16,volume:.11},
    {frequency:880,at:.15,duration:.22,volume:.12}
  ],{type:'sine'});
}
function updateSoundButton(){
  const button=$('soundAlertsBtn');if(!button)return;
  const enabled=soundAlertsEnabled();
  button.classList.toggle('sound-enabled',enabled);
  button.textContent=enabled?(lang==='en'?'🔊 Sound alerts enabled':'🔊 التنبيهات الصوتية مفعلة'):(lang==='en'?'🔇 Enable sound alerts':'🔇 تفعيل التنبيهات الصوتية');
}
function toggleSoundAlerts(){
  const enable=!soundAlertsEnabled();
  localStorage.setItem('bestcare_sound_alerts',enable?'enabled':'disabled');
  updateSoundButton();
  if(enable){prepareAudio();playAlertSound('test');toast('تم تفعيل الصوت','ستعمل نغمة واضحة عند وصول تنبيه جديد.')}
  else toast('تم إيقاف الصوت','لن تصدر نغمة داخل التطبيق حتى إعادة التفعيل.');
}
const modalReturnFocus=new Map();
function modalFocusable(modal){return [...modal.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(element=>!element.hidden&&element.offsetParent!==null)}
function openModal(id){
  const modal=$(id);if(!modal)return;
  if(!authReady)return;
  modalReturnFocus.set(id,document.activeElement);
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');
  modal.classList.add('open');
  modal.removeAttribute('aria-hidden');
  requestAnimationFrame(()=>modalFocusable(modal)[0]?.focus());
}
function closeModal(id){
  const modal=$(id);if(!modal)return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
  const returnTarget=modalReturnFocus.get(id);
  modalReturnFocus.delete(id);
  if(returnTarget?.isConnected)requestAnimationFrame(()=>returnTarget.focus());
}
function setBadge(mode,text,detail=''){
  els.syncBadge.className='sync-badge '+mode;
  els.syncBadge.textContent=text;
  els.syncBadge.title=`${detail||text} | build ${DASHBOARD_BUILD}`;
  els.syncBadge.dataset.build=DASHBOARD_BUILD;
}
function setIdleSyncBadge(detail=''){
  const cadence=syncCadence();
  setBadge(cadence.workHours?'synced':'scheduled',syncCadenceCopy(cadence),detail||(lang==='en'?'Full live sync: Sat–Thu, 2:00 PM–11:00 PM (Riyadh)':'المزامنة المباشرة: السبت–الخميس، ٢:٠٠م–١١:٠٠م بتوقيت الرياض'));
}
const IS_DEPLOY_PREVIEW=/^deploy-preview-\d+--/i.test(location.hostname);
let pushSubscriptionActive=null;
function systemNotificationsEnabled(){return !IS_DEPLOY_PREVIEW&&'Notification' in window&&Notification.permission==='granted'&&localStorage.getItem('bestcare_system_notifications')==='enabled'}
async function currentPushSubscription(){
  if(!('serviceWorker' in navigator)||!('PushManager' in window))return null;
  try{
    const registration=await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  }catch(error){
    console.warn('Push subscription state unavailable',error);
    return null;
  }
}
async function refreshPushSubscriptionState(){
  const subscription=await currentPushSubscription();
  pushSubscriptionActive=Boolean(subscription);
  if(pushSubscriptionActive&&Notification.permission==='granted'){
    localStorage.setItem('bestcare_system_notifications','enabled');
    localStorage.setItem('bestcare_push_registered','enabled');
  }else if(!pushSubscriptionActive){
    localStorage.removeItem('bestcare_system_notifications');
    localStorage.removeItem('bestcare_push_registered');
  }
  updateNotificationsButton();
  return subscription;
}
function urlBase64ToUint8Array(value){
  const padding='='.repeat((4-value.length%4)%4),base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);return Uint8Array.from([...raw].map(char=>char.charCodeAt(0)));
}
async function ensurePushSubscription(){
  if(!systemNotificationsEnabled()||!('serviceWorker' in navigator)||!('PushManager' in window))return false;
  const registration=await navigator.serviceWorker.ready;
  let subscription=await registration.pushManager.getSubscription();
  if(!subscription){
    const response=await fetch(PUSH_API,{cache:'no-store'});if(!response.ok)throw new Error('Push service unavailable');
    const {publicKey}=await response.json();
    subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(publicKey)});
  }
  const saved=await fetch(PUSH_API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({subscription:subscription.toJSON(),role:VIEW_MODE,clientId:CLIENT_ID,clinicId:ACTIVE_CLINIC_ID})});
  if(!saved.ok)throw new Error('Subscription save failed');
  localStorage.setItem('bestcare_push_registered','enabled');return true;
}
function updateNotificationsButton(){
  const button=$('notificationsBtn');if(!button)return;
  if(IS_DEPLOY_PREVIEW){
    button.classList.remove('notification-enabled','notification-denied');
    button.textContent=lang==='en'?'🔕 Preview notifications disabled':'🔕 تنبيهات المعاينة متوقفة';
    button.title=lang==='en'?'Enable external notifications on the final site only.':'فعّل التنبيهات الخارجية من الرابط النهائي فقط.';
    return;
  }
  const enabled=systemNotificationsEnabled()&&(pushSubscriptionActive!==false);
  button.classList.toggle('notification-enabled',enabled);
  button.classList.toggle('notification-denied','Notification' in window&&Notification.permission==='denied');
  button.textContent=enabled?(lang==='en'?'🔕 Disable system notifications':'🔕 إيقاف إشعارات النظام'):('Notification' in window&&Notification.permission==='denied'?(lang==='en'?'🔕 Notifications blocked':'🔕 الإشعارات محظورة'):(lang==='en'?'🔔 Enable system notifications':'🔔 تفعيل إشعارات النظام'));
  button.title=enabled?(lang==='en'?'Stop Best Care alerts on this device.':'إيقاف تنبيهات أفضل عناية على هذا الجهاز.'):(lang==='en'?'Enable Best Care alerts on this device.':'تفعيل تنبيهات أفضل عناية على هذا الجهاز.');
}
async function requestSystemNotifications(){
  if(IS_DEPLOY_PREVIEW){
    toast(lang==='en'?'Preview notifications are disabled':'التنبيهات الخارجية متوقفة في المعاينة',lang==='en'?'Test the interface here; enable notifications only on the final site.':'اختبر الواجهة هنا، وفعّل إشعارات النظام من الرابط النهائي فقط لمنع تصنيفها كإزعاج.');
    return;
  }
  if(!('Notification' in window)){toast(lang==='en'?'Notifications unavailable':'الإشعارات غير متاحة',lang==='en'?'This browser does not support system notifications.':'هذا المتصفح لا يدعم إشعارات النظام.');return}
  if(Notification.permission==='denied'){
    toast(lang==='en'?'Notifications are blocked':'الإشعارات محظورة',lang==='en'?'Open site settings, allow Notifications, then reload the app.':'افتح إعدادات الموقع من رمز القفل بجانب الرابط، اختر الإشعارات: سماح، ثم أعد فتح التطبيق.');return;
  }
  const permission=await Notification.requestPermission();
  if(permission==='granted'){
    localStorage.setItem('bestcare_system_notifications','enabled');
    updateNotificationsButton();
    try{await ensurePushSubscription();showSystemNotification({source:'manual-test',type:'patient',title:lang==='en'?'Best Care push notifications enabled':'تم تفعيل تنبيهات أفضل عناية الخارجية',body:lang==='en'?'Updates will arrive even when the app is closed.':'ستصل تحديثات المراجعين والفواتير حتى عند إغلاق التطبيق.'})}
    catch(error){console.warn('Push subscription failed',error);toast('تعذر ربط التنبيه الخارجي','تحقق من الاتصال ثم اضغط زر التفعيل مرة أخرى.')}
  }else{
    localStorage.removeItem('bestcare_system_notifications');
    updateNotificationsButton();
    toast(lang==='en'?'Notifications not enabled':'لم يتم تفعيل الإشعارات',lang==='en'?'Allow notifications from the browser or device settings.':'اسمح بالإشعارات من إعدادات المتصفح أو الجهاز.');
  }
}
async function disableSystemNotifications(){
  const wasEnabled=localStorage.getItem('bestcare_system_notifications')==='enabled';
  localStorage.removeItem('bestcare_push_registered');
  localStorage.removeItem('bestcare_system_notifications');
  pushSubscriptionActive=false;
  updateNotificationsButton();
  try{
    const subscription=await currentPushSubscription();
    if(subscription){
      const endpoint=subscription.endpoint;
      await subscription.unsubscribe();
      await fetch(PUSH_API,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({endpoint})}).catch(()=>{});
    }
  }catch(error){console.warn('Push unsubscribe failed',error)}
  if(wasEnabled||pushSubscriptionActive===false)toast(lang==='en'?'Notifications disabled':'تم إيقاف الإشعارات',lang==='en'?'Best Care alerts have been stopped on this device.':'توقفت تنبيهات أفضل عناية على هذا الجهاز.');
}
async function toggleSystemNotifications(){
  const button=$('notificationsBtn');
  if(button)button.disabled=true;
  try{
    const subscription=await currentPushSubscription();
    pushSubscriptionActive=Boolean(subscription);
    if(subscription||localStorage.getItem('bestcare_system_notifications')==='enabled')await disableSystemNotifications();
    else await requestSystemNotifications();
  }finally{
    if(button)button.disabled=false;
    await refreshPushSubscriptionState();
  }
}
async function showSystemNotification(event){
  if(!event||!systemNotificationsEnabled())return;
  if(localStorage.getItem('bestcare_push_registered')==='enabled'&&event.source!=='manual-test')return;
  if(event.type==='payment'&&VIEW_MODE!=='admin')return;
  const options={body:event.body||'',icon:'./assets/icons/icon-192.png',badge:'./assets/icons/icon-192.png',tag:event.tag||`bestcare-${event.type||'update'}`,renotify:false,vibrate:[160,70,180],data:{url:viewUrl(event.type==='payment'?'admin':VIEW_MODE)}};
  try{
    if('serviceWorker' in navigator){const registration=await navigator.serviceWorker.ready;await registration.showNotification(event.title,options)}
    else new Notification(event.title,options);
  }catch(error){console.warn('System notification unavailable',error)}
}
function detectRemoteNotification(previousPatients,previousAlert,data){
  const nextPatients=Array.isArray(data?.patients)?data.patients:[];
  const previousMap=new Map(previousPatients.map(p=>[String(p.id),p]));
  for(const patient of nextPatients){
    const old=previousMap.get(String(patient.id));
    if(!old)return {type:'patient',title:lang==='en'?'New patient update':'تحديث جديد على المراجعين',body:lang==='en'?`${firstName(patient.name)} was added to the list.`:`تمت إضافة ${firstName(patient.name)} إلى القائمة.`,tag:`patient-${patient.id}`};
    if(Number(patient.paymentRequestedAt||0)>Number(old.paymentRequestedAt||0))return {type:'payment',title:lang==='en'?'New payment order':'أمر دفع جديد',body:lang==='en'?`Payment action requested for ${firstName(patient.name)}.`:`تم إرسال أمر دفع للمريض ${firstName(patient.name)}.`,tag:`payment-${patient.id}`};
    if(Number(patient.paymentAcknowledgedAt||0)>Number(old.paymentAcknowledgedAt||0))return {type:'payment',title:lang==='en'?'Payment order received':'تم استلام أمر الدفع',body:lang==='en'?`Administration received the payment order for ${firstName(patient.name)}.`:`استلمت الإدارة أمر الدفع للمريض ${firstName(patient.name)}.`,tag:`payment-${patient.id}`};
    if(Number(patient.paymentCompletedAt||0)>Number(old.paymentCompletedAt||0))return {type:'payment',title:lang==='en'?'Payment completed':'تم تنفيذ الدفع',body:lang==='en'?`Payment was completed for ${firstName(patient.name)}.`:`تم تنفيذ الدفع للمريض ${firstName(patient.name)}.`,tag:`payment-${patient.id}`};
    if(String(patient.treatmentPlanStatus||'')!==String(old.treatmentPlanStatus||''))return {type:'patient',title:lang==='en'?'Treatment plan updated':'تحديث حالة الخطة العلاجية',body:`${firstName(patient.name)} — ${planStatusText(patient.treatmentPlanStatus)}`,tag:`plan-${patient.id}`};
    if(String(patient.status||'')!==String(old.status||''))return {type:'patient',title:lang==='en'?'Patient status updated':'تحديث حالة مراجع',body:`${firstName(patient.name)} — ${statusText(patient.status)}`,tag:`patient-${patient.id}`};
  }
  const nextAlert=data?.updateAlert;
  if(nextAlert?.active&&Number(nextAlert.updatedAt||0)>Number(previousAlert?.updatedAt||0))return {type:String(nextAlert.kind||'').startsWith('payment')?'payment':'patient',title:lang==='en'?'Best Care update':'تنبيه جديد من أفضل عناية',body:String(nextAlert.message||tr('defaultAlert')),tag:`alert-${nextAlert.kind||'update'}`};
  return null;
}
function serialize(){return {date:selectedDate,clinic:{id:currentClinic.id,name:currentClinic.name,doctorName:currentClinic.doctorName,roomNumber:currentClinic.roomNumber},patients:patients.map(p=>({...p})),notes,updateAlert:{...updateAlert},clientId:CLIENT_ID,clientUpdatedAt:Date.now(),expectedRevision:sync.ready?sync.revision:undefined}}
function loadLocal(date){
  try{
    const v=JSON.parse(localStorage.getItem(localKey(date))||'null');
    const freshPending=Boolean(v?.pending)&&Date.now()-Number(v?.localUpdatedAt||0)<24*60*60*1000;
    if(!freshPending)localStorage.removeItem(localKey(date));
    patients=freshPending&&Array.isArray(v?.patients)?v.patients.map(p=>({...p})):[];
    notes=freshPending?String(v?.notes||''):'';
    updateAlert=freshPending&&v?.updateAlert&&typeof v.updateAlert==='object'?{...v.updateAlert}:{active:false,message:'',updatedAt:0,kind:''};
    sync.dirty=freshPending;
    sync.localUpdatedAt=freshPending?Number(v?.localUpdatedAt||0):0;
  }catch{
    patients=[];
    notes='';
    updateAlert={active:false,message:'',updatedAt:0,kind:''};
    sync.dirty=false;
    sync.localUpdatedAt=0;
  }
  els.notes.value=notes;
  render();
}
function persistLocal(pending=sync.dirty){
  if(!pending){
    localStorage.removeItem(localKey(selectedDate));
    return;
  }
  localStorage.setItem(localKey(selectedDate),JSON.stringify({
    ...serialize(),
    pending:Boolean(pending),
    localUpdatedAt:Number(sync.localUpdatedAt||Date.now())
  }));
}
function markDirty(){
  sync.dirty=true;
  sync.localVersion+=1;
  sync.localUpdatedAt=Date.now();
  persistLocal(true);
  render();
  clearTimeout(sync.pushTimer);
  sync.pushTimer=setTimeout(async()=>{
    await pushState();
    scheduleAutomaticSync(syncCadence().delay);
  },100);
}
async function request(url,options={},timeout=12000){const c=new AbortController();const timer=setTimeout(()=>c.abort(),timeout);try{return await fetch(url,{...options,signal:c.signal,cache:'no-store',headers:{accept:'application/json',...(options.headers||{})}})}finally{clearTimeout(timer)}}
function normalizeManualAlert(value){
  const scope=value?.scope==='clinic'?'clinic':'all';
  const targetClinicId=scope==='clinic'&&/^clinic-([1-9]|1[0-5])$/.test(String(value?.targetClinicId||''))?String(value.targetClinicId):'';
  return {
    active:Boolean(value?.active),
    message:String(value?.message||'').slice(0,220),
    kind:'manual',
    scope:targetClinicId?'clinic':'all',
    targetClinicId,
    targetClinicLabel:targetClinicId?String(value?.targetClinicLabel||'').slice(0,120):'',
    updatedAt:Number(value?.updatedAt||0),
    updatedBy:String(value?.updatedBy||'').slice(0,120)
  };
}
async function refreshManualAlert(force=false){
  const now=Date.now();
  if(!authReady||(!force&&now-manualAlertFetchedAt<5000))return false;
  const previousUpdatedAt=Number(manualAlert.updatedAt||0);
  const hadFetched=manualAlertFetchedAt>0;
  manualAlertFetchedAt=now;
  try{
    const response=await request(`${ALERTS_API}?_=${now}`);
    if(response.status===401){lockApp('انتهت الجلسة. سجّل الدخول مرة أخرى.');return false}
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'تعذر تحميل التنبيه الموجّه');
    manualAlert=normalizeManualAlert(data.alert);
    renderAlertUI();
    renderDoctorWorkspace();
    if(hadFetched&&manualAlert.active&&manualAlert.updatedAt>previousUpdatedAt){
      playAlertSound(manualAlert.kind);
      showSystemNotification({
        source:'central-alert',
        type:'patient',
        title:manualAlert.scope==='all'?(lang==='en'?'General administration alert':'تنبيه عام من الإدارة'):(lang==='en'?'Targeted administration alert':'تنبيه موجه من الإدارة'),
        body:manualAlert.message,
        tag:`manual-alert-${manualAlert.updatedAt}`
      });
    }
    return true;
  }catch(error){
    console.warn('Central alert refresh failed',error);
    return false;
  }
}
function populateAlertClinicOptions(){
  const active=clinicDirectory.filter(clinic=>clinic.active);
  els.alertTargetClinic.innerHTML=active.map(clinic=>`<option value="${clinic.id}">${escapeHtml(clinicDisplayName(clinic))}</option>`).join('');
  if(manualAlert.targetClinicId&&active.some(clinic=>clinic.id===manualAlert.targetClinicId))els.alertTargetClinic.value=manualAlert.targetClinicId;
  else if(active.some(clinic=>clinic.id===ACTIVE_CLINIC_ID))els.alertTargetClinic.value=ACTIVE_CLINIC_ID;
}
function updateAlertTargetUI(){
  const scope=document.querySelector('input[name="alertScope"]:checked')?.value==='clinic'?'clinic':'all';
  els.alertClinicPicker.hidden=scope!=='clinic';
  const clinic=clinicDirectory.find(item=>item.id===els.alertTargetClinic.value);
  const summary=scope==='all'
    ?(lang==='en'?'This alert will reach every active clinic.':'سيصل التنبيه إلى جميع العيادات المفعلة.')
    :(clinic?(lang==='en'?`This alert will reach ${clinicDisplayName(clinic)} only.`:`سيصل التنبيه إلى ${clinicDisplayName(clinic)} فقط.`):(lang==='en'?'Choose the target clinic.':'اختر العيادة المستلمة.'));
  els.alertTargetSummary.querySelector('span:last-child').textContent=summary;
  $('sendAlertBtn').disabled=scope==='clinic'&&!clinic;
}
function presenceCopy(){
  return lang==='en'
    ?{devices:'devices online',total:'Total devices',admin:'Administration page',clinics:'Clinic pages',desktop:'Desktop',mobile:'Mobile',tablet:'Tablet',updated:'Last updated',waiting:'Waiting for the first update…',unavailable:'Device count temporarily unavailable'}
    :{devices:'أجهزة متصلة',total:'إجمالي الأجهزة',admin:'صفحة الإدارة',clinics:'صفحات العيادات',desktop:'كمبيوتر',mobile:'جوال',tablet:'جهاز لوحي',updated:'آخر تحديث',waiting:'بانتظار أول تحديث…',unavailable:'تعذر تحديث عدد الأجهزة مؤقتًا'};
}
function renderPresence(){
  const copy=presenceCopy();
  $('presenceCount').textContent=presence.updatedAt?String(presence.online):'—';
  $('presenceLabel').textContent=copy.devices;
  els.presenceBadge.classList.toggle('online',Boolean(presence.updatedAt&&!presence.error));
  els.presenceBadge.title=presence.error?copy.unavailable:`${copy.total}: ${presence.online}`;
  $('presenceTotal').textContent=String(presence.online||0);
  $('presenceAdmin').textContent=String(presence.administration||0);
  $('presenceClinics').textContent=String(presence.clinics||0);
  $('presenceTotalLabel').textContent=copy.total;
  $('presenceAdminLabel').textContent=copy.admin;
  $('presenceClinicsLabel').textContent=copy.clinics;
  $('presenceDesktop').textContent=`🖥️ ${copy.desktop}: ${presence.desktop||0}`;
  $('presenceMobile').textContent=`📱 ${copy.mobile}: ${presence.mobile||0}`;
  $('presenceTablet').textContent=`▣ ${copy.tablet}: ${presence.tablet||0}`;
  const clinicRows=Object.entries(presence.byClinic||{})
    .filter(([,count])=>Number(count)>0)
    .sort(([left],[right])=>clinicNumber(left)-clinicNumber(right))
    .map(([clinicId,count])=>{
      const clinic=clinicDirectory.find(item=>item.id===clinicId)||defaultClinic(clinicNumber(clinicId));
      return `<div class="presence-clinic-row"><span>${escapeHtml(clinicDisplayName(clinic,{compact:true}))}</span><strong>${Number(count)}</strong></div>`;
    }).join('');
  $('presenceClinicList').innerHTML=clinicRows;
  $('presenceUpdated').textContent=presence.error
    ?copy.unavailable
    :(presence.updatedAt?`${copy.updated}: ${new Date(presence.updatedAt).toLocaleTimeString(lang==='en'?'en-US':'ar-SA',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`:copy.waiting);
}
function schedulePresence(delay=presenceCadence()){
  clearTimeout(presence.timer);
  if(!presence.started||!authReady)return;
  presence.timer=setTimeout(()=>refreshPresence({silent:true}),delay);
}
async function refreshPresence({silent=false}={}){
  if(!authReady||presence.busy)return;
  presence.busy=true;
  try{
    const response=await request(PRESENCE_API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId:DEVICE_ID,clinicId:ACTIVE_CLINIC_ID,view:VIEW_MODE,standalone:isStandalone()})},8000);
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
    presence={...presence,...data,byClinic:data.byClinic||{},updatedAt:Number(data.updatedAt||Date.now()),error:'',busy:false};
    renderPresence();
  }catch(error){
    presence.error=String(error?.message||error);
    presence.busy=false;
    renderPresence();
    if(!silent)toast(lang==='en'?'Device count unavailable':'تعذر تحديث عدد الأجهزة',lang==='en'?'The app will retry automatically.':'سيعيد التطبيق المحاولة تلقائيًا.');
  }finally{
    presence.busy=false;
    schedulePresence();
  }
}
function startPresence(){
  if(presence.started)return;
  presence.started=true;
  renderPresence();
  if(!window.__presenceListeners){
    window.__presenceListeners=true;
    window.addEventListener('online',()=>schedulePresence(1000));
    window.addEventListener('focus',()=>schedulePresence(syncCadence().workHours?1000:presenceCadence()));
    document.addEventListener('visibilitychange',()=>schedulePresence(document.hidden?presenceCadence():(syncCadence().workHours?1000:presenceCadence())));
  }
  refreshPresence({silent:true});
}
async function stopPresence(remove=false){
  presence.started=false;
  clearTimeout(presence.timer);
  presence.timer=null;
  if(remove&&authReady){
    try{await request(PRESENCE_API,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId:DEVICE_ID})},4000)}catch{}
  }
  presence={online:0,administration:0,clinics:0,desktop:0,mobile:0,tablet:0,byClinic:{},updatedAt:0,timer:null,started:false,busy:false,error:''};
  renderPresence();
}
function adminPatientReasons(patient){
  const reasons=[];
  const add=(type,label,priority=3)=>reasons.push({type,label,priority});
  const payment=paymentStage(patient);
  if(payment==='requested')add('payment',lang==='en'?'Payment order awaiting receipt':'أمر دفع بانتظار الاستلام',0);
  else if(payment==='received')add('payment',lang==='en'?'Payment order awaiting completion':'أمر دفع بانتظار التنفيذ',0);
  const planStatus=effectiveTreatmentPlanStatus(patient);
  const planCopy=lang==='en'
    ?{draft:'Unapproved treatment-plan draft',submitted:'Plan awaiting administration review',patient_accepted:'Patient accepted — final approval required',approved:'Approved plan — signature pending',rejected:'Plan returned for revision'}
    :{draft:'مسودة خطة غير معتمدة',submitted:'خطة بانتظار مراجعة الإدارة',patient_accepted:'وافق المريض — تحتاج اعتمادًا نهائيًا',approved:'خطة معتمدة — التوقيع معلق',rejected:'خطة معادة للتعديل'};
  if(planCopy[planStatus])add('plan',planCopy[planStatus],planStatus==='rejected'?1:0);
  const status=String(patient?.status||'waiting');
  const statusCopy=lang==='en'
    ?{
      asks_delay:['urgent','Patient is asking about the delay',0],
      cancel:['warning','Appointment cancelled — follow-up required',1],
      left:['warning','Patient left the clinic',1],
      arrived:['arrival','Patient arrived',2],
      early_arrival:['arrival','Patient arrived early',2],
      late:['warning','Appointment is delayed',1]
    }
    :{
      asks_delay:['urgent','المريض يستفسر عن التأخير',0],
      cancel:['warning','موعد ملغي — يحتاج متابعة',1],
      left:['warning','المريض غادر العيادة',1],
      arrived:['arrival','وصل المريض',2],
      early_arrival:['arrival','وصول مبكر',2],
      late:['warning','الموعد متأخر',1]
    };
  if(statusCopy[status])add(...statusCopy[status]);
  if(isZeroFileNumber(patient?.file)&&['arrived','early_arrival','active'].includes(status))add('identity','يلزم تحديث رقم الملف عند وصول المريض',0);
  const hasOpenAction=reasons.some(reason=>reason.type==='payment'||reason.type==='plan');
  if(status==='done'&&!hasOpenAction&&!patient?.paymentCompletedAt&&planStatus!=='approved_signed'){
    add('done',lang==='en'?'Treatment completed — review next action':'اكتمل العلاج — راجع الإجراء التالي',2);
  }
  if(Number(patient?.adminUpdatedAt||0)>0&&status==='waiting'&&!hasOpenAction){
    add('updated',lang==='en'?'Appointment information updated':'تم تحديث بيانات الموعد',3);
  }
  return reasons;
}
function adminPatientActivityAt(patient,recordUpdatedAt=0){
  return Math.max(
    Number(patient?.paymentRequestedAt||0),
    Number(patient?.paymentAcknowledgedAt||0),
    Number(patient?.paymentCompletedAt||0),
    Number(patient?.treatmentPlanUpdatedAt||0),
    Number(patient?.completedAt||0),
    Number(patient?.arrivedAt||0),
    Number(patient?.actualStartedAt||0),
    Number(patient?.adminUpdatedAt||0),
    Number(recordUpdatedAt||0)
  );
}
function adminHubAllPatients(){
  return adminPatientHub.records.flatMap(record=>(Array.isArray(record?.patients)?record.patients:[]).map(patient=>({
    patient,
    clinic:record.clinic||defaultClinic(clinicNumber(record?.clinic?.id)),
    recordUpdatedAt:Number(record?.updatedAt||0),
    reasons:adminPatientReasons(patient)
  })));
}
function adminHubVisiblePatients(){
  const clinicFilter=$('adminHubClinicFilter')?.value||'all';
  const scope=$('adminHubScopeFilter')?.value||'attention';
  const query=String($('adminHubSearch')?.value||'').trim();
  return adminHubAllPatients()
    .filter(item=>clinicFilter==='all'||item.clinic.id===clinicFilter)
    .filter(item=>scope==='all'||item.reasons.length)
    .filter(item=>!query||patientMatchesSearch(item.patient,query)||normalizeSearchText(`${item.clinic.name||''} ${item.clinic.doctorName||''}`).includes(normalizeSearchText(query)))
    .sort((left,right)=>{
      if(scope==='attention'){
        const leftPriority=Math.min(...left.reasons.map(reason=>reason.priority),9);
        const rightPriority=Math.min(...right.reasons.map(reason=>reason.priority),9);
        if(leftPriority!==rightPriority)return leftPriority-rightPriority;
        const activityDiff=adminPatientActivityAt(right.patient,right.recordUpdatedAt)-adminPatientActivityAt(left.patient,left.recordUpdatedAt);
        if(activityDiff)return activityDiff;
      }
      return clinicNumber(left.clinic.id)-clinicNumber(right.clinic.id)||String(left.patient.start||'').localeCompare(String(right.patient.start||''));
    });
}
function syncAdminHubClinicOptions(){
  const select=$('adminHubClinicFilter');if(!select)return;
  const previous=select.value||'all';
  const recordClinics=adminPatientHub.records.map(record=>record.clinic).filter(Boolean);
  const active=recordClinics.length?recordClinics:clinicDirectory.filter(clinic=>clinic.active);
  select.innerHTML=`<option value="all">${lang==='en'?'All clinics':'جميع العيادات'}</option>${active.map(clinic=>`<option value="${escapeHtml(clinic.id)}">${escapeHtml(clinicDisplayName(clinic))}</option>`).join('')}`;
  select.value=[...select.options].some(option=>option.value===previous)?previous:'all';
}
function adminClinicUrl(clinicId,hash='patientListTitle'){
  const params=new URLSearchParams(location.search);
  params.set('view','admin');
  params.set('clinic',clinicId);
  params.set('date',selectedDate);
  return `${location.pathname}?${params.toString()}#${hash}`;
}
function adminPlanUrl(item){
  const params=new URLSearchParams({patientId:String(item.patient.id||''),date:selectedDate,clinic:item.clinic.id,view:'admin'});
  return `./treatment-plan.html?${params.toString()}`;
}
function renderAdminPatientHub(){
  const hub=$('adminPatientHub');if(!hub)return;
  hub.hidden=VIEW_MODE!=='admin';
  if(VIEW_MODE!=='admin')return;
  syncAdminHubClinicOptions();
  hub.classList.toggle('admin-hub-all-clinics',($('adminHubClinicFilter')?.value||'all')==='all');
  setText('#adminHubTitle',lang==='en'?'All-clinic patient follow-up':'متابعة مرضى جميع العيادات');
  setText('#adminHubHelp',lang==='en'?'Patients who need an administration action appear first. Filter by clinic or display every appointment.':'تظهر أولًا الحالات التي تحتاج تدخل الإدارة. اختر عيادة محددة أو اعرض جميع مواعيد اليوم.');
  setText('#adminHubClinicLabel',lang==='en'?'Clinic':'العيادة');
  setText('#adminHubScopeLabel',lang==='en'?'Display':'العرض');
  const scope=$('adminHubScopeFilter');
  if(scope){
    const value=scope.value||'attention';
    scope.innerHTML=`<option value="attention">${lang==='en'?'Administration actions only':'تحتاج تدخل الإدارة فقط'}</option><option value="all">${lang==='en'?'All daily patients':'جميع مرضى اليوم'}</option>`;
    scope.value=value;
  }
  if($('adminHubSearch'))$('adminHubSearch').placeholder=lang==='en'?'Search name, file, phone, or clinic':'بحث بالاسم أو الملف أو الجوال أو العيادة';
  setText('#adminHubRefresh',adminPatientHub.loading?(lang==='en'?'Refreshing…':'جارٍ التحديث…'):(lang==='en'?'Refresh':'تحديث'));
  const all=adminHubAllPatients(),attention=all.filter(item=>item.reasons.length);
  $('adminHubPaymentCount').textContent=String(attention.filter(item=>item.reasons.some(reason=>reason.type==='payment')).length);
  $('adminHubPlanCount').textContent=String(attention.filter(item=>item.reasons.some(reason=>reason.type==='plan')).length);
  $('adminHubUpdateCount').textContent=String(attention.filter(item=>item.reasons.some(reason=>!['payment','plan'].includes(reason.type))).length);
  $('adminHubTotalCount').textContent=String(all.length);
  setText('#adminHubPaymentLabel',lang==='en'?'Payment':'الدفع');
  setText('#adminHubPlanLabel',lang==='en'?'Plans':'الخطط');
  setText('#adminHubUpdateLabel',lang==='en'?'Other updates':'تحديثات أخرى');
  setText('#adminHubTotalLabel',lang==='en'?'All patients':'كل المرضى');
  const error=$('adminHubError');
  error.hidden=!adminPatientHub.error;
  error.textContent=adminPatientHub.error;
  const visible=adminHubVisiblePatients();
  $('adminHubCount').textContent=String(visible.length);
  const list=$('adminHubList');
  if(adminPatientHub.loading&&!adminPatientHub.records.length){
    list.innerHTML=`<div class="admin-hub-empty">${lang==='en'?'Collecting patients from active clinics…':'جارٍ تجميع مرضى العيادات المفعلة…'}</div>`;
    return;
  }
  if(!visible.length){
    list.innerHTML=`<div class="admin-hub-empty">${($('adminHubScopeFilter')?.value||'attention')==='attention'?(lang==='en'?'No patient currently requires administration action.':'لا توجد حاليًا حالات تحتاج تدخل الإدارة.'):(lang==='en'?'No patients match these filters.':'لا يوجد مرضى مطابقون للتصفية.')}</div>`;
    return;
  }
  list.innerHTML=visible.map(item=>{
    const patient=item.patient,reasonPriority=Math.min(...item.reasons.map(reason=>reason.priority),9);
    const clinicHue=(135+clinicNumber(item.clinic.id)*37)%360;
    const doctor=String(item.clinic.doctorName||'').trim();
    const tone=reasonPriority===0?'urgent':reasonPriority===1?'warning':item.reasons.some(reason=>reason.type==='plan')?'plan':'general';
    const badges=item.reasons.length
      ?item.reasons.map(reason=>`<span class="admin-action-tag ${escapeHtml(reason.type)}">${escapeHtml(reason.label)}</span>`).join('')
      :`<span class="admin-action-tag">${lang==='en'?'No administration action':'لا يحتاج إجراء إداري'}</span>`;
    const status=derivedStatus(patient);
    const hasPlan=item.reasons.some(reason=>reason.type==='plan');
    const hasPayment=item.reasons.some(reason=>reason.type==='payment');
    return `<article class="admin-patient-item priority-${tone}">
      <div class="admin-patient-main">
        <strong>${escapeHtml(String(patient.name||'').trim()||'—')}</strong>
        <small>${lang==='en'?'File':'ملف'} ${escapeHtml(patient.file||'—')}${patient.phone?` · ${escapeHtml(patient.phone)}`:''}</small>${isZeroFileNumber(patient.file)?`<span class="file-zero-warning">⚠ ${lang==='en'?'Update file number on arrival':'تحديث رقم الملف عند الوصول'}</span>`:''}
      </div>
      <div class="admin-patient-clinic" style="--clinic-hue:${clinicHue}">
        <span class="admin-clinic-number"><small>${lang==='en'?'CLINIC':'عيادة'}</small><b>${escapeHtml(item.clinic.roomNumber||clinicNumber(item.clinic.id))}</b></span>
        <span class="admin-clinic-copy"><strong>🏥 ${escapeHtml(item.clinic.name||`العيادة ${clinicNumber(item.clinic.id)}`)}</strong><small>${doctor?escapeHtml(lang==='en'?(/^(?:dr\.?|doctor)\s/i.test(doctor)?doctor:`Dr. ${doctor}`):(/^(?:د\.?|الدكتور)\s*/.test(doctor)?doctor:`د. ${doctor}`)):(lang==='en'?'Doctor not specified':'لم يحدد الطبيب')}</small></span>
      </div>
      <div class="admin-patient-time"><strong>${escapeHtml(patient.start||'—')}–${escapeHtml(patient.end||'—')}</strong><small>${escapeHtml(statusText(status))}</small></div>
      <div class="admin-action-tags">${badges}</div>
      <div class="admin-patient-actions">
        ${hasPlan?`<a class="primary" href="${escapeHtml(adminPlanUrl(item))}">${lang==='en'?'Open plan':'فتح الخطة'}</a>`:''}
        ${hasPayment?`<a class="primary payment" href="${escapeHtml(adminClinicUrl(item.clinic.id,'paymentPanel'))}">${lang==='en'?'Open payment':'فتح الدفع'}</a>`:''}
        <a href="${escapeHtml(adminClinicUrl(item.clinic.id))}">${lang==='en'?'Open clinic list':'فتح قائمة العيادة'}</a>
      </div>
    </article>`;
  }).join('');
}
function scheduleAdminPatientHub(delay=adminHubCadence()){
  clearTimeout(adminPatientHub.timer);
  if(!adminPatientHub.started||VIEW_MODE!=='admin')return;
  adminPatientHub.timer=setTimeout(()=>refreshAdminPatientHub(),delay);
}
async function refreshAdminPatientHub({force=false}={}){
  if(VIEW_MODE!=='admin'||!authReady||adminPatientHub.loading)return false;
  if(!force&&adminPatientHub.date===selectedDate&&Date.now()-Number(adminPatientHub.updatedAt||0)<adminHubCadence()){
    scheduleAdminPatientHub();
    return false;
  }
  const requestedDate=selectedDate;
  adminPatientHub.loading=true;
  adminPatientHub.error='';
  renderAdminPatientHub();
  try{
    const response=await request(`${ADMIN_PATIENTS_API}?date=${encodeURIComponent(requestedDate)}&_=${Date.now()}`,{},15000);
    if(response.status===401){lockApp('انتهت الجلسة. سجّل الدخول مرة أخرى.');return false}
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'تعذر تجميع مرضى العيادات');
    if(selectedDate!==requestedDate)return false;
    adminPatientHub.records=Array.isArray(data.records)?data.records:[];
    adminPatientHub.date=requestedDate;
    adminPatientHub.updatedAt=Date.now();
    adminPatientHub.error='';
    renderAdminPatientHub();
    return true;
  }catch(error){
    adminPatientHub.error=lang==='en'?`Could not refresh all clinics: ${String(error.message||error)}`:`تعذر تحديث جميع العيادات: ${String(error.message||error)}`;
    renderAdminPatientHub();
    return false;
  }finally{
    adminPatientHub.loading=false;
    renderAdminPatientHub();
    scheduleAdminPatientHub();
  }
}
function startAdminPatientHub(){
  if(VIEW_MODE!=='admin'||adminPatientHub.started)return;
  adminPatientHub.started=true;
  if(!window.__adminHubListeners){
    window.__adminHubListeners=true;
    window.addEventListener('online',()=>scheduleAdminPatientHub(1000));
    window.addEventListener('focus',()=>scheduleAdminPatientHub(syncCadence().workHours?1000:adminHubCadence()));
    document.addEventListener('visibilitychange',()=>scheduleAdminPatientHub(document.hidden?adminHubCadence():(syncCadence().workHours?1000:adminHubCadence())));
  }
  refreshAdminPatientHub({force:true});
}
function stopAdminPatientHub(){
  adminPatientHub.started=false;
  adminPatientHub.loading=false;
  clearTimeout(adminPatientHub.timer);
  adminPatientHub.timer=null;
}
async function reconcileRevisionConflict(date,snapshot){
  const latestResponse=await request(stateUrl(date,true));
  if(!latestResponse.ok)throw new Error(`HTTP ${latestResponse.status}`);
  const latest=await latestResponse.json();
  if(selectedDate!==date)return false;
  const merged=new Map((Array.isArray(latest.patients)?latest.patients:[]).map(patient=>[String(patient.id),{...patient}]));
  snapshot.patients.forEach(patient=>{
    const id=String(patient.id),remote=merged.get(id);
    merged.set(id,remote?mergePatientVersions(remote,patient):{...patient});
  });
  patients=[...merged.values()].sort((a,b)=>String(a.start||'').localeCompare(String(b.start||'')));
  if(!notes&&latest.notes)notes=String(latest.notes);
  if(Number(latest.updateAlert?.updatedAt||0)>Number(updateAlert?.updatedAt||0))updateAlert={...latest.updateAlert};
  sync.revision=Number(latest.revision||0);
  sync.updatedAt=Number(latest.updatedAt||0);
  sync.ready=true;
  sync.dirty=true;
  sync.localVersion+=1;
  sync.localUpdatedAt=Date.now();
  persistLocal(true);
  render();
  toast(lang==='en'?'Updates merged safely':'تم دمج تحديثين بأمان',lang==='en'?'Another device updated the list; both sets of changes were preserved.':'عدّل جهاز آخر القائمة في الوقت نفسه؛ حُفظت القائمتان وسيعاد الإرسال تلقائيًا.');
  return true;
}
async function pushState(){
  if(sync.pushing||!sync.dirty)return false;
  if(sync.pulling){scheduleAutomaticSync(250);return false}
  sync.pushing=true;
  const sentVersion=sync.localVersion;
  const sentDate=selectedDate;
  const snapshot=serialize();
  setBadge('saving',lang==='en'?'Saving automatically…':'جارٍ الحفظ تلقائيًا…');
  try{
    const res=await request(stateUrl(sentDate),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(snapshot)});
    if(res.status===409){
      await reconcileRevisionConflict(sentDate,snapshot);
      return false;
    }
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    if(selectedDate!==sentDate)return false;
    sync.revision=Number(data.revision||sync.revision);
    sync.updatedAt=Number(data.updatedAt||Date.now());
    sync.dirty=sentVersion!==sync.localVersion;
    sync.ready=true;
    sync.error='';
    sync.lastSync=Date.now();
    persistLocal(sync.dirty);
    announceSyncedState(sentDate,sync.revision);
    if(sync.dirty)setBadge('saving',lang==='en'?'Saving latest changes…':'جارٍ حفظ آخر التعديلات…',`revision ${sync.revision}`);
    else setIdleSyncBadge(`revision ${sync.revision}`);
    if(VIEW_MODE==='admin')refreshAdminPatientHub({force:true});
    if(sync.dirty){clearTimeout(sync.pushTimer);sync.pushTimer=setTimeout(pushState,80)}
    return true;
  }catch(e){
    sync.error=e.name==='AbortError'?'انتهت مهلة الحفظ':String(e.message||e);
    setBadge('error',lang==='en'?'Save failed — retrying':'فشل الحفظ — ستتم إعادة المحاولة',sync.error);
    persistLocal(true);
    return false;
  }finally{
    sync.pushing=false;
    if(sync.dirty){
      const cadence=syncCadence();
      scheduleAutomaticSync(sync.error?(cadence.workHours?30000:cadence.delay):2500);
    }
  }
}
function applyRemote(data){
  if(sync.dirty)return false;
  patients=Array.isArray(data.patients)?data.patients.map(p=>({...p,name:String(p.name||'').trim()})):[];
  notes=String(data.notes||'');
  updateAlert=data.updateAlert&&typeof data.updateAlert==='object'?{...data.updateAlert}:{active:false,message:'',updatedAt:0,kind:''};
  els.notes.value=notes;
  sync.revision=Number(data.revision||0);
  sync.updatedAt=Number(data.updatedAt||0);
  sync.ready=true;
  sync.error='';
  sync.localUpdatedAt=Date.now();
  persistLocal(false);
  render();
  return true;
}
async function pullState(force=false){
  if(sync.pulling||sync.pushing||sync.dirty)return false;
  sync.pulling=true;
  const versionAtStart=sync.localVersion;
  const dateAtStart=selectedDate;
  if(!sync.ready)setBadge('connecting',lang==='en'?'Connecting automatically…':'جارٍ الاتصال تلقائيًا…');
  try{
    const res=await request(stateUrl(dateAtStart,true));
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    if(selectedDate!==dateAtStart)return false;
    if(sync.dirty||sync.localVersion!==versionAtStart){scheduleAutomaticSync(150);return false}
    if(data.exists){
      const rev=Number(data.revision||0),updated=Number(data.updatedAt||0);
      if(force||rev>sync.revision||updated>sync.updatedAt){
        const notification=!force&&sync.ready?detectRemoteNotification(patients.map(p=>({...p})),{...updateAlert},data):null;
        applyRemote(data);
        if(notification){playAlertSound(notification.tag||notification.type);showSystemNotification(notification)}
      }
    }else if(patients.length||notes||updateAlert.active){
      sync.dirty=true;
      sync.localUpdatedAt=Date.now();
      persistLocal(true);
      scheduleAutomaticSync(100);
      return false;
    }
    sync.ready=true;
    sync.error='';
    sync.lastSync=Date.now();
    if(!sync.dirty)setIdleSyncBadge(`revision ${sync.revision}`);
    return true;
  }catch(e){
    sync.error=e.name==='AbortError'?'انتهت مهلة الاتصال':String(e.message||e);
    setBadge('error',lang==='en'?'Connection failed — retrying':'فشل الاتصال — ستتم إعادة المحاولة',sync.error);
    return false;
  }finally{
    sync.pulling=false;
    if(sync.dirty)scheduleAutomaticSync(100);
  }
}
function scheduleAutomaticSync(delay=POLL_MS){
  clearTimeout(sync.autoTimer);
  sync.autoTimer=setTimeout(runAutomaticSync,delay);
}

async function runAutomaticSync(){
  clearTimeout(sync.autoTimer);

  if(!navigator.onLine){
    sync.ready=false;
    sync.error='الجهاز غير متصل بالإنترنت';
    setBadge('error',lang==='en'?'Offline — retrying':'غير متصل — ستتم إعادة المحاولة',sync.error);
    scheduleAutomaticSync(syncCadence().workHours?60000:syncCadence().delay);
    return;
  }

  try{
    if(sync.dirty){
      await pushState();
    }else{
      await pullState(false);
    }
    await Promise.all([refreshTreatmentPlanRegistry(false),refreshManualAlert(false),refreshLabCases(false)]);
  }catch(error){
    console.error('Automatic sync cycle failed',error);
  }finally{
    const cadence=syncCadence();
    const nextDelay=sync.error?(cadence.workHours?30000:cadence.delay):cadence.delay;
    if(!sync.error&&!sync.dirty&&!cadence.workHours){
      setIdleSyncBadge();
    }
    scheduleAutomaticSync(nextDelay);
  }
}

async function startAutomaticSync(){
  if(sync.autoStarted)return;
  sync.autoStarted=true;
  setupCrossDeviceSyncSignals();

  setBadge('connecting',lang==='en'?'Connecting automatically…':'جارٍ تفعيل المزامنة تلقائيًا…');

  const wake=()=>{
    clearTimeout(sync.autoTimer);
    const cadence=syncCadence();
    const elapsed=Date.now()-Number(sync.lastSync||0);
    if(cadence.workHours||!sync.lastSync||elapsed>=cadence.delay)runAutomaticSync();
    else{
      setIdleSyncBadge();
      scheduleAutomaticSync(Math.max(1000,cadence.delay-elapsed));
    }
  };

  window.addEventListener('online',wake);
  window.addEventListener('focus',wake);
  window.addEventListener('pageshow',wake);
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)wake();
  });
  window.addEventListener('offline',()=>{
    sync.ready=false;
    sync.error='الجهاز غير متصل بالإنترنت';
    setBadge('error',lang==='en'?'Offline — retrying':'غير متصل — ستتم إعادة المحاولة',sync.error);
    scheduleAutomaticSync(syncCadence().workHours?60000:syncCadence().delay);
  });

  await runAutomaticSync();
}
function mutate(fn){
  const before=new Map(patients.map(patient=>[String(patient.id),JSON.stringify(patient)]));
  fn();
  const now=Date.now();
  patients.forEach(patient=>{
    const previous=before.get(String(patient.id));
    if(previous===JSON.stringify(patient))return;
    let prior={};try{prior=previous?JSON.parse(previous):{}}catch{}
    if(patient.status!==prior.status)patient.statusUpdatedAt=now;
    patient.recordUpdatedAt=now;
  });
  markDirty();
}
function derivedStatus(p){if(['done','cancel','left','asks_delay','arrived','early_arrival','active'].includes(p.status))return p.status;const now=new Date(),en=timeDate(p.end);if(now>en&&p.status==='waiting')return'late';return p.status;}
function currentPatient(){
  const available=patients.filter(p=>!['done','cancel','left'].includes(p.status));
  return available.find(p=>p.status==='active')||available.find(p=>derivedStatus(p)==='active')||null;
}
function sortedPendingPatients(){
  return patients
    .filter(p=>!['done','cancel','left'].includes(p.status))
    .sort((a,b)=>{
      const priority=p=>p.status==='arrived'?0:p.status==='early_arrival'?1:p.status==='asks_delay'?2:derivedStatus(p)==='late'?3:4;
      return priority(a)-priority(b)||String(a.start||'').localeCompare(String(b.start||''));
    });
}
function flowLeadPatient(){return currentPatient()||sortedPendingPatients()[0]||null}
function upcomingPatients(excludedId=null){
  return sortedPendingPatients().filter(p=>excludedId===null||String(p.id)!==String(excludedId));
}
function stageFor(p){if(!p)return'stage-idle';const st=timeDate(p.start).getTime(),en=timeDate(p.end).getTime(),now=Date.now();const ratio=Math.max(0,Math.min(1,(now-st)/Math.max(1,en-st)));if(ratio<.5)return'stage-green';if(ratio<.75)return'stage-yellow';if(ratio<.9)return'stage-orange';return'stage-red';}
function paymentStage(p){if(!p?.paymentRequired)return'';if(p.paymentCompletedAt)return'completed';if(p.paymentAcknowledgedAt)return'received';return'requested'}
function paymentBadgeMarkup(p){
  const stage=paymentStage(p);if(!stage)return'';
  const labels=lang==='en'?{requested:'Payment requested',received:'Request received',completed:'Payment completed'}:{requested:'بانتظار استلام طلب الدفع',received:'تم استلام طلب الدفع',completed:'✓ تم تنفيذ الدفع'};
  return `<span class="payment-row-badge ${stage}">${escapeHtml(labels[stage])}</span>`;
}
function normalizedPatientPhone(patient){return String(patient?.phone||patient?.mobile||'').replace(/\D/g,'')}
function labCaseMatchesPatient(item,patient){
  if(!item||!patient)return false;
  if(item.patient?.id&&patient.id&&String(item.patient.id)===String(patient.id))return true;
  const caseFile=String(item.patient?.file||'').trim().toLowerCase(),patientFile=String(patient.file||'').trim().toLowerCase();
  if(caseFile&&patientFile&&caseFile===patientFile)return true;
  const casePhone=normalizedPatientPhone(item.patient),patientPhone=normalizedPatientPhone(patient);
  return Boolean(casePhone&&patientPhone&&casePhone===patientPhone);
}
function patientLabCases(patient,{activeOnly=true}={}){
  const terminal=new Set(['delivered_patient','cancelled']);
  return labCasesState.cases.filter(item=>labCaseMatchesPatient(item,patient)&&(!activeOnly||!terminal.has(item.status))).sort((a,b)=>Number(b.updatedAt||0)-Number(a.updatedAt||0));
}
function labStatusText(status){return ({pending_send:'بانتظار التسليم للمعمل',sent:'سُلّمت للمعمل',in_production:'قيد التصنيع',ready_at_lab:'جاهزة لدى المعمل',received_clinic:'وصلت ولم تُسلّم',delivered_patient:'سُلّمت للمريض',needs_adjustment:'تحتاج تعديلًا',returned_lab:'أُعيدت للمعمل',cancelled:'ملغاة'})[status]||'حالة معمل'}
function labElapsedDays(item){
  const start=Number(item?.sentAt||0);if(!start)return'';
  const end=item?.status==='received_clinic'&&Number(item?.receivedAt)>0?Number(item.receivedAt):Date.now();
  const elapsed=Math.max(0,end-start),days=Math.floor(elapsed/86400000),hours=Math.floor(elapsed%86400000/3600000),minutes=Math.floor(elapsed%3600000/60000);
  if(days)return`${days} يوم${hours?` و${hours} س`:''}`;
  if(hours)return`${hours} ساعة`;
  return`${minutes} دقيقة`;
}
function labCaseBadgeMarkup(patient){
  const active=patientLabCases(patient);if(!active.length)return'';
  const lead=active[0],tone=lead.status==='received_clinic'?'received':'';
  const elapsed=labElapsedDays(lead);
  const label=active.length>1?`${active.length} حالات بالمعمل`:`${labStatusText(lead.status)}${elapsed?` · ${elapsed}`:''}`;
  return `<button class="lab-row-badge ${tone}" type="button" data-lab-patient="${escapeHtml(patient.id)}" title="فتح حالات معمل الأسنان">${escapeHtml(label)}</button>`;
}
async function refreshLabCases({force=false}={}){
  const cadence=syncCadence().workHours?120000:600000;
  if(labCasesState.loading||(!force&&labCasesState.lastFetchedAt&&Date.now()-labCasesState.lastFetchedAt<cadence))return labCasesState.cases;
  labCasesState.loading=true;
  try{
    const response=await request(`/api/lab-cases?clinic=${encodeURIComponent(ACTIVE_CLINIC_ID)}`);
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'تعذر تحميل حالات المعمل');
    labCasesState.cases=Array.isArray(data.cases)?data.cases:[];labCasesState.revision=Number(data.revision||0);labCasesState.updatedAt=Number(data.updatedAt||0);labCasesState.lastFetchedAt=Date.now();
    renderFloatingLabButton();renderTable();
    if(VIEW_MODE==='admin'&&authUser?.role==='admin'){
      operationsCenter.labCases=operationsCenter.labCases.filter(item=>item.clinicId!==ACTIVE_CLINIC_ID).concat(labCasesState.cases);
      renderOperationsCenter();updateTreatmentPlanCenterTrigger();
    }
    return labCasesState.cases;
  }catch(error){console.warn('Dental lab cases unavailable',error);return labCasesState.cases}
  finally{labCasesState.loading=false}
}
function openLabCasesPage(patient=null){
  const params=new URLSearchParams({clinic:ACTIVE_CLINIC_ID});
  if(patient)params.set('patient',String(patient.file||patient.phone||patient.name||''));
  location.href=`./lab.html?${params.toString()}`;
}
function renderFloatingLabButton(){
  const button=$('floatingLabBtn'),count=$('floatingLabCount');if(!button||!count)return;
  const terminal=new Set(['delivered_patient','cancelled']);
  const active=labCasesState.cases.filter(item=>item&&item.clinicId===ACTIVE_CLINIC_ID&&!terminal.has(item.status));
  const urgent=active.some(item=>['needs_adjustment','returned_lab'].includes(item.status));
  const ready=active.some(item=>['ready_at_lab','received_clinic'].includes(item.status));
  button.classList.toggle('is-urgent',urgent);
  button.classList.toggle('is-ready',!urgent&&ready);
  count.textContent=String(active.length);
  const label=active.length?`فتح قائمة حالات معمل الأسنان — ${active.length} حالة نشطة`:'فتح قائمة حالات معمل الأسنان';
  button.setAttribute('aria-label',label);button.title=label;
}
function reviewRequestMessage(patient,url){
  const name=firstName(patient?.name);
  if(lang==='en')return `Hello ${name},\n\nIt was a pleasure serving you at Best Care Dental Clinics. Your feedback about your experience matters to us and helps us improve. We would appreciate your review on Google through the following link:\n${url}\n\nThank you for your trust. We wish you continued health and a beautiful smile.`;
  return `مرحبًا ${name}،\n\nسعدنا بخدمتك في عيادات أفضل عناية الاستشارية للأسنان. يهمنا رأيك في تجربتك، ويساعدنا تقييمك على الاستمرار في تحسين خدماتنا. يسعدنا أن تشاركنا تقييمك عبر Google من خلال الرابط التالي:\n${url}\n\nشكرًا لثقتك، ونتمنى لك دوام الصحة والابتسامة.`;
}
function normalizeWhatsappNumber(value){
  let digits=String(value||'').replace(/\D/g,'');
  if(digits.startsWith('00'))digits=digits.slice(2);
  if(digits.startsWith('05'))digits=`966${digits.slice(1)}`;
  if(digits.startsWith('5')&&digits.length===9)digits=`966${digits}`;
  return digits;
}
function patientWhatsappNumber(patient){
  return normalizeWhatsappNumber(patient?.phone??patient?.mobile??patient?.contactPhone??'');
}
function toLatinDigits(value){return String(value??'').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d))}
function normalizeSearchText(value){return toLatinDigits(value).normalize('NFKD').replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g,'').replace(/\u0640/g,'').replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').toLowerCase().replace(/\s+/g,' ').trim()}
function normalizeSearchPhone(value){const digits=toLatinDigits(value).replace(/\D/g,'');if(/^009665\d{8}$/.test(digits))return`0${digits.slice(5)}`;if(/^9665\d{8}$/.test(digits))return`0${digits.slice(3)}`;if(/^5\d{8}$/.test(digits))return`0${digits}`;return digits}
function patientMatchesSearch(patient,rawQuery){
  const query=normalizeSearchText(rawQuery);if(!query)return true;
  const name=normalizeSearchText(patient?.name??patient?.fullName),compact=query.replace(/[\s-]/g,''),file=normalizeSearchText(patient?.file??patient?.fileNo).replace(/[\s-]/g,''),phone=normalizeSearchPhone(patient?.phone??patient?.mobile),digits=normalizeSearchPhone(rawQuery);
  return name.includes(query)||Boolean(compact&&file.includes(compact))||Boolean(digits&&phone.includes(digits));
}
function patientVersionStamp(patient){return Math.max(Number(patient?.recordUpdatedAt||0),Number(patient?.adminUpdatedAt||0),Number(patient?.statusUpdatedAt||0),Number(patient?.arrivedAt||0),Number(patient?.actualStartedAt||0),Number(patient?.completedAt||0),Number(patient?.lastCalledAt||0),Number(patient?.paymentRequestedAt||0),Number(patient?.paymentAcknowledgedAt||0),Number(patient?.paymentCompletedAt||0),Number(patient?.treatmentPlanUpdatedAt||0),Number(patient?.reviewRequestedAt||0))}
function copyPatientGroup(target,source,fields){fields.forEach(field=>{if(Object.prototype.hasOwnProperty.call(source||{},field))target[field]=source[field]})}
function mergePatientVersions(remote={},local={}){
  const remoteStamp=patientVersionStamp(remote),localStamp=patientVersionStamp(local);
  const merged=localStamp>=remoteStamp?{...remote,...local}:{...local,...remote};
  const groups=[
    [['name','file','phone','nationalId','start','end','procedure','adminUpdatedAt'],value=>Number(value?.adminUpdatedAt||value?.recordUpdatedAt||0)],
    [['status','statusUpdatedAt','arrivedAt','actualStartedAt','completedAt','lastCalledAt','callCount'],value=>Math.max(Number(value?.statusUpdatedAt||0),Number(value?.arrivedAt||0),Number(value?.actualStartedAt||0),Number(value?.completedAt||0),Number(value?.lastCalledAt||0))],
    [['paymentRequired','paymentAction','paymentItems','paymentDiscount','paymentRequestedAt','paymentAcknowledgedAt','paymentCompletedAt'],value=>Math.max(Number(value?.paymentRequestedAt||0),Number(value?.paymentAcknowledgedAt||0),Number(value?.paymentCompletedAt||0))],
    [['treatmentPlanStatus','treatmentPlanUpdatedAt'],value=>Number(value?.treatmentPlanUpdatedAt||0)],
    [['reviewRequestedAt','reviewRequestCount','reviewLastEventId'],value=>Number(value?.reviewRequestedAt||0)]
  ];
  groups.forEach(([fields,stamp])=>copyPatientGroup(merged,stamp(local)>=stamp(remote)?local:remote,fields));
  merged.recordUpdatedAt=Math.max(Number(remote.recordUpdatedAt||0),Number(local.recordUpdatedAt||0));
  return merged;
}
function announceSyncedState(date,revision){
  const message={source:CLIENT_ID,clinicId:ACTIVE_CLINIC_ID,date,revision:Number(revision||0),at:Date.now()};
  try{syncChannel?.postMessage(message)}catch{}
  try{localStorage.setItem('bestcare_sync_signal_v1',JSON.stringify(message))}catch{}
}
function receiveSyncSignal(message){
  if(!message||message.source===CLIENT_ID||message.clinicId!==ACTIVE_CLINIC_ID||message.date!==selectedDate||Number(message.revision||0)<=sync.revision)return;
  if(sync.dirty||sync.pushing)return;
  scheduleAutomaticSync(80);
}
function receiveServiceWorkerSyncSignal(message){
  if(message?.type!=='BESTCARE_REMOTE_SYNC')return;
  const payload=message.payload&&typeof message.payload==='object'?message.payload:{};
  const clinicMatches=!payload.clinicId||payload.clinicId===ACTIVE_CLINIC_ID;
  const dateMatches=!payload.date||payload.date===selectedDate;
  if(clinicMatches&&dateMatches&&!sync.dirty&&!sync.pushing)scheduleAutomaticSync(60);
  if(VIEW_MODE!=='admin')return;
  clearTimeout(adminPatientHub.timer);
  adminPatientHub.timer=setTimeout(()=>refreshAdminPatientHub({force:true}),80);
  const tag=String(payload.tag||''),type=String(payload.type||'');
  if(type==='appointment_request')setTimeout(()=>refreshAppointmentRequests({notify:true}),100);
  if(type==='lab')setTimeout(()=>refreshLabCases({force:true}),100);
  if(type==='prescription')setTimeout(()=>refreshOperationsPrescriptions(),100);
  if(type==='treatment_plan'||tag.includes('treatment-plan'))setTimeout(()=>refreshTreatmentPlanRegistry(true),100);
}
function setupCrossDeviceSyncSignals(){
  if(window.__bestcareSyncSignals)return;window.__bestcareSyncSignals=true;
  if('BroadcastChannel' in window){syncChannel=new BroadcastChannel('bestcare-dashboard-sync-v1');syncChannel.addEventListener('message',event=>receiveSyncSignal(event.data))}
  window.addEventListener('storage',event=>{if(event.key!=='bestcare_sync_signal_v1'||!event.newValue)return;try{receiveSyncSignal(JSON.parse(event.newValue))}catch{}});
  if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',event=>receiveServiceWorkerSyncSignal(event.data));
}
async function recordPatientCommunication(patient,kind,details={},eventId=''){
  const stableEventId=eventId||(crypto.randomUUID?.()||`${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try{
    const response=await request(PATIENT_PROFILE_API,{method:'POST',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({eventId:stableEventId,kind,clinicId:ACTIVE_CLINIC_ID,patient:{name:patient?.name||patient?.fullName||'',file:patient?.file||patient?.fileNo||'',phone:patient?.phone||patient?.mobile||'',nationalId:patient?.nationalId||''},details})},12000);
    if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||'تعذر حفظ سجل التواصل')}
    return true;
  }catch(error){console.warn('Patient communication tracking unavailable',error);return false}
}
function openReviewComposer(id){
  const patient=patientById(id);if(!patient)return;
  pendingReviewId=patient.id;
  const storedUrl=localStorage.getItem('bestcare_google_review_url')||'';
  const url=storedUrl&&!storedUrl.includes('search.google.com/local/writereview')?storedUrl:DEFAULT_GOOGLE_REVIEW_URL;
  $('reviewPatientText').textContent=lang==='en'?`Ready WhatsApp message for ${firstName(patient.name)}`:`رسالة واتساب جاهزة للمريض ${firstName(patient.name)}`;
  $('reviewPhoneInput').value=patientWhatsappNumber(patient);
  $('reviewUrlInput').value=url;
  $('reviewMessageInput').value=reviewRequestMessage(patient,url);
  $('reviewLinkPreview').href=url;
  openModal('reviewModal');
}
function refreshReviewMessageFromUrl(){
  const patient=patientById(pendingReviewId);if(!patient)return;
  const url=$('reviewUrlInput').value.trim()||DEFAULT_GOOGLE_REVIEW_URL;
  $('reviewLinkPreview').href=url;
  $('reviewMessageInput').value=reviewRequestMessage(patient,url);
}
async function sendReviewWhatsapp(){
  const patient=patientById(pendingReviewId);if(!patient)return;
  const sendButton=$('sendReviewWhatsappBtn');
  if(sendButton?.disabled)return;
  const url=$('reviewUrlInput').value.trim();
  if(!/^https:\/\//i.test(url)){toast(lang==='en'?'Invalid review link':'رابط التقييم غير صالح',lang==='en'?'Use a secure Google review URL.':'أدخل رابط Google يبدأ بـ https://');$('reviewUrlInput').focus();return}
  const message=$('reviewMessageInput').value.trim();
  if(!message){toast(lang==='en'?'Message required':'الرسالة مطلوبة',lang==='en'?'Write the WhatsApp message first.':'اكتب رسالة واتساب أولًا.');return}
  const originalLabel=sendButton?.textContent||'';
  if(sendButton){sendButton.disabled=true;sendButton.textContent=lang==='en'?'Opening WhatsApp…':'جارٍ فتح واتساب…'}
  localStorage.setItem('bestcare_google_review_url',url);
  const phone=normalizeWhatsappNumber($('reviewPhoneInput').value)||patientWhatsappNumber(patient);
  const whatsappUrl=phone?`https://wa.me/${phone}?text=${encodeURIComponent(message)}`:`https://wa.me/?text=${encodeURIComponent(message)}`;
  try{
    window.open(whatsappUrl,'_blank','noopener');
    const requestedAt=Date.now();
    const eventId=crypto.randomUUID?.()||`review_whatsapp-${requestedAt}-${Math.random().toString(36).slice(2)}`;
    mutate(()=>{patient.reviewRequestedAt=requestedAt;patient.reviewRequestCount=Number(patient.reviewRequestCount||0)+1;patient.reviewLastEventId=eventId});
    await pushState().catch(()=>false);
    let tracked=await recordPatientCommunication(patient,'review_whatsapp',{source:'dashboard'},eventId);
    if(!tracked)tracked=await recordPatientCommunication(patient,'review_whatsapp',{source:'dashboard',retry:true},eventId);
    closeModal('reviewModal');
    renderTable();
    toast(lang==='en'?'Review request recorded':'تم تسجيل طلب التقييم',tracked?(lang==='en'?'WhatsApp opened and the statistics counter was updated.':'تم فتح واتساب وتحديث عداد الإحصائيات.'):(lang==='en'?'WhatsApp opened; statistics tracking will need another attempt.':'تم فتح واتساب، وتعذر تحديث الإحصائية بعد محاولتين.'));
  }finally{
    if(sendButton){sendButton.disabled=false;sendButton.textContent=originalLabel}
  }
}
async function copyReviewMessage(){
  const message=$('reviewMessageInput').value.trim();if(!message)return;
  try{await navigator.clipboard.writeText(message);toast(lang==='en'?'Message copied':'تم نسخ الرسالة',lang==='en'?'Paste it into WhatsApp.':'يمكنك لصقها الآن في واتساب.')}catch{toast(lang==='en'?'Copy failed':'تعذر النسخ',lang==='en'?'Select and copy the message manually.':'حدد الرسالة وانسخها يدويًا.')}
}
async function disablePreviewPushSubscription(){
  if(!IS_DEPLOY_PREVIEW||!('serviceWorker' in navigator))return;
  try{
    const registration=await navigator.serviceWorker.ready,subscription=await registration.pushManager?.getSubscription?.();
    if(subscription){
      const endpoint=subscription.endpoint;
      await subscription.unsubscribe();
      await fetch(PUSH_API,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({endpoint})}).catch(()=>{});
    }
    localStorage.removeItem('bestcare_push_registered');
    localStorage.removeItem('bestcare_system_notifications');
  }catch(error){console.warn('Preview push cleanup failed',error)}
}
function planRegistryPhone(value){
  const digits=String(value||'').replace(/\D/g,'');
  if(/^009665\d{8}$/.test(digits))return`0${digits.slice(5)}`;
  if(/^9665\d{8}$/.test(digits))return`0${digits.slice(3)}`;
  if(/^5\d{8}$/.test(digits))return`0${digits}`;
  return digits;
}
function normalizedPlanFile(value){
  const file=String(value??'').trim().toUpperCase().replace(/[\s-]+/g,'');
  return file&&!/^0+$/.test(file)?file:'';
}
function isZeroFileNumber(value){return /^0+$/.test(String(value??'').trim())}
function planRegistryNationalId(value){const digits=String(value||'').replace(/\D/g,'').slice(0,10);return digits.length===10?digits:''}
function planRegistryIdentityKeys(patient={}){
  const file=normalizedPlanFile(patient.file??patient.fileNo);
  const phone=planRegistryPhone(patient.phone??patient.mobile);
  const nationalId=planRegistryNationalId(patient.nationalId);
  return [...new Set([file?`file:${file}`:'',phone?`phone:${phone}`:'',nationalId?`national:${nationalId}`:''].filter(Boolean))];
}
function treatmentPlanRecord(patient){
  for(const key of planRegistryIdentityKeys(patient)){
    const canonical=treatmentPlanRegistry.aliases?.[key];
    if(canonical&&treatmentPlanRegistry.records?.[canonical])return treatmentPlanRegistry.records[canonical];
  }
  return null;
}
function effectiveTreatmentPlanStatus(patient){
  const direct=String(patient?.treatmentPlanStatus||'');
  const record=treatmentPlanRecord(patient);
  if(PLAN_STATUS_VALUES.includes(record?.status))return String(record.status);
  if(treatmentPlanRegistry.lastFetchedAt&&planRegistryIdentityKeys(patient).length)return'';
  return PLAN_STATUS_VALUES.includes(direct)?direct:'';
}
function planStatusLabels(){
  return lang==='en'
    ?{draft:'Unapproved draft',submitted:'Doctor approved · with admin',patient_accepted:'Patient signed',approved:'Plan approved',approved_signed:'Approved & signed',rejected:'Needs revision',cancelled:'Plan cancelled'}
    :{draft:'مسودة غير معتمدة',submitted:'اعتمدها الطبيب · لدى الإدارة',patient_accepted:'وافق ووقّع',approved:'خطة معتمدة',approved_signed:'خطة معتمدة وموقعة',rejected:'تحتاج تعديل',cancelled:'خطة ملغاة'};
}
function planStatusText(status){return planStatusLabels()[status]||String(status||'')}
function treatmentPlanBadgeMarkup(patient){
  const record=treatmentPlanRecord(patient);
  const status=effectiveTreatmentPlanStatus(patient);
  if(!PLAN_STATUS_VALUES.includes(status))return'';
  const labels=planStatusLabels();
  const detail=status==='rejected'&&record?.status===status&&record?.rejectionReason?` — ${record.rejectionReason}`:status==='cancelled'&&record?.status===status&&record?.cancellationReason?` — ${record.cancellationReason}`:'';
  return`<span class="plan-status-badge plan-status-${status}" title="${escapeHtml(labels[status]+detail)}">${escapeHtml(labels[status])}</span>`;
}
function canChangePlanStatus(current,next){
  if(current===next)return true;
  if(VIEW_MODE==='clinic')return ['draft','rejected'].includes(current)&&next==='submitted';
  if(next==='cancelled')return current!=='cancelled';
  if(current==='cancelled')return next==='draft';
  const transitions={
    draft:['submitted'],
    submitted:['patient_accepted','rejected'],
    patient_accepted:['approved_signed','rejected'],
    approved:['approved_signed','rejected'],
    approved_signed:['rejected'],
    rejected:['draft','submitted']
  };
  return Boolean(transitions[current]?.includes(next));
}
function treatmentPlanStatusControlMarkup(patient){
  const status=effectiveTreatmentPlanStatus(patient);
  if(!PLAN_STATUS_VALUES.includes(status))return'';
  const labels=planStatusLabels();
  const options=PLAN_STATUS_VALUES.map(value=>`<option value="${value}" ${value===status?'selected':''} ${canChangePlanStatus(status,value)?'':'disabled'}>${escapeHtml(labels[value])}</option>`).join('');
  const warning=planCenterIsUnapproved(status)?`<span class="unapproved-plan-warning">⚠ ${lang==='en'?'Unapproved plan':'خطة غير معتمدة'}</span>`:'';
  return`<div class="plan-status-stack"><label class="plan-status-control plan-status-control-${status}" data-label="${lang==='en'?'Plan':'خطة'}" title="${lang==='en'?'Change treatment plan status':'تعديل حالة اعتماد الخطة'}"><select class="plan-status-select" data-plan-status-id="${escapeHtml(patient.id)}" aria-label="${lang==='en'?'Treatment plan status':'حالة اعتماد الخطة'}">${options}</select></label>${warning}</div>`;
}
async function refreshTreatmentPlanRegistry(force=false){
  if(!authReady)return false;
  if(!force&&Date.now()-Number(treatmentPlanRegistry.lastFetchedAt||0)<15000)return false;
  try{
    const keys=[...new Set(patients.flatMap(planRegistryIdentityKeys))];
    if(!keys.length){
      treatmentPlanRegistry={records:{},aliases:{},revision:0,updatedAt:0,lastFetchedAt:Date.now()};
      updateTreatmentPlanCenterTrigger();renderOperationsCenter();
      return true;
    }
    const response=await request(`${PLAN_REGISTRY_API}?clinic=${encodeURIComponent(ACTIVE_CLINIC_ID)}`,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({keys})
    });
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'تعذر تحميل سجل الخطط');
    treatmentPlanRegistry={
      records:data.records&&typeof data.records==='object'?data.records:{},
      aliases:data.aliases&&typeof data.aliases==='object'?data.aliases:{},
      revision:Number(data.revision||0),updatedAt:Number(data.updatedAt||0),lastFetchedAt:Date.now()
    };
    updateTreatmentPlanCenterTrigger();
    render();
    return true;
  }catch(error){console.warn('Treatment plan registry unavailable',error);return false}
}
function patientIdentityRecordKey(record={}){
  const file=normalizedPlanFile(record.fileNo??record.file);
  const phone=planRegistryPhone(record.mobile??record.phone);
  const nationalId=planRegistryNationalId(record.nationalId);
  return file?`file:${file}`:phone?`phone:${phone}`:nationalId?`national:${nationalId}`:`name:${String(record.fullName??record.name??'').trim().toLowerCase()}`;
}
function planCenterEntries(){
  const records=treatmentPlanCenter.loadedAt?treatmentPlanCenter.records:treatmentPlanRegistry.records;
  return Object.entries(records||{}).map(([canonical,record])=>({canonical,record})).sort((a,b)=>Number(b.record?.updatedAt||0)-Number(a.record?.updatedAt||0));
}
function planCenterIsFinal(status){return status==='approved_signed'}
function planCenterIsUnapproved(status){return ['draft','submitted','patient_accepted','rejected'].includes(status)}
function operationClinicLabel(clinicId){
  const clinic=clinicDirectory.find(item=>item.id===clinicId)||defaultClinic(clinicNumber(clinicId));
  return clinicDisplayName(clinic);
}
function operationCenterItems(){
  const appointmentItems=appointmentRequests.items
    .filter(item=>['new','contacted'].includes(item.status))
    .map(item=>({
      id:`appointment:${item.id}`,recordId:item.id,status:item.status,type:'appointments',priority:item.status==='new'?100:72,updatedAt:Number(item.updatedAt||item.createdAt||0),
      title:item.status==='new'?'طلب موعد جديد':'طلب موعد قيد المتابعة',
      patient:item.name||'مريض بدون اسم',identity:item.phone||item.identity||'',
      detail:item.service==='other'?(item.serviceOther||APPOINTMENT_SERVICE_LABELS.other):(APPOINTMENT_SERVICE_LABELS[item.service]||APPOINTMENT_SERVICE_LABELS.other),
      source:'مركز المواعيد',tone:item.status==='new'?'urgent':'pending',href:`./appointment-requests.html?focus=${encodeURIComponent(item.id)}`
    }));
  const planItems=planCenterEntries()
    .filter(({record})=>planCenterIsUnapproved(record?.status))
    .map(({canonical,record})=>{
      const zeroFile=isZeroFileNumber(record.fileNo)||/^file:0+$/i.test(canonical);
      const priorities={patient_accepted:92,rejected:88,submitted:78,draft:66};
      return{
        id:`plan:${canonical}`,type:'plans',canonical,status:record.status,priority:zeroFile?96:(priorities[record.status]||64),updatedAt:Number(record.updatedAt||0),
        title:zeroFile?'خطة تحتاج تصحيح رقم الملف':planStatusText(record.status),patient:record.fullName||'مريض بدون اسم',
        identity:zeroFile?'رقم الملف 0 — يلزم التصحيح':(record.fileNo?`ملف ${record.fileNo}`:(record.mobile||'')),
        detail:record.planNo?`رقم الخطة ${record.planNo}`:'خطة علاجية',source:`مركز الخطط · ${operationClinicLabel(record.clinicId)}`,
        tone:zeroFile||record.status==='rejected'?'urgent':'pending'
      };
    });
  const terminal=new Set(['delivered_patient','cancelled']);
  const labPriorities={needs_adjustment:94,returned_lab:90,received_clinic:86,ready_at_lab:82,in_production:58,sent:56,pending_send:54};
  const labSource=operationsCenter.labLoadedAt?operationsCenter.labCases:labCasesState.cases;
  const labItems=labSource
    .filter(item=>item&&!terminal.has(item.status))
    .map(item=>{
      const elapsed=labElapsedDays(item),params=new URLSearchParams({clinic:item.clinicId||'clinic-1',patient:String(item.patient?.file||item.patient?.phone||item.patient?.name||'')});
      return{
        id:`lab:${item.id}`,recordId:item.id,clinicId:item.clinicId||'clinic-1',status:item.status,type:'labs',priority:labPriorities[item.status]||50,updatedAt:Number(item.updatedAt||item.createdAt||0),
        title:labStatusText(item.status),patient:item.patient?.name||'مريض بدون اسم',identity:item.patient?.file?`ملف ${item.patient.file}`:(item.patient?.phone||''),
        detail:`${item.labName==='other'?(item.customLabName||'معمل آخر'):(item.labName||'المعمل')}${elapsed?` · مضى ${elapsed}`:''}`,
        source:`مركز المعمل · ${operationClinicLabel(item.clinicId)}`,tone:['needs_adjustment','returned_lab'].includes(item.status)?'urgent':['ready_at_lab','received_clinic'].includes(item.status)?'ready':'pending',href:`./lab.html?${params.toString()}`
      };
    });
  const prescriptionItems=(operationsCenter.prescriptions||[])
    .filter(item=>item?.status==='ready_for_admin')
    .map(item=>({
      id:`prescription:${item.canonical}`,type:'prescriptions',canonical:item.canonical,status:item.status,priority:84,updatedAt:Number(item.updatedAt||0),
      title:'وصفة معتمدة بانتظار مشاركة الإدارة',patient:item.patient?.name||'مريض بدون اسم',identity:item.patient?.file?`ملف ${item.patient.file}`:(item.patient?.phone||''),
      detail:`${Number(item.medicineCount||0)} علاج · معتمدة بواسطة ${item.updatedBy||'الطبيب'}`,source:`مركز الوصفات · ${operationClinicLabel(item.clinicId)}`,
      tone:'prescription',href:`./prescription.html?${new URLSearchParams({patientId:item.sourcePatientId||item.patient?.id||'',date:item.sourceDate||today(),clinic:item.clinicId||'clinic-1',view:'admin',patientName:item.patient?.name||'',file:item.patient?.file||'',phone:item.patient?.phone||'',nationalId:item.patient?.nationalId||''}).toString()}`
    }));
  return [...appointmentItems,...planItems,...labItems,...prescriptionItems].sort((a,b)=>b.priority-a.priority||b.updatedAt-a.updatedAt);
}
function renderOperationsCenter(){
  const list=$('operationsAlertList');if(!list)return;
  const items=operationCenterItems();
  const counts={appointments:items.filter(item=>item.type==='appointments').length,plans:items.filter(item=>item.type==='plans').length,labs:items.filter(item=>item.type==='labs').length,prescriptions:items.filter(item=>item.type==='prescriptions').length};
  $('operationAllCount').textContent=String(items.length);$('operationAppointmentsCount').textContent=String(counts.appointments);$('operationPlansCount').textContent=String(counts.plans);$('operationLabsCount').textContent=String(counts.labs);$('operationPrescriptionsCount').textContent=String(counts.prescriptions);
  document.querySelectorAll('[data-operation-filter]').forEach(button=>button.classList.toggle('active',button.dataset.operationFilter===operationsCenter.filter));
  const visible=operationsCenter.filter==='all'?items:items.filter(item=>item.type===operationsCenter.filter);
  if((treatmentPlanCenter.loading||operationsCenter.labLoading||operationsCenter.prescriptionsLoading)&&!visible.length){list.innerHTML='<div class="treatment-plan-center-empty">جارٍ تجميع التنبيهات التشغيلية…</div>';return}
  if(!visible.length){list.innerHTML='<div class="operations-center-clear"><span>✓</span><strong>لا توجد إجراءات معلقة في هذا القسم</strong><small>ستظهر التحديثات هنا تلقائيًا عند وصولها.</small></div>';return}
  const icons={appointments:'📅',plans:'▤',labs:'🦷',prescriptions:'💊'};
  const labLabels={pending_send:'بانتظار التسليم',sent:'سُلّمت للمعمل',in_production:'قيد التصنيع',ready_at_lab:'جاهزة بالمعمل',received_clinic:'وصلت للعيادة',delivered_patient:'سُلّمت للمريض',needs_adjustment:'تحتاج تعديلًا',returned_lab:'أُعيدت للمعمل',cancelled:'ملغاة'};
  list.innerHTML=visible.slice(0,60).map(item=>{
    const control=item.type==='appointments'
      ?`<select data-operation-appointment-status="${escapeHtml(item.recordId)}" aria-label="تعديل حالة طلب الموعد">${Object.entries(APPOINTMENT_STATUS_LABELS).map(([value,label])=>`<option value="${value}" ${item.status===value?'selected':''}>${label}</option>`).join('')}</select>`
      :item.type==='plans'
        ?`<select data-operation-plan-status="${escapeHtml(item.canonical)}" aria-label="تعديل حالة الخطة">${PLAN_STATUS_VALUES.map(value=>`<option value="${value}" ${item.status===value?'selected':''}>${escapeHtml(planStatusText(value))}</option>`).join('')}</select>`
        :item.type==='labs'
          ?`<select data-operation-lab-status="${escapeHtml(item.recordId)}" data-operation-lab-clinic="${escapeHtml(item.clinicId)}" aria-label="تعديل حالة المعمل">${Object.entries(labLabels).map(([value,label])=>`<option value="${value}" ${item.status===value?'selected':''}>${label}</option>`).join('')}</select>`
          :'<span class="prescription-admin-ready">جاهزة للمشاركة</span>';
    return`<article class="operation-alert-item ${item.tone}" data-operation-type="${item.type}"><span class="operation-alert-icon" aria-hidden="true">${icons[item.type]}</span><div class="operation-alert-copy"><small>${escapeHtml(item.source)}</small><strong>${escapeHtml(item.title)}</strong><b>${escapeHtml(item.patient)}${item.identity?` · ${escapeHtml(item.identity)}`:''}</b><p>${escapeHtml(item.detail||'')}</p></div><div class="operation-alert-actions">${control}${item.type==='plans'?`<button type="button" data-operation-plan="${escapeHtml(item.canonical)}">فتح الخطة</button>`:`<a href="${escapeHtml(item.href)}">${item.type==='prescriptions'?'فتح الوصفة ومشاركتها':'فتح المركز'}</a>`}</div></article>`;
  }).join('');
}
function updateTreatmentPlanCenterTrigger(){
  const button=$('treatmentPlanCenterBtn'),count=$('treatmentPlanCenterCount');if(!button||!count)return;
  const pending=operationCenterItems().length;
  count.textContent=String(pending);
  button.classList.toggle('has-pending',pending>0);
  button.title=pending?`${pending} إجراء يحتاج متابعة`:'فتح مركز العمليات';
}
function syncTreatmentPlanCenterClinics(){
  const select=$('treatmentPlanCenterClinic');if(!select)return;
  const previous=select.value||'all';
  const ids=[...new Set(planCenterEntries().map(({record})=>record.clinicId).filter(Boolean))];
  select.innerHTML=`<option value="all">جميع العيادات</option>${ids.sort((a,b)=>clinicNumber(a)-clinicNumber(b)).map(id=>{const clinic=clinicDirectory.find(item=>item.id===id)||defaultClinic(clinicNumber(id));return`<option value="${escapeHtml(id)}">${escapeHtml(clinicDisplayName(clinic))}</option>`}).join('')}`;
  select.value=[...select.options].some(option=>option.value===previous)?previous:'all';
}
function renderTreatmentPlanCenter(){
  const list=$('treatmentPlanCenterList');if(!list)return;
  syncTreatmentPlanCenterClinics();
  const entries=planCenterEntries(),pending=entries.filter(({record})=>planCenterIsUnapproved(record?.status)),zeroFiles=entries.filter(({canonical,record})=>isZeroFileNumber(record?.fileNo)||/^file:0+$/i.test(canonical));
  $('planCenterTotal').textContent=String(entries.length);$('planCenterPending').textContent=String(pending.length);$('planCenterApproved').textContent=String(entries.filter(({record})=>planCenterIsFinal(record?.status)).length);$('planCenterZeroFiles').textContent=String(zeroFiles.length);
  updateTreatmentPlanCenterTrigger();
  const query=String($('treatmentPlanCenterSearch')?.value||'').trim().toLowerCase(),clinicFilter=$('treatmentPlanCenterClinic')?.value||'all',statusFilter=$('treatmentPlanCenterStatus')?.value||'all';
  const visible=entries.filter(({record})=>clinicFilter==='all'||record.clinicId===clinicFilter).filter(({record})=>statusFilter==='all'||statusFilter==='unapproved'&&planCenterIsUnapproved(record.status)||record.status===statusFilter).filter(({record})=>!query||`${record.fullName||''} ${record.fileNo||''} ${record.mobile||''} ${record.planNo||''}`.toLowerCase().includes(query));
  const error=$('treatmentPlanCenterError');error.hidden=!treatmentPlanCenter.error;error.textContent=treatmentPlanCenter.error;
  renderOperationsCenter();
  if(treatmentPlanCenter.loading){list.innerHTML='<div class="treatment-plan-center-empty">جارٍ تحميل سجل الخطط العلاجية…</div>';return}
  if(!visible.length){list.innerHTML=`<div class="treatment-plan-center-empty">${entries.length?'لا توجد خطط مطابقة للتصفية.':'لا توجد خطط علاجية محفوظة.'}</div>`;return}
  const labels=planStatusLabels();
  list.innerHTML=visible.map(({canonical,record})=>{
    const clinic=clinicDirectory.find(item=>item.id===record.clinicId)||defaultClinic(clinicNumber(record.clinicId));
    const zeroFile=isZeroFileNumber(record.fileNo)||/^file:0+$/i.test(canonical),canOpen=record.sourcePatientId&&/^\d{4}-\d{2}-\d{2}$/.test(record.sourceDate||'');
    const options=PLAN_STATUS_VALUES.map(status=>`<option value="${status}" ${status===record.status?'selected':''}>${escapeHtml(labels[status])}</option>`).join('');
    return`<article class="treatment-plan-center-item status-${escapeHtml(PLAN_STATUS_VALUES.includes(record.status)?record.status:'draft')} ${planCenterIsUnapproved(record.status)?'needs-approval':'is-approved'} ${zeroFile?'has-zero-file':''}" data-plan-center-key="${escapeHtml(canonical)}"><div class="plan-center-patient"><strong>${escapeHtml(record.fullName||'مريض بدون اسم')}</strong><small>${record.planNo?`رقم الخطة ${escapeHtml(record.planNo)} · `:''}ملف ${escapeHtml(record.fileNo||'غير مسجل')}${record.mobile?` · ${escapeHtml(record.mobile)}`:''}</small>${zeroFile?'<span class="plan-zero-file-alert">⚠ رقم الملف 0 مشترك — يجب تصحيحه من الخطة أو بيانات المريض</span>':''}</div><div class="plan-center-clinic"><b>${escapeHtml(clinicDisplayName(clinic))}</b><small>${record.updatedAt?new Date(record.updatedAt).toLocaleString('ar-SA-u-ca-gregory-nu-latn'):'—'}</small></div><label class="plan-center-status"><span>حالة الاعتماد</span><select data-plan-center-status="${escapeHtml(canonical)}">${options}</select></label><div class="plan-center-actions"><button type="button" class="primary" data-plan-center-open="${escapeHtml(canonical)}" ${canOpen?'':'disabled'}>فتح وتعديل</button><button type="button" class="danger" data-plan-center-delete="${escapeHtml(canonical)}">حذف الخطة</button></div></article>`;
  }).join('');
}
async function refreshTreatmentPlanCenter(){
  if(treatmentPlanCenter.loading)return;
  treatmentPlanCenter.loading=true;treatmentPlanCenter.error='';renderTreatmentPlanCenter();
  try{const response=await request(`${PLAN_REGISTRY_API}?clinic=${encodeURIComponent(ACTIVE_CLINIC_ID)}&_=${Date.now()}`,{},15000),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'تعذر تحميل الخطط');treatmentPlanCenter={records:data.records||{},aliases:data.aliases||{},loading:false,error:'',loadedAt:Date.now()};renderTreatmentPlanCenter()}catch(error){treatmentPlanCenter.loading=false;treatmentPlanCenter.error=String(error.message||error);renderTreatmentPlanCenter()}
}
async function refreshOperationsLabCases(){
  if(operationsCenter.labLoading)return operationsCenter.labCases;
  operationsCenter.labLoading=true;operationsCenter.labError='';renderOperationsCenter();
  try{
    const response=await request(`/api/lab-cases?scope=all&_=${Date.now()}`,{},15000),data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'تعذر تحميل حالات المعمل');
    operationsCenter.labCases=Array.isArray(data.cases)?data.cases:[];operationsCenter.labLoadedAt=Date.now();
  }catch(error){operationsCenter.labError=String(error.message||error)}
  finally{operationsCenter.labLoading=false;renderOperationsCenter();updateTreatmentPlanCenterTrigger()}
  return operationsCenter.labCases;
}
async function refreshOperationsPrescriptions(){
  if(VIEW_MODE!=='admin'||authUser?.role!=='admin'||operationsCenter.prescriptionsLoading)return operationsCenter.prescriptions;
  operationsCenter.prescriptionsLoading=true;operationsCenter.prescriptionsError='';renderOperationsCenter();
  try{
    const response=await request(`${PRESCRIPTIONS_API}?scope=all&_=${Date.now()}`,{},15000),data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'تعذر تحميل الوصفات');
    operationsCenter.prescriptions=Array.isArray(data.records)?data.records:[];operationsCenter.prescriptionsLoadedAt=Date.now();
  }catch(error){operationsCenter.prescriptionsError=String(error.message||error)}
  finally{operationsCenter.prescriptionsLoading=false;renderOperationsCenter();updateTreatmentPlanCenterTrigger()}
  return operationsCenter.prescriptions;
}
function scheduleOperationsPrescriptionPolling(){
  clearTimeout(operationsCenter.prescriptionsTimer);if(!operationsCenter.prescriptionsStarted)return;
  const cadence=syncCadence(),delay=document.hidden?Math.max(cadence.delay,120000):(cadence.workHours?30000:5*60*1000);
  operationsCenter.prescriptionsTimer=setTimeout(async()=>{await refreshOperationsPrescriptions();scheduleOperationsPrescriptionPolling()},delay);
}
function startOperationsPrescriptionPolling(){
  if(operationsCenter.prescriptionsStarted)return;operationsCenter.prescriptionsStarted=true;
  refreshOperationsPrescriptions().finally(scheduleOperationsPrescriptionPolling);
}
function stopOperationsPrescriptionPolling(){
  operationsCenter.prescriptionsStarted=false;clearTimeout(operationsCenter.prescriptionsTimer);operationsCenter.prescriptionsTimer=null;
}
async function changeOperationLabStatus(id,clinicId,status,select){
  const item=operationsCenter.labCases.find(entry=>String(entry.id)===String(id));
  if(!item||item.status===status)return;
  const previous=item.status;select.disabled=true;
  try{
    const response=await request('/api/lab-cases',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id,clinicId,status})}),data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'تعذر تحديث حالة المعمل');
    const index=operationsCenter.labCases.findIndex(entry=>String(entry.id)===String(id));
    if(index>=0)operationsCenter.labCases[index]=data.case;
    if(clinicId===ACTIVE_CLINIC_ID){const localIndex=labCasesState.cases.findIndex(entry=>String(entry.id)===String(id));if(localIndex>=0)labCasesState.cases[localIndex]=data.case;renderFloatingLabButton();renderTable()}
    renderOperationsCenter();updateTreatmentPlanCenterTrigger();toast('تم تحديث حالة المعمل',`${item.patient?.name||'المريض'} — ${labStatusText(status)}`);
  }catch(error){select.value=previous;toast('تعذر تحديث حالة المعمل',String(error.message||error))}
  finally{select.disabled=false}
}
function openTreatmentPlanCenter(){
  operationsCenter.filter='all';openModal('treatmentPlanCenterModal');renderTreatmentPlanCenter();renderOperationsCenter();
  Promise.allSettled([refreshTreatmentPlanCenter(),refreshAppointmentRequests({notify:false}),refreshOperationsLabCases(),refreshOperationsPrescriptions()]);
}
function openPlanCenterRecord(canonical){
  const record=treatmentPlanCenter.records?.[canonical];if(!record?.sourcePatientId||!record?.sourceDate)return;
  cacheTreatmentSource(record.sourcePatientId,{id:record.sourcePatientId,name:record.fullName||'',file:record.fileNo||'',phone:record.mobile||'',nationalId:record.nationalId||'',date:record.sourceDate,start:'',view:'admin',returnUrl:location.href});
  location.href=`./treatment-plan.html?${new URLSearchParams({patientId:record.sourcePatientId,date:record.sourceDate,clinic:record.clinicId||'clinic-1',view:'admin'}).toString()}`;
}
async function changePlanCenterStatus(canonical,nextStatus,select){
  const record=treatmentPlanCenter.records?.[canonical],previous=record?.status;if(!record||!PLAN_STATUS_VALUES.includes(nextStatus)){if(select)select.value=previous||'draft';return}
  let cancellationReason='';
  if(nextStatus==='cancelled'){
    cancellationReason=prompt(`سبب إلغاء خطة ${record.fullName||'المريض'}:`,`أُلغيت الخطة بقرار الإدارة.`);
    if(cancellationReason===null){if(select)select.value=previous;return}
  }else if(!confirm(`تغيير حالة خطة ${record.fullName||'المريض'} إلى «${planStatusText(nextStatus)}»؟`)){if(select)select.value=previous;return}
  select.disabled=true;
  try{
    const params=new URLSearchParams({patientId:record.sourcePatientId,date:record.sourceDate,clinic:record.clinicId||'clinic-1'}),loaded=await request(`/api/treatment-plan?${params.toString()}`),data=await loaded.json();if(!loaded.ok||!data.exists||!data.plan)throw new Error('تعذر العثور على ملف الخطة الكامل');
    applyPlanStatusMetadata(data.plan,nextStatus,'',cancellationReason);
    const saved=await request(`/api/treatment-plan?${params.toString()}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({plan:data.plan})});if(!saved.ok)throw new Error('تعذر حفظ حالة الخطة');
    const registry=await request(`${PLAN_REGISTRY_API}?clinic=${encodeURIComponent(record.clinicId||'clinic-1')}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({patient:{fullName:record.fullName,fileNo:record.fileNo,mobile:record.mobile,nationalId:record.nationalId},status:nextStatus,planNo:record.planNo,sourcePatientId:record.sourcePatientId,sourceDate:record.sourceDate,cancelledAt:data.plan.meta?.cancelledAt||0,cancelledBy:data.plan.meta?.cancelledBy||'',cancellationReason:data.plan.meta?.cancellationReason||''})});if(!registry.ok)throw new Error('حُفظت الخطة وتعذر تحديث الفهرس');
    await refreshTreatmentPlanCenter();treatmentPlanRegistry.lastFetchedAt=0;await refreshTreatmentPlanRegistry(true);toast('تم تحديث حالة الخطة',`${record.fullName||'المريض'} — ${planStatusText(nextStatus)}`)
  }catch(error){select.value=previous;toast('تعذر تحديث الخطة',String(error.message||error))}finally{select.disabled=false}
}
async function deletePlanCenterRecord(canonical){
  const record=treatmentPlanCenter.records?.[canonical];if(!record)return;
  if(!confirm(`حذف خطة ${record.fullName||'المريض'} نهائيًا؟\nلن يُحذف موعد المريض.`))return;
  try{const response=await request(`${PLAN_REGISTRY_API}?clinic=${encodeURIComponent(record.clinicId||'clinic-1')}`,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({canonical})}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'تعذر حذف الخطة');patients.forEach(patient=>{if(planRegistryIdentityKeys(patient).some(key=>treatmentPlanCenter.aliases?.[key]===canonical)){patient.treatmentPlanStatus='';patient.treatmentPlanUpdatedAt=Date.now()}});markDirty();await refreshTreatmentPlanCenter();treatmentPlanRegistry.lastFetchedAt=0;await refreshTreatmentPlanRegistry(true);toast('تم حذف الخطة','بقي موعد المريض وبياناته دون تغيير.')}catch(error){toast('تعذر حذف الخطة',String(error.message||error))}
}
function patientIdentityRows(){
  const merged=new Map();
  Object.values(patientIdentityDirectory.records||{}).forEach(record=>{
    const key=patientIdentityRecordKey(record);
    if(!key||key==='name:')return;
    merged.set(key,{
      fullName:String(record.fullName||''),
      fileNo:String(record.fileNo||''),
      mobile:String(record.mobile||''),
      nationalId:String(record.nationalId||''),
      clinicId:String(record.latestClinicId||record.clinicId||record.clinicIds?.[0]||'clinic-1'),
      status:String(record.treatmentPlanStatus||record.status||''),
      patientId:String(record.latestPatientId||record.sourcePatientId||''),
      date:String(record.lastAppointmentDate||record.sourceDate||''),
      start:String(record.latestStart||''),
      updatedAt:Number(record.lastSeenAt||record.updatedAt||0),
      hasPlan:Boolean(record.planCount||record.treatmentPlanStatus||record.status),
      planCount:Number(record.planCount||0),
      prescriptionCount:Number(record.prescriptionCount||0),
      labCount:Number(record.labCount||0),
      communicationCount:Number(record.communicationCount||0)
    });
  });
  adminHubAllPatients().forEach(item=>{
    const patient=item.patient||{};
    const row={
      fullName:String(patient.name||''),
      fileNo:String(patient.file||''),
      mobile:String(patient.phone||''),
      nationalId:String(patient.nationalId||''),
      clinicId:String(item.clinic?.id||'clinic-1'),
      status:effectiveTreatmentPlanStatus(patient),
      patientId:String(patient.id||''),
      date:String(adminPatientHub.date||selectedDate||''),
      start:String(patient.start||''),
      updatedAt:adminPatientActivityAt(patient,item.recordUpdatedAt),
      hasPlan:Boolean(effectiveTreatmentPlanStatus(patient))
    };
    const key=patientIdentityRecordKey(row);
    if(!key||key==='name:')return;
    const existing=merged.get(key);
    if(!existing||(!existing.patientId&&row.patientId)||row.updatedAt>existing.updatedAt)merged.set(key,{...existing,...row,status:row.status||existing?.status||'',hasPlan:Boolean(existing?.hasPlan||row.hasPlan)});
  });
  patients.forEach(patient=>{
    const row={fullName:String(patient.name||''),fileNo:String(patient.file||''),mobile:String(patient.phone||''),nationalId:String(patient.nationalId||''),clinicId:ACTIVE_CLINIC_ID,status:effectiveTreatmentPlanStatus(patient),patientId:String(patient.id||''),date:selectedDate,start:String(patient.start||''),updatedAt:Math.max(Number(patient.adminUpdatedAt||0),Number(patient.treatmentPlanUpdatedAt||0)),hasPlan:Boolean(effectiveTreatmentPlanStatus(patient))};
    const key=patientIdentityRecordKey(row);if(!key||key==='name:')return;
    const existing=merged.get(key);if(!existing||row.updatedAt>=Number(existing.updatedAt||0))merged.set(key,{...existing,...row,status:row.status||existing?.status||'',hasPlan:Boolean(existing?.hasPlan||row.hasPlan)});
  });
  patientIdentityRemote.matches.forEach(match=>{
    const patient=match?.patient||{},row={fullName:String(patient.name||''),fileNo:String(patient.file||''),mobile:String(patient.phone||''),nationalId:String(patient.nationalId||''),clinicId:String(match.clinicId||'clinic-1'),status:'',patientId:String(patient.id||''),date:String(match.sourceDate||''),updatedAt:0,hasPlan:match.source==='treatment-plan'};
    const key=patientIdentityRecordKey(row);if(!key||key==='name:')return;
    const existing=merged.get(key);if(!existing)merged.set(key,row);
  });
  return [...merged.values()].sort((left,right)=>right.updatedAt-left.updatedAt||left.fullName.localeCompare(right.fullName,'ar'));
}
function renderPatientIdentitySearch(){
  const results=$('patientIdentitySearchResults');if(!results)return;
  if(patientIdentityDirectory.loading){
    results.innerHTML=`<div class="patient-identity-loading">${lang==='en'?'Loading patient identities…':'جارٍ تحميل هويات المرضى…'}</div>`;
    return;
  }
  if(patientIdentityDirectory.error){
    results.innerHTML=`<div class="patient-identity-empty">${escapeHtml(patientIdentityDirectory.error)}</div>`;
    return;
  }
  const query=String($('patientIdentitySearchInput')?.value||'').trim();
  const queryDigits=toLatinDigits(query).replace(/\D/g,'');
  const allMatches=patientIdentityRows().filter(record=>!query||patientMatchesSearch(record,query)||(queryDigits&&toLatinDigits(record.nationalId||'').replace(/\D/g,'').includes(queryDigits)));
  const matches=allMatches.slice(0,patientIdentityDisplayLimit);
  if(!matches.length){
    results.innerHTML=`<div class="patient-identity-empty">${patientIdentityRemote.loading?(lang==='en'?'Searching all saved records…':'جارٍ البحث في جميع السجلات المحفوظة…'):patientIdentityRemote.error?escapeHtml(patientIdentityRemote.error):(lang==='en'?'No patient matched this search.':'لم يتم العثور على مريض مطابق للبحث.')}</div>`;
    return;
  }
  const tableHead=`<div class="patient-directory-table-head" aria-hidden="true"><span>الاسم الكامل</span><span>رقم الملف</span><span>الجوال</span><span>الهوية</span><span>ملخص السجل</span><span>التفاصيل</span></div>`;
  results.innerHTML=(patientIdentityRemote.loading?`<div class="patient-identity-loading">${lang==='en'?'Searching saved records…':'جارٍ استكمال البحث في السجلات…'}</div>`:'')+tableHead+matches.map(record=>{
    const clinic=clinicDirectory.find(item=>item.id===record.clinicId)||defaultClinic(clinicNumber(record.clinicId));
    const status=record.status?planStatusText(record.status):(lang==='en'?'No treatment plan yet':'لا توجد خطة علاجية بعد');
    const completeName=cleanDirectoryName(record.fullName).split(/\s+/).filter(Boolean).length>=2,completeFile=Boolean(normalizeDirectoryFile(record.fileNo)),completeMobile=/^05\d{8}$/.test(normalizeDirectoryPhone(record.mobile)),recordComplete=completeName&&completeFile&&completeMobile;
    return `<article class="patient-identity-result patient-directory-table-row ${recordComplete?'complete':'incomplete'}">
      <div class="patient-directory-name-cell"><strong class="patient-identity-field ${completeName?'complete':'missing'}">${escapeHtml(record.fullName||'الاسم ناقص')}</strong><small>${escapeHtml(clinicDisplayName(clinic,{compact:true}))}</small><span class="patient-identity-completeness ${recordComplete?'complete':'missing'}">${recordComplete?'✓ مكتملة':'! تحتاج استكمال'}</span></div>
      <span class="patient-directory-cell patient-identity-field ${completeFile?'complete':'missing'}" data-label="رقم الملف">${escapeHtml(record.fileNo||'ناقص')}</span>
      <span class="patient-directory-cell patient-identity-field ${completeMobile?'complete':'missing'}" data-label="الجوال">${escapeHtml(record.mobile||'ناقص')}</span>
      <span class="patient-directory-cell patient-identity-field ${record.nationalId?'complete':'optional'}" data-label="الهوية">${escapeHtml(record.nationalId||'اختياري')}</span>
      <div class="patient-identity-summary-badges"><span class="patient-identity-plan">${escapeHtml(status)}</span>${record.planCount?`<span>▤ ${record.planCount}</span>`:''}${record.prescriptionCount?`<span>💊 ${record.prescriptionCount}</span>`:''}${record.labCount?`<span>🦷 ${record.labCount}</span>`:''}${record.communicationCount?`<span>↗ ${record.communicationCount}</span>`:''}</div>
      <button type="button" data-identity-open="${escapeHtml(record.patientId)}" data-identity-date="${escapeHtml(record.date)}" data-identity-clinic="${escapeHtml(record.clinicId)}" data-identity-name="${escapeHtml(record.fullName)}" data-identity-file="${escapeHtml(record.fileNo)}" data-identity-phone="${escapeHtml(record.mobile)}" data-identity-national="${escapeHtml(record.nationalId||'')}" ${record.fileNo||record.mobile||record.nationalId?'':'disabled'}>${lang==='en'?'View details':'عرض التفاصيل'}</button>
    </article>`;
  }).join('')+(allMatches.length>matches.length?`<button class="patient-directory-more" type="button" data-identity-more>${lang==='en'?`Show more (${allMatches.length-matches.length})`:`عرض المزيد (${allMatches.length-matches.length})`}</button>`:'');
}
function schedulePatientIdentityRemoteSearch(){
  clearTimeout(patientIdentityRemote.timer);
  const query=String($('patientIdentitySearchInput')?.value||'').trim(),digits=toLatinDigits(query).replace(/\D/g,'');
  patientIdentityRemote.requestId+=1;const requestId=patientIdentityRemote.requestId;
  if(normalizeSearchText(query).length<2&&digits.length<3){patientIdentityRemote={...patientIdentityRemote,query:'',matches:[],loading:false,error:'',timer:null,requestId};return}
  patientIdentityRemote={...patientIdentityRemote,query,matches:[],loading:true,error:'',timer:setTimeout(async()=>{
    try{
      const clinic=authUser?.role==='admin'?'all':ACTIVE_CLINIC_ID,response=await request(`${PATIENT_LOOKUP_API}?type=query&value=${encodeURIComponent(query)}&clinic=${encodeURIComponent(clinic)}`,{cache:'no-store'},30000),data=await response.json().catch(()=>({}));
      if(requestId!==patientIdentityRemote.requestId)return;
      if(!response.ok)throw new Error(data.error||'تعذر البحث المركزي');
      patientIdentityRemote={...patientIdentityRemote,matches:Array.isArray(data.matches)?data.matches:[],loading:false,error:'',timer:null};
    }catch(error){if(requestId===patientIdentityRemote.requestId)patientIdentityRemote={...patientIdentityRemote,matches:[],loading:false,error:String(error.message||error),timer:null}}
    renderPatientIdentitySearch();
  },400),requestId};
  renderPatientIdentitySearch();
}
async function refreshPatientIdentityDirectory(){
  patientIdentityDirectory.loading=true;
  patientIdentityDirectory.error='';
  renderPatientIdentitySearch();
  try{
    if(authUser?.role!=='admin')throw new Error('clinic-local');
    const response=await request(`${PATIENTS_API}?clinic=${encodeURIComponent('all')}`,{cache:'no-store'},30000);
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'تعذر تحميل سجل المرضى');
    patientIdentityDirectory={
      records:data.records&&typeof data.records==='object'?data.records:{},
      revision:Number(data.revision||0),
      updatedAt:Number(data.updatedAt||0),
      loading:false,
      error:''
    };
  }catch(error){
    patientIdentityDirectory.loading=false;
    if(String(error?.message)==='clinic-local')patientIdentityDirectory={records:{},revision:0,updatedAt:0,loading:false,error:''};
    else patientIdentityDirectory.error=lang==='en'?'Could not load the patient identity index.':'تعذر تحميل سجل هويات المرضى. حاول مرة أخرى.';
  }
  renderPatientIdentitySearch();
}
async function openPatientIdentitySearch(){
  openModal('patientIdentitySearchModal');
  showPatientIdentitySearchView();
  closePatientDirectoryPanels();
  $('patientIdentitySearchInput').value='';
  patientIdentityDisplayLimit=120;
  clearTimeout(patientIdentityRemote.timer);patientIdentityRemote={query:'',matches:[],loading:false,error:'',timer:null,requestId:patientIdentityRemote.requestId+1};
  await refreshPatientIdentityDirectory();
  setTimeout(()=>$('patientIdentitySearchInput')?.focus(),50);
}
function patientProfileLookupFromButton(button){
  const file=String(button.dataset.identityFile||'').trim(),phone=String(button.dataset.identityPhone||'').trim(),national=String(button.dataset.identityNational||'').trim();
  if(file&&!/^0+$/.test(file.replace(/\D/g,'')))return{type:'file',value:file};
  if(phone)return{type:'phone',value:phone};
  if(national)return{type:'national',value:national};
  return null;
}
function showPatientIdentitySearchView(){
  $('patientIdentitySearchView').hidden=false;$('patientProfileView').hidden=true;
  patientProfileState={lookup:null,profile:null,loading:false,error:'',tab:'appointments'};
}
function closePatientDirectoryPanels(){
  $('patientDirectoryAddPanel').hidden=true;
  $('patientDirectoryImportPanel').hidden=true;
  $('patientDirectoryAddError').hidden=true;
  $('patientDirectoryImportError').hidden=true;
}
function openPatientDirectoryAddPanel(){
  $('patientDirectoryImportPanel').hidden=true;
  $('patientDirectoryAddPanel').hidden=false;
  $('patientDirectoryAddError').hidden=true;
  $('patientDirectoryAddForm').reset();
  setTimeout(()=>$('patientDirectoryName')?.focus(),30);
}
function openPatientDirectoryImportPicker(){
  const input=$('patientDirectoryFileInput');
  if(!input){toast('تعذر فتح الاستيراد','حدّث الصفحة ثم أعد المحاولة.');return}
  // Keep the native file chooser inside the original user gesture. Some mobile
  // browsers block it when modal rendering or asynchronous work runs first.
  input.click();
}
function patientProfilePaymentStage(item){
  if(!item?.paymentRequired)return'';
  if(item.paymentCompletedAt)return'completed';
  if(item.paymentAcknowledgedAt)return'received';
  return'requested';
}
function patientProfileDate(value){
  if(!value)return'—';
  try{return new Date(`${value}T12:00:00`).toLocaleDateString(lang==='en'?'en-GB':'ar-SA-u-ca-gregory-nu-latn',{year:'numeric',month:'short',day:'numeric'})}catch{return value}
}
function patientProfileDateTime(value){
  const timestamp=Number(value||0);if(!timestamp)return'—';
  try{return new Date(timestamp).toLocaleString(lang==='en'?'en-GB':'ar-SA-u-ca-gregory-nu-latn',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}catch{return'—'}
}
function patientProfileEmpty(message){return`<div class="patient-profile-empty"><span aria-hidden="true">◎</span><p>${escapeHtml(message)}</p></div>`}
function renderPatientProfileTimeline(){
  const target=$('patientProfileTimeline'),profile=patientProfileState.profile;if(!target||!profile)return;
  const tab=patientProfileState.tab;
  document.querySelectorAll('[data-profile-tab]').forEach(button=>button.classList.toggle('active',button.dataset.profileTab===tab));
  if(tab==='appointments'){
    const items=profile.appointments||[];
    target.innerHTML=items.length?items.map(item=>`<article class="patient-profile-event appointment"><span class="patient-event-mark" aria-hidden="true">${escapeHtml(item.date?.slice(-2)||'—')}</span><div><small>${escapeHtml(operationClinicLabel(item.clinicId))} · ${escapeHtml(patientProfileDate(item.date))}</small><strong>${escapeHtml(item.procedure||'موعد عيادة')}</strong><p>${escapeHtml(item.start||'—')}–${escapeHtml(item.end||'—')} · ${escapeHtml(item.statusLabel||item.status||'')}</p></div><a href="${escapeHtml(`${location.pathname}?${new URLSearchParams({view:'admin',clinic:item.clinicId||'clinic-1',date:item.date||selectedDate})}`)}">فتح الموعد</a></article>`).join(''):patientProfileEmpty('لا توجد مواعيد مرتبطة بهذه الهوية.');
    return;
  }
  if(tab==='plans'){
    const items=profile.plans||[];
    target.innerHTML=items.length?items.map(item=>`<article class="patient-profile-event plan"><span class="patient-event-mark" aria-hidden="true">▤</span><div><small>${escapeHtml(operationClinicLabel(item.clinicId))}</small><strong>${escapeHtml(item.planNo||'خطة علاجية')}</strong><p>${escapeHtml(planStatusText(item.status))}</p></div>${item.sourcePatientId&&item.sourceDate?`<button type="button" data-profile-open-plan="${escapeHtml(item.canonical)}">فتح الخطة</button>`:''}</article>`).join(''):patientProfileEmpty('لا توجد خطة علاجية مرتبطة بالمريض.');
    return;
  }
  if(tab==='prescriptions'){
    const items=profile.prescriptions||[];
    target.innerHTML=items.length?items.map(item=>{
      const patient=item.patient||profile.patient||{};
      const href=`./prescription.html?${new URLSearchParams({patientId:item.sourcePatientId||patient.id||'',date:item.sourceDate||selectedDate,clinic:item.clinicId||'clinic-1',view:'admin',patientName:patient.name||'',file:patient.file||'',phone:patient.phone||'',nationalId:patient.nationalId||''}).toString()}`;
      return `<article class="patient-profile-event prescription"><span class="patient-event-mark" aria-hidden="true">💊</span><div><small>${escapeHtml(operationClinicLabel(item.clinicId||'clinic-1'))} · ${escapeHtml(patientProfileDateTime(item.updatedAt))}</small><strong>${escapeHtml(item.prescriptionNo||'وصفة علاجية')}</strong><p>${escapeHtml(`${Number(item.medicineCount||0)} علاج · ${item.statusLabel||item.status||'محفوظة'}`)}</p></div><a href="${escapeHtml(href)}">فتح الوصفة</a></article>`;
    }).join(''):patientProfileEmpty('لا توجد وصفات علاجية مرتبطة بالمريض.');
    return;
  }
  if(tab==='payments'){
    const items=(profile.appointments||[]).filter(item=>item.paymentRequired);
    const labels={requested:'بانتظار استلام الإدارة',received:'بانتظار تنفيذ الدفع',completed:'تم تنفيذ الدفع'};
    target.innerHTML=items.length?items.map(item=>{const stage=patientProfilePaymentStage(item);return`<article class="patient-profile-event payment ${stage}"><span class="patient-event-mark" aria-hidden="true">﷼</span><div><small>${escapeHtml(operationClinicLabel(item.clinicId))} · ${escapeHtml(patientProfileDate(item.date))}</small><strong>${escapeHtml(item.paymentAction||'أمر دفع')}</strong><p>${escapeHtml(labels[stage]||'')}</p></div><span class="patient-profile-status">${escapeHtml(labels[stage]||'')}</span></article>`}).join(''):patientProfileEmpty('لا توجد أوامر دفع مسجلة للمريض.');
    return;
  }
  if(tab==='communications'){
    const items=profile.communications?.events||[];
    const labels={plan_whatsapp:'إرسال خطة علاجية عبر واتساب',review_whatsapp:'إرسال طلب تقييم عبر واتساب'};
    target.innerHTML=items.length?items.map(item=>`<article class="patient-profile-event communication ${escapeHtml(item.kind||'')}"><span class="patient-event-mark" aria-hidden="true">${item.kind==='review_whatsapp'?'★':'▤'}</span><div><small>${escapeHtml(operationClinicLabel(item.clinicId||'clinic-1'))} · ${escapeHtml(patientProfileDateTime(item.at))}</small><strong>${escapeHtml(labels[item.kind]||'تواصل مع المريض')}</strong><p>${item.planNo?`${escapeHtml(item.planNo)} · `:''}${escapeHtml(item.actor||'مستخدم النظام')}</p></div><span class="patient-profile-status">${item.kind==='review_whatsapp'?'تقييم':'خطة'}</span></article>`).join(''):patientProfileEmpty('لم تسجل مشاركات واتساب لهذا المريض بعد.');
    return;
  }
  const items=profile.labs||[];
  target.innerHTML=items.length?items.map(item=>`<article class="patient-profile-event lab"><span class="patient-event-mark" aria-hidden="true">🦷</span><div><small>${escapeHtml(operationClinicLabel(item.clinicId))} · ${escapeHtml(item.labName==='other'?(item.customLabName||'معمل آخر'):(item.labName||'المعمل'))}</small><strong>${escapeHtml((item.items||[]).map(entry=>`${entry.name} ×${entry.quantity}`).join('، ')||'حالة معمل')}</strong><p>${escapeHtml(labStatusText(item.status))}</p></div><a href="./lab.html?${new URLSearchParams({clinic:item.clinicId||'clinic-1',patient:profile.patient.file||profile.patient.phone||profile.patient.name}).toString()}">فتح الحالة</a></article>`).join(''):patientProfileEmpty('لا توجد حالات معمل مرتبطة بالمريض.');
}
function renderPatientProfile(){
  const loading=$('patientProfileLoading'),content=$('patientProfileContent'),error=$('patientProfileError');
  loading.hidden=!patientProfileState.loading;content.hidden=patientProfileState.loading||!patientProfileState.profile;error.hidden=!patientProfileState.error;error.textContent=patientProfileState.error;
  const profile=patientProfileState.profile;if(!profile)return;
  const patient=profile.patient||{},clinicId=profile.appointments?.[0]?.clinicId||profile.plans?.[0]?.clinicId||profile.labs?.[0]?.clinicId||ACTIVE_CLINIC_ID;
  $('patientProfileName').textContent=patient.name||'مريض بدون اسم';
  $('patientProfileIdentity').textContent=`ملف ${patient.file||'—'} · ${patient.phone||'لا يوجد جوال'}${patient.nationalId?` · هوية ${patient.nationalId}`:''}`;
  $('patientProfileClinic').textContent=operationClinicLabel(clinicId);
  $('patientProfileNameInput').value=patient.name||'';$('patientProfileFileInput').value=patient.file||'';$('patientProfilePhoneInput').value=patient.phone||'';$('patientProfileNationalInput').value=patient.nationalId||'';
  const editable=authUser?.role==='admin';
  $('patientProfileForm').classList.toggle('read-only',!editable);$('patientProfileForm').querySelectorAll('input,button').forEach(control=>control.disabled=!editable);
  $('patientProfileSave').textContent=editable?'حفظ وتحديث السجلات المرتبطة':'التعديل متاح لصفحة الإدارة';
  const communication=profile.communications||{};
  $('patientProfileAppointmentCount').textContent=String(profile.summary?.appointments||0);$('patientProfilePlanCount').textContent=String(profile.summary?.plans||0);$('patientProfilePrescriptionCount').textContent=String(profile.summary?.prescriptions||0);$('patientProfilePaymentCount').textContent=String((profile.appointments||[]).filter(item=>item.paymentRequired).length);$('patientProfileLabCount').textContent=String(profile.summary?.labs||0);$('patientProfileCommunicationCount').textContent=String(Number(communication.planWhatsappCount||0)+Number(communication.reviewWhatsappCount||0));
  $('patientProfilePlanWhatsappCount').textContent=String(communication.planWhatsappCount||0);$('patientProfileReviewWhatsappCount').textContent=String(communication.reviewWhatsappCount||0);
  $('patientProfileLastPlanWhatsapp').textContent=communication.lastPlanWhatsappAt?`آخر إرسال: ${patientProfileDateTime(communication.lastPlanWhatsappAt)}`:'لم ترسل خطة بعد';
  $('patientProfileLastReviewWhatsapp').textContent=communication.lastReviewWhatsappAt?`آخر إرسال: ${patientProfileDateTime(communication.lastReviewWhatsappAt)}`:'لم يرسل طلب تقييم بعد';
  renderPatientProfileTimeline();
}
async function loadPatientProfile(lookup){
  patientProfileState={lookup,profile:null,loading:true,error:'',tab:'appointments'};$('patientIdentitySearchView').hidden=true;$('patientProfileView').hidden=false;renderPatientProfile();
  try{
    const scope=authUser?.role==='admin'?'all':ACTIVE_CLINIC_ID;
    const response=await request(`${PATIENT_PROFILE_API}?${new URLSearchParams({type:lookup.type,value:lookup.value,clinic:scope})}`,{cache:'no-store'},30000),data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'تعذر تحميل ملف المريض');
    patientProfileState.profile=data;patientProfileState.loading=false;renderPatientProfile();
  }catch(error){patientProfileState.loading=false;patientProfileState.error=String(error.message||error);renderPatientProfile()}
}
function openPatientIdentityResult(button){const lookup=patientProfileLookupFromButton(button);if(lookup)loadPatientProfile(lookup)}
function openPatientProfilePlan(canonical){
  const record=(patientProfileState.profile?.plans||[]).find(item=>item.canonical===canonical);if(!record?.sourcePatientId||!record?.sourceDate)return;
  try{cacheTreatmentSource(record.sourcePatientId,{id:record.sourcePatientId,name:record.fullName||patientProfileState.profile?.patient?.name||'',file:record.fileNo||patientProfileState.profile?.patient?.file||'',phone:record.mobile||patientProfileState.profile?.patient?.phone||'',nationalId:record.nationalId||patientProfileState.profile?.patient?.nationalId||'',date:record.sourceDate,start:'',view:'admin',returnUrl:location.href})}catch{}
  location.href=`./treatment-plan.html?${new URLSearchParams({patientId:record.sourcePatientId,date:record.sourceDate,clinic:record.clinicId||'clinic-1',view:'admin'})}`;
}
async function savePatientProfile(event){
  event.preventDefault();if(!patientProfileState.lookup||patientProfileState.loading||authUser?.role!=='admin')return;
  const patient={name:$('patientProfileNameInput').value.trim(),file:$('patientProfileFileInput').value.trim(),phone:$('patientProfilePhoneInput').value.trim(),nationalId:$('patientProfileNationalInput').value.trim()};
  if(!patient.name||!patient.file||!patient.phone){toast('بيانات المريض ناقصة','الاسم ورقم الملف والجوال حقول مطلوبة.');return}
  if(patient.nationalId&&!/^\d{10}$/.test(patient.nationalId)){toast('رقم الهوية غير صحيح','يجب أن يتكون رقم الهوية من 10 أرقام.');return}
  const button=$('patientProfileSave');button.disabled=true;button.textContent='جارٍ تحديث السجلات…';
  try{
    const response=await request(PATIENT_PROFILE_API,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({lookup:patientProfileState.lookup,clinic:'all',patient})},45000),data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'تعذر حفظ بيانات المريض');
    const updated=data.updated||{};toast('تم تحديث ملف المريض',`المواعيد ${updated.appointments||0} · الخطط ${updated.plans||0} · المعمل ${updated.labs||0}`);
    patientIdentityDirectory={records:{},revision:0,updatedAt:0,loading:false,error:''};adminPatientHub.updatedAt=0;treatmentPlanRegistry.lastFetchedAt=0;
    const nextLookup=patient.file?{type:'file',value:patient.file}:patient.phone?{type:'phone',value:patient.phone}:{type:'national',value:patient.nationalId};
    await loadPatientProfile(nextLookup);refreshAdminPatientHub(true);refreshTreatmentPlanRegistry(true);
  }catch(error){toast('تعذر تحديث ملف المريض',String(error.message||error));button.disabled=false;button.textContent='حفظ وتحديث السجلات المرتبطة'}
}
function renderTable(){
  const activeStatusSelect=document.activeElement?.matches?.('.status-select,.plan-status-select');
  if(activeStatusSelect)return;

  const q=els.search.value.trim();
  const filter=els.filter.value;
  const visible=patients
    .filter(p=>patientMatchesSearch(p,q)&&(!filter||derivedStatus(p)===filter))
    .sort((a,b)=>a.start.localeCompare(b.start));

  els.patientRows.innerHTML=visible.length
    ? visible.map((p,i)=>{const displayStatus=derivedStatus(p);return`<tr class="row-status-${escapeHtml(displayStatus)}${['cancel','left'].includes(displayStatus)?' cancelled':''}">
        <td>${i+1}</td>
        <td><strong>${escapeHtml(VIEW_MODE==='admin'?(String(p.name||'').trim()||'—'):firstName(p.name))}</strong><button class="patient-prescription-badge" type="button" data-prescription-id="${escapeHtml(p.id)}" title="عرض وصفات المريض أو إعداد وصفة جديدة"><span class="patient-prescription-capsule" aria-hidden="true">💊</span><span>الوصفات</span></button>${treatmentPlanStatusControlMarkup(p)}${paymentBadgeMarkup(p)}${labCaseBadgeMarkup(p)}</td>
        <td>${escapeHtml(p.file)}${isZeroFileNumber(p.file)?`<span class="file-zero-warning">⚠ ${lang==='en'?'Update on arrival':'تحديثه عند الوصول'}</span>`:''}</td>
        <td>${escapeHtml(p.start)}</td>
        <td>${escapeHtml(p.end)}</td>
        <td>${escapeHtml(p.procedure||'—')}</td>
        <td>
          <select class="status-select" data-status-id="${escapeHtml(p.id)}" aria-label="${escapeHtml(`${lang==='en'?'Patient status':'حالة المريض'}: ${VIEW_MODE==='admin'?(String(p.name||'').trim()||'—'):firstName(p.name)}`)}">
            ${Object.keys(STATUS).map(k=>`<option value="${k}" ${p.status===k?'selected':''}>${escapeHtml(statusText(k))}</option>`).join('')}
          </select>
        </td>
        <td class="hide-screen">
          <div class="row-actions">
            ${displayStatus==='done'?`<button class="mini review-row-btn" type="button" data-review-id="${escapeHtml(p.id)}" title="${lang==='en'?'Request a Google review via WhatsApp':'طلب تقييم Google عبر واتساب'}"><span class="whatsapp-gold-mark" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.149-.67.149-.198.297-.767.967-.94 1.166-.174.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.174-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.149-.173.198-.297.298-.495.099-.198.05-.372-.025-.521-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.009-.371-.011-.57-.011-.198 0-.52.074-.792.372-.273.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.693.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347M12.004 21.5h-.004a9.45 9.45 0 0 1-4.817-1.318l-.345-.205-3.582.94.956-3.493-.224-.358A9.44 9.44 0 0 1 2.54 12.03C2.542 6.806 6.795 2.55 12.01 2.55a9.39 9.39 0 0 1 6.709 2.785 9.42 9.42 0 0 1 2.773 6.711c-.002 5.224-4.255 9.474-9.488 9.474m8.064-17.544A11.32 11.32 0 0 0 12.01.615C5.732.615.62 5.724.618 12.03c0 2.012.525 3.974 1.521 5.704L.522 23.64l6.043-1.585a11.4 11.4 0 0 0 5.435 1.383h.005c6.279 0 11.393-5.11 11.395-11.392a11.32 11.32 0 0 0-3.332-8.09"/></svg></span><b>${lang==='en'?'Request review':'طلب تقييم'}</b><i class="review-star star-one" aria-hidden="true">★</i><i class="review-star star-two" aria-hidden="true">✦</i><i class="review-star star-three" aria-hidden="true">★</i></button>`:''}
            <button class="mini lab-entry-btn" type="button" data-lab-entry-id="${escapeHtml(p.id)}" title="${lang==='en'?'Add dental lab case':'إضافة حالة معمل للمريض'}"><span class="lab-entry-icon" aria-hidden="true"><span class="lab-entry-tooth">🦷</span><span class="lab-entry-brush">🪥</span></span><span class="lab-entry-label">${lang==='en'?'Dental lab':'معمل'}</span></button>
            <button class="mini plan-row-btn" type="button" data-plan-id="${escapeHtml(p.id)}">${escapeHtml(treatmentPlanButtonText(p))}</button>
            ${VIEW_MODE==='clinic'&&displayStatus==='done'?`<button class="mini" type="button" data-completion-id="${escapeHtml(p.id)}">${lang==='en'?'Post-treatment actions':'إجراء دفع أو خطة'}</button>`:''}
            <button type="button" class="mini" data-edit-id="${escapeHtml(p.id)}">${escapeHtml(tr('edit'))}</button>
            <button type="button" class="mini danger" data-delete-id="${escapeHtml(p.id)}">${escapeHtml(tr('delete'))}</button>
          </div>
        </td>
      </tr>`}).join('')
    : `<tr><td colspan="8" class="empty">${escapeHtml(tr('noAppointments'))}</td></tr>`;
  visible.forEach(patient=>{
    if(!patient.reviewRequestedAt)return;
    const button=els.patientRows.querySelector(`[data-review-id="${CSS.escape(String(patient.id))}"]`);if(!button)return;
    button.classList.add('review-requested');
    const label=button.querySelector('b');if(label)label.textContent=lang==='en'?'Review requested':'تم طلب التقييم';
    button.querySelectorAll('.review-star').forEach(star=>star.remove());
    const when=new Date(Number(patient.reviewRequestedAt)).toLocaleString(lang==='en'?'en-GB':'ar-SA',{dateStyle:'short',timeStyle:'short'});
    button.title=lang==='en'?`Review requested ${when}. Click to request again.`:`تم طلب التقييم ${when}. اضغط لإعادة الطلب.`;
  });
  $('statusLegend').innerHTML=
    Object.keys(STATUS).map(key=>`<span class="legend-chip legend-${key}">${escapeHtml(statusText(key))}</span>`).join('');
}

function patientById(id){return patients.find(p=>String(p.id)===String(id))||null}
function cacheTreatmentSource(patientId,source){
  localStorage.setItem(`bestcare_treatment_source_${patientId}`,JSON.stringify({
    __bestcareSource:1,
    expiresAt:Date.now()+12*60*60*1000,
    source
  }));
}
function treatmentPlanButtonText(patient){
  const status=effectiveTreatmentPlanStatus(patient);
  if(lang==='en')return status?'Open plan':'Create treatment plan';
  return status?'فتح الخطة':'إنشاء خطة علاجية';
}
function openTreatmentPlan(id){
  const patient=patientById(id);if(!patient)return;
  const source={id:String(patient.id),name:String(patient.name||''),file:String(patient.file||''),phone:String(patient.phone||''),nationalId:String(patient.nationalId||''),procedure:String(patient.procedure||''),date:selectedDate,start:String(patient.start||''),view:VIEW_MODE,returnUrl:location.href};
  cacheTreatmentSource(patient.id,source);
  location.href=`./treatment-plan.html?patientId=${encodeURIComponent(patient.id)}&date=${encodeURIComponent(selectedDate)}&clinic=${encodeURIComponent(ACTIVE_CLINIC_ID)}&view=${encodeURIComponent(VIEW_MODE)}`;
}
function openPrescription(id){
  const patient=patientById(id);if(!patient)return;
  const params=new URLSearchParams({patientId:String(patient.id),date:selectedDate,clinic:ACTIVE_CLINIC_ID,view:VIEW_MODE});
  location.href=`./prescription.html?${params}`;
}
function applyPlanStatusMetadata(plan,nextStatus,rejectionReason='',cancellationReason=''){
  const now=Date.now(),actor=VIEW_MODE==='clinic'?'الطبيب':'الإدارة';
  plan.meta=plan.meta&&typeof plan.meta==='object'?plan.meta:{};
  plan.meta.status=nextStatus;
  if(nextStatus!=='cancelled')Object.assign(plan.meta,{cancelledAt:0,cancelledBy:'',cancellationReason:''});
  if(nextStatus==='draft'){
    Object.assign(plan.meta,{doctorApprovedAt:0,doctorApprovedBy:'',submittedAt:0,patientAcceptedAt:0,patientAcceptedBy:'',approvedAt:0,approvedBy:'',rejectedAt:0,rejectedBy:'',rejectionReason:''});
  }else if(nextStatus==='submitted'){
    Object.assign(plan.meta,{doctorApprovedAt:now,doctorApprovedBy:actor,submittedAt:now,patientAcceptedAt:0,patientAcceptedBy:'',approvedAt:0,approvedBy:'',rejectedAt:0,rejectedBy:'',rejectionReason:''});
  }else if(nextStatus==='patient_accepted'){
    Object.assign(plan.meta,{patientAcceptedAt:now,patientAcceptedBy:actor,approvedAt:0,approvedBy:'',rejectedAt:0,rejectedBy:'',rejectionReason:''});
  }else if(['approved','approved_signed'].includes(nextStatus)){
    Object.assign(plan.meta,{approvedAt:now,approvedBy:actor,rejectedAt:0,rejectedBy:'',rejectionReason:'',revision:Math.max(1,Number(plan.meta.revision||1)+1)});
  }else if(nextStatus==='rejected'){
    Object.assign(plan.meta,{rejectedAt:now,rejectedBy:actor,rejectionReason:String(rejectionReason||'تحتاج الخطة إلى تعديل.').trim().slice(0,500),patientAcceptedAt:0,patientAcceptedBy:'',approvedAt:0,approvedBy:''});
  }else if(nextStatus==='cancelled'){
    Object.assign(plan.meta,{cancelledAt:now,cancelledBy:actor,cancellationReason:String(cancellationReason||'أُلغيت الخطة بقرار الإدارة.').trim().slice(0,500)});
  }
}
async function changeTreatmentPlanStatus(id,nextStatus,select){
  const patient=patientById(id),currentStatus=patient?effectiveTreatmentPlanStatus(patient):'';
  if(!patient||!PLAN_STATUS_VALUES.includes(nextStatus)||!canChangePlanStatus(currentStatus,nextStatus)){
    if(select)select.value=currentStatus;
    toast(lang==='en'?'Invalid transition':'انتقال غير مسموح',lang==='en'?'Complete the current approval step first.':'أكمل مرحلة الاعتماد الحالية أولًا.');
    return;
  }
  if(nextStatus===currentStatus)return;

  let rejectionReason='',cancellationReason='';
  const confirmations={
    submitted:'هل تؤكد أن الطبيب راجع المسودة واعتمد إرسالها إلى الإدارة؟',
    patient_accepted:'هل تؤكد أن المريض أو الوصي وافق على الخطة ووقّع عليها؟',
    approved_signed:'هل تؤكد الاعتماد النهائي للخطة الموقعة؟',
    approved:'هل تؤكد اعتماد الخطة؟',
    draft:'هل تريد إعادة الخطة إلى مسودة قابلة للتعديل؟'
  };
  if(nextStatus==='rejected'){
    rejectionReason=prompt('اكتب سبب إعادة الخطة للتعديل:','تحتاج الخطة إلى مراجعة الإجراءات أو الأسعار.');
    if(rejectionReason===null){select.value=currentStatus;return}
  }else if(nextStatus==='cancelled'){
    cancellationReason=prompt('اكتب سبب إلغاء الخطة:','أُلغيت الخطة بقرار الإدارة.');
    if(cancellationReason===null){select.value=currentStatus;return}
  }else if(confirmations[nextStatus]&&!confirm(confirmations[nextStatus])){
    select.value=currentStatus;
    return;
  }

  select.disabled=true;
  const record=treatmentPlanRecord(patient);
  const sourcePatientId=String(record?.sourcePatientId||patient.id);
  const sourceDate=String(record?.sourceDate||selectedDate);
  const planUrl=`/api/treatment-plan?patientId=${encodeURIComponent(sourcePatientId)}&date=${encodeURIComponent(sourceDate)}&clinic=${encodeURIComponent(ACTIVE_CLINIC_ID)}`;
  let originalPlan=null;
  try{
    const loaded=await request(planUrl);
    const loadedData=await loaded.json();
    if(!loaded.ok||!loadedData.exists||!loadedData.plan)throw new Error(lang==='en'?'Open and save the treatment plan first.':'افتح الخطة العلاجية واحفظها أولًا.');
    originalPlan=loadedData.plan;
    const updatedPlan=JSON.parse(JSON.stringify(originalPlan));
    applyPlanStatusMetadata(updatedPlan,nextStatus,rejectionReason,cancellationReason);

    const saved=await request(planUrl,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({plan:updatedPlan})});
    if(!saved.ok)throw new Error(lang==='en'?'Could not save the treatment plan.':'تعذر حفظ الخطة العلاجية.');

    const registryResponse=await request(`${PLAN_REGISTRY_API}?clinic=${encodeURIComponent(ACTIVE_CLINIC_ID)}`,{
      method:'PUT',headers:{'content-type':'application/json'},
      body:JSON.stringify({
        patient:updatedPlan.patient,status:nextStatus,rejectionReason,cancellationReason,
        planNo:updatedPlan.meta?.planNo||'',sourcePatientId,sourceDate,
        patientAcceptedAt:updatedPlan.meta?.patientAcceptedAt||0,
        patientAcceptedBy:updatedPlan.meta?.patientAcceptedBy||'',
        approvedAt:updatedPlan.meta?.approvedAt||0,
        approvedBy:updatedPlan.meta?.approvedBy||'',
        cancelledAt:updatedPlan.meta?.cancelledAt||0,
        cancelledBy:updatedPlan.meta?.cancelledBy||''
      })
    });
    if(!registryResponse.ok){
      await request(planUrl,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({plan:originalPlan})}).catch(()=>{});
      throw new Error(lang==='en'?'Could not update the plan registry.':'تعذر تحديث سجل الخطط.');
    }

    mutate(()=>{
      const target=patientById(id);
      if(target){target.treatmentPlanStatus=nextStatus;target.treatmentPlanUpdatedAt=Date.now()}
      updateAlert={
        active:true,
        message:lang==='en'?`Treatment plan for ${firstName(patient.name)}: ${planStatusText(nextStatus)}`:`تم تحديث خطة المريض ${firstName(patient.name)} إلى: ${planStatusText(nextStatus)}`,
        updatedAt:Date.now(),
        kind:`plan-${nextStatus}`
      };
    });
    await pushState();
    treatmentPlanRegistry.lastFetchedAt=0;
    await refreshTreatmentPlanRegistry(true);
    toast(lang==='en'?'Plan status updated':'تم تحديث حالة الخطة',`${firstName(patient.name)} — ${planStatusText(nextStatus)}`);
  }catch(error){
    select.value=currentStatus;
    toast(lang==='en'?'Update failed':'تعذر تحديث حالة الخطة',String(error.message||error));
  }finally{
    select.disabled=false;
    renderTable();
  }
}
function announcePatient(p,repeated=false){
  if(!p)return;
  const message=lang==='en'?`${repeated?'Recall':'Calling'} patient ${firstName(p.name)}`:`${repeated?'إعادة استدعاء':'استدعاء'} المريض ${firstName(p.name)}`;
  toast(repeated?(lang==='en'?'Recall':'إعادة استدعاء'):(lang==='en'?'Patient called':'تم استدعاء المريض'),`${firstName(p.name)} — ${p.start}`);
  if('speechSynthesis' in window){
    try{
      window.speechSynthesis.cancel();
      const speech=new SpeechSynthesisUtterance(message);
      speech.lang=lang==='en'?'en-US':'ar-SA';speech.rate=.92;speech.pitch=1;
      window.speechSynthesis.speak(speech);
    }catch(error){console.warn('Patient announcement unavailable',error)}
  }
}
function callPatient(id){
  const p=patientById(id);if(!p)return;
  const repeated=Number(p.callCount||0)>0;
  mutate(()=>{p.lastCalledAt=Date.now();p.callCount=Number(p.callCount||0)+1});
  announcePatient(p,repeated);
}
function startActualTreatment(id){
  const p=patientById(id);if(!p)return;
  const other=currentPatient();
  if(other&&String(other.id)!==String(id)){toast('يوجد مريض قيد العلاج',`أنهِ حالة ${firstName(other.name)} أولًا`);return}
  if(p.actualStartedAt){toast('الوقت الفعلي يعمل',`بدأ عند ${new Date(Number(p.actualStartedAt)).toLocaleTimeString('ar-SA')}`);return}
  mutate(()=>{p.status='active';p.actualStartedAt=Date.now();p.lastCalledAt=p.lastCalledAt||Date.now()});
  toast('بدأ الوقت الفعلي',`${firstName(p.name)} — دون تغيير وقت الموعد الأصلي`);
}
function currentPaymentSelections(){
  const selections=new Map();
  document.querySelectorAll('[data-payment-row]').forEach(row=>{
    const id=String(row.dataset.paymentRow||'');
    if(!id)return;
    selections.set(id,{
      selected:Boolean(row.querySelector('[data-payment-select]')?.checked),
      quantity:Math.max(1,Math.min(99,Number(row.querySelector('[data-payment-quantity]')?.value||1))),
      free:Boolean(row.querySelector('[data-payment-free]')?.checked)
    });
  });
  return selections;
}
function renderPaymentProcedureOptions(preserve=false){
  const list=$('paymentProcedureList');if(!list)return;
  const saved=preserve?currentPaymentSelections():new Map();
  const items=paymentProcedureCatalog();
  const favorites=new Set(paymentCatalogProfile.favorites||[]);
  const doctorName=String(currentClinic?.doctorName||authUser?.displayName||authUser?.username||'').trim();
  if($('paymentCatalogDoctor'))$('paymentCatalogDoctor').textContent=doctorName
    ?(lang==='en'?`Personalized for Dr. ${doctorName}`:`مرتبة حسب مفضلة واستخدام د. ${doctorName}`)
    :(lang==='en'?'Personalized for this clinic':'مرتبة حسب مفضلة واستخدام هذه العيادة');
  list.innerHTML=items.length?items.map(item=>{
    const state=saved.get(item.id)||{selected:false,quantity:1,free:false};
    const isFavorite=favorites.has(item.id),usage=Number(paymentCatalogProfile.usage?.[item.id]||0);
    const badges=`${isFavorite?`<span class="lab-procedure-badge">${lang==='en'?'★ Favorite':'★ مفضل'}</span>`:''}${usage?`<span class="lab-procedure-badge">${lang==='en'?`Used ${usage}`:`استخدم ${usage}`}</span>`:''}`;
    return `<div class="payment-procedure-row${isFavorite?' is-favorite':''}" data-payment-row="${escapeHtml(item.id)}"><button class="payment-favorite-toggle${isFavorite?' is-favorite':''}" type="button" data-payment-favorite="${escapeHtml(item.id)}" aria-pressed="${isFavorite}" title="${isFavorite?'إزالة من المفضلة':'إضافة إلى المفضلة'}">${isFavorite?'★':'☆'}</button><label class="payment-procedure-name"><input type="checkbox" data-payment-select="${escapeHtml(item.id)}" ${state.selected?'checked':''}><span class="payment-procedure-copy"><span>${escapeHtml(item.name)}</span>${badges?`<small class="payment-procedure-meta">${badges}</small>`:''}</span></label><div class="payment-quantity"><small>${lang==='en'?'Quantity':'العدد'}</small><span class="payment-stepper"><button type="button" data-payment-step="decrease" data-payment-code="${escapeHtml(item.id)}" aria-label="${lang==='en'?'Decrease quantity':'إنقاص العدد'}">−</button><input type="text" inputmode="numeric" readonly value="${state.quantity}" data-payment-quantity="${escapeHtml(item.id)}" aria-label="${lang==='en'?'Procedure quantity':'عدد الإجراء'}"><button type="button" data-payment-step="increase" data-payment-code="${escapeHtml(item.id)}" aria-label="${lang==='en'?'Increase quantity':'زيادة العدد'}">+</button></span></div><label class="payment-free"><input type="checkbox" data-payment-free="${escapeHtml(item.id)}" ${state.free?'checked':''}><span>${lang==='en'?'Free':'مجاني'}</span></label></div>`;
  }).join(''):`<div class="payment-empty">${lang==='en'?'No services are available. Add them from Settings.':'لا توجد خدمات متاحة. أضفها من الإعدادات ← الإجراءات والخدمات والأسعار.'}</div>`;
}
async function updatePaymentPreference(body){
  const response=await request(`/api/treatment-catalog?clinic=${encodeURIComponent(ACTIVE_CLINIC_ID)}&doctor=${encodeURIComponent(paymentDoctorKey())}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({doctorKey:paymentDoctorKey(),...body})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'تعذر حفظ تفضيلات الإجراءات');
  return setPaymentProfile(data.profile);
}
async function togglePaymentFavorite(procedureId){
  const previous=normalizePaymentProfile(paymentCatalogProfile);
  const favorites=new Set(previous.favorites);
  const favorite=!favorites.has(procedureId);
  if(favorite)favorites.add(procedureId);else favorites.delete(procedureId);
  setPaymentProfile({...previous,favorites:[...favorites]});
  renderPaymentProcedureOptions(true);
  try{
    await updatePaymentPreference({action:'favorite',procedureId,favorite});
    renderPaymentProcedureOptions(true);
  }catch(error){
    setPaymentProfile(previous);renderPaymentProcedureOptions(true);
    toast('تعذر حفظ المفضلة','تمت إعادة الترتيب السابق.');
  }
}
async function trackPaymentProcedureUsage(items){
  const tracked=(Array.isArray(items)?items:[]).filter(item=>item.code&&item.code!=='other');
  if(!tracked.length)return;
  try{await updatePaymentPreference({action:'usage',items:tracked})}catch(error){console.warn('Payment usage tracking failed',error)}
}
function changePaymentQuantity(input,delta){
  if(!input)return;
  input.value=String(Math.max(1,Math.min(99,Number(input.value||1)+delta)));
}
let labUnitsManuallyChanged=false;
let pendingLabPatientId=null;
function labAssignmentText(){
  const doctor=String(currentClinic?.doctorName||authUser?.displayName||authUser?.username||'').trim();
  const doctorLabel=doctor?(/^(?:د\.?|الدكتور)\s*/i.test(doctor)?doctor:`د. ${doctor}`):'الطبيب غير محدد';
  return [doctorLabel,currentClinic?.name,currentClinic?.roomNumber?`غرفة ${currentClinic.roomNumber}`:''].filter(Boolean).join(' · ');
}
function openLabCaseEditor(patientId){
  const patient=patientById(patientId);if(!patient)return;
  pendingLabPatientId=String(patient.id);
  resetLabCaseEditor();
  $('labPatientName').textContent=firstName(patient.name);
  $('labPatientIdentity').textContent=[patient.file?`ملف ${patient.file}`:'',patient.phone?`جوال ${patient.phone}`:''].filter(Boolean).join(' · ')||'بيانات المريض';
  const assignment=$('labAssignedDoctor');
  if(assignment)assignment.textContent=labAssignmentText();
  openModal('labCaseModal');
}
function changeLabUnits(delta){labUnitsManuallyChanged=true;$('labUnitsInput').value=String(Math.max(1,Math.min(99,Number($('labUnitsInput').value||1)+delta)))}
function resetLabCaseEditor(){
  labUnitsManuallyChanged=false;
  $('labWorkType').value='';
  $('labCustomWorkInput').value='';
  $('labCustomWorkLabel').hidden=true;
  $('labNameSelect').value='';
  $('labCustomNameInput').value='';
  $('labCustomNameLabel').hidden=true;
  $('labUnitsInput').value='1';
  $('labMaterialInput').value='';
  $('labShadeInput').value='';
  $('labSentNowCheck').checked=false;
  $('labCaseError').textContent='';
}
function collectLabCaseDraft(){
  const workType=$('labWorkType').value;
  const customWork=$('labCustomWorkInput').value.trim();
  if(!workType)return{error:'اختر نوع حالة المعمل.',focus:'labWorkType'};
  if(workType==='other'&&!customWork)return{error:'اكتب الإجراء المعملي المطلوب.',focus:'labCustomWorkInput'};
  const labName=$('labNameSelect').value,customLabName=$('labCustomNameInput').value.trim();
  if(!labName)return{error:'اختر اسم معمل الأسنان.',focus:'labNameSelect'};
  if(labName==='other'&&!customLabName)return{error:'اكتب اسم المعمل الآخر.',focus:'labCustomNameInput'};
  const units=Math.max(1,Math.min(99,Number($('labUnitsInput').value||1)));
  const procedureName=workType==='other'?customWork:workType;
  return{labName,customLabName:labName==='other'?customLabName:'',items:[{code:'direct-lab-entry',name:procedureName,quantity:units}],units,material:$('labMaterialInput').value.trim(),shade:$('labShadeInput').value.trim(),status:$('labSentNowCheck').checked?'sent':'pending_send',sentAt:$('labSentNowCheck').checked?Date.now():0};
}
async function createLabCase(patient,draft){
  const response=await request(`/api/lab-cases?clinic=${encodeURIComponent(ACTIVE_CLINIC_ID)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...draft,clinicId:ACTIVE_CLINIC_ID,clinicName:currentClinic?.name||'',roomNumber:currentClinic?.roomNumber||'',doctorName:currentClinic?.doctorName||authUser?.displayName||'',patient:{id:patient.id,name:patient.name,file:patient.file,phone:patient.phone},sourceDate:selectedDate})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const error=new Error(data.duplicate?'توجد حالة معمل نشطة مسجلة مسبقًا لنفس المريض والإجراء.':(data.error||'تعذر إنشاء حالة المعمل'));
    error.code=data.code||'';
    error.duplicateCase=data.case||null;
    throw error;
  }
  if(data.case)labCasesState.cases=[data.case,...labCasesState.cases.filter(item=>item.id!==data.case.id)];
  labCasesState.revision=Number(data.revision||labCasesState.revision);labCasesState.updatedAt=Number(data.updatedAt||Date.now());labCasesState.lastFetchedAt=Date.now();
  return data.case;
}
async function saveLabCase(){
  const patient=patientById(pendingLabPatientId);if(!patient)return;
  const draft=collectLabCaseDraft();
  if(draft.error){$('labCaseError').textContent=draft.error;$(draft.focus)?.focus();return}
  const button=$('saveLabCaseBtn'),original=button.textContent;
  button.disabled=true;button.textContent='جارٍ الحفظ…';$('labCaseError').textContent='';
  try{
    try{
      await createLabCase(patient,draft);
    }catch(error){
      if(error.code!=='DUPLICATE_LAB_CASE')throw error;
      const duplicate=error.duplicateCase;
      const existingWork=(duplicate?.items||[]).map(item=>item.name).filter(Boolean).join('، ');
      const proceed=confirm(`تنبيه: توجد حالة معمل نشطة لهذا المريض${existingWork?` (${existingWork})`:''}.\n\nهل تريد إنشاء حالة إضافية رغم ذلك؟`);
      if(!proceed)throw error;
      await createLabCase(patient,{...draft,allowDuplicate:true});
    }
    closeModal('labCaseModal');
    pendingLabPatientId=null;
    renderTable();
    toast('تمت إضافة حالة المعمل',`${firstName(patient.name)} · ${draft.items[0].name} · ${draft.units} ${draft.units===1?'وحدة':'وحدات'}`);
  }catch(error){
    console.error('Direct lab case creation failed',error);
    $('labCaseError').textContent=error.message||'تعذر حفظ حالة المعمل. تحقق من الاتصال ثم حاول مرة أخرى.';
  }finally{button.disabled=false;button.textContent=original}
}
function resetPaymentProcedureEditor(){
  renderPaymentProcedureOptions();
  $('paymentOtherCheck').checked=false;
  $('paymentOtherInput').value='';
  $('paymentOtherQuantity').value='1';
  $('paymentOtherFree').checked=false;
  $('paymentDiscountInput').value='';
}
function collectPaymentItems(){
  const items=paymentProcedureCatalog().flatMap(item=>{
    if(!document.querySelector(`[data-payment-select="${item.id}"]`)?.checked)return[];
    const quantity=Math.max(1,Math.min(99,Number(document.querySelector(`[data-payment-quantity="${item.id}"]`)?.value||1)));
    const free=Boolean(document.querySelector(`[data-payment-free="${item.id}"]`)?.checked);
    return [{code:item.id,name:item.name,quantity,free}];
  });
  if($('paymentOtherCheck').checked){
    const name=$('paymentOtherInput').value.trim();
    if(!name)return {error:lang==='en'?'Write the other procedure name.':'اكتب اسم الإجراء الآخر.'};
    items.push({code:'other',name,quantity:Math.max(1,Math.min(99,Number($('paymentOtherQuantity').value||1))),free:$('paymentOtherFree').checked});
  }
  return {items,discount:$('paymentDiscountInput').value.trim()};
}
async function updatePaymentCatalogFromSettings({notify=true}={}){
  const button=$('paymentCatalogRefreshBtn');
  button?.classList.add('is-loading');
  if(button)button.textContent=lang==='en'?'Updating…':'جارٍ التحديث…';
  try{
    await refreshTreatmentCatalog({force:true});
    renderPaymentProcedureOptions(true);
    if(notify)toast(lang==='en'?'Services updated':'تم تحديث الإجراءات والخدمات',lang==='en'?'The payment order now uses the latest settings.':'يستخدم أمر الدفع الآن آخر قائمة محفوظة في الإعدادات.');
  }catch(error){
    if(notify)toast(lang==='en'?'Could not update services':'تعذر تحديث قائمة الخدمات',lang==='en'?'The locally saved list is still available.':'ستبقى القائمة المحفوظة على هذا الجهاز متاحة.');
    console.warn('Payment catalog refresh failed',error);
  }finally{
    button?.classList.remove('is-loading');
    if(button)button.textContent=lang==='en'?'↻ Update list':'↻ تحديث القائمة';
  }
}
function paymentItemsSummary(items,discount=''){
  const parts=(Array.isArray(items)?items:[]).map(item=>`${item.name} ×${item.quantity}${item.free?' (مجاني)':''}`);
  if(discount)parts.push(`الخصم: ${discount}`);
  return parts.join('، ');
}
function finishPatient(id){
  const p=patientById(id);if(!p)return;
  pendingCompletionId=String(id);
  $('paymentPatientText').textContent=lang==='en'?`Complete ${firstName(p.name)} and choose the required next actions.`:`اكتمل علاج ${firstName(p.name)} — اختر ما يلزم بعد الإكمال.`;
  $('paymentRequiredCheck').checked=false;
  $('planDraftCheck').checked=false;
  $('prescriptionCheck').checked=false;
  $('paymentActionField').hidden=true;
  resetPaymentProcedureEditor();
  openModal('paymentModal');
  updatePaymentCatalogFromSettings({notify:false});
}
async function confirmPatientCompletion(){
  const p=patientById(pendingCompletionId);if(!p)return;
  const paymentRequired=$('paymentRequiredCheck').checked;
  const createPlanDraft=$('planDraftCheck').checked;
  const createPrescription=$('prescriptionCheck').checked;
  const selection=collectPaymentItems();
  if(selection.error){toast(lang==='en'?'Payment action required':'بيانات الإجراء ناقصة',selection.error);$('paymentOtherInput').focus();return}
  if(paymentRequired&&!selection.items.length){toast(lang==='en'?'Payment action required':'اختر إجراء الدفع',lang==='en'?'Select at least one procedure.':'اختر إجراءً واحدًا على الأقل لإرساله إلى الإدارة.');return}
  const paymentAction=paymentRequired?paymentItemsSummary(selection.items,selection.discount):'';
  const confirmButton=$('confirmCompletionBtn');
  const originalConfirmText=confirmButton.textContent;
  confirmButton.disabled=true;
  confirmButton.textContent='جارٍ الحفظ…';
  try{
    mutate(()=>{
    p.status='done';
    p.completedAt=Date.now();
    p.adminUpdatedAt=Date.now();
    p.paymentRequired=paymentRequired;
    p.paymentAction=paymentRequired?paymentAction:'';
    p.paymentItems=paymentRequired?selection.items:[];
    p.paymentDiscount=paymentRequired?selection.discount:'';
    p.paymentRequestedAt=paymentRequired?Date.now():0;
    p.paymentAcknowledgedAt=0;
    p.paymentCompletedAt=0;
    if(createPlanDraft){
      p.treatmentPlanStatus='draft';
      p.treatmentPlanUpdatedAt=Date.now();
    }
    if(paymentRequired)updateAlert={active:true,message:lang==='en'?`New payment order for ${firstName(p.name)}`:`أمر دفع جديد للمريض ${firstName(p.name)}`,updatedAt:Date.now(),kind:'payment-request'};
    });
    if(paymentRequired)await trackPaymentProcedureUsage(selection.items);
    closeModal('paymentModal');
    pendingCompletionId=null;
    if(createPrescription){
      await pushState();
      toast(createPlanDraft?'تم تجهيز المسودة والوصفة':'تم تجهيز الوصفة','اختر نوع العلاج وأكمل الحقول، ثم اعتمدها ليصل التنبيه إلى الإدارة.');
      openPrescription(p.id);
      return;
    }
    if(createPlanDraft){
      await pushState();
      toast('تم إنشاء مسودة الخطة','أكمل بيانات الخطة، فعّل تأكيد اعتماد الطبيب، ثم أرسلها للإدارة.');
      openTreatmentPlan(p.id);
      return;
    }
    const upcoming=flowLeadPatient();
    toast(paymentRequired?'تم إرسال إجراء الدفع للإدارة':'اكتمل العلاج',paymentRequired?paymentAction:(upcoming?`أصبح ${firstName(upcoming.name)} في مقدمة الانتظار`:'لا يوجد مريض تالٍ'));
  }catch(error){
    console.error('Patient completion failed',error);
    toast('تعذر إكمال الطلب','لم تتغير حالة المريض. تحقق من الاتصال ثم حاول مرة أخرى.');
  }finally{
    confirmButton.disabled=false;
    confirmButton.textContent=originalConfirmText;
  }
}
function renderCompactTimeline(cur){
  const sorted=patients.slice().sort((a,b)=>String(a.start||'').localeCompare(String(b.start||'')));
  $('timeline').innerHTML=sorted.length?sorted.map(p=>{
    const status=derivedStatus(p);
    const currentClass=cur&&String(cur.id)===String(p.id)?' is-current':'';
    const stateClass=status==='done'?' is-done':status==='cancel'?' is-cancel':'';
    const paymentLabel=paymentStage(p)==='completed'?(lang==='en'?' • Payment completed':' • تم تنفيذ الدفع'):paymentStage(p)==='received'?(lang==='en'?' • Payment request received':' • تم استلام طلب الدفع'):paymentStage(p)==='requested'?(lang==='en'?' • Payment requested':' • طلب دفع'):'';
    return `<div class="timeline-chip${currentClass}${stateClass}" title="${escapeHtml(statusText(status)+paymentLabel)}"><strong>${escapeHtml(p.start||'--:--')} · ${escapeHtml(firstName(p.name))}</strong><small>${escapeHtml(statusText(status)+paymentLabel)}</small></div>`;
  }).join(''):`<div class="queue-empty">${escapeHtml(tr('noAppointments'))}</div>`;
}
function queueCardMarkup(p,index){
  const called=Number(p.callCount||0)>0;
  const position=index+1;
  const callLabel=called?tr('recall'):tr('callNext');
  const lastCall=called&&p.lastCalledAt?` · ${tr('lastCall')} ${new Date(Number(p.lastCalledAt)).toLocaleTimeString(lang==='en'?'en-GB':'ar-SA',{hour:'2-digit',minute:'2-digit'})}`:'';
  return `<article class="queue-card rank-${position} queue-${position}${called?' called':''}${p.status==='asks_delay'?' status-asks-delay':''}${p.status==='arrived'?' status-arrived':''}${p.status==='early_arrival'?' status-early-arrival':''}" data-patient-card-id="${escapeHtml(p.id)}" style="animation-delay:${Math.min(index*45,280)}ms">
    <div class="queue-card-top"><div class="queue-position">${position===1?tr('nextDirect'):`${tr('patientNumber')} ${position+1}`}${lastCall}</div><span class="queue-orbit" aria-hidden="true">#${position+1}</span></div>
    <div class="queue-name">${escapeHtml(firstName(p.name))}${treatmentPlanBadgeMarkup(p)}${labCaseBadgeMarkup(p)}</div>
    <div class="queue-meta">${escapeHtml(tr('fileLabel'))}: ${escapeHtml(p.file||'—')} · ${escapeHtml(p.start)}–${escapeHtml(p.end)} · ${escapeHtml(p.procedure||'—')} · ${escapeHtml(statusText(derivedStatus(p)))}</div>
    <span class="queue-countdown" data-queue-countdown-id="${escapeHtml(p.id)}">${fmtMs(timeDate(p.start)-new Date())}</span>
    <span class="queue-proximity-meter" aria-hidden="true"><i></i></span>
    ${position===1?`<div class="queue-actions"><button type="button" data-call-id="${escapeHtml(p.id)}">${escapeHtml(callLabel)}</button><button type="button" data-actual-id="${escapeHtml(p.id)}">${escapeHtml(tr('startActual'))}</button></div>`:''}
  </article>`;
}
function treemapMarkup(queue,index=0){
  if(index>=queue.length)return'';
  const card=queueCardMarkup(queue[index],index);
  if(index===queue.length-1)return`<div class="treemap-leaf">${card}</div>`;
  const direction=index%2===0?'horizontal':'vertical';
  return `<div class="queue-split split-${direction}"><div class="treemap-half">${card}</div><div class="treemap-rest">${treemapMarkup(queue,index+1)}</div></div>`;
}
function renderUpcoming(lead){
  const queue=upcomingPatients(lead?.id??null);
  const queueCountLabel=lang==='en'?`${queue.length} patients`:`${queue.length} مرضى`;
  const layoutHint=lang==='en'?'Market-style size map by appointment order':'خريطة أحجام مثل سوق الأسهم حسب ترتيب الموعد';
  document.querySelector('.upcoming-head small').innerHTML=`<span class="upcoming-layout-key">${escapeHtml(queueCountLabel)} · ${escapeHtml(layoutHint)}</span>`;
  const featured=queue.slice(0,8);
  const overflow=queue.slice(8);
  $('upcomingStack').classList.add('treemap-mode');
  $('upcomingStack').innerHTML=queue.length
    ? `<div class="treemap-root">${treemapMarkup(featured)}</div>${overflow.length?`<div class="queue-overflow-strip" aria-label="${escapeHtml(lang==='en'?'Additional upcoming patients':'بقية المرضى القادمين')}">${overflow.map((p,index)=>`<div class="queue-overflow-chip"><strong>#${index+9} ${escapeHtml(firstName(p.name))}</strong><span>${escapeHtml(p.start)}</span></div>`).join('')}</div>`:''}`
    : `<div class="treemap-root treemap-empty"><div class="queue-empty">${escapeHtml(tr('noUpcoming'))}</div></div>`;
  updateUpcomingCardVisuals();
}
function updateUpcomingCardVisuals(){
  const cards=[...document.querySelectorAll('[data-patient-card-id]')];
  cards.forEach((card,index)=>{
    const p=patientById(card.dataset.patientCardId);if(!p)return;
    const minutesUntil=(timeDate(p.start).getTime()-Date.now())/60000;
    const proximity=Math.max(0,Math.min(1,1-Math.max(0,minutesUntil)/180));
    card.style.setProperty('--queue-progress',`${Math.round(proximity*100)}%`);
    card.classList.remove('proximity-far','proximity-soon','proximity-near','proximity-now');
    card.classList.add(minutesUntil<=10?'proximity-now':minutesUntil<=30?'proximity-near':minutesUntil<=75?'proximity-soon':'proximity-far');
  });
}
function alertPresentationKey(alert){
  return `${String(alert?.kind||'alert')}|${Number(alert?.updatedAt||0)}|${String(alert?.message||'')}`;
}
function rememberDismissedAlert(alert){
  dismissedAlertKeys.add(alertPresentationKey(alert));
  dismissedAlertKeys=new Set([...dismissedAlertKeys].slice(-30));
  try{sessionStorage.setItem('bestcare_dismissed_alerts',JSON.stringify([...dismissedAlertKeys]))}catch{}
}
function alertWithinDisplayWindow(alert,now=Date.now()){
  const updatedAt=Number(alert?.updatedAt||0);
  const key=alertPresentationKey(alert);
  if(!alertFirstSeenAt.has(key))alertFirstSeenAt.set(key,now);
  const startedAt=updatedAt||alertFirstSeenAt.get(key)||now;
  return startedAt>now||now-startedAt<ALERT_DISPLAY_MS;
}
function alertDisplayStartedAt(alert){
  return Number(alert?.updatedAt||0)||alertFirstSeenAt.get(alertPresentationKey(alert))||Date.now();
}
function visibleAlert(){
  const now=Date.now();
  const localAlert=updateAlert?.kind==='manual'?null:updateAlert;
  const candidates=[localAlert,manualAlert]
    .filter(alert=>alert&&alert.active&&String(alert.message||'').trim()&&alertWithinDisplayWindow(alert,now)&&!dismissedAlertKeys.has(alertPresentationKey(alert)))
    .sort((left,right)=>Number(right.updatedAt||0)-Number(left.updatedAt||0));
  return candidates[0]||{active:false,message:'',updatedAt:0,kind:''};
}
function dismissCurrentAlert(){
  const current=visibleAlert();
  if(!current.active)return;
  rememberDismissedAlert(current);
  clearTimeout(alertAutoHideTimer);
  renderAlertUI();
  renderDoctorWorkspace();
}
function renderAlertUI(){
  const current=visibleAlert();
  const active=Boolean(current.active);
  clearTimeout(alertAutoHideTimer);
  if(active){
    const remaining=Math.max(50,alertDisplayStartedAt(current)+ALERT_DISPLAY_MS-Date.now());
    alertAutoHideTimer=setTimeout(()=>{renderAlertUI();renderDoctorWorkspace()},remaining+50);
  }
  const arrival=['status-arrived','status-early_arrival'].includes(current.kind);
  const delay=current.kind==='status-asks_delay';
  const paymentCompleted=current.kind==='payment-completed';
  els.alertRow.classList.toggle('show',active);
  els.alertRow.classList.toggle('kind-arrival',arrival);
  els.alertRow.classList.toggle('kind-delay',delay);
  els.alertRow.classList.toggle('kind-payment-completed',paymentCompleted);
  els.alertText.textContent=current.message||tr('defaultAlert');
  els.alertBtn.classList.toggle('is-active',active);
  els.alertBtn.classList.toggle('kind-arrival',arrival);
  els.alertBtn.classList.toggle('kind-delay',delay);
  els.alertBtn.classList.toggle('kind-payment-completed',paymentCompleted);
  els.alertBtn.setAttribute('aria-pressed',String(active));
  els.alertBtnHint.textContent=active
    ? tr('alertActiveHint')
    : tr('alertInactiveHint');
  const canClearManualAlert=Boolean(manualAlert.active&&authUser?.role==='admin');
  els.clearAlertBtn.hidden=authUser?.role!=='admin';
  els.clearAlertBtn.disabled=!canClearManualAlert;
  els.clearAlertBtn.textContent=canClearManualAlert
    ?(lang==='en'?'Cancel current alert':'إلغاء التنبيه الحالي')
    :(lang==='en'?'No active alert':'لا يوجد تنبيه فعال');
  els.alertRowDismissBtn.hidden=!active;
  els.alertRowDismissBtn.textContent=lang==='en'?'Dismiss':'إخفاء';
}
function renderLive(updateStructure=true){
  const derived=patients.map(p=>derivedStatus(p));
  $('statTotal').textContent=patients.length;
  $('statDone').textContent=derived.filter(s=>s==='done').length;
  $('statActive').textContent=derived.filter(s=>s==='active').length;
  $('statWaiting').textContent=derived.filter(s=>['waiting','arrived','early_arrival','late','asks_delay'].includes(s)).length;
  $('statCancel').textContent=derived.filter(s=>s==='cancel').length;

  const denominator=Math.max(1,patients.filter(p=>!['cancel','left'].includes(p.status)).length);
  $('statPercent').textContent=Math.round(patients.filter(p=>p.status==='done').length/denominator*100)+'%';

  const cur=currentPatient();
  const lead=cur||flowLeadPatient();
  const card=$('currentCard');
  const activelyTreating=Boolean(cur&&lead&&String(cur.id)===String(lead.id));
  const leadStatus=lead?derivedStatus(lead):'';
  card.className='card current-card '+stageFor(lead);
  $('currentVisualIcon').textContent=activelyTreating?'●':['arrived','early_arrival'].includes(leadStatus)?'✓':lead?'➜':'○';
  $('currentVisualIcon').classList.toggle('arrival-pulse',['arrived','early_arrival'].includes(leadStatus));
  $('currentLabel').textContent=activelyTreating?tr('currentPatient'):['arrived','early_arrival'].includes(leadStatus)?statusText(leadStatus):tr('nextToCall');
  $('currentName').innerHTML=lead?`${escapeHtml(firstName(lead.name))}<span class="current-plan-mark">${treatmentPlanBadgeMarkup(lead)}</span>${labCaseBadgeMarkup(lead)}`:escapeHtml(tr('noCurrent'));
  $('currentMeta').textContent=lead?`${tr('fileLabel')}: ${lead.file||'—'} • ${lead.start}–${lead.end} • ${lead.procedure||'—'} • ${statusText(derivedStatus(lead))}`:tr('noSchedule');
  $('currentCountdown').textContent=lead?fmtMs((activelyTreating?timeDate(lead.end):timeDate(lead.start))-new Date()):'--:--:--';
  $('actualTimer').textContent=lead?.actualStartedAt?fmtMs(Date.now()-Number(lead.actualStartedAt)):'--:--:--';
  $('actualTimerHint').textContent=lead?.actualStartedAt?`${tr('startedAt')} ${new Date(Number(lead.actualStartedAt)).toLocaleTimeString(lang==='en'?'en-GB':'ar-SA')}`:tr('actualStartHint');
  const notice=$('currentStatusNotice');
  notice.hidden=!lead;
  notice.className='current-status-notice '+(activelyTreating?'is-active':['arrived','early_arrival'].includes(leadStatus)?'is-arrived':'is-waiting');
  if(lead){
    const appointmentStart=timeDate(lead.start).getTime();
    const waitingBase=Number(lead.arrivedAt||appointmentStart);
    const beforeAppointment=Date.now()<appointmentStart;
    $('currentStatusTitle').textContent=activelyTreating?(lang==='en'?'Treatment confirmed and running':'تم تأكيد بدء العلاج'):leadStatus==='arrived'?(lang==='en'?'Patient arrived — waiting to start':'وصل المريض — بانتظار بدء العلاج'):leadStatus==='early_arrival'?(lang==='en'?'Early arrival — waiting for appointment':'وصول مبكر — بانتظار موعد العلاج'):(lang==='en'?'Waiting for treatment confirmation':'بانتظار تأكيد بدء العلاج');
    $('currentStatusText').textContent=activelyTreating?(lang==='en'?'Actual treatment time is being tracked':'يتم الآن احتساب مدة العلاج الفعلية'):beforeAppointment?(lang==='en'?'Time remaining until the scheduled appointment':'الوقت المتبقي حتى الموعد المحدد'):(lang==='en'?'Waiting time until treatment starts':'مدة الانتظار حتى بدء العلاج');
    $('waitingTimer').textContent=activelyTreating?fmtMs(Date.now()-Number(lead.actualStartedAt||Date.now())):beforeAppointment?fmtMs(appointmentStart-Date.now()):fmtMs(Date.now()-waitingBase);
  }

  document.querySelectorAll('[data-queue-countdown-id]').forEach(el=>{
    const p=patientById(el.dataset.queueCountdownId);
    if(p)el.textContent=fmtMs(timeDate(p.start)-new Date());
  });
  updateUpcomingCardVisuals();

  if(updateStructure){
    renderCompactTimeline(lead);
    renderUpcoming(lead);
    $('currentActions').innerHTML=lead?`<button type="button" data-call-id="${escapeHtml(lead.id)}">${escapeHtml(Number(lead.callCount||0)>0?tr('recall'):tr('callPatient'))}</button><button type="button" data-actual-id="${escapeHtml(lead.id)}" ${lead.actualStartedAt?'disabled':''}>${escapeHtml(lead.actualStartedAt?tr('actualRunning'):tr('startActual'))}</button><button type="button" data-plan-id="${escapeHtml(lead.id)}">${escapeHtml(treatmentPlanButtonText(lead))}</button>${activelyTreating?`<button type="button" class="finish" data-finish-id="${escapeHtml(lead.id)}">${escapeHtml(tr('finishPatient'))}</button>`:''}`:'';
    renderAlertUI();
  }
}

function renderDoctorWorkspace(){
  if(!$('doctorActionQueue'))return;
  const planTasks=patients
    .filter(patient=>['draft','rejected'].includes(effectiveTreatmentPlanStatus(patient)))
    .sort((a,b)=>String(a.start||'').localeCompare(String(b.start||'')));
  const postTreatmentTasks=patients
    .filter(patient=>derivedStatus(patient)==='done'&&!patient.paymentRequired&&!effectiveTreatmentPlanStatus(patient))
    .sort((a,b)=>String(a.start||'').localeCompare(String(b.start||'')));
  const paymentRequests=patients.filter(patient=>patient.paymentRequired);
  const submittedPlans=patients.filter(patient=>['submitted','patient_accepted'].includes(effectiveTreatmentPlanStatus(patient)));
  const tasks=[
    ...planTasks.map(patient=>{
      const status=effectiveTreatmentPlanStatus(patient);
      const isRevision=status==='rejected';
      const record=treatmentPlanRecord(patient);
      const detail=isRevision
        ?(record?.rejectionReason?`سبب الإعادة: ${record.rejectionReason}`:'أعادتها الإدارة لتعديل الطبيب ثم إعادة إرسالها.')
        :'مسودة خطة تحتاج مراجعة الطبيب واعتماده قبل إرسالها للإدارة.';
      return `<article class="doctor-action-item ${isRevision?'is-revision':'is-urgent'}">
        <span class="doctor-action-mark" aria-hidden="true">${isRevision?'↺':'✓'}</span>
        <div><strong>${escapeHtml(firstName(patient.name))} — ${escapeHtml(patient.file||'بدون رقم ملف')}</strong><small>${escapeHtml(detail)}</small></div>
        <button type="button" data-doctor-plan-id="${escapeHtml(patient.id)}">${isRevision?'تعديل وإعادة الإرسال':'مراجعة واعتماد المسودة'}</button>
      </article>`;
    }),
    ...postTreatmentTasks.map(patient=>`<article class="doctor-action-item">
      <span class="doctor-action-mark" aria-hidden="true">＋</span>
      <div><strong>${escapeHtml(firstName(patient.name))} — ${escapeHtml(patient.file||'بدون رقم ملف')}</strong><small>اكتمل العلاج؛ أرسل أمر الدفع أو أنشئ مسودة خطة علاجية.</small></div>
      <button type="button" data-doctor-completion-id="${escapeHtml(patient.id)}">إجراءات ما بعد العلاج</button>
    </article>`)
  ];
  const currentAlert=visibleAlert();
  const alertActive=Boolean(currentAlert.active&&currentAlert.message);
  const alertKind=String(currentAlert.kind||'');
  const alertPresentation=alertKind.includes('arriv')||alertKind==='payment-completed'
    ?{className:alertKind.includes('arriv')?'kind-arrival':'kind-payment',tone:'success',icon:'✓',label:alertKind.includes('arriv')?(lang==='en'?'Patient arrival':'وصول مريض'):(lang==='en'?'Payment completed':'تم تنفيذ الدفع')}
    :alertKind.includes('delay')
      ?{className:'kind-delay',tone:'warning',icon:'⏱',label:lang==='en'?'Delay inquiry':'استفسار عن التأخير'}
      :alertKind.includes('payment')
        ?{className:'kind-payment',tone:'warning',icon:'﷼',label:lang==='en'?'Payment update':'تحديث دفع'}
      :alertKind.includes('cancel')||alertKind.includes('left')
          ?{className:'kind-cancel',tone:'danger',icon:'×',label:lang==='en'?'Important patient status':'تحديث مهم لحالة المريض'}
          :alertKind==='manual'
            ?{className:'kind-cancel',tone:'danger',icon:'!',label:lang==='en'?'Urgent administration alert':'تنبيه مهم من الإدارة'}
            :{className:'',tone:'info',icon:'!',label:lang==='en'?'New clinic alert':'تنبيه جديد من الإدارة'};
  const alertMarkup=alertActive?`<article class="doctor-alert-message ${alertPresentation.className}">
    <span aria-hidden="true">${alertPresentation.icon}</span>
    <div><strong>${escapeHtml(alertPresentation.label)}</strong><small>${escapeHtml(currentAlert.message)}</small></div>
  </article>`:'';
  const totalAttention=tasks.length+(alertActive?1:0);
  $('doctorActionCount').textContent=String(totalAttention);
  $('doctorApprovalCount').textContent=String(planTasks.length);
  $('doctorPaymentCount').textContent=String(paymentRequests.length);
  $('doctorSubmittedCount').textContent=String(submittedPlans.length);
  $('doctorActionQueue').innerHTML=alertMarkup+(tasks.length
    ?tasks.join('')
    :alertActive?'':`<div class="doctor-action-empty">${lang==='en'?'No approvals are waiting for the doctor now.':'لا توجد اعتمادات تنتظر الطبيب حاليًا.'}</div>`);
  const floating=$('doctorFloatingAlerts');
  const hasRejectedPlan=planTasks.some(patient=>effectiveTreatmentPlanStatus(patient)==='rejected');
  const alertTone=alertActive?alertPresentation.tone:hasRejectedPlan?'danger':tasks.length?'warning':'info';
  floating.classList.remove('tone-success','tone-danger','tone-warning','tone-info');
  floating.classList.add(`tone-${alertTone}`);
  floating.hidden=VIEW_MODE!=='clinic'||totalAttention===0;
  if(floating.hidden){
    $('doctorFloatingAlertPanel').hidden=true;
    $('doctorFloatingAlertBtn').setAttribute('aria-expanded','false');
    $('doctorFloatingAlertPeek').hidden=true;
    return;
  }
  if(!alertActive)$('doctorFloatingAlertPeek').hidden=true;
  const alertTimestamp=Number(currentAlert.updatedAt||0);
  const isScreenMode=document.body.classList.contains('screen-mode');
  if(alertActive&&(isScreenMode||alertTimestamp>lastDoctorFloatingAlertAt)){
    if(alertTimestamp>lastDoctorFloatingAlertAt){
      lastDoctorFloatingAlertAt=alertTimestamp;
      sessionStorage.setItem('bestcare_doctor_alert_seen_at',String(alertTimestamp));
    }
    $('doctorFloatingPeekIcon').textContent=alertPresentation.icon;
    $('doctorFloatingPeekLabel').textContent=alertPresentation.label;
    $('doctorFloatingPeekText').textContent=currentAlert.message;
    $('doctorFloatingAlertPeek').hidden=false;
    clearTimeout(doctorAlertPeekTimer);
    if(!isScreenMode)doctorAlertPeekTimer=setTimeout(()=>{$('doctorFloatingAlertPeek').hidden=true},12000);
  }
}
function render(){
  renderFloatingLabButton();
  renderTable();
  renderLive();
  renderAdminPatientHub();
  renderPaymentPanel();
  renderDoctorWorkspace();
  updateModernAdminSidebar();
}
function viewUrl(mode,clinicId=ACTIVE_CLINIC_ID){
  const params=new URLSearchParams(location.search);
  params.set('view',mode);
  params.set('date',selectedDate||today());
  if(mode==='clinic')params.set('clinic',clinicId);
  return `${location.pathname}?${params.toString()}`;
}
function applyViewMode(){
  document.body.classList.toggle('view-admin',VIEW_MODE==='admin');
  document.body.classList.toggle('view-clinic',VIEW_MODE==='clinic');
  $('clinicViewLink').classList.toggle('active',VIEW_MODE==='clinic');
  $('adminViewLink').classList.toggle('active',VIEW_MODE==='admin');
  $('clinicViewLink').href=viewUrl('clinic');
  $('adminViewLink').href=viewUrl('admin');
  applyAdminLayout(adminLayoutMode);
}
function scrollAdminTarget(id,{open=false}={}){
  const target=$(id);if(!target)return;
  if(open&&target.tagName==='DETAILS')target.open=true;
  target.scrollIntoView({behavior:matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth',block:'start'});
  target.classList.remove('modern-target-flash');requestAnimationFrame(()=>target.classList.add('modern-target-flash'));setTimeout(()=>target.classList.remove('modern-target-flash'),1200);
}
function handleModernAdminAction(action){
  if(action==='overview'){window.scrollTo({top:0,behavior:matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth'});return}
  if(action==='appointments'){openTreatmentPlanCenter();operationsCenter.filter='appointments';renderOperationsCenter();return}
  if(action==='payments'){scrollAdminTarget('paymentPanel');return}
  if(action==='plans'){openTreatmentPlanCenter();operationsCenter.filter='plans';renderOperationsCenter();return}
  if(action==='labs'){openTreatmentPlanCenter();operationsCenter.filter='labs';renderOperationsCenter();return}
  if(action==='patient-record'){$('patientIdentitySearchBtn')?.click();return}
  if(action==='patients'){scrollAdminTarget('adminPatientHub',{open:true});return}
  if(action==='add-patient'){$('addBtn')?.click();return}
  if(action==='alert'){$('alertBtn')?.click();return}
  if(action==='statistics'){window.open('./statistics.html','bestcare-statistics','noopener');return}
  if(action==='clinics'){$('clinicsBtn')?.click();return}
  if(action==='catalog'){$('treatmentCatalogBtn')?.click();return}
  if(action==='import'){$('importBtn')?.click();return}
  if(action==='presence'){$('presenceBadge')?.click();return}
  if(action==='settings'){const menu=$('settingsMenu');if(menu){menu.classList.add('open');$('settingsBtn')?.focus()}return}
  if(action==='doctor'){location.href=viewUrl('clinic');return}
  if(action==='language'){$('langBtn')?.click();return}
  if(action==='theme'){$('themeToggleBtn')?.click();return}
  if(action==='notifications'){$('notificationsBtn')?.click();return}
  if(action==='sound'){$('soundAlertsBtn')?.click();return}
  if(action==='export'){$('exportBtn')?.click();return}
  if(action==='logout'){$('logoutBtn')?.click();return}
  if(action==='classic'){applyAdminLayout('classic',{save:true});toast(lang==='en'?'Classic interface':'الواجهة الكلاسيكية',lang==='en'?'The previous administration layout is active.':'تمت العودة إلى تصميم الإدارة المعتاد.')}
}
function renderPaymentPanel(){
  if(!$('paymentQueue'))return;
  const invoices=patients.filter(p=>p.paymentRequired).sort((a,b)=>Number(b.paymentRequestedAt||0)-Number(a.paymentRequestedAt||0));
  const pending=invoices.filter(p=>!p.paymentCompletedAt);
  $('paymentCount').textContent=String(pending.length);
  $('paymentQueue').innerHTML=invoices.length?invoices.map(p=>{
    const stage=paymentStage(p);
    const controls=stage==='completed'?`<span class="payment-done">✓ ${lang==='en'?'Payment completed':'تم تنفيذ الدفع'}</span>`:stage==='received'?`<div class="payment-actions-inline"><span class="payment-received">✓ ${lang==='en'?'Request received':'تم استلام الطلب'}</span><button type="button" data-payment-complete-id="${escapeHtml(p.id)}">${lang==='en'?'Confirm payment completion':'تأكيد تنفيذ الدفع'}</button></div>`:`<button type="button" data-payment-ack-id="${escapeHtml(p.id)}">${lang==='en'?'Acknowledge payment request':'تأكيد استلام طلب الدفع'}</button>`;
    const items=Array.isArray(p.paymentItems)?p.paymentItems:[];
    const details=items.length?`<div class="payment-items-summary">${items.map(item=>`<span class="payment-item-chip${item.free?' free':''}">${escapeHtml(item.name)} ×${Number(item.quantity||1)}${item.free?` · ${lang==='en'?'Free':'مجاني'}`:''}</span>`).join('')}</div>`:`<p>${escapeHtml(p.paymentAction||'إجراء دفع')}</p>`;
    const discount=p.paymentDiscount?`<p class="payment-discount-note">🏷 ${lang==='en'?'Discount':'الخصم'}: ${escapeHtml(p.paymentDiscount)}</p>`:'';
    return `<article class="payment-item ${stage}"><div><strong>💳 ${escapeHtml(firstName(p.name))} — ${escapeHtml(p.file||'بدون رقم ملف')}</strong>${details}${discount}<small>${p.paymentRequestedAt?new Date(Number(p.paymentRequestedAt)).toLocaleString(lang==='en'?'en-GB':'ar-SA'):''}</small></div>${controls}</article>`;
  }).join(''):`<div class="payment-empty">${lang==='en'?'No pending payment actions.':'لا توجد إجراءات دفع معلقة.'}</div>`;
}
function suggestedTimes(){
  const sorted=patients.filter(p=>p.end).slice().sort((a,b)=>a.end.localeCompare(b.end));
  if(sorted.length){
    const start=sorted[sorted.length-1].end;
    const total=Math.min(23*60+59,mins(start)+30);
    return {start,end:`${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`};
  }
  const now=new Date();
  const rounded=Math.ceil((now.getHours()*60+now.getMinutes())/15)*15;
  const safe=Math.min(23*60,rounded);
  const finish=Math.min(safe+30,23*60+59);
  return {
    start:`${String(Math.floor(safe/60)).padStart(2,'0')}:${String(safe%60).padStart(2,'0')}`,
    end:`${String(Math.floor(finish/60)).padStart(2,'0')}:${String(finish%60).padStart(2,'0')}`
  };
}
function resetPatientForm(focusName=false){
  editingId=null;
  const suggested=suggestedTimes();
  $('patientFormTitle').textContent=tr('addNewPatient');
  $('patientFormMode').textContent=tr('add');
  $('patientFormCard').classList.remove('editing');
  $('appointmentDateField').hidden=true;
  $('fDate').value=selectedDate||today();
  $('fName').value='';
  $('fFile').value='';
  $('fPhone').value='';
  $('fNationalId').value='';
  $('fStart').value=suggested.start;
  $('fEnd').value=suggested.end;
  $('fProcedure').value='';
  $('fStatus').value='waiting';
  $('savePatientBtn').textContent=tr('saveAdd');
  $('cancelEditBtn').hidden=true;
  $('patientFormCard').open=Boolean(focusName);
  if(focusName){
    $('patientFormCard').scrollIntoView({behavior:'smooth',block:'center'});
    setTimeout(()=>$('fName').focus(),250);
  }
}
function openPatient(id=null){
  const p=id?patients.find(x=>String(x.id)===String(id)):null;
  if(!p){resetPatientForm(true);return}
  editingId=String(p.id);
  $('patientFormTitle').textContent=tr('editPatient');
  $('patientFormMode').textContent=tr('editing');
  $('patientFormCard').classList.add('editing');
  $('patientFormCard').open=true;
  $('appointmentDateField').hidden=false;
  $('fDate').value=selectedDate||today();
  $('fName').value=p.name||'';
  $('fFile').value=p.file||'';
  $('fPhone').value=p.phone||'';
  $('fNationalId').value=p.nationalId||'';
  $('fStart').value=p.start||'08:00';
  $('fEnd').value=p.end||'08:30';
  $('fProcedure').value=p.procedure||'';
  $('fStatus').value=p.status||'waiting';
  $('savePatientBtn').textContent=tr('saveChanges');
  $('cancelEditBtn').hidden=false;
  $('patientFormCard').scrollIntoView({behavior:'smooth',block:'center'});
  setTimeout(()=>$('fName').focus(),250);
}
function applyAutomaticStatusAlert(p,status){
  const name=String(p.name||'').trim();
  p.adminUpdatedAt=Date.now();
  const fileReminder=isZeroFileNumber(p.file)?' — يلزم تحديث رقم ملفه الآن':'';
  const messages={
    arrived:`وصل المريض ${name} — بانتظار تأكيد بدء العلاج${fileReminder}`,
    early_arrival:`وصل المريض ${name} مبكرًا — بانتظار موعده${fileReminder}`,
    cancel:`تم إلغاء موعد المريض ${name} — يرجى مراجعة القائمة`,
    left:`المريض ${name} غادر العيادة — يرجى مراجعة القائمة`,
    asks_delay:`المريض ${name} يستفسر عن التأخير — يرجى المتابعة`
  };
  if(['arrived','early_arrival'].includes(status))p.arrivedAt=Date.now();
  if(messages[status])updateAlert={active:true,message:messages[status],updatedAt:Date.now(),kind:`status-${status}`};
}
function patientFormSavedFeedback(wasEditing,item,message=''){
  $('patientFormCard').classList.remove('saved-flash');
  void $('patientFormCard').offsetWidth;
  $('patientFormCard').classList.add('saved-flash');
  toast(wasEditing?tr('patientUpdated'):tr('patientAdded'),message||`${firstName(item.name)} — ${item.start}`);
}
async function movePatientToDate(item,targetDate){
  const sourceDate=selectedDate;
  const sourcePatients=patients.map(patient=>({...patient}));
  const sourceNotes=notes;
  const sourceAlert={...updateAlert};
  const saveButton=$('savePatientBtn');
  saveButton.disabled=true;
  saveButton.textContent=tr('movingPatient');
  clearTimeout(sync.autoTimer);
  clearTimeout(sync.pushTimer);

  try{
    if(sync.dirty&&!(await pushState()))throw new Error(tr('sourceSaveFailed'));

    const targetResponse=await request(stateUrl(targetDate,true));
    if(!targetResponse.ok)throw new Error(`${tr('targetLoadFailed')} (HTTP ${targetResponse.status})`);
    const targetData=await targetResponse.json();
    const targetPatients=(Array.isArray(targetData.patients)?targetData.patients:[])
      .filter(patient=>String(patient.id)!==String(item.id))
      .map(patient=>({...patient,name:String(patient.name||'').trim()}));
    targetPatients.push(item);
    targetPatients.sort((a,b)=>a.start.localeCompare(b.start));

    patients=patients.filter(patient=>String(patient.id)!==String(item.id));
    sync.dirty=true;
    sync.localVersion+=1;
    sync.localUpdatedAt=Date.now();
    persistLocal(true);
    render();
    if(!(await pushState())){
      patients=sourcePatients;
      notes=sourceNotes;
      updateAlert=sourceAlert;
      sync.dirty=true;
      sync.localVersion+=1;
      sync.localUpdatedAt=Date.now();
      persistLocal(true);
      render();
      throw new Error(tr('sourceSaveFailed'));
    }

    let targetAlert=targetData.updateAlert&&typeof targetData.updateAlert==='object'
      ?{...targetData.updateAlert}
      :{active:false,message:'',updatedAt:0,kind:''};
    const previousAlert=updateAlert;
    updateAlert=targetAlert;
    applyAutomaticStatusAlert(item,item.status);
    targetAlert={...updateAlert};
    updateAlert=previousAlert;
    const targetSnapshot={
      patients:targetPatients,
      notes:String(targetData.notes||''),
      updateAlert:targetAlert,
      clientId:CLIENT_ID,
      expectedRevision:Number(targetData.revision||0)
    };
    let savedTarget;
    try{
      const targetSave=await request(stateUrl(targetDate),{
        method:'PUT',
        headers:{'content-type':'application/json'},
        body:JSON.stringify(targetSnapshot)
      });
      if(!targetSave.ok)throw new Error(`${tr('targetSaveFailed')} (HTTP ${targetSave.status})`);
      savedTarget=await targetSave.json();
    }catch(saveError){
      try{
        const verification=await request(stateUrl(targetDate,true));
        if(!verification.ok)throw saveError;
        const verifiedData=await verification.json();
        const patientExists=Array.isArray(verifiedData.patients)&&verifiedData.patients.some(patient=>String(patient.id)===String(item.id));
        if(!patientExists)throw saveError;
        savedTarget={revision:verifiedData.revision,updatedAt:verifiedData.updatedAt};
      }catch{
        throw saveError;
      }
    }

    selectedDate=targetDate;
    els.datePicker.value=targetDate;
    patients=targetPatients;
    notes=targetSnapshot.notes;
    updateAlert=targetAlert;
    els.notes.value=notes;
    sync.revision=Number(savedTarget.revision||0);
    sync.updatedAt=Number(savedTarget.updatedAt||Date.now());
    sync.dirty=false;
    sync.pushing=false;
    sync.pulling=false;
    sync.ready=true;
    sync.error='';
    sync.localVersion=0;
    sync.localUpdatedAt=Date.now();
    persistLocal(false);
    render();
    setIdleSyncBadge(`revision ${sync.revision}`);
    patientFormSavedFeedback(true,item,`${firstName(item.name)} — ${sourceDate} ← ${targetDate}`);
    resetPatientForm(false);
    scheduleAutomaticSync(syncCadence().delay);
    return true;
  }catch(error){
    if(selectedDate===sourceDate&&!patients.some(patient=>String(patient.id)===String(item.id))){
      patients=sourcePatients;
      notes=sourceNotes;
      updateAlert=sourceAlert;
      els.notes.value=notes;
      sync.dirty=true;
      sync.localVersion+=1;
      sync.localUpdatedAt=Date.now();
      persistLocal(true);
      render();
      await pushState();
    }
    toast(tr('dateMoveFailed'),String(error.message||error));
    scheduleAutomaticSync(syncCadence().workHours?1200:syncCadence().delay);
    return false;
  }finally{
    saveButton.disabled=false;
    if(editingId)saveButton.textContent=tr('saveChanges');
  }
}
async function savePatient(){
  const rawName=$('fName').value.trim();
  const normalizedName=rawName.replace(/\s+/g,' ');
  const fileNumber=toLatinDigits($('fFile').value).replace(/\D/g,'').slice(0,40);
  const phoneDigits=normalizeSearchPhone($('fPhone').value);
  const requireComplete=VIEW_MODE==='admin'&&!editingId;
  const start=$('fStart').value,end=$('fEnd').value;
  if(!normalizedName||(requireComplete&&normalizedName.split(' ').filter(Boolean).length<2)){toast('الاسم الكامل مطلوب','اكتب اسم المريض كاملًا من كلمتين على الأقل.');$('fName').focus();return}
  if(requireComplete&&(!fileNumber||isZeroFileNumber(fileNumber))){toast('رقم الملف مطلوب','أدخل رقم ملف صحيحًا وغير صفري قبل الحفظ.');$('fFile').focus();return}
  if(requireComplete&&!/^05\d{8}$/.test(phoneDigits)){toast('رقم الجوال غير صحيح','استخدم رقم جوال سعودي صحيحًا مثل 05xxxxxxxx.');$('fPhone').focus();return}
  if(!start||!end||mins(end)<=mins(start)){toast('وقت غير صحيح','يجب أن يكون وقت النهاية بعد وقت البداية');$('fStart').focus();return}
  const existing=editingId?patientById(editingId):null;
  const item={
    ...(existing||{}),
    id:editingId||(crypto.randomUUID?.()||`patient-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    name:normalizedName.slice(0,120),
    file:fileNumber,
    phone:phoneDigits,
    nationalId:$('fNationalId').value.replace(/\D/g,'').slice(0,10),
    start,
    end,
    procedure:$('fProcedure').value.trim(),
    status:$('fStatus').value,
    adminUpdatedAt:Date.now()
  };
  const wasEditing=Boolean(editingId);
  const targetDate=wasEditing?($('fDate').value||selectedDate):selectedDate;
  if(wasEditing&&targetDate!==selectedDate){
    await movePatientToDate(item,targetDate);
    return;
  }
  mutate(()=>{
    const i=patients.findIndex(p=>String(p.id)===String(item.id));
    if(i>=0)patients[i]=item;else patients.push(item);
    patients.sort((a,b)=>a.start.localeCompare(b.start));
    applyAutomaticStatusAlert(item,item.status);
  });
  void refreshTreatmentPlanRegistry(true);
  patientFormSavedFeedback(wasEditing,item);
  resetPatientForm(false);
}
function exportCsv(){const rows=[['الاسم','رقم الملف','رقم الجوال','رقم الهوية','البداية','النهاية','الإجراء','الحالة'],...patients.map(p=>[p.name,p.file,p.phone||'',p.nationalId||'',p.start,p.end,p.procedure,STATUS[p.status]])];const csv='﻿'+rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`bestcare_${selectedDate}.csv`;a.click();URL.revokeObjectURL(a.href)}
function detectCsvDelimiter(text){
  const firstLine=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).find(line=>line.trim())||'';
  const counts={',':0,';':0,'\t':0};
  let quoted=false;
  for(let i=0;i<firstLine.length;i++){
    const char=firstLine[i];
    if(char==='"'){
      if(quoted&&firstLine[i+1]==='"'){i+=1;continue}
      quoted=!quoted;continue;
    }
    if(!quoted&&Object.prototype.hasOwnProperty.call(counts,char))counts[char]+=1;
  }
  return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
}
function parseCsvRecords(text){
  const source=String(text||'').replace(/^\uFEFF/,'');
  const delimiter=detectCsvDelimiter(source);
  const records=[];
  let row=[],field='',quoted=false;
  for(let i=0;i<source.length;i++){
    const char=source[i];
    if(quoted){
      if(char==='"'&&source[i+1]==='"'){field+='"';i+=1}
      else if(char==='"')quoted=false;
      else field+=char;
      continue;
    }
    if(char==='"'){quoted=true;continue}
    if(char===delimiter){row.push(field.trim());field='';continue}
    if(char==='\r')continue;
    if(char==='\n'){
      row.push(field.trim());field='';
      if(row.some(value=>value!==''))records.push(row);
      row=[];continue;
    }
    field+=char;
  }
  row.push(field.trim());
  if(row.some(value=>value!==''))records.push(row);
  return records;
}
function normalizeCsvHeader(value){return String(value||'').replace(/^\uFEFF/,'').trim().toLowerCase().replace(/[ـًٌٍَُِّْ]/g,'').replace(/[\s._()\[\]{}\-\/\\:]+/g,'')}
function findCsvColumn(headers,aliases){
  const normalizedAliases=aliases.map(normalizeCsvHeader);
  let index=headers.findIndex(header=>normalizedAliases.includes(header));
  if(index>=0)return index;
  index=headers.findIndex(header=>normalizedAliases.some(alias=>alias.length>=4&&(header.includes(alias)||alias.includes(header))));
  return index;
}
function cleanDirectoryName(value){return String(value||'').replace(/[\u200e\u200f\u202a-\u202e]/g,'').replace(/\s+/g,' ').trim().slice(0,120)}
function normalizeDirectoryFile(value){const raw=toLatinDigits(value).trim().toUpperCase().replace(/[\s-]+/g,'').slice(0,40);return raw&&!/^0+$/.test(raw)?raw:''}
function normalizeDirectoryPhone(value){
  const digits=toLatinDigits(value).replace(/\D/g,'').slice(0,20);
  if(/^009665\d{8}$/.test(digits))return`0${digits.slice(5)}`;
  if(/^9665\d{8}$/.test(digits))return`0${digits.slice(3)}`;
  if(/^5\d{8}$/.test(digits))return`0${digits}`;
  return digits;
}
function normalizeDirectoryNationalId(value){const digits=toLatinDigits(value).replace(/\D/g,'').slice(0,10);return digits.length===10?digits:''}
function patientDirectoryAliases(row){return[fileAlias(row.fileNo),row.mobile?`phone:${row.mobile}`:'',row.nationalId?`national:${row.nationalId}`:''].filter(Boolean)}
function fileAlias(value){const file=normalizeDirectoryFile(value);return file?`file:${file}`:''}
function patientDirectoryIssue(row){
  if(cleanDirectoryName(row.fullName).split(/\s+/).filter(Boolean).length<2)return'full_name_required';
  if(row.rawPhone&&!/^05\d{8}$/.test(row.mobile))return'invalid_phone';
  if(row.rawNationalId&&!row.nationalId)return'invalid_national_id';
  if(!patientDirectoryAliases(row).length)return'identity_required';
  return'';
}
function directoryNameScore(value){const name=cleanDirectoryName(value),parts=name.split(/\s+/).filter(Boolean);return parts.length*1000+name.length}
function mergePatientDirectoryImportRows(rows){
  const merged=[],aliasIndex=new Map(),invalid=[];
  rows.forEach(row=>{
    if(row.issue){invalid.push(row);return}
    const aliases=patientDirectoryAliases(row),linked=[...new Set(aliases.map(alias=>aliasIndex.get(alias)).filter(index=>index!==undefined))];
    if(linked.length>1){invalid.push({...row,issue:'identity_conflict'});return}
    if(linked.length===1){
      const target=merged[linked[0]];
      if(directoryNameScore(row.fullName)>directoryNameScore(target.fullName))target.fullName=row.fullName;
      target.fileNo=target.fileNo||row.fileNo;target.mobile=target.mobile||row.mobile;target.nationalId=target.nationalId||row.nationalId;
      target.sourceRows=[...(target.sourceRows||[target.sourceRow]),row.sourceRow];
      patientDirectoryAliases(target).forEach(alias=>aliasIndex.set(alias,linked[0]));
      return;
    }
    const index=merged.length;merged.push({...row,sourceRows:[row.sourceRow]});aliases.forEach(alias=>aliasIndex.set(alias,index));
  });
  return{validRows:merged,invalidRows:invalid};
}
function parsePatientDirectoryCsv(text){
  const records=parseCsvRecords(text);
  if(records.length<2)return{rows:[],validRows:[],invalidRows:[],reason:'empty'};
  const headers=records[0].map(normalizeCsvHeader),columns={
    name:findCsvColumn(headers,['الاسم الكامل','اسم المريض','الاسم','المريض','full name','fullname','patient name','patientname','patient']),
    file:findCsvColumn(headers,['رقم الملف','رقم ملف','الملف','file number','filenumber','file no','fileno','file.n','filen','file']),
    phone:findCsvColumn(headers,['رقم الجوال','الجوال','رقم الهاتف','الهاتف','mobile number','mobilenumber','phone number','phonenumber','mobile','phone']),
    nationalId:findCsvColumn(headers,['رقم الهوية','الهوية الوطنية','الهوية','national id','nationalid','identity number','identitynumber','identity'])
  };
  if(columns.name<0||[columns.file,columns.phone,columns.nationalId].every(index=>index<0))return{rows:[],validRows:[],invalidRows:[],reason:'headers'};
  const rows=records.slice(1).map((cells,index)=>{
    const rawPhone=columns.phone>=0?String(cells[columns.phone]||'').trim():'',rawNationalId=columns.nationalId>=0?String(cells[columns.nationalId]||'').trim():'';
    const row={sourceRow:index+2,fullName:cleanDirectoryName(cells[columns.name]),fileNo:columns.file>=0?normalizeDirectoryFile(cells[columns.file]):'',mobile:normalizeDirectoryPhone(rawPhone),nationalId:normalizeDirectoryNationalId(rawNationalId),rawPhone,rawNationalId};
    return{...row,issue:patientDirectoryIssue(row)};
  }).filter(row=>row.fullName||row.fileNo||row.mobile||row.nationalId||row.rawPhone||row.rawNationalId);
  const merged=mergePatientDirectoryImportRows(rows);
  return{rows,validRows:merged.validRows,invalidRows:merged.invalidRows,reason:rows.length?'':'empty'};
}
function patientDirectoryIssueLabel(issue){return({full_name_required:'الاسم غير مكتمل',identity_required:'لا يوجد ملف أو جوال أو هوية',invalid_phone:'رقم الجوال غير صحيح',invalid_national_id:'رقم الهوية غير صحيح',identity_conflict:'تعارض بين هويتين'})[issue]||'يحتاج مراجعة'}
function renderPatientDirectoryImportPreview(){
  const draft=patientDirectoryImportDraft,summary=$('patientDirectoryImportSummary'),preview=$('patientDirectoryImportPreview'),save=$('patientDirectoryImportSave');
  $('patientDirectoryImportFileName').textContent=draft.fileName||'—';
  summary.innerHTML=`<span>إجمالي الصفوف <b>${draft.rows.length}</b></span><span class="valid">جاهز للاستيراد <b>${draft.validRows.length}</b></span><span class="invalid">يحتاج مراجعة <b>${draft.invalidRows.length}</b></span>`;
  const rows=[...draft.validRows.map(row=>({...row,valid:true})),...draft.invalidRows.map(row=>({...row,valid:false}))].slice(0,160);
  preview.innerHTML=rows.length?`<table class="patient-directory-import-table"><thead><tr><th>الصف</th><th>الاسم الكامل</th><th>رقم الملف</th><th>الجوال</th><th>الهوية</th><th>النتيجة</th></tr></thead><tbody>${rows.map(row=>`<tr class="${row.valid?'valid':'invalid'}"><td>${escapeHtml((row.sourceRows||[row.sourceRow]).join('، '))}</td><td>${escapeHtml(row.fullName||'—')}</td><td>${escapeHtml(row.fileNo||'—')}</td><td>${escapeHtml(row.mobile||'—')}</td><td>${escapeHtml(row.nationalId||'—')}</td><td><span class="patient-directory-import-state ${row.valid?'valid':'invalid'}">${row.valid?'جاهز':escapeHtml(patientDirectoryIssueLabel(row.issue))}</span></td></tr>`).join('')}</tbody></table>${draft.rows.length>160?`<div class="patient-identity-empty">تم عرض أول 160 صفًا فقط؛ سيتم استيراد جميع الصفوف الصحيحة.</div>`:''}`:'<div class="patient-identity-empty">لم يتم العثور على صفوف قابلة للقراءة.</div>';
  save.disabled=!draft.validRows.length;
  save.textContent=`اعتماد واستيراد ${draft.validRows.length} مريض`;
}
function readLocalFile(file,mode='text'){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('تعذرت قراءة الملف'));reader.onload=()=>resolve(reader.result);mode==='array'?reader.readAsArrayBuffer(file):reader.readAsText(file,'utf-8')})}
async function preparePatientDirectoryImport(file){
  if(!file)return;
  openModal('patientIdentitySearchModal');showPatientIdentitySearchView();closePatientDirectoryPanels();
  patientIdentityDisplayLimit=120;refreshPatientIdentityDirectory();
  const error=$('patientDirectoryImportError');error.hidden=true;
  try{
    const extension=String(file.name||'').split('.').pop().toLowerCase();let csv='';
    if(['xlsx','xls'].includes(extension)){
      await ensureExcelReader();const buffer=await readLocalFile(file,'array'),workbook=window.XLSX.read(buffer,{type:'array'}),worksheet=workbook.Sheets[workbook.SheetNames[0]];csv=window.XLSX.utils.sheet_to_csv(worksheet,{FS:',',RS:'\n'});
    }else csv=String(await readLocalFile(file));
    const parsed=parsePatientDirectoryCsv(csv);
    if(parsed.reason==='headers')throw new Error('يلزم وجود عمود للاسم الكامل، وعمود واحد على الأقل لرقم الملف أو الجوال أو الهوية.');
    if(parsed.reason==='empty')throw new Error('الملف فارغ أو لا يحتوي على بيانات مرضى.');
    patientDirectoryImportDraft={fileName:file.name,rows:parsed.rows,validRows:parsed.validRows,invalidRows:parsed.invalidRows};
    $('patientDirectoryAddPanel').hidden=true;$('patientDirectoryImportPanel').hidden=false;renderPatientDirectoryImportPreview();
  }catch(importError){patientDirectoryImportDraft={fileName:'',rows:[],validRows:[],invalidRows:[]};error.textContent=String(importError.message||importError);error.hidden=false;$('patientDirectoryImportPanel').hidden=false;renderPatientDirectoryImportPreview()}
  finally{$('patientDirectoryFileInput').value=''}
}
async function submitPatientDirectoryRows(rows,button){
  button.disabled=true;const original=button.textContent;button.textContent='جارٍ المطابقة والتحديث…';
  try{
    const response=await request(PATIENTS_API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({clinicId:ACTIVE_CLINIC_ID,patients:rows})},60000),data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'تعذر تحديث قاعدة المرضى');
    await refreshPatientIdentityDirectory();
    toast('تم تحديث قاعدة المرضى',`جديد ${Number(data.created||0)} · تم تصحيحه ${Number(data.updated||0)} · متعارض ${Number(data.conflicts||0)} · متجاوز ${Number(data.skipped||0)}`);
    return data;
  }finally{button.disabled=false;button.textContent=original}
}
async function savePatientDirectoryImport(){
  const error=$('patientDirectoryImportError'),button=$('patientDirectoryImportSave');error.hidden=true;
  try{await submitPatientDirectoryRows(patientDirectoryImportDraft.validRows,button);patientDirectoryImportDraft={fileName:'',rows:[],validRows:[],invalidRows:[]};$('patientDirectoryImportPanel').hidden=true}
  catch(saveError){error.textContent=String(saveError.message||saveError);error.hidden=false}
}
async function savePatientDirectorySingle(event){
  event.preventDefault();const error=$('patientDirectoryAddError'),button=$('patientDirectoryAddSubmit'),row={fullName:cleanDirectoryName($('patientDirectoryName').value),fileNo:normalizeDirectoryFile($('patientDirectoryFile').value),mobile:normalizeDirectoryPhone($('patientDirectoryPhone').value),nationalId:normalizeDirectoryNationalId($('patientDirectoryNationalId').value),rawPhone:$('patientDirectoryPhone').value.trim(),rawNationalId:$('patientDirectoryNationalId').value.trim()};
  const issue=patientDirectoryIssue(row);if(issue){error.textContent=patientDirectoryIssueLabel(issue);error.hidden=false;return}
  error.hidden=true;try{await submitPatientDirectoryRows([row],button);$('patientDirectoryAddForm').reset();$('patientDirectoryAddPanel').hidden=true}catch(saveError){error.textContent=String(saveError.message||saveError);error.hidden=false}
}
function normalizeCsvTime(value){
  let raw=String(value||'').trim().replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  const suffix=(raw.match(/\b(am|pm)\b/i)||[])[1]?.toLowerCase()||(raw.match(/(ص|م)\s*$/)||[])[1]||'';
  raw=raw.replace(/\b(am|pm)\b/ig,'').replace(/(ص|م)\s*$/g,'').trim();
  const match=raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if(!match)return'';
  let hour=Number(match[1]);const minute=Number(match[2]);
  if(minute>59||hour>23)return'';
  if(suffix){
    if(hour<1||hour>12)return'';
    if((suffix==='pm'||suffix==='م')&&hour<12)hour+=12;
    if((suffix==='am'||suffix==='ص')&&hour===12)hour=0;
  }
  return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
}
function normalizeCsvDate(value){
  const raw=String(value||'').trim().replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  let match=raw.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
  if(match)return`${match[1]}-${String(match[2]).padStart(2,'0')}-${String(match[3]).padStart(2,'0')}`;
  match=raw.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
  if(match)return`${match[3]}-${String(match[2]).padStart(2,'0')}-${String(match[1]).padStart(2,'0')}`;
  return'';
}
function parsePatientCsv(text){
  const records=parseCsvRecords(text);
  if(records.length<2)return{rows:[],date:'',reason:'empty'};
  const headers=records[0].map(normalizeCsvHeader);
  const columns={
    name:findCsvColumn(headers,['الاسم','اسم المريض','المريض','patient','patient name','patientname']),
    file:findCsvColumn(headers,['رقم الملف','رقم ملف','الملف','file','file number','filenumber','file.n','filen','م.أساسي (File.N)']),
    phone:findCsvColumn(headers,['رقم الجوال','الجوال','رقم الهاتف','الهاتف','mobile','phone','mobile number','phone number']),
    start:findCsvColumn(headers,['البداية','وقت البداية','وقت البدء','وقت الموعد','time','start','start time','appointment time']),
    end:findCsvColumn(headers,['النهاية','وقت النهاية','وقت الانتهاء','end','end time']),
    procedure:findCsvColumn(headers,['الإجراء','الإجراء العلاجي','نوع الزيارة','نوع الموعد','procedure','visit type','appointment type']),
    date:findCsvColumn(headers,['التاريخ','تاريخ البدء','تاريخ الموعد','date','start date','appointment date'])
  };
  if(columns.name<0||columns.start<0||columns.end<0)return{rows:[],date:'',reason:'headers'};
  const dates=new Set();
  const rows=records.slice(1).map((cells,index)=>{
    const start=normalizeCsvTime(cells[columns.start]);
    const end=normalizeCsvTime(cells[columns.end]);
    const appointmentDate=columns.date>=0?normalizeCsvDate(cells[columns.date]):'';
    if(appointmentDate)dates.add(appointmentDate);
    const rawName=String(cells[columns.name]||'').trim();
    return{id:Date.now()+index,name:rawName?rawName.replace(/\s+/g,' ').trim().slice(0,120):'',file:columns.file>=0?String(cells[columns.file]||'').trim():'',phone:columns.phone>=0?String(cells[columns.phone]||'').replace(/[^\d+]/g,'').slice(0,20):'',start,end,procedure:columns.procedure>=0?String(cells[columns.procedure]||'').trim():'',status:'waiting',adminUpdatedAt:Date.now()};
  }).filter(patient=>patient.name&&patient.start&&patient.end&&mins(patient.end)>mins(patient.start));
  return{rows,date:dates.size===1?[...dates][0]:'',reason:rows.length?'':'rows'};
}
async function acceptPatientImport(parsed){
  if(!parsed.rows.length){
    const detail=lang==='en'?'Required columns: patient name, start time, and end time.':'الأعمدة المطلوبة: اسم المريض، وقت البدء، ووقت الانتهاء.';
    toast(lang==='en'?'Import failed':'تعذر الاستيراد',detail);els.csvInput.value='';return;
  }
  if(parsed.date&&parsed.date!==selectedDate){await setDate(parsed.date);els.datePicker.value=parsed.date;}
  mutate(()=>patients=parsed.rows);
  const dateMessage=parsed.date?(lang==='en'?` for ${parsed.date}`:` لتاريخ ${parsed.date}`):'';
  toast(lang==='en'?'Import complete':'تم الاستيراد',lang==='en'?`${parsed.rows.length} patients imported${dateMessage}`:`تم استيراد ${parsed.rows.length} مريض${dateMessage}`);
  els.csvInput.value='';
}
const optionalScriptLoads=new Map();
function loadOptionalScript(src,ready){
  if(ready())return Promise.resolve();
  if(optionalScriptLoads.has(src))return optionalScriptLoads.get(src);
  const pending=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=src;script.async=true;
    script.onload=()=>ready()?resolve():reject(new Error(`تعذر تشغيل ${src}`));
    script.onerror=()=>reject(new Error(`تعذر تحميل ${src}`));
    document.head.appendChild(script);
  }).catch(error=>{optionalScriptLoads.delete(src);throw error});
  optionalScriptLoads.set(src,pending);
  return pending;
}
const ensureExcelReader=()=>loadOptionalScript('./assets/vendor/xlsx.full.min.js?v=7.9',()=>Boolean(window.XLSX));
async function importPatientFile(file){
  const extension=String(file.name||'').split('.').pop().toLowerCase();
  const reader=new FileReader();
  reader.onerror=()=>toast(lang==='en'?'Import failed':'تعذر الاستيراد',lang==='en'?'The file could not be read.':'تعذرت قراءة الملف.');
  if(['xlsx','xls'].includes(extension)){
    try{await ensureExcelReader()}catch(error){toast(lang==='en'?'Excel reader unavailable':'قارئ Excel غير متاح',lang==='en'?'Check the connection and try again.':String(error.message||error));els.csvInput.value='';return}
    reader.onload=()=>{
      try{
        const workbook=window.XLSX.read(reader.result,{type:'array'});
        const worksheet=workbook.Sheets[workbook.SheetNames[0]];
        const csv=window.XLSX.utils.sheet_to_csv(worksheet,{FS:',',RS:'\n'});
        acceptPatientImport(parsePatientCsv(csv));
      }catch(error){toast(lang==='en'?'Excel import failed':'تعذر استيراد Excel',String(error.message||error));els.csvInput.value=''}
    };
    reader.readAsArrayBuffer(file);
    return;
  }
  reader.onload=()=>acceptPatientImport(parsePatientCsv(String(reader.result||'')));
  reader.readAsText(file,'utf-8');
}
async function syncTest(){
  setBadge('connecting',lang==='en'?'Testing sync…':'اختبار المزامنة…');
  clearTimeout(sync.autoTimer);

  try{
    if(sync.dirty)await pushState();
    await pullState(true);

    if(sync.ready&&!sync.error){
      toast('نجح الاختبار',`المزامنة التلقائية فعالة — revision ${sync.revision}`);
    }else{
      toast('فشل الاختبار',sync.error||'خطأ غير معروف');
    }
  }finally{
    scheduleAutomaticSync(syncCadence().delay);
  }
}
async function openAlertComposer(){
  if(authUser?.role!=='admin'){toast('خاص بالإدارة','إرسال التنبيهات الموجهة متاح من صفحة الإدارة فقط.');return}
  await refreshManualAlert(true);
  populateAlertClinicOptions();
  $('alertScopeAll').checked=true;
  $('alertScopeClinic').checked=false;
  els.alertMessageInput.value=manualAlert.active?String(manualAlert.message||''):tr('defaultAlert');
  updateAlertTargetUI();
  renderAlertUI();
  openModal('alertModal');
}
async function publishAlert(){
  const message=els.alertMessageInput.value.trim();
  if(!message){toast('رسالة التنبيه مطلوبة','اكتب ملاحظة مختصرة قبل النشر');return;}
  const scope=$('alertScopeClinic').checked?'clinic':'all';
  const clinic=scope==='clinic'?clinicDirectory.find(item=>item.active&&item.id===els.alertTargetClinic.value):null;
  if(scope==='clinic'&&!clinic){toast('اختر العيادة','حدد العيادة التي سيصل إليها التنبيه.');return}
  const button=$('sendAlertBtn');button.disabled=true;
  try{
    const response=await request(ALERTS_API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      message,
      scope,
      targetClinicId:clinic?.id||'',
      targetClinicLabel:clinic?clinicDisplayName(clinic):''
    })});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'تعذر نشر التنبيه');
    manualAlert=normalizeManualAlert(data.alert);
    manualAlertFetchedAt=Date.now();
    render();
    closeModal('alertModal');
    const target=scope==='all'?'جميع العيادات':clinicDisplayName(clinic);
    toast('تم نشر التنبيه',`سيظهر تلقائيًا لدى ${target}.`);
  }catch(error){toast('تعذر نشر التنبيه',String(error.message||error))}
  finally{button.disabled=false}
}
async function clearAlert(){
  if(!manualAlert.active){
    toast(lang==='en'?'No active alert':'لا يوجد تنبيه فعال',lang==='en'?'There is no published administration alert to cancel.':'لا يوجد تنبيه منشور من الإدارة لإلغائه.');
    return;
  }
  if(!confirm(lang==='en'?'Cancel the current alert on all connected screens?':'إلغاء التنبيه الحالي من جميع الشاشات المتصلة؟'))return;
  const button=els.clearAlertBtn;button.disabled=true;
  try{
    const response=await request(ALERTS_API,{method:'DELETE'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'تعذر إلغاء التنبيه');
    manualAlert=normalizeManualAlert(data.alert);
    manualAlertFetchedAt=Date.now();
    render();
    closeModal('alertModal');
    toast('تم إلغاء التنبيه','أزيل التنبيه الموجّه من الشاشات المتصلة.');
  }catch(error){toast('تعذر إلغاء التنبيه',String(error.message||error))}
  finally{button.disabled=false}
}
async function setDate(date){
  if(sync.dirty)await pushState();
  selectedDate=date||today();
  sync.revision=0;sync.updatedAt=0;sync.ready=false;sync.dirty=false;sync.localVersion=0;
  adminPatientHub.date='';
  applyViewMode();
  loadLocal(selectedDate);
  await pullState(true);
  await refreshTreatmentPlanRegistry(true);
  if(VIEW_MODE==='admin')await refreshAdminPatientHub({force:true});
}
function enterScreen(){
  document.body.classList.add('screen-mode');
  renderDoctorWorkspace();
  document.documentElement.requestFullscreen?.().catch(()=>{});
}
function exitScreen(){
  document.body.classList.remove('screen-mode');
  $('doctorFloatingAlertPeek').hidden=true;
  renderDoctorWorkspace();
  if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});
}
let deferredInstallPrompt=null;
let waitingServiceWorker=null,pwaReloadRequested=false;
function isStandalone(){return matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true}
function isIosDevice(){return /iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)}
function openIosInstallGuide(){openModal('iosInstallModal');$('iosInstallModal').setAttribute('aria-hidden','false')}
function applyIosInstallLanguage(){
  const copy=IOS_INSTALL_COPY[lang]||IOS_INSTALL_COPY.ar;
  setText('#iosInstallGuideBtn',copy.menu);setText('#iosInstallTitle',copy.title);setText('#iosInstallHelp',copy.help);
  copy.steps.forEach((step,index)=>{setText(`#iosStep${index+1}Title`,step[0]);setText(`#iosStep${index+1}Text`,step[1])});
  setText('#iosInstallNote',copy.note);setText('#iosShareTitle',copy.shareTitle);setText('#iosShareText',copy.shareText);setText('#copyAppLinkBtn',copy.copy);setText('#iosInstallCloseBtn',copy.close);
}
async function copyAppLink(){
  const appUrl=`${location.origin}${location.pathname}`;
  try{await navigator.clipboard.writeText(appUrl)}catch(_error){const input=document.createElement('input');input.value=appUrl;document.body.appendChild(input);input.select();document.execCommand('copy');input.remove()}
  const copy=IOS_INSTALL_COPY[lang]||IOS_INSTALL_COPY.ar;toast(copy.copiedTitle,copy.copiedText);
}
async function installApp(){
  const copy=IOS_INSTALL_COPY[lang]||IOS_INSTALL_COPY.ar;
  if(isStandalone()){toast(copy.alreadyTitle,copy.alreadyText);return}
  if(isIosDevice()){openIosInstallGuide();return}
  if(deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(()=>null);
    deferredInstallPrompt=null;
    $('installBtn').hidden=true;
    return;
  }
  toast('تثبيت التطبيق',/iPhone|iPad|iPod/i.test(navigator.userAgent)?'من زر المشاركة اختر «إضافة إلى الشاشة الرئيسية»':'من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»');
}
async function registerPwa(){
  if(!('serviceWorker' in navigator)||!/^https?:$/.test(location.protocol))return;
  try{
    const registration=await navigator.serviceWorker.register('./service-worker.js',{scope:'./'});
    if(systemNotificationsEnabled())ensurePushSubscription().catch(error=>console.warn('Push subscription refresh failed',error));
    const showUpdate=worker=>{waitingServiceWorker=worker;$('pwaUpdateBar').classList.add('show')};
    if(registration.waiting)showUpdate(registration.waiting);
    registration.addEventListener('updatefound',()=>{
      const worker=registration.installing;if(!worker)return;
      worker.addEventListener('statechange',()=>{
        if(worker.state==='installed'&&navigator.serviceWorker.controller)showUpdate(worker);
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(!pwaReloadRequested)return;
      pwaReloadRequested=false;
      location.reload();
    });
  }catch(error){console.warn('PWA registration failed',error)}
}
function setText(selector,value){const el=document.querySelector(selector);if(el)el.textContent=value}
function setTexts(selector,values){document.querySelectorAll(selector).forEach((el,index)=>{if(values[index]!==undefined)el.textContent=values[index]})}
function rebuildStatusSelect(select,includeAll=false){
  if(!select)return;
  const value=select.value;
  select.innerHTML=(includeAll?`<option value="">${escapeHtml(tr('allStatuses'))}</option>`:'')+Object.keys(STATUS).map(key=>`<option value="${key}">${escapeHtml(statusText(key))}</option>`).join('');
  if([...select.options].some(option=>option.value===value))select.value=value;
}
function applyLang(){
  document.documentElement.lang=lang;
  document.documentElement.dir=lang==='en'?'ltr':'rtl';
  document.body.classList.toggle('lang-en',lang==='en');
  document.title=VIEW_MODE==='admin'
    ?(lang==='en'?'Best Care Administration & Scheduling':'إدارة وتنسيق مواعيد عيادات أفضل عناية الاستشارية للأسنان')
    :(lang==='en'?'Best Care Doctor Workspace':'صفحة الطبيب — عيادات أفضل عناية الاستشارية للأسنان');
  applyViewMode();
  setText('#clinicViewLink',lang==='en'?'🩺 Doctor page':'🩺 صفحة الطبيب');
  setText('#adminViewLink',lang==='en'?'🗓️ Administration page':'🗓️ صفحة الإدارة');
  setText('#statisticsTopLink strong',lang==='en'?'Statistics':'الإحصائيات');
  setText('#appointmentRequestsPageBtn',lang==='en'?'📅 Appointment request tracking':'📅 متابعة طلبات المواعيد');
  setText('#appointmentRequestLabel',lang==='en'?'Appointment requests':'طلبات المواعيد');
  setText('#roleBtn',lang==='en'?'↔ Change task':'↔ تغيير المهمة');
  setText('#roleModalTitle',lang==='en'?'Choose your task':'اختر مهمتك');
  setText('#roleModalHelp',lang==='en'?'A focused workspace will open for your role.':'ستفتح لك واجهة مستقلة بالأدوات المرتبطة بعملك.');
  setText('#adminRoleTitle',lang==='en'?'Administration and scheduling':'صفحة الإدارة وتنسيق المواعيد');
  setText('#adminRoleHelp',lang==='en'?'Add and edit patients, manage lists and alerts, and approve payments and plans.':'إضافة وتعديل المرضى، إدارة القوائم والتنبيهات، واعتماد الدفع والخطط.');
  setText('#clinicRoleTitle',lang==='en'?'Doctor and clinic page':'صفحة الطبيب والعيادة');
  setText('#clinicRoleHelp',lang==='en'?'Approve plans, submit payment requests, call patients, and track treatment.':'اعتماد الخطط، رفع طلبات الدفع، واستدعاء المرضى ومتابعة العلاج.');
  setText('#clinicPickerTitle',lang==='en'?'Choose the clinic and doctor':'اختر العيادة والطبيب');
  setText('#clinicPickerHelp',lang==='en'?'Each option combines the clinic with its assigned doctor.':'كل خيار يجمع العيادة بالطبيب المسجل لها.');
  setText('#clinicPickerClinicLabel',lang==='en'?'Clinic and doctor':'العيادة والطبيب');
  setText('#roleClinicBackBtn',lang==='en'?'Back':'رجوع');
  setText('#roleClinicContinueBtn',lang==='en'?'Open doctor page':'دخول صفحة الطبيب');
  setText('#rolePrivacyNote',lang==='en'?'The pages are visually separate and share the same live synchronized list.':'الصفحتان منفصلتان بصريًا وتستخدمان القائمة نفسها والمزامنة المباشرة.');
  if(!$('clinicRolePicker').hidden)renderClinicRolePicker();
  setText('#viewIdentityKicker',lang==='en'?'You are now in':'أنت الآن في');
  setText('#viewIdentityIcon',VIEW_MODE==='admin'?'🗂️':'🩺');
  setText('#viewIdentityTitle',VIEW_MODE==='admin'?(lang==='en'?'Administration page':'صفحة الإدارة'):(lang==='en'?'Doctor page':'صفحة الطبيب'));
  setText('#viewIdentityHelp',VIEW_MODE==='admin'?(lang==='en'?'Appointments, patient lists, payments, and final plan approvals.':'المواعيد وقوائم المرضى والفواتير والاعتماد النهائي للخطط.'):(lang==='en'?'Plan approvals, payment requests, patient calls, and treatment flow.':'اعتمادات الخطط وطلبات الدفع واستدعاء المرضى ومتابعة العلاج.'));
  setText('#viewIdentityChange',lang==='en'?'Change task':'تغيير المهمة');
  setText('#pageTitle',VIEW_MODE==='admin'?(lang==='en'?'Best Care Administration & Scheduling':'إدارة وتنسيق مواعيد عيادات أفضل عناية الاستشارية للأسنان'):(lang==='en'?'Best Care Doctor Workspace':'صفحة الطبيب — عيادات أفضل عناية الاستشارية للأسنان'));
  setText('#pageSubtitle',VIEW_MODE==='admin'?(lang==='en'?'Patient lists, scheduling, alerts, payments, and final plan approvals':'قوائم المرضى والمواعيد والتنبيهات وإجراءات الدفع واعتماد الخطط'):(lang==='en'?'Plan approvals, payment requests, and today’s clinical flow':'اعتمادات الخطط وطلبات الدفع ومتابعة مرضى اليوم'));
  setText('#doctorWorkspaceTitle',lang==='en'?'Doctor alerts':'تنبيهات الطبيب');
  setText('#doctorWorkspaceHelp',lang==='en'?'Alerts and pending approvals in one compact place.':'التنبيهات والاعتمادات المطلوبة في مكان واحد.');
  setText('#doctorFloatingPeekLabel',lang==='en'?'New alert':'تنبيه جديد');
  $('doctorFloatingAlertBtn').title=lang==='en'?'Doctor alerts and approvals':'تنبيهات واعتمادات الطبيب';
  $('doctorFloatingAlertClose').setAttribute('aria-label',lang==='en'?'Close':'إغلاق');
  $('doctorFloatingPeekClose').setAttribute('aria-label',lang==='en'?'Hide alert':'إخفاء التنبيه');
  setText('#presenceModalTitle',lang==='en'?'Devices online now':'الأجهزة المتصلة الآن');
  setText('#presenceModalHelp',lang==='en'?'The count updates automatically without affecting patient synchronization.':'يُحدّث العدد تلقائيًا دون التأثير على مزامنة المرضى.');
  setText('#presenceRefreshBtn',lang==='en'?'Refresh now':'تحديث الآن');
  setText('#presenceCloseBtn',lang==='en'?'Close':'إغلاق');
  renderPresence();
  setText('#doctorApprovalLabel',lang==='en'?'Need your approval':'تحتاج اعتمادك');
  setText('#doctorPaymentLabel',lang==='en'?'Payment requests sent':'طلبات دفع مرسلة');
  setText('#doctorSubmittedLabel',lang==='en'?'Plans with admin':'خطط لدى الإدارة');
  setText('#patientListTitle',VIEW_MODE==='clinic'?(lang==='en'?'Clinic patients and actions':'مرضى العيادة والإجراءات'):(lang==='en'?'Selected clinic patient list':'قائمة مرضى العيادة المحددة'));
  setText('#doctorListNote',lang==='en'?'Update patient status, then open the plan or post-treatment action directly from the row.':'حدّث حالة المريض، وافتح خطته أو إجراء ما بعد العلاج من صفه مباشرة.');
  $('datePicker').setAttribute('aria-label',lang==='en'?'Date':'التاريخ');
  $('timeline').setAttribute('aria-label',lang==='en'?'Patient timeline':'الخط الزمني للمرضى');
  setText('#patientIdentitySearchBtn strong',lang==='en'?'Patient record':'ملف المريض');
  setText('#patientIdentitySearchBtn small',lang==='en'?'Search · edit · track':'بحث · تعديل · متابعة');
  setText('#addBtn',tr('addPatient'));
  setText('#screenBtn',tr('screenMode'));
  setText('#installBtn',tr('installApp'));
  setText('#settingsBtn',tr('settings'));
  applyIosInstallLanguage();
  updateNotificationsButton();
  updateSoundButton();
  setText('#importBtn',lang==='en'?'📥 Import CSV / Excel':'📥 استيراد CSV / Excel');
  setText('#exportBtn',tr('exportCsv'));
  setText('#syncTestBtn',tr('testSync'));
  setText('#clearBtn',tr('clearToday'));
  setText('#alertBtn strong',tr('alertTitle'));
  setText('#pwaUpdateBar span',tr('updateAvailable'));
  setText('#pwaUpdateBtn',tr('updateNow'));
  setTexts('.stats .stat small',[tr('totalPatients'),tr('completed'),tr('inTreatment'),tr('remaining'),tr('cancelled'),tr('completionRate')]);
  setTexts('.timer-box small',[tr('originalTime'),tr('actualDuration')]);
  setText('.timer-box:not(.actual) .actual-hint',tr('originalHint'));
  setText('.upcoming-head h2',tr('upcomingPatients'));
  setText('.upcoming-head small',tr('upcomingHint'));
  setText('.quick-add-head p',tr('formIntro'));
  setTexts('.quick-add-grid label',[tr('firstName'),tr('fileNumber'),lang==='en'?'Phone number':'رقم الجوال',tr('appointmentDate'),tr('startTime'),tr('endTime'),tr('procedure'),tr('status')]);
  $('fName').placeholder=tr('namePlaceholder');
  $('fFile').placeholder=tr('filePlaceholder');
  $('fPhone').placeholder=lang==='en'?'05xxxxxxxx':'05xxxxxxxx';
  $('fNationalId').placeholder=lang==='en'?'10 digits (optional)':'10 أرقام (اختياري)';
  setText('#newLabCaseShortcutLabel',lang==='en'?'New lab case':'حالة معمل جديدة');
  $('fProcedure').placeholder=tr('procedurePlaceholder');
  setText('#resetPatientBtn',tr('resetFields'));
  setText('#cancelEditBtn',tr('cancelEdit'));
  setText('.main-clean details:first-child > summary',VIEW_MODE==='clinic'?(lang==='en'?'Clinic patients and actions':'مرضى العيادة والإجراءات'):(lang==='en'?'Selected clinic patient list':'قائمة مرضى العيادة المحددة'));
  $('searchInput').placeholder=lang==='en'?'Search name, file, or mobile':'بحث بالاسم أو رقم الملف أو الجوال';
  setTexts('table thead th',['#',tr('name'),tr('fileNumber'),tr('start'),tr('end'),tr('procedure'),tr('status'),tr('action')]);
  setText('.notes-panel > summary',tr('todayNotes'));
  $('notes').placeholder=tr('notesPlaceholder');
  setText('#exitScreenBtn',tr('exitFullscreen'));
  setText('#patientIdentitySearchTitle',lang==='en'?'Patient record':'ملف المريض');
  setText('#patientIdentitySearchHelp',lang==='en'?'Search by name, file, mobile, or national ID, then view patient data and all related actions.':'ابحث بالاسم أو رقم الملف أو الجوال أو الهوية، ثم استعرض بيانات المريض وجميع إجراءاته.');
  setText('#patientIdentitySearchHint',lang==='en'?'Plans, payments, lab cases, and appointments stay linked to the patient identity.':'ترتبط الخطط والدفع وحالات المعمل والمواعيد بهوية المريض وتبقى متاحة عند عودته.');
  if($('patientIdentitySearchInput'))$('patientIdentitySearchInput').placeholder=lang==='en'?'Name, file, mobile, or national ID':'الاسم، رقم الملف، الجوال، أو الهوية';
  renderPatientIdentitySearch();
  setText('#alertModalTitle',tr('alertModalTitle'));
  setText('.alert-modal-head p',lang==='en'?'Write a short note and choose who receives it. All clinics is the default.':'اكتب ملاحظة مختصرة وحدد الجهة المستلمة؛ العام هو الخيار الافتراضي.');
  setText('#alertTargetTitle',lang==='en'?'Alert destination':'جهة التنبيه');
  setText('label[for="alertMessageInput"]',tr('alertMessage'));
  setText('#alertScopeAll + span',lang==='en'?'All clinics':'كل العيادات');
  setText('#alertScopeClinic + span',lang==='en'?'Specific clinic':'عيادة محددة');
  if(els.alertClinicPicker.childNodes[0])els.alertClinicPicker.childNodes[0].textContent=lang==='en'?'Choose clinic':'اختر العيادة';
  $('alertMessageInput').placeholder=tr('alertPlaceholder');
  setText('.alert-preview span:last-child',lang==='en'?'The alert appears immediately on the selected screens with a clear sound cue.':'يظهر التنبيه فورًا في الشاشات المحددة مع نغمة تنبيه واضحة.');
  setTexts('#alertModal .modal-actions button',[tr('close'),tr('clearAlert'),tr('publishAlert')]);
  if(!els.alertClinicPicker.hidden)populateAlertClinicOptions();
  updateAlertTargetUI();
  setText('#developerRights',tr('developerRights'));
  if($('patientFormSummary'))$('patientFormSummary').innerHTML=`<span>${lang==='en'?'➕ Add or edit a patient':'➕ إضافة أو تعديل مريض'}</span><small>${lang==='en'?'Tap to open the form':'اضغط لفتح النموذج'}</small>`;
  setText('#paymentModalTitle',lang==='en'?'Complete treatment and next actions':'اكتمال علاج المريض');
  setText('#paymentChoiceTitle',lang==='en'?'Payment order':'يوجد أمر دفع');
  setText('#paymentChoiceHelp',lang==='en'?'Send the completed procedures to administration for collection.':'إرسال الإجراءات المنفذة إلى الإدارة للتحصيل.');
  setText('#planDraftChoiceTitle',lang==='en'?'Treatment plan draft':'إنشاء مسودة خطة علاجية');
  setText('#planDraftChoiceHelp',lang==='en'?'Open the plan form, complete it, then approve it as the doctor.':'فتح نموذج الخطة وإكمالها ثم اعتمادها من الطبيب.');
  setText('#prescriptionChoiceTitle',lang==='en'?'Prepare a prescription':'إعداد وصفة علاجية');
  setText('#prescriptionChoiceHelp',lang==='en'?'Choose the category, complete the clinician-authored fields, then send it to administration.':'اختر نوع العلاج، ثم يعتمد الطبيب الوصفة لتصل إلى مركز الوصفات بالإدارة.');
  $('completionFlowNote').innerHTML=lang==='en'?'<strong>Workflow:</strong> The doctor completes and approves the draft, then administration receives it to finish the process.':'<strong>المسار:</strong> يُكمل الطبيب المسودة ويعتمدها، ثم تستلمها الإدارة لاستكمال الإجراءات.';
  setText('#confirmCompletionBtn',lang==='en'?'Confirm completion and continue':'اعتماد إكمال العلاج والمتابعة');
  setText('#paymentItemsLabel',lang==='en'?'Payment order procedures':'إجراءات أمر الدفع');
  setText('#paymentCatalogSourceTitle',lang==='en'?'Central procedures and services list':'قائمة الإجراءات والخدمات المركزية');
  setText('#paymentCatalogSourceHelp',lang==='en'?'Managed from Settings; saved changes appear here automatically.':'تُدار من الإعدادات، ويظهر أي تعديل محفوظ هنا تلقائيًا.');
  setText('#paymentCatalogRefreshBtn',lang==='en'?'↻ Update list':'↻ تحديث القائمة');
  setText('#paymentOtherLabel',lang==='en'?'Other procedure':'إجراء آخر');
  setText('#paymentDiscountLabel',lang==='en'?'Discount (written note)':'الخصم (كتابة)');
  $('paymentOtherInput').placeholder=lang==='en'?'Write the other procedure':'اكتب الإجراء الآخر';
  $('paymentDiscountInput').placeholder=lang==='en'?'Example: 10% or SAR 100 discount':'مثال: خصم 10% أو خصم 100 ريال';
  renderPaymentProcedureOptions();
  setText('#reviewModalTitle',lang==='en'?'Request patient experience review':'طلب تقييم تجربة المريض');
  setText('#reviewPhoneLabel',lang==='en'?'Patient WhatsApp number (optional)':'رقم واتساب المريض (اختياري)');
  setText('#reviewMessageLabel',lang==='en'?'Message text':'نص الرسالة');
  setText('#reviewUrlLabel',lang==='en'?'Google review link':'رابط تقييم Google');
  setText('#reviewLinkHint',lang==='en'?'Opens the Best Care Dental Clinics profile on Google Maps.':'يفتح ملف عيادات أفضل عناية الاستشارية للأسنان على Google Maps.');
  setText('#reviewLinkPreview',lang==='en'?'Preview link':'معاينة الرابط');
  setTexts('#reviewModal .modal-actions button',[lang==='en'?'Cancel':'إلغاء',lang==='en'?'Copy message':'نسخ الرسالة',lang==='en'?'Send via WhatsApp':'إرسال عبر واتساب']);
  rebuildStatusSelect($('fStatus'));
  rebuildStatusSelect($('filterStatus'),true);
  $('langBtn').textContent=lang==='en'?'العربية':'English';
  if(sync.error)setBadge('error',lang==='en'?'Connection failed — retrying':'فشل الاتصال — ستتم إعادة المحاولة',sync.error);
  else if(sync.pushing||sync.dirty)setBadge('saving',lang==='en'?'Saving automatically…':'جارٍ الحفظ تلقائيًا…');
  else if(sync.ready)setIdleSyncBadge(`revision ${sync.revision}`);
  else setBadge('connecting',lang==='en'?'Connecting automatically…':'جارٍ الاتصال تلقائيًا…');
  if(editingId){
    $('patientFormTitle').textContent=tr('editPatient');
    $('patientFormMode').textContent=tr('editing');
    $('savePatientBtn').textContent=tr('saveChanges');
  }else if($('patientFormTitle')){
    $('patientFormTitle').textContent=tr('addNewPatient');
    $('patientFormMode').textContent=tr('add');
    $('savePatientBtn').textContent=tr('saveAdd');
  }
  renderAlertUI();
  renderClinicSwitcher();
  render();
  renderAppointmentRequests();
  updateClock();
}
function toggleLang(){lang=lang==='ar'?'en':'ar';localStorage.setItem('bestcare_lang',lang);applyLang()}
const APPOINTMENT_SERVICE_LABELS={examination:'فحص وتشخيص',pain:'ألم أو حالة عاجلة',restorative:'حشوات وعلاج تحفظي',root_canal:'علاج عصب',prosthodontics:'تركيبات وعدسات',implants:'زراعة أسنان',cosmetic:'تجميل الأسنان والابتسامة',cleaning:'تنظيف الأسنان',other:'خدمة أخرى'};
const APPOINTMENT_STATUS_LABELS={new:'طلب جديد',contacted:'تم التواصل',booked:'تم الحجز',closed:'مغلق'};
function appointmentRequestCadence(){
  const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Riyadh',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const read=type=>parts.find(part=>part.type===type)?.value||'';
  const hour=Number(read('hour')),working=read('weekday')!=='Fri'&&hour>=14&&hour<23;
  return working?(document.hidden?2*60*1000:45*1000):(document.hidden?15*60*1000:3*60*1000);
}
function appointmentRequestLink(){return `${location.origin}/book`}
function renderAppointmentRequests(){
  const center=$('appointmentRequestCenter');if(!center)return;
  center.hidden=VIEW_MODE!=='admin'||authUser?.role!=='admin';
  if(center.hidden)return;
  const openItems=appointmentRequests.items.filter(item=>item.status==='new');
  center.classList.toggle('has-new',openItems.length>0);
  center.classList.toggle('is-clear',openItems.length===0);
  $('appointmentRequestCount').textContent=String(openItems.length);
  $('appointmentRequestButton').title=lang==='en'
    ?(openItems.length?`${openItems.length} new appointment request${openItems.length===1?'':'s'}`:'Appointment requests')
    :(openItems.length?`${openItems.length} طلب موعد جديد`:'طلبات المواعيد');
  $('appointmentRequestButton').setAttribute('aria-label',lang==='en'
    ?(openItems.length?`Appointment requests: ${openItems.length} new`:'Appointment requests: no new requests')
    :(openItems.length?`طلبات المواعيد: ${openItems.length} طلب جديد`:'طلبات المواعيد: لا توجد طلبات جديدة'));
  const requestState=$('appointmentRequestState');
  if(requestState)requestState.textContent=lang==='en'
    ?(openItems.length?(openItems.length===1?'new request':'new requests'):'no new requests')
    :(openItems.length?(openItems.length===1?'طلب جديد':'طلبات جديدة'):'لا طلبات جديدة');
  $('appointmentRequestList').innerHTML=appointmentRequests.items.length?appointmentRequests.items.map(item=>{
    const service=item.service==='other'?(item.serviceOther||APPOINTMENT_SERVICE_LABELS.other):(APPOINTMENT_SERVICE_LABELS[item.service]||APPOINTMENT_SERVICE_LABELS.other);
    const created=item.createdAt?new Date(item.createdAt).toLocaleString('ar-SA',{timeZone:'Asia/Riyadh',dateStyle:'short',timeStyle:'short'}):'—';
    const source=item.source==='dr-yahyahadi'?'الموقع الشخصي':'الرابط المباشر';
    const history=Array.isArray(item.history)?item.history:[],latest=history.at(-1);
    const lastAction=latest?`${APPOINTMENT_STATUS_LABELS[latest.status]||'تحديث'} · ${latest.by||'النظام'}${latest.note?` · ${latest.note}`:''}`:'بانتظار أول إجراء';
    return `<article class="appointment-request-item ${item.status==='new'?'is-new':''}" data-appointment-request="${escapeHtml(item.id)}"><div><strong><a href="./appointment-requests.html?focus=${encodeURIComponent(item.id)}">${escapeHtml(item.name)} · ${escapeHtml(item.phone)}</a></strong><small>هوية ${escapeHtml(item.identity)} · ${escapeHtml(service)}</small><small>${escapeHtml(created)} · ${source}${item.note?` · ${escapeHtml(item.note)}`:''}</small><small class="last-action">آخر إجراء: ${escapeHtml(lastAction)}</small></div><select data-appointment-request-status="${escapeHtml(item.id)}" aria-label="حالة طلب ${escapeHtml(item.name)}">${Object.entries(APPOINTMENT_STATUS_LABELS).map(([value,label])=>`<option value="${value}" ${item.status===value?'selected':''}>${label}</option>`).join('')}</select></article>`;
  }).join(''):'<p class="appointment-request-empty">لا توجد طلبات مواعيد مسجلة.</p>';
  renderOperationsCenter();updateTreatmentPlanCenterTrigger();
}
async function refreshAppointmentRequests({notify=true}={}){
  if(VIEW_MODE!=='admin'||authUser?.role!=='admin'||appointmentRequests.busy)return;
  appointmentRequests.busy=true;
  try{
    const response=await request('/api/appointment-requests?limit=100');
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'تعذر تحميل طلبات المواعيد');
    const items=Array.isArray(data.requests)?data.requests:[];
    const newestAt=Math.max(0,...items.filter(item=>item.status==='new').map(item=>Number(item.createdAt||0)));
    const isNew=appointmentRequests.lastNewestAt>0&&newestAt>appointmentRequests.lastNewestAt;
    appointmentRequests.items=items;
    if(newestAt>appointmentRequests.lastNewestAt){
      appointmentRequests.lastNewestAt=newestAt;
      sessionStorage.setItem('bestcare_appointment_request_seen_at',String(newestAt));
    }
    renderAppointmentRequests();
    $('appointmentRequestError').hidden=true;
    if(isNew&&notify){
      prepareAudio();playAlertSound('urgent');
      $('appointmentRequestPeek').hidden=false;
      clearTimeout(appointmentRequests.peekTimer);
      appointmentRequests.peekTimer=setTimeout(()=>$('appointmentRequestPeek').hidden=true,5*60*1000);
      toast('طلب موعد جديد','وصل طلب من رابط حجز المواعيد ويحتاج تواصل الإدارة.');
    }
  }catch(error){
    $('appointmentRequestError').textContent='تعذر تحديث طلبات المواعيد الآن؛ ستتم إعادة المحاولة تلقائيًا.';
    $('appointmentRequestError').hidden=false;
  }finally{appointmentRequests.busy=false}
}
function scheduleAppointmentRequests(){
  clearTimeout(appointmentRequests.timer);
  if(!appointmentRequests.started)return;
  appointmentRequests.timer=setTimeout(async()=>{await refreshAppointmentRequests();scheduleAppointmentRequests()},appointmentRequestCadence());
}
function startAppointmentRequests(){
  if(appointmentRequests.started)return;
  appointmentRequests.started=true;
  $('appointmentRequestCenter').hidden=false;
  refreshAppointmentRequests({notify:false}).finally(scheduleAppointmentRequests);
}
function stopAppointmentRequests(){
  appointmentRequests.started=false;
  clearTimeout(appointmentRequests.timer);
  clearTimeout(appointmentRequests.peekTimer);
  appointmentRequests.timer=null;
  if($('appointmentRequestCenter'))$('appointmentRequestCenter').hidden=true;
}
async function updateAppointmentRequestStatus(id,status,select){
  select.disabled=true;
  try{
    const response=await request('/api/appointment-requests',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id,status})});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'تعذر تحديث الطلب');
    const index=appointmentRequests.items.findIndex(item=>item.id===id);
    if(index>=0)appointmentRequests.items[index]=data.request;
    appointmentRequestChannel?.postMessage({type:'updated',id});
    renderAppointmentRequests();renderOperationsCenter();updateTreatmentPlanCenterTrigger();
  }catch(error){toast('تعذر تحديث طلب الموعد','تحقق من الاتصال وأعد المحاولة.');renderAppointmentRequests()}
}
function updateClock(){
  const now=new Date();
  $('clock').textContent=now.toLocaleTimeString(lang==='en'?'en-GB':'ar-SA');
  $('dateText').textContent=now.toLocaleDateString(
    lang==='en'?'en-GB':'ar-SA',
    {weekday:'long',year:'numeric',month:'long',day:'numeric'}
  );
  renderLive(false);
}
$('addBtn').addEventListener('click',()=>openPatient());
$('patientIdentitySearchBtn').addEventListener('click',openPatientIdentitySearch);
$('savePatientBtn').addEventListener('click',savePatient);
$('resetPatientBtn').addEventListener('click',()=>resetPatientForm(true));
$('cancelEditBtn').addEventListener('click',()=>resetPatientForm(false));
$('patientFormCard').addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.tagName!=='SELECT'){event.preventDefault();savePatient()}});
$('patientIdentitySearchInput').addEventListener('input',()=>{patientIdentityDisplayLimit=120;renderPatientIdentitySearch();schedulePatientIdentityRemoteSearch()});
$('patientIdentitySearchResults').addEventListener('click',event=>{
  if(event.target.closest('[data-identity-more]')){patientIdentityDisplayLimit+=120;renderPatientIdentitySearch();return}
  const button=event.target.closest('[data-identity-open]');
  if(button)openPatientIdentityResult(button);
});
$('patientProfileBack').addEventListener('click',()=>{showPatientIdentitySearchView();renderPatientIdentitySearch();setTimeout(()=>$('patientIdentitySearchInput')?.focus(),50)});
$('patientProfileForm').addEventListener('submit',savePatientProfile);
document.querySelector('.patient-profile-summary').addEventListener('click',event=>{const button=event.target.closest('[data-profile-tab]');if(!button)return;patientProfileState.tab=button.dataset.profileTab;renderPatientProfileTimeline()});
$('patientProfileTimeline').addEventListener('click',event=>{const button=event.target.closest('[data-profile-open-plan]');if(button)openPatientProfilePlan(button.dataset.profileOpenPlan)});
$('patientDirectoryImportShortcutBtn')?.addEventListener('click',openPatientDirectoryImportPicker);
$('patientDirectoryImportBtn')?.addEventListener('click',openPatientDirectoryImportPicker);
$('patientDirectoryFileInput')?.addEventListener('change',event=>event.target.files[0]&&preparePatientDirectoryImport(event.target.files[0]));
$('patientDirectoryAddBtn').addEventListener('click',openPatientDirectoryAddPanel);
$('patientDirectoryAddCancel').addEventListener('click',()=>{$('patientDirectoryAddPanel').hidden=true});
$('patientDirectoryAddForm').addEventListener('submit',savePatientDirectorySingle);
$('patientDirectoryImportCancel').addEventListener('click',()=>{patientDirectoryImportDraft={fileName:'',rows:[],validRows:[],invalidRows:[]};$('patientDirectoryImportPanel').hidden=true});
$('patientDirectoryImportSave').addEventListener('click',savePatientDirectoryImport);
applyTheme(currentTheme);
$('themeToggleBtn').addEventListener('click',()=>applyTheme(currentTheme==='dark'?'light':'dark',{save:true}));
$('adminLayoutModeBtn')?.addEventListener('click',event=>{
  event.stopPropagation();setSettingsMenuOpen(false);
  const next=adminLayoutMode==='modern'?'classic':'modern';applyAdminLayout(next,{save:true});
  toast(next==='modern'?(lang==='en'?'Modern interface':'الواجهة الحديثة'):(lang==='en'?'Classic interface':'الواجهة الكلاسيكية'),next==='modern'?(lang==='en'?'The organized administration workspace is now active.':'تم تفعيل مساحة الإدارة المنظمة مع بقاء التصميم الكلاسيكي متاحًا.'):(lang==='en'?'The familiar administration layout is now active.':'تمت العودة إلى تصميم الإدارة المعتاد.'));
});
$('modernSidebarCollapseBtn')?.addEventListener('click',event=>{event.stopPropagation();applyModernSidebarCollapsed(!modernSidebarCollapsed,{save:true})});
[$('modernAdminSidebar'),$('modernAdminOverview')].filter(Boolean).forEach(container=>container.addEventListener('click',event=>{const button=event.target.closest('[data-modern-action]');if(!button)return;if(button.dataset.modernAction==='settings')event.stopPropagation();handleModernAdminAction(button.dataset.modernAction)}));
function setSettingsMenuOpen(open){
  const isOpen=Boolean(open);
  els.settingsMenu.classList.toggle('open',isOpen);
  els.settingsBtn.setAttribute('aria-expanded',String(isOpen));
}
els.settingsBtn.setAttribute('aria-haspopup','menu');
els.settingsBtn.setAttribute('aria-expanded','false');
$('settingsBtn').addEventListener('click',event=>{event.stopPropagation();setSettingsMenuOpen(!els.settingsMenu.classList.contains('open'))});
document.addEventListener('click',()=>setSettingsMenuOpen(false));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&els.settingsMenu.classList.contains('open')){setSettingsMenuOpen(false);els.settingsBtn.focus()}});
$('importBtn').addEventListener('click',()=>els.csvInput.click());
els.csvInput.addEventListener('change',event=>event.target.files[0]&&importPatientFile(event.target.files[0]));
$('exportBtn').addEventListener('click',exportCsv);
$('notificationsBtn').addEventListener('click',toggleSystemNotifications);
$('soundAlertsBtn').addEventListener('click',toggleSoundAlerts);
document.addEventListener('pointerdown',()=>{if(soundAlertsEnabled())prepareAudio()},{once:true,passive:true});
document.addEventListener('keydown',()=>{if(soundAlertsEnabled())prepareAudio()},{once:true});
$('treatmentCatalogBtn').addEventListener('click',openTreatmentCatalog);
$('labCasesBtn').addEventListener('click',()=>{setSettingsMenuOpen(false);openLabCasesPage()});
$('appointmentRequestsPageBtn').addEventListener('click',()=>{setSettingsMenuOpen(false);location.href='./appointment-requests.html'});
$('floatingLabBtn').addEventListener('click',()=>openLabCasesPage());
$('clinicsBtn').addEventListener('click',openClinicDirectory);
$('addClinicSlotBtn').addEventListener('click',addClinicSlot);
$('saveClinicsBtn').addEventListener('click',saveClinicDirectory);
$('clinicDirectoryList').addEventListener('click',event=>{
  const button=event.target.closest('[data-hide-clinic]');if(!button)return;
  collectClinicDirectoryEditor();
  const clinic=clinicDirectory.find(item=>item.id===button.dataset.hideClinic);
  if(!clinic||clinic.id==='clinic-1'||clinic.id===ACTIVE_CLINIC_ID)return;
  if(!confirm(`إخفاء ${clinic.name}؟ ستبقى بياناتها محفوظة ويمكن إظهارها لاحقًا.`))return;
  clinic.active=false;
  renderClinicDirectoryEditor();
});
$('clinicSwitcher').addEventListener('change',event=>switchClinic(event.target.value));
$('addCatalogItemBtn').addEventListener('click',()=>{collectTreatmentCatalog();treatmentCatalog.push({id:`custom-${Date.now()}`,name:'',beforePrice:'',afterPrice:''});renderTreatmentCatalog();$('treatmentCatalogList').lastElementChild?.querySelector('[data-catalog-name]')?.focus()});
$('treatmentCatalogList').addEventListener('click',event=>{const button=event.target.closest('[data-catalog-delete]');if(!button)return;collectTreatmentCatalog();treatmentCatalog.splice(Number(button.dataset.catalogDelete),1);renderTreatmentCatalog()});
$('saveTreatmentCatalogBtn').addEventListener('click',saveTreatmentCatalog);
$('paymentCatalogRefreshBtn').addEventListener('click',()=>updatePaymentCatalogFromSettings({notify:true}));
$('syncTestBtn').addEventListener('click',syncTest);
$('logoutBtn').addEventListener('click',logoutApp);
$('clearBtn').addEventListener('click',()=>{if(confirm('مسح قائمة اليوم بالكامل؟'))mutate(()=>{patients=[];notes='';updateAlert={active:false,message:'',updatedAt:0,kind:''};els.notes.value=''})});
$('alertBtn').addEventListener('click',openAlertComposer);
$('sendAlertBtn').addEventListener('click',publishAlert);
$('clearAlertBtn').addEventListener('click',clearAlert);
$('alertRowDismissBtn').addEventListener('click',dismissCurrentAlert);
$('alertMessageInput').addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();publishAlert()}});
document.querySelectorAll('input[name="alertScope"]').forEach(input=>input.addEventListener('change',updateAlertTargetUI));
els.alertTargetClinic.addEventListener('change',updateAlertTargetUI);
$('langBtn').addEventListener('click',toggleLang);
$('screenBtn').addEventListener('click',enterScreen);
$('exitScreenBtn').addEventListener('click',exitScreen);
$('installBtn').addEventListener('click',installApp);
$('iosInstallGuideBtn').addEventListener('click',()=>{setSettingsMenuOpen(false);openIosInstallGuide()});
$('copyAppLinkBtn').addEventListener('click',copyAppLink);
$('pwaUpdateBtn').addEventListener('click',()=>{
  if(!waitingServiceWorker)return;
  pwaReloadRequested=true;
  waitingServiceWorker.postMessage({type:'SKIP_WAITING'});
});
$('authRequestBtn')?.addEventListener('click',()=>requestAuthOtp());
$('authVerifyBtn')?.addEventListener('click',verifyAuthOtp);
$('authBackBtn')?.addEventListener('click',()=>{$('authRequestStep').hidden=false;$('authVerifyStep').hidden=true;authErrorMessage('')});
$('usersBtn').addEventListener('click',()=>{setSettingsMenuOpen(false);openUsersModal()});
if(!$('newEmail')){const base=$('newPhone')?.parentElement;if(base){const label=document.createElement('label');label.innerHTML='البريد الإلكتروني (للدخول بالرمز)<input id="newEmail" type="email" autocomplete="email" placeholder="name@example.com">';base.parentElement.insertBefore(label,base.nextSibling)}}
saveUser=async function(){const body={username:$('newUsername').value.trim(),displayName:$('newDisplayName').value.trim(),phone:$('newPhone').value.trim(),email:($('newEmail')?.value||'').trim(),role:$('newRole').value,clinicId:$('newClinicId').value.trim()};$('usersError').textContent='جارٍ الحفظ…';try{const {data}=await authRequest('?action=users',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!data.ok){$('usersError').textContent=data.error||'تعذر حفظ المستخدم';return}closeModal('usersModal');toast('تم حفظ المستخدم','سيتمكن من الدخول بالبريد الإلكتروني أو الجوال حسب الخيار المتاح.')}catch(error){$('usersError').textContent=error.message}};
$('saveUserBtn').addEventListener('click',saveUser);
$('flowStage').addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.callId)callPatient(button.dataset.callId);
  if(button.dataset.actualId)startActualTreatment(button.dataset.actualId);
  if(button.dataset.finishId)finishPatient(button.dataset.finishId);
});
els.search.addEventListener('input',render);
els.filter.addEventListener('change',render);
els.notes.addEventListener('input',()=>{notes=els.notes.value;markDirty()});
els.datePicker.addEventListener('change',()=>setDate(els.datePicker.value));
els.syncBadge.addEventListener('click',syncTest);
els.presenceBadge.addEventListener('click',()=>{openModal('presenceModal');refreshPresence({silent:true})});
$('presenceRefreshBtn').addEventListener('click',()=>refreshPresence());
$('adminHubClinicFilter')?.addEventListener('change',renderAdminPatientHub);
$('adminHubScopeFilter')?.addEventListener('change',renderAdminPatientHub);
$('adminHubSearch')?.addEventListener('input',renderAdminPatientHub);
$('adminHubRefresh')?.addEventListener('click',()=>refreshAdminPatientHub({force:true}));
$('treatmentPlanCenterBtn')?.addEventListener('click',openTreatmentPlanCenter);
$('treatmentPlanCenterSearch')?.addEventListener('input',renderTreatmentPlanCenter);
$('treatmentPlanCenterClinic')?.addEventListener('change',renderTreatmentPlanCenter);
$('treatmentPlanCenterStatus')?.addEventListener('change',renderTreatmentPlanCenter);
$('treatmentPlanCenterRefresh')?.addEventListener('click',()=>Promise.allSettled([refreshTreatmentPlanCenter(),refreshAppointmentRequests({notify:false}),refreshOperationsLabCases(),refreshOperationsPrescriptions()]));
$('treatmentPlanCenterList')?.addEventListener('click',event=>{
  const open=event.target.closest('[data-plan-center-open]')?.dataset.planCenterOpen;
  const remove=event.target.closest('[data-plan-center-delete]')?.dataset.planCenterDelete;
  if(open)openPlanCenterRecord(open);
  if(remove)deletePlanCenterRecord(remove);
});
$('treatmentPlanCenterList')?.addEventListener('change',event=>{
  const canonical=event.target.dataset.planCenterStatus;
  if(canonical)changePlanCenterStatus(canonical,event.target.value,event.target);
});
$('treatmentPlanCenterModal')?.addEventListener('click',event=>{
  const filter=event.target.closest('[data-operation-filter]')?.dataset.operationFilter;
  const canonical=event.target.closest('[data-operation-plan]')?.dataset.operationPlan;
  if(filter){operationsCenter.filter=filter;renderOperationsCenter()}
  if(canonical)openPlanCenterRecord(canonical);
});
$('operationsAlertList')?.addEventListener('change',async event=>{
  const appointmentId=event.target.dataset.operationAppointmentStatus;
  const planKey=event.target.dataset.operationPlanStatus;
  const labId=event.target.dataset.operationLabStatus;
  if(appointmentId)await updateAppointmentRequestStatus(appointmentId,event.target.value,event.target);
  else if(planKey)await changePlanCenterStatus(planKey,event.target.value,event.target);
  else if(labId)await changeOperationLabStatus(labId,event.target.dataset.operationLabClinic,event.target.value,event.target);
});
els.patientRows.addEventListener('change',async event=>{
  const planId=event.target.dataset.planStatusId;
  if(planId){
    await changeTreatmentPlanStatus(planId,event.target.value,event.target);
    return;
  }
  const id=event.target.dataset.statusId;if(!id)return;
  const status=event.target.value;
  if(status==='done'){
    const patient=patientById(id);
    event.target.value=patient?.status||'waiting';
    finishPatient(id);
    return;
  }
  mutate(()=>{const p=patientById(id);if(p){p.status=status;applyAutomaticStatusAlert(p,status)}});
});
els.patientRows.addEventListener('click',event=>{
  const labEntry=event.target.closest('[data-lab-entry-id]')?.dataset.labEntryId,labPatient=event.target.closest('[data-lab-patient]')?.dataset.labPatient,review=event.target.closest('[data-review-id]')?.dataset.reviewId,plan=event.target.closest('[data-plan-id]')?.dataset.planId,prescription=event.target.closest('[data-prescription-id]')?.dataset.prescriptionId,completion=event.target.closest('[data-completion-id]')?.dataset.completionId,edit=event.target.closest('[data-edit-id]')?.dataset.editId,del=event.target.closest('[data-delete-id]')?.dataset.deleteId;
  if(labEntry)openLabCaseEditor(labEntry);
  if(labPatient)openLabCasesPage(patientById(labPatient));
  if(review)openReviewComposer(review);
  if(plan)openTreatmentPlan(plan);
  if(prescription)openPrescription(prescription);
  if(completion&&VIEW_MODE==='clinic')finishPatient(completion);
  if(edit)openPatient(edit);
  if(del&&confirm('حذف هذا المريض؟'))mutate(()=>patients=patients.filter(p=>String(p.id)!==String(del)));
});
$('doctorActionQueue').addEventListener('click',event=>{
  const planId=event.target.closest('[data-doctor-plan-id]')?.dataset.doctorPlanId;
  const completionId=event.target.closest('[data-doctor-completion-id]')?.dataset.doctorCompletionId;
  if(planId)openTreatmentPlan(planId);
  if(completionId)finishPatient(completionId);
});
$('doctorFloatingAlertBtn').addEventListener('click',()=>{
  const panel=$('doctorFloatingAlertPanel');
  const open=panel.hidden;
  panel.hidden=!open;
  $('doctorFloatingAlertBtn').setAttribute('aria-expanded',String(open));
  $('doctorFloatingAlertPeek').hidden=true;
});
$('doctorFloatingAlertClose').addEventListener('click',()=>{
  $('doctorFloatingAlertPanel').hidden=true;
  $('doctorFloatingAlertBtn').setAttribute('aria-expanded','false');
  $('doctorFloatingAlertBtn').focus();
});
$('doctorFloatingPeekClose').addEventListener('click',event=>{
  event.stopPropagation();
  clearTimeout(doctorAlertPeekTimer);
  dismissCurrentAlert();
});
$('appointmentRequestButton').addEventListener('click',()=>{
  const panel=$('appointmentRequestPanel'),open=panel.hidden;
  panel.hidden=!open;
  $('appointmentRequestButton').setAttribute('aria-expanded',String(open));
  $('appointmentRequestPeek').hidden=true;
  if(open)refreshAppointmentRequests({notify:false});
});
$('appointmentRequestClose').addEventListener('click',()=>{
  $('appointmentRequestPanel').hidden=true;
  $('appointmentRequestButton').setAttribute('aria-expanded','false');
  $('appointmentRequestButton').focus();
});
$('refreshAppointmentRequests').addEventListener('click',()=>refreshAppointmentRequests({notify:false}));
$('copyAppointmentRequestLink').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(appointmentRequestLink());toast('تم نسخ رابط طلب الموعد','يمكن إضافته الآن إلى الصفحة الشخصية أو إرساله للمريض.')}
  catch{prompt('انسخ رابط طلب الموعد:',appointmentRequestLink())}
});
$('appointmentRequestList').addEventListener('change',event=>{
  const id=event.target.dataset.appointmentRequestStatus;
  if(id)updateAppointmentRequestStatus(id,event.target.value,event.target);
});
if('BroadcastChannel' in window){
  appointmentRequestChannel=new BroadcastChannel('bestcare-appointment-requests');
  appointmentRequestChannel.addEventListener('message',event=>{
    if(event.data?.type==='updated'&&appointmentRequests.started)refreshAppointmentRequests({notify:false});
  });
}
document.addEventListener('click',event=>{
  const floating=$('doctorFloatingAlerts');
  if(!floating||floating.hidden||floating.contains(event.target))return;
  $('doctorFloatingAlertPanel').hidden=true;
  $('doctorFloatingAlertBtn').setAttribute('aria-expanded','false');
});
document.addEventListener('visibilitychange',()=>{if(appointmentRequests.started){scheduleAppointmentRequests();if(!document.hidden)refreshAppointmentRequests()}if(operationsCenter.prescriptionsStarted){scheduleOperationsPrescriptionPolling();if(!document.hidden)refreshOperationsPrescriptions()}});
document.addEventListener('keydown',event=>{
  const modal=[...document.querySelectorAll('.modal.open')].at(-1);
  if(modal){
    if(event.key==='Escape'&&modal.id!=='roleModal'){
      event.preventDefault();
      closeModal(modal.id);
      return;
    }
    if(event.key==='Tab'){
      const focusable=modalFocusable(modal);
      if(!focusable.length){event.preventDefault();return}
      const first=focusable[0],last=focusable.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    }
    return;
  }
  if(event.key==='Escape'&&!$('doctorFloatingAlertPanel').hidden)$('doctorFloatingAlertClose').click();
});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>closeModal(button.dataset.close)));
document.querySelectorAll('.modal').forEach(modal=>modal.addEventListener('click',event=>{if(event.target===modal&&modal.id!=='roleModal')closeModal(modal.id)}));
$('paymentRequiredCheck').addEventListener('change',()=>{$('paymentActionField').hidden=!$('paymentRequiredCheck').checked;if($('paymentRequiredCheck').checked&&!$('paymentProcedureList').children.length)renderPaymentProcedureOptions()});
$('paymentProcedureList').addEventListener('input',event=>{const row=event.target.closest('[data-payment-row]');if(row&&event.target.matches('input[data-payment-free]'))row.querySelector('[data-payment-select]').checked=true});
$('paymentProcedureList').addEventListener('click',event=>{
  const favorite=event.target.closest('[data-payment-favorite]');
  if(favorite){togglePaymentFavorite(favorite.dataset.paymentFavorite);return}
  const button=event.target.closest('[data-payment-step]');if(!button)return;
  const row=button.closest('[data-payment-row]'),input=row?.querySelector('[data-payment-quantity]');
  changePaymentQuantity(input,button.dataset.paymentStep==='increase'?1:-1);
  if(row?.querySelector('[data-payment-select]'))row.querySelector('[data-payment-select]').checked=true;
});
$('paymentModal').addEventListener('click',event=>{
  const button=event.target.closest('[data-payment-other-step]');if(!button)return;
  changePaymentQuantity($('paymentOtherQuantity'),button.dataset.paymentOtherStep==='increase'?1:-1);
  $('paymentOtherCheck').checked=true;
});
$('paymentOtherInput').addEventListener('input',()=>{if($('paymentOtherInput').value.trim())$('paymentOtherCheck').checked=true});
[$('paymentOtherQuantity'),$('paymentOtherFree')].forEach(input=>input.addEventListener('change',()=>{$('paymentOtherCheck').checked=true}));
$('labUnitsMinus').addEventListener('click',()=>changeLabUnits(-1));
$('labUnitsPlus').addEventListener('click',()=>changeLabUnits(1));
$('labNameSelect').addEventListener('change',()=>{$('labCustomNameLabel').hidden=$('labNameSelect').value!=='other';if(!$('labCustomNameLabel').hidden)$('labCustomNameInput').focus()});
$('labWorkType').addEventListener('change',()=>{$('labCustomWorkLabel').hidden=$('labWorkType').value!=='other';if(!$('labCustomWorkLabel').hidden)$('labCustomWorkInput').focus()});
$('saveLabCaseBtn').addEventListener('click',saveLabCase);
$('openLabCasesPageBtn').addEventListener('click',()=>openLabCasesPage(patientById(pendingLabPatientId)));
$('newLabCaseShortcutBtn').addEventListener('click',()=>{const params=new URLSearchParams({clinic:ACTIVE_CLINIC_ID,create:'1'});location.href=`./lab.html?${params.toString()}`});
$('confirmCompletionBtn').addEventListener('click',confirmPatientCompletion);
$('paymentQueue').addEventListener('click',event=>{
  const ackId=event.target.closest('[data-payment-ack-id]')?.dataset.paymentAckId;
  const completeId=event.target.closest('[data-payment-complete-id]')?.dataset.paymentCompleteId;
  if(ackId){
    mutate(()=>{const p=patientById(ackId);if(p)p.paymentAcknowledgedAt=Date.now()});
    toast(lang==='en'?'Payment request received':'تم استلام طلب الدفع',lang==='en'?'It is now ready for execution.':'أصبح الطلب جاهزًا للتنفيذ.');
  }
  if(completeId){
    mutate(()=>{const p=patientById(completeId);if(p){p.paymentAcknowledgedAt=p.paymentAcknowledgedAt||Date.now();p.paymentCompletedAt=Date.now();updateAlert={active:true,message:lang==='en'?`Payment completed for ${firstName(p.name)}`:`تم تنفيذ الدفع للمريض ${firstName(p.name)}`,updatedAt:Date.now(),kind:'payment-completed'}}});
    toast(lang==='en'?'Payment completed':'تم تنفيذ الدفع',lang==='en'?'A clear completion mark now appears on both pages.':'ظهرت علامة إتمام الدفع في صفحة الإدارة وصفحة العيادة.');
  }
});
$('reviewUrlInput').addEventListener('change',refreshReviewMessageFromUrl);
$('reviewUrlInput').addEventListener('input',()=>{$('reviewLinkPreview').href=$('reviewUrlInput').value.trim()||DEFAULT_GOOGLE_REVIEW_URL});
$('copyReviewBtn').addEventListener('click',copyReviewMessage);
$('sendReviewWhatsappBtn').addEventListener('click',sendReviewWhatsapp);
$('roleBtn').addEventListener('click',()=>openRoleChoice());
$('viewIdentityChange').addEventListener('click',()=>openRoleChoice());
$('clinicViewLink').addEventListener('click',event=>{
  if(VIEW_MODE==='clinic')return;
  event.preventDefault();
  openRoleChoice({clinic:true});
});
$('roleModal').addEventListener('click',async event=>{
  const mode=event.target.closest('[data-role-view]')?.dataset.roleView;if(!mode)return;
  if(mode==='clinic'){await openClinicRolePicker();return}
  location.href=viewUrl(mode);
});
$('roleClinicSelect').addEventListener('change',syncCombinedClinicDoctorPicker);
$('roleClinicBackBtn').addEventListener('click',resetClinicRolePicker);
$('roleClinicContinueBtn').addEventListener('click',()=>{
  const clinicId=$('roleClinicSelect').value;
  const clinic=clinicDirectory.find(item=>item.active&&item.id===clinicId);
  if(!clinic||!String(clinic.doctorName||'').trim()){$('roleClinicError').textContent=lang==='en'?'Choose a clinic with an assigned doctor first.':'اختر العيادة والطبيب أولًا.';return}
  location.href=viewUrl('clinic',clinicId);
});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstallPrompt=event;if(!isStandalone())$('installBtn').hidden=false});
window.addEventListener('appinstalled',()=>{$('installBtn').hidden=true;toast('تم التثبيت','أصبح Best Care Flow متاحًا كتطبيق على الجهاز')});
selectedDate=new URLSearchParams(location.search).get('date')||today();
els.datePicker.value=selectedDate;
applyViewMode();
setupModernAdminMetrics();
setupModernSidebarScroll();
applyLang();
initAuth();
if(isIosDevice()&&!isStandalone())$('installBtn').hidden=false;
resetPatientForm(false);
updateClock();
setInterval(updateClock,1000);
registerPwa();
disablePreviewPushSubscription()
  .then(refreshPushSubscriptionState)
  .catch(error=>console.warn('Push state refresh failed',error));

})();
