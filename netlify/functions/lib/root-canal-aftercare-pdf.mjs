import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const assetPath=(name,folder='fonts',required=true)=>{
  const base=dirname(fileURLToPath(import.meta.url));
  const candidates=[resolve(process.cwd(),'assets',folder,name),resolve(base,'../../../assets',folder,name),resolve(base,'assets',folder,name)];
  const found=candidates.find(existsSync);
  if(!found&&required)throw new Error('Bundled Arabic PDF font unavailable');
  return found||null;
};
const ink='#17433c',muted='#526b65',green='#0b6a56',red='#a43131';
const label={ibuprofen:'إيبوبروفين',paracetamol:'باراسيتامول'};
const safe=value=>String(value??'').replace(/\s+/g,' ').trim();
const date=value=>{try{return new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Riyadh'}).format(new Date(value))}catch{return'—'}};

export function generateAftercarePdf(document,issuedAt){
  return new Promise((resolve,reject)=>{
    const pdf=new PDFDocument({size:'A4',margin:42,bufferPages:true,info:{Title:'تعليمات ما بعد علاج العصب',Author:'Best Care Dental Clinics'}});
    const chunks=[];pdf.on('data',chunk=>chunks.push(chunk));pdf.on('error',reject);pdf.on('end',()=>resolve(Buffer.concat(chunks)));
    pdf.registerFont('Arabic',assetPath('IBMPlexSansArabic-Regular.ttf')).registerFont('ArabicBold',assetPath('IBMPlexSansArabic-Bold.ttf'));
    const pageBottom=800,contentX=42,contentW=511;let y=42;
    const lines=(value,width,size=9,boldText=false)=>{
      pdf.font(boldText?'ArabicBold':'Arabic').fontSize(size);
      const words=safe(value).split(' ').filter(Boolean),result=[];let row=[];
      for(const word of words){const next=[...row,word];if(row.length&&pdf.widthOfString(next.join(' '))+(next.length-1)*1.1>width*0.85){result.push(row);row=[word]}else row=next}
      if(row.length)result.push(row);
      return result.length?result:[[]];
    };
    const height=(value,width,size=9,boldText=false)=>lines(value,width,size,boldText).length*size*1.55;
    const write=(value,x,top,width,size=9,color=ink,boldText=false)=>{
      pdf.font(boldText?'ArabicBold':'Arabic').fontSize(size).fillColor(color);
      const rows=lines(value,width,size,boldText),step=size*1.55;
      rows.forEach((row,index)=>pdf.text([...row].reverse().join(' '),x,top+index*step,{width,align:'right',lineBreak:false,wordSpacing:1.1}));
      return top+rows.length*step;
    };
    const box=(x,top,width,h,fill,border)=>pdf.roundedRect(x,top,width,h,8).fillAndStroke(fill,border);
    const ensure=needed=>{if(y+needed>pageBottom){pdf.addPage();y=42}};
    const logo=assetPath('best-care-logo-header.png','',false);
    if(logo)pdf.image(logo,contentX,36,{fit:[58,52]});
    write(safe(document.clinic?.name)||'عيادات أفضل عناية الاستشارية للأسنان',112,43,contentW-70,12,green,true);
    pdf.font('Arabic').fontSize(8).fillColor(muted).text('Best Care Dental Clinics',112,66,{width:contentW-70,align:'right'});
    pdf.moveTo(contentX,98).lineTo(contentX+contentW,98).strokeColor('#cbded8').lineWidth(1).stroke();
    write('تعليمات ما بعد علاج العصب وجذور الأسنان',contentX,108,contentW,17,green,true);
    pdf.font('ArabicBold').fontSize(8).fillColor('#9a7826').text('AFTER ROOT CANAL TREATMENT',contentX,137,{width:contentW,align:'right'});y=160;

    const info=[['اسم المريض',safe(document.patient?.name)||'—'],['رقم الملف',safe(document.patient?.file)||'—'],['تاريخ الإجراء',date(document.source?.paymentRequestedAt||issuedAt)]];
    const infoGap=7,infoW=(contentW-infoGap*2)/3,infoH=Math.max(52,...info.map(([,value])=>26+height(value,infoW-18,9.2,true)+8));
    info.forEach(([caption,value],index)=>{const x=contentX+(2-index)*(infoW+infoGap);box(x,y,infoW,infoH,'#f7fbfa','#c9ddd6');write(caption,x+9,y+7,infoW-18,7.8,muted);write(value,x+9,y+23,infoW-18,9.2,ink,true)});
    y+=infoH+10;

    const intro=`عزيزنا المراجع ${safe(document.patient?.name)}، أُجري لك إجراء لعلاج العصب وجذور الأسنان. يرجى اتباع التعليمات التالية للمساعدة على التعافي ومراجعة العيادة عند الحاجة.`;
    const introH=height(intro,contentW-26,9.2,true)+22;box(contentX,y,contentW,introH,'#edf7f3','#c7e3d7');write(intro,contentX+13,y+10,contentW-26,9.2,ink,true);y+=introH+13;
    write('تعليمات العناية بعد الإجراء',contentX,y,contentW,11,green,true);y+=24;
    const instructions=[
      ['الألم المتوقع','قد يظهر ألم أو حساسية خفيفة إلى متوسطة خلال الأيام الأولى ويُفترض أن تبدأ بالتحسن. عند وجود ألم متوسط إلى شديد أو متزايد أو لا يتحسن، تواصل مع العيادة للتقييم.'],
      ['استخدام العلاج',document.deliveryMode==='admin-general'?'إذا ذُكرت توصية اختيارية بمسكن أدناه فهي لا تحدد التكرار أو المدة. اتبع توجيهات طبيبك الخاصة بك ولا تبدأ دواءً من نفسك.':'استخدم فقط المسكنات التي أوصى بها الطبيب والمذكورة أدناه، بالتركيز والتكرار والمدة المحددة. لا تضف أو تغيّر دواءً من نفسك.'],
      ['الكمادات الباردة','يمكن وضع كمادة باردة ملفوفة بقماش على الخد لمدة 10–15 دقيقة ثم إزالتها، وتكرارها على فترات عند وجود تورم أو انزعاج. لا تضع الثلج مباشرة على الجلد.'],
      ['الطعام والمضغ','تناول أطعمة لينة وابتعد مؤقتًا عن الأطعمة القاسية أو اللزجة. تجنب المضغ القوي على السن المعالج حتى اكتمال الترميم النهائي أو سماح الطبيب.'],
      ['النظافة والراحة','نظف أسنانك بالفرشاة والخيط بلطف حول المنطقة المعالجة، وخذ قسطًا كافيًا من الراحة في اليوم الأول، ما لم يوجهك الطبيب بخلاف ذلك.'],
      ['المتابعة والترميم','التزم بموعد المتابعة واستكمال الحشوة الدائمة أو التاج. لا تؤخر الترميم النهائي الذي يحدده الطبيب.']
    ];
    const gap=7,cardW=(contentW-gap*2)/3;
    for(let row=0;row<2;row++){
      const group=instructions.slice(row*3,row*3+3);
      const cardH=Math.max(...group.map(([title,body])=>25+height(title,cardW-46,8.5,true)+height(body,cardW-18,7.6)+7),82);
      ensure(cardH+9);
      group.forEach(([title,body],index)=>{const number=row*3+index+1,x=contentX+(2-index)*(cardW+gap);box(x,y,cardW,cardH,'#fff','#d6e5e0');pdf.circle(x+cardW-18,y+19,11).fill('#dff2eb');write(String(number),x+cardW-28,y+12,20,8.5,green,true);const titleY=write(title,x+10,y+12,cardW-48,8.5,green,true);write(body,x+9,Math.max(y+36,titleY+3),cardW-18,7.6,ink)});
      y+=cardH+9;
    }

    const warning='ألم متوسط إلى شديد أو متزايد لا يتحسن، ضغط مستمر، تورم في اللثة أو الوجه، حرارة، صديد أو طعم غير طبيعي، تفاعل تحسسي للدواء، أو سقوط أو كسر الحشوة أو التاج المؤقت. الألم عند العض أو الشعور بأن الحشوة مرتفعة يستدعي زيارة العيادة لفحص العضة وضبط ارتفاع الحشوة عند الحاجة؛ لا تحاول تعديلها بنفسك.';
    const warningH=37+height(warning,contentW-28,8.3)+11;ensure(warningH+10);box(contentX,y,contentW,warningH,'#fff5f4','#e6aaa4');pdf.circle(contentX+contentW-22,y+22,12).fill('#c93838');write('!',contentX+contentW-29,y+14,14,12,'#fff',true);write('متى تتواصل مع العيادة؟',contentX+14,y+12,contentW-53,11,red,true);write(warning,contentX+14,y+37,contentW-28,8.3,'#6f3935');y+=warningH+11;

    const meds=(document.medications||[]).filter(item=>Object.hasOwn(label,item.type));
    const medicationLines=meds.length?meds.map(med=>document.deliveryMode==='admin-general'?`${label[med.type]} — ${safe(med.dose)} — دون تحديد التكرار أو المدة`:`${label[med.type]} — ${safe(med.dose)}؛ التكرار: ${safe(med.frequency)}؛ المدة: ${safe(med.duration)}${med.notes?`؛ ملاحظات: ${safe(med.notes)}`:''}`):['لا توجد توصية بمسكن في هذه الورقة. اتبع فقط توجيهات الطبيب الخاصة بك إن وجدت.'];
    const medicationH=44+medicationLines.reduce((sum,line)=>sum+height(line,contentW-30,8.5)+5,0)+height('المضاد الحيوي قرار مستقل للطبيب، ويصدر عند الحاجة بوصفة علاجية منفصلة؛ ليس جزءًا من هذه التعليمات.',contentW-30,7.6)+14;
    ensure(medicationH+38);box(contentX,y,contentW,medicationH,'#f8fcfa',green);write(document.deliveryMode==='admin-general'?'توصية اختيارية بالمسكنات':'توصية الطبيب بالمسكنات',contentX+14,y+11,contentW-28,11,green,true);let medY=y+34;
    medicationLines.forEach(line=>{medY=write(line,contentX+15,medY,contentW-30,8.5,ink)+5});
    write('المضاد الحيوي قرار مستقل للطبيب، ويصدر عند الحاجة بوصفة علاجية منفصلة؛ ليس جزءًا من هذه التعليمات.',contentX+15,medY+2,contentW-30,7.6,red);
    y+=medicationH+10;
    pdf.moveTo(contentX,y).lineTo(contentX+contentW,y).strokeColor('#cbded8').stroke();y+=8;
    write(document.deliveryMode==='admin-general'?'جهة الإرسال: عيادة الطبيب المعالج':`الطبيب المعالج: ${safe(document.clinic?.doctorName)||'—'}`,contentX,y,contentW,8.5,ink,true);
    write(`تاريخ إصدار التعليمات: ${date(issuedAt)}`,contentX,y+15,contentW,8,muted);
    pdf.end();
  });
}
