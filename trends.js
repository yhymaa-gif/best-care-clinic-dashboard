// Best Care trend engine: turns "this period vs the previous one" and the
// monthly series into a plain reading of progress. Pure functions, no I/O.
// Used by the statistics page and the admin counter; tests load it in a VM.
(function(root){
  'use strict';
  // better: which direction is good. kind: 'count' compares by percent,
  // 'rate' by percentage points, 'minutes' by percent of a duration.
  const METRICS=[
    {key:'uniquePatients',label:'عدد المرضى',en:'Patients',better:'up',weight:3,kind:'count'},
    {key:'procedureUnits',label:'الإجراءات المنفذة',en:'Procedures done',better:'up',weight:3,kind:'count'},
    {key:'revenueCents',label:'التحصيل',en:'Collections',better:'up',weight:3,kind:'money'},
    {key:'treatedPatients',label:'مرضى أكملوا العلاج',en:'Patients treated',better:'up',weight:2,kind:'count'},
    {key:'completed',label:'المواعيد المكتملة',en:'Completed visits',better:'up',weight:2,kind:'count'},
    {key:'completionRate',label:'نسبة الإنجاز',en:'Completion rate',better:'up',weight:2,kind:'rate'},
    {key:'cancelRate',label:'نسبة الإلغاء',en:'Cancellation rate',better:'down',weight:2,kind:'rate'},
    {key:'labSent',label:'حالات أُرسلت للمعمل',en:'Lab cases sent',better:'up',weight:1,kind:'count'},
    {key:'planTotal',label:'الخطط العلاجية',en:'Treatment plans',better:'up',weight:1,kind:'count'},
    {key:'averageDelayMinutes',label:'متوسط التأخير',en:'Average delay',better:'down',weight:1,kind:'minutes'},
    {key:'paymentPending',label:'طلبات دفع معلقة',en:'Pending payments',better:'down',weight:1,kind:'count'},
    {key:'reviewWhatsappShares',label:'طلبات التقييم',en:'Review requests',better:'up',weight:1,kind:'count'},
  ];
  const STABLE_PCT=5;      // within ±5% counts as stable
  const STABLE_PP=3;       // within ±3 percentage points for rates
  const MIN_BASE=5;        // fewer than this on both sides is too small to judge
  const CAP=50;            // one metric cannot swing the verdict beyond ±50

  const num=value=>Number.isFinite(Number(value))?Number(value):0;
  const withRates=summary=>{
    const s={...(summary||{})};
    const appointments=num(s.appointments);
    s.cancelRate=appointments?Math.round(num(s.cancelled)/appointments*100):0;
    return s;
  };

  function compareMetric(def,current,previous){
    const cur=num(current[def.key]),prev=num(previous[def.key]);
    const base=def.kind==='rate'?num(previous.appointments)+num(current.appointments):Math.max(cur,prev);
    const measurable=def.kind==='rate'?num(current.appointments)>=MIN_BASE&&num(previous.appointments)>=MIN_BASE:base>=MIN_BASE||(def.kind==='money'&&base>0);
    const diff=cur-prev;
    const pct=def.kind==='rate'?null:(prev?diff/prev*100:(cur?100:0));
    const magnitude=def.kind==='rate'?diff:pct;
    const threshold=def.kind==='rate'?STABLE_PP:STABLE_PCT;
    const sign=def.better==='up'?1:-1;
    let status='stable';
    if(!measurable)status='insufficient';
    else if(Math.abs(magnitude)>threshold)status=magnitude*sign>0?'improving':'declining';
    const effect=def.kind==='rate'?Math.max(-CAP,Math.min(CAP,diff*2)):Math.max(-CAP,Math.min(CAP,pct));
    const score=status==='insufficient'?0:effect*sign;
    return{...def,current:cur,previous:prev,diff,pct:pct===null?null:Math.round(pct),pp:def.kind==='rate'?diff:null,direction:diff>0?'up':diff<0?'down':'flat',status,score};
  }

  function compareSummaries(currentSummary,previousSummary){
    const current=withRates(currentSummary),previous=withRates(previousSummary);
    const rows=METRICS.filter(def=>def.key in current||def.key==='cancelRate').map(def=>compareMetric(def,current,previous));
    const counted=rows.filter(row=>row.status!=='insufficient');
    const weight=counted.reduce((sum,row)=>sum+row.weight,0);
    const score=weight?Math.round(counted.reduce((sum,row)=>sum+row.score*row.weight,0)/weight):0;
    const verdict=weight<4?'insufficient':score>=5?'improving':score<=-5?'declining':'stable';
    const improving=counted.filter(row=>row.status==='improving').sort((a,b)=>b.score*b.weight-a.score*a.weight);
    const declining=counted.filter(row=>row.status==='declining').sort((a,b)=>a.score*a.weight-b.score*b.weight);
    return{rows,score,verdict,confidence:weight>=10?'high':weight>=6?'medium':'low',improving,declining};
  }

  // Biggest movers among clinics or procedures (by absolute change, with a minimum base).
  function movers(currentList,previousList,{key='clinicId',field='procedures',name=item=>item.name||item[key]}={}){
    const prior=new Map((previousList||[]).map(item=>[item[key],item]));
    return(currentList||[]).map(item=>{
      const cur=num(item[field]),prev=num(prior.get(item[key])?.[field]);
      return{id:item[key],name:name(item),current:cur,previous:prev,diff:cur-prev,pct:prev?Math.round((cur-prev)/prev*100):null};
    }).filter(row=>Math.max(row.current,row.previous)>=MIN_BASE&&row.diff!==0).sort((a,b)=>a.diff-b.diff);
  }

  // Simple least-squares slope over the last complete months, as % of their mean per month.
  function monthlyTrend(months,field,{count=3,currentMonth}={}){
    const complete=(months||[]).filter(item=>item.month!==currentMonth).sort((a,b)=>a.month.localeCompare(b.month)).slice(-count);
    if(complete.length<2)return{direction:'insufficient',slopePct:0,points:complete.length};
    const ys=complete.map(item=>num(item[field])),n=ys.length,xMean=(n-1)/2,yMean=ys.reduce((a,b)=>a+b,0)/n;
    if(yMean<MIN_BASE)return{direction:'insufficient',slopePct:0,points:n};
    const slope=ys.reduce((sum,y,x)=>sum+(x-xMean)*(y-yMean),0)/ys.reduce((sum,_,x)=>sum+(x-xMean)**2,0);
    const slopePct=Math.round(slope/yMean*100);
    return{direction:slopePct>STABLE_PCT?'up':slopePct<-STABLE_PCT?'down':'flat',slopePct,points:n,from:complete[0].month,to:complete[n-1].month};
  }

  // Projects the current month from its pace so far and compares it with last month.
  function monthPace(months,field,{today}={}){
    if(!today)return null;
    const month=today.slice(0,7),current=(months||[]).find(item=>item.month===month);
    const previousMonth=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7))-2,1)).toISOString().slice(0,7);
    const previous=(months||[]).find(item=>item.month===previousMonth);
    if(!current)return null;
    const day=Number(today.slice(8,10)),daysInMonth=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();
    const soFar=num(current[field]),projected=Math.round(soFar/Math.max(1,day)*daysInMonth),last=num(previous?.[field]);
    return{month,soFar,projected,lastMonth:last,day,daysInMonth,pct:last?Math.round((projected-last)/last*100):null,reliable:day>=7};
  }

  const api={METRICS,compareSummaries,movers,monthlyTrend,monthPace,withRates,thresholds:{STABLE_PCT,STABLE_PP,MIN_BASE}};
  root.BestCareTrends=api;
})(typeof window!=='undefined'?window:globalThis);
