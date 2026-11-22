'use strict';
// Opt-in UI convenience: bounded Resume, never a forged ACK, target deletion,
// ignored teleport, changed correction threshold or a packet-rate override.
const WINDOW=60000,WAIT_LIMIT=10000,STABLE=500;
function cancel(a,note){
 const task=a.autoPassTask;if(task){clearTimeout(task.timer);task.bot.removeListener('forcedMove',task.moved);a.autoPassTask=null;}
 if(note)a.autoPassStatus=note;
}
function queue(a){
 if(a.autoPassTask||!a.autoPass||!a.solidPattern||a.status!=='paused'||a.reason!=='server_corrections'||!a.bot)return false;
 const now=Date.now();a.autoPassHistory=(a.autoPassHistory||[]).filter(t=>now-t<WINDOW);
 if(a.autoPassHistory.length){a.autoPassStatus='limit';a.notify(true);return false;}
 const task={bot:a.bot,epoch:a.epoch,started:now,anchor:null,stableAt:now};
 a.autoPassTask=task;a.autoPassStatus='waiting';
 const finish=note=>{cancel(a,note);a.notify(true);};
 task.moved=()=>finish('position_changed');task.bot.on('forcedMove',task.moved);
 const poll=()=>{
  if(a.autoPassTask!==task)return;
  if(!a.autoPass||a.bot!==task.bot||a.epoch!==task.epoch||a.status!=='paused'||a.reason!=='server_corrections')return finish('cancelled');
  if(Date.now()-task.started>WAIT_LIMIT)return finish('timeout');
  if(task.bot.currentWindow)return finish('window_open');
  const p=task.bot.entity?.position,v=task.bot.entity?.velocity;
  const resting=!!p&&task.bot.entity.onGround===true&&Math.hypot(v?.x||0,v?.z||0)<.003&&Math.abs(v?.y||0)<.08;
  if(!resting||!task.anchor||p.distanceTo(task.anchor)>.01){task.anchor=p?.clone();task.stableAt=Date.now();}
  // Read real loaded world state. No path/placement/motion commands while waiting.
  if(resting&&!a.worker&&Date.now()-task.stableAt>=STABLE&&Date.now()>=(a.movementHoldUntil||0)&&Date.now()>=(a.trafficHoldUntil||0)&&a.bodyClear(p)&&a.safeFooting(p)){
   a.autoPassHistory.push(Date.now());cancel(a,'resumed');
   const result=a.resume();if(!result.ok){a.autoPassStatus=result.error;a.notify(true);}else a.diagnostic('automatic pass','bounded Resume; real occupancy will be rescanned');
   return;
  }
  task.timer=setTimeout(poll,100);
 };
 task.timer=setTimeout(poll,100);a.notify(true);return true;
}
function set(a,enabled){
 if(typeof enabled!=='boolean')return {ok:false,error:'invalid_setting'};
 a.autoPass=enabled;
 if(!enabled)cancel(a,'disabled');else queue(a);
 a.notify(true);return {ok:true,autoPass:a.autoPass};
}
module.exports={cancel,queue,set};
