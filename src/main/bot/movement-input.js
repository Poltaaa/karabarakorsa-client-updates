'use strict';
// Protocol-completeness shim, not a movement or anti-cheat workaround.
// Pinned Mineflayer 4.39.0 only writes new player_input for sneak changes,
// with shift alone. Report the actual native controls, all seven bits, once
// when changed. Never invent pressed keys, modify motion or send on a timer.
const FIELDS=Object.freeze({forward:'forward',backward:'back',left:'left',right:'right',jump:'jump',shift:'sneak',sprint:'sprint'});
function nativeInputs(bot){const out={};for(const [wire,local] of Object.entries(FIELDS))out[wire]=!!bot.controlState?.[local];return out;}
function signature(inputs){return Object.keys(FIELDS).map(k=>inputs[k]?'1':'0').join('');}
class MovementInput {
 constructor(bot){
  this.bot=bot;this.last=null;this.closed=false;
  this.tick=()=>this.flush();this.reset=()=>{this.last=null;this.bot.__kbLastInputs=null;};
  // This listener runs after native simulation and before the pathfinder.
  // Thus it reports the controls that produced this physics frame, before
  // its outgoing movement. Native sneak writes are completed too.
  bot.prependListener('physicsTick',this.tick);
  for(const name of ['login','respawn','start_configuration'])bot._client.on(name,this.reset);
 }
 supported(){return !this.closed&&!!this.bot.supportFeature?.('newPlayerInputPacket');}
 prepare(){
  if(!this.supported())return null;
  const inputs=nativeInputs(this.bot),key=signature(inputs);
  return key===this.last?null:{inputs,key};
 }
 sent(inputs){this.last=signature(inputs);this.bot.__kbLastInputs={...inputs};}
 flush(){if(this.supported()&&this.bot._client.state==='play'&&this.prepare())this.bot._client.write('player_input',{inputs:nativeInputs(this.bot)});}
 close(){this.closed=true;this.bot.removeListener('physicsTick',this.tick);for(const name of ['login','respawn','start_configuration'])this.bot._client.removeListener(name,this.reset);}
}
module.exports={MovementInput,nativeInputs,signature};
