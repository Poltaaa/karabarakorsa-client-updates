'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),{EventEmitter}=require('events');
const {PacketBudget,MotionPacer,CRITICAL}=require('../src/main/bot/packet-budget');
const {DiagnosticLog,clean}=require('../src/main/diagnostic-log');
const BotManager=require('../src/main/bot/bot-manager');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let passed=0;
async function test(name,fn){await fn();passed++;}
function fixture(){
 const lines=[],sent=[],log={L:(_t,e)=>e,ts:()=>'',diagnostic:(kind,data)=>lines.push({kind,data})};
 for(const k of ['warn','info','error','connect','disconnect','chat','reconnect'])log[k]=m=>lines.push(m);
 const m=new BotManager(log,'/unused'),b=new EventEmitter(),c=new EventEmitter();
 c.state='play';c.write=(name,params)=>{sent.push({name,params,t:Date.now()});return true;};b._client=c;
 b.inventory={items:()=>[]};b.game={minY:0,height:256};b.clearControlStates=()=>{};b.stopDigging=()=>{};b.pathfinder={setGoal:()=>{}};
 m.bot=b;m.cfg={settings:{}};m.traceIn=[];m.traceWrites(b);m.autoBuild.bot=b;m.autoBuild.status='running';m.autoBuild.phase='walk';
 return {m,b,c,sent,lines,close:()=>m.cleanup()};
}
async function main(){
 await test('position diagnostic keeps numeric geometry, never private payloads',()=>{
  const out=clean({mcVersion:'1.21.4',x:1,targetX:2,deltaX:1,deltaY:0,deltaZ:-1,forward:true,jump:false,vy:-.078,vxz:.125,username:'PRIVATE',password:'PRIVATE',packet:{x:999,teleportId:999},teleportId:999});
  assert.deepEqual(out,{mcVersion:'1.21.4',x:1,targetX:2,deltaX:1,deltaY:0,deltaZ:-1,forward:true,jump:false,vy:-.078,vxz:.125});
 });
 await test('server-speed diagnostic uses strict nonprivate fields',()=>{
  assert.deepEqual(clean({speedBase:.04,speedKey:'minecraft:movement_speed',attributes:{secret:'PRIVATE'}}),{speedBase:.04,speedKey:'minecraft:movement_speed'});
  assert.deepEqual(clean({speedBase:NaN,speedKey:'PRIVATE:TOKEN',username:'PRIVATE'}),{});
 });
 await test('normal 20Hz motion never trips',()=>{
  let now=0,trips=0;const b=new PacketBudget({now:()=>now,onTrip:()=>trips++});
  for(let i=0;i<600;i++){assert(b.inspect('position_look',true));b.sent('position_look');now+=50;}
  assert.equal(trips,0);assert.equal(b.snapshot().peakSecond,20);
 });
 for(const [name,n,trigger] of [['position_look',9,'motion'],['entity_action',5,'action'],['block_place',3,'place'],['block_dig',7,'dig'],['custom_payload',17,'total']])
  await test('short burst '+name,()=>{let trips=[];const b=new PacketBudget({now:()=>1,onTrip:s=>trips.push(s)});for(let i=0;i<n-1;i++)assert(b.inspect(name,true));assert(!b.inspect(name,true));assert.equal(trips.length,1);assert.equal(trips[0].trigger,trigger);assert(!b.inspect(name,true));assert.equal(trips.length,1);});
 await test('long-window action cap',()=>{let now=1,trip;const b=new PacketBudget({now:()=>now,onTrip:s=>trip=s});for(let i=0;i<12;i++){assert(b.inspect('entity_action',true));now+=75;}assert(!b.inspect('entity_action',true));assert.equal(trip.trigger,'action');});
 await test('critical replies bypass watchdog and preserve counts',()=>{const b=new PacketBudget();for(let i=0;i<2000;i++){assert(b.inspect('pong',true));b.sent('pong');}assert(!b.latched);assert.equal(b.snapshot().types.pong,2000);for(const n of ['teleport_confirm','configuration_acknowledged','finish_configuration','login_acknowledged','chunk_batch_received','window_confirmation'])assert(CRITICAL.test(n));});
 await test('manual new run resets latch, disabled does not apply guards',()=>{const b=new PacketBudget();for(let i=0;i<3;i++)b.inspect('block_place',true);assert(b.latched);assert(b.inspect('block_place',false));b.begin();assert(b.inspect('block_place',true));});
 await test('pacer coalesces latest position AND angles, copied data',async()=>{
  const sent=[],p=new MotionPacer((n,v)=>sent.push({n,v,t:Date.now()}),{gap:55});p.offer('look',{yaw:1,pitch:2,onGround:true});
  const pos={x:2,y:3,z:4,onGround:true,flags:{onGround:true}};p.offer('position',pos);pos.x=999;pos.flags.onGround=false;p.offer('look',{yaw:5,pitch:6,onGround:true});
  await sleep(75);assert.equal(sent.length,2);assert(sent[1].t-sent[0].t>=50);assert.equal(sent[1].n,'position_look');assert.equal(sent[1].v.x,2);assert.equal(sent[1].v.pitch,6);assert.equal(sent[1].v.flags.onGround,true);p.close();
 });
 await test('pacer cancel and close cannot replay stale position',async()=>{let count=0;const p=new MotionPacer(()=>count++);p.offer('look',{yaw:1,pitch:1});p.offer('look',{yaw:2,pitch:2});p.cancel();await sleep(70);assert.equal(count,1);p.offer('look',{yaw:3,pitch:3});p.offer('look',{yaw:4,pitch:4});p.close();await sleep(70);assert.equal(count,2);p.offer('look',{yaw:5,pitch:5});assert.equal(count,2);});
 await test('real BotManager pauses BEFORE offending placement and retains heartbeat',()=>{
  const f=fixture();try{for(let i=0;i<3;i++)f.c.write('block_place',{location:{x:i,y:65,z:0},direction:1});
   assert.equal(f.sent.filter(p=>p.name==='block_place').length,2);assert.equal(f.m.autoBuild.reason,'packet_guard');assert.equal(f.m.autoBuild.status,'paused');assert.equal(f.m.autoBuild.resume().error,'packet_cooldown');
   f.c.write('pong',{id:123});f.c.write('keep_alive',{keepAliveId:456});assert.deepEqual(f.sent.at(-2).params,{id:123});assert.deepEqual(f.sent.at(-1).params,{keepAliveId:456});assert(f.lines.some(x=>x.kind==='packet_guard'));
  }finally{f.close();}
 });
 await test('real wire view observed only AFTER scheduled motion',async()=>{
  const f=fixture();try{let seen=0;f.b.on('kb:view-sent',()=>seen++);f.c.write('look',{yaw:1,pitch:2});f.c.write('look',{yaw:3,pitch:4});assert.equal(seen,1);await sleep(65);assert.equal(seen,2);assert.equal(f.b.__kbLastView.pitch,4);
   f.c.write('look',{yaw:5,pitch:6});f.c.emit('position',{});const before=seen;await sleep(65);assert.equal(seen,before);
  }finally{f.close();}
 });
 await test('queued motion cleared by Pause and disconnect',async()=>{
  const f=fixture();f.c.write('look',{yaw:1,pitch:2});f.c.write('look',{yaw:3,pitch:4});f.m.autoBuild.pause('manual');await sleep(65);assert.equal(f.sent.filter(p=>p.name==='look').length,1);f.close();assert.equal(f.m._motionPacer,null);
 });
 await test('discarded motion no longer extends legacy window',()=>{
  const f=fixture(),orig=Date.now;try{f.m.autoBuild.status='stopped';let now=10000;Date.now=()=>now;for(let i=0;i<27;i++)f.c.write('look',{yaw:i,pitch:0});now+=10;for(let i=0;i<50;i++)f.c.write('look',{yaw:90,pitch:90});assert.equal(f.m._posLog.length,27);assert(f.m._posLog.every(t=>t===10000));now=11001;f.c.write('look',{yaw:2,pitch:3});assert.equal(f.sent.length,28);}finally{Date.now=orig;f.close();}
 });
 await test('diagnostic allowlist strips private fields and payloads',()=>{
  const out=clean({phase:'walk',sent:1,accessToken:'SECRET',password:'SECRET',chat:'/login SECRET',host:'SECRET',params:{token:'SECRET'},types:{position_look:5,'/login SECRET':99}});assert.deepEqual(out,{phase:'walk',sent:1,types:{position_look:5}});assert(!JSON.stringify(out).includes('SECRET'));
 });
 await test('same live held stack needs no equip packets',async()=>{
  const f=fixture();try{const item={name:'stone',count:64};f.b.heldItem=item;let equips=0;f.b.equip=async()=>equips++;await f.m.autoBuild.boundedEquip(item,f.m.autoBuild.epoch);assert.equal(equips,0);f.b.heldItem={name:'dirt',count:1};await f.m.autoBuild.boundedEquip(item,f.m.autoBuild.epoch);assert.equal(equips,1);}finally{f.close();}
 });
 await test('server correction keeps its fresh response, discards old motion',async()=>{
  const f=fixture();try{f.c.write('look',{yaw:1,pitch:2});f.c.write('look',{yaw:3,pitch:4});f.c.on('position',()=>f.c.write('look',{yaw:90,pitch:45}));f.c.emit('position',{});await sleep(65);assert.equal(f.sent.length,2);assert.equal(f.sent[1].params.yaw,90);}finally{f.close();}
 });
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'client113-'));
 try{
  await test('safety migration preserves build/account settings and opt-in persists',()=>{
   const vm=require('vm'),{createRequire}=require('module'),filename=path.resolve(__dirname,'../src/main/store.js'),req=createRequire(filename),mod={exports:{}},sub=path.join(dir,'store');fs.mkdirSync(sub);
   fs.writeFileSync(path.join(sub,'config.json'),JSON.stringify({__featMigrated:true,__packMigrated:true,accounts:{list:[{id:'one',username:'Tester',type:'offline'}]},autoBuild:{perAccount:{one:{corner1:{x:1,y:65,z:2},corner2:{x:30,y:65,z:21},block:'stone',rescueOwn:true,fastWalk:true}}}}));
   vm.runInNewContext(fs.readFileSync(filename,'utf8'),{require:n=>n==='electron'?{app:{getPath:()=>sub},safeStorage:{isEncryptionAvailable:()=>false}}:req(n),module:mod,exports:mod.exports,Buffer,console,setTimeout,clearTimeout});
   const Store=mod.exports.Store,st=new Store();assert.equal(st.get().autoBuild.perAccount.one.fastWalk,false);assert.equal(st.get().autoBuild.perAccount.one.corner2.x,30);assert.equal(st.get().autoBuild.perAccount.one.rescueOwn,true);assert.equal(st.get().accounts.list[0].username,'Tester');
   st.get().autoBuild.perAccount.one.fastWalk=true;st.saveNow();const again=new Store();assert.equal(again.get().autoBuild.perAccount.one.fastWalk,true);
  });
  await test('persistent records survive close and retain last pause',async()=>{
   const d=new DiagnosticLog(dir);d.record('autobuild',{phase:'paused',reason:'packet_guard',password:'SECRET'});await d.close();const s=fs.readFileSync(d.file,'utf8');assert(s.includes('packet_guard'));assert(!s.includes('SECRET'));assert(JSON.parse(s.trim()).time);
  });
  await test('three bounded rotation files and bounded queue',async()=>{
   const sub=path.join(dir,'rotate'),d=new DiagnosticLog(sub,{maxBytes:500,maxQueue:5});for(let i=0;i<30;i++)d.record('packet_window',{sent:i});assert.equal(d.queue.length,5);await d.flush();
   for(let i=0;i<40;i++){d.record('autobuild',{phase:'walk',placed:String(i)});await d.flush();}await d.close();const files=fs.readdirSync(sub);assert.equal(files.length,3);for(const name of files){const s=fs.readFileSync(path.join(sub,name));assert(s.length<=500);for(const line of s.toString().trim().split('\n'))JSON.parse(line);}assert(fs.readFileSync(d.file,'utf8').includes('39'));
  });
  await test('disk failure does not crash or spin',async()=>{const file=path.join(dir,'not-directory');fs.writeFileSync(file,'x');let errors=0;const d=new DiagnosticLog(file,{onError:()=>errors++});d.record('network',{rx:1});await d.close();assert.equal(errors,1);assert(d.disabled);assert.equal(d.queue.length,0);});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
 console.log(`Packet watchdog/pacer/persistence tests passed: ${passed} scenarios.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});