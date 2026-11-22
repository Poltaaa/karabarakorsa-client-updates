'use strict';
// Dependency-free policy regressions. Real travel timings and placement/escape
// integration are covered separately by test:travel and test:build-network.
const assert=require('assert'),{EventEmitter}=require('events');
const {safeSprint,travelPolicy}=require('../src/main/bot/build-travel');
class V {
 constructor(x,y,z){Object.assign(this,{x,y,z});}
 offset(x,y,z){return new V(this.x+x,this.y+y,this.z+z);}
 floored(){return new V(Math.floor(this.x),Math.floor(this.y),Math.floor(this.z));}
}
function fixture(kind='stone',height=1){
 const b=new EventEmitter();b.food=20;b.entity={position:new V(.5,height,.5),velocity:new V(0,0,0),yaw:-Math.PI/2,onGround:true};
 b.controlState={sneak:false,sprint:false};b.setControlState=(k,v)=>b.controlState[k]=v;
 b.pathfinder={movements:{allowSprinting:false}};
 b.blockAt=q=>{
  const p=q.floored(),floor=p.y===0;
  return {position:p,name:floor?kind:'air',boundingBox:floor?'block':'empty',shapes:floor?[[0,0,0,1,height,1]]:[]};
 };
 return b;
}
const goal={heuristic:p=>10-p.x};let passed=0;
function test(name,fn){fn();passed++;}
test('clear flat ground',()=>assert(safeSprint(fixture(),goal)));
test('fractional soul-sand surface',()=>assert(safeSprint(fixture('soul_sand',.875),goal)));
for(const name of ['honey_block','slime_block','blue_ice','water','magma_block'])
 test(name+' stays walk-only',()=>assert(!safeSprint(fixture(name),goal)));
test('edge',()=>{const b=fixture(),old=b.blockAt;b.blockAt=q=>q.x>=2&&q.y<1?{...old(q),name:'air',boundingBox:'empty',shapes:[]}:old(q);assert(!safeSprint(b,goal));});
test('unloaded chunk',()=>{const b=fixture(),old=b.blockAt;b.blockAt=q=>q.x>=2?null:old(q);assert(!safeSprint(b,goal));});
test('one-block obstacle',()=>{const b=fixture(),old=b.blockAt;b.blockAt=q=>q.x>=2&&q.y>=1&&q.y<2?{...old(q),name:'stone',boundingBox:'block',shapes:[[0,0,0,1,1,1]]}:old(q);assert(!safeSprint(b,goal));});
test('low ceiling',()=>{const b=fixture(),old=b.blockAt;b.blockAt=q=>q.y>=2?{...old(q),name:'stone',boundingBox:'block',shapes:[[0,0,0,1,1,1]]}:old(q);assert(!safeSprint(b,goal));});
test('height change',()=>{const b=fixture(),old=b.blockAt;b.blockAt=q=>q.x>=2&&q.y<1?{...old(q),shapes:[[0,0,0,1,.5,1]]}:old(q);assert(!safeSprint(b,goal));});
test('low food and unknown food',()=>{const b=fixture();for(const food of [6,0,undefined]){b.food=food;assert(!safeSprint(b,goal));}});
test('airborne and vertical motion',()=>{const b=fixture();b.entity.onGround=false;assert(!safeSprint(b,goal));b.entity.onGround=true;b.entity.velocity.y=.1;assert(!safeSprint(b,goal));});
test('manual sneak',()=>{const b=fixture();b.controlState.sneak=true;assert(!safeSprint(b,goal));});
test('water and lava',()=>{const b=fixture();b.entity.isInWater=true;assert(!safeSprint(b,goal));b.entity.isInWater=false;b.entity.isInLava=true;assert(!safeSprint(b,goal));});
test('brake near destination',()=>assert(!safeSprint(fixture(),{heuristic:()=>1})));
test('invalid heading',()=>{const b=fixture();b.entity.yaw=NaN;assert(!safeSprint(b,goal));});
test('phase, option, cancellation and cleanup',()=>{
 const b=fixture(),build={bot:b,phase:'walk',fastWalk:true,valid:()=>true};
 b.controlState.sneak=true;const before=b.listenerCount('physicsTick'),release=travelPolicy(build,goal,1);
 assert(!b.controlState.sneak);assert(b.pathfinder.movements.allowSprinting);assert.equal(b.listenerCount('physicsTick'),before+1);
 for(const phase of ['aim','settle','rescue_exit','rescue_close']){build.phase=phase;b.controlState.sprint=true;b.emit('physicsTick');assert(!b.controlState.sprint&&!b.pathfinder.movements.allowSprinting);}
 build.phase='walk';build.fastWalk=false;b.emit('physicsTick');assert(!b.pathfinder.movements.allowSprinting);
 build.fastWalk=true;b.emit('physicsTick');assert(b.pathfinder.movements.allowSprinting);
 build.valid=()=>false;b.controlState.sprint=true;b.emit('physicsTick');assert(!b.pathfinder.movements.allowSprinting&&!b.controlState.sprint);
 release();assert.equal(b.listenerCount('physicsTick'),before);assert(!b.pathfinder.movements.allowSprinting);
});
console.log(`Build travel safety tests passed: ${passed} scenarios.`);