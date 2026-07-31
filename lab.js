const $=id=>document.getElementById(id);
    const params=new URLSearchParams(location.search);
    const requestedClinic=/^clinic-([1-9]|1[0-5])$/.test(params.get('clinic')||'')?params.get('clinic'):'clinic-1';
    const statusLabels={pending_send:'بانتظار التسليم للمعمل',sent:'سُلّمت للمعمل',in_production:'قيد التصنيع',ready_at_lab:'جاهزة لدى المعمل',received_clinic:'وصلت ولم تُسلّم',delivered_patient:'سُلّمت للمريض',needs_adjustment:'تحتاج تعديلًا',returned_lab:'أُعيدت للمعمل',cancelled:'ملغاة'};
    const terminalStatuses=new Set(['delivered_patient','cancelled']);
    let authUser=null,cases=[],clinics=[],scope='clinic',loading=false;
    const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const normalize=value=>String(value||'').replace(/\D/g,'');
    async function api(url,options={}){return fetch(url,{credentials:'include',cache:'no-store',...options})}
    function elapsed(start,end=Date.now()){
      if(!Number(start))return'لم يبدأ العداد';
      const ms=Math.max(0,Number(end||Date.now())-Number(start)),days=Math.floor(ms/86400000),hours=Math.floor(ms%86400000/3600000),minutes=Math.floor(ms%3600000/60000);
      if(days)return`${days} يوم${hours?` و${hours} ساعة`:''}`;
      if(hours)return`${hours} ساعة${minutes?` و${minutes} دقيقة`:''}`;
      return`${minutes} دقيقة`;
    }
    function labDuration(item){
      const start=Number(item.sentAt||0);
      if(!start)return{value:'بانتظار التسليم للمعمل',detail:'يبدأ العداد عند تغيير الحالة إلى سُلّمت للمعمل'};
      const finished=Number(item.receivedAt||item.deliveredAt||0);
      const stopped=finished>0&&['received_clinic','delivered_patient'].includes(item.status);
      return{value:`${stopped?'استغرقت':'مضى'} ${elapsed(start,stopped?finished:Date.now())}`,detail:stopped?'من التسليم للمعمل حتى وصولها للعيادة':'منذ تسليمها للمعمل'};
    }
    function itemTone(item){
      if(item.status==='delivered_patient'||item.status==='cancelled')return'done';
      if(item.status==='pending_send')return'pending';
      if(item.status==='received_clinic')return'received';
      if(['needs_adjustment','returned_lab'].includes(item.status))return'adjust';
      return'sent';
    }
    function statusOptions(item){return Object.entries(statusLabels).map(([value,label])=>`<option value="${value}"${item.status===value?' selected':''}>${label}</option>`).join('')}
    function displayDoctor(item){
      const clinic=clinics.find(row=>row.id===item.clinicId);
      return String(item.doctorName||clinic?.doctorName||'').trim()||'غير محدد';
    }
    function priorityRank(item){
      if(terminalStatuses.has(item.status))return 90;
      if(['needs_adjustment','returned_lab'].includes(item.status))return 0;
      if(item.status==='received_clinic')return 1;
      if(item.status==='ready_at_lab')return 2;
      if(item.status==='pending_send')return 3;
      if(item.status==='in_production')return 4;
      if(item.status==='sent')return 5;
      return 6;
    }
    function priorityLabel(item){
      if(['needs_adjustment','returned_lab'].includes(item.status))return'تحتاج إجراء';
      if(item.status==='received_clinic')return'بانتظار التسليم';
      if(item.status==='ready_at_lab')return'جاهزة للاستلام';
      if(item.status==='pending_send')return'بانتظار التسليم للمعمل';
      return statusLabels[item.status]||'حالة معمل';
    }
    function filteredCases(){
      const q=$('searchInput').value.trim().toLowerCase(),clinic=$('clinicFilter').value,doctor=$('doctorFilter').value,lab=$('labFilter').value,status=$('statusFilter').value;
      return cases.filter(item=>{
        const assignedDoctor=displayDoctor(item);
        const searchable=`${item.patient?.name||''} ${item.patient?.file||''} ${item.patient?.phone||''} ${item.labName||''} ${item.customLabName||''} ${assignedDoctor} ${item.clinicName||''}`.toLowerCase();
        return (!q||searchable.includes(q))&&(clinic==='all'||item.clinicId===clinic)&&(doctor==='all'||assignedDoctor===doctor)&&(lab==='all'||displayLab(item)===lab)&&(status==='all'||!terminalStatuses.has(item.status));
      }).sort((a,b)=>priorityRank(a)-priorityRank(b)||Number(a.sentAt||Number.MAX_SAFE_INTEGER)-Number(b.sentAt||Number.MAX_SAFE_INTEGER)||Number(b.updatedAt||0)-Number(a.updatedAt||0));
    }
    function displayLab(item){return item.labName==='other'?(item.customLabName||'معمل آخر'):(item.labName||'—')}
    function render(){
      const active=cases.filter(item=>!terminalStatuses.has(item.status));
      $('activeCount').textContent=active.length;
      $('sentCount').textContent=active.filter(item=>['sent','in_production','ready_at_lab','returned_lab'].includes(item.status)).length;
      $('pendingCount').textContent=active.filter(item=>item.status==='pending_send').length;
      $('receivedCount').textContent=active.filter(item=>item.status==='received_clinic').length;
      $('adjustCount').textContent=active.filter(item=>['needs_adjustment','returned_lab'].includes(item.status)).length;
      $('doneCount').textContent=cases.filter(item=>item.status==='delivered_patient').length;
      const labs=[...new Set(cases.map(displayLab).filter(value=>value&&value!=='—'))].sort((a,b)=>a.localeCompare(b,'ar'));
      const labValue=$('labFilter').value;
      $('labFilter').innerHTML=`<option value="all">جميع المعامل</option>${labs.map(lab=>`<option value="${esc(lab)}">${esc(lab)}</option>`).join('')}`;
      if(labs.includes(labValue))$('labFilter').value=labValue;
      const doctors=[...new Set(cases.map(displayDoctor).filter(value=>value&&value!=='غير محدد'))].sort((a,b)=>a.localeCompare(b,'ar'));
      const doctorValue=$('doctorFilter').value;
      $('doctorFilter').innerHTML=`<option value="all">جميع الأطباء</option>${doctors.map(doctor=>`<option value="${esc(doctor)}">د. ${esc(doctor)}</option>`).join('')}`;
      if(doctors.includes(doctorValue))$('doctorFilter').value=doctorValue;
      const visible=filteredCases();
      $('visibleCount').textContent=`${visible.length} ${visible.length===1?'حالة':'حالات'}`;
      $('caseList').innerHTML=visible.length?visible.map(item=>{
        const tone=itemTone(item),lab=displayLab(item),work=(item.items||[]).map(entry=>`${entry.name} ×${entry.quantity}`).join('، ')||'—';
        const clinic=clinics.find(row=>row.id===item.clinicId);
        const clinicText=clinic?`${clinic.name} · رقم ${clinic.roomNumber}`:(item.clinicName||item.clinicId);
        const doctor=displayDoctor(item);
        const duration=labDuration(item);
        return `<article class="case is-${tone}" data-status-label="${esc(statusLabels[item.status]||item.status)}">
          <span class="case-priority">${esc(priorityLabel(item))}</span>
          <div class="case-main">
            <div class="patient"><strong>${esc(item.patient?.name||'—')}</strong><small>ملف ${esc(item.patient?.file||'—')}${item.patient?.phone?` · ${esc(item.patient.phone)}`:''}</small><div class="assignment"><span class="clinic-pill">${esc(clinicText)}</span><span class="doctor-pill">د. ${esc(doctor)}</span></div></div>
            <div class="lab"><strong>${esc(lab)}</strong><small>${esc(item.material||'المادة غير محددة')}${item.shade?` · لون ${esc(item.shade)}`:''}</small></div>
            <div class="work"><strong>${esc(work)}</strong><small>${item.units} ${item.units===1?'وحدة':'وحدات'}${item.notes?` · ${esc(item.notes)}`:''}</small></div>
            <div class="timer"><b>${esc(duration.value)}</b><small>${esc(duration.detail)}</small></div>
          </div>
          <div class="case-controls">
            <label>حالة المعمل<select class="status-select" data-case-id="${esc(item.id)}" data-clinic-id="${esc(item.clinicId)}" aria-label="تحديث حالة المعمل للمريض ${esc(item.patient?.name||'')}">${statusOptions(item)}</select></label>
            <button class="case-delete" type="button" data-delete-case="${esc(item.id)}" data-clinic-id="${esc(item.clinicId)}">حذف الحالة</button>
          </div>
        </article>`;
      }).join(''):`<div class="empty">لا توجد حالات معمل مطابقة للتصفية.</div>`;
    }
    async function loadClinics(){
      const response=await api('/api/clinics'),data=await response.json().catch(()=>({}));
      if(response.status===401){location.replace('./');return}
      if(!response.ok)throw new Error(data.error||'تعذر تحميل العيادات');
      clinics=(Array.isArray(data.clinics)?data.clinics:[]).filter(item=>item.active);
      const active=authUser?.role==='admin'?clinics:clinics.filter(item=>item.id===authUser?.clinicId);
      $('clinicFilter').innerHTML=`${authUser?.role==='admin'?'<option value="all">جميع العيادات</option>':''}${active.map(item=>`<option value="${esc(item.id)}">${esc(item.name)} · رقم ${esc(item.roomNumber)}</option>`).join('')}`;
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
        $('syncState').textContent=`محدّث ${new Date().toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'})}`;
        render();
      }catch(error){$('errorBox').hidden=false;$('errorBox').textContent=String(error.message||error);$('caseList').innerHTML='<div class="empty">تعذر تحميل الحالات. اضغط تحديث للمحاولة مرة أخرى.</div>'}
      finally{loading=false;$('refreshBtn').disabled=false}
    }
    async function changeStatus(select){
      const item=cases.find(row=>row.id===select.dataset.caseId);if(!item)return;
      const previous=item.status,next=select.value;item.status=next;render();
      try{
        const response=await api(`/api/lab-cases?clinic=${encodeURIComponent(item.clinicId)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:item.id,clinicId:item.clinicId,status:next})});
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error||'تعذر تحديث الحالة');
        cases=cases.map(row=>row.id===item.id?data.case:row);render();
      }catch(error){item.status=previous;render();$('errorBox').hidden=false;$('errorBox').textContent=String(error.message||error)}
    }
    async function deleteCase(button){
      const item=cases.find(row=>row.id===button.dataset.deleteCase);if(!item)return;
      const patient=item.patient?.name||'المريض';
      if(!confirm(`حذف حالة المعمل المسجلة للمريض ${patient}؟\n\nلا يمكن التراجع عن الحذف.`))return;
      button.disabled=true;$('errorBox').hidden=true;
      try{
        const response=await api(`/api/lab-cases?clinic=${encodeURIComponent(item.clinicId)}`,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({id:item.id,clinicId:item.clinicId})});
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error||'تعذر حذف حالة المعمل');
        cases=cases.filter(row=>row.id!==item.id);
        render();
      }catch(error){button.disabled=false;$('errorBox').hidden=false;$('errorBox').textContent=String(error.message||error)}
    }
    async function init(){
      if(['127.0.0.1','localhost'].includes(location.hostname)&&params.get('preview')==='1'){
        authUser={role:'admin',displayName:'معاينة محلية'};
        clinics=[
          {id:'clinic-1',name:'العيادة الأولى',roomNumber:'1',doctorName:'الطبيب الأول',active:true},
          {id:'clinic-2',name:'العيادة الثانية',roomNumber:'2',doctorName:'الطبيب الثاني',active:true}
        ];
        cases=[
          {id:'preview-1',clinicId:'clinic-1',patient:{name:'سارة',file:'10428',phone:'0550000001'},labName:'السن الرقمي ديجيتال',items:[{name:'تركيب سيراميك تاج',quantity:2}],units:2,material:'زركون',shade:'A2',status:'in_production',sentAt:Date.now()-3*86400000,updatedAt:Date.now()},
          {id:'preview-2',clinicId:'clinic-2',patient:{name:'خالد',file:'8891',phone:'0550000002'},labName:'دانتي',items:[{name:'قوالب تبييض',quantity:1}],units:1,material:'قوالب شفافة',shade:'',status:'received_clinic',sentAt:Date.now()-5*86400000,receivedAt:Date.now()-3600000,updatedAt:Date.now()-3600000},
          {id:'preview-3',clinicId:'clinic-1',patient:{name:'ريم',file:'7652',phone:'0550000003'},labName:'معمل مروان',items:[{name:'تركيبة زراعة',quantity:1}],units:1,material:'E-max',shade:'B1',status:'needs_adjustment',sentAt:Date.now()-8*86400000,updatedAt:Date.now()-7200000}
        ];
        $('clinicFilter').innerHTML='<option value="all">جميع العيادات</option>'+clinics.map(item=>`<option value="${esc(item.id)}">${esc(item.name)} · رقم ${esc(item.roomNumber)}</option>`).join('');
        $('syncState').textContent='معاينة محلية';
        render();
        return;
      }
      const session=await api('/api/auth?action=session'),data=await session.json().catch(()=>({}));
      if(!session.ok||!data.user){location.replace('./');return}
      authUser=data.user;
      $('searchInput').value=params.get('patient')||'';
      await loadClinics();
      await loadCases();
    }
    $('refreshBtn').addEventListener('click',loadCases);
    $('printBtn').addEventListener('click',()=>window.print());
    $('compactPrintBtn').addEventListener('click',()=>window.print());
    $('backBtn').addEventListener('click',()=>{const clinic=$('clinicFilter').value==='all'?requestedClinic:$('clinicFilter').value;location.href=`./?view=${authUser?.role==='admin'?'admin':'clinic'}&clinic=${encodeURIComponent(clinic||requestedClinic)}`});
    ['searchInput','clinicFilter','doctorFilter','labFilter','statusFilter'].forEach(id=>$(id).addEventListener(id==='searchInput'?'input':'change',render));
    $('caseList').addEventListener('change',event=>{if(event.target.matches('[data-case-id]'))changeStatus(event.target)});
    $('caseList').addEventListener('click',event=>{const button=event.target.closest('[data-delete-case]');if(button)deleteCase(button)});
    init().catch(error=>{$('errorBox').hidden=false;$('errorBox').textContent=String(error.message||error)});
    setInterval(()=>{if(cases.length)render()},60000);
