(()=>{
'use strict';
const $=id=>document.getElementById(id);
const token=new URLSearchParams(location.search).get('token')||'';
const labels={ibuprofen:'إيبوبروفين',paracetamol:'باراسيتامول'};
const date=value=>{try{return new Intl.DateTimeFormat('ar-SA',{dateStyle:'long'}).format(new Date(value))}catch{return'—'}};
function showError(message){$('loadingState').hidden=true;$('errorState').hidden=false;$('errorMessage').textContent=message||'الرابط غير صالح أو غير متاح.'}
function renderMedication(item){const name=labels[item.type]||item.name;return`<article class="medication-row"><span><small>المسكن</small><strong>${escapeHtml(name)}</strong></span><span><small>الجرعة</small><strong>${escapeHtml(item.dose)}</strong></span><span><small>التكرار</small><strong>${escapeHtml(item.frequency)}</strong></span><span><small>المدة</small><strong>${escapeHtml(item.duration)}</strong></span><span><small>ملاحظات الطبيب</small><strong>${escapeHtml(item.notes||'—')}</strong></span></article>`}
function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}
async function load(){
  if(!/^[a-zA-Z0-9_-]{40,120}$/.test(token)){showError('رابط التعليمات غير صالح. اطلب من العيادة إعادة إرساله.');return}
  try{
    const response=await fetch(`/api/root-canal-aftercare?token=${encodeURIComponent(token)}`,{cache:'no-store'}),data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'تعذر تحميل التعليمات');
    const document=data.document||{},patient=document.patient||{},clinic=document.clinic||{},medications=Array.isArray(document.medications)?document.medications:[];
    $('clinicName').textContent=clinic.name||'عيادات أفضل عناية الاستشارية للأسنان';$('patientName').textContent=patient.name||'—';$('patientFile').textContent=patient.file||'—';$('procedureDate').textContent=date(document.source?.paymentRequestedAt||data.issuedAt);$('doctorName').textContent=clinic.doctorName||data.issuedBy||'—';$('issuedAt').textContent=date(data.issuedAt);
    $('patientIntro').textContent=`عزيزنا المراجع ${patient.name||''}، أُجري لك اليوم إجراء لعلاج العصب وجذور الأسنان، مما يستدعي توعيتك بأهمية اتباع التعليمات التالية.`;
    const analgesics=medications.filter(item=>Object.hasOwn(labels,item.type));$('medicationList').innerHTML=analgesics.map(renderMedication).join('');$('noMedication').hidden=analgesics.length>0;
    $('loadingState').hidden=true;$('aftercarePage').hidden=false;$('pageActions').hidden=false;
  }catch(error){showError('تعذر فتح التعليمات الآن. تأكد من الرابط أو تواصل مع العيادة لإعادة إرساله.')}
}
$('printBtn').addEventListener('click',()=>window.print());
$('shareBtn').addEventListener('click',async()=>{const data={title:'تعليمات ما بعد علاج العصب',text:'تعليمات ما بعد علاج العصب وجذور الأسنان من عيادات أفضل عناية.',url:location.href};if(navigator.share){try{await navigator.share(data)}catch{}}else{try{await navigator.clipboard.writeText(location.href);$('shareBtn').textContent='تم نسخ الرابط'}catch{}}});
load();
})();
