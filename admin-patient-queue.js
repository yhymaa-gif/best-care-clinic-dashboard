(function installBestCareAdminQueue(root){
  'use strict';

  const COMPLETED_STATUSES=new Set(['done']);
  const CLOSED_STATUSES=new Set(['cancel','left']);
  const RIYADH_CLOCK_FORMATTER=new Intl.DateTimeFormat('en',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});

  function timeMinutes(value){
    const match=String(value||'').match(/^(\d{1,2}):(\d{2})/);
    if(!match)return Number.POSITIVE_INFINITY;
    return Math.min(23,Number(match[1]))*60+Math.min(59,Number(match[2]));
  }

  function riyadhClock(value=Date.now()){
    const parts=RIYADH_CLOCK_FORMATTER.formatToParts(new Date(value));
    const read=type=>parts.find(part=>part.type===type)?.value||'';
    return {date:`${read('year')}-${read('month')}-${read('day')}`,minutes:Number(read('hour')||0)*60+Number(read('minute')||0)};
  }

  function group(status){
    return COMPLETED_STATUSES.has(String(status||''))?'completed':'waiting';
  }

  function timing(patient,{status=patient?.status,date='',now=Date.now(),clock=null}={}){
    const normalizedStatus=String(status||'waiting');
    if(COMPLETED_STATUSES.has(normalizedStatus))return{state:'completed',rank:9,deltaMinutes:0,sameDay:false};
    if(CLOSED_STATUSES.has(normalizedStatus))return{state:'closed',rank:8,deltaMinutes:0,sameDay:false};
    if(normalizedStatus==='active')return{state:'current',rank:0,deltaMinutes:0,sameDay:true};
    const activeClock=clock||riyadhClock(now),appointmentDate=String(date||activeClock.date),start=timeMinutes(patient?.start);
    if(appointmentDate<activeClock.date)return{state:'due',rank:1,deltaMinutes:Number.isFinite(start)?24*60+activeClock.minutes-start:0,sameDay:false};
    if(appointmentDate>activeClock.date)return{state:'upcoming',rank:4,deltaMinutes:0,sameDay:false};
    const delta=Number.isFinite(start)?activeClock.minutes-start:0;
    if(Number.isFinite(start)&&delta>=0)return{state:'due',rank:1,deltaMinutes:delta,sameDay:true};
    if(['arrived','early_arrival','asks_delay'].includes(normalizedStatus))return{state:'ready',rank:2,deltaMinutes:delta,sameDay:true};
    return{state:'upcoming',rank:3,deltaMinutes:delta,sameDay:true};
  }

  function compare(left,right,{date='',now=Date.now(),clock=null}={}){
    const leftStatus=String(left?.status||left?.patient?.status||'waiting');
    const rightStatus=String(right?.status||right?.patient?.status||'waiting');
    const groupDifference=(group(leftStatus)==='completed'?1:0)-(group(rightStatus)==='completed'?1:0);
    if(groupDifference)return groupDifference;
    if(group(leftStatus)==='completed'){
      const completedDifference=Number(right?.patient?.completedAt||0)-Number(left?.patient?.completedAt||0);
      if(completedDifference)return completedDifference;
    }
    const activeClock=clock||riyadhClock(now);
    const leftTiming=timing(left?.patient||left,{status:leftStatus,date,now,clock:activeClock});
    const rightTiming=timing(right?.patient||right,{status:rightStatus,date,now,clock:activeClock});
    if(leftTiming.rank!==rightTiming.rank)return leftTiming.rank-rightTiming.rank;
    const startDifference=timeMinutes(left?.patient?.start||left?.start)-timeMinutes(right?.patient?.start||right?.start);
    return Number.isFinite(startDifference)?startDifference:0;
  }

  root.BestCareAdminQueue=Object.freeze({group,timing,compare,timeMinutes,riyadhClock});
})(typeof window!=='undefined'?window:globalThis);
