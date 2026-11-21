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
    function setRange(days){$('toDate').value=isoDate(new Date());$('fromDate').value=addDays($('toDate').value,1-days);document.querySelectorAll('[data-days]').forEach(button=>button.classList.toggle('active',Number(button.dataset.days)===days));document.querySelector('[data-month]')?.classList.remove('active');loadStats()}
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
      rows.push([]);rows.push(['نوع الإجراء','العدد','المرضى','الزيارات','النسبة %']);(latest.procedureTypes||[]).forEach(item=>rows.push([item.label,item.count,item.patients,item.visits,item.share]));
      rows.push([]);rows.push(['عمل المعمل','الوحدات']);(latest.topLabWork||[]).forEach(item=>rows.push([item.name,item.count]));
      rows.push([]);rows.push(['العيادة','الطبيب','المواعيد','المرضى المعالجون','الإجراءات','أُرسل للمعمل','المنجز','الملغي','دفع معلق','الخطط']);
      (latest.clinics||[]).forEach(item=>rows.push([item.name,item.doctorName,item.appointments,item.treatedPatients,item.procedures,item.labSent,item.completed,item.cancelled,item.paymentPending,item.plans]));
      const cell=value=>{const text=String(value??'');const safe=/^[=+\-@]/.test(text)?`'${text}`:text;return /[",\n]/.test(safe)?`"${safe.replace(/"/g,'""')}"`:safe};
      const blob=new Blob(['\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
      const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`bestcare-statistics-${latest.from}-${latest.to}.csv`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
    }
    // ---- Performance reading (trend vs previous period + monthly direction) ----
    let latestMonths=null;
    const T=window.BestCareTrends;
    const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const monthShift=(date,months)=>{const y=Number(date.slice(0,4)),m=Number(date.slice(5,7))-1+months,d=Number(date.slice(8,10));const last=new Date(Date.UTC(y,m+1,0)).getUTCDate();return new Date(Date.UTC(y,m,Math.min(d,last))).toISOString().slice(0,10)};
    function compareRange(from,to,mode){if(mode==='lastMonth')return{from:monthShift(from,-1),to:monthShift(to,-1)};if(mode==='lastYear')return{from:monthShift(from,-12),to:monthShift(to,-12)};return null}
    const dayFmt=new Intl.DateTimeFormat('ar-SA',{day:'numeric',month:'short',timeZone:'UTC'});
    const rangeText=(from,to)=>{const a=dayFmt.format(new Date(`${from}T00:00:00Z`)),b=dayFmt.format(new Date(`${to}T00:00:00Z`));return from===to?a:`${a} – ${b}`};
    const money=new Intl.NumberFormat('ar-SA',{style:'currency',currency:'SAR',maximumFractionDigits:0});
    function metricValue(row,value){if(row.kind==='money')return money.format((Number(value)||0)/100);if(row.kind==='rate')return`${format(value)}%`;if(row.kind==='minutes')return`${format(value)} د`;return format(value)}
    function changeBadge(row){
      if(row.status==='insufficient')return'<span class="chg flat">—</span>';
      if(!row.diff)return'<span class="chg flat">بدون تغيير</span>';
      const good=row.status==='improving'?'good':row.status==='declining'?'bad':'flat',arrow=row.direction==='up'?'▲':'▼';
      const amount=row.kind==='rate'?`${format(Math.abs(row.pp))} نقطة`:row.pct===null?'':`${format(Math.abs(row.pct))}%`;
      return`<span class="chg ${good}"><span aria-hidden="true">${arrow}</span><bdi>${amount||format(Math.abs(row.diff))}</bdi></span>`;
    }
    const statusText={improving:'تحسّن',declining:'انخفاض',stable:'مستقر',insufficient:'غير كافٍ للحكم'};
    function renderTrends(data){
      if(!T||!data.previous){$('trendPanel').hidden=true;return}
      $('trendPanel').hidden=false;
      const result=T.compareSummaries(data.summary,data.previous.summary),mode=$('compareMode').value;
      $('trendCompareText').textContent=`الفترة الحالية ${rangeText(data.from,data.to)} مقارنةً بـ ${rangeText(data.previous.from,data.previous.to)}${mode==='previous'?' (الفترة السابقة مباشرة)':mode==='lastMonth'?' (نفس الأيام من الشهر الماضي)':' (نفس الأيام من العام الماضي)'}`;
      const verdictCopy={improving:['▲','تحسّن عام','أغلب المؤشرات المهمة أفضل من الفترة السابقة.'],declining:['▼','انخفاض عام','أغلب المؤشرات المهمة أضعف من الفترة السابقة، راجع البنود أدناه.'],stable:['＝','أداء مستقر','التغيرات صغيرة وضمن الحدود الطبيعية (±5%).'],insufficient:['?','البيانات غير كافية للحكم','الأعداد في الفترتين قليلة؛ اختر فترة أطول.']}[result.verdict];
      const v=$('trendVerdict');v.className=`trend-verdict ${result.verdict}`;
      v.innerHTML=`<span class="v-icon">${verdictCopy[0]}</span><strong>${verdictCopy[1]}</strong><p>${esc(verdictCopy[2])}</p><span class="v-score" title="متوسط موزون لتغير المؤشرات، من −50 إلى +50">مؤشر التقدم: <bdi>${result.score>0?'+':''}${format(result.score)}</bdi></span>`;
      const item=row=>`<li><span><b>${esc(row.label)}</b><small>${metricValue(row,row.previous)} ← ${metricValue(row,row.current)}</small></span>${changeBadge(row)}</li>`;
      $('trendUp').innerHTML=result.improving.slice(0,5).map(item).join('')||'<li><span>لا يوجد تحسن واضح في هذه الفترة.</span></li>';
      $('trendDown').innerHTML=result.declining.slice(0,5).map(item).join('')||'<li><span>لا يوجد انخفاض واضح في هذه الفترة. 👍</span></li>';
      $('trendRows').innerHTML=result.rows.map(row=>`<tr><td><b>${esc(row.label)}</b></td><td>${metricValue(row,row.current)}</td><td>${metricValue(row,row.previous)}</td><td>${changeBadge(row)}</td><td><span class="status-chip ${row.status}">${statusText[row.status]}</span></td></tr>`).join('');
      const insights=[];
      const clinicMoves=T.movers(data.clinics,data.previous.clinics,{field:'procedures',name:c=>`${c.name||''} · ${c.roomNumber||''}${c.doctorName?` (د. ${c.doctorName})`:''}`});
      const drop=clinicMoves.find(m=>m.diff<0),gain=[...clinicMoves].reverse().find(m=>m.diff>0);
      if(drop)insights.push(['🏥',`أكبر انخفاض في الإجراءات: <b>${esc(drop.name)}</b> من ${format(drop.previous)} إلى ${format(drop.current)}${drop.pct!==null?` (−${format(Math.abs(drop.pct))}%)`:''}.`]);
      if(gain)insights.push(['🚀',`أكبر نمو في الإجراءات: <b>${esc(gain.name)}</b> من ${format(gain.previous)} إلى ${format(gain.current)}${gain.pct!==null?` (+${format(gain.pct)}%)`:''}.`]);
      const procMoves=T.movers(data.topProcedures,data.previous.topProcedures,{key:'key',field:'count',name:p=>p.name});
      const pDrop=procMoves.find(m=>m.diff<0),pGain=[...procMoves].reverse().find(m=>m.diff>0);
      if(pGain)insights.push(['🦷',`الإجراء الأكثر نموًا: <b>${esc(pGain.name)}</b> (${format(pGain.previous)} ← ${format(pGain.current)}).`]);
      if(pDrop)insights.push(['📉',`الإجراء الأكثر تراجعًا: <b>${esc(pDrop.name)}</b> (${format(pDrop.previous)} ← ${format(pDrop.current)}).`]);
      const cancel=result.rows.find(r=>r.key==='cancelRate');
      if(cancel&&cancel.status==='declining')insights.push(['⚠',`نسبة الإلغاء ارتفعت من ${format(cancel.previous)}% إلى ${format(cancel.current)}%؛ راجع التذكير بالمواعيد.`]);
      const pace=latestMonths&&T.monthPace(latestMonths.months,'procedureUnits',{today:isoDate(new Date())});
      if(pace&&pace.reliable&&pace.pct!==null)insights.push([pace.pct>=0?'📈':'📉',`على الوتيرة الحالية سيُنهي هذا الشهر بنحو <b>${format(pace.projected)}</b> إجراء، ${pace.pct>=0?'أعلى':'أقل'} من الشهر الماضي بـ ${format(Math.abs(pace.pct))}%.`]);
      $('trendInsights').innerHTML=insights.map(([icon,text])=>`<div class="insight"><i>${icon}</i><span>${text}</span></div>`).join('');
      renderMonthTrends();
    }
    function renderMonthTrends(){
      const box=$('trendMonths');if(!latestMonths||!T){box.innerHTML='<p class="empty">جارٍ تحميل الأشهر…</p>';return}
      const months=latestMonths.months||[],current=isoDate(new Date()).slice(0,7);
      const fields=[['uniquePatients','المرضى'],['procedureUnits','الإجراءات'],['labSent','المرسل للمعمل'],['completed','المواعيد المكتملة']];
      const recent=[...months].sort((a,b)=>a.month.localeCompare(b.month)).slice(-6);
      box.innerHTML=fields.map(([field,label])=>{
        const trend=T.monthlyTrend(months,field,{currentMonth:current}),pace=T.monthPace(months,field,{today:isoDate(new Date())});
        const max=Math.max(1,...recent.map(m=>Number(m[field])||0),pace?.projected||0);
        const bars=recent.map((m,i)=>{const value=m.month===current&&pace?pace.projected:Number(m[field])||0;return`<i class="${m.month===current?'cur':i===recent.length-2?'last':''}" style="height:${Math.max(4,value/max*100)}%" title="${m.month}: ${format(m[field])}${m.month===current&&pace?` (متوقع ${format(pace.projected)})`:''}"></i>`}).join('');
        const dir=trend.direction==='insufficient'?'<span class="tm-dir insufficient">بيانات غير كافية</span>':`<span class="tm-dir ${trend.direction}">${trend.direction==='up'?'↗ صاعد':trend.direction==='down'?'↘ هابط':'→ مستقر'} <bdi>${trend.slopePct>0?'+':''}${format(trend.slopePct)}%</bdi>/شهر</span>`;
        const paceText=pace&&pace.pct!==null?`الشهر الحالي متوقع <b>${format(pace.projected)}</b> (${pace.pct>=0?'+':'−'}${format(Math.abs(pace.pct))}% عن الماضي)${pace.reliable?'':' · تقدير مبكر'}`:'لا يوجد شهر سابق للمقارنة';
        return`<div class="tm-card"><h5>${label}</h5>${dir}<div class="tm-bars">${bars}</div><small>${paceText}</small></div>`;
      }).join('');
    }
    async function loadMonths(){try{const response=await fetch(`/api/statistics?mode=months&clinic=${encodeURIComponent($('clinicFilter').value)}`,{credentials:'include',cache:'no-store'});if(response.ok){latestMonths=await response.json();if(latest){renderTrends(latest);renderTypeDetail()}else renderMonthTrends()}}catch{}}
    // ---- Procedures by type ----
    const typeColors={diagnostic:'#3f7f98',fillings:'#2f8c67',endo:'#c64555',perio:'#23807e',surgery:'#8a72ba',implant:'#c39a3e',prosthetic:'#d58a25',cosmetic:'#d56b9a',other:'#69887a'};
    let selectedType='';
    function typeChange(type){
      const prev=(latest?.previous?.procedureTypes||[]).find(t=>t.type===type.type),before=Number(prev?.count||0),diff=type.count-before;
      if(Math.max(before,type.count)<5)return'<span class="chg flat">—</span>';
      if(!diff)return'<span class="chg flat">بدون تغيير</span>';
      const pct=before?Math.round(Math.abs(diff)/before*100):null,cls=Math.abs(pct??100)<=5?'flat':diff>0?'good':'bad';
      return`<span class="chg ${cls}" title="الفترة السابقة: ${format(before)}"><span aria-hidden="true">${diff>0?'▲':'▼'}</span><bdi>${pct===null?format(Math.abs(diff)):`${format(pct)}%`}</bdi></span>`;
    }
    function renderTypes(data){
      const types=data.procedureTypes||[],total=Number(data.summary?.procedureUnits||0);
      $('typesTotal').textContent=`${format(total)} إجراء`;
      if(!types.length){$('typesList').innerHTML='<div class="empty">لا توجد إجراءات مسجلة في الفترة المحددة.</div>';$('typeDetail').innerHTML='';return}
      if(!types.some(t=>t.type===selectedType))selectedType=types[0].type;
      const max=Math.max(1,...types.map(t=>t.count));
      $('typesList').innerHTML=types.map(t=>`<button type="button" role="listitem" class="type-row${t.type===selectedType?' active':''}" data-type="${t.type}" style="--c:${typeColors[t.type]||'#69887a'}"><i></i><span class="type-main"><b>${esc(t.label)}</b><small>${format(t.patients)} مريض · ${format(t.visits)} زيارة · ${format(t.share)}% من الإجراءات</small><span class="type-bar"><span style="width:${t.count/max*100}%"></span></span></span><span class="type-side"><strong>${format(t.count)}</strong>${typeChange(t)}</span></button>`).join('');
      renderTypeDetail();
    }
    function renderTypeDetail(){
      const data=latest,type=(data?.procedureTypes||[]).find(t=>t.type===selectedType);if(!type){$('typeDetail').innerHTML='';return}
      const color=typeColors[type.type]||'#69887a',box=$('typeDetail');box.style.setProperty('--c',color);
      const bars=(rows,unit='')=>{const max=Math.max(1,...rows.map(r=>r.value));return rows.length?`<div class="stacked-list">${rows.map(r=>`<div class="metric-row"><label title="${esc(r.label)}">${esc(r.label)}</label><div class="metric-track"><div class="metric-fill" style="width:${r.value/max*100}%;background:${color}"></div></div><b>${format(r.value)}${unit}</b></div>`).join('')}</div>`:'<div class="empty">لا توجد بيانات.</div>'};
      const procedures=(type.procedures||[]).map(p=>({label:p.name,value:Number(p.count)||0}));
      const clinics=(data.clinics||[]).map(c=>({label:`${c.name||''} · ${c.roomNumber||''}`,value:Number(c.procedureTypes?.[type.type]||0)})).filter(r=>r.value).sort((a,b)=>b.value-a.value);
      let monthsHtml='<div class="empty">جارٍ تحميل الأشهر…</div>';
      if(latestMonths){
        const current=isoDate(new Date()).slice(0,7),series=[...(latestMonths.months||[])].sort((a,b)=>a.month.localeCompare(b.month)).slice(-6).map(m=>({month:m.month,value:Number(m.types?.[type.type]||0)}));
        const trend=T?T.monthlyTrend(series,'value',{currentMonth:current}):{direction:'insufficient'},max=Math.max(1,...series.map(m=>m.value));
        const mf=new Intl.DateTimeFormat('ar-SA',{month:'short',timeZone:'UTC'});
        monthsHtml=`<div class="type-months">${series.map(m=>`<div class="${m.month===current?'cur':''}" title="${m.month}: ${format(m.value)}"><b>${format(m.value)}</b><i style="height:${Math.max(3,Math.round(m.value/max*52))}px"></i><small>${mf.format(new Date(`${m.month}-01T00:00:00Z`))}</small></div>`).join('')}</div><p style="margin:8px 0 0;font-size:11px;color:var(--muted)">${trend.direction==='insufficient'?'البيانات الشهرية غير كافية للحكم على الاتجاه.':`الاتجاه خلال آخر 3 أشهر مكتملة: <b style="color:${trend.direction==='up'?'#17774c':trend.direction==='down'?'#b23347':'#356f8a'}">${trend.direction==='up'?'صاعد ↗':trend.direction==='down'?'هابط ↘':'مستقر →'} ${trend.slopePct>0?'+':''}${format(trend.slopePct)}%/شهر</b> (الشهر الحالي غير مكتمل).`}</p>`;
      }
      box.innerHTML=`<h4><i></i>${esc(type.label)}</h4><p>${format(type.count)} إجراء · ${format(type.patients)} مريض · ${format(type.share)}% من كل الإجراءات${type.free?` · ${format(type.free)} مجاني`:''}</p><div class="type-block"><h5>الإجراءات داخل هذا النوع</h5>${bars(procedures)}</div><div class="type-block"><h5>حسب العيادة</h5>${bars(clinics)}</div><div class="type-block"><h5>آخر 6 أشهر</h5>${monthsHtml}</div>`;
    }
    $('typesList').addEventListener('click',event=>{const row=event.target.closest('[data-type]');if(!row)return;selectedType=row.dataset.type;document.querySelectorAll('.type-row').forEach(r=>r.classList.toggle('active',r===row));renderTypeDetail()});
    function render(data){latest=data;renderTrends(data);renderTypes(data);renderProcedures(data);renderLabPeriod(data);renderKpis(data.summary);renderDaily(data.daily);renderDonut('statusDonut','statusLegend',data.statusCounts,statusLabels,'statusDonutTotal');renderMetrics('planMetrics',data.planStatusCounts,planLabels);renderDonut('paymentDonut','paymentLegend',{pending:data.paymentCounts.pending,acknowledged:data.paymentCounts.acknowledged,completed:data.paymentCounts.completed},{pending:'بانتظار الإجراء',acknowledged:'تم الاستلام',completed:'تم التنفيذ'},'paymentDonutTotal');renderMetrics('labMetrics',data.labStatusCounts,labLabels);renderClinics(data.clinics);$('appointmentsTotal').textContent=`${format(data.summary.appointments)} موعد`;$('plansTotal').textContent=`${format(data.summary.planTotal)} خطة`;$('paymentsTotal').textContent=`${format(data.paymentCounts.requested)} طلب`;$('labsTotal').textContent=`${format(Object.values(data.labStatusCounts).reduce((a,b)=>a+b,0))} حالة`;$('rangeChip').textContent=`${data.from} — ${data.to}`;const selected=$('clinicFilter').selectedOptions[0];$('clinicChip').textContent=selected?.textContent||'جميع العيادات';$('generatedChip').textContent=`تحديث ${new Date(data.generatedAt).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'})}`;setStatus('تم تحديث المؤشرات من البيانات المركزية.')}
    async function loadStats(){const from=$('fromDate').value,to=$('toDate').value,clinic=$('clinicFilter').value;if(!from||!to||from>to){setStatus('راجع تاريخ البداية والنهاية.','error');return}setStatus('جارٍ تجهيز المؤشرات…','loading');try{const prev=compareRange(from,to,$('compareMode').value),prevQuery=prev?`&pfrom=${prev.from}&pto=${prev.to}`:'';const response=await fetch(`/api/statistics?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&clinic=${encodeURIComponent(clinic)}&compare=1${prevQuery}`,{credentials:'include',cache:'no-store'});if(response.status===401){location.replace('./');return}const data=await response.json();if(!response.ok)throw new Error(data.error||'تعذر تحميل الإحصائيات');render(data)}catch(error){setStatus(error.message||'تعذر تحميل الإحصائيات.','error')}}
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
        loadMonths();
      }catch(error){setStatus('تعذر التحقق من الجلسة. أعد فتح التطبيق.','error')}
    }
    document.querySelectorAll('[data-days]').forEach(button=>button.addEventListener('click',()=>setRange(Number(button.dataset.days))));
    $('refreshBtn').addEventListener('click',loadStats);$('clinicFilter').addEventListener('change',()=>{loadStats();loadMonths()});$('compareMode').addEventListener('change',loadStats);document.querySelector('[data-month]')?.addEventListener('click',event=>{const today=isoDate(new Date());$('toDate').value=today;$('fromDate').value=`${today.slice(0,8)}01`;document.querySelectorAll('[data-days],[data-month]').forEach(b=>b.classList.toggle('active',b===event.currentTarget));$('compareMode').value='lastMonth';loadStats()});$('fromDate').addEventListener('change',()=>document.querySelectorAll('[data-days]').forEach(button=>button.classList.remove('active')));$('toDate').addEventListener('change',()=>document.querySelectorAll('[data-days]').forEach(button=>button.classList.remove('active')));$('printBtn').addEventListener('click',()=>window.print());$('exportBtn').addEventListener('click',exportCsv);
    init();
