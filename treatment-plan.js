(() => {
    'use strict';
    const $=id=>document.getElementById(id);
    const params=new URLSearchParams(location.search);
    const patientId=params.get('patientId')||'';
    const appointmentDate=params.get('date')||'';
    const clinicId=/^clinic-(?:[1-9]|1[0-5])$/.test(params.get('clinic')||'')?params.get('clinic'):'clinic-1';
    const requestedPlanNo=(params.get('planNo')||'').trim().slice(0,40);
    const viewMode=params.get('view')==='clinic'?'clinic':'admin';
    const SOURCE_KEY=`bestcare_treatment_source_${patientId}`;
    const LOCAL_KEY=`bestcare_treatment_plan_${clinicId}_${appointmentDate||'undated'}_${patientId||'blank'}_${requestedPlanNo||'latest'}`;
    const LOCAL_DRAFT_TTL_MS=12*60*60*1000;
    const PLAN_API='/api/treatment-plan';
    const CONSENT_API='/api/treatment-plan-consent';
    const PATIENT_PROFILE_API='/api/patient-profile';
    const moneyFormatter=new Intl.NumberFormat('ar-SA-u-nu-latn',{minimumFractionDigits:2,maximumFractionDigits:2});
    const dateFormatter=new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn',{day:'2-digit',month:'2-digit',year:'numeric'});
    const dateTimeFormatter=new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
    const hijriFormatter=new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',{day:'numeric',month:'long',year:'numeric'});
    let activeItem={phase:0,item:0};
    let signatureFixed=false;
    let saveTimer=0;
    let source={};
    let currentUser={role:viewMode};
    let hasUnsyncedChanges=false;

    const nowLocal=()=>{
      const d=new Date(),offset=d.getTimezoneOffset()*60000;
      return new Date(d-offset).toISOString().slice(0,16);
    };
    const signatureDateText=value=>{
      const date=new Date(Number(value||0));
      if(!Number(value)||Number.isNaN(date.getTime()))return'____ / ____ / ______';
      return`${String(date.getDate()).padStart(2,'0')} / ${String(date.getMonth()+1).padStart(2,'0')} / ${date.getFullYear()}`;
    };
    const nextPlanNo=()=>{
      const year=new Date().getFullYear(),key=`bestcare_plan_sequence_${year}`;
      const next=Math.max(1,Number(localStorage.getItem(key)||0)+1);
      localStorage.setItem(key,String(next));
      return `TP-${year}-${String(next).padStart(6,'0')}`;
    };
    const DEFAULT_PROCEDURES=[
      ['cosmetic-filling','حشوة تجميلية'],['post-rct-filling','حشوة تجميلية بعد علاج العصب'],
      ['root-canal','علاج عصب'],['root-canal-retreatment','إعادة علاج عصب'],
      ['remove-post','إزالة وتد'],['place-post','تركيب وتد'],['remove-crown','إزالة تاج'],
      ['recement-crown','إعادة تثبيت تاج'],['ceramic-crown','تركيب سيراميك تاج'],
      ['ceramic-veneer','تركيب سيراميك فينير'],['implant-crown','تركيبة زراعة'],
      ['implant-surgery','زراعة — الجزء الجراحي'],['extraction','خلع الأسنان'],
      ['temporary','تركيب مؤقت'],['smile-design','تصميم ابتسامة'],
      ['smile-analysis','تحليل ابتسامة'],['cleaning-standard','تنظيف أسنان عادي'],
      ['cleaning-gbt','تنظيف أسنان GBT'],['other','إجراء آخر']
    ].map(([id,name])=>({id,name,beforePrice:'',afterPrice:''}));
    let procedureCatalog=DEFAULT_PROCEDURES.map(item=>({...item}));
    const DEFAULT_DIAGNOSIS='توضح الإجراءات المدرجة في هذه الخطة الاحتياجات العلاجية اللازمة للوصول إلى نتيجة مستقرة وظيفيًا وجماليًا، وتشمل — بحسب حالة المريض — الإجراءات العلاجية والتعويضية والتحفظية اللازمة للمحافظة على صحة الأسنان والأنسجة المحيطة.';
    const blankItem=()=>({code:'',service:'',variant:'',customService:'',teeth:[],qty:1,unitPriceBefore:'',unitPriceAfter:'',priceSource:'',beforePriceSource:'',afterPriceSource:'',type:'billable',includedLabel:''});
    const blankPhase=index=>({index,title:`المرحلة ${['الأولى','الثانية','الثالثة','الرابعة','الخامسة'][index]||index+1}`,estimatedVisits:'',estimatedDuration:'',items:[blankItem()]});
    const defaultState=planNo=>({
      meta:{planNo:planNo||nextPlanNo(),issuedAt:new Date().toISOString(),validityDays:15,copyType:'patient',revision:1,status:'draft',relation:'standalone',parentPlanNo:'',doctorApprovedAt:0,doctorApprovedBy:'',submittedAt:0,patientAcceptedAt:0,patientAcceptedBy:'',approvedAt:0,approvedBy:'',consentMethod:'',consentEvidenceId:'',consentPlanRevision:0,consentVersion:0,lastPrintedAt:0,rejectedAt:0,rejectedBy:'',rejectionReason:'',cancelledAt:0,cancelledBy:'',cancellationReason:''},
      clinic:{nameAr:'عيادات أفضل عناية الاستشارية للأسنان',nameEn:'Best Care Dental Clinics',city:'أبها',address:'',phone:''},
      patient:{fullName:source.name||'',fileNo:source.file||'',nationalId:source.nationalId||'',nationality:'saudi',age:'',mobile:source.phone||''},
      doctor:{name:'',scfhsNo:'',specialty:'طب وإصلاح الأسنان',explainedBy:''},
      clinical:{diagnosis:DEFAULT_DIAGNOSIS,radiographs:'',notes:''},
      phases:[blankPhase(0)],
      alternatives:'',noTreatment:'',risks:'',
      financial:{vatMode:'borne_by_state',vatConfirmed:false,paymentPlan:[]},
      consent:{photoConsent:true,photoConsentRecorded:false,photoConsentDefaultVersion:2,photoConsentAcceptedAt:0,termsVersion:0},
      signatures:{patientSignature:'',signerName:'',doctorName:'',doctorSignedAt:'',witnessName:'',witnessSignedAt:''}
    });
    let state;
    let cachedSharePdf=null,cachedShareImage=null,cachedShareSignature='',html2CanvasLoader=null;
    let preparedShareFile=null,preparedShareFormat='pdf',preparedPreviewUrl='',preparedShareIsFinal=false,preparedConsentUrl='',preparedConsentId='',consentPollTimer=null;
    const collapsedPhases=new Set();

    function toast(title,message=''){
      const el=document.createElement('div');el.className='toast';
      const strong=document.createElement('strong');strong.textContent=title;el.appendChild(strong);
      if(message){const div=document.createElement('div');div.textContent=message;el.appendChild(div)}
      $('toastWrap').appendChild(el);setTimeout(()=>el.remove(),4200);
    }
    function isFinalPlanStatus(status=state?.meta?.status){
      return ['approved','approved_signed'].includes(status);
    }
    function resetShareButtonLabels(){
      const finalPlan=isFinalPlanStatus();
      const awaitingSignature=state?.meta?.status==='submitted';
      const label=finalPlan?'مشاركة الخطة النهائية PDF عبر واتساب':awaitingSignature?'مشاركة الخطة + رابط التوقيع':'مشاركة مسودة PDF عبر واتساب';
      $('whatsappPlanBtn').innerHTML=`<span class="whatsapp-draft-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 11.6a8 8 0 0 1-11.8 7L4 20l1.4-4.1A8 8 0 1 1 20 11.6Z"/><path d="M9 8.5c.4 2.6 2 4.2 4.6 4.8l1.2-1.1 2 .7c.1 1.2-.5 2-1.8 2.1-4.4-.2-7.6-3.4-8-7.8.2-1.2 1-1.7 2.1-1.5l.8 1.8Z"/></svg></span><span>${label}</span>`;
      $('whatsappPlanBtn').setAttribute('aria-label',label);
      $('floatingWhatsappLabel').textContent=finalPlan?'واتساب الخطة النهائية':awaitingSignature?'الخطة + التوقيع':'واتساب المسودة';
      $('floatingWhatsappBtn').setAttribute('aria-label',label);
      $('floatingWhatsappBtn').removeAttribute('title');
      const group=document.querySelector('.share-draft-buttons');
      if(group)group.setAttribute('aria-label',label);
    }
    function safeText(value,max=500){return String(value??'').slice(0,max)}
    function nameScore(value){const text=String(value||'').trim();return text?text.split(/\s+/).filter(Boolean).length*100+text.length:0}
    function preferCompleteName(current,candidate){return nameScore(candidate)>nameScore(current)?String(candidate||'').trim():String(current||'').trim()}
    function normalizeWhatsAppPhone(value){
      let digits=String(value||'').replace(/\D/g,'');
      if(digits.startsWith('00'))digits=digits.slice(2);
      if(digits.startsWith('9660'))digits=`966${digits.slice(4)}`;
      else if(/^05\d{8}$/.test(digits))digits=`966${digits.slice(1)}`;
      else if(/^5\d{8}$/.test(digits))digits=`966${digits}`;
      return /^9665\d{8}$/.test(digits)?digits:'';
    }
    function whatsappPlanMessage(finalPlan=isFinalPlanStatus()){
      const patientName=(state.patient.fullName||'').trim();
      const greeting=patientName?`مرحبًا ${patientName}،`:'مرحبًا،';
      const planDescription=finalPlan
        ?'مرفق لكم الخطة العلاجية المعتمدة والموقعة.'
        :state.meta.status==='submitted'
          ?'مرفق لكم الخطة العلاجية التي اعتمدها الطبيب. يرجى مراجعتها ثم فتح رابط التوقيع أدناه لتوثيق موافقتكم.'
          :'مرفق لكم الخطة العلاجية المقترحة (مسودة للاطلاع).';
      const consentLine=!finalPlan&&preparedConsentUrl?`\n\nرابط مراجعة الخطة والتوقيع:\n${preparedConsentUrl}`:'';
      return `${greeting}\n\n${planDescription}${consentLine}\n\nمع تمنياتنا لكم بدوام الصحة والعافية،\nعيادات أفضل عناية الاستشارية للأسنان`;
    }
    function recordPlanWhatsappCommunication(){
      const eventId=crypto.randomUUID?.()||`plan-whatsapp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      fetch(PATIENT_PROFILE_API,{method:'POST',keepalive:true,headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({eventId,kind:'plan_whatsapp',clinicId,patient:{name:state.patient.fullName,file:state.patient.fileNo,phone:state.patient.mobile,nationalId:state.patient.nationalId},details:{planNo:state.meta.planNo,planStatus:state.meta.status,copyType:preparedShareIsFinal?'final':'doctor_approved',consentId:preparedConsentId||''}})})
        .then(async response=>{if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||'تعذر حفظ سجل إرسال الخطة')}})
        .catch(error=>console.warn('Treatment plan communication tracking unavailable',error));
    }
    async function refreshAfterRemoteConsent(){
      const remote=await loadRemote();
      if(!remote?.plan||remote.plan.meta?.status!=='approved_signed')return false;
      state=normalizeState(remote.plan);
      hydrateFields();render();
      preparedConsentUrl='';preparedConsentId='';
      clearInterval(consentPollTimer);consentPollTimer=null;
      toast('تم توقيع الخطة','اكتملت موافقة المريض وأصبحت الخطة معتمدة وموقعة وجاهزة للطباعة.');
      return true;
    }
    async function pollConsentStatus(){
      if(!preparedConsentUrl||state.meta.status!=='submitted')return;
      try{
        const token=new URL(preparedConsentUrl).searchParams.get('token')||'';
        if(!token)return;
        const response=await fetch(`${CONSENT_API}?token=${encodeURIComponent(token)}`,{cache:'no-store'});
        const data=await response.json().catch(()=>({}));
        if(response.ok&&data.status==='signed')await refreshAfterRemoteConsent();
      }catch{/* سيعاد الفحص تلقائيًا */}
    }
    function startConsentPolling(){
      clearInterval(consentPollTimer);
      if(!preparedConsentUrl||state.meta.status!=='submitted')return;
      consentPollTimer=setInterval(pollConsentStatus,12000);
    }
    async function ensureConsentLink(){
      if(state.meta.status!=='submitted')return'';
      if(preparedConsentUrl)return preparedConsentUrl;
      const response=await fetch(CONSENT_API,{
        method:'POST',credentials:'include',headers:{'content-type':'application/json'},
        body:JSON.stringify({action:'create',clinicId,date:appointmentDate,patientId,planNo:state.meta.planNo})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.url)throw new Error(data.error||'تعذر إنشاء رابط توقيع المريض');
      preparedConsentUrl=String(data.url);preparedConsentId=String(data.consentId||'');
      startConsentPolling();
      return preparedConsentUrl;
    }
    function toCents(value){if(value===''||value===null||value===undefined)return null;const n=Number(value);return Number.isFinite(n)?Math.round(n*100):null}
    function formatMoney(cents){return cents===null||cents===undefined?'—':`${moneyFormatter.format(cents/100)} ر.س`}
    function sourceFromLocal(){
      try{
        const saved=JSON.parse(localStorage.getItem(SOURCE_KEY)||'{}')||{};
        if(saved.__bestcareSource===1){
          if(Date.now()>Number(saved.expiresAt||0)){localStorage.removeItem(SOURCE_KEY);return{}}
          return saved.source&&typeof saved.source==='object'?saved.source:{};
        }
        return saved;
      }catch{return{}}
    }
    function persistLocalPlan(){
      localStorage.setItem(LOCAL_KEY,JSON.stringify({
        __bestcareDraft:1,
        expiresAt:Date.now()+LOCAL_DRAFT_TTL_MS,
        state
      }));
    }
    function clearLocalPlanCache(){
      localStorage.removeItem(LOCAL_KEY);
      localStorage.removeItem(SOURCE_KEY);
    }
    function normalizeState(input){
      const next=input&&typeof input==='object'?input:{},fallback=defaultState(next.meta?.planNo||'');
      const normalized={
        ...fallback,...next,
        meta:{...fallback.meta,...(next.meta||{})},
        clinic:{...fallback.clinic,...(next.clinic||{})},
        patient:{...fallback.patient,...(next.patient||{})},
        doctor:{...fallback.doctor,...(next.doctor||{})},
        clinical:{...fallback.clinical,...(next.clinical||{})},
        financial:{...fallback.financial,...(next.financial||{})},
        consent:{...fallback.consent,...(next.consent||{})},
        signatures:{...fallback.signatures,...(next.signatures||{})},
        phases:(Array.isArray(next.phases)&&next.phases.length?next.phases:[blankPhase(0)]).map((phase,index)=>({
          ...blankPhase(index),...phase,index,
          items:(Array.isArray(phase.items)&&phase.items.length?phase.items:[blankItem()]).map(item=>({...blankItem(),...item,teeth:Array.isArray(item.teeth)?item.teeth.map(String):[]}))
        }))
      };
      const consentLocked=Boolean(Number(normalized.meta.patientAcceptedAt||0))||['patient_accepted','approved','approved_signed','cancelled'].includes(normalized.meta.status);
      if(!consentLocked&&Number(next.consent?.photoConsentDefaultVersion||0)<2){
        normalized.consent.photoConsent=true;
        normalized.consent.photoConsentDefaultVersion=2;
      }
      normalized.consent.photoConsentRecorded=next.consent?.photoConsentRecorded===true||(Number(next.consent?.termsVersion||0)>=2&&Number(normalized.meta.patientAcceptedAt||0)>0);
      return normalized;
    }
    async function verifyAuth(){
      const setLocked=locked=>{
        const app=document.querySelector('main.app');
        const actions=$('floatingPlanActions');
        [app,actions].forEach(element=>{
          if(!element)return;
          element.toggleAttribute('inert',locked);
          element.setAttribute('aria-hidden',locked?'true':'false');
        });
        $('authGate')?.setAttribute('aria-hidden',locked?'false':'true');
      };
      try{
        const response=await fetch('/api/auth?action=session',{credentials:'include',cache:'no-store'});
        if(!response.ok)throw new Error();
        const data=await response.json();
        if(!data.authenticated)throw new Error();
        currentUser=data.user||{role:viewMode};
        const assignedClinic=/^clinic-(?:[1-9]|1[0-5])$/.test(String(currentUser?.clinicId||''))?String(currentUser.clinicId):'clinic-1';
        if(currentUser?.role==='clinic'&&(viewMode!=='clinic'||clinicId!==assignedClinic)){
          const next=new URL(location.href);
          next.searchParams.set('view','clinic');
          next.searchParams.set('clinic',assignedClinic);
          location.replace(next.href);
          return false;
        }
        document.body.classList.remove('auth-checking','auth-locked');
        setLocked(false);
        return true;
      }catch{
        document.body.classList.remove('auth-checking');
        document.body.classList.add('auth-locked');
        setLocked(true);
        return false;
      }
    }
    async function loadRemote(){
      if(!patientId||!appointmentDate)return null;
      try{
        const identityParams=new URLSearchParams({
          patientId,
          date:appointmentDate,
          clinic:clinicId
        });
        if(requestedPlanNo)identityParams.set('planNo',requestedPlanNo);
        if(source?.file)identityParams.set('fileNo',source.file);
        if(source?.phone)identityParams.set('mobile',source.phone);
        if(source?.nationalId)identityParams.set('nationalId',source.nationalId);
        const url=`${PLAN_API}?${identityParams.toString()}`;
        const response=await fetch(url,{credentials:'include',cache:'no-store'});
        if(!response.ok)return null;
        const data=await response.json();
        return data.exists?{plan:data.plan,carriedForward:Boolean(data.carriedForward)}:null;
      }catch{return null}
    }
    async function loadProcedureCatalog(rerender=false){
      try{
        const response=await fetch(`/api/treatment-catalog?clinic=${encodeURIComponent(clinicId)}`,{credentials:'include',cache:'no-store'});
        if(!response.ok)return false;
        const data=await response.json(),items=Array.isArray(data.items)&&data.items.length?data.items:DEFAULT_PROCEDURES;
        const changed=JSON.stringify(items)!==JSON.stringify(procedureCatalog);
        procedureCatalog=items.map(item=>({
          id:safeText(item.id,50),name:safeText(item.name,120),
          beforePrice:item.beforePrice===''?'':Number(item.beforePrice),
          afterPrice:(item.afterPrice??item.price)===''?'':Number(item.afterPrice??item.price)
        })).filter(item=>item.id&&item.name);
        let planChanged=false;
        if(state){
          state.phases.forEach(phase=>phase.items.forEach(item=>{
            let entry=procedureCatalog.find(option=>option.id===item.code);
            if(!entry&&item.service)entry=procedureCatalog.find(option=>option.name===item.service);
            if(!entry)return;
            if(item.code!==entry.id){item.code=entry.id;planChanged=true}
            if(item.service!==entry.name){item.service=entry.name;planChanged=true}
            if(!['approved','approved_signed'].includes(state.meta.status)){
              const beforeManual=item.beforePriceSource==='manual';
              const afterManual=item.afterPriceSource==='manual'||item.priceSource==='manual';
              if(!beforeManual&&entry.beforePrice!==''){
                if(item.unitPriceBefore!==entry.beforePrice){item.unitPriceBefore=entry.beforePrice;planChanged=true}
                if(item.beforePriceSource!=='catalog'){item.beforePriceSource='catalog';planChanged=true}
              }else if(!beforeManual&&item.unitPriceBefore!==''){item.beforePriceSource='manual';planChanged=true}
              if(!afterManual&&entry.afterPrice!==''){
                if(item.unitPriceAfter!==entry.afterPrice){item.unitPriceAfter=entry.afterPrice;planChanged=true}
                if(item.afterPriceSource!=='catalog'){item.afterPriceSource='catalog';planChanged=true}
              }else if(!afterManual&&item.unitPriceAfter!==''){item.afterPriceSource='manual';planChanged=true}
            }
          }));
        }
        if(changed&&rerender&&state){render();if(planChanged){hasUnsyncedChanges=true;persistLocalPlan();await savePlan(true)}}
        return changed;
      }catch{return false}
    }
    function loadLocalPlan(){
      try{
        const saved=JSON.parse(localStorage.getItem(LOCAL_KEY)||'null');
        if(!saved)return null;
        if(saved.__bestcareDraft===1){
          if(Date.now()>Number(saved.expiresAt||0)){localStorage.removeItem(LOCAL_KEY);return null}
          return saved.state&&typeof saved.state==='object'?saved.state:null;
        }
        localStorage.setItem(LOCAL_KEY,JSON.stringify({__bestcareDraft:1,expiresAt:Date.now()+LOCAL_DRAFT_TTL_MS,state:saved}));
        return saved;
      }catch{
        localStorage.removeItem(LOCAL_KEY);
        return null;
      }
    }
    function collectHeaderFields(){
      state.patient.fullName=$('patientName').value.trim();
      state.patient.fileNo=$('patientFile').value.trim();
      state.patient.mobile=$('patientMobile').value.replace(/[^\d+]/g,'').slice(0,16);
      state.meta.issuedAt=$('visitDate').value?new Date($('visitDate').value).toISOString():state.meta.issuedAt;
      state.clinical.diagnosis=DEFAULT_DIAGNOSIS;
      state.clinical.radiographs=$('radiographs').value.trim();
      state.financial.vatMode=$('vatMode').value;
      state.financial.vatConfirmed=$('vatConfirmed').checked;
      state.consent.photoConsent=$('photoConsent').checked;
      state.consent.photoConsentDefaultVersion=2;
      state.signatures.signerName=$('signerName').value.trim()||state.patient.fullName;
      if(!$('signerName').value.trim())$('signerName').value=state.signatures.signerName;
    }
    function hydrateFields(){
      $('patientName').value=state.patient.fullName||'';
      $('patientFile').value=state.patient.fileNo||'';
      $('patientMobile').value=state.patient.mobile||'';
      $('visitDate').value=state.meta.issuedAt?new Date(new Date(state.meta.issuedAt)-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):nowLocal();
      state.clinical.diagnosis=DEFAULT_DIAGNOSIS;
      $('radiographs').value=Array.isArray(state.clinical.radiographs)?state.clinical.radiographs.join('، '):(state.clinical.radiographs||'');
      $('vatMode').value=state.financial.vatMode==='auto'?'borne_by_state':(state.financial.vatMode||'borne_by_state');
      $('vatConfirmed').checked=Boolean(state.financial.vatConfirmed);
      $('vatControl').classList.toggle('confirmed',$('vatConfirmed').checked);
      $('photoConsent').checked=Boolean(state.consent.photoConsent);
      state.signatures.signerName=(state.signatures.signerName||'').trim()||state.patient.fullName||'';
      $('signerName').value=state.signatures.signerName;
    }
    function planDates(){
      const issued=new Date(state.meta.issuedAt||Date.now());
      const valid=new Date(issued);valid.setDate(valid.getDate()+Number(state.meta.validityDays||15));
      return{issued,valid};
    }
    function renderDocMeta(){
      const {issued,valid}=planDates();
      const finalStatus=['approved','approved_signed'].includes(state.meta.status);
      const patientAcceptedDate=Number(state.meta.patientAcceptedAt||0);
      const clinicApprovalDate=Number(state.meta.approvedAt||0)||(finalStatus?Number(state.meta.lastPrintedAt||0)||Date.now():0);
      $('planNoText').textContent=state.meta.planNo;
      $('revisionText').textContent=String(state.meta.revision||1);
      $('issuedDateText').textContent=`${dateFormatter.format(issued)} · ${hijriFormatter.format(issued)}`;
      $('printedAtText').textContent=state.meta.lastPrintedAt?dateTimeFormatter.format(new Date(Number(state.meta.lastPrintedAt))):'—';
      $('validityText').textContent=`هذا العرض ساري حتى ${dateFormatter.format(valid)} — ${state.meta.validityDays||15} يومًا من تاريخ الإصدار.`;
      $('heroValidity').textContent=`${state.meta.validityDays||15} يومًا`;
      const expired=valid.getTime()<Date.now();
      $('validityText').textContent=expired?`انتهت صلاحية هذا العرض بتاريخ ${dateFormatter.format(valid)} — يلزم إعادة التسعير.`:$('validityText').textContent;
      $('heroPatient').textContent=state.patient.fullName||'مريض جديد';
      $('patientSignatureDate').textContent=signatureDateText(patientAcceptedDate);
      $('clinicApprovalDate').textContent=signatureDateText(clinicApprovalDate);
      renderDocCode();
    }
    function renderDocCode(){
      const target=$('docCode');if(!target)return;
      const text=`${state.meta.planNo}|${state.patient.fileNo||''}|${state.meta.issuedAt}`;
      let hash=2166136261;for(const ch of text){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619)}
      const bits=[];for(let i=0;i<49;i++){hash=Math.imul(hash^i,2246822519);bits.push((hash>>>i%24)&1)}
      const finder=(r,c)=>((r<2&&c<2)||(r<2&&c>4)||(r>4&&c<2));
      target.innerHTML=bits.map((bit,i)=>`<i class="${bit||finder(Math.floor(i/7),i%7)?'on':''}"></i>`).join('');
    }
    function itemTotals(item){
      const before=item.type==='included'?0:toCents(item.unitPriceBefore),after=item.type==='included'?0:toCents(item.unitPriceAfter),qty=Math.max(1,Number(item.qty||1));
      return{known:before!==null||after!==null,before:before===null?null:before*qty,after:after===null?null:after*qty};
    }
    function totals(){
      let before=0,after=0,hasBefore=false,hasAfter=false;
      state.phases.forEach(phase=>phase.items.forEach(item=>{const t=itemTotals(item);if(t.before!==null){before+=t.before;hasBefore=true}if(t.after!==null){after+=t.after;hasAfter=true}}));
      const known=hasBefore||hasAfter;
      const mode=state.financial.vatMode==='auto'?'borne_by_state':state.financial.vatMode;
      const vat=known&&mode==='standard_15'?Math.round(after*.15):known?0:null;
      return{known,before:hasBefore?before:null,after:hasAfter?after:null,saving:hasBefore&&hasAfter?before-after:null,vat,net:hasAfter&&vat!==null?after+vat:null,mode};
    }
    function renderFinancials(){
      const total=totals();
      $('grandBefore').textContent=formatMoney(total.before);
      $('discountSaving').textContent=formatMoney(total.saving);
      $('grandAfter').textContent=formatMoney(total.after);
      $('vatAmount').textContent=formatMoney(total.vat);
      $('netPayable').textContent=formatMoney(total.net);
      $('vatLabel').textContent=total.mode==='standard_15'?'ضريبة القيمة المضافة 15%':total.mode==='exempt'?'ضريبة القيمة المضافة: معفى':'ضريبة القيمة المضافة: تتحمّلها الدولة عن المواطن';
    }
    function phaseTotals(phase){
      let before=0,after=0,hasBefore=false,hasAfter=false;
      phase.items.forEach(item=>{const t=itemTotals(item);if(t.before!==null){before+=t.before;hasBefore=true}if(t.after!==null){after+=t.after;hasAfter=true}});
      return{before:hasBefore?before:null,after:hasAfter?after:null};
    }
    function renderPhases(){
      $('phasesContainer').innerHTML=state.phases.map((phase,pIndex)=>{
        const total=phaseTotals(phase);
        const rows=phase.items.map((item,iIndex)=>{
          const total=itemTotals(item),active=activeItem.phase===pIndex&&activeItem.item===iIndex;
          const procedureOptions=`<option value="">اختر الإجراء</option>`+procedureCatalog.map(option=>`<option value="${escapeAttr(option.id)}" ${(item.code===option.id||(!item.code&&item.service===option.name))?'selected':''}>${escapeHtml(option.name)}</option>`).join('');
          const variant=item.code==='ceramic-veneer'?`<select class="line-input variant-select" data-field="variant"><option value="">اختر النوع</option><option value="with-prep" ${item.variant==='with-prep'?'selected':''}>بتحضير</option><option value="without-prep" ${item.variant==='without-prep'?'selected':''}>بدون تحضير</option></select>`:'';
          const custom=item.code==='other'?`<input class="line-input custom-procedure" data-field="customService" value="${escapeAttr(item.customService||'')}" placeholder="اكتب الإجراء">`:'';
          return`<tr data-item-row="${pIndex}:${iIndex}" style="${active?'box-shadow:inset -3px 0 0 var(--teal)':''}">
            <td><select class="line-input procedure-select" data-field="procedureCode" aria-label="اختيار الإجراء في المرحلة ${pIndex+1}">${procedureOptions}</select>${variant}${custom}</td>
            <td class="num"><div class="qty-stepper" aria-label="عدد الإجراءات"><button type="button" data-qty-action="decrease" aria-label="إنقاص العدد">−</button><output>${Number(item.qty||1)}</output><button type="button" data-qty-action="increase" aria-label="زيادة العدد">+</button></div></td>
            <td class="money"><input class="line-input money" data-field="unitPriceBefore" inputmode="decimal" aria-label="السعر قبل الخصم للإجراء ${iIndex+1}" value="${escapeAttr(item.unitPriceBefore)}" placeholder="${item.type==='included'?'مجاني':'—'}" ${item.type==='included'?'disabled':''}></td>
            <td class="money"><input class="line-input money" data-field="unitPriceAfter" inputmode="decimal" aria-label="السعر بعد الخصم للإجراء ${iIndex+1}" value="${escapeAttr(item.unitPriceAfter)}" placeholder="${item.type==='included'?'مجاني':'—'}" ${item.type==='included'?'disabled':''}></td>
            <td class="money"><span>${formatMoney(total.after)}</span>${total.before!==null&&total.after!==null&&total.before!==total.after?`<br><small style="text-decoration:line-through;color:var(--ink-2)">${formatMoney(total.before)}</small>`:''}${item.type==='included'?`<br><span class="included-chip">مجاني${item.includedLabel?` — ${escapeHtml(item.includedLabel)}`:''}</span>`:''}</td>
            <td class="edit-only"><button type="button" class="row-action" data-toggle-included="${pIndex}:${iIndex}" title="تبديل مجاني">${item.type==='included'?'مدفوع':'مجاني'}</button><button type="button" class="row-action" data-delete-item="${pIndex}:${iIndex}" title="حذف">×</button></td>
          </tr>`}).join('');
        const collapsed=collapsedPhases.has(pIndex);
        return`<div class="phase-block${collapsed?' collapsed':''}" data-phase="${pIndex}">
          <div class="phase-head"><div class="phase-name"><span class="phase-index">${pIndex+1}</span><input data-phase-title="${pIndex}" aria-label="اسم المرحلة العلاجية ${pIndex+1}" value="${escapeAttr(phase.title)}"></div><div class="phase-actions edit-only"><button type="button" class="phase-collapse" data-toggle-phase="${pIndex}" aria-expanded="${collapsed?'false':'true'}" aria-label="${collapsed?'فتح':'طي'} المرحلة">⌄</button><button type="button" data-delete-phase="${pIndex}" ${state.phases.length===1?'disabled':''}>حذف المرحلة</button></div></div>
          <div class="phase-content">
            <table><thead><tr><th style="width:25%">الإجراء</th><th class="num" style="width:14%">العدد</th><th class="money" style="width:16%">قبل الخصم</th><th class="money" style="width:16%">بعد الخصم</th><th class="money" style="width:17%">الإجمالي</th><th class="edit-only" style="width:12%">إجراء</th></tr></thead><tbody>${rows}</tbody></table>
            <button type="button" class="add-item edit-only" data-add-item="${pIndex}">＋ إضافة إجراء</button>
            <div class="phase-total"><span>قبل الخصم: <b>${formatMoney(total.before)}</b></span><span>بعد الخصم: <b>${formatMoney(total.after)}</b></span></div>
          </div>
        </div>`}).join('');
      $('heroPhaseCount').textContent=String(state.phases.length);
    }
    function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
    function escapeAttr(value){return escapeHtml(value)}
    function missingFields(){
      const missing=[];
      if(!(state.patient.fullName||'').trim())missing.push('اسم المريض');
      if(!(state.patient.fileNo||'').trim())missing.push('رقم الملف');
      if(!normalizeWhatsAppPhone(state.patient.mobile))missing.push('رقم الجوال');
      if(!state.phases.some(phase=>phase.items.some(item=>(item.service||'').trim()&&(item.code!=='other'||(item.customService||'').trim()))))missing.push('إجراء علاجي واحد');
      if(state.phases.some(phase=>phase.items.some(item=>item.code==='ceramic-veneer'&&!item.variant)))missing.push('نوع الفينير');
      return missing;
    }
    function approvalMissing(){
      const missing=missingFields();
      const paidItems=state.phases.flatMap(phase=>phase.items).filter(item=>item.service&&item.type!=='included');
      if(paidItems.some(item=>toCents(item.unitPriceBefore)===null))missing.push('سعر ما قبل الخصم لكل إجراء مدفوع');
      if(paidItems.some(item=>toCents(item.unitPriceAfter)===null))missing.push('سعر ما بعد الخصم لكل إجراء مدفوع');
      if(paidItems.some(item=>Number(item.unitPriceBefore)<0||Number(item.unitPriceAfter)<0))missing.push('الأسعار يجب أن تكون صفرًا أو أكثر');
      if(paidItems.some(item=>toCents(item.unitPriceBefore)!==null&&toCents(item.unitPriceAfter)!==null&&toCents(item.unitPriceAfter)>toCents(item.unitPriceBefore)))missing.push('سعر ما بعد الخصم يجب ألا يتجاوز سعر ما قبل الخصم');
      if(!state.financial.vatConfirmed)missing.push('تأكيد أهلية المريض ووضع الضريبة');
      return [...new Set(missing)];
    }
    function workflowRole(){return viewMode==='clinic'?'clinic':'admin'}
    function renderWorkflow(){
      const status=['draft','submitted','patient_accepted','approved','approved_signed','rejected','cancelled'].includes(state.meta.status)?state.meta.status:'draft';
      const labels={draft:'مسودة غير معتمدة لدى الطبيب',submitted:'اعتمدها الطبيب — بانتظار مشاركة الإدارة وتوقيع المريض',patient_accepted:'موافقة قديمة — يلزم استكمال التوقيع',approved:'معتمدة نهائيًا',approved_signed:'خطة معتمدة وموقعة',rejected:'أعادتها الإدارة — تحتاج تعديل الطبيب',cancelled:'الخطة ملغاة — محفوظة في السجل'};
      $('workflowStatus').textContent=labels[status];$('workflowStatus').className=`workflow-pill ${status}`;
      const progressStatus=status==='approved'?'approved_signed':status;
      const order=['draft','submitted','patient_accepted','approved_signed'],position=order.indexOf(progressStatus);
      document.querySelectorAll('[data-workflow-step]').forEach((step,index)=>{
        step.classList.toggle('done',position>index);
        step.classList.toggle('active',position===index);
        step.classList.toggle('rejected',status==='rejected'&&index===0);
      });
      const needsDoctorApproval=status==='draft';
      const doctorHandoffVisible=workflowRole()==='clinic'&&needsDoctorApproval;
      $('doctorHandoffCard').hidden=!doctorHandoffVisible;
      $('sendAdminBtn').disabled=!doctorHandoffVisible||!$('doctorApprovalCheck').checked;
      $('doctorApproveShortcutBtn').hidden=!needsDoctorApproval;
      $('doctorApproveShortcutBtn').classList.toggle('admin-guide',workflowRole()==='admin');
      $('doctorApproveShortcutLabel').textContent=workflowRole()==='clinic'?'اعتماد الطبيب للمسودة':'فتح صفحة العيادة لاعتماد الطبيب';
      $('patientAcceptedBtn').hidden=workflowRole()!=='admin'||status!=='submitted';
      $('approvePlanBtn').hidden=workflowRole()!=='admin'||status!=='patient_accepted';
      $('rejectPlanBtn').hidden=workflowRole()!=='admin'||!['submitted','patient_accepted'].includes(status);
      const shareGroup=document.querySelector('.share-draft-buttons');
      shareGroup.hidden=workflowRole()!=='admin'||!['submitted','patient_accepted','approved','approved_signed'].includes(status)||!state.phases.some(phase=>phase.items.some(item=>item.service));
      $('floatingWhatsappBtn').hidden=false;
      resetShareButtonLabels();
      const locked=status==='cancelled'||workflowRole()==='clinic'&&['submitted','patient_accepted','approved','approved_signed'].includes(status);
      document.body.classList.toggle('workflow-locked',locked);
      $('paper').classList.toggle('approved',['approved','approved_signed'].includes(status));
      const isReturnedRevision=workflowRole()==='clinic'&&status==='rejected';
      $('saveBtn').textContent=isReturnedRevision?'حفظ التعديلات وإرسالها للإدارة':'حفظ الخطة';
      $('saveBtn').title=isReturnedRevision?'تُحفظ تعديلات الطبيب وتُعاد الخطة معتمدة إلى الإدارة مباشرة':'حفظ الخطة';
      $('saveBtn').classList.toggle('revision-submit',isReturnedRevision);
      $('saveBtn').disabled=locked;$('addPhaseBtn').disabled=locked;
      $('printBtn').title=['approved','approved_signed'].includes(status)?'طباعة النسخة النهائية المعتمدة':'الطباعة متاحة بعد اعتماد الإدارة وموافقة المريض';
      $('floatingPdfBtn').setAttribute('aria-label',$('printBtn').title||'طباعة الخطة أو حفظها PDF');
      $('floatingPdfBtn').removeAttribute('title');
      renderPhotoConsentWarning();
    }
    function renderPhotoConsentWarning(){
      const warning=$('photoConsentWarning');if(!warning)return;
      const finalStatus=['approved','approved_signed'].includes(state.meta.status);
      const recorded=state.consent?.photoConsentRecorded===true||(Number(state.consent?.termsVersion||0)>=2&&Number(state.meta.patientAcceptedAt||0)>0);
      const declined=recorded&&state.consent?.photoConsent!==true;
      const unrecorded=finalStatus&&!recorded;
      warning.hidden=!declined&&!unrecorded;
      warning.classList.toggle('is-unrecorded',unrecorded);
      if(declined){
        $('photoConsentWarningTitle').textContent='لم يوقّع المريض على موافقة التصوير';
        $('photoConsentWarningDetail').textContent='لا تلتقط أو تستخدم أو تشارك صور الحالة دون موافقة تصوير مستقلة وموثقة.';
      }else if(unrecorded){
        $('photoConsentWarningTitle').textContent='موافقة التصوير غير موثقة';
        $('photoConsentWarningDetail').textContent='هذه خطة قديمة؛ تحقّق من وجود موافقة مستقلة قبل التقاط أو استخدام صور الحالة.';
      }
    }
    function renderProgress(){
      collectHeaderFields();
      const missing=missingFields(),total=4,done=Math.max(0,total-missing.length),pct=Math.round(done/total*100);
      $('progressBar').style.width=`${pct}%`;
      $('progressText').textContent=missing.length?`تبقى ${missing.length} حقول إلزامية قبل الطباعة.`:'الخطة جاهزة للمراجعة والطباعة.';
      $('heroMissing').textContent=missing.length?String(missing.length):'مكتمل';
      $('missingBanner').classList.toggle('show',missing.length>0);
      $('missingBanner').textContent=missing.length?`الحقول المطلوبة: ${missing.join('، ')}`:'';
      $('printBtn').title=missing.length?`أكمل: ${missing.join('، ')}`:'جاهز للطباعة';
      return missing;
    }
    function render(){
      renderDocMeta();renderPhases();renderFinancials();renderProgress();renderWorkflow();
    }
    function markDirty(){
      if(state.meta.status==='cancelled')return;
      collectHeaderFields();
      state.meta.lastPrintedAt=0;
      preparedConsentUrl='';preparedConsentId='';clearInterval(consentPollTimer);consentPollTimer=null;
      cachedSharePdf=null;cachedShareImage=null;cachedShareSignature='';
      resetShareButtonLabels();
      if(workflowRole()==='clinic'){
        if(state.meta.status!=='rejected'){
          state.meta.status='draft';
          $('doctorApprovalCheck').checked=false;
          $('doctorHandoffCard').classList.remove('confirmed');
        }
      }
      else if(['patient_accepted','approved','approved_signed','rejected'].includes(state.meta.status)){
        state.meta.status='submitted';state.meta.patientAcceptedAt=0;state.meta.patientAcceptedBy='';state.meta.approvedAt=0;state.meta.approvedBy='';state.meta.consentMethod='';state.meta.consentEvidenceId='';state.meta.consentPlanRevision=0;state.meta.consentVersion=0;
      }
      $('paper').classList.remove('approved');
      $('saveStatus').classList.remove('saved');$('saveStatus').textContent='تعديلات غير محفوظة';
      hasUnsyncedChanges=true;
      persistLocalPlan();
      clearTimeout(saveTimer);saveTimer=setTimeout(()=>savePlan(true),900);
      renderDocMeta();renderFinancials();renderProgress();renderWorkflow();
    }
    async function savePlan(silent=false){
      collectHeaderFields();
      hasUnsyncedChanges=true;
      persistLocalPlan();
      if(patientId&&appointmentDate){
        try{
          const url=`${PLAN_API}?patientId=${encodeURIComponent(patientId)}&date=${encodeURIComponent(appointmentDate)}&clinic=${encodeURIComponent(clinicId)}`;
          const response=await fetch(url,{method:'PUT',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({plan:state})});
          if(!response.ok)throw new Error('تعذر الحفظ المركزي');
        }catch(error){$('saveStatus').classList.remove('saved');$('saveStatus').textContent='محفوظ على هذا الجهاز فقط';if(!silent)toast('تعذر الحفظ المركزي',error.message);return false}
      }
      hasUnsyncedChanges=false;
      clearLocalPlanCache();
      $('saveStatus').classList.add('saved');$('saveStatus').textContent='محفوظ ومؤرشف';
      if(!silent)toast('تم حفظ الخطة','يمكنك الرجوع إليها من صف المريض نفسه.');
      return true;
    }
    async function saveDraftPlan(){
      if(workflowRole()==='clinic'&&state.meta.status==='rejected'){
        await resubmitRevisedPlan();
        return;
      }
      const saved=await savePlan(false);
      if(saved&&workflowRole()==='clinic'&&state.meta.status==='draft'){
        await syncPlanStatusToDashboard('draft');
        toast('حُفظت كمسودة','ظهرت علامة «مسودة خطة» أمام اسم المريض. أرسلها للإدارة عندما تكتمل.');
      }
    }
    async function syncPlanStatusToDashboard(status){
      if(!patientId||!appointmentDate)return false;
      try{
        const url=`/api/state?date=${encodeURIComponent(appointmentDate)}&clinic=${encodeURIComponent(clinicId)}`;
        const response=await fetch(url,{credentials:'include',cache:'no-store'});if(!response.ok)throw new Error();
        const day=await response.json();if(!day.exists)return false;
        let found=false;
        const patients=(day.patients||[]).map(patient=>String(patient.id)===String(patientId)?(found=true,{...patient,treatmentPlanStatus:status,treatmentPlanUpdatedAt:Date.now(),treatmentPlanPrintedAt:Number(state.meta.lastPrintedAt||0)}):patient);
        if(!found)return false;
        const saved=await fetch(url,{method:'PUT',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({clinic:day.clinic||{},patients,notes:day.notes||'',updateAlert:day.updateAlert||{},clientId:`treatment-plan-${Date.now()}`})});
        return saved.ok;
      }catch{return false}
    }
    async function syncPlanRegistry(status,rejectionReason=''){
      try{
        const response=await fetch(`/api/treatment-plan-registry?clinic=${encodeURIComponent(clinicId)}`,{
          method:'PUT',credentials:'include',headers:{'content-type':'application/json'},
          body:JSON.stringify({
            patient:state.patient,status,rejectionReason,
            planNo:state.meta.planNo,parentPlanNo:state.meta.parentPlanNo||'',relation:state.meta.relation||'standalone',sourcePatientId:patientId,sourceDate:appointmentDate,
            patientAcceptedAt:state.meta.patientAcceptedAt||0,
            patientAcceptedBy:state.meta.patientAcceptedBy||'',
            approvedAt:state.meta.approvedAt||0,
            approvedBy:state.meta.approvedBy||'',
            consentMethod:state.meta.consentMethod||'',
            consentEvidenceId:state.meta.consentEvidenceId||'',
            photoConsent:state.consent?.photoConsent===true,
            photoConsentRecorded:state.consent?.photoConsentRecorded===true||(Number(state.consent?.termsVersion||0)>=2&&Number(state.meta.patientAcceptedAt||0)>0),
            consentTermsVersion:Number(state.consent?.termsVersion||0),
            lastPrintedAt:state.meta.lastPrintedAt||0,
            cancelledAt:state.meta.cancelledAt||0,
            cancelledBy:state.meta.cancelledBy||'',
            cancellationReason:state.meta.cancellationReason||''
          })
        });
        return response.ok;
      }catch{return false}
    }
    async function resubmitRevisedPlan(){
      if(workflowRole()!=='clinic'||state.meta.status!=='rejected')return false;
      collectHeaderFields();
      const missing=missingFields();
      if(missing.length){
        toast('تعذر إعادة الإرسال',`أكمل: ${missing.join('، ')}`);
        renderProgress();
        return false;
      }
      const previousMeta={...state.meta};
      const approvalTime=Date.now();
      state.meta.status='submitted';
      state.meta.doctorApprovedAt=approvalTime;
      state.meta.doctorApprovedBy=currentUser?.displayName||currentUser?.username||'الطبيب';
      state.meta.submittedAt=approvalTime;
      state.meta.patientAcceptedAt=0;
      state.meta.patientAcceptedBy='';
      state.meta.approvedAt=0;
      state.meta.approvedBy='';
      state.meta.consentMethod='';
      state.meta.consentEvidenceId='';
      state.meta.consentPlanRevision=0;
      state.meta.consentVersion=0;
      state.meta.rejectedAt=0;
      state.meta.rejectedBy='';
      state.meta.rejectionReason='';
      state.meta.revision=Math.max(1,Number(state.meta.revision||1)+1);
      const saved=await savePlan(true);
      if(!saved){
        state.meta=previousMeta;
        render();
        return false;
      }
      await Promise.all([syncPlanStatusToDashboard('submitted'),syncPlanRegistry('submitted')]);
      render();
      toast('تم اعتماد التعديل وإعادته للإدارة','حُفظت تعديلات الطبيب وأُرسلت الخطة إلى الإدارة مباشرة دون طلب تأكيد اعتماد جديد.');
      return true;
    }
    async function submitToAdmin(){
      if(workflowRole()!=='clinic'||state.meta.status!=='draft')return;
      if(!$('doctorApprovalCheck').checked){
        toast('يلزم اعتماد الطبيب','فعّل مربع التأكيد بأنك راجعت المسودة واعتمدتها قبل إرسالها إلى الإدارة.');
        $('doctorHandoffCard').scrollIntoView({behavior:'smooth',block:'center'});
        return;
      }
      collectHeaderFields();const missing=missingFields();
      if(missing.length){toast('تعذر الإرسال',`أكمل: ${missing.join('، ')}`);renderProgress();return}
      const approvalTime=Date.now();
      state.meta.status='submitted';state.meta.doctorApprovedAt=approvalTime;state.meta.doctorApprovedBy=currentUser?.displayName||currentUser?.username||'الطبيب';state.meta.submittedAt=approvalTime;state.meta.patientAcceptedAt=0;state.meta.patientAcceptedBy='';state.meta.approvedAt=0;state.meta.approvedBy='';state.meta.consentMethod='';state.meta.consentEvidenceId='';state.meta.consentPlanRevision=0;state.meta.consentVersion=0;state.meta.rejectedAt=0;state.meta.rejectedBy='';state.meta.rejectionReason='';
      const saved=await savePlan(true);if(!saved){state.meta.status='draft';render();return}
      await Promise.all([syncPlanStatusToDashboard('submitted'),syncPlanRegistry('submitted')]);render();toast('تم اعتماد المسودة وإرسالها','اعتمد الطبيب المسودة، وأصبحت الآن لدى الإدارة لاستكمال الإجراءات.');
    }
    async function confirmPatientAcceptance(){
      if(workflowRole()!=='admin'||state.meta.status!=='submitted')return;
      collectHeaderFields();const missing=approvalMissing();
      if(!(state.signatures.signerName||'').trim())missing.push('اسم المريض أو الوصي الموقّع');
      if(missing.length){toast('تعذر تأكيد موافقة المريض',`أكمل: ${[...new Set(missing)].join('، ')}`);renderProgress();return}
      if(!state.signatures.patientSignature){
        $('digitalSignToggle').checked=true;$('signatureCanvasWrap').classList.add('active');
        $('signatureSection').scrollIntoView({behavior:'smooth',block:'center'});
        toast('يلزم توقيع المريض','اجعل المريض يوقّع داخل اللوحة ثم اضغط «تثبيت» قبل الاعتماد.');
        return;
      }
      if(!confirm('هل تؤكد أن المريض/الوصي اطّلع على الخطة ووقّع عليها مباشرة على هذا الجهاز؟'))return;
      const previousMeta={...state.meta},now=Date.now();
      state.meta.status='approved_signed';state.meta.patientAcceptedAt=now;state.meta.patientAcceptedBy=state.signatures.signerName;state.meta.approvedAt=now;state.meta.approvedBy=currentUser?.displayName||currentUser?.username||'الإدارة';state.meta.consentMethod='in_clinic';state.meta.consentEvidenceId=crypto.randomUUID?.()||`in-clinic-${now}`;state.meta.consentPlanRevision=Number(state.meta.revision||1);state.meta.consentVersion=2;
      state.consent.photoConsentRecorded=true;state.consent.photoConsentAcceptedAt=state.consent.photoConsent?now:0;state.consent.termsVersion=2;
      const saved=await savePlan(true);if(!saved){state.meta=previousMeta;render();return}
      await Promise.all([syncPlanStatusToDashboard('approved_signed'),syncPlanRegistry('approved_signed')]);
      render();toast('تم اعتماد الخطة الموقعة','حُفظ توقيع المريض المباشر وأصبحت الخطة جاهزة للطباعة.');
    }
    async function approvePlan(){
      if(workflowRole()!=='admin'||state.meta.status!=='patient_accepted')return;
      collectHeaderFields();const missing=approvalMissing();
      if(missing.length){toast('لا يمكن الاعتماد',`أكمل: ${missing.join('، ')}`);renderProgress();return}
      if(!state.signatures.patientSignature){$('digitalSignToggle').checked=true;$('signatureCanvasWrap').classList.add('active');$('signatureSection').scrollIntoView({behavior:'smooth',block:'center'});toast('يلزم إثبات التوقيع','وقّع المريض داخل اللوحة ثم ثبّت التوقيع لاستكمال هذه الخطة القديمة.');return}
      const now=Date.now();state.meta.status='approved_signed';state.meta.approvedAt=now;state.meta.approvedBy=currentUser?.displayName||currentUser?.username||'الإدارة';state.meta.consentMethod=state.meta.consentMethod||'in_clinic';state.meta.consentEvidenceId=state.meta.consentEvidenceId||crypto.randomUUID?.()||`legacy-signature-${now}`;state.meta.consentPlanRevision=Number(state.meta.revision||1);state.meta.consentVersion=2;state.meta.revision=Math.max(1,Number(state.meta.revision||1)+1);
      state.consent.photoConsentRecorded=true;state.consent.photoConsentAcceptedAt=state.consent.photoConsent?now:0;state.consent.termsVersion=2;
      const saved=await savePlan(true);if(!saved){state.meta.status='patient_accepted';render();return}
      await Promise.all([syncPlanStatusToDashboard('approved_signed'),syncPlanRegistry('approved_signed')]);$('paper').classList.add('approved');render();toast('تم اعتماد الخطة الموقعة','ستظهر علامة «خطة معتمدة وموقعة» بجانب المريض في جميع مواعيده القادمة.');
    }
    async function rejectPlan(){
      if(workflowRole()!=='admin'||!['submitted','patient_accepted'].includes(state.meta.status))return;
      const previousStatus=state.meta.status;
      const reason=prompt('اكتب سبب عدم اعتماد الخطة أو التعديل المطلوب:','تحتاج الخطة إلى مراجعة الإجراءات أو الأسعار.');
      if(reason===null)return;
      state.meta.status='rejected';state.meta.rejectedAt=Date.now();state.meta.rejectedBy=currentUser?.displayName||currentUser?.username||'الإدارة';state.meta.rejectionReason=String(reason||'تحتاج الخطة إلى تعديل.').trim().slice(0,500);state.meta.patientAcceptedAt=0;state.meta.patientAcceptedBy='';state.meta.approvedAt=0;state.meta.approvedBy='';state.meta.consentMethod='';state.meta.consentEvidenceId='';state.meta.consentPlanRevision=0;state.meta.consentVersion=0;
      const saved=await savePlan(true);if(!saved){state.meta.status=previousStatus;render();return}
      await Promise.all([syncPlanStatusToDashboard('rejected'),syncPlanRegistry('rejected',state.meta.rejectionReason)]);
      render();toast('أُعيدت الخطة إلى العيادة','ستظهر علامة «خطة غير معتمدة» بجانب المريض حتى يتم تعديلها وإرسالها مجددًا.');
    }
    function displayProcedure(item){
      const base=item.code==='other'?(item.customService||item.service||'إجراء آخر'):(item.service||'إجراء');
      if(item.code==='ceramic-veneer')return`${base} — ${item.variant==='without-prep'?'بدون تحضير':'بتحضير'}`;
      return base;
    }
    function shareSheetParts(){
      collectHeaderFields();
      const finalPlan=isFinalPlanStatus();
      const doctorApproved=state.meta.status==='submitted';
      const phases=state.phases.map((phase,index)=>({
        title:phase.title||`المرحلة ${index+1}`,
        items:phase.items.filter(item=>item.service).map(item=>({
          name:displayProcedure(item),qty:Math.max(1,Number(item.qty||1)),
          before:item.type==='included'?'مجاني':formatMoney(itemTotals(item).before),
          after:item.type==='included'?'مجاني':formatMoney(itemTotals(item).after)
        }))
      })).filter(phase=>phase.items.length);
      const total=totals(),dates=planDates();
      const phaseHtml=phases.map((phase,index)=>`<section class="sp-phase"><h3><b>${index+1}</b>${escapeHtml(phase.title)}</h3><table><thead><tr><th>الإجراء</th><th>العدد</th><th>قبل الخصم</th><th>بعد الخصم</th></tr></thead><tbody>${phase.items.map(item=>`<tr><td>${escapeHtml(item.name)}</td><td>${item.qty}</td><td>${escapeHtml(item.before)}</td><td>${escapeHtml(item.after)}</td></tr>`).join('')}</tbody></table></section>`).join('');
      const generatedAt=dateTimeFormatter.format(new Date());
      const body=`<div class="share-plan ${finalPlan?'sp-final-plan':'sp-draft-plan'}" dir="rtl">
        <div class="sp-watermark" aria-hidden="true"></div>
        <div class="sp-copy-label">${finalPlan?'نسخة نهائية للاطلاع':doctorApproved?'معتمدة من الطبيب — بانتظار توقيع المريض':'مسودة غير نهائية للاطلاع'}</div>
        <div class="sp-document-body"><header><div><h1>عيادات أفضل عناية الاستشارية للأسنان</h1><p>${finalPlan?'الخطة العلاجية النهائية المعتمدة':doctorApproved?'خطة علاجية معتمدة من الطبيب':'خطة علاجية وعرض تكلفة تقديري'}</p></div><div class="sp-meta">رقم الخطة: ${escapeHtml(state.meta.planNo)}<br/>تاريخ الإصدار: ${dateFormatter.format(dates.issued)}${finalPlan?`<br/>تاريخ الطباعة: ${escapeHtml(generatedAt)}`:''}</div><img class="sp-logo-img" src="./best-care-logo.png" width="613" height="900" alt="شعار أفضل عناية"></header>
        <div class="sp-patient"><span style="overflow-wrap:anywhere"><b>المريض</b>${escapeHtml(state.patient.fullName||'—')}</span><span><b>رقم الملف</b>${escapeHtml(state.patient.fileNo||'—')}</span><span><b>الجوال</b>${escapeHtml(state.patient.mobile||'—')}</span></div>
        <section class="sp-clinical"><h2>التشخيص والفحوصات</h2><p>${escapeHtml(DEFAULT_DIAGNOSIS)}</p><p><b>الإجراءات التشخيصية:</b> تم استكمال الإجراءات التشخيصية اللازمة للحالة ومراجعة النتائج، وقد تم أخذ كل ما يلزم منها وشرح التشخيص والخطة العلاجية المقترحة للمريض بصورة واضحة.</p>${state.clinical.radiographs?`<p><b>الفحوصات والصور:</b> ${escapeHtml(state.clinical.radiographs)}</p>`:''}</section>
        <main>${phaseHtml}</main>
        <section class="sp-finance"><span><b>قبل الخصم</b>${formatMoney(total.before)}</span><span><b>قيمة الخصم</b>${formatMoney(total.saving)}</span><span><b>بعد الخصم</b>${formatMoney(total.after)}</span><span class="net"><b>الصافي المستحق</b>${formatMoney(total.net)}</span></section>
        <section class="sp-terms"><b>${finalPlan?'نسخة نهائية معتمدة:':doctorApproved?'اعتماد الطبيب:':'تنبيه مهم:'}</b> ${finalPlan?'هذه الخطة العلاجية معتمدة نهائيًا وفق الإجراءات والأسعار الموضحة.':doctorApproved?'راجع الطبيب هذه الخطة واعتمد إرسالها للمريض، وتصبح نهائية بعد إتمام موافقة وتوقيع المريض من الرابط الخاص.':'هذه مسودة للاطلاع وليست فاتورة أو اعتمادًا نهائيًا.'} العرض ساري ${Number(state.meta.validityDays||15)} يومًا، وقد تتغير المراحل أو المدة بحسب المستجدات السريرية. أي إجراء غير مدرج يوثّق ويسعّر بصورة مستقلة بعد موافقة المريض.</section>
        <section class="sp-consent"><b>إقرار مختصر:</b> تم شرح طبيعة الإجراءات وأهدافها والفوائد والمخاطر والبدائل، وأُتيحت للمريض فرصة طرح الأسئلة. تختلف الاستجابة للعلاج ولا يمكن ضمان نتيجة نهائية، ويلزم الالتزام بالتعليمات والمراجعات الدورية.${doctorApproved&&preparedConsentUrl?`<div class="sp-consent-link"><b>رابط المراجعة والتوقيع:</b> ${escapeHtml(preparedConsentUrl)}</div>`:''}</section></div>
        <footer><span>بيانات صحية شخصية — تعامل بسرية</span><span>عيادات أفضل عناية الاستشارية للأسنان · أبها</span></footer>
      </div>`;
      const css=`*{box-sizing:border-box}.share-plan{position:relative;isolation:isolate;display:flex;flex-direction:column;width:1120px;min-height:1640px;padding:42px 48px 38px;background:#fff;color:#203a31;font-family:"Best Care Arabic","IBM Plex Sans Arabic",Tahoma,Arial,sans-serif;font-kerning:normal;font-feature-settings:"kern" 1,"liga" 1,"calt" 1;overflow:hidden}.share-plan>*:not(.sp-watermark){position:relative;z-index:1}.sp-document-body{display:grid;flex:1;grid-template-rows:repeat(7,auto);align-content:space-between;row-gap:16px}.sp-watermark{position:absolute;inset:120px 76px 74px;z-index:0;background:url("./best-care-logo.png") center 50%/72% auto no-repeat;opacity:.032;filter:grayscale(1) contrast(1.08);pointer-events:none}.sp-copy-label{align-self:flex-start;min-width:230px;margin:0 0 16px;padding:10px 24px;border:2px solid #c96d75;border-radius:999px;background:#fff4f5;color:#9f2f39;text-align:center;font-size:18px;font-weight:800;line-height:1.45}.sp-final-plan .sp-copy-label{border-color:#6f9fc1;background:#edf6fc;color:#245d88}.share-plan header{display:grid;grid-template-columns:1fr 190px 92px;gap:16px;align-items:center;border-bottom:6px solid #287b5a;padding-bottom:12px}.sp-logo-img{display:block;width:88px;height:88px;object-fit:contain}.share-plan h1{margin:0;color:#1f6547;font-size:31px;font-weight:700}.share-plan header p{margin:5px 0 0;color:#6a7e75;font-size:17px}.sp-final-plan header p{color:#245d88;font-weight:700}.sp-meta{text-align:left;direction:rtl;font-size:14px;line-height:1.8;color:#596f66}.sp-patient{display:grid;grid-template-columns:2fr 1fr 1.2fr;gap:10px}.sp-patient span,.sp-finance span{padding:13px 14px;border:1px solid #cfe0d8;border-radius:12px;background:rgba(247,251,249,.92);font-size:16px}.sp-patient b,.sp-finance b{display:block;margin-bottom:5px;color:#527064;font-size:12px}.sp-clinical,.sp-terms,.sp-consent{padding:15px 16px;border:1px solid #d4e3dc;border-radius:12px;background:rgba(251,253,252,.92)}.sp-clinical h2{margin:0 0 7px;color:#21684a;font-size:18px;font-weight:700}.sp-clinical p,.sp-terms,.sp-consent{margin:5px 0;font-size:14px;line-height:1.72}.sp-consent-link{margin-top:8px;padding:8px 10px;border-radius:8px;background:#eaf6f0;color:#185e42;direction:ltr;text-align:left;overflow-wrap:anywhere;font-size:11px}.sp-consent-link b{display:block;direction:rtl;text-align:right}.sp-phase{border:1px solid #bfd7cc;border-radius:12px;overflow:hidden;background:rgba(255,255,255,.9)}.sp-phase+.sp-phase{margin-top:15px}.sp-phase h3{display:flex;align-items:center;gap:9px;margin:0;padding:11px 13px;background:rgba(234,245,240,.94);color:#235f48;font-size:17px;font-weight:700}.sp-phase h3 b{display:grid;place-items:center;width:27px;height:27px;border-radius:50%;background:#2b8060;color:#fff}.sp-phase table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:14px}.sp-phase th,.sp-phase td{padding:9px 10px;border-bottom:1px solid #e1ebe6;text-align:right}.sp-phase th{background:rgba(247,250,248,.94);color:#47665a}.sp-phase th:first-child{width:48%}.sp-finance{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.sp-finance .net{background:rgba(223,242,232,.94);border-color:#78b697;color:#164f38}.sp-terms{border-color:#edcf83;background:rgba(255,249,231,.94);color:#634b13}.sp-final-plan .sp-terms{border-color:#8eb7d6;background:rgba(238,246,252,.94);color:#204d6d}.sp-consent{background:rgba(244,248,246,.94)}.share-plan footer{display:flex;justify-content:space-between;margin-top:18px;padding-top:13px;border-top:2px solid #d4e3dc;color:#697d75;font-size:12px}`;
      return{body,css,rowCount:phases.reduce((sum,phase)=>sum+phase.items.length,0),phaseCount:phases.length};
    }
    function pdfFromJpeg(jpegBytes,width,height){
      const encoder=new TextEncoder(),parts=[],offsets=[0];let length=0;
      const add=value=>{const bytes=typeof value==='string'?encoder.encode(value):value;parts.push(bytes);length+=bytes.length};
      add(new Uint8Array([37,80,68,70,45,49,46,52,10,37,226,227,207,211,10]));
      const object=(number,content)=>{offsets[number]=length;add(`${number} 0 obj\n${content}\nendobj\n`)};
      object(1,'<< /Type /Catalog /Pages 2 0 R >>');
      object(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
      object(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
      offsets[4]=length;add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);add(jpegBytes);add('\nendstream\nendobj\n');
      const commands='q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n';
      object(5,`<< /Length ${encoder.encode(commands).length} >>\nstream\n${commands}endstream`);
      const xref=length;add('xref\n0 6\n0000000000 65535 f \n');for(let number=1;number<=5;number++)add(`${String(offsets[number]).padStart(10,'0')} 00000 n \n`);
      add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
      const output=new Uint8Array(length);let cursor=0;parts.forEach(part=>{output.set(part,cursor);cursor+=part.length});return output;
    }
    function loadHtml2Canvas(){
      if(typeof globalThis.html2canvas==='function')return Promise.resolve(globalThis.html2canvas);
      if(html2CanvasLoader)return html2CanvasLoader;
      html2CanvasLoader=new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        script.src='./assets/vendor/html2canvas.min.js';
        script.async=true;
        script.onload=()=>typeof globalThis.html2canvas==='function'?resolve(globalThis.html2canvas):reject(new Error('تعذر تشغيل أداة PDF'));
        script.onerror=()=>reject(new Error('تعذر تحميل أداة PDF'));
        document.head.appendChild(script);
      }).catch(error=>{html2CanvasLoader=null;throw error});
      return html2CanvasLoader;
    }
    function safeShareFileToken(value,fallback){
      const token=String(value||'')
        .normalize('NFKD')
        .replace(/[^\x20-\x7E]/g,'')
        .replace(/[^A-Za-z0-9._-]+/g,'-')
        .replace(/^[._-]+|[._-]+$/g,'')
        .slice(0,48);
      return token||fallback;
    }
    function shareFileBaseName(){
      const plan=safeShareFileToken(state.meta.planNo,'Plan');
      const file=safeShareFileToken(state.patient.fileNo,'Patient');
      return `BestCare-TreatmentPlan-${isFinalPlanStatus()?'Final':'Draft'}-${plan}-${file}`;
    }
    async function renderShareAssets(){
      const {body,css,rowCount,phaseCount}=shareSheetParts();
      const renderCanvas=await loadHtml2Canvas();
      const sheet=document.createElement('div');
      sheet.style.cssText='position:fixed;right:-20000px;top:0;width:1240px;height:1754px;padding:50px 60px;background:#eef6f2;overflow:hidden;z-index:-1;pointer-events:none';
      sheet.innerHTML=`<style>${css}</style><div class="share-scale" style="width:1120px;transform-origin:top center">${body}</div>`;
      document.body.appendChild(sheet);
      try{
        await Promise.all([...sheet.querySelectorAll('img')].map(image=>{
          if(image.complete&&image.naturalWidth)return image.decode?.().catch(()=>{})||Promise.resolve();
          return new Promise(resolve=>{
            const finish=()=>resolve();
            image.addEventListener('load',finish,{once:true});
            image.addEventListener('error',finish,{once:true});
            setTimeout(finish,4000);
          });
        }));
        const naturalHeight=Math.max(1,sheet.querySelector('.share-plan').scrollHeight);
        const scale=Math.min(1,1640/naturalHeight);
        sheet.querySelector('.share-scale').style.transform=`scale(${scale})`;
        await document.fonts?.ready;
        const canvas=await renderCanvas(sheet,{backgroundColor:'#eef6f2',scale:1.25,useCORS:true,logging:false,width:1240,height:1754,imageTimeout:12000});
        const jpeg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.97));if(!jpeg)throw new Error('تعذر إنشاء صورة الخطة');
        const pdf=pdfFromJpeg(new Uint8Array(await jpeg.arrayBuffer()),canvas.width,canvas.height);
        const base=shareFileBaseName();
        return{
          pdf:new File([pdf],`${base}.pdf`,{type:'application/pdf'}),
          image:new File([jpeg],`${base}.jpg`,{type:'image/jpeg'})
        };
      }finally{sheet.remove()}
    }
    function downloadShareFile(file,format){
      const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
      toast(`تم تنزيل ${format==='pdf'?'ملف PDF':'صورة الخطة'}`,`أرفق ${format==='pdf'?'الملف':'الصورة'} في WhatsApp Web؛ المتصفح على الكمبيوتر لا يسمح بالإرفاق التلقائي.`);
    }
    function closeShareReady(){
      $('shareReadyModal').hidden=true;
      if(preparedPreviewUrl){URL.revokeObjectURL(preparedPreviewUrl);preparedPreviewUrl=''}
      $('shareImagePreview').removeAttribute('src');
    }
    function openShareReady(file,format){
      preparedShareFile=file;preparedShareFormat=format;preparedShareIsFinal=isFinalPlanStatus();
      if(preparedPreviewUrl){URL.revokeObjectURL(preparedPreviewUrl);preparedPreviewUrl=''}
      const isImage=format==='image';
      $('shareReadyIcon').textContent=isImage?'🖼️':'📄';
      const awaitingSignature=state.meta.status==='submitted'&&Boolean(preparedConsentUrl);
      $('shareReadyTitle').textContent=preparedShareIsFinal?(isImage?'نسخة نهائية جاهزة':'نسخة نهائية PDF جاهزة'):awaitingSignature?'خطة الطبيب ورابط التوقيع جاهزان':(isImage?'مسودة جاهزة':'مسودة PDF جاهزة');
      $('shareReadyText').textContent=awaitingSignature?'ستتضمن رسالة واتساب رابط مراجعة وتوقيع خاصًا بالمريض مع نسخة الخطة.':isImage?'راجع نسخة الاطلاع ثم افتح مشاركة الجهاز واختر واتساب والمريض.':'هذه نسخة للاطلاع؛ افتح مشاركة الجهاز ثم اختر واتساب والمريض.';
      $('sharePreparedBtn').textContent=isImage?'فتح واتساب ومشاركة الصورة':'فتح واتساب ومشاركة PDF';
      $('shareImagePreview').hidden=!isImage;$('sharePdfPreview').hidden=isImage;
      $('shareConsentLinkBox').hidden=!awaitingSignature;$('shareConsentLinkText').textContent=awaitingSignature?preparedConsentUrl:'';
      if(isImage){preparedPreviewUrl=URL.createObjectURL(file);$('shareImagePreview').src=preparedPreviewUrl}
      $('shareReadyModal').hidden=false;
      $('sharePreparedBtn').focus();
    }
    async function sharePreparedPlan(){
      if(!preparedShareFile)return;
      collectHeaderFields();
      const title=preparedShareIsFinal?'نسخة نهائية':state.meta.status==='submitted'?'خطة معتمدة من الطبيب':'مسودة';
      const text=whatsappPlanMessage(preparedShareIsFinal);
      const patientPhone=normalizeWhatsAppPhone(state.patient.mobile);
      if(!patientPhone){
        closeShareReady();
        $('patientMobile').scrollIntoView({behavior:'smooth',block:'center'});
        $('patientMobile').focus();
        toast('رقم جوال المريض غير مكتمل','أدخل رقمًا سعوديًا صحيحًا مثل 05xxxxxxxx ثم أعد المشاركة.');
        return;
      }
      try{
        if(navigator.canShare?.({files:[preparedShareFile]})){
          document.documentElement.dataset.pdfShareState=`sharing-${preparedShareFormat}:${preparedShareFile.size}`;
          await navigator.share({title,text,files:[preparedShareFile]});
          recordPlanWhatsappCommunication();
          document.documentElement.dataset.pdfShareState='shared';closeShareReady();
          toast('تم فتح المشاركة',`اختر واتساب ثم محادثة المريض على الرقم ${state.patient.mobile}.`);
        }else{
          document.documentElement.dataset.pdfShareState=`downloaded:${preparedShareFile.size}`;
          downloadShareFile(preparedShareFile,preparedShareFormat);
          const whatsappUrl=`https://wa.me/${patientPhone}?text=${encodeURIComponent(text)}`;
          const whatsappLink=document.createElement('a');
          whatsappLink.href=whatsappUrl;whatsappLink.target='_blank';whatsappLink.rel='noopener noreferrer';
          document.body.appendChild(whatsappLink);whatsappLink.click();whatsappLink.remove();
          recordPlanWhatsappCommunication();
          document.documentElement.dataset.pdfShareState=`opened-whatsapp:${patientPhone}`;
          closeShareReady();
          toast('تم فتح محادثة المريض','تم تنزيل ملف الخطة وفتح واتساب على رقم المريض؛ أرفق الملف الذي تم تنزيله.');
        }
      }catch(error){
        document.documentElement.dataset.pdfShareState=error?.name==='AbortError'?'share-cancelled':`error:${error?.message||error?.name||'unknown'}`;
        if(error?.name!=='AbortError')toast(`تعذرت مشاركة ${preparedShareIsFinal?'الخطة النهائية':'المسودة'}`,error?.message||'حاول مرة أخرى.');
      }
    }
    async function sendWhatsAppPlan(format='pdf'){
      collectHeaderFields();
      const finalPlan=isFinalPlanStatus();
      const items=state.phases.flatMap(phase=>phase.items).filter(item=>item.service);
      if(!items.length){toast('لا توجد إجراءات','أضف إجراءً واحدًا على الأقل قبل المشاركة.');return}
      const label=format==='image'?'الصورة':'ملف PDF';
      if(state.meta.status==='submitted'){
        const missing=approvalMissing();
        if(missing.length){toast('تعذر إرسال الخطة للتوقيع',`أكمل: ${missing.join('، ')}`);renderProgress();return}
        if(!(await savePlan(true)))return;
        try{await ensureConsentLink()}catch(error){toast('تعذر إنشاء رابط التوقيع',error.message||'حاول مرة أخرى.');return}
      }
      const signature=JSON.stringify({patient:state.patient,clinical:state.clinical,phases:state.phases,financial:state.financial,consentUrl:preparedConsentUrl,meta:{planNo:state.meta.planNo,issuedAt:state.meta.issuedAt,validityDays:state.meta.validityDays,status:state.meta.status}});
      const cachedFile=format==='image'?cachedShareImage:cachedSharePdf;
      if(cachedFile&&cachedShareSignature===signature){
        openShareReady(cachedFile,format);
        return;
      }
      document.documentElement.dataset.pdfShareState='preparing';
      toast(`جارٍ تجهيز ${label}`,finalPlan?'سيتم إنشاء النسخة النهائية بصيغة A4 من صفحة واحدة.':state.meta.status==='submitted'?'سيتم تضمين رابط التوقيع الخاص داخل النسخة ورسالة واتساب.':'سيتم إنشاء مسودة واضحة بصيغة A4 من صفحة واحدة للاطلاع.');
      try{
        const assets=await renderShareAssets();
        cachedSharePdf=assets.pdf;cachedShareImage=assets.image;cachedShareSignature=signature;
        const file=format==='image'?cachedShareImage:cachedSharePdf;
        document.documentElement.dataset.pdfShareState=`generated:${file.size}`;
        document.documentElement.dataset.pdfShareState=`ready-to-share:${file.size}`;
        openShareReady(file,format);
      }catch(error){
        document.documentElement.dataset.pdfShareState=`error:${error?.message||error?.name||'unknown'}`;
        if(error?.name!=='AbortError')toast(`تعذرت مشاركة ${label}`,error?.message||'حاول مرة أخرى.');
      }
    }
    function updateItemFromInput(input,rerender=false){
      const row=input.closest('[data-item-row]');if(!row)return;
      const [pIndex,iIndex]=row.dataset.itemRow.split(':').map(Number),item=state.phases[pIndex]?.items[iIndex];if(!item)return;
      activeItem={phase:pIndex,item:iIndex};
      const field=input.dataset.field;
      if(field==='qty')item.qty=Math.max(1,Math.min(99,Number(input.value||1)));
      else if(field==='procedureCode'){
        const entry=procedureCatalog.find(option=>option.id===input.value);
        item.code=entry?.id||'';item.service=entry?.name||'';
        item.unitPriceBefore=entry?.beforePrice??'';item.unitPriceAfter=entry?.afterPrice??'';
        item.beforePriceSource=entry&&entry.beforePrice!==''?'catalog':'';
        item.afterPriceSource=entry&&entry.afterPrice!==''?'catalog':'';
        item.priceSource=item.afterPriceSource;
      }else{
        item[field]=input.value;
        if(field==='unitPriceBefore')item.beforePriceSource='manual';
        if(field==='unitPriceAfter'){item.afterPriceSource='manual';item.priceSource='manual'}
      }
      if(field==='procedureCode'){
        if(item.code!=='ceramic-veneer')item.variant='';
        if(item.code!=='other')item.customService='';
      }
      markDirty();
      if(rerender)renderPhases();
      renderFinancials();
    }
    function addPhase(){
      state.phases.forEach((phase,index)=>collapsedPhases.add(index));
      state.phases.push(blankPhase(state.phases.length));
      const nextIndex=state.phases.length-1;collapsedPhases.delete(nextIndex);activeItem={phase:nextIndex,item:0};markDirty();render();
    }
    function addItem(pIndex){state.phases[pIndex].items.push(blankItem());activeItem={phase:pIndex,item:state.phases[pIndex].items.length-1};markDirty();render()}
    function deleteItem(pIndex,iIndex){const phase=state.phases[pIndex];if(phase.items.length===1){phase.items[0]=blankItem()}else phase.items.splice(iIndex,1);activeItem={phase:pIndex,item:0};markDirty();render()}
    function deletePhase(pIndex){if(state.phases.length===1)return;state.phases.splice(pIndex,1);state.phases.forEach((phase,index)=>phase.index=index);collapsedPhases.clear();activeItem={phase:0,item:0};markDirty();render()}
    function toggleIncluded(pIndex,iIndex){const item=state.phases[pIndex].items[iIndex];item.type=item.type==='included'?'billable':'included';if(item.type==='included'){item.unitPriceBefore='';item.unitPriceAfter='';item.beforePriceSource='';item.afterPriceSource='';item.priceSource='';item.includedLabel='بدون تكلفة'}markDirty();render()}
    function togglePreview(){
      collectHeaderFields();document.body.classList.toggle('preview-mode');
      const preview=document.body.classList.contains('preview-mode');
      $('previewBtn').textContent=preview?'عودة للتحرير':'معاينة الطباعة';
      render();
    }
    function toggleCompactEntry(){
      const compact=document.body.classList.toggle('compact-entry');
      localStorage.setItem('bestcare_treatment_compact',compact?'1':'0');
      $('compactEntryBtn').textContent=compact?'إظهار الوثيقة كاملة':'إدخال سريع';
    }
    function validateBeforePrint(){
      collectHeaderFields();const missing=missingFields();renderProgress();
      if(missing.length){toast('الخطة غير مكتملة',`تبقى: ${missing.join('، ')}`);$('missingBanner').scrollIntoView({behavior:'smooth',block:'center'});return false}
      return true;
    }
    function fitPlanToA4(){
      if(!document.body.classList.contains('one-page-print'))return 1;
      const paper=$('paper'),wrap=paper?.parentElement;if(!paper||!wrap)return 1;
      const available=Math.max(1,wrap.clientHeight||paper.offsetWidth*(282/200));
      const fitLimit=Math.max(1,available-24);
      const applyScale=value=>{
        document.body.style.setProperty('--print-fit-scale',value.toFixed(4));
        document.body.style.setProperty('--print-layout-width',`${(200/value).toFixed(3)}mm`);
        void paper.offsetHeight;
        return paper.getBoundingClientRect().height;
      };
      let low=.1,high=1,best=.1,height=applyScale(1);
      if(height<=fitLimit)best=1;
      else{
        for(let index=0;index<12;index+=1){
          const candidate=(low+high)/2,candidateHeight=applyScale(candidate);
          if(candidateHeight<=fitLimit){best=candidate;low=candidate}else high=candidate;
        }
        height=applyScale(best);
      }
      document.documentElement.dataset.printFitScale=best.toFixed(4);
      document.documentElement.dataset.printNaturalHeight=String(Math.round(height/Math.max(best,.001)));
      document.documentElement.dataset.printAvailableHeight=String(Math.round(available));
      document.documentElement.dataset.printRenderedHeight=String(Math.round(height));
      return best;
    }
    async function printPlan(){
      if(!['approved','approved_signed'].includes(state.meta.status)){
        const guidance={
          draft:workflowRole()==='clinic'?'اضغط «حفظ وإرسال للإدارة» أولًا.':'الخطة ما زالت مسودة لدى العيادة ولم تُرسل للإدارة.',
          submitted:workflowRole()==='admin'?'اضغط «مشاركة الخطة + رابط التوقيع» لإرسال النسخة المعتمدة من الطبيب.':'الخطة لدى الإدارة بانتظار مشاركتها وتوقيع المريض.',
          patient_accepted:workflowRole()==='admin'?'استكمل توقيع المريض للخطة القديمة ثم اعتمدها.':'تم تسجيل موافقة قديمة وتحتاج استكمال التوقيع.',
          rejected:'الخطة تحتاج تعديلًا ثم إعادة إرسالها للإدارة.',
          cancelled:'هذه الخطة ملغاة ومحفوظة في السجل. يمكن للإدارة إعادتها إلى مسودة من مركز الخطط.'
        };
        toast('النسخة غير معتمدة',guidance[state.meta.status]||'يجب اعتماد الخطة من الإدارة قبل الطباعة.');
        $('workflowTrack').scrollIntoView({behavior:'smooth',block:'start'});
        return;
      }
      if(!validateBeforePrint())return;
      state.meta.lastPrintedAt=Date.now();
      $('printedAtText').textContent=dateTimeFormatter.format(new Date(state.meta.lastPrintedAt));
      renderDocMeta();
      collectHeaderFields();document.body.classList.add('preview-mode','one-page-print');
      const itemCount=state.phases.reduce((sum,phase)=>sum+phase.items.filter(item=>item.service).length,0);
      document.body.classList.toggle('print-dense',itemCount>8);
      document.body.classList.toggle('print-ultra',itemCount>15);
      $('paper').classList.add('approved');
      const saved=await savePlan(true);
      if(!saved){state.meta.lastPrintedAt=0;renderDocMeta();return}
      await Promise.all([syncPlanStatusToDashboard(state.meta.status),syncPlanRegistry(state.meta.status)]);
      await document.fonts?.ready;
      setTimeout(()=>window.print(),80);
    }
    function setupSignature(){
      const canvas=$('patientSignature'),ctx=canvas.getContext('2d');ctx.strokeStyle='#1a2e35';ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';
      let drawing=false,last=null;
      const point=event=>{const rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height}};
      canvas.addEventListener('pointerdown',event=>{drawing=true;last=point(event);canvas.setPointerCapture(event.pointerId)});
      canvas.addEventListener('pointermove',event=>{if(!drawing)return;const next=point(event);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.quadraticCurveTo(last.x,last.y,(last.x+next.x)/2,(last.y+next.y)/2);ctx.stroke();last=next});
      const stop=()=>drawing=false;canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);
      $('clearSignatureBtn').addEventListener('click',()=>{ctx.clearRect(0,0,canvas.width,canvas.height);signatureFixed=false;state.signatures.patientSignature='';markDirty()});
      $('fixSignatureBtn').addEventListener('click',()=>{state.signatures.patientSignature=canvas.toDataURL('image/png');signatureFixed=true;markDirty();toast('تم تثبيت التوقيع')});
    }
    function bindEvents(){
      $('returnToLoginBtn').addEventListener('click',()=>location.href='./?view=admin');
      document.querySelectorAll('[data-scroll]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.scroll)?.scrollIntoView({behavior:'smooth',block:'start'})));
      $('backBtn').addEventListener('click',()=>location.href=source.returnUrl||`./?view=admin${appointmentDate?`&date=${encodeURIComponent(appointmentDate)}`:''}`);
      $('addPhaseBtn').addEventListener('click',addPhase);$('saveBtn').addEventListener('click',saveDraftPlan);$('previewBtn').addEventListener('click',togglePreview);
      $('compactEntryBtn').addEventListener('click',toggleCompactEntry);
      $('sidePreviewBtn').addEventListener('click',togglePreview);
      $('doctorApproveShortcutBtn').addEventListener('click',()=>{
        if(workflowRole()==='clinic'){
          $('doctorHandoffCard').scrollIntoView({behavior:'smooth',block:'center'});
          setTimeout(()=>$('doctorApprovalCheck').focus(),350);
          return;
        }
        const clinicPlanUrl=new URL(location.href);
        clinicPlanUrl.searchParams.set('view','clinic');
        location.href=clinicPlanUrl.toString();
      });
      $('sendAdminBtn').addEventListener('click',submitToAdmin);$('patientAcceptedBtn').addEventListener('click',confirmPatientAcceptance);$('approvePlanBtn').addEventListener('click',approvePlan);$('rejectPlanBtn').addEventListener('click',rejectPlan);$('whatsappPlanBtn').addEventListener('click',()=>sendWhatsAppPlan('pdf'));
      $('floatingWhatsappBtn').addEventListener('click',event=>{event.preventDefault();event.stopPropagation();$('whatsappPlanBtn').click()});
      $('floatingPdfBtn').addEventListener('click',event=>{event.preventDefault();event.stopPropagation();$('printBtn').click()});
      $('doctorApprovalCheck').addEventListener('change',()=>{
        const confirmed=$('doctorApprovalCheck').checked;
        $('doctorHandoffCard').classList.toggle('confirmed',confirmed);
        $('sendAdminBtn').disabled=!confirmed;
      });
      $('closeShareReadyBtn').addEventListener('click',closeShareReady);$('shareReadyModal').addEventListener('click',event=>{if(event.target===$('shareReadyModal'))closeShareReady()});$('sharePreparedBtn').addEventListener('click',sharePreparedPlan);$('downloadPreparedBtn').addEventListener('click',()=>preparedShareFile&&downloadShareFile(preparedShareFile,preparedShareFormat));$('copyConsentLinkBtn').addEventListener('click',async()=>{if(!preparedConsentUrl)return;try{await navigator.clipboard.writeText(preparedConsentUrl);toast('تم نسخ رابط التوقيع','يمكن إرساله للمريض من نفس محادثة واتساب.')}catch{toast('تعذر النسخ التلقائي','حدد الرابط الظاهر وانسخه يدويًا.')}});
      $('printBtn').addEventListener('click',printPlan);
      $('vatMode').addEventListener('change',()=>{$('vatConfirmed').checked=false;$('vatControl').classList.remove('confirmed');state.financial.vatConfirmed=false;markDirty();toast('يلزم تأكيد الضريبة','غيّرت وضع الضريبة؛ راجع أهلية المريض ثم فعّل مربع التأكيد.')});
      $('vatConfirmed').addEventListener('change',()=>{$('vatControl').classList.toggle('confirmed',$('vatConfirmed').checked);state.financial.vatConfirmed=$('vatConfirmed').checked;markDirty()});
      $('patientName').addEventListener('input',()=>{
        const previousName=(state.patient.fullName||'').trim();
        const signerValue=$('signerName').value.trim();
        if(!signerValue||signerValue===previousName)$('signerName').value=$('patientName').value.trim();
      });
      document.addEventListener('input',event=>{if(event.target.matches('.edit-field')&&!event.target.closest('#phasesContainer'))markDirty();if(event.target.matches('[data-field]'))updateItemFromInput(event.target,false)});
      document.addEventListener('change',event=>{if(event.target.matches('.edit-field')&&!event.target.closest('#phasesContainer'))markDirty();if(event.target.matches('[data-field]'))updateItemFromInput(event.target,true)});
      $('phasesContainer').addEventListener('focusin',event=>{const row=event.target.closest('[data-item-row]');if(row){const [phase,item]=row.dataset.itemRow.split(':').map(Number);activeItem={phase,item};document.querySelectorAll('[data-item-row]').forEach(itemRow=>itemRow.style.boxShadow=itemRow===row?'inset -3px 0 0 var(--teal)':'')}});
      $('phasesContainer').addEventListener('click',event=>{
        const add=event.target.closest('[data-add-item]'),delItem=event.target.closest('[data-delete-item]'),delPhase=event.target.closest('[data-delete-phase]'),included=event.target.closest('[data-toggle-included]'),togglePhase=event.target.closest('[data-toggle-phase]'),qtyButton=event.target.closest('[data-qty-action]');
        if(qtyButton){
          const row=qtyButton.closest('[data-item-row]');
          if(row){const [p,i]=row.dataset.itemRow.split(':').map(Number),item=state.phases[p]?.items[i];if(item){const delta=qtyButton.dataset.qtyAction==='increase'?1:-1;item.qty=Math.max(1,Math.min(99,Number(item.qty||1)+delta));activeItem={phase:p,item:i};markDirty();render()}}
          return;
        }
        if(add)addItem(Number(add.dataset.addItem));
        if(delItem){const [p,i]=delItem.dataset.deleteItem.split(':').map(Number);deleteItem(p,i)}
        if(delPhase)deletePhase(Number(delPhase.dataset.deletePhase));
        if(included){const [p,i]=included.dataset.toggleIncluded.split(':').map(Number);toggleIncluded(p,i)}
        if(togglePhase){const index=Number(togglePhase.dataset.togglePhase);if(collapsedPhases.has(index))collapsedPhases.delete(index);else collapsedPhases.add(index);renderPhases()}
      });
      $('phasesContainer').addEventListener('input',event=>{if(event.target.dataset.phaseTitle!==undefined){state.phases[Number(event.target.dataset.phaseTitle)].title=event.target.value;markDirty()}});
      $('digitalSignToggle').addEventListener('change',()=>{$('signatureCanvasWrap').classList.toggle('active',$('digitalSignToggle').checked);$('paperSignatureLine').style.display=$('digitalSignToggle').checked?'none':'block'});
      $('importJsonBtn').addEventListener('click',()=>{try{state=normalizeState(JSON.parse($('jsonInput').value));hydrateFields();render();markDirty();toast('تم تحليل البيانات')}catch{toast('تعذر تحليل JSON','تأكد من صحة التنسيق.')}});
      window.addEventListener('beforeprint',fitPlanToA4);
      const printMedia=window.matchMedia?.('print');
      printMedia?.addEventListener?.('change',event=>{if(event.matches)fitPlanToA4()});
      window.addEventListener('afterprint',()=>{
        document.body.classList.remove('one-page-print','print-dense','print-ultra');
        document.body.style.removeProperty('--print-fit-scale');
        document.body.style.removeProperty('--print-layout-width');
        if(document.body.classList.contains('draft-pdf')){
          document.body.classList.remove('draft-pdf');
          if(!window.__draftPreviewWasOpen)document.body.classList.remove('preview-mode');
          window.__draftPreviewWasOpen=false;
          renderDocMeta();renderPhases();
        }
      });
      window.addEventListener('beforeunload',()=>{if(!state||!hasUnsyncedChanges)return;collectHeaderFields();persistLocalPlan()});
    }
    async function init(){
      if(!(await verifyAuth()))return;
      source=sourceFromLocal();
      const local=loadLocalPlan();
      const [remoteResult]=await Promise.all([loadRemote(),loadProcedureCatalog(false)]);
      const remote=remoteResult?.plan||null;
      state=normalizeState(remote||local||null);
      state.patient.fullName=preferCompleteName(state.patient.fullName,source.name);
      if(!remote&&!local){
        state.patient.fileNo=source.file||'';
        state.patient.mobile=source.phone||'';
        state.meta.issuedAt=source.date&&source.start?new Date(`${source.date}T${source.start}:00+03:00`).toISOString():new Date().toISOString();
      }else if(remoteResult?.carriedForward&&!local){
        const previousPlanNo=state.meta.planNo||'';
        state.meta={...state.meta,planNo:nextPlanNo(),issuedAt:new Date().toISOString(),status:'draft',revision:1,relation:'addendum',parentPlanNo:previousPlanNo,doctorApprovedAt:0,doctorApprovedBy:'',submittedAt:0,patientAcceptedAt:0,patientAcceptedBy:'',approvedAt:0,approvedBy:'',consentMethod:'',consentEvidenceId:'',consentPlanRevision:0,consentVersion:0,lastPrintedAt:0,rejectedAt:0,rejectedBy:'',rejectionReason:'',cancelledAt:0,cancelledBy:'',cancellationReason:''};
        state.consent={photoConsent:true,photoConsentRecorded:false,photoConsentDefaultVersion:2,photoConsentAcceptedAt:0,termsVersion:0};
        state.signatures={patientSignature:'',signerName:'',guardianRelation:'',doctorName:'',doctorSignedAt:'',witnessName:'',witnessSignedAt:''};
        if(source.file)state.patient.fileNo=source.file;
        if(source.phone)state.patient.mobile=source.phone;
      }
      const compact=localStorage.getItem('bestcare_treatment_compact')!=='0';document.body.classList.toggle('compact-entry',compact);$('compactEntryBtn').textContent=compact?'إظهار الوثيقة كاملة':'إدخال سريع';
      hydrateFields();setupSignature();bindEvents();render();
      $('saveStatus').textContent=remoteResult?.carriedForward?'أُنشئ ملحق جديد مبني على خطة سابقة':remote?'محفوظ ومؤرشف':local?'مسودة محفوظة على الجهاز':'مسودة جديدة';
      $('saveStatus').classList.toggle('saved',Boolean(remote&&!remoteResult?.carriedForward));
      if(['submitted','patient_accepted'].includes(state.meta.status)||(currentUser?.role==='admin'&&['approved','approved_signed','rejected','cancelled'].includes(state.meta.status)))syncPlanRegistry(state.meta.status,state.meta.rejectionReason||'');
      setInterval(()=>{if(!document.hidden)loadProcedureCatalog(true)},15000);
      window.addEventListener('focus',()=>loadProcedureCatalog(true));
    }
    init();
  })();
