'use strict';
// Protocol lifecycle completion, not an anti-cheat threshold model. Exactly
// one marker per native loaded play-state tick; no extra timer or fake ACK.
const {CRITICAL}=require('./packet-budget');
class ClientTicks {
 constructor(bot,{flush,send,cancel=()=>{},enabled=()=>true,onViolation=()=>{}}){
  Object.assign(this,{bot,flush,send,cancel,enabled,onViolation});this.open=false;this.closing=false;this.closed=false;this.begun=0;this.ended=0;
  this.begin=()=>{
   if(!this.supported()||!this.enabled()||bot._client.state!=='play')return;
   if(this.open){this.onViolation('nested_tick');return;}
   this.open=true;this.begun++;
  };
  this.end=()=>{
   if(!this.open)return;
   this.open=false;
   if(!this.supported()||!this.enabled()||bot._client.state!=='play')return;
   this.closing=true;
   try{this.flush();this.send('tick_end',{},true);this.ended++;}
   finally{this.closing=false;}
  };
  this.reset=()=>{this.open=false;this.cancel();};
  bot.on('kb:client-tick-begin',this.begin);bot.on('kb:client-tick-end',this.end);
  for(const name of ['login','respawn','start_configuration'])bot._client.on(name,this.reset);
 }
 supported(){return !this.closed&&!!this.bot.__kbClientTickLifecycle&&!!this.bot.supportFeature?.('sendsClientTickEndPacket');}
 allow(name){
  // Synchronous event listeners must not interleave a gameplay action into
  // the movement -> end-marker pair. Stop, rather than replaying it later.
  if(this.closing&&!CRITICAL.test(name)){this.onViolation('action_during_tick_close');return false;}
  return true;
 }
 close(){
  this.closed=true;this.open=false;this.cancel();
  this.bot.removeListener('kb:client-tick-begin',this.begin);this.bot.removeListener('kb:client-tick-end',this.end);
  for(const name of ['login','respawn','start_configuration'])this.bot._client.removeListener(name,this.reset);
 }
}
module.exports={ClientTicks};