'use strict';
const fs=require('fs'),path=require('path');
// Strict scalar allowlist. Do not copy generic logger messages, chat, commands,
// server addresses, usernames, IDs, inventory/NBT or protocol payloads.
const KEYS=new Set('cycleMs moveMs settleMs checkMs equipMs gateMs aimMs ackMs build mcVersion phase event reason block floor placed targetX targetY targetZ x y z ground sprint sneak forward jump sentForward headingError speedBase speedEffective vxz vy deltaX deltaY deltaZ rx tx keepRx keepTx pingRx pongTx lastRxAgo loopDelayMax sent coalesced suppressed peakSecond peak100ms peakScope currentSecond current100ms currentEssentialSecond currentServerReplySecond currentTickEnds currentAutomationSecond currentMotionSecond currentPositionReplies positionRequests unchangedRequests smallAdjustments realCorrections recentCorrections movementLatched correctionDistance positionKind trigger attempted latched state slot total processed skipped'.split(' '));
function clean(data){
 const out={};
 for(const [k,v] of Object.entries(data||{})){
  if(k==='speedKey'&&['minecraft:movement_speed','generic.movement_speed','minecraft:generic.movement_speed','movement_speed','generic.movementSpeed'].includes(v)){out[k]=v;}
  else if((k==='types'||k==='currentTypes')&&v&&typeof v==='object'){
   out[k]={};for(const [n,c] of Object.entries(v).slice(0,64))if(/^[a-z0-9_]{1,64}$/.test(n)&&Number.isFinite(c))out[k][n]=c;
  } else if(KEYS.has(k)&&(typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&/^[a-zA-Z0-9_. -]{0,80}$/.test(v)))out[k]=v;
 }
 return out;
}
class DiagnosticLog {
 constructor(dir,{maxBytes=1024*1024,maxQueue=512,onError=()=>{}}={}){
  Object.assign(this,{dir,maxBytes,maxQueue,onError});this.file=path.join(dir,'client-diagnostics.jsonl');
  this.queue=[];this.working=null;this.closed=false;this.timer=null;this.disabled=false;
 }
 record(kind,data){
  if(this.closed||this.disabled||!/^[a-z_]{1,40}$/.test(kind))return;
  if(this.queue.length>=this.maxQueue)this.queue.shift();
  this.queue.push(JSON.stringify({time:new Date().toISOString(),kind,...clean(data)})+'\n');
  if(!this.timer){this.timer=setTimeout(()=>{this.timer=null;this.flush();},200);this.timer.unref?.();}
 }
 async flush(){
  if(this.timer){clearTimeout(this.timer);this.timer=null;}
  if(this.working){await this.working;if(this.queue.length)return this.flush();return;}
  if(!this.queue.length||this.disabled)return;
  this.working=(async()=>{
   await fs.promises.mkdir(this.dir,{recursive:true});
   const lines=this.queue.splice(0);
   let size=await fs.promises.stat(this.file).then(s=>s.size).catch(()=>0),bytes='';
   for(const line of lines){
    const n=Buffer.byteLength(line);if(n>this.maxBytes)continue;
    if(size+Buffer.byteLength(bytes)+n>this.maxBytes){
     if(bytes){await fs.promises.appendFile(this.file,bytes,{encoding:'utf8',mode:0o600});bytes='';}
     await fs.promises.unlink(this.file+'.2').catch(()=>{});
     await fs.promises.rename(this.file+'.1',this.file+'.2').catch(()=>{});
     await fs.promises.rename(this.file,this.file+'.1').catch(()=>{});
     size=0;
    }
    bytes+=line;
   }
   if(bytes)await fs.promises.appendFile(this.file,bytes,{encoding:'utf8',mode:0o600});
  })().catch(e=>{this.disabled=true;this.queue=[];this.onError(e);}).finally(()=>{this.working=null;});
  await this.working;
  if(this.queue.length)return this.flush();
 }
 async close(){this.closed=true;await this.flush();}
}
module.exports={DiagnosticLog,clean};