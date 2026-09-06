(()=>{
  const $=id=>document.getElementById(id);
  const token=(new URLSearchParams(location.search).get('token')||'').trim();
  const API='/api/treatment-plan-consent';
  const money=new Intl.NumberFormat('ar-SA',{style:'currency',currency:'SAR',maximumFractionDigits:2});
  const dateTime=new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn',{dateStyle:'medium',timeStyle:'short'});
  const canvas=$('signatureCanvas'),context=canvas.getContext('2d',{willReadFrequently:false});
  let drawing=false,lastPoint=null,strokeLength=0,loaded=false;

  function setCanvasBackground(){context.save();context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.restore()}
  function clearSignature(){context.clearRect(0,0,canvas.width,canvas.height);setCanvasBackground();strokeLength=0;lastPoint=null;canvas.closest('fieldset').classList.remove('signed');$('signatureHint').textContent='لم يتم إدخال التوقيع بعد'}
  function point(event){const rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height}}
  function begin(event){event.preventDefault();drawing=true;lastPoint=point(event);context.beginPath();context.arc(lastPoint.x,lastPoint.y,2.8,0,Math.PI*2);context.fillStyle='#173d30';context.fill();canvas.setPointerCapture?.(event.pointerId)}
  function move(event){if(!drawing)return;event.preventDefault();const next=point(event),distance=Math.hypot(next.x-lastPoint.x,next.y-lastPoint.y);context.beginPath();context.moveTo(lastPoint.x,lastPoint.y);context.lineTo(next.x,next.y);context.strokeStyle='#173d30';context.lineWidth=5;context.lineCap='round';context.lineJoin='round';context.stroke();strokeLength+=distance;lastPoint=next;if(strokeLength>70){canvas.closest('fieldset').classList.add('signed');$('signatureHint').textContent='تم إدخال التوقيع'}}
  function end(event){if(!drawing)return;drawing=false;lastPoint=null;canvas.releasePointerCapture?.(event.pointerId)}
  function showError(message){$('loadingView').hidden=true;$('consentContent').hidden=true;$('signedView').hidden=true;$('errorMessage').textContent=message||'تحقق من الرابط أو اطلب رابطًا جديدًا من العيادة.';$('errorView').hidden=false}
  function showSigned(at,photoConsent){$('loadingView').hidden=true;$('consentContent').hidden=true;$('errorView').hidden=true;$('signedView').hidden=false;$('signedAt').textContent=at?`تم حفظ التوقيع داخل الخطة · ${dateTime.format(new Date(at))}`:'تم حفظ التوقيع داخل الخطة العلاجية';const notice=$('signedPhotoNotice');notice.hidden=photoConsent!==false;notice.textContent=photoConsent===false?'تم حفظ اختيارك بعدم الموافقة على التصوير الطبي، وهذه الموافقة مستقلة عن موافقة العلاج.':''}
  function formatFile(value){const text=String(value||'').trim();if(!text)return'—';return text.length>3?`•••${text.slice(-3)}`:text}
  function addPhase(phase){const section=document.createElement('section');section.className='phase';const title=document.createElement('h3');title.textContent=phase.title||'مرحلة علاجية';section.appendChild(title);const list=document.createElement('ul');(phase.items||[]).forEach(item=>{const row=document.createElement('li'),name=document.createElement('span'),quantity=document.createElement('span');name.textContent=item.service||'إجراء علاجي';quantity.textContent=item.included?'مشمول':`العدد: ${Number(item.quantity||1)}`;row.append(name,quantity);list.appendChild(row)});section.appendChild(list);$('phases').appendChild(section)}
  function renderSummary(summary){$('planTitle').textContent=`خطة ${summary.planNo||'علاجية'}`;$('patientName').textContent=`المريض: ${summary.patientName||'—'} · الملف: ${formatFile(summary.fileNo)}`;$('planNo').textContent=summary.planNo||'—';$('planRevision').textContent=String(summary.revision||1);$('issuedAt').textContent=summary.issuedAt?dateTime.format(new Date(summary.issuedAt)):'—';$('doctorName').textContent=summary.doctorName||'طبيب العيادة';$('validityDays').textContent=String(summary.validityDays||15);$('photoConsent').checked=summary.photoConsent===true;$('signerName').value=summary.patientName||'';$('phases').replaceChildren();(summary.phases||[]).forEach(addPhase);$('beforeTotal').textContent=summary.totals?.before===null?'—':money.format(Number(summary.totals.before||0));$('afterTotal').textContent=summary.totals?.after===null?'—':money.format(Number(summary.totals.after||0));$('loadingView').hidden=true;$('errorView').hidden=true;$('signedView').hidden=true;$('consentContent').hidden=false;loaded=true}
  const wait=duration=>new Promise(resolve=>setTimeout(resolve,duration));
  async function requestPlan(){
    let lastError=new Error('تعذر الاتصال بخدمة الخطط. تحقق من الإنترنت ثم أعد المحاولة.');
    for(let attempt=0;attempt<3;attempt+=1){
      try{
        const response=await fetch(`${API}?token=${encodeURIComponent(token)}`,{cache:'no-store',headers:{accept:'application/json'}});
        const data=await response.json().catch(()=>({}));
        if(response.ok)return data;
        const error=new Error(data.error||'تعذر تحميل الخطة.');
        error.retryable=response.status>=500||response.status===408||response.status===429;
        if(!error.retryable)throw error;
        lastError=error;
      }catch(error){
        lastError=error;
        if(error.retryable===false)throw error;
      }
      if(attempt<2)await wait(700*(attempt+1));
    }
    throw lastError;
  }
  async function load(){
    if(!token){showError('رابط التوقيع غير مكتمل. اطلب من العيادة إرسال الرابط مرة أخرى.');return}
    const retry=$('retryLoad');
    retry.disabled=true;$('errorView').hidden=true;$('loadingView').hidden=false;
    try{const data=await requestPlan();if(data.status==='signed'){showSigned(data.signedAt,data.summary?.photoConsent);return}renderSummary(data.summary||{})}
    catch(error){showError(error.message)}finally{retry.disabled=false}
  }
  $('signerRole').addEventListener('change',()=>{const guardian=$('signerRole').value==='guardian';$('guardianRelationField').hidden=!guardian;$('guardianRelation').required=guardian;if(!guardian)$('guardianRelation').value=''});
  $('retryLoad').addEventListener('click',load);
  canvas.addEventListener('pointerdown',begin);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('pointerleave',end);$('clearSignature').addEventListener('click',clearSignature);
  $('consentForm').addEventListener('submit',async event=>{event.preventDefault();$('formMessage').className='form-message';if(!loaded||!event.currentTarget.reportValidity())return;if(strokeLength<70){$('formMessage').textContent='وقّع داخل مربع التوقيع قبل الإرسال.';$('formMessage').className='form-message show';canvas.scrollIntoView({behavior:'smooth',block:'center'});return}const button=$('submitConsent');button.disabled=true;button.textContent='جارٍ توثيق الموافقة…';try{const response=await fetch(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'sign',token,consentVersion:2,accepted:$('accepted').checked,understood:$('understood').checked,financialAccepted:$('financialAccepted').checked,photoConsent:$('photoConsent').checked,signerRole:$('signerRole').value,signerName:$('signerName').value,guardianRelation:$('guardianRelation').value,signature:canvas.toDataURL('image/png')})}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'تعذر حفظ التوقيع.');showSigned(data.signedAt,data.photoConsent)}catch(error){$('formMessage').textContent=error.message;$('formMessage').className='form-message show';button.disabled=false;button.textContent='تأكيد الموافقة وإرسال التوقيع'}});
  clearSignature();load();
})();
