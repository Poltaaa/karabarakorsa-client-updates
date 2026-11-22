'use strict';
// Mirrors the pinned native client's XYZ relative-flag interpretation. Does
// not change coordinates/velocity, forge replies or infer an anti-cheat reason.
function serverTarget(packet,position){
 if(!position||!['x','y','z'].every(k=>Number.isFinite(position[k])&&Number.isFinite(packet?.[k])))return null;
 const flags=packet.flags,target={};
 for(const [i,k] of ['x','y','z'].entries()){
  const relative=flags&&typeof flags==='object'?!!flags[k]:!!(Number(flags)&(1<<i));
  target[k]=packet[k]+(relative?position[k]:0);
 }
 return target;
}
function samePosition(params,target){
 return !!target&&['x','y','z'].every(k=>Number.isFinite(params?.[k])&&Math.abs(params[k]-target[k])<1e-6);
}
class MovementWatch {
 constructor({now=Date.now}={}){this.now=now;this.begin();}
 begin(){this.requests=0;this.unchanged=0;this.small=0;this.corrections=0;this.recent=[];this.latched=false;}
 observe(packet,position,active){
  const target=serverTarget(packet,position);if(!target)return {target:null,active,valid:false};
  const distance=Math.hypot(target.x-position.x,target.y-position.y,target.z-position.z);
  const result={target,active,valid:true,distance,kind:distance<.02?'unchanged':distance<.25?'small':'correction',reason:''};
  if(!active)return result;
  const now=this.now();this.requests++;this.recent=this.recent.filter(t=>now-t<5000);
  if(result.kind==='unchanged')this.unchanged++;
  else if(result.kind==='small')this.small++;
  else{
   this.corrections++;this.recent.push(now);if(this.recent.length>16)this.recent.shift();
   // Conservative fail-stop: do not wait for repeated real displacement.
   // Classification thresholds and mandatory native replies are unchanged.
   if(!this.latched){
    this.latched=true;result.reason=distance>=4?'server_teleport':'server_corrections';
   }
  }
  return result;
 }
 snapshot(){this.recent=this.recent.filter(t=>this.now()-t<5000);return {positionRequests:this.requests,unchangedRequests:this.unchanged,smallAdjustments:this.small,realCorrections:this.corrections,recentCorrections:this.recent.length,movementLatched:this.latched};}
}
// A local-waypoint progress guard, not an anti-cheat workaround. Tiny motion
// or back-and-forth must not keep a stalled walk alive indefinitely.
class GoalProgress {
 constructor(goal,position,{now=Date.now,timeout=12000}={}){
  Object.assign(this,{goal,now,timeout});this.best=this.score(position);this.lastAdvance=now();
 }
 score(p){const n=this.goal.heuristic?.(p.floored());return Number.isFinite(n)?n:Infinity;}
 stalled(position){
  const score=this.score(position);
  if(score<this.best-.5){this.best=score;this.lastAdvance=this.now();}
  return Number.isFinite(score)&&this.now()-this.lastAdvance>=this.timeout;
 }
}
module.exports={serverTarget,samePosition,MovementWatch,GoalProgress};