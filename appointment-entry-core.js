const latinDigits=value=>String(value??'').replace(/[٠-٩]/g,digit=>'٠١٢٣٤٥٦٧٨٩'.indexOf(digit)).replace(/[۰-۹]/g,digit=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(digit));

export const cleanName=value=>String(value??'').replace(/[\u200e\u200f\u202a-\u202e]/g,'').replace(/\s+/g,' ').trim().slice(0,120);
export const normalizeFile=value=>{const normalized=latinDigits(value).replace(/\D/g,'').slice(0,40);return normalized&&!/^0+$/.test(normalized)?normalized:''};
export const normalizePhone=value=>{
  const digits=latinDigits(value).replace(/\D/g,'').slice(0,20);
  if(/^009665\d{8}$/.test(digits))return`0${digits.slice(5)}`;
  if(/^9665\d{8}$/.test(digits))return`0${digits.slice(3)}`;
  if(/^5\d{8}$/.test(digits))return`0${digits}`;
  return digits;
};
export const normalizeNationalId=value=>{const digits=latinDigits(value).replace(/\D/g,'').slice(0,10);return digits.length===10?digits:''};
export const normalizePatient=value=>({
  id:String(value?.id||'').slice(0,100),
  name:cleanName(value?.name??value?.fullName),
  file:normalizeFile(value?.file??value?.fileNo),
  phone:normalizePhone(value?.phone??value?.mobile),
  nationalId:normalizeNationalId(value?.nationalId)
});
export const validatePatient=value=>{
  const patient=normalizePatient(value),errors=[];
  if(patient.name.split(/\s+/).filter(Boolean).length<2)errors.push('name');
  if(!patient.file)errors.push('file');
  if(!/^05\d{8}$/.test(patient.phone))errors.push('phone');
  return{patient,errors,complete:errors.length===0};
};
export const minutes=value=>{const match=/^(\d{2}):(\d{2})$/.exec(String(value||''));if(!match)return NaN;const total=Number(match[1])*60+Number(match[2]);return Number(match[1])<24&&Number(match[2])<60?total:NaN};
export const timeFromMinutes=value=>{const safe=Math.max(0,Math.min(1439,Number(value)||0));return`${String(Math.floor(safe/60)).padStart(2,'0')}:${String(safe%60).padStart(2,'0')}`};
export const addMinutes=(time,duration)=>{const start=minutes(time),amount=Number(duration);return Number.isFinite(start)&&Number.isFinite(amount)&&amount>0&&start+amount<1440?timeFromMinutes(start+amount):''};
export const overlaps=(left,right)=>{
  const leftStart=minutes(left?.start),leftEnd=minutes(left?.end),rightStart=minutes(right?.start),rightEnd=minutes(right?.end);
  return[leftStart,leftEnd,rightStart,rightEnd].every(Number.isFinite)&&leftStart<rightEnd&&rightStart<leftEnd;
};
export const samePatient=(left,right)=>{
  const a=normalizePatient(left),b=normalizePatient(right);
  return Boolean((a.file&&b.file&&a.file===b.file)||(a.nationalId&&b.nationalId&&a.nationalId===b.nationalId));
};
export const appointmentConflicts=(patients,candidate,{excludeId=''}={})=>(Array.isArray(patients)?patients:[]).filter(item=>String(item.id)!==String(excludeId)&&!['cancel','left'].includes(item.status)&&overlaps(item,candidate));
export const nextAvailableStart=(patients,{minimum='14:00',step=15,duration=30}={})=>{
  const valid=(Array.isArray(patients)?patients:[]).filter(item=>!['cancel','left'].includes(item.status)&&Number.isFinite(minutes(item.start))&&Number.isFinite(minutes(item.end))).sort((a,b)=>minutes(a.start)-minutes(b.start));
  let candidate=Math.ceil((Number.isFinite(minutes(minimum))?minutes(minimum):14*60)/step)*step;
  for(const item of valid){const start=minutes(item.start),end=minutes(item.end);if(candidate+duration<=start)break;if(candidate<end&&candidate+duration>start)candidate=Math.ceil(end/step)*step}
  return timeFromMinutes(candidate);
};
export const buildAppointment=({patient,start,duration,procedure,status='waiting',id='',now=Date.now()})=>{
  const identity=validatePatient(patient),end=addMinutes(start,duration);
  if(!identity.complete)throw Object.assign(new Error('INCOMPLETE_PATIENT'),{code:'INCOMPLETE_PATIENT',fields:identity.errors});
  if(!end)throw Object.assign(new Error('INVALID_TIME'),{code:'INVALID_TIME'});
  return{id:id||globalThis.crypto?.randomUUID?.()||`patient-${now}`,name:identity.patient.name,file:identity.patient.file,phone:identity.patient.phone,nationalId:identity.patient.nationalId,start,end,procedure:String(procedure||'').trim().slice(0,180),status,addedAt:Number(now),adminUpdatedAt:Number(now)};
};
