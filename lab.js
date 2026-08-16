const $=id=>document.getElementById(id);
    const params=new URLSearchParams(location.search);
    const requestedClinic=/^clinic-([1-9]|1[0-5])$/.test(params.get('clinic')||'')?params.get('clinic'):'clinic-1';
    const statusLabels={pending_send:'الطبعة جاهزة',sent_coordination:'أُرسلت للتنسيق',sent:'أُرسلت للمعمل',in_production:'قيد التصنيع',ready_at_lab:'جاهزة لدى المعمل',received_clinic:'استُلمت من المعمل',delivered_coordination:'تم تسليمها لموظفي التنسيق',delivered_patient:'سُلّمت للمريض',needs_adjustment:'تحتاج تعديلًا',returned_lab:'أُعيدت للمعمل',cancelled:'ملغاة'};
    const statusLabelsEn={pending_send:'Impression ready',sent_coordination:'Sent to coordination',sent:'Sent to laboratory',in_production:'In production',ready_at_lab:'Ready at laboratory',received_clinic:'Received from laboratory',delivered_coordination:'Handed to coordination staff',delivered_patient:'Delivered to patient',needs_adjustment:'Needs adjustment',returned_lab:'Returned to laboratory',cancelled:'Cancelled'};
    const statusOrder=['pending_send','sent_coordination','sent','in_production','ready_at_lab','received_clinic','delivered_coordination','delivered_patient','needs_adjustment','returned_lab','cancelled'];
    const LAB_I18N={
      ar:{title:'حالات معمل الأسنان',subtitle:'متابعة الإرسال والاستلام والتسليم للمريض',newCase:'＋ حالة جديدة',refresh:'↻ تحديث',print:'طباعة القائمة',back:'العودة للداشبورد',heroTitle:'الحالة من الطبعة إلى تسليم المريض',heroHelp:'اسم المعمل والمدة منذ الإرسال ظاهران دائمًا، والمسار الزمني يحفظ كل تحديث.',active:'حالة نشطة',atLab:'لدى المعمل',pending:'قبل الإرسال للمعمل',received:'استُلمت من المعمل',deliveredCoordination:'تم تسليمها للتنسيق',adjust:'تحتاج تعديلًا',done:'سُلّمت للمريض',allClinics:'جميع العيادات',allDoctors:'جميع الأطباء',allLabs:'جميع المعامل',activeCases:'الحالات النشطة',allCases:'كل الحالات',printCopy:'نسخة للطباعة',statusKey:['الطبعة جاهزة','لدى المعمل','استُلمت من المعمل','سُلّمت للتنسيق','تحتاج تعديلًا','سُلّمت للمريض'],listTitle:'حالات المعمل',listHelp:'المتأخرة أولًا، ثم الأقدم منذ الإرسال للمعمل.',case:'حالة',unit:'وحدة',units:'وحدات',noCases:'لا توجد حالات معمل مطابقة للتصفية.',loading:'جارٍ تحميل حالات المعمل…',labStatus:'تحديث الحالة',delete:'حذف الحالة',file:'ملف',mobile:'جوال',number:'رقم',doctor:'د.',notStarted:'لم يبدأ العداد',sinceHandoff:'منذ الإرسال للمعمل',duration:'استغرقت',elapsed:'مضى',newCaseTitle:'إضافة حالة معمل جديدة',newCaseHelp:'اربط الحالة بسجل المريض أولًا، ثم أكمل بيانات العمل المعملي.',lookup:'البحث عن المريض',fileNumber:'رقم الملف',phone:'رقم الجوال',nationalId:'رقم الهوية',search:'بحث وربط',lookupHint:'تتم المطابقة التامة مع سجل المريض، ولن تُنشأ الحالة قبل تأكيد الارتباط.',choose:'اختر',workType:'نوع الحالة',labName:'اسم المعمل',unitsLabel:'عدد الوحدات',material:'المادة أو النوع',shade:'درجة اللون',notes:'ملاحظات المعمل',cancel:'إلغاء',save:'حفظ حالة المعمل',linked:'مرتبط بالسجل',sentNow:'تم إرسال الحالة للمعمل الآن وبدء العداد',lang:'English',patientHead:'المريض',labHead:'المعمل',workHead:'العمل',stageHead:'المرحلة الحالية',timerHead:'عداد المعمل',actionHead:'تحديث الحالة',paceFast:'سريع',paceNormal:'ضمن الوقت',paceLate:'متأخر',timeline:'المسار الزمني',historyHelp:'كل تغيير موثق بوقته',impressionReady:'الطبعة جاهزة',sentCoordination:'أُرسلت للتنسيق',sentLab:'أُرسلت للمعمل',receivedLab:'استُلمت من المعمل',deliveredPatient:'سُلّمت للمريض'},
      en:{title:'Dental lab cases',subtitle:'Track handoff, production, receipt, and patient delivery',newCase:'＋ New lab case',refresh:'↻ Refresh',print:'Print list',back:'Back to dashboard',heroTitle:'From impression to patient delivery',heroHelp:'The laboratory name and elapsed time remain visible, while the timeline preserves every update.',active:'Active cases',atLab:'At laboratory',pending:'Before laboratory handoff',received:'Received from laboratory',deliveredCoordination:'Handed to coordination',adjust:'Needs adjustment',done:'Delivered to patient',allClinics:'All clinics',allDoctors:'All doctors',allLabs:'All laboratories',activeCases:'Active cases',allCases:'All cases',printCopy:'Print copy',statusKey:['Impression ready','At laboratory','Received from laboratory','Handed to coordination','Needs adjustment','Delivered to patient'],listTitle:'Laboratory cases',listHelp:'Overdue cases appear first, followed by the oldest laboratory handoff.',case:'case',unit:'unit',units:'units',noCases:'No laboratory cases match the current filters.',loading:'Loading laboratory cases…',labStatus:'Update status',delete:'Delete case',file:'File',mobile:'Mobile',number:'No.',doctor:'Dr.',notStarted:'Timer has not started',sinceHandoff:'Since laboratory handoff',duration:'Took',elapsed:'Elapsed',newCaseTitle:'Add a new laboratory case',newCaseHelp:'Link the case to a patient record first, then complete the laboratory details.',lookup:'Find patient',fileNumber:'File number',phone:'Mobile number',nationalId:'National ID',search:'Find and link',lookupHint:'The match must be confirmed before a laboratory case can be created.',choose:'Choose',workType:'Case type',labName:'Laboratory',unitsLabel:'Units',material:'Material or type',shade:'Shade',notes:'Laboratory notes',cancel:'Cancel',save:'Save laboratory case',linked:'Linked to record',sentNow:'Sent to the laboratory now — start timer',lang:'العربية',patientHead:'Patient',labHead:'Laboratory',workHead:'Work',stageHead:'Current stage',timerHead:'Laboratory timer',actionHead:'Update status',paceFast:'Fast',paceNormal:'On time',paceLate:'Overdue',timeline:'Timeline',historyHelp:'Every change is time-stamped',impressionReady:'Impression ready',sentCoordination:'Sent to coordination',sentLab:'Sent to laboratory',receivedLab:'Received from laboratory',deliveredPatient:'Delivered to patient'}
    };
    let lang=localStorage.getItem('bestcare_lang')||'ar';
    const tx=key=>LAB_I18N[lang]?.[key]??LAB_I18N.ar[key]??key;
    const statusLabel=status=>lang==='en'?(statusLabelsEn[status]||status): (statusLabels[status]||status);
    const terminalStatuses=new Set(['delivered_patient','cancelled']);
    let authUser=null,cases=[],clinics=[],scope='clinic',loading=false,selectedLookupPatient=null,lookupBusy=false,saveBusy=false;
    const openRows=new Set();
    const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const normalize=value=>String(value||'').replace(/\D/g,'');
    async function api(url,options={}){return fetch(url,{credentials:'include',cache:'no-store',...options})}
    function elapsed(start,end=Date.now()){
      if(!Number(start))return tx('notStarted');
      const ms=Math.max(0,Number(end||Date.now())-Number(start)),days=Math.floor(ms/86400000),hours=Math.floor(ms%86400000/3600000),minutes=Math.floor(ms%3600000/60000);
      if(lang==='en'){
        if(days)return`${days} day${days===1?'':'s'}${hours?` ${hours}h`:''}`;
        if(hours)return`${hours} hour${hours===1?'':'s'}${minutes?` ${minutes}m`:''}`;
        return`${minutes} minute${minutes===1?'':'s'}`;
      }
      if(days)return`${days} يوم${hours?` و${hours} ساعة`:''}`;
      if(hours)return`${hours} ساعة${minutes?` و${minutes} دقيقة`:''}`;
      return`${minutes} دقيقة`;
    }
    function labDuration(item){
      const start=Number(item.sentAt||0);
      if(!start)return{value:tx('pending'),detail:tx('sinceHandoff')};
      const finished=Number(item.receivedAt||item.deliveredAt||0);
      const stopped=finished>0&&['received_clinic','delivered_coordination','delivered_patient'].includes(item.status);
      return{value:`${stopped?tx('duration'):tx('elapsed')} ${elapsed(start,stopped?finished:Date.now())}`,detail:stopped?tx('receivedLab'):tx('sinceHandoff'),start,end:stopped?finished:Date.now()};
    }
    function itemTone(item){
      if(item.status==='delivered_patient'||item.status==='cancelled')return'done';
      if(item.status==='pending_send')return'pending';
      if(['received_clinic','delivered_coordination'].includes(item.status))return'received';
      if(['needs_adjustment','returned_lab'].includes(item.status))return'adjust';
      return'sent';
    }
    function statusOptions(item){return statusOrder.map(value=>`<option value="${value}"${item.status===value?' selected':''}>${esc(statusLabel(value))}</option>`).join('')}
    const timelineStages=[
      {id:'pending_send',label:'impressionReady'},
      {id:'sent_coordination',label:'sentCoordination'},
      {id:'sent',label:'sentLab'},
      {id:'received_clinic',label:'receivedLab'},
      {id:'delivered_patient',label:'deliveredPatient'}
    ];
    function canonicalStage(status){
      if(status==='pending_send')return'pending_send';
      if(status==='sent_coordination')return'sent_coordination';
      if(['sent','in_production','ready_at_lab','needs_adjustment','returned_lab'].includes(status))return'sent';
      if(['received_clinic','delivered_coordination'].includes(status))return'received_clinic';
      if(status==='delivered_patient')return'delivered_patient';
      return'';
    }
    function formatEventTime(value){
      if(!Number(value))return'—';
      return new Intl.DateTimeFormat(lang==='en'?'en-GB':'ar-SA',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(Number(value)));
    }
    function caseEvents(item){
      const events=Array.isArray(item.history)?item.history.filter(event=>event&&Number(event.at)):[];
      if(events.length)return events;
      const fallback=[{status:'pending_send',at:item.createdAt||item.updatedAt}];
      if(item.sentAt)fallback.push({status:'sent',at:item.sentAt});
      if(item.receivedAt)fallback.push({status:'received_clinic',at:item.receivedAt});
      if(item.deliveredAt)fallback.push({status:'delivered_patient',at:item.deliveredAt});
      if(item.status&&!fallback.some(event=>event.status===item.status))fallback.push({status:item.status,at:item.updatedAt||Date.now()});
      return fallback.filter(event=>Number(event.at));
    }
    function eventForStage(item,stageId){
      return caseEvents(item).find(event=>canonicalStage(event.status)===stageId);
    }
    function paceMeta(item){
      if(item.status==='delivered_patient'||item.status==='cancelled')return{code:'done',label:statusLabel(item.status)};
      const duration=labDuration(item);
      if(!duration.start)return{code:'wait',label:tx('pending')};
      const age=Math.max(0,Number(duration.end||Date.now())-Number(duration.start));
      if(age>5*86400000)return{code:'late',label:tx('paceLate')};
      if(age<=2*86400000)return{code:'fast',label:tx('paceFast')};
      return{code:'normal',label:tx('paceNormal')};
    }
    function renderTimeline(item){
      const currentId=canonicalStage(item.status);
      const currentIndex=Math.max(0,timelineStages.findIndex(stage=>stage.id===currentId));
      const steps=timelineStages.map((stage,index)=>{
        const event=eventForStage(item,stage.id);
        const state=index<currentIndex?'completed':index===currentIndex&&item.status!=='cancelled'?'current':'';
        return `<div class="timeline-step ${state}"><span class="timeline-dot">${index<currentIndex?'✓':index+1}</span><b>${esc(tx(stage.label))}</b><time>${esc(event?formatEventTime(event.at):'—')}</time></div>`;
      }).join('');
      const history=[...caseEvents(item)].reverse().map(event=>`<span class="history-event"><b>${esc(statusLabel(event.status))}</b> · ${esc(formatEventTime(event.at))}${event.by?` · ${esc(event.by)}`:''}</span>`).join('');
      return `<div class="timeline">${steps}</div><div class="history">${history}</div>`;
    }
    function displayDoctor(item){
      const clinic=clinics.find(row=>row.id===item.clinicId);
      return String(item.doctorName||clinic?.doctorName||'').trim()||(lang==='en'?'Unassigned':'غير محدد');
    }
    function priorityRank(item){
      if(terminalStatuses.has(item.status))return 90;
      if(['needs_adjustment','returned_lab'].includes(item.status))return 0;
      if(item.status==='received_clinic')return 1;
      if(item.status==='delivered_coordination')return 1.5;
      if(item.status==='ready_at_lab')return 2;
      if(item.status==='pending_send')return 3;
      if(item.status==='sent_coordination')return 3.5;
      if(item.status==='in_production')return 4;
      if(item.status==='sent')return 5;
      return 6;
    }
    function priorityLabel(item){
      if(['needs_adjustment','returned_lab'].includes(item.status))return tx('adjust');
      if(item.status==='received_clinic')return tx('received');
      if(item.status==='delivered_coordination')return tx('deliveredCoordination');
      if(item.status==='ready_at_lab')return statusLabel(item.status);
      if(item.status==='pending_send')return tx('pending');
      return statusLabel(item.status)||tx('labStatus');
    }
    function filteredCases(){
      const q=$('searchInput').value.trim().toLowerCase(),clinic=$('clinicFilter').value,doctor=$('doctorFilter').value,lab=$('labFilter').value,status=$('statusFilter').value;
      return cases.filter(item=>{
        const assignedDoctor=displayDoctor(item);
        const searchable=`${item.patient?.name||''} ${item.patient?.file||''} ${item.patient?.phone||''} ${item.labName||''} ${item.customLabName||''} ${assignedDoctor} ${item.clinicName||''}`.toLowerCase();
        return (!q||searchable.includes(q))&&(clinic==='all'||item.clinicId===clinic)&&(doctor==='all'||assignedDoctor===doctor)&&(lab==='all'||displayLab(item)===lab)&&(status==='all'||!terminalStatuses.has(item.status));
      }).sort((a,b)=>priorityRank(a)-priorityRank(b)||Number(a.sentAt||Number.MAX_SAFE_INTEGER)-Number(b.sentAt||Number.MAX_SAFE_INTEGER)||Number(b.updatedAt||0)-Number(a.updatedAt||0));
    }
    function applyLanguage(){
      document.documentElement.lang=lang;document.documentElement.dir=lang==='en'?'ltr':'rtl';
      document.title=`${tx('title')} — ${lang==='en'?'Best Care':'أفضل عناية'}`;
      const set=(selector,key)=>{const node=$(selector)||document.querySelector(selector);if(node)node.textContent=tx(key)};
      set('.brand h1','title');set('.brand p','subtitle');set('#newLabCaseBtn','newCase');set('#refreshBtn','refresh');set('#printBtn','print');set('#backBtn','back');
      set('.hero h2','heroTitle');set('.hero p','heroHelp');set('.hero-count span','active');
      set('.stat.sent span','atLab');set('.stat.pending span','pending');set('.stat.received span','received');set('.stat.adjust span','adjust');set('.stat.done span','done');
      $('searchInput').placeholder=lang==='en'?'Search by patient, file, mobile, or lab':'بحث باسم المريض أو رقم الملف أو الجوال أو المعمل';
      $('clinicFilter').options[0].textContent=tx('allClinics');$('doctorFilter').options[0].textContent=tx('allDoctors');$('labFilter').options[0].textContent=tx('allLabs');
      $('statusFilter').innerHTML=`<option value="active">${esc(tx('activeCases'))}</option><option value="all">${esc(tx('allCases'))}</option>`;
      set('#compactPrintBtn','printCopy');
      ['patientHead','labHead','workHead','stageHead','timerHead','actionHead','paceFastLabel','paceNormalLabel','paceLateLabel'].forEach(id=>{if($(id))$(id).textContent=tx(id.replace('Label',''))});
      const keyLabels=document.querySelectorAll('.status-key span');tx('statusKey').forEach((label,index)=>{if(keyLabels[index])keyLabels[index].lastChild.textContent=label});
      set('.list-head h3','listTitle');set('.list-head p','listHelp');
      set('#newLabCaseTitle','newCaseTitle');set('.new-case-head p','newCaseHelp');set('.lookup-box>label','lookup');set('#labLookupHint','lookupHint');set('#labLookupBtn','search');
      const lookupValue=$('labLookupType').value; $('labLookupType').innerHTML=`<option value="file">${esc(tx('fileNumber'))}</option><option value="phone">${esc(tx('phone'))}</option><option value="national">${esc(tx('nationalId'))}</option>`;if(['file','phone','national'].includes(lookupValue))$('labLookupType').value=lookupValue;
      const workValue=$('newLabWorkType').value; $('newLabWorkType').innerHTML=lang==='en'?'<option value="">Choose case type</option><option value="تركيب تاج">Crown</option><option value="فينير">Veneer</option><option value="تركيبة زراعة">Implant restoration</option><option value="قوالب تبييض">Whitening trays</option><option value="تركيبة مؤقتة">Temporary restoration</option><option value="other">Other lab procedure</option>':'<option value="">اختر نوع الحالة</option><option value="تركيب تاج">تركيب تاج</option><option value="فينير">فينير</option><option value="تركيبة زراعة">تركيبة زراعة</option><option value="قوالب تبييض">قوالب تبييض</option><option value="تركيبة مؤقتة">تركيبة مؤقتة</option><option value="other">إجراء معملي آخر</option>';if([...$('newLabWorkType').options].some(option=>option.value===workValue))$('newLabWorkType').value=workValue;
      const labValue=$('newLabName').value; $('newLabName').options[0].textContent=lang==='en'?'Choose laboratory':'اختر المعمل';$('newLabName').options[$('newLabName').options.length-1].textContent=lang==='en'?'Other laboratory':'معمل آخر';if([...$('newLabName').options].some(option=>option.value===labValue))$('newLabName').value=labValue;
      const labels=document.querySelectorAll('.new-case-form>label');
      if(labels[0])labels[0].firstChild.textContent=tx('workType');if(labels[2])labels[2].firstChild.textContent=tx('labName');if(labels[4])labels[4].firstChild.textContent=tx('unitsLabel');if(labels[5])labels[5].firstChild.textContent=tx('material');if(labels[6])labels[6].firstChild.textContent=tx('shade');if(labels[7])labels[7].firstChild.textContent=tx('notes');
      set('#saveNewLabCaseBtn','save');
      document.querySelectorAll('[data-close-new-case]').forEach(button=>{if(button.matches('button:not(.modal-close)'))button.textContent=tx('cancel')});
      const toggle=$('languageBtn');if(toggle)toggle.textContent=tx('lang');
      render();
    }
    function displayLab(item){return item.labName==='other'?(item.customLabName||(lang==='en'?'Other laboratory':'معمل آخر')):(item.labName||'—')}
    function render(){
      const active=cases.filter(item=>!terminalStatuses.has(item.status));
      $('activeCount').textContent=active.length;
      $('sentCount').textContent=active.filter(item=>['sent','in_production','ready_at_lab','returned_lab'].includes(item.status)).length;
      $('pendingCount').textContent=active.filter(item=>item.status==='pending_send').length;
      $('receivedCount').textContent=active.filter(item=>['received_clinic','delivered_coordination'].includes(item.status)).length;
      $('adjustCount').textContent=active.filter(item=>['needs_adjustment','returned_lab'].includes(item.status)).length;
      $('doneCount').textContent=cases.filter(item=>item.status==='delivered_patient').length;
      const labs=[...new Set(cases.map(displayLab).filter(value=>value&&value!=='—'))].sort((a,b)=>a.localeCompare(b,'ar'));
      const labValue=$('labFilter').value;
      $('labFilter').innerHTML=`<option value="all">${esc(tx('allLabs'))}</option>${labs.map(lab=>`<option value="${esc(lab)}">${esc(lab)}</option>`).join('')}`;
      if(labs.includes(labValue))$('labFilter').value=labValue;
      const doctors=[...new Set(cases.map(displayDoctor).filter(value=>value&&value!=='غير محدد'))].sort((a,b)=>a.localeCompare(b,'ar'));
      const doctorValue=$('doctorFilter').value;
      $('doctorFilter').innerHTML=`<option value="all">${esc(tx('allDoctors'))}</option>${doctors.map(doctor=>`<option value="${esc(doctor)}">${esc(tx('doctor'))} ${esc(doctor)}</option>`).join('')}`;
      if(doctors.includes(doctorValue))$('doctorFilter').value=doctorValue;
      const visible=filteredCases();
      $('visibleCount').textContent=`${visible.length} ${tx('case')}${visible.length===1||lang==='ar'?'':'s'}`;
      $('caseList').innerHTML=visible.length?visible.map(item=>{
        const lab=displayLab(item),work=(item.items||[]).map(entry=>`${entry.name} ×${entry.quantity}`).join(lang==='en'?', ': '، ')||'—';
        const clinic=clinics.find(row=>row.id===item.clinicId);
        const clinicText=clinic?`${clinic.name} · ${tx('number')} ${clinic.roomNumber}`:(item.clinicName||item.clinicId);
        const doctor=displayDoctor(item);
        const duration=labDuration(item);
        const pace=paceMeta(item),open=openRows.has(item.id);
        return `<tr class="case-row pace-${pace.code}">
          <td data-label="${esc(tx('patientHead'))}"><div class="patient"><strong>${esc(item.patient?.name||'—')}</strong><small>${esc(tx('file'))} ${esc(item.patient?.file||'—')}${item.patient?.phone?` · ${esc(item.patient.phone)}`:''}</small><div class="assignment"><span class="clinic-pill">${esc(clinicText)}</span><span class="doctor-pill">${esc(tx('doctor'))} ${esc(doctor)}</span></div></div></td>
          <td data-label="${esc(tx('labHead'))}"><div class="lab"><strong>${esc(lab)}</strong><small>${esc(item.material||(lang==='en'?'Material not specified':'المادة غير محددة'))}${item.shade?` · ${lang==='en'?'Shade':'لون'} ${esc(item.shade)}`:''}</small></div></td>
          <td data-label="${esc(tx('workHead'))}"><div class="work"><strong>${esc(work)}</strong><small>${item.units} ${item.units===1?tx('unit'):tx('units')}${item.notes?` · ${esc(item.notes)}`:''}</small></div></td>
          <td data-label="${esc(tx('stageHead'))}"><span class="stage-pill">${esc(statusLabel(item.status))}</span></td>
          <td data-label="${esc(tx('timerHead'))}"><div class="timer"><b>${esc(duration.value)}</b><small>${esc(pace.label)} · ${esc(duration.detail)}</small></div></td>
          <td data-label="${esc(tx('actionHead'))}"><div class="row-actions"><select class="status-select" data-case-id="${esc(item.id)}" data-clinic-id="${esc(item.clinicId)}" aria-label="${esc(tx('labStatus'))} ${esc(item.patient?.name||'')}">${statusOptions(item)}</select><button class="timeline-toggle" type="button" data-toggle-timeline="${esc(item.id)}" aria-expanded="${open}" title="${esc(tx('timeline'))}">⌄</button></div></td>
        </tr><tr class="timeline-row" ${open?'':'hidden'}><td colspan="6"><div class="timeline-panel"><div class="timeline-top"><strong>${esc(tx('timeline'))} — ${esc(item.patient?.name||'—')}</strong><span>${esc(tx('historyHelp'))} · ${esc(lab)}</span></div>${renderTimeline(item)}<div class="timeline-actions"><button class="case-delete" type="button" data-delete-case="${esc(item.id)}" data-clinic-id="${esc(item.clinicId)}">${esc(tx('delete'))}</button></div></div></td></tr>`;
      }).join(''):`<tr><td colspan="6"><div class="empty">${esc(tx('noCases'))}</div></td></tr>`;
    }
    async function loadClinics(){
      const response=await api('/api/clinics'),data=await response.json().catch(()=>({}));
      if(response.status===401){location.replace('./');return}
      if(!response.ok)throw new Error(data.error||'تعذر تحميل العيادات');
      clinics=(Array.isArray(data.clinics)?data.clinics:[]).filter(item=>item.active);
      const active=authUser?.role==='admin'?clinics:clinics.filter(item=>item.id===authUser?.clinicId);
      $('clinicFilter').innerHTML=`${authUser?.role==='admin'?`<option value="all">${esc(tx('allClinics'))}</option>`:''}${active.map(item=>`<option value="${esc(item.id)}">${esc(item.name)} · ${esc(tx('number'))} ${esc(item.roomNumber)}</option>`).join('')}`;
      if(authUser?.role!=='admin')$('clinicFilter').value=authUser?.clinicId||requestedClinic;
      else if(params.get('clinic'))$('clinicFilter').value=requestedClinic;
    }
    async function loadCases(){
      if(loading)return;loading=true;$('refreshBtn').disabled=true;$('errorBox').hidden=true;
      try{
        const url=authUser?.role==='admin'?'/api/lab-cases?scope=all':`/api/lab-cases?clinic=${encodeURIComponent(authUser?.clinicId||requestedClinic)}`;
        const response=await api(url),data=await response.json().catch(()=>({}));
        if(response.status===401){location.replace('./');return}
        if(!response.ok)throw new Error(data.error||'تعذر تحميل حالات المعمل');
        cases=Array.isArray(data.cases)?data.cases:[];
        $('syncState').textContent=`${lang==='en'?'Updated':'محدّث'} ${new Date().toLocaleTimeString(lang==='en'?'en-GB':'ar-SA',{hour:'2-digit',minute:'2-digit'})}`;
        render();
      }catch(error){$('errorBox').hidden=false;$('errorBox').textContent=String(error.message||error);$('caseList').innerHTML=`<div class="empty">${esc(lang==='en'?'Could not load lab cases. Press Refresh to try again.':'تعذر تحميل الحالات. اضغط تحديث للمحاولة مرة أخرى.')}</div>`}
      finally{loading=false;$('refreshBtn').disabled=false}
    }
    async function changeStatus(select){
      const item=cases.find(row=>row.id===select.dataset.caseId);if(!item)return;
      const previous=item.status,next=select.value;item.status=next;openRows.add(item.id);render();
      try{
        const response=await api(`/api/lab-cases?clinic=${encodeURIComponent(item.clinicId)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:item.id,clinicId:item.clinicId,status:next})});
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error||'تعذر تحديث الحالة');
        cases=cases.map(row=>row.id===item.id?data.case:row);render();
      }catch(error){item.status=previous;render();$('errorBox').hidden=false;$('errorBox').textContent=String(error.message||error)}
    }
    async function deleteCase(button){
      const item=cases.find(row=>row.id===button.dataset.deleteCase);if(!item)return;
      const patient=item.patient?.name||(lang==='en'?'patient':'المريض');
      if(!confirm(lang==='en'?`Delete the lab case recorded for ${patient}?\n\nThis action cannot be undone.`:`حذف حالة المعمل المسجلة للمريض ${patient}؟\n\nلا يمكن التراجع عن الحذف.`))return;
      button.disabled=true;$('errorBox').hidden=true;
      try{
        const response=await api(`/api/lab-cases?clinic=${encodeURIComponent(item.clinicId)}`,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({id:item.id,clinicId:item.clinicId})});
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error||'تعذر حذف حالة المعمل');
        cases=cases.filter(row=>row.id!==item.id);
        render();
      }catch(error){button.disabled=false;$('errorBox').hidden=false;$('errorBox').textContent=String(error.message||error)}
    }
    function clinicLabel(clinicId){
      const clinic=clinics.find(item=>item.id===clinicId);
      return clinic?`${clinic.name} · ${tx('number')} ${clinic.roomNumber}${clinic.doctorName?` · ${tx('doctor')} ${clinic.doctorName}`:''}`:clinicId;
    }
    function lookupPlaceholder(){
      const type=$('labLookupType').value;
      $('labLookupValue').value='';
      $('labLookupValue').placeholder=type==='phone'?'05xxxxxxxx':type==='national'?(lang==='en'?'10 digits':'10 أرقام'):(lang==='en'?'Enter the file number':'اكتب رقم الملف');
      $('labLookupValue').maxLength=type==='national'?'10':type==='phone'?'20':'40';
      $('labLookupResults').innerHTML='';
      clearSelectedLookupPatient();
    }
    function resetNewCaseFields(){
      $('newLabWorkType').value='';
      $('newLabCustomWork').value='';
      $('newLabCustomWorkLabel').hidden=true;
      $('newLabName').value='';
      $('newLabCustomName').value='';
      $('newLabCustomNameLabel').hidden=true;
      $('newLabUnits').value='1';
      $('newLabMaterial').value='';
      $('newLabShade').value='';
      $('newLabNotes').value='';
      $('newLabSentNow').checked=false;
      $('newLabCaseError').hidden=true;
      $('newLabCaseError').textContent='';
    }
    function clearSelectedLookupPatient(){
      selectedLookupPatient=null;
      $('labCreateDetails').hidden=true;
      $('saveNewLabCaseBtn').disabled=true;
    }
    function openNewCaseModal(){
      resetNewCaseFields();
      clearSelectedLookupPatient();
      $('labLookupType').value='file';
      $('labLookupValue').value='';
      $('labLookupValue').placeholder=lang==='en'?'Enter the file number':'اكتب رقم الملف';
      $('labLookupResults').innerHTML='';
      $('newLabCaseModal').classList.add('open');
      $('newLabCaseModal').setAttribute('aria-hidden','false');
      document.body.style.overflow='hidden';
      setTimeout(()=>$('labLookupValue').focus(),80);
    }
    function closeNewCaseModal(force=false){
      if(saveBusy&&!force)return;
      $('newLabCaseModal').classList.remove('open');
      $('newLabCaseModal').setAttribute('aria-hidden','true');
      document.body.style.overflow='';
    }
    function selectLookupMatch(match){
      selectedLookupPatient=match;
      const patient=match.patient||{};
      $('selectedPatientName').textContent=patient.name||'—';
      $('selectedPatientMeta').textContent=[patient.file?`ملف ${patient.file}`:'',patient.phone?`جوال ${patient.phone}`:'',patient.nationalId?`هوية ${patient.nationalId}`:'',clinicLabel(match.clinicId)].filter(Boolean).join(' · ');
      $('labCreateDetails').hidden=false;
      $('saveNewLabCaseBtn').disabled=false;
      $('labLookupResults').innerHTML='<div class="lookup-message">تم العثور على سجل مطابق وربط الحالة به. أكمل تفاصيل المعمل أدناه.</div>';
      setTimeout(()=>$('newLabWorkType').focus(),60);
    }
    function renderLookupMatches(matches){
      if(!matches.length){$('labLookupResults').innerHTML='<div class="lookup-message error">لم يتم العثور على سجل مطابق. جرّب رقم الجوال أو رقم الهوية، أو تأكد من الرقم المدخل.</div>';return}
      if(matches.length===1){selectLookupMatch(matches[0]);return}
      $('labLookupResults').innerHTML=matches.map((match,index)=>{
        const patient=match.patient||{};
        const meta=[patient.file?`ملف ${patient.file}`:'',patient.phone?`جوال ${patient.phone}`:'',patient.nationalId?`هوية ${patient.nationalId}`:'',clinicLabel(match.clinicId)].filter(Boolean).join(' · ');
        return `<article class="lookup-result"><div><strong>${esc(patient.name||'—')}</strong><small>${esc(meta)}</small></div><button type="button" data-select-lookup="${index}">اختيار وربط</button></article>`;
      }).join('');
      $('labLookupResults').querySelectorAll('[data-select-lookup]').forEach(button=>button.addEventListener('click',()=>selectLookupMatch(matches[Number(button.dataset.selectLookup)])));
    }
    function localLookup(type,value){
      const normalizedValue=type==='file'?String(value||'').replace(/[\s-]+/g,'').toUpperCase():normalize(value);
      const matches=cases.filter(item=>{
        const patient=item.patient||{};
        if(type==='file')return String(patient.file||'').replace(/[\s-]+/g,'').toUpperCase()===normalizedValue;
        if(type==='phone')return normalize(patient.phone)===normalizedValue;
        return normalize(patient.nationalId)===normalizedValue;
      }).map(item=>({patient:item.patient,clinicId:item.clinicId,sourceDate:item.sourceDate||'',source:'preview'}));
      return [...new Map(matches.map(match=>[`${match.clinicId}:${match.patient?.file||match.patient?.phone}`,match])).values()];
    }
    async function performPatientLookup(){
      if(lookupBusy)return;
      const type=$('labLookupType').value,value=$('labLookupValue').value.trim();
      clearSelectedLookupPatient();
      if(!value){$('labLookupResults').innerHTML='<div class="lookup-message error">أدخل رقم البحث أولًا.</div>';$('labLookupValue').focus();return}
      if(type==='national'&&normalize(value).length!==10){$('labLookupResults').innerHTML='<div class="lookup-message error">رقم الهوية يجب أن يتكون من 10 أرقام.</div>';return}
      if(type==='phone'&&normalize(value).length<9){$('labLookupResults').innerHTML='<div class="lookup-message error">أدخل رقم جوال صحيحًا.</div>';return}
      lookupBusy=true;$('labLookupBtn').disabled=true;$('labLookupBtn').textContent='جارٍ البحث…';$('labLookupResults').innerHTML='<div class="lookup-message">جارٍ البحث عن سجل مطابق…</div>';
      try{
        if(['127.0.0.1','localhost'].includes(location.hostname)&&params.get('preview')==='1'){
          renderLookupMatches(localLookup(type,value));return;
        }
        const selectedClinic=authUser?.role==='admin'?($('clinicFilter').value||'all'):(authUser?.clinicId||requestedClinic);
        const query=new URLSearchParams({type,value,clinic:selectedClinic});
        const response=await api(`/api/patient-lookup?${query.toString()}`),data=await response.json().catch(()=>({}));
        if(response.status===401){location.replace('./');return}
        if(!response.ok)throw new Error(data.error||'تعذر البحث عن المريض');
        renderLookupMatches(Array.isArray(data.matches)?data.matches:[]);
      }catch(error){$('labLookupResults').innerHTML=`<div class="lookup-message error">${esc(error.message||'تعذر البحث عن المريض')}</div>`}
      finally{lookupBusy=false;$('labLookupBtn').disabled=false;$('labLookupBtn').textContent='بحث وربط'}
    }
    function changeNewLabUnits(delta){$('newLabUnits').value=String(Math.max(1,Math.min(99,Number($('newLabUnits').value||1)+delta)))}
    function collectNewLabDraft(){
      if(!selectedLookupPatient)return{error:'ابحث عن المريض واربط الحالة بسجله أولًا.'};
      const work=$('newLabWorkType').value,customWork=$('newLabCustomWork').value.trim();
      if(!work)return{error:'اختر نوع حالة المعمل.',focus:'newLabWorkType'};
      if(work==='other'&&!customWork)return{error:'اكتب الإجراء المعملي المطلوب.',focus:'newLabCustomWork'};
      const labName=$('newLabName').value,customLabName=$('newLabCustomName').value.trim();
      if(!labName)return{error:'اختر اسم معمل الأسنان.',focus:'newLabName'};
      if(labName==='other'&&!customLabName)return{error:'اكتب اسم المعمل الآخر.',focus:'newLabCustomName'};
      const units=Math.max(1,Math.min(99,Number($('newLabUnits').value||1)));
      return{labName,customLabName:labName==='other'?customLabName:'',items:[{code:'lab-page-entry',name:work==='other'?customWork:work,quantity:units}],units,material:$('newLabMaterial').value.trim(),shade:$('newLabShade').value.trim(),notes:$('newLabNotes').value.trim(),status:$('newLabSentNow').checked?'sent':'pending_send',sentAt:$('newLabSentNow').checked?Date.now():0};
    }
    async function postNewLabCase(draft,allowDuplicate=false){
      const match=selectedLookupPatient,patient=match.patient||{},clinic=clinics.find(item=>item.id===match.clinicId);
      const response=await api(`/api/lab-cases?clinic=${encodeURIComponent(match.clinicId)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...draft,allowDuplicate,clinicId:match.clinicId,clinicName:clinic?.name||'',roomNumber:clinic?.roomNumber||'',doctorName:clinic?.doctorName||authUser?.displayName||'',patient:{id:patient.id,name:patient.name,file:patient.file,phone:patient.phone},sourceDate:match.sourceDate||''})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok){const error=new Error(data.duplicate?'توجد حالة معمل نشطة لنفس المريض والإجراء.':(data.error||'تعذر حفظ حالة المعمل'));error.code=data.code||'';error.duplicateCase=data.case||null;throw error}
      return data;
    }
    async function saveNewLabCase(){
      if(saveBusy)return;
      const draft=collectNewLabDraft();
      if(draft.error){$('newLabCaseError').hidden=false;$('newLabCaseError').textContent=draft.error;if(draft.focus)$(draft.focus).focus();return}
      saveBusy=true;const button=$('saveNewLabCaseBtn'),original=button.textContent;button.disabled=true;button.textContent='جارٍ الحفظ…';$('newLabCaseError').hidden=true;
      try{
        let data;
        try{data=await postNewLabCase(draft)}catch(error){
          if(error.code!=='DUPLICATE_LAB_CASE')throw error;
          if(!confirm('توجد حالة معمل نشطة مسجلة لنفس المريض والإجراء. هل تريد إضافة حالة أخرى؟'))throw error;
          data=await postNewLabCase(draft,true);
        }
        if(data.case)cases=[data.case,...cases.filter(item=>item.id!==data.case.id)];
        render();closeNewCaseModal(true);
        $('errorBox').hidden=false;$('errorBox').textContent=`تم حفظ حالة المعمل وربطها بالمريض ${selectedLookupPatient?.patient?.name||''}.`;
        setTimeout(()=>{$('errorBox').hidden=true},4500);
      }catch(error){$('newLabCaseError').hidden=false;$('newLabCaseError').textContent=String(error.message||'تعذر حفظ حالة المعمل')}
      finally{saveBusy=false;button.disabled=!selectedLookupPatient;button.textContent=original}
    }
    async function init(){
      applyLanguage();
      if(['127.0.0.1','localhost'].includes(location.hostname)&&params.get('preview')==='1'){
        authUser={role:'admin',displayName:'معاينة محلية'};
        clinics=[
          {id:'clinic-1',name:'العيادة الأولى',roomNumber:'1',doctorName:'الطبيب الأول',active:true},
          {id:'clinic-2',name:'العيادة الثانية',roomNumber:'2',doctorName:'الطبيب الثاني',active:true}
        ];
        cases=[
          {id:'preview-1',clinicId:'clinic-1',patient:{id:'patient-preview-1',name:'سارة',file:'10428',phone:'0550000001',nationalId:'1111111111'},sourceDate:'2026-07-31',labName:'السن الرقمي ديجيتال',items:[{name:'تركيب سيراميك تاج',quantity:2}],units:2,material:'زركون',shade:'A2',status:'in_production',sentAt:Date.now()-3*86400000,updatedAt:Date.now()},
          {id:'preview-2',clinicId:'clinic-2',patient:{id:'patient-preview-2',name:'خالد',file:'8891',phone:'0550000002',nationalId:'2222222222'},sourceDate:'2026-07-31',labName:'دانتي',items:[{name:'قوالب تبييض',quantity:1}],units:1,material:'قوالب شفافة',shade:'',status:'received_clinic',sentAt:Date.now()-5*86400000,receivedAt:Date.now()-3600000,updatedAt:Date.now()-3600000},
          {id:'preview-3',clinicId:'clinic-1',patient:{name:'ريم',file:'7652',phone:'0550000003'},labName:'معمل مروان',items:[{name:'تركيبة زراعة',quantity:1}],units:1,material:'E-max',shade:'B1',status:'needs_adjustment',sentAt:Date.now()-8*86400000,updatedAt:Date.now()-7200000}
        ];
        $('clinicFilter').innerHTML='<option value="all">جميع العيادات</option>'+clinics.map(item=>`<option value="${esc(item.id)}">${esc(item.name)} · رقم ${esc(item.roomNumber)}</option>`).join('');
        $('syncState').textContent='معاينة محلية';
        render();
        if(params.get('create')==='1')openNewCaseModal();
        return;
      }
      const session=await api('/api/auth?action=session'),data=await session.json().catch(()=>({}));
      if(!session.ok||!data.user){location.replace('./');return}
      authUser=data.user;
      $('searchInput').value=params.get('patient')||'';
      await loadClinics();
      await loadCases();
      if(params.get('create')==='1')openNewCaseModal();
    }
    $('languageBtn').addEventListener('click',()=>{lang=lang==='en'?'ar':'en';localStorage.setItem('bestcare_lang',lang);applyLanguage()});
    $('refreshBtn').addEventListener('click',loadCases);
    $('printBtn').addEventListener('click',()=>window.print());
    $('compactPrintBtn').addEventListener('click',()=>window.print());
    $('backBtn').addEventListener('click',()=>{const clinic=$('clinicFilter').value==='all'?requestedClinic:$('clinicFilter').value;location.href=`./?view=${authUser?.role==='admin'?'admin':'clinic'}&clinic=${encodeURIComponent(clinic||requestedClinic)}`});
    ['searchInput','clinicFilter','doctorFilter','labFilter','statusFilter'].forEach(id=>$(id).addEventListener(id==='searchInput'?'input':'change',render));
    $('caseList').addEventListener('change',event=>{if(event.target.matches('[data-case-id]'))changeStatus(event.target)});
    $('caseList').addEventListener('click',event=>{
      const toggle=event.target.closest('[data-toggle-timeline]');
      if(toggle){const id=toggle.dataset.toggleTimeline;openRows.has(id)?openRows.delete(id):openRows.add(id);render();return}
      const button=event.target.closest('[data-delete-case]');if(button)deleteCase(button)
    });
    $('newLabCaseBtn').addEventListener('click',openNewCaseModal);
    document.querySelectorAll('[data-close-new-case]').forEach(button=>button.addEventListener('click',closeNewCaseModal));
    $('newLabCaseModal').addEventListener('click',event=>{if(event.target===$('newLabCaseModal'))closeNewCaseModal()});
    $('labLookupType').addEventListener('change',lookupPlaceholder);
    $('labLookupBtn').addEventListener('click',performPatientLookup);
    $('labLookupValue').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();performPatientLookup()}});
    $('newLabWorkType').addEventListener('change',()=>{$('newLabCustomWorkLabel').hidden=$('newLabWorkType').value!=='other';if(!$('newLabCustomWorkLabel').hidden)$('newLabCustomWork').focus()});
    $('newLabName').addEventListener('change',()=>{$('newLabCustomNameLabel').hidden=$('newLabName').value!=='other';if(!$('newLabCustomNameLabel').hidden)$('newLabCustomName').focus()});
    $('newLabUnitsMinus').addEventListener('click',()=>changeNewLabUnits(-1));
    $('newLabUnitsPlus').addEventListener('click',()=>changeNewLabUnits(1));
    $('saveNewLabCaseBtn').addEventListener('click',saveNewLabCase);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('newLabCaseModal').classList.contains('open'))closeNewCaseModal()});
    init().catch(error=>{$('errorBox').hidden=false;$('errorBox').textContent=String(error.message||error)});
    setInterval(()=>{if(cases.length)render()},60000);
