// Comprehensive admin counter: live totals across all clinics (patients,
// procedures, lab cases) read from /api/statistics. Admin view only.
// Updates immediately after any save made on this device, when another device
// signals a change (push/service worker), and through a light change check.
(()=>{
  const root=document.getElementById('adminCounter');
  if(!root)return;
  const VERSION_POLL_MS=30_000;   // cheap etag check while the page is visible
  const SAFETY_REFRESH_MS=10*60_000;
  const MUTATION_PATHS=['/api/state','/api/lab-cases','/api/patients','/api/admin-patients','/api/patient-profile','/api/appointment-imports','/api/appointment-requests'];
  const COPY={
    ar:{kicker:'العداد الشامل',title:'أرقام العيادات بدقة',help:'يتحدث مباشرة مع كل إضافة مريض أو إجراء أو إرسال حالة للمعمل. اضغط أي رقم لفتح تفاصيله.',ranges:{today:'اليوم',yesterday:'أمس',week:'7 أيام',month:'هذا الشهر',days30:'30 يومًا'},allClinics:'جميع العيادات',refresh:'تحديث',details:'التفاصيل الكاملة',updated:'آخر تحديث',live:'مباشر',loading:'جارٍ الحساب…',error:'تعذر تحميل العداد. سيُعاد المحاولة تلقائيًا.',customMonth:m=>`شهر ${m}`,
      tiles:{uniquePatients:['المرضى','مريض فريد'],procedureUnits:['الإجراءات المنفذة','إجراء'],labSent:['أُرسلت للمعمل','حالة'],completed:['المكتملة','موعد'],appointments:['المواعيد','موعد'],cancelled:['الملغاة','موعد'],labOverdue:['معمل متأخر','الآن'],labWaitingToSend:['بانتظار الإرسال','للمعمل الآن']},
      sub:{uniquePatients:s=>`${n(s.treatedPatients)} أكمل علاجه`,procedureUnits:s=>`في ${n(s.visitsWithProcedures)} زيارة`,labSent:s=>`${n(s.labSentUnits)} وحدة · سُلّم ${n(s.labDelivered)}`,completed:s=>`نسبة الإنجاز ${n(s.completionRate)}%`,appointments:s=>`${n(s.appointments-s.cancelled)} فعّال`,cancelled:()=>'خلال الفترة',labOverdue:()=>'تجاوزت الموعد المتوقع',labWaitingToSend:()=>'مسجلة ولم تُرسل'},
      topProcedures:'أكثر الإجراءات',clinics:'حسب العيادة',noData:'لا توجد بيانات في هذه الفترة.',clinicRow:c=>`${n(c.treatedPatients)} مريض · ${n(c.procedures)} إجراء · ${n(c.labSent)} معمل`,filterHint:'اضغط العيادة لعرض أرقامها فقط',
      totalTitle:'الإجمالي منذ البداية',totalSince:m=>`منذ ${m}`,monthsTitle:'حسب الأشهر',monthsHint:'اضغط الشهر لعرض تفاصيله في العداد',monthsLoading:'جارٍ تجميع الأشهر…',monthsError:'تعذر تحميل الأشهر.',
      totals:{uniquePatients:'إجمالي المرضى',procedureUnits:'إجمالي الإجراءات',labSent:'إجمالي المرسل للمعمل',completed:'إجمالي المكتمل'},
      cols:{month:'الشهر',patients:'المرضى',procedures:'الإجراءات',lab:'أُرسل للمعمل',completed:'المكتمل',rate:'الإنجاز'},more:'عرض كل الأشهر',less:'عرض آخر 6 أشهر'},
    en:{kicker:'Complete counter',title:'Accurate clinic totals',help:'Updates live with every new patient, procedure or lab dispatch. Tap any number for details.',ranges:{today:'Today',yesterday:'Yesterday',week:'7 days',month:'This month',days30:'30 days'},allClinics:'All clinics',refresh:'Refresh',details:'Full details',updated:'Updated',live:'Live',loading:'Calculating…',error:'Could not load the counter. It will retry automatically.',customMonth:m=>m,
      tiles:{uniquePatients:['Patients','unique'],procedureUnits:['Procedures done','procedures'],labSent:['Sent to lab','cases'],completed:['Completed','visits'],appointments:['Appointments','total'],cancelled:['Cancelled','visits'],labOverdue:['Lab overdue','now'],labWaitingToSend:['Awaiting lab dispatch','now']},
      sub:{uniquePatients:s=>`${n(s.treatedPatients)} treated`,procedureUnits:s=>`in ${n(s.visitsWithProcedures)} visits`,labSent:s=>`${n(s.labSentUnits)} units · ${n(s.labDelivered)} delivered`,completed:s=>`${n(s.completionRate)}% completion`,appointments:s=>`${n(s.appointments-s.cancelled)} active`,cancelled:()=>'in this period',labOverdue:()=>'past expected date',labWaitingToSend:()=>'recorded, not sent'},
      topProcedures:'Top procedures',clinics:'By clinic',noData:'No data in this period.',clinicRow:c=>`${n(c.treatedPatients)} patients · ${n(c.procedures)} procedures · ${n(c.labSent)} lab`,filterHint:'Tap a clinic to filter',
      totalTitle:'All-time total',totalSince:m=>`since ${m}`,monthsTitle:'By month',monthsHint:'Tap a month to open it in the counter',monthsLoading:'Building months…',monthsError:'Could not load months.',
      totals:{uniquePatients:'Total patients',procedureUnits:'Total procedures',labSent:'Total sent to lab',completed:'Total completed'},
      cols:{month:'Month',patients:'Patients',procedures:'Procedures',lab:'Sent to lab',completed:'Completed',rate:'Done'},more:'Show all months',less:'Show last 6 months'}
  };
  const TILE_ORDER=['uniquePatients','procedureUnits','labSent','completed','appointments','cancelled','labOverdue','labWaitingToSend'];
  const TOTAL_ORDER=['uniquePatients','procedureUnits','labSent','completed'];
  const TONES={uniquePatients:'navy',procedureUnits:'gold',labSent:'blue',completed:'green',appointments:'teal',cancelled:'red',labOverdue:'red',labWaitingToSend:'orange'};
  const state={range:'today',custom:null,clinic:'all',data:null,months:null,monthsError:'',monthsLoading:false,showAllMonths:false,loading:false,error:'',requestId:0,monthsRequestId:0,started:false,clinics:[],version:'',pollTimer:null,changeTimer:null,previous:{},changed:new Set()};
  // dashboard.js runs inside an IIFE, so read shared state from the DOM rather than its variables.
  const lng=()=>String(document.documentElement.lang||'').toLowerCase().startsWith('en')?'en':'ar';
  const t=()=>COPY[lng()];
  const locale=()=>lng()==='en'?'en-US':'ar-SA';
  function n(value){return new Intl.NumberFormat(locale()).format(Number(value)||0)}
  const monthLabel=month=>new Intl.DateTimeFormat(locale(),{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${month}-01T00:00:00Z`));
  const riyadhToday=()=>{const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const read=type=>parts.find(part=>part.type===type)?.value||'';return`${read('year')}-${read('month')}-${read('day')}`};
  const shift=(date,days)=>new Date(Date.parse(`${date}T00:00:00Z`)+days*86_400_000).toISOString().slice(0,10);
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
  const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
  function detailsUrl(range){const{from,to}=range||rangeDates();return`./statistics.html?from=${from}&to=${to}&clinic=${encodeURIComponent(state.clinic)}`}
  const clinicOptions=()=>state.clinics.map(item=>({id:String(item.id),label:`${String(item.name||'')} · ${String(item.roomNumber||'')}${item.doctorName?` · ${String(item.doctorName)}`:''}`}));

  function setRange(range,custom=null){state.range=range;state.custom=custom;state.previous={};load()}
  function renderControls(){
    const copy=t(),bar=el('div','admin-counter-controls');
    const ranges=el('div','admin-counter-ranges');ranges.setAttribute('role','group');
    Object.entries(copy.ranges).forEach(([key,label])=>{const button=el('button',key===state.range?'active':'',label);button.type='button';button.setAttribute('aria-pressed',String(key===state.range));button.addEventListener('click',()=>setRange(key));ranges.append(button)});
    if(state.range==='custom'&&state.custom){const button=el('button','active',copy.customMonth(monthLabel(state.custom)));button.type='button';button.setAttribute('aria-pressed','true');ranges.append(button)}
    const select=el('select','admin-counter-clinic');select.setAttribute('aria-label',copy.allClinics);
    [{id:'all',label:copy.allClinics},...clinicOptions()].forEach(option=>{const node=el('option','',option.label);node.value=option.id;node.selected=option.id===state.clinic;select.append(node)});
    select.addEventListener('change',()=>{state.clinic=select.value;state.previous={};load();loadMonths()});
    const refresh=el('button','admin-counter-refresh',`↻ ${copy.refresh}`);refresh.type='button';refresh.disabled=state.loading;refresh.addEventListener('click',()=>{load();loadMonths()});
    const details=el('a','admin-counter-details',`${copy.details} ←`);details.href=detailsUrl();details.target='_blank';details.rel='noopener';
    bar.append(ranges,select,refresh,details);return bar;
  }
  function renderRanked(title,rows,hint){
    const box=el('div','admin-counter-list'),head=el('div','admin-counter-list-head');head.append(el('strong','',title));if(hint)head.append(el('small','',hint));box.append(head);
    if(!rows.length){box.append(el('p','admin-counter-empty',t().noData));return box}
    const max=Math.max(1,...rows.map(row=>row.value));
    rows.forEach(row=>{
      const item=el(row.onClick?'button':'div','admin-counter-row');if(row.onClick){item.type='button';item.addEventListener('click',row.onClick)}
      const label=el('span','admin-counter-row-label');label.append(el('b','',row.label));if(row.note)label.append(el('small','',row.note));
      const track=el('span','admin-counter-track'),fill=el('i');fill.style.width=`${row.value/max*100}%`;track.append(fill);
      item.append(label,track,el('em','',n(row.value)));box.append(item);
    });
    return box;
  }
  function renderMonths(){
    const copy=t(),box=el('div','admin-counter-months');
    const head=el('div','admin-counter-months-head'),title=el('div');
    title.append(el('strong','',copy.totalTitle));
    const total=state.months?.total;
    if(total)title.append(el('small','',copy.totalSince(monthLabel(total.firstMonth))));
    else title.append(el('small','',state.monthsError?copy.monthsError:copy.monthsLoading));
    head.append(title);box.append(head);
    const totals=el('div','admin-counter-totals');
    TOTAL_ORDER.forEach(key=>{
      const tile=el('div',`admin-counter-total tone-${TONES[key]}`);
      tile.append(el('span','',copy.totals[key]),el('strong',total?'':'is-placeholder',total?n(total[key]):'—'));
      if(total){const sub=key==='uniquePatients'?copy.sub.uniquePatients(total):key==='labSent'?copy.sub.labSent(total):key==='completed'?copy.sub.completed(total):copy.sub.procedureUnits(total);tile.append(el('small','',sub))}
      totals.append(tile);
    });
    box.append(totals);
    const months=state.months?.months||[];
    if(!months.length)return box;
    const tableHead=el('div','admin-counter-months-title');tableHead.append(el('strong','',copy.monthsTitle),el('small','',copy.monthsHint));box.append(tableHead);
    const wrap=el('div','admin-counter-table-wrap'),table=el('table','admin-counter-table'),thead=el('thead'),headRow=el('tr');
    [copy.cols.month,copy.cols.patients,copy.cols.procedures,copy.cols.lab,copy.cols.completed,copy.cols.rate].forEach(label=>headRow.append(el('th','',label)));
    thead.append(headRow);table.append(thead);
    const body=el('tbody'),visible=state.showAllMonths?months:months.slice(0,6),max=Math.max(1,...visible.map(item=>item.procedureUnits));
    const current=riyadhToday().slice(0,7);
    visible.forEach(item=>{
      const row=el('tr');row.tabIndex=0;row.setAttribute('role','button');
      if(state.range==='custom'&&state.custom===item.month||state.range==='month'&&item.month===current)row.classList.add('is-selected');
      const open=()=>item.month===current?setRange('month'):setRange('custom',item.month);
      row.addEventListener('click',open);row.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open()}});
      const monthCell=el('th','',monthLabel(item.month));monthCell.scope='row';row.append(monthCell);
      row.append(el('td','',n(item.uniquePatients)));
      const procedures=el('td','admin-counter-bar-cell'),bar=el('span','admin-counter-mini'),fill=el('i');fill.style.width=`${item.procedureUnits/max*100}%`;bar.append(fill);procedures.append(el('b','',n(item.procedureUnits)),bar);row.append(procedures);
      row.append(el('td','',n(item.labSent)),el('td','',n(item.completed)),el('td','',`${n(item.completionRate)}%`));
      body.append(row);
    });
    table.append(body);wrap.append(table);box.append(wrap);
    if(months.length>6){const toggle=el('button','admin-counter-more',state.showAllMonths?copy.less:copy.more);toggle.type='button';toggle.addEventListener('click',()=>{state.showAllMonths=!state.showAllMonths;render()});box.append(toggle)}
    return box;
  }
  function render(){
    const copy=t(),s=state.data?.summary;
    const head=el('div','admin-counter-head'),titleBox=el('div','admin-counter-title');
    titleBox.append(el('small','',copy.kicker),el('h2','',copy.title),el('p','',copy.help));
    const status=el('span',`admin-counter-status${state.error?' is-error':''}${state.loading?' is-loading':''}`);
    const time=state.data?new Intl.DateTimeFormat(locale(),{hour:'numeric',minute:'2-digit',second:'2-digit'}).format(new Date(state.data.generatedAt||Date.now())):'';
    status.textContent=state.error?copy.error:state.loading&&!state.data?copy.loading:state.data?`${copy.live} · ${copy.updated} ${time}`:'';
    status.setAttribute('role','status');titleBox.append(status);
    head.append(titleBox,renderControls());
    const tiles=el('div','admin-counter-tiles');
    TILE_ORDER.forEach(key=>{
      const [label,unit]=copy.tiles[key],tile=el('a',`admin-counter-tile tone-${TONES[key]}`);
      tile.href=detailsUrl();tile.target='_blank';tile.rel='noopener';
      const value=s?Number(s[key])||0:null;
      if(s&&['labOverdue','labWaitingToSend','cancelled'].includes(key)&&value>0)tile.classList.add('needs-attention');
      if(state.changed.has(key))tile.classList.add('just-changed');
      tile.append(el('span','admin-counter-tile-label',label),el('strong',s?'':'is-placeholder',s?n(value):'—'),el('small','',s?copy.sub[key](s):unit));
      tiles.append(tile);
    });
    const lists=el('div','admin-counter-lists');
    const procedures=(state.data?.topProcedures||[]).slice(0,5).map(item=>({label:item.name,value:Number(item.count)||0,note:lng()==='en'?`${n(item.visits)} visits`:`${n(item.visits)} زيارة`}));
    const clinics=(state.data?.clinics||[]).map(item=>({id:item.clinicId,label:`${item.name||''} · ${item.roomNumber||''}`,value:Number(item.procedures)||0,note:copy.clinicRow(item),patients:Number(item.treatedPatients)||0}))
      .filter(item=>item.value||item.patients).sort((a,b)=>b.value-a.value||b.patients-a.patients).slice(0,6)
      .map(item=>({...item,onClick:state.clinic==='all'?()=>{state.clinic=item.id;state.previous={};load();loadMonths()}:null}));
    lists.append(renderRanked(copy.topProcedures,procedures),renderRanked(copy.clinics,clinics,state.clinic==='all'?copy.filterHint:''));
    root.replaceChildren(head,tiles,lists,renderMonths());
    root.setAttribute('aria-busy',String(state.loading));
    document.body.classList.toggle('admin-counter-ready',Boolean(state.data));
  }
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
    const requestId=++state.requestId,{from,to}=rangeDates();
    state.loading=true;if(!silent){state.error='';render()}
    try{
      const data=await api(`from=${from}&to=${to}&clinic=${encodeURIComponent(state.clinic)}`);
      if(requestId!==state.requestId)return;
      const summary=data.summary||{};
      state.changed=new Set(Object.keys(state.previous).length?TILE_ORDER.filter(key=>Number(state.previous[key])!==Number(summary[key])):[]);
      state.previous={...summary};state.data=data;state.error='';
      if(state.changed.size)setTimeout(()=>{state.changed.clear();if(state.started)render()},2600);
    }catch(error){if(requestId===state.requestId){state.error=String(error?.message||error);console.warn('Admin counter unavailable',error)}}
    finally{if(requestId===state.requestId){state.loading=false;render()}}
  }
  async function loadMonths(){
    const requestId=++state.monthsRequestId;state.monthsLoading=true;
    try{
      const data=await api(`mode=months&clinic=${encodeURIComponent(state.clinic)}`,45_000);
      if(requestId!==state.monthsRequestId)return;
      state.months=data;state.monthsError='';
    }catch(error){if(requestId===state.monthsRequestId){state.monthsError=String(error?.message||error);console.warn('Admin counter months unavailable',error)}}
    finally{if(requestId===state.monthsRequestId){state.monthsLoading=false;if(state.started)render()}}
  }
  // Any data change: refresh the live range now and the monthly totals right after.
  function dataChanged(delay=900){
    if(!state.started)return;
    clearTimeout(state.changeTimer);
    state.changeTimer=setTimeout(()=>{load({silent:true});loadMonths()},delay);
  }
  async function checkVersion(){
    if(!state.started||document.hidden||!isAdminView())return;
    try{
      const data=await api(`mode=version&clinic=${encodeURIComponent(state.clinic)}`,10_000);
      if(state.version&&data.version!==state.version)dataChanged(0);
      state.version=data.version||state.version;
    }catch{}
  }
  const isAdminView=()=>{const body=document.body.classList;return body.contains('role-admin')&&!body.contains('view-clinic')&&!body.contains('auth-locked')&&!body.contains('auth-checking')};
  async function loadClinics(){
    try{const response=await nativeFetch('/api/clinics',{credentials:'include',cache:'no-store'}),data=await response.json().catch(()=>({}));
      if(response.ok)state.clinics=(Array.isArray(data.clinics)?data.clinics:[]).filter(item=>item&&item.active);}
    catch(error){console.warn('Admin counter clinics unavailable',error)}
    if(state.started)render();
  }
  function schedule(){
    clearInterval(state.pollTimer);
    let lastSafety=Date.now();
    state.pollTimer=setInterval(()=>{
      checkVersion();
      if(!document.hidden&&Date.now()-lastSafety>SAFETY_REFRESH_MS){lastSafety=Date.now();dataChanged(0)}
    },VERSION_POLL_MS);
  }
  function start(){
    if(state.started||!isAdminView())return;
    state.started=true;root.hidden=false;load();loadMonths();loadClinics();schedule();checkVersion();
  }
  function stop(){root.hidden=true;state.started=false;clearInterval(state.pollTimer);clearTimeout(state.changeTimer);document.body.classList.remove('admin-counter-ready')}

  let channel=null;
  try{channel=new BroadcastChannel('bestcare-admin-counter');channel.onmessage=()=>dataChanged(300)}catch{}
  // 1) Saves made on this device (patient added, procedure recorded, lab case sent…).
  const nativeFetch=window.fetch.bind(window);
  window.fetch=function(input,init){
    const result=nativeFetch(input,init);
    try{
      const method=String(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
      const url=new URL(typeof input==='string'?input:input?.url||String(input),location.href);
      if(method!=='GET'&&method!=='HEAD'&&method!=='OPTIONS'&&url.origin===location.origin&&MUTATION_PATHS.some(path=>url.pathname.startsWith(path))){
        result.then(response=>{if(response.ok){dataChanged();try{channel?.postMessage(Date.now())}catch{}}}).catch(()=>{});
      }
    }catch{}
    return result;
  };
  // 2) Changes from other devices, delivered by the service worker push relay.
  navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='BESTCARE_REMOTE_SYNC')dataChanged(600)});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.started)checkVersion()});
  window.addEventListener('online',()=>{if(state.started)dataChanged(0)});
  new MutationObserver(()=>{if(state.started)render()}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  // Auth finishes asynchronously in dashboard.js; react to its body classes.
  const check=()=>{if(isAdminView())start();else if(state.started&&document.body.classList.contains('auth-locked'))stop()};
  new MutationObserver(check).observe(document.body,{attributes:true,attributeFilter:['class']});
  check();
  window.bestCareAdminCounter={refresh:()=>dataChanged(0)};
})();
