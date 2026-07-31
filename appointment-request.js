(()=>{
  const isMobile=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  document.documentElement.classList.toggle('mobile-device',isMobile);
  const $=id=>document.getElementById(id),startedAt=Date.now(),source=new URLSearchParams(location.search).get('source')||'direct',form=$('requestForm'),button=$('submitBtn'),message=$('message');
  $('service').addEventListener('change',()=>{$('serviceOtherField').hidden=$('service').value!=='other'});
  form.addEventListener('submit',async event=>{
    event.preventDefault();message.className='message';
    if(!form.reportValidity())return;
    button.disabled=true;button.textContent='جارٍ إرسال الطلب…';
    try{
      const response=await fetch('/api/appointment-requests',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:$('name').value,phone:$('phone').value,identity:$('identity').value,service:$('service').value,serviceOther:$('serviceOther').value,note:$('note').value,website:$('website').value,source,startedAt})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'تعذر إرسال الطلب');
      message.textContent='تم استلام طلبك بنجاح. سيتواصل معك فريق العيادة لتحديد الموعد المناسب.';
      message.className='message show ok';form.reset();$('serviceOtherField').hidden=true;button.textContent='تم إرسال الطلب';
      message.scrollIntoView({behavior:'smooth',block:'center'});
    }catch(error){
      message.textContent=error.message.includes('mobile')?'تحقق من رقم الجوال بصيغة 05xxxxxxxx.':error.message.includes('identity')?'تحقق من رقم الهوية أو الإقامة (10 أرقام).':'تعذر إرسال الطلب الآن. حاول مرة أخرى بعد قليل.';
      message.className='message show error';button.disabled=false;button.textContent='إرسال طلب الموعد';
    }
  });
})();
