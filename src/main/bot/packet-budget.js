'use strict';
// Engineering watchdog, not a server anti-cheat model. No payloads or IDs.
const CRITICAL=/^(pong|keep_alive|teleport_confirm|configuration_acknowledged|finish_configuration|login_acknowledged|chunk_batch_received|window_confirmation|tick_end)$/;
const MOTION=/^(position|position_look|look)$/;
const LIMITS=Object.freeze({total:[80,16],motion:[45,8],action:[12,4],place:[4,2],dig:[16,6]});
const group=n=>MOTION.test(n)?'motion':n==='entity_action'?'action':n==='block_place'?'place':n==='block_dig'?'dig':'other';
class PacketBudget {
 constructor({now=Date.now,onTrip=()=>{}}={}) {
  this.now=now;this.onTrip=onTrip;this.attempts=[];this.actual=[];this.latched=false;
  this.totals={sent:0,coalesced:0,suppressed:0};this.types={};this.peakSecond=0;this.peak100ms=0;
 }
 begin(){this.attempts=[];this.latched=false;}
 inspect(name,active) {
  if(!active||CRITICAL.test(name))return true;
  const now=this.now();this.attempts=this.attempts.filter(p=>now-p.t<1000);
  if(this.latched)return false;
  this.attempts.push({t:now,g:group(name)});
  const violated=Object.entries(LIMITS).find(([g,[second,short]])=>{
   const list=this.attempts.filter(p=>g==='total'||p.g===g);
   return list.length>second||list.filter(p=>now-p.t<100).length>short;
  });
  if(!violated)return true;
  this.latched=true;this.totals.suppressed++;
  this.onTrip({...this.snapshot(),trigger:violated[0],attempted:this.attempts.length});
  return false;
 }
 sent(name,required=false){
  const now=this.now();this.actual=this.actual.filter(p=>now-p.t<1000);
  if(this.actual.length>=4096)this.actual.shift();
  this.actual.push({t:now,n:name,required:!!required||CRITICAL.test(name)});this.totals.sent++;
  // Cap distinct packet names; never include packet contents.
  const key=/^[a-z0-9_]{1,64}$/.test(name)?name:'unknown';
  if(Object.keys(this.types).length<64||key in this.types)this.types[key]=(this.types[key]||0)+1;
  this.peakSecond=Math.max(this.peakSecond,this.actual.length);
  this.peak100ms=Math.max(this.peak100ms,this.actual.filter(p=>now-p.t<100).length);
 }
 snapshot(){
  const now=this.now();this.actual=this.actual.filter(p=>now-p.t<1000);
  const types={};for(const p of this.actual)types[p.n]=(types[p.n]||0)+1;
  return {...this.totals,peakSecond:this.peakSecond,peak100ms:this.peak100ms,peakScope:'connection',
   currentSecond:this.actual.length,current100ms:this.actual.filter(p=>now-p.t<100).length,
   currentEssentialSecond:this.actual.filter(p=>p.required).length,
   currentServerReplySecond:this.actual.filter(p=>p.required&&p.n!=='tick_end').length,
   currentTickEnds:this.actual.filter(p=>p.n==='tick_end').length,
   currentAutomationSecond:this.actual.filter(p=>!p.required).length,
   currentMotionSecond:this.actual.filter(p=>MOTION.test(p.n)&&!p.required).length,
   currentPositionReplies:this.actual.filter(p=>MOTION.test(p.n)&&p.required).length,
   currentTypes:types,types:{...this.types},latched:this.latched};
 }
}
// At most one pending absolute movement, not an unbounded delayed queue.
// Coalescing applies only to Auto Build movement. Critical replies bypass it.
class MotionPacer {
 constructor(send,{now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,gap=50,onCoalesce=()=>{},frameBounded=false}={}){
  Object.assign(this,{send,now,setTimer,clearTimer,gap,onCoalesce,frameBounded});this.last=-Infinity;this.pending=null;this.timer=null;this.closed=false;
 }
 framed(){return typeof this.frameBounded==='function'?this.frameBounded():this.frameBounded;}
 offer(name,params){
  if(this.closed)return;
  const p={...params};if(p.flags&&typeof p.flags==='object')p.flags={...p.flags};
  if(this.pending){this.onCoalesce();this.pending.params={...this.pending.params,...p};}
  else this.pending={name,params:p};
  const q=this.pending.params;
  this.pending.name=Number.isFinite(q.x)&&Number.isFinite(q.yaw)?'position_look':Number.isFinite(q.x)?'position':Number.isFinite(q.yaw)?'look':name;
  if(this.framed())return; // Native tick end, not a separate timer, drains it.
  const delay=Math.max(0,this.gap-(this.now()-this.last));
  if(!delay)return this.flush();
  if(this.timer===null)this.timer=this.setTimer(()=>{this.timer=null;this.flush();},delay);
 }
 flush(){
  if(this.closed||!this.pending)return;
  const delay=this.gap-(this.now()-this.last);
  if(delay>0){if(!this.framed()&&this.timer===null)this.timer=this.setTimer(()=>{this.timer=null;this.flush();},delay);return;}
  if(this.timer!==null)this.clearTimer(this.timer);this.timer=null;
  const p=this.pending;this.pending=null;this.last=this.now();return this.send(p.name,p.params);
 }
 cancel(){if(this.timer!==null)this.clearTimer(this.timer);this.timer=null;this.pending=null;}
 close(){this.cancel();this.closed=true;}
}
module.exports={PacketBudget,MotionPacer,CRITICAL,MOTION,LIMITS};