'use strict';
const assert=require('assert'),{EventEmitter}=require('events');
const {serverTarget,samePosition,MovementWatch,GoalProgress}=require('../src/main/bot/movement-watch');
const {PacketBudget}=require('../src/main/bot/packet-budget');
const BotManager=require('../src/main/bot/bot-manager');
class V{
 constructor(x,y,z){Object.assign(this,{x,y,z});}
 offset(x,y,z){return new V(this.x+x,this.y+y,this.z+z);}
 floored(){return new V(Math.floor(this.x),Math.floor(this.y),Math.floor(this.z));}
 clone(){return new V(this.x,this.y,this.z);}
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let passed=0;
async function test(name,fn){await fn();passed++;}
function fixture(){
 const sent=[],lines=[],log={L:(_t,e)=>e,ts:()=>'',diagnostic:(kind,data)=>lines.push({kind,data})};
 for(const k of ['info','warn','error','connect','disconnect','chat','reconnect'])log[k]=m=>lines.push(m);
 const m=new BotManager(log,'/unused'),b=new EventEmitter(),c=new EventEmitter();
 c.state='play';c.write=(n,p)=>{sent.push({n,p:{...p}});return true;};b._client=c;
 b.entity={position:new V(0,65,0),velocity:new V(0,0,0),onGround:true,yaw:0,pitch:0};
 b.blockAt=()=>({name:'stone'});b.inventory={items:()=>[]};b.game={minY:0,height:256};
 b.clearControlStates=()=>{};b.stopDigging=()=>{};b.pathfinder={setGoal:()=>{}};
 m.bot=b;m.cfg={settings:{}};m.traceIn=[];m.traceWrites(b);m.autoBuild.bot=b;m.autoBuild.status='running';m.autoBuild.phase='walk';
 // Simulated native handler for ordering tests; separate loopback tests use the
 // unmodified real Mineflayer handler, real serialization and packet ACKs.
 c.on('position',p=>{
  const q=serverTarget(p,b.entity.position);Object.assign(b.entity.position,q);
  c.write('teleport_confirm',{teleportId:p.teleportId});
  c.write('position_look',{...q,yaw:0,pitch:0,onGround:false});b.emit('forcedMove');
 });
 return {m,b,c,sent,lines,close:()=>m.cleanup()};
}
async function main(){
 const origin=new V(48,83.875,-5);
 await test('modern zero relative marker',()=>assert.deepEqual(serverTarget({x:0,y:0,z:0,flags:{x:true,y:true,z:true}},origin),{x:48,y:83.875,z:-5}));
 await test('legacy numeric relative flags',()=>assert.deepEqual(serverTarget({x:1,y:0,z:-2,flags:7},origin),{x:49,y:83.875,z:-7}));
 await test('absolute packet',()=>assert.deepEqual(serverTarget({x:2,y:65,z:3,flags:0},origin),{x:2,y:65,z:3}));
 await test('mixed axes',()=>assert.deepEqual(serverTarget({x:1,y:65,z:-2,flags:{x:true,z:true}},origin),{x:49,y:65,z:-7}));
 await test('invalid coordinate does not guess',()=>{assert.equal(serverTarget({x:NaN,y:0,z:0},origin),null);assert.equal(serverTarget({x:0,y:0,z:0},null),null);});
 await test('reply match is exact XYZ, not a generic look',()=>{assert(samePosition({x:1,y:65,z:0},{x:1,y:65,z:0}));assert(!samePosition({yaw:1,pitch:2},{x:1,y:65,z:0}));assert(!samePosition({x:2,y:65,z:0},{x:1,y:65,z:0}));});
 await test('many zero markers and rotation-only requests never trip',()=>{
  let now=0;const w=new MovementWatch({now:()=>now});for(let i=0;i<200;i++){const q=w.observe({x:0,y:0,z:0,yaw:15,flags:31},origin,true);assert.equal(q.reason,'');now+=100;}
  assert.equal(w.snapshot().unchangedRequests,200);assert.equal(w.snapshot().realCorrections,0);assert(!w.latched);
 });
 await test('small adjustments separated from real corrections',()=>{const w=new MovementWatch();for(let i=0;i<20;i++)assert.equal(w.observe({x:48.1,y:83.875,z:-5,flags:0},origin,true).reason,'');assert.equal(w.snapshot().smallAdjustments,20);assert.equal(w.corrections,0);});
 await test('first actual correction latches only once',()=>{
  let now=0;const w=new MovementWatch({now:()=>now});
  assert.equal(w.observe({x:48.5,y:83.875,z:-5,flags:0},origin,true).reason,'server_corrections');now+=1000;
  assert.equal(w.observe({x:48.5,y:83.875,z:-5,flags:0},origin,true).reason,'');assert(w.latched);w.begin();assert(!w.latched);assert.equal(w.requests,0);
 });
 await test('history expires without automatically clearing safety latch',()=>{let now=0;const w=new MovementWatch({now:()=>now});w.observe({x:49,y:83.875,z:-5},origin,true);now=6000;assert.equal(w.snapshot().recentCorrections,0);assert(w.latched);assert.equal(w.observe({x:49,y:83.875,z:-5},origin,true).reason,'');assert.equal(w.snapshot().recentCorrections,1);});
 await test('large server displacement pauses immediately only while active',()=>{const w=new MovementWatch();assert.equal(w.observe({x:60,y:83.875,z:-5},origin,false).reason,'');assert.equal(w.requests,0);assert.equal(w.observe({x:60,y:83.875,z:-5},origin,true).reason,'server_teleport');});
 await test('vertical correction counts too',()=>{const w=new MovementWatch();const q=w.observe({x:48,y:85,z:-5},origin,true);assert.equal(q.kind,'correction');assert.equal(w.corrections,1);});
 const goal={heuristic:p=>Math.abs(10-p.x)};
 await test('tiny jitter does not renew progress deadline',()=>{let now=0;const p=new GoalProgress(goal,new V(0,1,0),{now:()=>now});for(let i=0;i<11;i++){now+=1000;assert(!p.stalled(new V(i%2?.1:-.1,1,0)));}now=12000;assert(p.stalled(new V(.1,1,0)));});
 await test('slow meaningful forward progress renews deadline',()=>{let now=0;const p=new GoalProgress(goal,new V(0,1,0),{now:()=>now});for(let x=1;x<=8;x++){now+=8000;assert(!p.stalled(new V(x,1,0)));}});
 await test('backtracking does not renew after best approach',()=>{let now=0;const p=new GoalProgress(goal,new V(0,1,0),{now:()=>now});now=1000;assert(!p.stalled(new V(1,1,0)));now=13000;assert(p.stalled(new V(-1,1,0)));});
 await test('current packet rates expire, historical peak is explicitly scoped',()=>{let now=0;const b=new PacketBudget({now:()=>now});for(let i=0;i<339;i++)b.sent('pong');let s=b.snapshot();assert.equal(s.currentEssentialSecond,339);now=1500;s=b.snapshot();assert.equal(s.currentSecond,0);assert.equal(s.peak100ms,339);assert.equal(s.peakScope,'connection');assert.deepEqual(s.currentTypes,{});});
 await test('required position reply is not automation motion',()=>{const b=new PacketBudget();b.sent('position_look',true);b.sent('position_look');b.sent('pong');const s=b.snapshot();assert.equal(s.currentSecond,3);assert.equal(s.currentEssentialSecond,2);assert.equal(s.currentAutomationSecond,1);assert.equal(s.currentPositionReplies,1);assert.equal(s.currentMotionSecond,1);});
 await test('native position reply bypasses pending walk immediately',async()=>{
  const f=fixture();try{f.c.write('position_look',{x:0,y:65,z:0,yaw:0,pitch:0});f.b.entity.position.x=.2;f.c.write('position_look',{x:.2,y:65,z:0,yaw:0,pitch:0});
   f.c.emit('position',{x:.5,y:65,z:0,flags:0,teleportId:7});assert.equal(f.sent.filter(p=>p.n==='position_look').length,2);assert.equal(f.sent.at(-1).p.x,.5);await sleep(70);assert.equal(f.sent.filter(p=>p.n==='position_look').length,2);assert.equal(f.m._packetBudget.snapshot().currentPositionReplies,1);
  }finally{f.close();}
 });
 await test('repeated corrections pause after reply without extra work',()=>{
  const f=fixture();try{for(let i=0;i<3;i++){f.c.emit('position',{x:f.b.entity.position.x-.4,y:65,z:0,flags:0,teleportId:i});assert.equal(f.m.autoBuild.status,'paused','stop on the FIRST correction, while still replying to subsequent requests');}
   assert.equal(f.m.autoBuild.status,'paused');assert.equal(f.m.autoBuild.reason,'server_corrections');assert.equal(f.m.autoBuild.resume().error,'movement_cooldown');assert.equal(f.sent.filter(p=>p.n==='teleport_confirm').length,3);assert.equal(f.sent.filter(p=>p.n==='position_look').length,3);assert(Math.abs(f.b.entity.position.x+1.2)<1e-6);assert(f.lines.some(x=>x.kind==='server_position'));
  }finally{f.close();}
 });
 await test('frequent markers with ping replies preserve native responses',()=>{
  const f=fixture();try{for(let i=0;i<50;i++){f.c.emit('position',{x:0,y:0,z:0,flags:7,teleportId:i});f.c.write('pong',{id:i});}
   assert.equal(f.m.autoBuild.status,'running');assert(!f.m._packetBudget.latched);assert(!f.m._movementWatch.latched);assert.equal(f.m._movementWatch.snapshot().unchangedRequests,50);assert.equal(f.sent.filter(p=>p.n==='position_look').length,50);assert.equal(f.sent.filter(p=>p.n==='pong').length,50);
  }finally{f.close();}
 });
 await test('disconnect detaches position and forced-move observers',()=>{const f=fixture();f.close();assert.equal(f.b.listenerCount('forcedMove'),0);assert.equal(f.c.listenerCount('position'),1);assert.equal(f.m._movementWatch,null);});
 console.log(`Movement response/watchdog/current-rate tests passed: ${passed} scenarios.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});