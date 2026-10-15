(()=>{
'use strict';
const $=id=>document.getElementById(id);
const token=new URLSearchParams(location.search).get('token')||'';
const labels={ibuprofen:'إيبوبروفين',paracetamol:'باراسيتامول'};
const date=value=>{try{return new Intl.DateTimeFormat('ar-SA',{dateStyle:'long'}).format(new Date(value))}catch{return'—'}};
function showError(message){$('loadingState').hidden=true;$('errorState').hidden=false;$('errorMessage').textContent=message||'الرابط غير صالح أو غير متاح.'}
function renderMedication(item,adminGeneral=false){const name=labels[item.type]||item.name;if(adminGeneral)return`<article class="medication-row general-suggestion"><span><small>المسكن المقترح</small><strong>${escapeHtml(name)}</strong></span><span><small>التركيز</small><strong>${escapeHtml(item.dose)}</strong></span></article>`;return`<article class="medication-row"><span><small>المسكن</small><strong>${escapeHtml(name)}</strong></span><span><small>التركيز</small><strong>${escapeHtml(item.dose)}</strong></span><span><small>التكرار</small><strong>${escapeHtml(item.frequency)}</strong></span><span><small>المدة</small><strong>${escapeHtml(item.duration)}</strong></span><span><small>ملاحظات الطبيب</small><strong>${escapeHtml(item.notes||'—')}</strong></span></article>`}
function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}
async function load(){
  if(!/^[a-zA-Z0-9_-]{40,120}$/.test(token)){showError('رابط التعليمات غير صالح. اطلب من العيادة إعادة إرساله.');return}
  try{
    const response=await fetch(`/api/root-canal-aftercare?token=${encodeURIComponent(token)}`,{cache:'no-store'}),data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'تعذر تحميل التعليمات');
    const document=data.document||{},patient=document.patient||{},clinic=document.clinic||{},adminGeneral=document.deliveryMode==='admin-general',medications=Array.isArray(document.medications)?document.medications:[];
    $('clinicName').textContent=clinic.name||'عيادات أفضل عناية الاستشارية للأسنان';$('patientName').textContent=patient.name||'—';$('patientFile').textContent=patient.file||'—';$('procedureDate').textContent=date(document.source?.paymentRequestedAt||data.issuedAt);$('doctorName').textContent=clinic.doctorName||data.issuedBy||'—';$('issuedAt').textContent=date(data.issuedAt);
    $('patientIntro').textContent=`عزيزنا المراجع ${patient.name||''}، أُجري لك اليوم إجراء لعلاج العصب وجذور الأسنان، مما يستدعي توعيتك بأهمية اتباع التعليمات التالية.`;
    if(adminGeneral){
      $('generalModeNotice').hidden=false;$('aftercareSubtitle').textContent='إرشادات من عيادة الطبيب المعالج بعد الإجراء';
      $('medicationInstruction').textContent='إذا ذُكرت توصية اختيارية بمسكن أدناه، فهي لا تحدد التكرار أو المدة. اتبع توجيهات طبيبك الخاصة بك ولا تبدأ دواءً من نفسك.';
      $('medicationHeading').textContent='توصية اختيارية بالمسكنات';$('medicationHelp').textContent='تظهر فقط إذا اختيرت لهذا المريض، دون تكرار أو مدة.';
      $('noMedication').textContent='لم تُرفق توصية بمسكن في هذه الورقة. اتبع فقط توجيهات طبيبك الخاصة بك.';
      $('issuerLabel').textContent='جهة الإرسال';$('doctorName').textContent='عيادة الطبيب المعالج';
      $('issuerNote').textContent='هذه إرشادات عناية من عيادة الطبيب المعالج. أي دواء آخر أو مضاد حيوي يحدده الطبيب بقرار منفصل.';
    }
    const analgesics=medications.filter(item=>Object.hasOwn(labels,item.type));$('medicationList').innerHTML=analgesics.map(item=>renderMedication(item,adminGeneral)).join('');$('noMedication').hidden=analgesics.length>0;
    $('loadingState').hidden=true;$('aftercarePage').hidden=false;$('pageActions').hidden=false;
  }catch(error){showError('تعذر فتح التعليمات الآن. تأكد من الرابط أو تواصل مع العيادة لإعادة إرساله.')}
}
async function aftercarePdfFile(){
  const response=await fetch(`/api/root-canal-aftercare?token=${encodeURIComponent(token)}&format=pdf`,{cache:'no-store'});
  if(!response.ok||!String(response.headers.get('content-type')||'').includes('application/pdf'))throw new Error('تعذر تجهيز ملف PDF.');
  const blob=await response.blob();return typeof File==='function'?new File([blob],'root-canal-aftercare.pdf',{type:'application/pdf'}):blob;
}
function downloadPdf(file){const objectUrl=URL.createObjectURL(file),anchor=document.createElement('a');anchor.href=objectUrl;anchor.download='root-canal-aftercare.pdf';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),60000)}
function actionNotice(message){$('actionNotice').hidden=false;$('actionNotice').textContent=message}
const whatsappIntroduction='عزيزنا المراجع، هذه تعليمات تخص التعامل مع الإزعاج الذي يرتبط عادةً بعلاج العصب وجذور الأسنان. يرجى الاطلاع عليها والعمل بما ورد فيها. سلامتك غايتنا.';
async function copyWhatsappIntroduction(){try{if(!navigator.clipboard?.writeText)throw new Error('clipboard-unavailable');await navigator.clipboard.writeText(whatsappIntroduction);return true}catch{return false}}
$('printBtn').addEventListener('click',async()=>{try{downloadPdf(await aftercarePdfFile());actionNotice('تم تنزيل ملف PDF. افتحه للطباعة أو الحفظ.')}catch{actionNotice('تعذر تنزيل ملف PDF الآن. تواصل مع العيادة.')}});
$('shareBtn').addEventListener('click',async()=>{const copied=await copyWhatsappIntroduction();try{const file=await aftercarePdfFile();if(typeof File==='function'&&navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'تعليمات ما بعد علاج العصب',text:whatsappIntroduction});actionNotice(copied?'تمت مشاركة الملف ونسخ مقدمة الرسالة. إذا لم يظهر النص في واتساب، الصقه داخل المحادثة.':'تمت مشاركة الملف. إذا لم يظهر النص في واتساب، انسخ المقدمة التالية وأرسلها معه: '+whatsappIntroduction)}else{downloadPdf(file);actionNotice(copied?'تم تنزيل ملف PDF ونسخ المقدمة. الصقها في واتساب ثم أرفق الملف.':'تم تنزيل ملف PDF. أرفقه يدويًا في واتساب مع المقدمة التالية: '+whatsappIntroduction)}}catch(error){if(error?.name!=='AbortError')actionNotice('تعذرت مشاركة ملف PDF الآن. حاول تنزيله أو تواصل مع العيادة.')}});
load();
})();
