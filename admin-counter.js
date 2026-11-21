// Comprehensive admin counter: live totals across all clinics (patients,
// procedures, lab cases) read from /api/statistics. Admin view only.
(()=>{
  const root=document.getElementById('adminCounter');
  if(!root)return;
  const REFRESH_MS=3*60_000;
  const COPY={
    ar:{kicker:'العداد الشامل',title:'أرقام العيادات بدقة',help:'محسوبة من قاعدة البيانات لجميع العيادات. اضغط أي رقم لفتح تفاصيله.',ranges:{today:'اليوم',yesterday:'أمس',week:'7 أيام',month:'هذا الشهر',days30:'30 يومًا'},allClinics:'جميع العيادات',refresh:'تحديث',details:'التفاصيل الكاملة',updated:'آخر تحديث',loading:'جارٍ الحساب…',error:'تعذر تحميل العداد. سيُعاد المحاولة تلقائيًا.',
      tiles:{uniquePatients:['المرضى','مريض فريد'],procedureUnits:['الإجراءات المنفذة','إجراء'],labSent:['أُرسلت للمعمل','حالة'],completed:['المكتملة','موعد'],appointments:['المواعيد','موعد'],cancelled:['الملغاة','موعد'],labOverdue:['معمل متأخر','الآن'],labWaitingToSend:['بانتظار الإرسال','للمعمل الآن']},
      sub:{uniquePatients:s=>`${n(s.treatedPatients)} أكمل علاجه`,procedureUnits:s=>`في ${n(s.visitsWithProcedures)} زيارة`,labSent:s=>`${n(s.labSentUnits)} وحدة · سُلّم ${n(s.labDelivered)}`,completed:s=>`نسبة الإنجاز ${n(s.completionRate)}%`,appointments:s=>`${n(s.appointments-s.cancelled)} فعّال`,cancelled:()=>'خلال الفترة',labOverdue:()=>'تجاوزت الموعد المتوقع',labWaitingToSend:()=>'مسجلة ولم تُرسل'},
      topProcedures:'أكثر الإجراءات',clinics:'حسب العيادة',noData:'لا توجد بيانات في هذه الفترة.',clinicRow:c=>`${n(c.treatedPatients)} مريض · ${n(c.procedures)} إجراء · ${n(c.labSent)} معمل`,filterHint:'اضغط العيادة لعرض أرقامها فقط'},
    en:{kicker:'Complete counter',title:'Accurate clinic totals',help:'Calculated from the database for all clinics. Tap any number for details.',ranges:{today:'Today',yesterday:'Yesterday',week:'7 days',month:'This month',days30:'30 days'},allClinics:'All clinics',refresh:'Refresh',details:'Full details',updated:'Updated',loading:'Calculating…',error:'Could not load the counter. It will retry automatically.',
      tiles:{uniquePatients:['Patients','unique'],procedureUnits:['Procedures done','procedures'],labSent:['Sent to lab','cases'],completed:['Completed','visits'],appointments:['Appointments','total'],cancelled:['Cancelled','visits'],labOverdue:['Lab overdue','now'],labWaitingToSend:['Awaiting lab dispatch','now']},
      sub:{uniquePatients:s=>`${n(s.treatedPatients)} treated`,procedureUnits:s=>`in ${n(s.visitsWithProcedures)} visits`,labSent:s=>`${n(s.labSentUnits)} units · ${n(s.labDelivered)} delivered`,completed:s=>`${n(s.completionRate)}% completion`,appointments:s=>`${n(s.appointments-s.cancelled)} active`,cancelled:()=>'in this period',labOverdue:()=>'past expected date',labWaitingToSend:()=>'recorded, not sent'},
      topProcedures:'Top procedures',clinics:'By clinic',noData:'No data in this period.',clinicRow:c=>`${n(c.treatedPatients)} patients · ${n(c.procedures)} procedures · ${n(c.labSent)} lab`,filterHint:'Tap a clinic to filter'}
  };
  const TILE_ORDER=['uniquePatients','procedureUnits','labSent','completed','appointments','cancelled','labOverdue','labWaitingToSend'];
  const TONES={uniquePatients:'navy',procedureUnits:'gold',labSent:'blue',completed:'green',appointments:'teal',cancelled:'red',labOverdue:'red',labWaitingToSend:'orange'};
  const state={range:'today',clinic:'all',data:null,loading:false,error:'',timer:null,requestId:0,started:false,clinics:[]};
  // dashboard.js runs inside an IIFE, so read shared state from the DOM rather than its variables.
  const lng=()=>String(document.documentElement.lang||'').toLowerCase().startsWith('en')?'en':'ar';
  const t=()=>COPY[lng()];
  function n(value){return new Intl.NumberFormat(lng()==='en'?'en-US':'ar-SA').format(Number(value)||0)}
  const riyadhToday=()=>{const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const read=type=>parts.find(part=>part.type===type)?.value||'';return`${read('year')}-${read('month')}-${read('day')}`};
  const shift=(date,days)=>new Date(Date.parse(`${date}T00:00:00Z`)+days*86_400_000).toISOString().slice(0,10);
  function rangeDates(range){
    const today=riyadhToday();
    if(range==='yesterday'){const day=shift(today,-1);return{from:day,to:day}}
    if(range==='week')return{from:shift(today,-6),to:today};
    if(range==='days30')return{from:shift(today,-29),to:today};
    if(range==='month')return{from:`${today.slice(0,8)}01`,to:today};
    return{from:today,to:today};
  }
  const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
  function detailsUrl(){const{from,to}=rangeDates(state.range);return`./statistics.html?from=${from}&to=${to}&clinic=${encodeURIComponent(state.clinic)}`}
  function clinicOptions(){
    return state.clinics.map(item=>({id:String(item.id),label:`${String(item.name||'')} · ${String(item.roomNumber||'')}${item.doctorName?` · ${String(item.doctorName)}`:''}`}));
  }
  function renderControls(){
    const copy=t(),bar=el('div','admin-counter-controls');
    const ranges=el('div','admin-counter-ranges');ranges.setAttribute('role','group');
    Object.entries(copy.ranges).forEach(([key,label])=>{const button=el('button',key===state.range?'active':'',label);button.type='button';button.setAttribute('aria-pressed',String(key===state.range));button.addEventListener('click',()=>{state.range=key;load()});ranges.append(button)});
    const select=el('select','admin-counter-clinic');select.setAttribute('aria-label',copy.allClinics);
    [{id:'all',label:copy.allClinics},...clinicOptions()].forEach(option=>{const node=el('option','',option.label);node.value=option.id;node.selected=option.id===state.clinic;select.append(node)});
    select.addEventListener('change',()=>{state.clinic=select.value;load()});
    const refresh=el('button','admin-counter-refresh',`↻ ${copy.refresh}`);refresh.type='button';refresh.disabled=state.loading;refresh.addEventListener('click',()=>load());
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
  function render(){
    const copy=t(),s=state.data?.summary;
    const head=el('div','admin-counter-head'),titleBox=el('div','admin-counter-title');
    titleBox.append(el('small','',copy.kicker),el('h2','',copy.title),el('p','',copy.help));
    const status=el('span',`admin-counter-status${state.error?' is-error':''}${state.loading?' is-loading':''}`);
    status.textContent=state.error?copy.error:state.loading?copy.loading:state.data?`${copy.updated} ${new Intl.DateTimeFormat(lng()==='en'?'en-US':'ar-SA',{hour:'numeric',minute:'2-digit'}).format(new Date(state.data.generatedAt||Date.now()))}`:'';
    status.setAttribute('role','status');titleBox.append(status);
    head.append(titleBox,renderControls());
    const tiles=el('div','admin-counter-tiles');
    TILE_ORDER.forEach(key=>{
      const [label,unit]=copy.tiles[key],tile=el('a',`admin-counter-tile tone-${TONES[key]}`);
      tile.href=detailsUrl();tile.target='_blank';tile.rel='noopener';
      const value=s?Number(s[key])||0:null;
      if(s&&['labOverdue','labWaitingToSend','cancelled'].includes(key)&&value>0)tile.classList.add('needs-attention');
      tile.append(el('span','admin-counter-tile-label',label),el('strong',s?'':'is-placeholder',s?n(value):'—'),el('small','',s?copy.sub[key](s):unit));
      tiles.append(tile);
    });
    const lists=el('div','admin-counter-lists');
    const procedures=(state.data?.topProcedures||[]).slice(0,5).map(item=>({label:item.name,value:Number(item.count)||0,note:lng()==='en'?`${n(item.visits)} visits`:`${n(item.visits)} زيارة`}));
    const clinics=(state.data?.clinics||[]).map(item=>({id:item.clinicId,label:`${item.name||''} · ${item.roomNumber||''}`,value:Number(item.procedures)||0,note:copy.clinicRow(item),patients:Number(item.treatedPatients)||0}))
      .filter(item=>item.value||item.patients).sort((a,b)=>b.value-a.value||b.patients-a.patients).slice(0,6)
      .map(item=>({...item,onClick:state.clinic==='all'?()=>{state.clinic=item.id;load()}:null}));
    lists.append(renderRanked(copy.topProcedures,procedures),renderRanked(copy.clinics,clinics,state.clinic==='all'?copy.filterHint:''));
    root.replaceChildren(head,tiles,lists);
    root.setAttribute('aria-busy',String(state.loading));
    document.body.classList.toggle('admin-counter-ready',Boolean(state.data));
  }
  async function load({silent=false}={}){
    const requestId=++state.requestId,{from,to}=rangeDates(state.range);
    state.loading=true;if(!silent)state.error='';render();
    try{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20_000);
      const response=await fetch(`/api/statistics?from=${from}&to=${to}&clinic=${encodeURIComponent(state.clinic)}`,{credentials:'include',cache:'no-store',signal:controller.signal}).finally(()=>clearTimeout(timer));
      const data=await response.json().catch(()=>({}));
      if(requestId!==state.requestId)return;
      if(!response.ok)throw new Error(data.error||'statistics unavailable');
      state.data=data;state.error='';
    }catch(error){if(requestId===state.requestId){state.error=String(error?.message||error);console.warn('Admin counter unavailable',error)}}
    finally{if(requestId===state.requestId){state.loading=false;render()}}
  }
  const isAdminView=()=>{const body=document.body.classList;return body.contains('role-admin')&&!body.contains('view-clinic')&&!body.contains('auth-locked')&&!body.contains('auth-checking')};
  async function loadClinics(){
    try{const response=await fetch('/api/clinics',{credentials:'include',cache:'no-store'}),data=await response.json().catch(()=>({}));
      if(response.ok)state.clinics=(Array.isArray(data.clinics)?data.clinics:[]).filter(item=>item&&item.active);}
    catch(error){console.warn('Admin counter clinics unavailable',error)}
    if(state.started)render();
  }
  function schedule(){
    clearInterval(state.timer);
    state.timer=setInterval(()=>{if(!document.hidden&&state.started&&isAdminView()&&rangeDates(state.range).to===riyadhToday())load({silent:true})},REFRESH_MS);
  }
  function start(){
    if(state.started||!isAdminView())return;
    state.started=true;root.hidden=false;load();schedule();loadClinics();
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.started&&Date.now()-Number(state.data?.generatedAt||0)>REFRESH_MS)load({silent:true})});
  new MutationObserver(()=>{if(state.started)render()}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  // Auth finishes asynchronously in dashboard.js; react to its body classes.
  const check=()=>{if(isAdminView())start();else if(state.started&&document.body.classList.contains('auth-locked')){root.hidden=true;state.started=false;clearInterval(state.timer)}};
  new MutationObserver(check).observe(document.body,{attributes:true,attributeFilter:['class']});
  check();
  window.bestCareAdminCounter={refresh:()=>load()};
})();
