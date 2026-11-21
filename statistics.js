const $=id=>document.getElementById(id);
    const nf=new Intl.NumberFormat('ar-SA');
    const df=new Intl.DateTimeFormat('ar-SA',{month:'short',day:'numeric'});
    const statusLabels={waiting:'بانتظار الموعد',arrived:'وصل المريض',early_arrival:'وصول مبكر',active:'قيد العلاج',done:'مكتمل',late:'متأخر',cancel:'ملغي',left:'غادر',asks_delay:'يستفسر عن التأخير'};
    const planLabels={draft:'مسودة',submitted:'معتمدة من الطبيب',patient_accepted:'وافق المريض',approved:'معتمدة من الإدارة',approved_signed:'معتمدة وموقعة',rejected:'مرفوضة',cancelled:'ملغاة'};
    const labLabels={pending_send:'بانتظار الإرسال',sent_coordination:'لدى التنسيق للإرسال',sent:'سُلّمت للمعمل',in_production:'قيد التصنيع',ready_at_lab:'جاهزة بالمعمل',received_clinic:'وصلت للعيادة',delivered_coordination:'سُلّمت للتنسيق',delivered_patient:'سُلّمت للمريض',needs_adjustment:'تحتاج تعديلًا',returned_lab:'أُعيدت للمعمل',cancelled:'ملغاة'};
    const communicationLabels={reviewWhatsapp:'طلب تقييم عبر واتساب',planWhatsapp:'مشاركة خطة عبر واتساب'};
    const colors=['#2f8c67','#54ae7f','#3f7f98','#c79b3d','#d56b78','#8a72ba','#da8b36','#69887a','#c24d5e'];
    let latest=null;
    const isoDate=date=>date.toISOString().slice(0,10);
    const addDays=(value,days)=>{const date=new Date(`${value}T12:00:00`);date.setDate(date.getDate()+days);return isoDate(date)};
    function setRange(days){$('toDate').value=isoDate(new Date());$('fromDate').value=addDays($('toDate').value,1-days);document.querySelectorAll('[data-days]').forEach(button=>button.classList.toggle('active',Number(button.dataset.days)===days));loadStats()}
    function setStatus(text,type=''){const el=$('statusNotice');el.className=`notice ${type}`.trim();el.querySelector('span').textContent=text}
    function format(value){return nf.format(Number(value||0))}
    function renderKpis(summary){document.querySelectorAll('[data-kpi]').forEach(el=>{const key=el.dataset.kpi;const suffix=key==='completionRate'?'%':['averageDelayMinutes','averageStayMinutes'].includes(key)?' د':'';el.textContent=`${format(summary[key])}${suffix}`});const counts=latest?.communicationCounts||{reviewWhatsapp:0,planWhatsapp:0};renderMetrics('communicationMetrics',counts,communicationLabels);$('communicationsTotal').textContent=`${format(Number(counts.reviewWhatsapp||0)+Number(counts.planWhatsapp||0))} مشاركة`}
    function renderDonut(id,legendId,counts,labels,totalId){
      const entries=Object.entries(counts).filter(([,value])=>Number(value)>0),total=entries.reduce((sum,[,value])=>sum+Number(value),0);
      let cursor=0;const stops=entries.map(([key,value],index)=>{const start=cursor;cursor+=total?Number(value)/total*100:0;return`${colors[index%colors.length]} ${start}% ${cursor}%`});
      $(id).style.background=stops.length?`conic-gradient(${stops.join(',')})`:'#dceae3';$(totalId).textContent=format(total);
      $(legendId).innerHTML=entries.length?entries.map(([key,value],index)=>`<div class="legend-item" style="--color:${colors[index%colors.length]}"><i></i><span>${labels[key]||key}</span><b>${format(value)}</b></div>`).join(''):'<div class="empty">لا توجد بيانات في الفترة المحددة.</div>';
    }
    function renderMetrics(id,counts,labels){const entries=Object.entries(counts),max=Math.max(1,...entries.map(([,value])=>Number(value)));$(id).innerHTML=entries.map(([key,value])=>`<div class="metric-row"><label>${labels[key]||key}</label><div class="metric-track"><div class="metric-fill" style="width:${Number(value)/max*100}%"></div></div><b>${format(value)}</b></div>`).join('')}
    function renderDaily(items){const max=Math.max(1,...items.map(item=>Math.max(Number(item.appointments)||0,Number(item.procedures)||0,Number(item.labSent)||0)));const visible=items.length>45?items.filter((_,index)=>index%Math.ceil(items.length/45)===0||index===items.length-1):items;$('dailyBars').innerHTML=visible.map(item=>{const date=new Date(`${item.date}T12:00:00`),label=df.format(date);const procedures=Number(item.procedures||0),lab=Number(item.labSent||0);return`<div class="bar-group" title="${item.date}"><span class="bar" data-value="${item.appointments}" style="height:${item.appointments/max*92}%"></span><span class="bar completed" data-value="${item.completed}" style="height:${item.completed/max*92}%"></span><span class="bar cancelled" data-value="${item.cancelled}" style="height:${item.cancelled/max*92}%"></span><span class="bar procedures" data-value="${procedures}" style="height:${Math.min(procedures/max,1)*92}%"></span><span class="bar lab" data-value="${lab}" style="height:${Math.min(lab/max,1)*92}%"></span><small class="bar-label">${label}</small></div>`}).join('')||'<div class="empty">لا توجد مواعيد.</div>'}
    function renderClinics(items){
      const body=$('clinicRows');
      if(!items.length){
        const row=document.createElement('tr'),cell=document.createElement('td');
        cell.colSpan=11;cell.className='empty';cell.textContent='لا توجد بيانات للعيادات.';
        row.append(cell);body.replaceChildren(row);return;
      }
      const fragment=document.createDocumentFragment();
      items.forEach(item=>{
        const active=Math.max(0,Number(item.appointments)-Number(item.cancelled));
        const rate=active?Math.round(Number(item.completed)/active*100):0;
        const row=document.createElement('tr'),clinicCell=document.createElement('td');
        clinicCell.className='clinic-name';
        const name=document.createElement('strong'),doctor=document.createElement('small');
        name.textContent=`${String(item.name||'العيادة')} · رقم ${String(item.roomNumber||'—')}`;
        doctor.textContent=item.doctorName?`د. ${String(item.doctorName)}`:'لم يحدد الطبيب';
        clinicCell.append(name,doctor);row.append(clinicCell);
        [item.appointments,item.treatedPatients,item.procedures,item.labSent,item.completed,item.cancelled,item.paymentPending,item.plans].forEach(value=>{
          const cell=document.createElement('td');cell.textContent=format(Number(value)||0);row.append(cell);
        });
        const stayCell=document.createElement('td');
        stayCell.textContent=item.stayMeasured?`${format(Number(item.averageStayMinutes)||0)} د`:'—';
        row.append(stayCell);
        const rateCell=document.createElement('td'),rateBadge=document.createElement('span');
        rateBadge.className='rate';rateBadge.textContent=`${format(rate)}%`;rateCell.append(rateBadge);row.append(rateCell);
        fragment.append(row);
      });
      body.replaceChildren(fragment);
    }
    function renderChips(id,chips){
      const fragment=document.createDocumentFragment();
      chips.forEach(([label,value,tone])=>{const chip=document.createElement('span');chip.className=`chip ${tone||''}`.trim();const strong=document.createElement('b');strong.textContent=format(value);chip.append(strong,document.createTextNode(label));fragment.append(chip)});
      $(id).replaceChildren(fragment);
    }
    function renderRanked(id,title,items,{unit='',tone='',detail}={}){
      const target=$(id),fragment=document.createDocumentFragment();
      if(title){const heading=document.createElement('div');heading.className='ranked-title';heading.textContent=title;fragment.append(heading)}
      if(!items.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='لا توجد بيانات في الفترة المحددة.';fragment.append(empty);target.replaceChildren(fragment);return}
      const max=Math.max(1,...items.map(item=>Number(item.count)||0));
      items.forEach(item=>{
        const row=document.createElement('div');row.className='metric-row';
        const label=document.createElement('label');label.textContent=String(item.name||'—');label.title=String(item.name||'');
        const note=detail?detail(item):'';if(note){const small=document.createElement('small');small.textContent=note;label.append(small)}
        const track=document.createElement('div');track.className='metric-track';const fill=document.createElement('div');fill.className=`metric-fill ${tone}`.trim();fill.style.width=`${(Number(item.count)||0)/max*100}%`;track.append(fill);
        const value=document.createElement('b');value.textContent=`${format(item.count)}${unit}`;
        row.append(label,track,value);fragment.append(row);
      });
      target.replaceChildren(fragment);
    }
    function renderProcedures(data){
      const s=data.summary||{};
      $('proceduresTotal').textContent=`${format(s.procedureUnits)} إجراء`;
      renderChips('procedureChips',[[' زيارة بإجراءات',s.visitsWithProcedures],[' مريض أكمل علاجه',s.treatedPatients],[' إجراء مجاني',s.procedureFreeUnits],[' زيارة مكتملة بلا إجراء محدد',s.completedWithoutProcedure,Number(s.completedWithoutProcedure)?'warn':'']]);
      renderRanked('procedureMetrics','الأكثر تنفيذًا',data.topProcedures||[],{tone:'gold',detail:item=>`${format(item.visits)} زيارة${Number(item.free)?` · ${format(item.free)} مجاني`:''}`});
    }
    function renderLabPeriod(data){
      const s=data.summary||{};
      $('labSentTotal').textContent=`${format(s.labSent)} مرسلة`;
      renderChips('labChips',[[' سُجلت',s.labCreated],[' أُرسلت',s.labSent],[' وحدة مرسلة',s.labSentUnits],[' وصلت للعيادة',s.labReceived],[' سُلّمت للمريض',s.labDelivered],[' بانتظار الإرسال',s.labWaitingToSend,Number(s.labWaitingToSend)?'warn':''],[' متأخرة',s.labOverdue,Number(s.labOverdue)?'alert':'']]);
      renderRanked('labWorkMetrics','الأعمال المرسلة (بالوحدات)',data.topLabWork||[],{tone:'blue'});
      renderRanked('labVendorMetrics','المعامل',data.labVendors||[],{detail:item=>`${format(item.units)} وحدة`});
    }
    function exportCsv(){
      if(!latest)return;
      const s=latest.summary||{},rows=[['البند','القيمة']];
      const add=(label,value)=>rows.push([label,value??0]);
      add('من',latest.from);add('إلى',latest.to);add('العيادة',$('clinicFilter').selectedOptions[0]?.textContent||latest.clinic);
      [['عدد المرضى','uniquePatients'],['مرضى أكملوا العلاج','treatedPatients'],['المواعيد','appointments'],['المكتمل','completed'],['الملغي','cancelled'],['نسبة الإنجاز %','completionRate'],['الإجراءات المنفذة','procedureUnits'],['زيارات بإجراءات','visitsWithProcedures'],['إجراءات مجانية','procedureFreeUnits'],['حالات معمل سُجلت','labCreated'],['حالات أُرسلت للمعمل','labSent'],['وحدات أُرسلت للمعمل','labSentUnits'],['وصلت للعيادة','labReceived'],['سُلّمت للمريض','labDelivered'],['معمل متأخر','labOverdue'],['بانتظار الإرسال','labWaitingToSend'],['الخطط العلاجية','planTotal'],['طلبات دفع معلقة','paymentPending']].forEach(([label,key])=>add(label,s[key]));
      rows.push([]);rows.push(['الإجراء','العدد','الزيارات','مجاني']);(latest.topProcedures||[]).forEach(item=>rows.push([item.name,item.count,item.visits,item.free]));
      rows.push([]);rows.push(['عمل المعمل','الوحدات']);(latest.topLabWork||[]).forEach(item=>rows.push([item.name,item.count]));
      rows.push([]);rows.push(['العيادة','الطبيب','المواعيد','المرضى المعالجون','الإجراءات','أُرسل للمعمل','المنجز','الملغي','دفع معلق','الخطط']);
      (latest.clinics||[]).forEach(item=>rows.push([item.name,item.doctorName,item.appointments,item.treatedPatients,item.procedures,item.labSent,item.completed,item.cancelled,item.paymentPending,item.plans]));
      const cell=value=>{const text=String(value??'');const safe=/^[=+\-@]/.test(text)?`'${text}`:text;return /[",\n]/.test(safe)?`"${safe.replace(/"/g,'""')}"`:safe};
      const blob=new Blob(['\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
      const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`bestcare-statistics-${latest.from}-${latest.to}.csv`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
    }
    function render(data){latest=data;renderProcedures(data);renderLabPeriod(data);renderKpis(data.summary);renderDaily(data.daily);renderDonut('statusDonut','statusLegend',data.statusCounts,statusLabels,'statusDonutTotal');renderMetrics('planMetrics',data.planStatusCounts,planLabels);renderDonut('paymentDonut','paymentLegend',{pending:data.paymentCounts.pending,acknowledged:data.paymentCounts.acknowledged,completed:data.paymentCounts.completed},{pending:'بانتظار الإجراء',acknowledged:'تم الاستلام',completed:'تم التنفيذ'},'paymentDonutTotal');renderMetrics('labMetrics',data.labStatusCounts,labLabels);renderClinics(data.clinics);$('appointmentsTotal').textContent=`${format(data.summary.appointments)} موعد`;$('plansTotal').textContent=`${format(data.summary.planTotal)} خطة`;$('paymentsTotal').textContent=`${format(data.paymentCounts.requested)} طلب`;$('labsTotal').textContent=`${format(Object.values(data.labStatusCounts).reduce((a,b)=>a+b,0))} حالة`;$('rangeChip').textContent=`${data.from} — ${data.to}`;const selected=$('clinicFilter').selectedOptions[0];$('clinicChip').textContent=selected?.textContent||'جميع العيادات';$('generatedChip').textContent=`تحديث ${new Date(data.generatedAt).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'})}`;setStatus('تم تحديث المؤشرات من البيانات المركزية.')}
    async function loadStats(){const from=$('fromDate').value,to=$('toDate').value,clinic=$('clinicFilter').value;if(!from||!to||from>to){setStatus('راجع تاريخ البداية والنهاية.','error');return}setStatus('جارٍ تجهيز المؤشرات…','loading');try{const response=await fetch(`/api/statistics?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&clinic=${encodeURIComponent(clinic)}`,{credentials:'include',cache:'no-store'});if(response.status===401){location.replace('./');return}const data=await response.json();if(!response.ok)throw new Error(data.error||'تعذر تحميل الإحصائيات');render(data)}catch(error){setStatus(error.message||'تعذر تحميل الإحصائيات.','error')}}
    async function init(){
      try{
        const session=await fetch('/api/auth?action=session',{credentials:'include',cache:'no-store'}),auth=await session.json();
        if(!session.ok||!auth.authenticated){location.replace('./');return}
        if(auth.user?.role!=='admin'){location.replace('./?view=clinic');return}
        const clinicsResponse=await fetch('/api/clinics',{credentials:'include',cache:'no-store'}),clinicData=await clinicsResponse.json();
        (clinicData.clinics||[]).filter(item=>item.active).forEach(item=>{
          const option=document.createElement('option');
          option.value=String(item.id||'');
          option.textContent=`${String(item.name||'العيادة')} · رقم ${String(item.roomNumber||'—')}${item.doctorName?` · د. ${String(item.doctorName)}`:''}`;
          $('clinicFilter').append(option);
        });
        const params=new URLSearchParams(location.search),from=params.get('from')||'',to=params.get('to')||'',clinic=params.get('clinic')||'';
        if(clinic&&[...$('clinicFilter').options].some(option=>option.value===clinic))$('clinicFilter').value=clinic;
        if(/^\d{4}-\d{2}-\d{2}$/.test(from)&&/^\d{4}-\d{2}-\d{2}$/.test(to)&&from<=to){$('fromDate').value=from;$('toDate').value=to;document.querySelectorAll('[data-days]').forEach(button=>button.classList.remove('active'));loadStats()}
        else setRange(30);
      }catch(error){setStatus('تعذر التحقق من الجلسة. أعد فتح التطبيق.','error')}
    }
    document.querySelectorAll('[data-days]').forEach(button=>button.addEventListener('click',()=>setRange(Number(button.dataset.days))));
    $('refreshBtn').addEventListener('click',loadStats);$('clinicFilter').addEventListener('change',loadStats);$('fromDate').addEventListener('change',()=>document.querySelectorAll('[data-days]').forEach(button=>button.classList.remove('active')));$('toDate').addEventListener('change',()=>document.querySelectorAll('[data-days]').forEach(button=>button.classList.remove('active')));$('printBtn').addEventListener('click',()=>window.print());$('exportBtn').addEventListener('click',exportCsv);
    init();
