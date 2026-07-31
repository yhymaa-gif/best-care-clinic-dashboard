(()=>{
  const $=id=>document.getElementById(id);
  const STATUS={new:'جديد',contacted:'تم التواصل',booked:'تم الحجز',closed:'مغلق'};
  const SERVICE={examination:'فحص وتشخيص',pain:'ألم أو حالة عاجلة',restorative:'حشوات وعلاج تحفظي',root_canal:'علاج عصب',prosthodontics:'تركيبات وعدسات',implants:'زراعة أسنان',cosmetic:'تجميل الأسنان والابتسامة',cleaning:'تنظيف الأسنان',other:'خدمة أخرى'};
  const SOURCE={'dr-yahyahadi':'الموقع الشخصي',direct:'الرابط المباشر'};
  const state={items:[],busy:false,timer:null};
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const format=value=>value?new Date(value).toLocaleString('ar-SA',{timeZone:'Asia/Riyadh',dateStyle:'medium',timeStyle:'short'}):'—';
  const waPhone=value=>`966${String(value||'').replace(/\D/g,'').replace(/^0/,'')}`;
  const service=item=>item.service==='other'?(item.serviceOther||SERVICE.other):(SERVICE[item.service]||SERVICE.other);
  const latestHistory=item=>Array.isArray(item.history)&&item.history.length?item.history[item.history.length-1]:null;
  function render(){
    const query=$('searchInput').value.trim().toLowerCase(),status=$('statusFilter').value,source=$('sourceFilter').value;
    const filtered=state.items.filter(item=>(status==='all'||item.status===status)&&(source==='all'||item.source===source)&&(!query||[item.name,item.phone,item.identity].some(value=>String(value||'').toLowerCase().includes(query))));
    $('totalCount').textContent=state.items.length;
    Object.keys(STATUS).forEach(key=>$(key+'Count').textContent=state.items.filter(item=>item.status===key).length);
    $('visibleCount').textContent=filtered.length;
    $('requestList').innerHTML=filtered.length?filtered.map(item=>{
      const history=Array.isArray(item.history)?[...item.history].reverse():[];
      const latest=latestHistory(item);
      const focus=new URLSearchParams(location.search).get('focus')===item.id;
      return `<article class="request-card ${item.status==='new'?'is-new':''}" id="request-${escape(item.id)}" ${focus?'data-focus="true"':''}>
        <div class="request-main">
          <section class="patient"><h2>${escape(item.name)}</h2><div class="contact"><a class="pill phone" href="https://wa.me/${waPhone(item.phone)}" target="_blank" rel="noopener">واتساب ${escape(item.phone)}</a><span class="pill">هوية ${escape(item.identity)}</span><span class="pill status-${escape(item.status)}">${escape(STATUS[item.status]||STATUS.new)}</span></div>${item.note?`<p class="note">${escape(item.note)}</p>`:''}</section>
          <section class="request-meta"><p>الخدمة<strong>${escape(service(item))}</strong></p><p class="source">المصدر<strong>${escape(SOURCE[item.source]||'رابط خارجي')}</strong></p><p>تاريخ الطلب<strong>${escape(format(item.createdAt))}</strong></p>${latest?`<p>آخر إجراء<strong>${escape(STATUS[latest.status]||'تحديث')} · ${escape(latest.by||'النظام')}</strong></p>`:''}</section>
          <section class="action-box">
            <label>حالة الطلب<select data-status="${escape(item.id)}">${Object.entries(STATUS).map(([value,label])=>`<option value="${value}" ${item.status===value?'selected':''}>${label}</option>`).join('')}</select></label>
            <label>ملاحظة الإجراء<input data-note="${escape(item.id)}" maxlength="220" placeholder="مثال: تم الاتصال وتأكيد الوقت"></label>
            <button class="save" type="button" data-save="${escape(item.id)}">حفظ الإجراء</button>
          </section>
        </div>
        <details class="timeline"><summary>سجل المتابعة (${history.length})</summary><ol>${history.length?history.map(entry=>`<li><strong class="status-${escape(entry.status)}">${escape(STATUS[entry.status]||'تحديث')}</strong>${entry.note?` — ${escape(entry.note)}`:''}<br><time>${escape(format(entry.at))} · ${escape(entry.by||'النظام')}</time></li>`).join(''):'<li>لا يوجد سجل سابق لهذا الطلب.</li>'}</ol></details>
      </article>`;
    }).join(''):'<p class="empty">لا توجد طلبات تطابق البحث الحالي.</p>';
    const focused=document.querySelector('[data-focus="true"]');
    if(focused){focused.scrollIntoView({block:'center'});focused.querySelector('details').open=true}
  }
  async function load({silent=false}={}){
    if(state.busy)return;state.busy=true;$('refreshBtn').disabled=true;
    try{
      const response=await fetch('/api/appointment-requests?limit=200',{headers:{accept:'application/json'},cache:'no-store',credentials:'include'});
      const data=await response.json();
      if(response.status===401){location.href='./?view=admin';return}
      if(!response.ok)throw new Error(data.error||'تعذر تحميل الطلبات');
      state.items=Array.isArray(data.requests)?data.requests:[];
      $('updatedAt').textContent=`آخر تحديث ${format(data.updatedAt||Date.now())}`;$('errorBox').hidden=true;render();
    }catch(error){$('errorBox').textContent='تعذر تحديث طلبات المواعيد الآن. تحقق من الاتصال ثم أعد المحاولة.';$('errorBox').hidden=false;if(!silent)$('requestList').innerHTML='<p class="empty">تعذر تحميل البيانات.</p>'}
    finally{state.busy=false;$('refreshBtn').disabled=false;schedule()}
  }
  async function save(id,button){
    const status=document.querySelector(`[data-status="${CSS.escape(id)}"]`).value;
    const note=document.querySelector(`[data-note="${CSS.escape(id)}"]`).value.trim();
    button.disabled=true;button.textContent='جارٍ الحفظ…';
    try{
      const response=await fetch('/api/appointment-requests',{method:'PATCH',headers:{'content-type':'application/json'},credentials:'include',body:JSON.stringify({id,status,note})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'تعذر الحفظ');
      const index=state.items.findIndex(item=>item.id===id);if(index>=0)state.items[index]=data.request;
      try{new BroadcastChannel('bestcare-appointment-requests').postMessage({type:'updated',id})}catch{}
      render();
    }catch{$('errorBox').textContent='تعذر حفظ الإجراء. حاول مرة أخرى.';$('errorBox').hidden=false}
    finally{button.disabled=false;button.textContent='حفظ الإجراء'}
  }
  function cadence(){
    const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Riyadh',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()),read=type=>parts.find(part=>part.type===type)?.value||'',working=read('weekday')!=='Fri'&&Number(read('hour'))>=14&&Number(read('hour'))<23;
    return working?(document.hidden?120000:30000):(document.hidden?900000:180000);
  }
  function schedule(){clearTimeout(state.timer);state.timer=setTimeout(()=>load({silent:true}),cadence())}
  $('refreshBtn').addEventListener('click',()=>load());
  $('searchInput').addEventListener('input',render);$('statusFilter').addEventListener('change',render);$('sourceFilter').addEventListener('change',render);
  $('openRequestPage').addEventListener('click',()=>window.open('./appointment-request.html','_blank','noopener'));
  $('requestList').addEventListener('click',event=>{const button=event.target.closest('[data-save]');if(button)save(button.dataset.save,button)});
  document.addEventListener('visibilitychange',()=>{schedule();if(!document.hidden)load({silent:true})});
  load();
})();
