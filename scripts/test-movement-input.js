'use strict';
const assert=require('assert'),{EventEmitter}=require('events');
const BotManager=require('../src/main/bot/bot-manager');
const {headingAligned,travelPolicy}=require('../src/main/bot/build-travel');
let passed=0;const test=(name,fn)=>{fn();passed++;};
function fixture(modern){
 const b=new EventEmitter(),c=new EventEmitter(),sent=[];b._client=c;c.state='play';c.write=(n,p)=>sent.push({n,p});b.game={minY:0,height:256};b.inventory={items:()=>[]};b.supportFeature=f=>f==='newPlayerInputPacket'&&modern;
 b.controlState={forward:false,back:false,left:false,right:false,jump:false,sneak:false,sprint:false};b.setControlState=(k,v)=>{b.controlState[k]=v;};b.clearControlStates=()=>{for(const k in b.controlState)b.controlState[k]=false;};b.stopDigging=()=>{};b.pathfinder={setGoal:()=>{},movements:{allowSprinting:false}};
 const log={L:(_t,e)=>e,ts:()=>''};for(const k of ['info','warn','error','connect','disconnect','reconnect','chat'])log[k]=()=>{};
 const m=new BotManager(log,'/unused');m.bot=b;m.cfg={settings:{}};m.traceWrites(b);return {m,b,c,sent,close:()=>m.cleanup()};
}
try{
 test('forward reported before matching physics movement, all seven bits',()=>{const f=fixture(true);try{f.b.controlState.forward=true;f.b.emit('physicsTick');f.c.write('position',{x:1,y:1,z:0});assert.equal(f.sent[0].n,'player_input');assert.deepEqual(f.sent[0].p.inputs,{forward:true,backward:false,left:false,right:false,jump:false,shift:false,sprint:false});}finally{f.close();}});
 test('unchanged controls never create per-tick spam',()=>{const f=fixture(true);try{for(let i=0;i<600;i++)f.b.emit('physicsTick');assert.equal(f.sent.filter(p=>p.n==='player_input').length,1);}finally{f.close();}});
 test('native shift-only packet cannot reset real forward/jump/sprint',()=>{const f=fixture(true);try{Object.assign(f.b.controlState,{forward:true,jump:true,sneak:true,sprint:true});f.c.write('player_input',{inputs:{shift:true}});assert.deepEqual(f.sent[0].p.inputs,{forward:true,backward:false,left:false,right:false,jump:true,shift:true,sprint:true});f.b.emit('physicsTick');assert.equal(f.sent.length,1);}finally{f.close();}});
 test('released keys explicitly reported while paused with physics disabled',()=>{const f=fixture(true);try{f.m.autoBuild.bot=f.b;f.m.autoBuild.status='running';f.b.controlState.forward=true;f.b.emit('physicsTick');f.m.autoBuild.pause();assert.equal(f.sent.at(-1).p.inputs.forward,false);}finally{f.close();}});
 test('respawn resets dedup so server gets complete state again',()=>{const f=fixture(true);try{f.b.emit('physicsTick');f.c.emit('respawn',{});f.b.emit('physicsTick');assert.equal(f.sent.length,2);}finally{f.close();}});
 test('legacy player input schema unchanged, no new keyboard packets',()=>{const f=fixture(false);try{f.b.controlState.forward=true;f.b.emit('physicsTick');assert.equal(f.sent.length,0);const p={sideways:1,forward:0,jump:true,unmount:false};f.c.write('player_input',p);assert.strictEqual(f.sent[0].p,p);}finally{f.close();}});
 test('mandatory replies remain immediate while packet guard is latched',()=>{const f=fixture(true);try{f.m.autoBuild.status='running';for(let i=0;i<3;i++)f.c.write('block_place',{location:{x:i,y:0,z:0},direction:1});assert(f.m._packetBudget.latched);f.c.write('pong',{id:1});f.c.write('teleport_confirm',{teleportId:7});assert.deepEqual(f.sent.slice(-2).map(p=>p.n),['pong','teleport_confirm']);}finally{f.close();}});
 test('input reporter detaches its listeners',()=>{const f=fixture(true);f.close();assert.equal(f.b.listenerCount('physicsTick'),0);assert.equal(f.c.listenerCount('respawn'),0);});
 test('turn gate waits for actually transmitted yaw and does not queue jump',()=>{const f=fixture(true);try{f.b.__kbMotionTracing=true;f.b.entity={yaw:Math.PI/2,position:{floored:()=>({})}};f.b.__kbLastView={yaw:180};assert(!headingAligned(f.b));const original=f.b.setControlState,build={bot:f.b,valid:()=>true,fastWalk:false,phase:'escape_walk'};const release=travelPolicy(build,{heuristic:()=>10},1);f.b.setControlState('forward',true);f.b.setControlState('jump',true);assert.equal(f.b.controlState.forward,false);assert.equal(f.b.controlState.jump,false);f.b.__kbLastView.yaw=90;assert(headingAligned(f.b));f.b.setControlState('forward',true);assert.equal(f.b.controlState.forward,true);release();assert.strictEqual(f.b.setControlState,original);}finally{f.close();}});
 test('heading wrap around -180/+180 is compared correctly',()=>{assert(headingAligned({__kbMotionTracing:true,entity:{yaw:-Math.PI+.01},__kbLastView:{yaw:359.4}}));assert(!headingAligned({__kbMotionTracing:true,entity:{yaw:0}}));});
 console.log(`Movement input/turn-gate tests passed: ${passed} scenarios.`);
}catch(e){console.error(e);process.exitCode=1;}
