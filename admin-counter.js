// Comprehensive admin counter: live, interactive totals across all clinics
// (patients, procedures, lab cases) from /api/statistics. Admin view only.
// Refreshes right after any save on this device, on service-worker sync
// signals from other devices, across tabs, and through a light etag check.
(()=>{
  const root=document.getElementById('adminCounter');
  if(!root)return;
  // Netlify usage budget: the counter never polls on its own. It recalculates
  // only when a change is observed in requests the dashboard already makes,
  // and coalesces bursts: at most one call per minute while the page is visible.
  const MIN_REFRESH_GAP_MS=60_000;
  const MONTHS_MIN_GAP_MS=15*60_000;
  const WATCHED_READS=['/api/admin-patients','/api/state','/api/lab-cases'];
  const MUTATION_PATHS=['/api/state','/api/lab-cases','/api/patients','/api/admin-patients','/api/patient-profile','/api/appointment-imports','/api/appointment-requests'];
  const reduceMotion=()=>matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  const ICONS={
    uniquePatients:'<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c.8-4 3.8-6 7.5-6s6.7 2 7.5 6"/>',
    procedureUnits:'<path d="M7.5 3.5c-2.3 0-3.7 2-3.2 4.6.4 2 1.3 3.2 1.7 5.6.4 2.6.6 6.8 2.2 6.8 1.7 0 1.4-5.3 3.8-5.3s2.1 5.3 3.8 5.3c1.6 0 1.8-4.2 2.2-6.8.4-2.4 1.3-3.6 1.7-5.6.5-2.6-.9-4.6-3.2-4.6-1.9 0-2.7 1.2-4.5 1.2s-2.6-1.2-4.5-1.2Z"/>',
    labSent:'<path d="M9 3.5h6M10 3.5v6L4.8 18a1.6 1.6 0 0 0 1.4 2.5h11.6a1.6 1.6 0 0 0 1.4-2.5L14 9.5v-6"/><path d="M7.2 14.5h9.6"/>',
    completed:'<circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.3 2.6 2.6 5-5.3"/>',
    appointments:'<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
    cancelled:'<circle cx="12" cy="12" r="8.5"/><path d="m9 9 6 6M15 9l-6 6"/>',
    labOverdue:'<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.8M9.5 3h5"/>',
    labWaitingToSend:'<path d="M7 3.5h10M7 20.5h10M8 3.5c0 4 8 5 8 8.5s-8 4.5-8 8.5M16 3.5c0 4-8 5-8 8.5"/>',
    refresh:'<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4.5V11h-6.5"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    external:'<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
  };
  const icon=(name,cls='ac-icon')=>`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]||''}</svg>`;

  const STATUS_LABELS={ar:{waiting:'بانتظار الموعد',arrived:'وصل',early_arrival:'وصول مبكر',active:'قيد العلاج',done:'مكتمل',late:'متأخر',cancel:'ملغي',left:'غادر',asks_delay:'يطلب تأخيرًا'},en:{waiting:'Waiting',arrived:'Arrived',early_arrival:'Early',active:'In treatment',done:'Done',late:'Late',cancel:'Cancelled',left:'Left',asks_delay:'Asks delay'}};
  const LAB_LABELS={ar:{pending_send:'بانتظار الإرسال',sent_coordination:'لدى التنسيق',sent:'سُلّمت للمعمل',in_production:'قيد التصنيع',ready_at_lab:'جاهزة بالمعمل',received_clinic:'وصلت للعيادة',delivered_coordination:'سُلّمت للتنسيق',delivered_patient:'سُلّمت للمريض',needs_adjustment:'تحتاج تعديلًا',returned_lab:'أُعيدت للمعمل',cancelled:'ملغاة'},en:{pending_send:'Waiting to send',sent_coordination:'At coordination',sent:'Sent',in_production:'In production',ready_at_lab:'Ready at lab',received_clinic:'At clinic',delivered_coordination:'At coordination',delivered_patient:'Delivered',needs_adjustment:'Needs adjustment',returned_lab:'Returned',cancelled:'Cancelled'}};
  const COPY={
    ar:{kicker:'العداد الشامل · جميع العيادات',title:'نبض العيادات',live:'مباشر',updated:'آخر تحديث',ago:s=>s<10?'الآن':s<60?`قبل ${n(s)} ث`:`قبل ${n(Math.floor(s/60))} د`,loading:'جارٍ الحساب…',error:'تعذر التحديث — ستُعاد المحاولة تلقائيًا',
      ranges:{today:'اليوم',yesterday:'أمس',week:'7 أيام',month:'هذا الشهر',days30:'30 يومًا'},allClinics:'جميع العيادات',refresh:'تحديث',details:'التقرير الكامل',
      compare:{today:'مقارنة بأمس',yesterday:'مقارنة بقبل أمس',other:'مقارنة بالفترة السابقة'},same:'بدون تغيير',
      ring:'نسبة الإنجاز',ringSub:s=>`${n(s.completed)} من ${n(Math.max(0,s.appointments-s.cancelled))} موعدًا فعّالًا`,
      tiles:{uniquePatients:'المرضى',procedureUnits:'الإجراءات المنفذة',labSent:'أُرسلت للمعمل',completed:'المواعيد المكتملة',appointments:'إجمالي المواعيد',cancelled:'الملغاة',labOverdue:'معمل متأخر',labWaitingToSend:'بانتظار الإرسال للمعمل'},
      sub:{uniquePatients:s=>`${n(s.treatedPatients)} أكمل علاجه`,procedureUnits:s=>`في ${n(s.visitsWithProcedures)} زيارة · ${n(s.procedureFreeUnits)} مجاني`,labSent:s=>`${n(s.labSentUnits)} وحدة · سُلّم ${n(s.labDelivered)}`,completed:s=>`متوسط البقاء ${n(s.averageStayMinutes)} د`,appointments:s=>`${n(s.appointments-s.cancelled)} فعّال`,cancelled:s=>s.appointments?`${n(Math.round(s.cancelled/s.appointments*100))}% من المواعيد`:'خلال الفترة',labOverdue:()=>'تجاوزت الموعد المتوقع',labWaitingToSend:()=>'مسجلة ولم تُرسل'},
      now:'الآن',tapHint:'اضغط أي بطاقة لعرض تفاصيلها هنا',close:'إغلاق التفاصيل',
      drill:{byType:'حسب نوع الإجراء',byClinic:'حسب العيادة',topProcedures:'الإجراءات الأكثر تنفيذًا',labWork:'الأعمال المرسلة',vendors:'المعامل',statuses:'حالات المواعيد',labStatuses:'مراحل حالات المعمل',attention:{overdue:'حالات متأخرة',waiting:'بانتظار الإرسال'},noData:'لا توجد بيانات في هذه الفترة.',visits:v=>`${n(v)} زيارة`,units:v=>`${n(v)} وحدة`,expected:d=>`المتوقع ${d}`,created:d=>`سُجلت ${d}`,openClinic:'عرض هذه العيادة فقط',rate:'الإنجاز'},
      clinicRow:c=>`${n(c.treatedPatients)} مريض · ${n(c.procedures)} إجراء · ${n(c.labSent)} معمل`,
      totalTitle:'الإجمالي منذ البداية',totalSince:m=>`منذ ${m} حتى اليوم`,monthsTitle:'الأداء الشهري',monthsHint:'اضغط أي شهر لعرضه في العداد',monthsLoading:'جارٍ تجميع الأشهر…',monthsError:'تعذر تحميل الأشهر.',
      totals:{uniquePatients:'إجمالي المرضى',procedureUnits:'إجمالي الإجراءات',labSent:'إجمالي المرسل للمعمل',completed:'إجمالي المكتمل'},
      metrics:{procedureUnits:'الإجراءات',uniquePatients:'المرضى',labSent:'المعمل',completed:'المكتمل'},table:'جدول',chart:'رسم',fold:'طيّ العداد',expand:'عرض العداد',show:'عرض',hide:'إخفاء',customMonth:m=>m,
      cols:{month:'الشهر',patients:'المرضى',procedures:'الإجراءات',lab:'المعمل',completed:'المكتمل',rate:'الإنجاز'}},
    en:{kicker:'Complete counter · all clinics',title:'Clinic pulse',live:'Live',updated:'Updated',ago:s=>s<10?'now':s<60?`${s}s ago`:`${Math.floor(s/60)}m ago`,loading:'Calculating…',error:'Could not refresh — retrying automatically',
      ranges:{today:'Today',yesterday:'Yesterday',week:'7 days',month:'This month',days30:'30 days'},allClinics:'All clinics',refresh:'Refresh',details:'Full report',
      compare:{today:'vs yesterday',yesterday:'vs the day before',other:'vs previous period'},same:'No change',
      ring:'Completion',ringSub:s=>`${n(s.completed)} of ${n(Math.max(0,s.appointments-s.cancelled))} active visits`,
      tiles:{uniquePatients:'Patients',procedureUnits:'Procedures done',labSent:'Sent to lab',completed:'Completed visits',appointments:'Appointments',cancelled:'Cancelled',labOverdue:'Lab overdue',labWaitingToSend:'Awaiting lab dispatch'},
      sub:{uniquePatients:s=>`${n(s.treatedPatients)} treated`,procedureUnits:s=>`${n(s.visitsWithProcedures)} visits · ${n(s.procedureFreeUnits)} free`,labSent:s=>`${n(s.labSentUnits)} units · ${n(s.labDelivered)} delivered`,completed:s=>`avg stay ${n(s.averageStayMinutes)} min`,appointments:s=>`${n(s.appointments-s.cancelled)} active`,cancelled:s=>s.appointments?`${n(Math.round(s.cancelled/s.appointments*100))}% of visits`:'in this period',labOverdue:()=>'past expected date',labWaitingToSend:()=>'recorded, not sent'},
      now:'Now',tapHint:'Tap any card to see its breakdown here',close:'Close details',
      drill:{byType:'By procedure type',byClinic:'By clinic',topProcedures:'Top procedures',labWork:'Work sent',vendors:'Laboratories',statuses:'Visit statuses',labStatuses:'Lab stages',attention:{overdue:'Overdue cases',waiting:'Waiting to send'},noData:'No data in this period.',visits:v=>`${n(v)} visits`,units:v=>`${n(v)} units`,expected:d=>`expected ${d}`,created:d=>`recorded ${d}`,openClinic:'Show this clinic only',rate:'Done'},
      clinicRow:c=>`${n(c.treatedPatients)} patients · ${n(c.procedures)} procedures · ${n(c.labSent)} lab`,
      totalTitle:'All-time total',totalSince:m=>`since ${m}`,monthsTitle:'Monthly performance',monthsHint:'Tap a month to open it in the counter',monthsLoading:'Building months…',monthsError:'Could not load months.',
      totals:{uniquePatients:'Total patients',procedureUnits:'Total procedures',labSent:'Total sent to lab',completed:'Total completed'},
      metrics:{procedureUnits:'Procedures',uniquePatients:'Patients',labSent:'Lab',completed:'Completed'},table:'Table',chart:'Chart',fold:'Fold counter',expand:'Show counter',show:'Show',hide:'Hide',customMonth:m=>m,
      cols:{month:'Month',patients:'Patients',procedures:'Procedures',lab:'Lab',completed:'Completed',rate:'Done'}}
  };
  const TILE_ORDER=['uniquePatients','procedureUnits','labSent','completed','appointments','cancelled','labOverdue','labWaitingToSend'];
  const SNAPSHOT=new Set(['labOverdue','labWaitingToSend']);
  const UP_IS_BAD=new Set(['cancelled','labOverdue','labWaitingToSend']);
  const SPARK={procedureUnits:'procedures',labSent:'labSent',completed:'completed',appointments:'appointments',cancelled:'cancelled'};
  const TONES={uniquePatients:'navy',procedureUnits:'gold',labSent:'blue',completed:'green',appointments:'teal',cancelled:'red',labOverdue:'red',labWaitingToSend:'orange'};
  const state={folded:(()=>{try{return localStorage.getItem('bestcare_counter_folded')==='1'}catch{return false}})(),monthsOpen:(()=>{try{return localStorage.getItem('bestcare_counter_months_open')==='1'}catch{return false}})(),range:'today',custom:null,clinic:'all',data:null,prev:null,months:null,monthsError:'',monthMetric:'procedureUnits',monthView:'chart',focus:null,loading:false,error:'',requestId:0,monthsRequestId:0,started:false,clinics:[],version:'',changeTimer:null,tickTimer:null,shown:{},changed:new Set()};

  const lng=()=>String(document.documentElement.lang||'').toLowerCase().startsWith('en')?'en':'ar';
  const t=()=>COPY[lng()];
  const locale=()=>lng()==='en'?'en-US':'ar-SA';
  function n(value){return new Intl.NumberFormat(locale()).format(Number(value)||0)}
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const monthLabel=(month,style='long')=>new Intl.DateTimeFormat(locale(),{month:style,year:style==='long'?'numeric':undefined,timeZone:'UTC'}).format(new Date(`${month}-01T00:00:00Z`));
  const dayLabel=date=>new Intl.DateTimeFormat(locale(),{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${date}T00:00:00Z`));
  const stampLabel=at=>at>0?new Intl.DateTimeFormat(locale(),{day:'numeric',month:'short',timeZone:'Asia/Riyadh'}).format(new Date(at)):'—';
  const riyadhToday=()=>{const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const read=type=>parts.find(part=>part.type===type)?.value||'';return`${read('year')}-${read('month')}-${read('day')}`};
  const shift=(date,days)=>new Date(Date.parse(`${date}T00:00:00Z`)+days*86_400_000).toISOString().slice(0,10);
  const span=(from,to)=>Math.round((Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86_400_000)+1;
  const monthEnd=month=>new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
  function rangeDates(range=state.range){
    const today=riyadhToday();
    if(range==='custom'&&state.custom){const end=monthEnd(state.custom);return{from:`${state.custom}-01`,to:end<today?end:today}}
    if(range==='yesterday'){const day=shift(today,-1);return{from:day,to:day}}
    if(range==='week')return{from:shift(today,-6),to:today};
    if(range==='days30')return{from:shift(today,-29),to:today};
    if(range==='month')return{from:`${today.slice(0,8)}01`,to:today};
    return{from:today,to:today};
  }
  const periodLabel=()=>{const{from,to}=rangeDates();if(state.range==='custom')return monthLabel(state.custom);return from===to?dayLabel(from):`${dayLabel(from)} – ${dayLabel(to)}`};
  const detailsUrl=()=>{const{from,to}=rangeDates();return`./statistics.html?from=${from}&to=${to}&clinic=${encodeURIComponent(state.clinic)}`};
  const clinicName=id=>{const clinic=state.clinics.find(item=>String(item.id)===id)||(state.data?.clinics||[]).find(item=>item.clinicId===id);return clinic?`${clinic.name||''} · ${clinic.roomNumber||''}`:id};

  // ---------- rendering helpers ----------
  function deltaBadge(key){
    if(SNAPSHOT.has(key)||!state.prev?.summary||!state.data?.summary)return'';
    const cur=Number(state.data.summary[key])||0,prev=Number(state.prev.summary[key])||0,diff=cur-prev;
    const copy=t(),compare=state.range==='today'?copy.compare.today:state.range==='yesterday'?copy.compare.yesterday:copy.compare.other;
    if(!diff)return`<span class="ac-delta is-flat" title="${esc(compare)}">${esc(copy.same)}</span>`;
    const good=UP_IS_BAD.has(key)?diff<0:diff>0;
    const pct=prev?`<small><bdi>${new Intl.NumberFormat(locale(),{style:'percent',maximumFractionDigits:0}).format(Math.abs(diff)/prev)}</bdi></small>`:'';
    return`<span class="ac-delta ${good?'is-good':'is-bad'}" title="${esc(compare)}: ${n(prev)}"><span aria-hidden="true">${diff>0?'▲':'▼'}</span><bdi>${n(Math.abs(diff))}</bdi>${pct}</span>`;
  }
  function sparkline(key){
    const field=SPARK[key],daily=state.data?.daily||[];
    if(!field||daily.length<2)return'';
    const values=daily.map(item=>Number(item[field])||0),max=Math.max(1,...values),w=120,h=30,step=w/(values.length-1);
    const points=values.map((value,index)=>`${(w-index*step).toFixed(1)},${(h-2-value/max*(h-6)).toFixed(1)}`);
    return`<svg class="ac-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${w},${h} ${points.join(' ')} 0,${h}" class="ac-spark-fill"/><polyline points="${points.join(' ')}" class="ac-spark-line"/></svg>`;
  }
  function bars(rows,{unit,empty,tone='',onPick}={}){
    if(!rows.length)return`<p class="ac-empty">${esc(empty||t().drill.noData)}</p>`;
    const max=Math.max(1,...rows.map(row=>row.value));
    return`<div class="ac-bars">${rows.map((row,index)=>`<${onPick&&row.id?'button type="button"':'div'} class="ac-bar-row"${onPick&&row.id?` data-pick="${esc(row.id)}" title="${esc(t().drill.openClinic)}"`:''}><span class="ac-bar-label"><b>${esc(row.label)}</b>${row.note?`<small>${esc(row.note)}</small>`:''}</span><span class="ac-bar-track"><i class="${tone}" style="width:${(row.value/max*100).toFixed(1)}%;--i:${index}"></i></span><em>${n(row.value)}${unit?` ${esc(unit)}`:''}</em></${onPick&&row.id?'button':'div'}>`).join('')}</div>`;
  }
  const clinicRows=field=>(state.data?.clinics||[]).map(item=>({id:item.clinicId,label:`${item.name||''} · ${item.roomNumber||''}`,value:Number(item[field])||0,note:item.doctorName?`د. ${item.doctorName}`:''})).filter(row=>row.value).sort((a,b)=>b.value-a.value);
  function drillContent(key){
    const d=t().drill,data=state.data||{},s=data.summary||{},pick=state.clinic==='all';
    const section=(title,body)=>`<section class="ac-drill-block"><h4>${esc(title)}</h4>${body}</section>`;
    const statusRows=(counts,labels)=>Object.entries(counts||{}).filter(([,value])=>Number(value)>0).map(([status,value])=>({label:labels[status]||status,value:Number(value)})).sort((a,b)=>b.value-a.value);
    if(key==='uniquePatients')return section(d.byClinic,bars(clinicRows('treatedPatients'),{onPick:pick}))+section(d.statuses,bars(statusRows(data.statusCounts,STATUS_LABELS[lng()]),{tone:'teal'}));
    if(key==='procedureUnits')return section(d.byType,bars((data.procedureTypes||[]).map(item=>({label:lng()==='en'?item.en:item.label,value:Number(item.count)||0,note:`${n(item.share)}% · ${lng()==='en'?`${n(item.patients)} patients`:`${n(item.patients)} مريض`}`})),{tone:'gold'}))+section(d.topProcedures,bars((data.topProcedures||[]).map(item=>({label:item.name,value:Number(item.count)||0,note:d.visits(item.visits)+(Number(item.free)?` · ${n(item.free)} ${lng()==='en'?'free':'مجاني'}`:'')})),{tone:'gold'}))+section(d.byClinic,bars(clinicRows('procedures'),{tone:'gold',onPick:pick}));
    if(key==='labSent')return section(d.labWork,bars((data.topLabWork||[]).map(item=>({label:item.name,value:Number(item.count)||0})),{tone:'blue',unit:lng()==='en'?'units':'وحدة'}))+section(d.vendors,bars((data.labVendors||[]).map(item=>({label:item.name,value:Number(item.count)||0,note:d.units(item.units)})),{tone:'blue'}))+section(d.byClinic,bars(clinicRows('labSent'),{tone:'blue',onPick:pick}));
    if(key==='completed'){
      const rows=(data.clinics||[]).map(item=>{const active=Math.max(0,Number(item.appointments)-Number(item.cancelled));return{id:item.clinicId,label:`${item.name||''} · ${item.roomNumber||''}`,value:Number(item.completed)||0,note:`${d.rate} ${active?n(Math.round(item.completed/active*100)):0}%${item.stayMeasured?` · ${n(item.averageStayMinutes)} ${lng()==='en'?'min':'د'}`:''}`}}).filter(row=>row.value).sort((a,b)=>b.value-a.value);
      return section(d.byClinic,bars(rows,{tone:'green',onPick:pick}));
    }
    if(key==='appointments')return section(d.statuses,bars(statusRows(data.statusCounts,STATUS_LABELS[lng()]),{tone:'teal'}))+section(d.byClinic,bars(clinicRows('appointments'),{tone:'teal',onPick:pick}));
    if(key==='cancelled')return section(d.byClinic,bars(clinicRows('cancelled'),{tone:'red',onPick:pick}));
    const reason=key==='labOverdue'?'overdue':'waiting',items=(data.labAttention||[]).filter(item=>item.reason===reason);
    const list=items.length?`<ul class="ac-cases">${items.map(item=>`<li><span class="ac-case-dot ${reason}"></span><div><b>${esc(item.patientName||'—')}${item.patientFile?` <small>#${esc(item.patientFile)}</small>`:''}</b><small>${esc(clinicName(item.clinicId))}${item.labName?` · ${esc(item.labName)}`:''}${item.work?` · ${esc(item.work)}`:''}</small></div><em>${esc(reason==='overdue'?d.expected(stampLabel(item.expectedAt)):d.created(stampLabel(item.createdAt)))}<small>${esc(LAB_LABELS[lng()][item.status]||item.status)}</small></em></li>`).join('')}</ul>`:`<p class="ac-empty">${esc(d.noData)}</p>`;
    return section(d.attention[reason],list)+section(d.labStatuses,bars(statusRows(data.labStatusCounts,LAB_LABELS[lng()]),{tone:'blue'}));
  }
  function monthsSection(){
    const copy=t(),report=state.months,total=report?.total,months=(report?.months||[]).slice(0,state.monthView==='chart'?18:120);
    const totalsHtml=['uniquePatients','procedureUnits','labSent','completed'].map(key=>`<div class="ac-total tone-${TONES[key]}">${icon(key)}<span>${esc(copy.totals[key])}</span><strong data-count="total-${key}" data-value="${total?Number(total[key])||0:''}">${total?n(total[key]):'—'}</strong>${total?`<small>${esc(key==='uniquePatients'?copy.sub.uniquePatients(total):key==='labSent'?copy.sub.labSent(total):key==='completed'?`${copy.ring} ${n(total.completionRate)}%`:copy.sub.procedureUnits(total))}</small>`:''}</div>`).join('');
    const head=`<div class="ac-months-head"><div><h3>${esc(copy.totalTitle)}</h3><small>${esc(total?copy.totalSince(monthLabel(total.firstMonth)):state.monthsError?copy.monthsError:copy.monthsLoading)}</small></div></div><div class="ac-totals">${totalsHtml}</div>${total?.typeList?.length?`<div class="ac-type-chips">${total.typeList.map(t=>`<span><b>${n(t.count)}</b>${esc(lng()==='en'?t.en:t.label)}</span>`).join('')}</div>`:''}`;
    if(!months.length)return head;
    const current=riyadhToday().slice(0,7),selected=state.range==='custom'?state.custom:state.range==='month'?current:'';
    const metricSwitch=`<div class="ac-seg ac-seg-small" role="group">${Object.entries(copy.metrics).map(([key,label])=>`<button type="button" data-metric="${key}" class="${state.monthMetric===key?'active':''}" aria-pressed="${state.monthMetric===key}">${esc(label)}</button>`).join('')}</div><div class="ac-seg ac-seg-small" role="group"><button type="button" data-month-view="chart" class="${state.monthView==='chart'?'active':''}">${esc(copy.chart)}</button><button type="button" data-month-view="table" class="${state.monthView==='table'?'active':''}">${esc(copy.table)}</button></div>`;
    let body;
    if(state.monthView==='chart'){
      const ordered=[...months].reverse(),max=Math.max(1,...ordered.map(item=>Number(item[state.monthMetric])||0));
      body=`<div class="ac-chart" role="list">${ordered.map((item,index)=>{const value=Number(item[state.monthMetric])||0;return`<button type="button" role="listitem" class="ac-col${item.month===selected?' is-selected':''}${item.month===current?' is-current':''}" data-month="${item.month}" aria-label="${esc(monthLabel(item.month))}: ${n(value)}"><span class="ac-col-value">${n(value)}</span><span class="ac-col-bar"><i class="tone-${TONES[state.monthMetric]}" style="height:${Math.max(value?4:0,value/max*100).toFixed(1)}%;--i:${index}"></i></span><span class="ac-col-label">${esc(monthLabel(item.month,'short'))}</span><span class="ac-tip"><b>${esc(monthLabel(item.month))}</b><span>${esc(copy.cols.patients)}: ${n(item.uniquePatients)}</span><span>${esc(copy.cols.procedures)}: ${n(item.procedureUnits)}</span><span>${esc(copy.cols.lab)}: ${n(item.labSent)}</span><span>${esc(copy.cols.completed)}: ${n(item.completed)} · ${n(item.completionRate)}%</span></span></button>`}).join('')}</div><div class="ac-readout" data-readout aria-live="polite"></div>`;
    }else{
      body=`<div class="ac-table-wrap"><table class="ac-table"><thead><tr>${['month','patients','procedures','lab','completed','rate'].map(col=>`<th>${esc(copy.cols[col])}</th>`).join('')}</tr></thead><tbody>${months.map(item=>`<tr data-month="${item.month}" tabindex="0" class="${item.month===selected?'is-selected':''}"><th scope="row">${esc(monthLabel(item.month))}</th><td>${n(item.uniquePatients)}</td><td>${n(item.procedureUnits)}</td><td>${n(item.labSent)}</td><td>${n(item.completed)}</td><td>${n(item.completionRate)}%</td></tr>`).join('')}</tbody></table></div>`;
    }
    return`${head}<div class="ac-months-bar"><div><h3>${esc(copy.monthsTitle)}</h3><small>${esc(copy.monthsHint)}</small></div><div class="ac-months-tools">${metricSwitch}</div></div>${body}`;
  }
  function render(){
    const copy=t(),s=state.data?.summary;
    const rangeButtons=Object.entries(copy.ranges).map(([key,label])=>`<button type="button" data-range="${key}" class="${key===state.range?'active':''}" aria-pressed="${key===state.range}">${esc(label)}</button>`).join('')+(state.range==='custom'?`<button type="button" class="active" aria-pressed="true">${esc(monthLabel(state.custom))}</button>`:'');
    const options=[{id:'all',label:copy.allClinics},...state.clinics.map(item=>({id:String(item.id),label:`${item.name||''} · ${item.roomNumber||''}${item.doctorName?` · د. ${item.doctorName}`:''}`}))].map(option=>`<option value="${esc(option.id)}"${option.id===state.clinic?' selected':''}>${esc(option.label)}</option>`).join('');
    const rate=Number(s?.completionRate)||0;
    const hero=`<div class="ac-hero">
      <div class="ac-hero-copy"><small>${esc(copy.kicker)}</small><h2>${esc(copy.title)}</h2>
        <div class="ac-hero-meta"><span class="ac-live${state.error?' is-error':''}${state.loading?' is-loading':''}" role="status"><i></i>${esc(state.error?copy.error:state.loading&&!s?copy.loading:copy.live)}</span><span class="ac-period">${esc(periodLabel())}${state.clinic!=='all'?` · ${esc(clinicName(state.clinic))}`:''}</span><span class="ac-ago" data-ago></span>${verdictPill()}</div>
        ${state.folded&&s?`<div class="ac-mini">${['uniquePatients','procedureUnits','labSent','completed'].map(key=>`<span><b>${n(s[key])}</b>${esc(copy.tiles[key])}</span>`).join('')}</div>`:''}
      </div>
      <div class="ac-ring" style="--p:${rate}" title="${esc(copy.ring)}"><div><strong data-count="ring" data-value="${s?rate:''}">${s?n(rate):'—'}</strong><span>%</span></div><small>${esc(copy.ring)}</small>${s?`<em>${esc(copy.ringSub(s))}</em>`:''}</div>
      <div class="ac-controls"><div class="ac-seg" role="group">${rangeButtons}</div>
        <div class="ac-controls-row"><select class="ac-select" aria-label="${esc(copy.allClinics)}">${options}</select><button type="button" class="ac-btn" data-action="refresh" ${state.loading?'disabled':''} title="${esc(copy.refresh)}">${icon('refresh','ac-icon ac-spin')}<span>${esc(copy.refresh)}</span></button><a class="ac-btn ac-btn-light" href="${esc(detailsUrl())}" target="_blank" rel="noopener">${icon('external')}<span>${esc(copy.details)}</span></a><button type="button" class="ac-btn" data-action="fold" aria-expanded="${!state.folded}">${esc(state.folded?copy.expand:copy.fold)}</button></div>
      </div>
    </div>`;
    const tiles=TILE_ORDER.map(key=>{
      const value=s?Number(s[key])||0:null,attention=s&&UP_IS_BAD.has(key)&&value>0;
      return`<button type="button" class="ac-tile tone-${TONES[key]}${state.focus===key?' is-open':''}${attention?' needs-attention':''}${state.changed.has(key)?' just-changed':''}" data-tile="${key}" aria-expanded="${state.focus===key}">
        <span class="ac-tile-top"><span class="ac-tile-icon">${icon(key)}</span><span class="ac-tile-label">${esc(copy.tiles[key])}</span>${SNAPSHOT.has(key)?`<span class="ac-now">${esc(copy.now)}</span>`:deltaBadge(key)}</span>
        <strong data-count="${key}" data-value="${value??''}">${s?n(value):'—'}</strong>
        <small>${s?esc(copy.sub[key](s)):'&nbsp;'}</small>${sparkline(key)}</button>`;
    }).join('');
    const drill=state.focus&&s?`<div class="ac-drill tone-${TONES[state.focus]}"><div class="ac-drill-head"><h3>${icon(state.focus)}${esc(copy.tiles[state.focus])} <span>${n(s[state.focus])}</span></h3><button type="button" class="ac-close" data-action="close" aria-label="${esc(copy.close)}">${icon('close')}</button></div><div class="ac-drill-grid">${drillContent(state.focus)}</div></div>`:`<p class="ac-hint">${esc(copy.tapHint)}</p>`;
    const monthsToggle=`<button type="button" class="ac-months-toggle" data-action="months" aria-expanded="${state.monthsOpen}"><span>${icon('appointments')}${esc(copy.totalTitle)} · ${esc(copy.monthsTitle)}</span><b>${esc(state.monthsOpen?copy.hide:copy.show)}</b></button>`;
    root.classList.toggle('is-folded',state.folded);
    root.innerHTML=state.folded?hero:`${hero}<div class="ac-tiles">${tiles}</div>${drill}${monthsToggle}${state.monthsOpen?`<div class="ac-months">${monthsSection()}</div>`:''}`;
    root.setAttribute('aria-busy',String(state.loading));
    document.body.classList.toggle('admin-counter-ready',Boolean(state.data));
    animateCounts();updateAgo();scrollChartToLatest();showReadout(root.querySelector('.ac-col.is-selected')||[...root.querySelectorAll('.ac-col')].pop());
  }
  function scrollChartToLatest(){const chart=root.querySelector('.ac-chart');if(!chart||chart.scrollWidth<=chart.clientWidth)return;const rtl=getComputedStyle(chart).direction==='rtl';chart.scrollLeft=rtl?-chart.scrollWidth:chart.scrollWidth}
  function showReadout(col){
    const out=root.querySelector('[data-readout]');if(!out||!col)return;
    const item=(state.months?.months||[]).find(entry=>entry.month===col.dataset.month);if(!item)return;
    const c=t().cols;
    out.innerHTML=`<b>${esc(monthLabel(item.month))}</b><span>${esc(c.patients)}: <strong>${n(item.uniquePatients)}</strong></span><span>${esc(c.procedures)}: <strong>${n(item.procedureUnits)}</strong></span><span>${esc(c.lab)}: <strong>${n(item.labSent)}</strong></span><span>${esc(c.completed)}: <strong>${n(item.completed)}</strong> · ${n(item.completionRate)}%</span>`;
  }
  // Overall direction vs the previous period (shared engine from trends.js).
  function verdictPill(){
    const T=window.BestCareTrends;if(!T||!state.data?.summary||!state.prev?.summary)return'';
    const result=T.compareSummaries(state.data.summary,state.prev.summary);
    const en=lng()==='en',copy={improving:[en?'Improving':'تحسّن عام','▲'],declining:[en?'Declining':'انخفاض عام','▼'],stable:[en?'Stable':'أداء مستقر','＝'],insufficient:[en?'Too little data':'بيانات قليلة للحكم','·']}[result.verdict];
    const compare=state.range==='today'?(en?'vs yesterday':'مقارنة بأمس'):(en?'vs previous period':'مقارنة بالفترة السابقة');
    const reasons=[...result.improving.slice(0,2).map(r=>`▲ ${en?r.en:r.label}`),...result.declining.slice(0,2).map(r=>`▼ ${en?r.en:r.label}`)].join(' · ');
    return`<span class="ac-verdict is-${result.verdict}" title="${esc(reasons||compare)}"><b>${copy[1]} ${esc(copy[0])}</b>${result.verdict==='insufficient'?'':` <bdi>${result.score>0?'+':''}${n(result.score)}</bdi>`} <small>${esc(compare)}</small></span>`;
  }
  // trends.js is shared with the statistics page; load it once, lazily.
  if(!window.BestCareTrends){const script=document.createElement('script');script.src='./trends.js?v=20261121';script.async=true;script.onload=()=>{if(state.started)render()};document.head.append(script)}
  function animateCounts(){
    root.querySelectorAll('[data-count]').forEach(node=>{
      const key=node.dataset.count,raw=node.dataset.value;if(raw==='')return;
      const target=Number(raw),from=state.shown[key];state.shown[key]=target;
      if(from===undefined||from===target||reduceMotion())return;
      const start=performance.now(),duration=750;
      const step=now=>{const p=Math.min(1,(now-start)/duration),eased=1-Math.pow(1-p,3);node.textContent=n(Math.round(from+(target-from)*eased));if(p<1&&node.isConnected)requestAnimationFrame(step)};
      requestAnimationFrame(step);
    });
  }
  function updateAgo(){const node=root.querySelector('[data-ago]');if(!node||!state.data)return;const seconds=Math.max(0,Math.round((Date.now()-Number(state.data.generatedAt||Date.now()))/1000));node.textContent=`${t().updated} ${t().ago(seconds)}`}

  // ---------- interactions ----------
  root.addEventListener('click',event=>{
    const target=event.target.closest('button,[data-month]');if(!target||!root.contains(target))return;
    if(target.dataset.range){setRange(target.dataset.range);return}
    if(target.dataset.tile){state.focus=state.focus===target.dataset.tile?null:target.dataset.tile;render();if(state.focus)root.querySelector('.ac-drill')?.scrollIntoView({behavior:reduceMotion()?'auto':'smooth',block:'nearest'});return}
    if(target.dataset.pick){state.clinic=target.dataset.pick;resetAndLoad();return}
    if(target.dataset.metric){state.monthMetric=target.dataset.metric;render();return}
    if(target.dataset.monthView){state.monthView=target.dataset.monthView;render();return}
    if(target.dataset.month){const current=riyadhToday().slice(0,7);target.dataset.month===current?setRange('month'):setRange('custom',target.dataset.month);root.scrollIntoView({behavior:reduceMotion()?'auto':'smooth',block:'start'});return}
    if(target.dataset.action==='close'){state.focus=null;render();return}
    if(target.dataset.action==='fold'){state.folded=!state.folded;try{localStorage.setItem('bestcare_counter_folded',state.folded?'1':'0')}catch{}render();return}
    if(target.dataset.action==='months'){state.monthsOpen=!state.monthsOpen;try{localStorage.setItem('bestcare_counter_months_open',state.monthsOpen?'1':'0')}catch{}if(state.monthsOpen&&!state.months)loadMonths();render();return}
    if(target.dataset.action==='refresh'){load();if(state.monthsOpen)loadMonths()}
  });
  root.addEventListener('pointerover',event=>{const col=event.target.closest?.('.ac-col');if(col)showReadout(col)});
  root.addEventListener('focusin',event=>{const col=event.target.closest?.('.ac-col');if(col)showReadout(col)});
  root.addEventListener('keydown',event=>{const row=event.target.closest?.('tr[data-month]');if(row&&(event.key==='Enter'||event.key===' ')){event.preventDefault();row.click()}});
  root.addEventListener('change',event=>{if(event.target.matches('.ac-select')){state.clinic=event.target.value;resetAndLoad()}});
  function resetAndLoad(){state.shown={};state.months=null;load();if(state.monthsOpen)loadMonths()}
  function setRange(range,custom=null){state.range=range;state.custom=custom;state.shown={};load()}

  // ---------- data ----------
  const api=async(query,timeout=20_000)=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await nativeFetch(`/api/statistics?${query}`,{credentials:'include',cache:'no-store',signal:controller.signal});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'statistics unavailable');
      return data;
    }finally{clearTimeout(timer)}
  };
  async function load({silent=false}={}){
    const requestId=++state.requestId,{from,to}=rangeDates(),clinic=encodeURIComponent(state.clinic);
    state.lastLoadAt=Date.now();state.pending=false;
    state.loading=true;if(!silent){state.error='';render()}
    try{
      const data=await api(`from=${from}&to=${to}&clinic=${clinic}&compare=1`),previous=data.previous?{summary:data.previous.summary}:null;
      if(requestId!==state.requestId)return;
      const before=state.data?.summary,summary=data.summary||{};
      state.changed=new Set(before&&silent?TILE_ORDER.filter(key=>Number(before[key])!==Number(summary[key])):[]);
      state.data=data;state.prev=previous;state.error='';
      if(state.changed.size)setTimeout(()=>{state.changed.clear();root.querySelectorAll('.just-changed').forEach(node=>node.classList.remove('just-changed'))},2600);
    }catch(error){if(requestId===state.requestId){state.error=String(error?.message||error);console.warn('Admin counter unavailable',error)}}
    finally{if(requestId===state.requestId){state.loading=false;render()}}
  }
  async function loadMonths(){
    const requestId=++state.monthsRequestId;
    try{
      const data=await api(`mode=months&clinic=${encodeURIComponent(state.clinic)}`,45_000);
      if(requestId!==state.monthsRequestId)return;
      state.months=data;state.monthsError='';state.monthsLoadedAt=Date.now();
    }catch(error){if(requestId===state.monthsRequestId){state.monthsError=String(error?.message||error);console.warn('Admin counter months unavailable',error)}}
    finally{if(requestId===state.monthsRequestId&&state.started)render()}
  }
  function dataChanged(delay=900){
    if(!state.started)return;
    // Hidden page: remember the change and refresh once when it is visible again.
    if(document.hidden){state.pending=true;return}
    clearTimeout(state.changeTimer);
    const wait=Math.max(delay,Number(state.lastLoadAt||0)+MIN_REFRESH_GAP_MS-Date.now());
    state.changeTimer=setTimeout(()=>{
      load({silent:true});
      if(state.monthsOpen&&Date.now()-Number(state.monthsLoadedAt||0)>MONTHS_MIN_GAP_MS)loadMonths();
    },wait);
  }
  // Fingerprints of data the dashboard already fetches; a different fingerprint means real change.
  const fingerprints=new Map();
  function fingerprint(path,data){
    if(Array.isArray(data?.records))return data.records.map(record=>`${record.clinicId}:${record.revision}:${record.updatedAt}:${(record.patients||[]).length}`).join('|');
    if(Array.isArray(data?.cases))return`${data.revision||''}:${data.updatedAt||''}:${data.cases.map(item=>`${item.id}:${item.status}:${item.sentAt||0}`).join(',')}`;
    if(Array.isArray(data?.patients))return`${data.revision||''}:${data.updatedAt||''}:${data.patients.length}`;
    return'';
  }
  function observeRead(url,response){
    if(!response.ok)return;
    response.clone().json().then(data=>{
      const key=`${url.pathname}?${url.searchParams.get('clinic')||''}&${url.searchParams.get('scope')||''}&${url.searchParams.get('date')||''}`;
      const print=fingerprint(url.pathname,data);if(!print)return;
      const before=fingerprints.get(key);fingerprints.set(key,print);
      if(before!==undefined&&before!==print)dataChanged(500);
    }).catch(()=>{});
  }
  const isAdminView=()=>{const body=document.body.classList;return body.contains('role-admin')&&!body.contains('view-clinic')&&!body.contains('auth-locked')&&!body.contains('auth-checking')};
  async function loadClinics(){
    try{const response=await nativeFetch('/api/clinics',{credentials:'include',cache:'no-store'}),data=await response.json().catch(()=>({}));
      if(response.ok)state.clinics=(Array.isArray(data.clinics)?data.clinics:[]).filter(item=>item&&item.active);}
    catch(error){console.warn('Admin counter clinics unavailable',error)}
    if(state.started)render();
  }
  function start(){
    if(state.started||!isAdminView())return;
    state.started=true;root.hidden=false;load();if(state.monthsOpen)loadMonths();loadClinics();
    clearInterval(state.tickTimer);state.tickTimer=setInterval(updateAgo,5000);
  }
  function stop(){root.hidden=true;state.started=false;clearInterval(state.tickTimer);clearTimeout(state.changeTimer);document.body.classList.remove('admin-counter-ready')}

  // Live triggers: saves on this device, other tabs, other devices (service worker relay).
  let channel=null;
  try{channel=new BroadcastChannel('bestcare-admin-counter');channel.onmessage=()=>dataChanged(300)}catch{}
  const nativeFetch=window.fetch.bind(window);
  window.fetch=function(input,init){
    const result=nativeFetch(input,init);
    try{
      const method=String(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
      const url=new URL(typeof input==='string'?input:input?.url||String(input),location.href);
      if(url.origin!==location.origin){}
      else if(method!=='GET'&&method!=='HEAD'&&method!=='OPTIONS'&&MUTATION_PATHS.some(path=>url.pathname.startsWith(path))){
        result.then(response=>{if(response.ok){dataChanged();try{channel?.postMessage(Date.now())}catch{}}}).catch(()=>{});
      }else if(method==='GET'&&state.started&&WATCHED_READS.some(path=>url.pathname.startsWith(path))){
        result.then(response=>observeRead(url,response)).catch(()=>{});
      }
    }catch{}
    return result;
  };
  navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='BESTCARE_REMOTE_SYNC')dataChanged(600)});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.started&&state.pending)dataChanged(0)});
  window.addEventListener('online',()=>{if(state.started)dataChanged(0)});
  new MutationObserver(()=>{if(state.started)render()}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  const check=()=>{if(isAdminView())start();else if(state.started&&document.body.classList.contains('auth-locked'))stop()};
  new MutationObserver(check).observe(document.body,{attributes:true,attributeFilter:['class']});
  check();
  window.bestCareAdminCounter={refresh:()=>dataChanged(0)};
})();

// ---- Admin page visual layer (no network requests) -------------------------
// Marks empty panels so CSS can compact them, makes the "completed" group
// collapsible, and lets the admin fold the counter. Purely presentational.
(()=>{
  const body=document.body;
  const store={get:key=>{try{return localStorage.getItem(key)}catch{return null}},set:(key,value)=>{try{localStorage.setItem(key,value)}catch{}}};
  const isAdmin=()=>body.classList.contains('role-admin')&&!body.classList.contains('view-clinic');
  const count=id=>Number(String(document.getElementById(id)?.textContent||'0').replace(/[^0-9]/g,''))||0;
  if(store.get('bestcare_admin_done_collapsed')==='1')body.classList.add('admin-done-collapsed');
  function markEmpty(){
    if(!isAdmin())return;
    document.getElementById('paymentPanel')?.classList.toggle('is-empty',count('paymentCount')===0);
    document.getElementById('adminQuickPlanInbox')?.classList.toggle('is-empty',count('adminQuickPlanPendingCount')===0&&count('adminQuickPlanReviewedCount')===0);
    enhancePatientList();
    const divider=document.querySelector('tr.admin-table-group-divider.completed');
    if(divider){
      let rows=0;for(let row=divider.nextElementSibling;row;row=row.nextElementSibling)if(row.matches('tr[class*="row-status-"]'))rows+=1;
      const label=divider.querySelector('td>span');if(label)label.dataset.count=String(rows);divider.dataset.count=String(rows);divider.setAttribute('role','button');divider.tabIndex=0;
      divider.setAttribute('aria-expanded',String(!body.classList.contains('admin-done-collapsed')));
    }
  }
  const setText=(node,text)=>{if(node&&node.textContent!==text)node.textContent=text};
  const en=()=>String(document.documentElement.lang||'').startsWith('en');
  // Unified plan warning + status chips with counts that filter the list.
  function enhancePatientList(){
    const wrap=document.querySelector('.table-wrap');const tbody=wrap?.querySelector('tbody');if(!wrap||!tbody)return;
    const filter=document.getElementById('filterStatus');
    const rows=[...tbody.querySelectorAll('tr[class*="row-status-"]')];
    if(!filter?.value){
      const counts={};rows.forEach(row=>{const key=(row.className.match(/row-status-([a-z_]+)/)||[])[1];if(key)counts[key]=(counts[key]||0)+1});
      document.querySelectorAll('#statusLegend .legend-chip').forEach(chip=>{const key=(chip.className.match(/legend-(?!chip\b)([a-z_]+)/)||[])[1];const value=String(counts[key]||0);if(chip.dataset.count!==value)chip.dataset.count=value});
    }
    document.querySelectorAll('#statusLegend .legend-chip').forEach(chip=>{
      const key=(chip.className.match(/legend-(?!chip\b)([a-z_]+)/)||[])[1];
      if(!chip.hasAttribute('role')){chip.setAttribute('role','button');chip.tabIndex=0}
      const active=Boolean(filter&&filter.value===key);if(chip.classList.contains('is-active')!==active)chip.classList.toggle('is-active',active);
    });
    let bar=document.getElementById('planAlertBar');
    const planRows=rows.filter(row=>row.querySelector('.plan-compliance-alert')).length;
    const filtering=body.classList.contains('admin-plan-filter');
    if(!bar){bar=document.createElement('div');bar.id='planAlertBar';bar.className='plan-alert-bar';bar.setAttribute('role','status');bar.innerHTML='<span class="plan-alert-icon" aria-hidden="true">⚠</span><span class="plan-alert-text"></span><button type="button" class="plan-alert-btn"></button>';wrap.before(bar)}
    const visible=planRows>0||filtering;if(bar.hidden===visible)bar.hidden=!visible;
    setText(bar.querySelector('.plan-alert-text'),en()?`${planRows} patients started treatment without an approved plan`:`${planRows} ${planRows===1?'مريض بدأ علاجه':'مرضى بدأ علاجهم'} ولم تُعتمد خطتهم بعد`);
    setText(bar.querySelector('.plan-alert-btn'),filtering?(en()?'Show everyone':'عرض الجميع'):(en()?'Show them only':'عرضهم فقط'));
  }
  document.addEventListener('click',event=>{
    if(event.target.closest?.('.plan-alert-btn')){body.classList.toggle('admin-plan-filter');markEmpty();return}
    const chip=event.target.closest?.('#statusLegend .legend-chip');
    if(chip&&isAdmin()){const key=(chip.className.match(/legend-(?!chip\b)([a-z_]+)/)||[])[1];const filter=document.getElementById('filterStatus');if(filter&&key&&[...filter.options].some(option=>option.value===key)){filter.value=filter.value===key?'':key;filter.dispatchEvent(new Event('change',{bubbles:true}))}}
  });
  document.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches?.('#statusLegend .legend-chip')){event.preventDefault();event.target.click()}});
  let scheduled=false;
  const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;markEmpty()})};
  new MutationObserver(schedule).observe(document.querySelector('main')||body,{childList:true,subtree:true,characterData:true});
  const toggleDone=()=>{body.classList.toggle('admin-done-collapsed');store.set('bestcare_admin_done_collapsed',body.classList.contains('admin-done-collapsed')?'1':'0');markEmpty()};
  document.addEventListener('click',event=>{if(event.target.closest?.('tr.admin-table-group-divider.completed'))toggleDone()});
  document.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches?.('tr.admin-table-group-divider.completed')){event.preventDefault();toggleDone()}});
  schedule();
})();
