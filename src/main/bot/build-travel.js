'use strict';
// Vanilla travel inputs plus a sent-heading gate. No velocity, attributes, tick-rate or terrain
// multiplier changes. Flat soul sand may be sprinted on, still with its native
// slowdown. Edges, height changes, slippery floors and obstacles use walking.
const UNSAFE = /honey_block|slime_block|ice|lava|water|fire|cactus|magma_block|powder_snow|campfire|sweet_berry_bush|wither_rose/;
function safeSprint(bot,goal) {
  const p=bot.entity?.position,v=bot.entity?.velocity,c=bot.controlState;
  if(!p||!c||(!Number.isFinite(bot.food)||bot.food<=6)||bot.entity.onGround!==true||c.sneak||bot.entity.isInWater||bot.entity.isInLava||Math.abs(v?.y||0)>.08)return false;
  if(goal.heuristic(p.floored())<2)return false; // Brake before the destination/placement stance.
  const yaw=bot.entity.yaw,dx=-Math.sin(yaw),dz=-Math.cos(yaw),y=p.y;
  if(!Number.isFinite(yaw)||!Number.isFinite(y))return false;
  const floorAt=q=>bot.blockAt(q.offset(0,-.01,0));
  const originFloor=floorAt(p);
  if(!originFloor||UNSAFE.test(originFloor.name))return false;
  for(let d=0;d<=3;d+=.5)for(const side of [-.35,0,.35]) {
    const q=p.offset(dx*d-dz*side,0,dz*d+dx*side),f=floorAt(q);
    if(!f||UNSAFE.test(f.name)||f.boundingBox!=='block')return false;
    const solid=f.shapes?.some(s=>s[0]===0&&s[2]===0&&s[3]===1&&s[5]===1&&Math.abs(f.position.y+s[4]-y)<.015);
    if(!solid)return false;
    for(let by=Math.floor(y);by<=Math.floor(y+1.8);by++) {
      const b=bot.blockAt(q.offset(0,by-y,0));
      // A fractional floor shares the foot voxel with clear air above its
      // collision shape. Check actual vertical overlap, not the whole voxel.
      if(!b||UNSAFE.test(b.name)||(b.boundingBox!=='empty'&&(!b.shapes?.length||b.shapes.some(s=>b.position.y+s[4]>y+.001&&b.position.y+s[1]<y+1.8))))return false;
    }
  }
  return true;
}
function headingError(bot){
  const yaw=bot.__kbLastView?.yaw,desired=bot.entity?.yaw;
  if(!Number.isFinite(yaw)||!Number.isFinite(desired))return null;
  const wire=(180-yaw)*Math.PI/180;
  return Math.abs(Math.atan2(Math.sin(desired-wire),Math.cos(desired-wire)));
}
function headingAligned(bot){
  // Local adapter fixtures without a real wire observer cannot use this gate.
  if(!bot.__kbMotionTracing)return true;
  const error=headingError(bot);return error!==null&&error<=.10;
}
function travelPolicy(build,goal,token) {
  const b=build.bot,m=b.pathfinder.movements;if(!m)return()=>{};
  const original=b.setControlState;
  const directional=new Set(['forward','back','left','right','jump','sprint']);
  const gated=function(control,state){
    // Native look() changes desired yaw before the wire's gradual turn has
    // completed. Do not accelerate/jump into that unsent heading. Blocking
    // the native call BEFORE it queues a jump avoids a hidden queued jump.
    if(state&&directional.has(control)&&build.valid(token)&&!headingAligned(b))state=false;
    return original.call(b,control,state);
  };
  b.setControlState=gated;
  const tick=()=>{
    const allow=build.valid(token)&&build.fastWalk&&build.phase==='walk'&&headingAligned(b)&&safeSprint(b,goal);
    m.allowSprinting=!!allow;
    // Pathfinder chooses the route and whether sprinting is useful. This gate
    // only withdraws sprint immediately if the newly chosen heading is unsafe.
    if(!allow)b.setControlState('sprint',false);
  };
  b.setControlState('sneak',false);tick();b.on('physicsTick',tick);
  return ()=>{b.removeListener('physicsTick',tick);m.allowSprinting=false;if(b.setControlState===gated)b.setControlState=original;b.setControlState('sprint',false);};
}
module.exports={safeSprint,travelPolicy,headingAligned,headingError};
