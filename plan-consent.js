(()=>{
  const $=id=>document.getElementById(id);
  const params=new URLSearchParams(location.search),token=(params.get('token')||'').trim();
  const lang=params.get('planLang')==='en'||params.get('lang')==='en'?'en':'ar';
  const i18n=window.BestCareTreatmentPlanI18n;
  const tr=(ar,en)=>lang==='en'?en:ar;
  const translate=value=>i18n?.exact(value,lang)||value;
  i18n?.apply(document.body,lang);
  document.title=tr('مراجعة وتوقيع الخطة العلاجية | أفضل عناية','Review and Sign Treatment Plan | Best Care');
  const API='/api/treatment-plan-consent';
  const money=new Intl.NumberFormat(lang==='en'?'en-SA':'ar-SA',{style:'currency',currency:'SAR',maximumFractionDigits:2});
  const dateTime=new Intl.DateTimeFormat(lang==='en'?'en-GB':'ar-SA-u-ca-gregory-nu-latn',{dateStyle:'medium',timeStyle:'short'});
  const canvas=$('signatureCanvas'),context=canvas.getContext('2d',{willReadFrequently:false});
  let drawing=false,lastPoint=null,strokeLength=0,loaded=false;
  const procedureEn=new Map([
    ['الكشف','Examination'],['حشوة تجميلية','Cosmetic filling'],['حشوة تجميلية بعد علاج العصب','Post-root-canal filling'],['علاج عصب','Root canal treatment'],['إعادة علاج عصب','Root canal retreatment'],['تنظيف أسنان عادي','Standard dental cleaning'],['تنظيف أسنان GBT','GBT dental cleaning'],['معالجة اللثة وتهيئة الأنسجة','Periodontal treatment and tissue preparation'],['تحليل ابتسامة','Smile analysis'],['إزالة وتد','Post removal'],['تركيب وتد','Post placement'],['إزالة تاج','Crown removal'],['إعادة تثبيت تاج','Crown recementation'],['تصميم ابتسامة','Smile design'],['خلع الأسنان','Tooth extraction'],['تطعيم عظمي','Bone graft'],['رفع الجيب الأنفي','Sinus lift'],['أشعة مقطعية','CBCT scan'],['زراعة — الجزء الجراحي','Dental implant — surgical stage'],['كشف الزراعة','Implant uncovering'],['تركيب دعامة الالتئام','Healing abutment placement'],['تركيب سيراميك تاج','Ceramic crown'],['تركيب سيراميك فينير','Ceramic veneer'],['طبعة أو مسح رقمي للزراعة','Implant impression or digital scan'],['تركيبة مؤقتة على الزراعة','Temporary implant restoration'],['دعامة زراعة للتركيب','Implant prosthetic abutment'],['تركيبة زراعة نهائية','Final implant restoration'],['تركيب مؤقت','Temporary restoration'],['إجراء آخر','Other procedure']
  ]);
  const procedureEnByCode=Object.freeze({examination:'Examination','cosmetic-filling':'Cosmetic filling','post-rct-filling':'Post-root-canal filling','root-canal':'Root canal treatment','root-canal-retreatment':'Root canal retreatment','cleaning-standard':'Standard dental cleaning','cleaning-gbt':'GBT dental cleaning','periodontal-treatment':'Periodontal treatment and tissue preparation','smile-analysis':'Smile analysis','remove-post':'Post removal','place-post':'Post placement','remove-crown':'Crown removal','recement-crown':'Crown recementation','smile-design':'Smile design',extraction:'Tooth extraction','bone-graft':'Bone graft','sinus-lift':'Sinus lift','cbct-scan':'CBCT scan','implant-surgery':'Dental implant — surgical stage','implant-uncovering':'Implant uncovering','healing-abutment':'Healing abutment placement','ceramic-crown':'Ceramic crown','ceramic-veneer':'Ceramic veneer','implant-impression':'Implant impression or digital scan','implant-temporary':'Temporary implant restoration','implant-prosthetic-abutment':'Implant prosthetic abutment','implant-crown':'Final implant restoration',temporary:'Temporary restoration',other:'Other procedure'});
  const phaseEn=new Map([['المعالجات الأولية','Preliminary treatment'],['الجراحة والزراعة','Surgery and implants'],['التركيبات','Prosthetics']]);
  const phaseEnByKind=Object.freeze({initial:'Preliminary treatment',implant:'Surgery and implants',prosthetic:'Prosthetics'});

  function setCanvasBackground(){context.save();context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.restore()}
  function clearSignature(){context.clearRect(0,0,canvas.width,canvas.height);setCanvasBackground();strokeLength=0;lastPoint=null;canvas.closest('fieldset').classList.remove('signed');$('signatureHint').textContent=tr('لم يتم إدخال التوقيع بعد','No signature entered yet')}
  function point(event){const rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height}}
  function begin(event){event.preventDefault();drawing=true;lastPoint=point(event);context.beginPath();context.arc(lastPoint.x,lastPoint.y,2.8,0,Math.PI*2);context.fillStyle='#173d30';context.fill();canvas.setPointerCapture?.(event.pointerId)}
  function move(event){if(!drawing)return;event.preventDefault();const next=point(event),distance=Math.hypot(next.x-lastPoint.x,next.y-lastPoint.y);context.beginPath();context.moveTo(lastPoint.x,lastPoint.y);context.lineTo(next.x,next.y);context.strokeStyle='#173d30';context.lineWidth=5;context.lineCap='round';context.lineJoin='round';context.stroke();strokeLength+=distance;lastPoint=next;if(strokeLength>70){canvas.closest('fieldset').classList.add('signed');$('signatureHint').textContent=tr('تم إدخال التوقيع','Signature entered')}}
  function end(event){if(!drawing)return;drawing=false;lastPoint=null;canvas.releasePointerCapture?.(event.pointerId)}
  function showError(message){$('loadingView').hidden=true;$('consentContent').hidden=true;$('signedView').hidden=true;$('errorMessage').textContent=translate(message)||tr('تحقق من الرابط أو اطلب رابطًا جديدًا من العيادة.','Check the link or request a new link from the clinic.');$('errorView').hidden=false}
  function showSigned(at,photoConsent){$('loadingView').hidden=true;$('consentContent').hidden=true;$('errorView').hidden=true;$('signedView').hidden=false;$('signedAt').textContent=at?`${tr('تم حفظ التوقيع داخل الخطة','Signature saved in the plan')} · ${dateTime.format(new Date(at))}`:tr('تم حفظ التوقيع داخل الخطة العلاجية','Signature saved in the treatment plan');const notice=$('signedPhotoNotice');notice.hidden=photoConsent!==false;notice.textContent=photoConsent===false?tr('تم حفظ اختيارك بعدم الموافقة على التصوير الطبي، وهذه الموافقة مستقلة عن موافقة العلاج.','Your choice not to consent to clinical photography was saved. Photography consent is independent from treatment consent.'):''}
  function formatFile(value){const text=String(value||'').trim();if(!text)return'—';return text.length>3?`•••${text.slice(-3)}`:text}
  function addPhase(phase){const section=document.createElement('section');section.className=`phase${phase.deferred?' deferred':''}`;const title=document.createElement('h3'),sourceTitle=String(phase.title||'').trim()||tr('مرحلة علاجية','Treatment stage'),defaultAr={initial:'المعالجات الأولية',implant:'الجراحة والزراعة',prosthetic:'التركيبات'}[phase.kind],defaultEn=phaseEnByKind[phase.kind],isDefault=!phase.title||sourceTitle===defaultAr||sourceTitle===defaultEn;title.textContent=lang==='en'?(isDefault&&defaultEn?defaultEn:(phaseEn.get(sourceTitle)||sourceTitle)):sourceTitle;section.appendChild(title);if(phase.deferred&&!(phase.items||[]).length){const note=document.createElement('p');note.className='phase-deferred-note';note.textContent=tr('سيتم استكمال تفاصيل هذه المرحلة وإضافتها لاحقًا.','The details of this stage will be completed and added later.');section.appendChild(note)}else{const list=document.createElement('ul');(phase.items||[]).forEach(item=>{const row=document.createElement('li'),name=document.createElement('span'),quantity=document.createElement('span'),sourceName=item.code==='other'&&item.customService?item.customService:(item.service||tr('إجراء علاجي','Treatment procedure'));name.textContent=lang==='en'?(item.code==='other'&&item.customService?item.customService:(procedureEnByCode[item.code]||procedureEn.get(sourceName)||sourceName)):sourceName;quantity.textContent=item.included?tr('مشمول','Included'):`${tr('العدد:','Quantity:')} ${Number(item.quantity||1)}`;row.append(name,quantity);list.appendChild(row)});section.appendChild(list)}$('phases').appendChild(section)}
  function renderSummary(summary){$('planTitle').textContent=`${tr('خطة','Plan')} ${summary.planNo||tr('علاجية','Treatment')}`;$('patientName').textContent=`${tr('المريض:','Patient:')} ${summary.patientName||'—'} · ${tr('الملف:','File:')} ${formatFile(summary.fileNo)}`;$('planNo').textContent=summary.planNo||'—';$('planRevision').textContent=String(summary.revision||1);$('issuedAt').textContent=summary.issuedAt?dateTime.format(new Date(summary.issuedAt)):'—';$('doctorName').textContent=summary.doctorName||tr('طبيب العيادة','Clinic clinician');$('validityDays').textContent=String(summary.validityDays||15);$('photoConsent').checked=summary.photoConsent===true;$('signerName').value=summary.patientName||'';$('phases').replaceChildren();(summary.phases||[]).forEach(addPhase);$('beforeTotal').textContent=summary.totals?.before===null?'—':money.format(Number(summary.totals.before||0));$('afterTotal').textContent=summary.totals?.after===null?'—':money.format(Number(summary.totals.after||0));$('loadingView').hidden=true;$('errorView').hidden=true;$('signedView').hidden=true;$('consentContent').hidden=false;loaded=true}
  const wait=duration=>new Promise(resolve=>setTimeout(resolve,duration));
  async function requestPlan(){
    let lastError=new Error(tr('تعذر الاتصال بخدمة الخطط. تحقق من الإنترنت ثم أعد المحاولة.','Unable to contact the plan service. Check your internet connection and try again.'));
    for(let attempt=0;attempt<3;attempt+=1){
      try{
        const response=await fetch(`${API}?token=${encodeURIComponent(token)}`,{cache:'no-store',headers:{accept:'application/json'}});
        const data=await response.json().catch(()=>({}));
        if(response.ok)return data;
        const error=new Error(translate(data.error)||tr('تعذر تحميل الخطة.','Unable to load the plan.'));
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
    if(!token){showError(tr('رابط التوقيع غير مكتمل. اطلب من العيادة إرسال الرابط مرة أخرى.','The signature link is incomplete. Ask the clinic to send it again.'));return}
    const retry=$('retryLoad');
    retry.disabled=true;$('errorView').hidden=true;$('loadingView').hidden=false;
    try{const data=await requestPlan();if(data.status==='signed'){showSigned(data.signedAt,data.summary?.photoConsent);return}renderSummary(data.summary||{})}
    catch(error){showError(error.message)}finally{retry.disabled=false}
  }
  $('signerRole').addEventListener('change',()=>{const guardian=$('signerRole').value==='guardian';$('guardianRelationField').hidden=!guardian;$('guardianRelation').required=guardian;if(!guardian)$('guardianRelation').value=''});
  $('retryLoad').addEventListener('click',load);
  canvas.addEventListener('pointerdown',begin);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('pointerleave',end);$('clearSignature').addEventListener('click',clearSignature);
  $('consentForm').addEventListener('submit',async event=>{event.preventDefault();$('formMessage').className='form-message';if(!loaded||!event.currentTarget.reportValidity())return;if(strokeLength<70){$('formMessage').textContent=tr('وقّع داخل مربع التوقيع قبل الإرسال.','Sign inside the signature box before submitting.');$('formMessage').className='form-message show';canvas.scrollIntoView({behavior:'smooth',block:'center'});return}const button=$('submitConsent');button.disabled=true;button.textContent=tr('جارٍ توثيق الموافقة…','Documenting consent…');try{const response=await fetch(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'sign',token,consentVersion:2,accepted:$('accepted').checked,understood:$('understood').checked,financialAccepted:$('financialAccepted').checked,photoConsent:$('photoConsent').checked,signerRole:$('signerRole').value,signerName:$('signerName').value,guardianRelation:$('guardianRelation').value,signature:canvas.toDataURL('image/png')})}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(translate(data.error)||tr('تعذر حفظ التوقيع.','Unable to save the signature.'));showSigned(data.signedAt,data.photoConsent)}catch(error){$('formMessage').textContent=error.message;$('formMessage').className='form-message show';button.disabled=false;button.textContent=tr('تأكيد الموافقة وإرسال التوقيع','Confirm consent and submit signature')}});
  clearSignature();load();
})();
