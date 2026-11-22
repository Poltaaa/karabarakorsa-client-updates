'use strict';
// Pinned native physics, with begin/end lifecycle hooks only. Never edit
// node_modules, coordinates, velocity, physics constants or the tick timer.
const fs=require('fs'),Module=require('module'),path=require('path');
let cached;
const oldTick=`  function tickPhysics (now) {
    if (bot._client.state !== 'play') return // do nothing outside of the play state (e.g. server transfer configuration phase)
    if (!bot.entity?.position || !Number.isFinite(bot.entity.position.x)) return // entity not ready
    if (bot.blockAt(bot.entity.position) == null) return // check if chunk is unloaded
    if (bot.physicsEnabled && shouldUsePhysics) {
      physics.simulatePlayer(new PlayerState(bot, controlState), world).apply(bot)
      bot.emit('physicsTick')
      bot.emit('physicTick') // Deprecated, only exists to support old plugins. May be removed in the future
    }
    if (shouldUsePhysics) {
      updatePosition(now)
    }
  }`;
function compatiblePhysics(){
 if(cached)return cached;
 const filename=require.resolve('mineflayer/lib/plugins/physics'),source=fs.readFileSync(filename,'utf8');
 if(require('mineflayer/package.json').version!=='4.39.0'||source.split(oldTick).length!==2)
  throw Object.assign(Error('client_tick_compatibility'),{code:'client_tick_compatibility'});
 const newTick=`  function tickPhysics (now) {
    if (bot._client.state !== 'play') return
    if (!bot.entity?.position || !Number.isFinite(bot.entity.position.x)) return
    if (bot.blockAt(bot.entity.position) == null) return
    const framed = bot.supportFeature('sendsClientTickEndPacket')
    if (framed) bot.emit('kb:client-tick-begin')
    try {
      if (bot.physicsEnabled && shouldUsePhysics) {
        physics.simulatePlayer(new PlayerState(bot, controlState), world).apply(bot)
        bot.emit('physicsTick')
        bot.emit('physicTick')
      }
      if (shouldUsePhysics) updatePosition(now)
    } finally {
      if (framed) bot.emit('kb:client-tick-end')
    }
  }`;
 const local=new Module(filename,module);local.filename=filename;local.paths=Module._nodeModulePaths(path.dirname(filename));
 local._compile(source.replace(oldTick,newTick),filename);
 const native=local.exports;
 cached=(bot,options)=>{bot.__kbClientTickLifecycle=true;native(bot,options);};
 return cached;
}
module.exports={compatiblePhysics};