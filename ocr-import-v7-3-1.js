/* Best Care image-to-patient-list importer.
   Patient images are processed locally in the browser and never uploaded. */
(function(){
  'use strict';

  const state={file:null,objectUrl:'',rotation:0,worker:null,running:false,rows:[]};
  const $=id=>document.getElementById(id);
  const text={
    ar:{
      choose:'اختر صورة جدول المواعيد أو اسحبها هنا',ready:'الصورة جاهزة — اضغط بدء الاستخراج',loading:'تحميل محرك القراءة المحلي…',recognizing:'قراءة الجدول…',parsing:'ترتيب أسماء المرضى والمواعيد…',done:'اكتمل الاستخراج',badFile:'اختر ملف صورة بصيغة JPG أو PNG أو WEBP',tooLarge:'حجم الصورة أكبر من 20 ميجابايت',noRows:'لم تُكتشف صفوف مكتملة. جرّب صورة أوضح أو صحّح المسودة يدويًا.',needImage:'اختر صورة جدول المواعيد أولًا',mergeNone:'لا توجد صفوف صحيحة محددة للدمج',merged:'تم دمج قائمة الصورة',mergedDetail:n=>`أضيف ${n.added} مريض، وتجاوز النظام ${n.skipped} صف مكرر`,download:'تم تجهيز ملف CSV',failed:'تعذر قراءة الصورة',engineFailed:'تعذر تشغيل قارئ الصور على هذا الجهاز. تحقق من الاتصال أول مرة ثم أعد المحاولة.',review:'راجع الصفوف، خاصة المعلّمة بالأصفر أو الأحمر، ثم ادمجها في قائمة اليوم.',row:'صف',high:'ثقة عالية',medium:'يحتاج مراجعة',low:'يحتاج تصحيح',unnamed:'غير معروف'},
    en:{
      choose:'Choose an appointment image or drop it here',ready:'Image ready — start extraction',loading:'Loading the local reader…',recognizing:'Reading the appointment table…',parsing:'Organizing patients and times…',done:'Extraction complete',badFile:'Choose a JPG, PNG, or WEBP image',tooLarge:'The image is larger than 20 MB',noRows:'No complete rows were detected. Try a clearer image or edit the draft manually.',needImage:'Choose an appointment image first',mergeNone:'No valid selected rows to merge',merged:'Image list merged',mergedDetail:n=>`${n.added} patients added; ${n.skipped} duplicate rows skipped`,download:'CSV file prepared',failed:'Image reading failed',engineFailed:'The image reader could not start on this device. Connect once and retry.',review:'Review yellow or red rows, then merge them into today’s list.',row:'Row',high:'High confidence',medium:'Review',low:'Correction needed',unnamed:'Unknown'}
  };

  let api=null;
  const lang=()=>api?.getLang?.()==='en'?'en':'ar';
  const t=(key,...args)=>{
    const value=text[lang()][key]??text.ar[key]??key;
    return typeof value==='function'?value(...args):value;
  };
  const uid=()=>crypto.randomUUID?.()||`ocr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const normalizeDigits=value=>String(value??'')
    .replace(/[٠-٩]/g,char=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(char)))
    .replace(/[۰-۹]/g,char=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(char)));
  const cleanText=value=>normalizeDigits(value).replace(/[|_]+/g,' ').replace(/\s+/g,' ').trim();
  const minutes=value=>{const [h,m]=String(value||'0:0').split(':').map(Number);return h*60+m};
  const addMinutes=(value,amount)=>{
    const total=(minutes(value)+amount)%(24*60);
    return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
  };
  const validTime=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||''));
  const validRow=row=>Boolean(row.name&&row.file&&validTime(row.start)&&validTime(row.end)&&minutes(row.end)>minutes(row.start));
  const stopWords=new Set([
    'patient','name','file','file.n','time','start','end','date','mobile','phone','procedure','type','status',
    'المريض','الاسم','اسم','رقم','الملف','ملف','الوقت','البداية','النهاية','التاريخ','الجوال','الحالة','الإجراء','نوع','موعد'
  ]);

  function status(message,percent=0,mode='active'){
    const box=$('ocrProgress');
    const bar=$('ocrProgressBar');
    const label=$('ocrProgressText');
    if(box)box.hidden=false;
    if(bar)bar.style.width=`${Math.max(3,Math.min(100,Math.round(percent)))}%`;
    if(label)label.textContent=message;
    box?.setAttribute('data-mode',mode);
  }

  function setBusy(busy){
    state.running=busy;
    $('runOcrBtn').disabled=busy||!state.file;
    $('chooseOcrImageBtn').disabled=busy;
    $('rotateOcrBtn').disabled=busy||!state.file;
    $('mergeOcrBtn').disabled=busy||!state.rows.length;
    $('downloadOcrCsvBtn').disabled=busy||!state.rows.length;
    $('ocrSpinner').hidden=!busy;
  }

  function confidenceMeta(value){
    const confidence=Math.max(0,Math.min(100,Math.round(Number(value)||0)));
    if(confidence>=80)return{className:'high',label:t('high'),confidence};
    if(confidence>=55)return{className:'medium',label:t('medium'),confidence};
    return{className:'low',label:t('low'),confidence};
  }

  function timeMatches(value){
    const normalized=normalizeDigits(value)
      .replace(/[؛;٫،,\.]/g,':')
      .replace(/\s*:\s*/g,':');
    const matches=[];
    const pattern=/(?:^|\D)([01]?\d|2[0-3]):([0-5]\d)(?:\D|$)/g;
    let match;
    while((match=pattern.exec(normalized))){
      matches.push(`${String(Number(match[1])).padStart(2,'0')}:${match[2]}`);
      if(pattern.lastIndex===match.index)pattern.lastIndex+=1;
    }
    return [...new Set(matches)];
  }

  function wordsFromTsv(tsv){
    if(!tsv)return[];
    const lines=String(tsv).split(/\r?\n/).slice(1);
    return lines.map(line=>{
      const parts=line.split('\t');
      if(parts.length<12||parts[0]!=='5')return null;
      const raw=cleanText(parts.slice(11).join('\t'));
      if(!raw)return null;
      const left=Number(parts[6])||0,top=Number(parts[7])||0,width=Number(parts[8])||0,height=Number(parts[9])||0;
      return{page:parts[1],block:parts[2],paragraph:parts[3],line:parts[4],text:raw,confidence:Number(parts[10])||0,left,top,width,height,x:left+width/2,y:top+height/2};
    }).filter(Boolean);
  }

  function groupsFromWords(words){
    const clean=words.filter(word=>cleanText(word.text));
    const heights=clean.map(word=>word.height).filter(Boolean).sort((a,b)=>a-b);
    const medianHeight=heights[Math.floor(heights.length/2)]||28;
    const tolerance=Math.max(14,medianHeight*.72);
    const rows=[];
    clean.sort((a,b)=>a.y-b.y||a.left-b.left).forEach(word=>{
      let row=rows.find(item=>Math.abs(item.center-word.y)<=tolerance);
      if(!row){row={center:word.y,words:[]};rows.push(row)}
      row.words.push(word);
      row.center=row.words.reduce((sum,item)=>sum+item.y,0)/row.words.length;
    });
    return rows.sort((a,b)=>a.center-b.center).map(row=>row.words.sort((a,b)=>a.left-b.left));
  }

  function inferColumns(groups){
    const columns={};
    const aliases={
      patient:/^(patient|name|المريض|الاسم)$/i,
      file:/^(file|file\.n|filen|الملف|ملف)$/i,
      start:/^(time|start|البداية|الوقت)$/i,
      end:/^(end|النهاية)$/i,
      procedure:/^(procedure|type|الإجراء|النوع)$/i
    };
    groups.slice(0,12).flat().forEach(word=>{
      const token=cleanText(word.text).toLowerCase().replace(/[:#]/g,'');
      Object.entries(aliases).forEach(([key,pattern])=>{if(columns[key]===undefined&&pattern.test(token))columns[key]=word.x});
    });
    return columns;
  }

  function isHeaderGroup(group){
    const tokens=group.map(word=>word.text.toLowerCase().replace(/[:#]/g,''));
    const hits=tokens.filter(token=>stopWords.has(token)).length;
    return hits>=2||tokens.some(token=>/appointment report|schedule/i.test(token));
  }

  function wordTime(word){
    const exact=timeMatches(word.text);
    return exact[0]||'';
  }

  function closest(items,x){
    if(!items.length)return null;
    if(x===undefined)return items[0];
    return [...items].sort((a,b)=>Math.abs(a.x-x)-Math.abs(b.x-x))[0];
  }

  function parseWordGroup(group,columns,index){
    if(isHeaderGroup(group))return null;
    const joined=group.map(word=>word.text).join(' ');
    const timeWords=group.map(word=>({...word,time:wordTime(word)})).filter(word=>word.time);
    let times=[...new Set(timeWords.map(word=>word.time))];
    if(times.length<2)times=timeMatches(joined);
    if(times.length===1)times.push(addMinutes(times[0],30));
    if(times.length<2)return null;

    let start='',end='';
    if(columns.start!==undefined&&columns.end!==undefined&&timeWords.length>=2){
      const startWord=closest(timeWords,columns.start);
      start=startWord?.time||'';
      end=closest(timeWords.filter(word=>word!==startWord),columns.end)?.time||'';
    }
    if(!validTime(start)||!validTime(end)||minutes(end)<=minutes(start)){
      const ordered=[...times].filter(validTime).sort((a,b)=>minutes(a)-minutes(b));
      start=ordered[0]||'';
      end=ordered.find(value=>minutes(value)>minutes(start))||'';
    }
    if(!end&&start)end=addMinutes(start,30);

    const timeTexts=new Set(timeWords.map(word=>word.text));
    const numeric=group.map(word=>{
      const digits=normalizeDigits(word.text).replace(/\D/g,'');
      return{...word,digits};
    }).filter(word=>{
      if(timeTexts.has(word.text)||word.digits.length<3||word.digits.length>8)return false;
      if(/^20\d{2}$/.test(word.digits)||/^19\d{2}$/.test(word.digits))return false;
      if(/^05\d{7,}$/.test(word.digits))return false;
      return true;
    });
    const fileWord=closest(numeric,columns.file);
    const file=fileWord?.digits||'';

    let names=group.filter(word=>{
      const token=cleanText(word.text).toLowerCase().replace(/[:#]/g,'');
      if(stopWords.has(token)||wordTime(word)||/\d/.test(token))return false;
      return /[\u0600-\u06ff]{2,}|[a-z]{2,}/i.test(token);
    });
    if(columns.patient!==undefined){
      const otherCenters=Object.entries(columns).filter(([key])=>key!=='patient').map(([,value])=>value);
      const nameRadius=otherCenters.length?Math.max(110,Math.min(...otherCenters.map(value=>Math.abs(value-columns.patient)))*.48):220;
      names=names.filter(word=>Math.abs(word.x-columns.patient)<=nameRadius);
    }
    let nameWord=closest(names,columns.patient);
    if(!nameWord&&names.length)nameWord=names.find(word=>/[\u0600-\u06ff]/.test(word.text))||names[0];
    const name=cleanText(nameWord?.text||'').split(/\s+/)[0];
    if(!file)return null;

    let procedure='';
    if(columns.procedure!==undefined){
      const centers=Object.values(columns).filter(value=>value!==columns.procedure);
      const radius=Math.max(120,Math.min(...centers.map(value=>Math.abs(value-columns.procedure)))/2);
      procedure=group.filter(word=>Math.abs(word.x-columns.procedure)<=radius&&!wordTime(word)&&!/^\d+$/.test(normalizeDigits(word.text).replace(/\D/g,'')))
        .map(word=>cleanText(word.text)).filter(token=>!stopWords.has(token.toLowerCase())).join(' ');
    }
    const confidenceValues=[nameWord?.confidence,fileWord?.confidence,...timeWords.slice(0,2).map(word=>word.confidence)].filter(Number.isFinite);
    let confidence=confidenceValues.length?confidenceValues.reduce((sum,value)=>sum+value,0)/confidenceValues.length:45;
    if(!name)confidence=Math.min(confidence,35);
    const row={id:uid(),sourceIndex:index+1,include:Boolean(name),name,file,start,end,procedure,confidence};
    row.valid=validRow(row);
    return row;
  }

  function parseTextFallback(rawText,startIndex=0){
    return String(rawText||'').split(/\r?\n/).map(cleanText).filter(Boolean).map((line,index)=>{
      const times=timeMatches(line).sort((a,b)=>minutes(a)-minutes(b));
      if(!times.length)return null;
      const start=times[0],end=times.find(value=>minutes(value)>minutes(start))||addMinutes(start,30);
      const numbers=line.match(/\b\d{3,8}\b/g)||[];
      const file=numbers.find(value=>!/^20\d{2}$/.test(value)&&!/^19\d{2}$/.test(value)&&!times.some(time=>time.replace(':','')===value))||'';
      const tokens=line.split(/\s+/).filter(token=>/[\u0600-\u06ff]{2,}|[a-z]{2,}/i.test(token)&&!stopWords.has(token.toLowerCase()));
      const name=(tokens.find(token=>/[\u0600-\u06ff]/.test(token))||tokens[0]||'').replace(/[^\u0600-\u06ffA-Za-z'-]/g,'');
      if(!name||!file)return null;
      return{id:uid(),sourceIndex:startIndex+index+1,include:true,name:name.split(/\s+/)[0],file,start,end,procedure:'',confidence:48,valid:true};
    }).filter(Boolean);
  }

  function dedupeRows(rows){
    const seen=new Set();
    return rows.filter(row=>{
      const key=`${row.file}|${row.start}`;
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    }).sort((a,b)=>a.start.localeCompare(b.start));
  }

  function parseRecognition(data){
    const words=wordsFromTsv(data.tsv);
    const groups=groupsFromWords(words);
    const columns=inferColumns(groups);
    const structured=groups.map((group,index)=>parseWordGroup(group,columns,index)).filter(Boolean);
    const fallback=parseTextFallback(data.text,structured.length);
    return dedupeRows([...structured,...fallback]);
  }

  function renderRows(){
    const body=$('ocrRows');
    if(!body)return;
    body.innerHTML=state.rows.map((row,index)=>{
      const meta=confidenceMeta(row.confidence);
      return `<tr data-ocr-row="${row.id}" class="ocr-confidence-${meta.className}">
        <td><input class="ocr-include" type="checkbox" ${row.include?'checked':''} aria-label="${t('row')} ${index+1}"></td>
        <td>${index+1}</td>
        <td><input class="ocr-name" value="${api.escapeHtml(row.name)}" autocomplete="off"></td>
        <td><input class="ocr-file" value="${api.escapeHtml(row.file)}" inputmode="numeric" autocomplete="off"></td>
        <td><input class="ocr-start" type="time" value="${api.escapeHtml(row.start)}"></td>
        <td><input class="ocr-end" type="time" value="${api.escapeHtml(row.end)}"></td>
        <td><input class="ocr-procedure" value="${api.escapeHtml(row.procedure||'')}" autocomplete="off"></td>
        <td><span class="ocr-confidence ${meta.className}" title="${meta.confidence}%">${meta.label} · ${meta.confidence}%</span></td>
        <td><button class="ocr-delete mini danger" type="button" data-ocr-delete="${row.id}" aria-label="حذف">×</button></td>
      </tr>`;
    }).join('');
    $('ocrResults').hidden=!state.rows.length;
    $('ocrReviewHint').textContent=state.rows.length?t('review'):t('noRows');
    $('mergeOcrBtn').disabled=state.running||!state.rows.length;
    $('downloadOcrCsvBtn').disabled=state.running||!state.rows.length;
  }

  function rowsFromEditor(){
    return [...$('ocrRows').querySelectorAll('tr')].map((tr,index)=>{
      const row=state.rows.find(item=>item.id===tr.dataset.ocrRow)||{};
      const item={
        ...row,
        sourceIndex:index+1,
        include:tr.querySelector('.ocr-include').checked,
        name:cleanText(tr.querySelector('.ocr-name').value).split(/\s+/)[0],
        file:normalizeDigits(tr.querySelector('.ocr-file').value).replace(/\D/g,''),
        start:tr.querySelector('.ocr-start').value,
        end:tr.querySelector('.ocr-end').value,
        procedure:cleanText(tr.querySelector('.ocr-procedure').value)
      };
      item.valid=validRow(item);
      return item;
    });
  }

  async function loadEngine(){
    if(window.Tesseract)return window.Tesseract;
    await new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='./assets/ocr/tesseract.min.js';
      script.onload=resolve;
      script.onerror=reject;
      document.head.appendChild(script);
    });
    if(!window.Tesseract)throw new Error('Tesseract unavailable');
    return window.Tesseract;
  }

  function logger(message){
    const base=message.status==='recognizing text'?50:message.status==='loading language traineddata'?18:message.status==='initializing api'?42:8;
    const span=message.status==='recognizing text'?46:24;
    const percent=base+(Number(message.progress)||0)*span;
    status(message.status==='recognizing text'?t('recognizing'):t('loading'),percent);
  }

  async function getWorker(){
    if(state.worker)return state.worker;
    const Tesseract=await loadEngine();
    const base=new URL('./assets/ocr/',document.baseURI).href.replace(/\/$/,'');
    state.worker=await Tesseract.createWorker(['ara','eng'],Tesseract.OEM?.LSTM_ONLY??1,{
      workerPath:`${base}/worker.min.js`,
      corePath:base,
      langPath:base,
      logger
    });
    await state.worker.setParameters({
      tessedit_pageseg_mode:Tesseract.PSM?.AUTO??3,
      preserve_interword_spaces:'1',
      user_defined_dpi:'300'
    });
    return state.worker;
  }

  async function imageBitmap(file){
    if('createImageBitmap' in window){
      try{return await createImageBitmap(file,{imageOrientation:'from-image'})}catch(_error){return createImageBitmap(file)}
    }
    return new Promise((resolve,reject)=>{
      const image=new Image();
      const url=URL.createObjectURL(file);
      image.onload=()=>{URL.revokeObjectURL(url);resolve(image)};
      image.onerror=error=>{URL.revokeObjectURL(url);reject(error)};
      image.src=url;
    });
  }

  async function prepareCanvas(){
    const source=await imageBitmap(state.file);
    const rotated=state.rotation%180!==0;
    const sourceWidth=rotated?source.height:source.width;
    const sourceHeight=rotated?source.width:source.height;
    const minWidth=1900,maxWidth=2800;
    const scale=Math.min(3,Math.max(1,minWidth/sourceWidth),maxWidth/sourceWidth);
    const width=Math.max(1,Math.round(sourceWidth*scale));
    const height=Math.max(1,Math.round(sourceHeight*scale));
    const canvas=$('ocrCanvas');
    canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    context.save();
    context.translate(width/2,height/2);
    context.rotate(state.rotation*Math.PI/180);
    const drawWidth=source.width*scale,drawHeight=source.height*scale;
    context.filter='grayscale(1) contrast(1.55) brightness(1.08)';
    context.drawImage(source,-drawWidth/2,-drawHeight/2,drawWidth,drawHeight);
    context.restore();
    source.close?.();
    const image=context.getImageData(0,0,width,height);
    const data=image.data;
    for(let i=0;i<data.length;i+=4){
      const value=data[i];
      const adjusted=value<105?Math.max(0,value-18):value>225?255:value;
      data[i]=data[i+1]=data[i+2]=adjusted;
    }
    context.putImageData(image,0,0);
    return canvas;
  }

  function selectFile(file){
    if(!file||!/^image\/(jpeg|png|webp|bmp)$/i.test(file.type)){api.toast(t('failed'),t('badFile'));return}
    if(file.size>20*1024*1024){api.toast(t('failed'),t('tooLarge'));return}
    if(state.objectUrl)URL.revokeObjectURL(state.objectUrl);
    state.file=file;state.rotation=0;state.rows=[];
    $('ocrModal').dataset.hasFile='true';
    state.objectUrl=URL.createObjectURL(file);
    $('ocrPreview').src=state.objectUrl;
    $('ocrPreview').hidden=false;
    $('ocrFileName').textContent=`${file.name} · ${(file.size/1024/1024).toFixed(1)} MB`;
    $('ocrResults').hidden=true;
    $('ocrProgress').hidden=true;
    $('ocrReviewHint').textContent=t('ready');
    setBusy(false);
  }

  async function run(){
    if(!state.file){api.toast(t('failed'),t('needImage'));return}
    setBusy(true);state.rows=[];renderRows();
    try{
      status(t('loading'),7);
      const [worker,canvas]=await Promise.all([getWorker(),prepareCanvas()]);
      status(t('recognizing'),48);
      const result=await worker.recognize(canvas,{}, {text:true,tsv:true});
      status(t('parsing'),97);
      state.rows=parseRecognition(result.data||{});
      renderRows();
      status(state.rows.length?`${t('done')} — ${state.rows.length}`:t('noRows'),100,state.rows.length?'done':'warning');
      if(!state.rows.length)api.toast(t('failed'),t('noRows'));
    }catch(error){
      console.error('Best Care OCR failed',error);
      state.worker?.terminate?.().catch(()=>{});state.worker=null;
      status(t('engineFailed'),100,'error');
      api.toast(t('failed'),t('engineFailed'));
    }finally{setBusy(false)}
  }

  function merge(){
    state.rows=rowsFromEditor();
    const selected=state.rows.filter(row=>row.include&&validRow(row));
    if(!selected.length){api.toast(t('merged'),t('mergeNone'));renderRows();return}
    const result=api.mergeRows(selected.map(row=>({
      id:uid(),name:row.name,file:row.file,start:row.start,end:row.end,procedure:row.procedure,status:'waiting'
    })));
    api.toast(t('merged'),t('mergedDetail',result));
    api.closeModal('ocrModal');
  }

  function downloadCsv(){
    state.rows=rowsFromEditor();
    const selected=state.rows.filter(row=>row.include&&validRow(row));
    if(!selected.length){api.toast(t('download'),t('mergeNone'));return}
    const rows=[['الاسم','رقم الملف','البداية','النهاية','الإجراء'],...selected.map(row=>[row.name,row.file,row.start,row.end,row.procedure])];
    const csv='\ufeff'+rows.map(row=>row.map(value=>`"${String(value??'').replaceAll('"','""')}"`).join(',')).join('\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download=`bestcare_image_${api.getDate()}.csv`;anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    api.toast(t('download'),`${selected.length}`);
  }

  function open(){api.openModal('ocrModal');$('ocrReviewHint').textContent=state.file?t('ready'):t('choose')}

  function init(options){
    api=options;
    $('imageOcrBtn')?.addEventListener('click',open);
    $('chooseOcrImageBtn')?.addEventListener('click',()=>$('imageOcrInput').click());
    $('imageOcrInput')?.addEventListener('change',event=>event.target.files?.[0]&&selectFile(event.target.files[0]));
    $('runOcrBtn')?.addEventListener('click',run);
    $('rotateOcrBtn')?.addEventListener('click',()=>{state.rotation=(state.rotation+90)%360;$('ocrPreview').style.transform=`rotate(${state.rotation}deg)`});
    $('mergeOcrBtn')?.addEventListener('click',merge);
    $('downloadOcrCsvBtn')?.addEventListener('click',downloadCsv);
    $('ocrRows')?.addEventListener('click',event=>{
      const id=event.target.dataset.ocrDelete;if(!id)return;
      state.rows=state.rows.filter(row=>row.id!==id);renderRows();
    });
    const drop=$('ocrDrop');
    ['dragenter','dragover'].forEach(name=>drop?.addEventListener(name,event=>{event.preventDefault();drop.classList.add('dragover')}));
    ['dragleave','drop'].forEach(name=>drop?.addEventListener(name,event=>{event.preventDefault();drop.classList.remove('dragover')}));
    drop?.addEventListener('drop',event=>event.dataTransfer.files?.[0]&&selectFile(event.dataTransfer.files[0]));
    setBusy(false);
  }

  window.BestCareOCR={init,version:'7.3.3'};
})();
