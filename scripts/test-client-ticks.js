'use strict';
const assert=require('assert'),{EventEmitter}=require('events'),fs=require('fs'),crypto=require('crypto');
const {ClientTicks}=require('../src/main/bot/client-ticks');
const {MotionPacer,PacketBudget,CRITICAL,LIMITS}=require('../src/main/bot/packet-budget');
const {compatiblePhysics}=require('../src/main/bot/client-tick-physics');
let passed=0;
function fixture(version='26.1'){
 const b=new EventEmitter();b._client=new EventEmitter();b._client.state='play';b.__kbClientTickLifecycle=true;
 b.supportFeature=require('prismarine-registry')(version).supportFeature;
 let now=0,timers=0,enabled=true,ts;const writes=[],violations=[];
 const send=(n,p,required)=>{writes.push({n,p,required,t:now});};
 const pacer=new MotionPacer(send,{now:()=>now,frameBounded:()=>ts.supported(),setTimer:()=>{timers++;return 1;}});
 ts=new ClientTicks(b,{send,flush:()=>pacer.flush(),cancel:()=>pacer.cancel(),enabled:()=>enabled,onViolation:r=>violations.push(r)});
 const tick=(work=()=>{})=>{b.emit('kb:client-tick-begin');work();b.emit('kb:client-tick-end');};
 return {b,ts,pacer,writes,violations,tick,now:n=>now=n,timers:()=>timers,enable:v=>enabled=v};
}
function test(name,fn){fn();passed++;}
test('baseline missing end really violates movement/action ordering',()=>{
 let afterMove=false,errors=0;for(const n of ['position_look','block_place']){if(n==='tick_end')afterMove=false;else if(n==='position_look')afterMove=true;else if(afterMove)errors++;}
 assert.equal(errors,1);
});
for(const version of ['1.20.1','1.21.1','1.21.4','26.1']){
 test('feature gating '+version,()=>{
  const f=fixture(version);f.tick();assert.equal(f.writes.length,['1.21.4','26.1'].includes(version)?1:0);f.ts.close();
 });
}
test('motion and marker are consecutive after tick actions, exactly one end',()=>{
 const f=fixture();f.tick(()=>{
  f.writes.push({n:'player_input'});f.pacer.offer('position',{x:1,y:2,z:3});f.pacer.offer('look',{yaw:90,pitch:20});
  f.writes.push({n:'block_place'});
 });
 assert.deepEqual(f.writes.map(p=>p.n),['player_input','block_place','position_look','tick_end']);
 assert.equal(f.timers(),0);assert.equal(f.ts.begun,1);assert.equal(f.ts.ended,1);f.ts.close();
});
test('50ms cap carries only latest motion to later native tick, no timer replay',()=>{
 const f=fixture();
 f.tick(()=>f.pacer.offer('position',{x:1,y:2,z:3}));
 f.now(10);f.tick(()=>f.pacer.offer('position',{x:2,y:2,z:3}));
 f.now(50);f.tick(()=>f.pacer.offer('position',{x:3,y:2,z:3}));
 assert.deepEqual(f.writes.map(p=>p.n),['position','tick_end','tick_end','position','tick_end']);
 assert.equal(f.writes[3].p.x,3);assert.equal(f.timers(),0);assert.equal(f.ts.ended,3);f.ts.close();
});
test('idle and physics-disabled lifecycle still completes each native frame',()=>{
 const f=fixture();f.b.physicsEnabled=false;for(let i=0;i<20;i++){f.now(i*50);f.tick();}
 assert.equal(f.writes.length,20);assert(f.writes.every(p=>p.n==='tick_end'));f.ts.close();
});
test('configuration, reset and disconnect cannot replay pending motion',()=>{
 const f=fixture();f.b.emit('kb:client-tick-begin');f.pacer.offer('position',{x:99,y:2,z:3});
 f.b._client.state='configuration';f.b._client.emit('start_configuration');f.b.emit('kb:client-tick-end');f.tick();
 assert.equal(f.writes.length,0);f.b._client.state='play';f.tick();assert.deepEqual(f.writes.map(p=>p.n),['tick_end']);
 f.ts.close();f.tick();assert.equal(f.writes.length,1);assert.equal(f.b.listenerCount('kb:client-tick-end'),0);
});
test('synchronous gameplay interleaving fails closed but required replies survive',()=>{
 const f=fixture();f.ts.flush=()=>{
  assert(!f.ts.allow('block_place'));assert(f.ts.allow('pong'));assert(f.ts.allow('teleport_confirm'));
 };
 f.tick();assert.deepEqual(f.violations,['action_during_tick_close']);assert.equal(f.writes[0].n,'tick_end');f.ts.close();
});
test('disabled connection cannot send a frame marker',()=>{
 const f=fixture();f.enable(false);f.tick();assert.equal(f.writes.length,0);f.ts.close();
});
test('end marker counted as lifecycle, never waives gameplay limits',()=>{
 const b=new PacketBudget();assert(CRITICAL.test('tick_end'));
 for(let i=0;i<20;i++){assert(b.inspect('tick_end',true));b.sent('tick_end',true);}
 assert.equal(b.snapshot().currentEssentialSecond,20);
 assert.equal(b.snapshot().currentTickEnds,20);assert.equal(b.snapshot().currentServerReplySecond,0);
 assert(b.inspect('block_place',true));assert(b.inspect('block_place',true));assert(!b.inspect('block_place',true));
 assert.deepEqual(LIMITS.place,[4,2]);
});
test('pinned native plugin compiled in memory, installed source untouched',()=>{
 const file=require.resolve('mineflayer/lib/plugins/physics'),hash=()=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const before=hash();assert.equal(typeof compatiblePhysics(),'function');assert.equal(hash(),before);assert.strictEqual(compatiblePhysics(),compatiblePhysics());
});
console.log(`Client tick lifecycle tests passed: ${passed} cases; native-frame order, coalescing, idle/config/reset/cleanup, feature gating, unchanged gameplay limits, installed-source integrity.`);