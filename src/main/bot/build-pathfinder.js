'use strict';
// Narrow compatibility fix for our pinned pathfinder. Upstream fullStop()
// snaps X/Z to cell centers and zeroes horizontal velocity outside physics.
// Auto Build instead releases inputs and lets native collision/friction brake.
// Compile the installed source in memory; NEVER modify node_modules on disk.
const fs=require('fs'),Module=require('module'),path=require('path');
let cached;
const oldStop=`  function fullStop () {
    bot.clearControlStates()

    // Force horizontal velocity to 0 (otherwise inertia can move us too far)
    // Kind of cheaty, but the server will not tell the difference
    bot.entity.velocity.x = 0
    bot.entity.velocity.z = 0

    const blockX = Math.floor(bot.entity.position.x) + 0.5
    const blockZ = Math.floor(bot.entity.position.z) + 0.5

    // Make sure our bounding box don't collide with neighboring blocks
    // otherwise recenter the position
    if (Math.abs(bot.entity.position.x - blockX) > 0.2) { bot.entity.position.x = blockX }
    if (Math.abs(bot.entity.position.z - blockZ) > 0.2) { bot.entity.position.z = blockZ }
  }`;
function compatiblePathfinder(){
 if(cached)return cached;
 const filename=require.resolve('mineflayer-pathfinder');
 const version=require('mineflayer-pathfinder/package.json').version;
 const source=fs.readFileSync(filename,'utf8');
 // Fail closed on an unsupported upgrade: never silently restore synthetic
 // recentering. Lockfile/version is part of the reproducible package.
 if(version!=='2.4.5'||source.split(oldStop).length!==2)throw Object.assign(Error('pathfinder_compatibility'),{code:'pathfinder_compatibility'});
 // The old .35 arrival radius depended on synthetic recentering. Walk
 // closer using normal input so the body's edge clears adjacent blocks;
 // apply the SAME radius to pathFromPlayer and the movement monitor.
 const arrival='Math.abs(dx) <= 0.35 && Math.abs(dz) <= 0.35 && Math.abs(dy) < 1';
 if(source.split(arrival).length!==3)throw Object.assign(Error('pathfinder_compatibility'),{code:'pathfinder_compatibility'});
 const patched=source.replaceAll(arrival,'Math.abs(dx) <= 0.10 && Math.abs(dz) <= 0.10 && Math.abs(dy) < 1').replace(oldStop,`  function fullStop () {
    bot.clearControlStates()
  }`);
 const local=new Module(filename,module);local.filename=filename;local.paths=Module._nodeModulePaths(path.dirname(filename));local._compile(patched,filename);
 const native=local.exports;
 cached={...native,pathfinder:bot=>{native.pathfinder(bot);bot.pathfinder.__kbNaturalStops=true;}};
 return cached;
}
module.exports={compatiblePathfinder};
