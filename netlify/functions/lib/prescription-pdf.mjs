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
const safe=value=>String(value??'').replace(/\s+/g,' ').trim();
const ink='#173f39',muted='#5d716d',green='#08745d',line='#c9ddd7',paper='#f7fbfa';
const labels={
  ar:{title:'الوصفة الطبية',patient:'اسم المريض',file:'رقم الملف',date:'تاريخ الإصدار',diagnosis:'التشخيص أو سبب الوصفة',medicines:'العلاجات الموصوفة',dose:'الجرعة',frequency:'التكرار',duration:'المدة',instructions:'تعليمات الاستخدام',notes:'ملاحظات',warning:'لا تُستخدم الأدوية إلا وفق تعليمات الطبيب المدوّنة في هذه الوصفة.',sender:'الجهة المرسلة: عيادات أفضل عناية'},
  en:{title:'MEDICAL PRESCRIPTION',patient:'Patient name',file:'File number',date:'Issued',diagnosis:'Diagnosis / reason',medicines:'Prescribed medications',dose:'Dose',frequency:'Frequency',duration:'Duration',instructions:'Instructions',notes:'Notes',warning:'Use medicines only as directed by the clinician in this prescription.',sender:'Sent by: Best Care Dental Clinics'}
};
const displayDate=(value,language)=>{try{return new Intl.DateTimeFormat(language==='en'?'en-GB':'en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Riyadh'}).format(new Date(value||Date.now()))}catch{return'—'}};

export function generatePrescriptionPdf(prescription,language='ar'){
  const lang=language==='en'?'en':'ar',t=labels[lang],rtl=lang==='ar';
  return new Promise((resolvePromise,reject)=>{
    const pdf=new PDFDocument({size:'A4',margin:42,bufferPages:true,info:{Title:t.title,Author:'Best Care Dental Clinics'}});
    const chunks=[];pdf.on('data',chunk=>chunks.push(chunk));pdf.on('error',reject);pdf.on('end',()=>resolvePromise(Buffer.concat(chunks)));
    pdf.registerFont('Body',assetPath('IBMPlexSansArabic-Regular.ttf')).registerFont('Bold',assetPath('IBMPlexSansArabic-Bold.ttf'));
    const contentX=42,contentW=511,pageBottom=800;let y=42;
    const rows=(value,width,size=9,bold=false)=>{
      pdf.font(bold?'Bold':'Body').fontSize(size);
      const words=safe(value).split(' ').filter(Boolean),result=[];let row=[];
      for(const word of words){const next=[...row,word];if(row.length&&pdf.widthOfString(next.join(' '))>width*.88){result.push(row);row=[word]}else row=next}
      if(row.length)result.push(row);return result.length?result:[[]];
    };
    const height=(value,width,size=9,bold=false)=>rows(value,width,size,bold).length*size*1.55;
    const write=(value,x,top,width,size=9,color=ink,bold=false)=>{
      const result=rows(value,width,size,bold),step=size*1.55;pdf.font(bold?'Bold':'Body').fontSize(size).fillColor(color);
      result.forEach((row,index)=>pdf.text(rtl?[...row].reverse().join(' '):row.join(' '),x,top+index*step,{width:width-10,align:rtl?'right':'left',lineBreak:false}));
      return top+result.length*step;
    };
    const box=(top,h,fill=paper,border=line)=>pdf.roundedRect(contentX,top,contentW,h,8).fillAndStroke(fill,border);
    const ensure=needed=>{if(y+needed>pageBottom){pdf.addPage();y=42}};
    const logo=assetPath('best-care-logo-header.png','',false);if(logo)pdf.image(logo,contentX,36,{fit:[58,52]});
    write(lang==='ar'?'عيادات أفضل عناية الاستشارية للأسنان':'Best Care Dental Clinics',112,43,contentW-70,12,green,true);
    write(t.title,112,67,contentW-70,9,muted,true);
    pdf.moveTo(contentX,99).lineTo(contentX+contentW,99).strokeColor(line).lineWidth(1).stroke();
    y=114;write(t.title,contentX,y,contentW,18,green,true);y+=37;

    const info=[[t.patient,safe(prescription?.patient?.name)||'—'],[t.file,safe(prescription?.patient?.file)||'—'],[t.date,displayDate(prescription?.issuedAt,lang)]];
    const gap=7,infoW=(contentW-gap*2)/3,infoH=58;
    info.forEach(([caption,value],index)=>{const x=contentX+(rtl?2-index:index)*(infoW+gap);pdf.roundedRect(x,y,infoW,infoH,7).fillAndStroke(paper,line);write(caption,x+8,y+8,infoW-16,7.6,muted);write(value,x+8,y+27,infoW-16,9.2,ink,true)});y+=infoH+12;

    const diagnosis=safe(prescription?.diagnosis)||'—',diagnosisH=33+height(diagnosis,contentW-26,9.2);
    box(y,diagnosisH);write(t.diagnosis,contentX+13,y+9,contentW-26,9,green,true);write(diagnosis,contentX+13,y+29,contentW-26,9.2);y+=diagnosisH+13;
    write(t.medicines,contentX,y,contentW,11,green,true);y+=25;
    const medicines=Array.isArray(prescription?.medicines)?prescription.medicines:[];
    medicines.forEach((medicine,index)=>{
      const name=[safe(medicine.name),safe(medicine.strength)].filter(Boolean).join(' '),details=[`${t.dose}: ${safe(medicine.dose)||'—'}`,`${t.frequency}: ${safe(medicine.frequency)||'—'}`,`${t.duration}: ${safe(medicine.duration)||'—'}`].join(rtl?' · ':' | '),instructions=safe(medicine.instructions);
      const cardH=43+height(name,contentW-64,10,true)+height(details,contentW-28,8.4)+(instructions?height(`${t.instructions}: ${instructions}`,contentW-28,8.2)+6:0);
      ensure(cardH+9);box(y,cardH,'#ffffff',line);pdf.circle(rtl?contentX+contentW-21:contentX+21,y+21,12).fill('#dff3ec');
      write(String(index+1),rtl?contentX+contentW-28:contentX+14,y+13,14,9,green,true);
      const nameX=rtl?contentX+12:contentX+43,nameWidth=contentW-55;let next=write(name,nameX,y+11,nameWidth,10,ink,true);
      next=write(details,contentX+14,Math.max(y+37,next+3),contentW-28,8.4,ink);
      if(instructions)write(`${t.instructions}: ${instructions}`,contentX+14,next+5,contentW-28,8.2,muted);
      y+=cardH+9;
    });
    if(safe(prescription?.notes)){
      const notes=`${t.notes}: ${safe(prescription.notes)}`,notesH=height(notes,contentW-26,8.8)+20;ensure(notesH+9);box(y,notesH,'#fffaf0','#ead6a6');write(notes,contentX+13,y+10,contentW-26,8.8,ink);y+=notesH+9;
    }
    const warningH=height(t.warning,contentW-26,8.5,true)+21;ensure(warningH+42);box(y,warningH,'#eef8f4','#b9dcd0');write(t.warning,contentX+13,y+10,contentW-26,8.5,green,true);y+=warningH+13;
    pdf.moveTo(contentX,y).lineTo(contentX+contentW,y).strokeColor(line).stroke();y+=9;write(t.sender,contentX,y,contentW,8.5,ink,true);
    pdf.end();
  });
}
