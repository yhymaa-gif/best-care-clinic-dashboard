/* Read-only patient summary. No persistence, polling or mutation of source records. */
(()=>{
'use strict';
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const digits=value=>String(value??'').replace(/[٠-٩]/g,char=>String(char.charCodeAt(0)-1632)).replace(/[۰-۹]/g,char=>String(char.charCodeAt(0)-1776));
const dateNumber=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?Date.parse(`${value}T00:00:00Z`):NaN;
const riyadhDay=(now=Date.now())=>new Date(now+3*3600000).toISOString().slice(0,10);
function lookup(patient){
  const national=digits(patient?.nationalId).replace(/[\s-]/g,'');
  if(/^\d{10}$/.test(national)&&!/^0+$/.test(national))return{type:'national',value:national};
  const file=digits(patient?.file).trim().toUpperCase().replace(/[\s-]+/g,'');
  return file&&!/^0+$/.test(file)?{type:'file',value:file}:null;
}
function summarize(profile,{now=Date.now(),patientId='',date='',clinicId=''}={}){
  const today=riyadhDay(now),seen=new Set();
  const appointments=(profile.appointments||[]).filter(item=>{
    const key=`${item.clinicId}|${item.date}|${item.id}`;
    if(seen.has(key))return false;seen.add(key);return true;
  });
  const attended=appointments.filter(item=>dateNumber(item.date)<=dateNumber(today)&&
    (['done','active','arrived','early_arrival','left'].includes(item.status)||Number(item.arrivedAt)>0||Number(item.actualStartedAt)>0));
  const previous=attended.filter(item=>!(String(item.id)===String(patientId)&&item.date===date&&item.clinicId===clinicId))
    .sort((a,b)=>`${b.date} ${b.start||''}`.localeCompare(`${a.date} ${a.start||''}`))[0]||null;
  const completed=attended.filter(item=>item.status==='done');
  const procedures=new Map();let unquantified=0,fillings=0;
  for(const appointment of completed){
    const items=Array.isArray(appointment.paymentItems)?appointment.paymentItems:[];
    if(!items.length){unquantified+=1;continue;}
    for(const item of items){
      const name=String(item?.name||'').trim(),quantity=Number(item?.quantity);
      if(!name||!Number.isFinite(quantity)||quantity<=0){unquantified+=1;continue;}
      const key=name.toLocaleLowerCase();
      procedures.set(key,{name,quantity:(procedures.get(key)?.quantity||0)+quantity});
      if(/حشو|حشوة|filling|composite restoration/i.test(name)||/filling/i.test(item.code||''))fillings+=quantity;
    }
  }
  return{appointments,completed,previous,daysAgo:previous?Math.max(0,Math.floor((dateNumber(today)-dateNumber(previous.date))/86400000)):null,
    procedures:[...procedures.values()],fillings,unquantified,totalUnits:[...procedures.values()].reduce((sum,item)=>sum+item.quantity,0)};
}
function createCache({ttl=30000,max=8,now=Date.now}={}){
  const entries=new Map();let generation=0;
  return{
    peek:key=>entries.get(key),
    clear(){generation+=1;entries.clear();},
    load(key,loader,{force=false}={}){
      const existing=entries.get(key);
      if(existing?.pending)return existing.pending;
      if(!force&&existing?.data&&now()-existing.at<ttl)return Promise.resolve(existing.data);
      const currentGeneration=generation,entry={data:existing?.data||null,at:existing?.at||0,error:false,pending:null};
      entries.set(key,entry);
      for(const [oldKey,oldEntry] of entries){if(entries.size<=max)break;if(oldKey!==key&&!oldEntry.pending)entries.delete(oldKey);}
      entry.pending=Promise.resolve().then(loader).then(data=>{
        if(currentGeneration===generation&&entries.get(key)===entry){entry.data=data;entry.at=now();}
        return data;
      }).catch(error=>{entry.error=true;throw error;}).finally(()=>{entry.pending=null;});
      return entry.pending;
    }
  };
}
function render(profile,context={}){
  const en=context.lang==='en',t=(ar,english)=>en?english:ar;
  const model=summarize(profile,context),id=escape(context.patientId),fmt=n=>Number(n||0).toLocaleString(en?'en':'ar');
  const day=value=>Number.isFinite(dateNumber(value))?new Date(`${value}T12:00:00+03:00`).toLocaleDateString(en?'en-GB':'ar-SA',{year:'numeric',month:'short',day:'numeric',calendar:'gregory'}):'—';
  const button=(attribute,label)=>`<button type="button" ${attribute}="${id}">${escape(label)}</button>`;
  const empty=label=>`<p class="patient-summary-muted">${escape(label)}</p>`;
  const plans=profile.plans||[],labs=profile.labs||[],rx=profile.prescriptions||[],details=new Map((profile.planDetails||[]).map(item=>[item.canonical,item]));
  const list=items=>`<ul>${items.join('')}</ul>`;
  const line=(title,value)=>`<li><span>${escape(title)}</span><strong>${escape(value)}</strong></li>`;
  const allTab=(tab,label)=>`<button type="button" data-summary-profile="${id}" data-summary-tab="${tab}">${escape(label)}</button>`;
  const procedureLines=model.procedures.map(item=>line(item.name,`×${fmt(item.quantity)}`));
  const completedLines=model.completed.slice(0,4).map(item=>line(item.procedure||t('زيارة مكتملة','Completed visit'),day(item.date)));
  const lastVisit=model.previous?`${day(model.previous.date)} · ${model.daysAgo===0?t('اليوم','Today'):t(`قبل ${fmt(model.daysAgo)} يوم`,`${fmt(model.daysAgo)} days ago`)}`:t('لا توجد زيارة سابقة موثقة في السجل المتاح','No previous attended visit in the available record');
  return `<div class="patient-summary-head"><div><strong>${escape(profile.patient?.name||context.patientName||'')}</strong><small>${escape(t('ملخص السجلات المرتبطة بالمريض','Summary of linked patient records'))}</small></div><div class="patient-summary-actions">${button('data-summary-refresh',t('↻ تحديث','↻ Refresh'))}${button('data-summary-toggle',t('إغلاق','Close'))}</div></div>
    <div class="patient-summary-metrics"><div><small>${t('آخر زيارة سابقة','Previous visit')}</small><strong>${escape(lastVisit)}</strong></div><div><small>${t('زيارات مكتملة','Completed visits')}</small><strong>${fmt(model.completed.length)}</strong></div><div><small>${t('حشوات مسجلة*','Recorded fillings*')}</small><strong>${model.totalUnits?fmt(model.fillings):'—'}</strong></div><div><small>${t('وحدات إجراءات مسجلة*','Recorded procedure units*')}</small><strong>${model.totalUnits?fmt(model.totalUnits):'—'}</strong></div></div>
    <div class="patient-summary-grid"><section><h4>${t('الإجراءات والزيارات','Procedures & visits')}</h4>${procedureLines.length?list(procedureLines.slice(0,6)):empty(t('لا توجد أعداد إجراءات موثقة','No documented procedure quantities'))}${procedureLines.length>6?empty(t('بقية الإجراءات في الملف الكامل','More procedures in the full record')):''}${completedLines.length?list(completedLines):''}${allTab('appointments',t('كل الزيارات','All visits'))}</section>
    <section><h4>${t('الخطط العلاجية','Treatment plans')} <small>${fmt(plans.length)}</small></h4>${plans.length?list(plans.slice(0,4).map(plan=>{
      const detail=details.get(plan.canonical);
      const items=(detail?.items||[]).slice(0,4).map(item=>`${item.name}${item.quantity?` ×${fmt(item.quantity)}`:''}`).join(t('، ', ', '));
      return`<li class="patient-summary-plan"><strong>${escape(plan.planNo||t('خطة علاجية','Treatment plan'))}</strong><span>${escape(context.planStatus?.(plan.status)||plan.status||'—')}</span>${plan.relation==='addendum'?`<small>${t('خطة إلحاقية','Addendum')}</small>`:''}<p>${escape(items||t(detail?.detailsAvailable?'لا توجد بنود في هذه الخطة':'تفاصيل البنود غير متاحة في الملخص',detail?.detailsAvailable?'No items in this plan':'Item details unavailable in this summary'))}${detail?.items?.length>4?' …':''}</p></li>`;
    })):empty(t('لا توجد خطط مرتبطة','No linked treatment plans'))}${allTab('plans',t('عرض الخطط','View plans'))}</section>
    <section><h4>${t('حالات المعمل','Lab cases')} <small>${fmt(labs.length)}</small></h4>${labs.length?list(labs.slice(0,4).map(lab=>{
      const labName=lab.labName==='other'?lab.customLabName:lab.labName;
      const sent=Number(lab.sentAt),stop=['received_clinic','delivered_coordination','delivered_patient'].includes(lab.status);
      const elapsed=sent>0&&!stop&&!['cancelled'].includes(lab.status)&&sent<=(context.now||Date.now())?t(`مضى ${fmt(Math.floor(((context.now||Date.now())-sent)/86400000))} يوم منذ الإرسال`,`${fmt(Math.floor(((context.now||Date.now())-sent)/86400000))} days since sent`):'';
      return`<li class="patient-summary-plan"><strong>${escape(labName||t('المعمل غير محدد','Lab not specified'))}</strong><span>${escape(context.labStatus?.(lab.status)||lab.status||'—')}</span><p>${escape((lab.items||[]).map(item=>`${item.name} ×${fmt(item.quantity)}`).join(t('، ', ', ')))}</p>${elapsed?`<small>${escape(elapsed)}</small>`:''}</li>`;
    })):empty(t('لا توجد حالات معمل مرتبطة','No linked lab cases'))}${allTab('labs',t('كل حالات المعمل','All lab cases'))}</section>
    <section><h4>${t('الوصفات والمتابعة','Prescriptions & follow-up')}</h4>${list([
      line(t('الوصفات المحفوظة','Saved prescriptions'),fmt(rx.length)),
      line(t('أوامر دفع لم تكتمل','Incomplete payment orders'),fmt(model.appointments.filter(item=>item.paymentRequired&&!item.paymentCompletedAt).length)),
      line(t('مشاركات الخطة عبر واتساب','Plan WhatsApp shares'),fmt(profile.communications?.planWhatsappCount)),
      line(t('طلبات التقييم عبر واتساب','Review WhatsApp requests'),fmt(profile.communications?.reviewWhatsappCount))
    ])}${rx[0]?empty(`${rx[0].prescriptionNo||t('وصفة','Prescription')} · ${day(riyadhDay(Number(rx[0].updatedAt)||context.now||Date.now()))}`):''}
    <div class="patient-summary-actions">${button('data-prescription-id',t('💊 فتح الوصفات','💊 Open prescriptions'))}${allTab('payments',t('أوامر الدفع','Payment orders'))}</div>${profile.directory?.adminNotes?`<p class="patient-summary-note">${escape(profile.directory.adminNotes)}</p>`:''}</section></div>
    <footer><small>${t('* الأعداد من بنود أوامر الدفع للزيارات المكتملة؛ ليست إثباتًا سريريًا مستقلًا للتنفيذ. بنود الخطط لا تدخل في العدد.','* Quantities come from payment items on completed visits, not independent clinical confirmation. Proposed plan items are excluded.')}${model.unquantified?` ${t('توجد سجلات بلا كميات؛ لم تُقدّر أعدادها.','Some records lack quantities; no counts were inferred.')}`:''}</small>${allTab('appointments',t('فتح ملف المريض الكامل ↗','Open full patient record ↗'))}</footer>`;
}
globalThis.BestCarePatientSummary=Object.freeze({lookup,summarize,createCache,render,riyadhDay});
})();
