'use strict';
function resting(bot){const e=bot.entity,v=e?.velocity;return !!e&&e.onGround!==false&&Math.hypot(v?.x||0,v?.z||0)<.003&&Math.abs(v?.y||0)<.08;}
// Release inputs immediately, but do not freeze a nonzero native velocity by
// switching physics OFF mid-step. No packet, position or velocity writes.
function drainNativeStop(bot,{restoreSurface=()=>{},savedPhysics,savedSneak=false,warn=()=>{},timeout=1500}={}){
 return new Promise(resolve=>{
  let timer,done=false;
  const finish=(keepPhysics=false)=>{
   if(done)return;done=true;clearTimeout(timer);
   bot.removeListener('physicsTick',tick);bot.removeListener('end',abort);bot.removeListener('respawn',abort);bot._client?.removeListener('start_configuration',abort);
   restoreSurface();bot.__autoBuildInteracting=false;
   bot.physicsEnabled=keepPhysics?true:savedPhysics;
   if(savedSneak)bot.setControlState('sneak',true);
   resolve({keptPhysics:keepPhysics});
  };
  const abort=()=>finish(false);
  const tick=()=>{if(resting(bot))finish(false);};
  bot.clearControlStates();
  bot.on('physicsTick',tick);bot.once('end',abort);bot.once('respawn',abort);bot._client?.once('start_configuration',abort);
  // If falling/blocked/unloaded, leave real physics running rather than
  // freezing mid-air. Never keep an automation job or input loop alive.
  timer=setTimeout(()=>{warn('Auto Build stop: natural motion did not settle; physics left enabled, no automatic restart.');finish(true);},timeout);
  tick();
 });
}
module.exports={resting,drainNativeStop};
