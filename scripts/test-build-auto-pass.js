'use strict';
const assert=require('assert'),fs=require('fs'),{EventEmitter}=require('events'),{Vec3}=require('vec3');
const pass=require('../src/main/bot/build-auto-pass');
const realNow=Date.now,realSet=setTimeout,realClear=clearTimeout;
let now=10000,id=0,timers=new Map(),cases=0;
Date.now=()=>now;global.setTimeout=(fn,ms)=>{const k=++id;timers.set(k,{fn,at:now+ms});return k;};global.clearTimeout=k=>timers.delete(k);
function advance(ms){const end=now+ms;for(;;){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();}now=end;}
function setup(){
 const bot=new EventEmitter();bot.entity={position:new Vec3(.5,.875,.5),velocity:new Vec3(0,-.078,0),onGround:true};
 const a={bot,epoch:1,autoPass:true,solidPattern:true,status:'paused',reason:'server_corrections',movementHoldUntil:now+3000,worker:{},bodyClear:()=>true,safeFooting:()=>true,notify:()=>{},diagnostic:()=>{},resumes:0,resume(){this.resumes++;this.status='running';return {ok:true};}};
 return a;
}
function test(fn){const a=setup();try{fn(a);cases++;}finally{pass.cancel(a);timers.clear();}}
try{
 test(a=>{a.autoPass=false;assert(!pass.queue(a));advance(8000);assert.equal(a.resumes,0);});
 test(a=>{assert(pass.queue(a));a.worker=null;advance(2999);assert.equal(a.resumes,0);advance(101);assert.equal(a.resumes,1);assert(!a.autoPassTask);assert.equal(a.bot.listenerCount('forcedMove'),0);});
 test(a=>{pass.queue(a);advance(3100);assert.equal(a.resumes,0);a.worker=null;advance(100);assert.equal(a.resumes,1);});
 for(const reason of ['manual','server_teleport','server_refused','permission_denied','placement_timeout','packet_cooldown','world_changed'])test(a=>{a.reason=reason;assert(!pass.queue(a));assert.equal(a.resumes,0);});
 test(a=>{a.solidPattern=false;assert(!pass.queue(a));});
 test(a=>{pass.queue(a);assert(pass.set(a,false).ok);a.worker=null;advance(4000);assert.equal(a.resumes,0);assert.equal(a.bot.listenerCount('forcedMove'),0);});
 test(a=>{a.worker=null;pass.queue(a);advance(3100);a.status='paused';assert(!pass.queue(a));assert.equal(a.autoPassStatus,'limit');advance(60100);a.movementHoldUntil=now;assert(pass.queue(a));advance(700);assert.equal(a.resumes,2);});
 test(a=>{pass.queue(a);a.worker=null;a.bot.emit('forcedMove');advance(4000);assert.equal(a.resumes,0);assert.equal(a.autoPassStatus,'position_changed');});
 test(a=>{pass.queue(a);a.worker=null;a.epoch++;advance(4000);assert.equal(a.resumes,0);});
 test(a=>{pass.queue(a);a.worker=null;a.status='stopped';advance(4000);assert.equal(a.resumes,0);});
 test(a=>{pass.queue(a);a.worker=null;a.bot.currentWindow={};advance(4000);assert.equal(a.resumes,0);});
 test(a=>{pass.queue(a);a.worker=null;a.safeFooting=()=>false;advance(10500);assert.equal(a.resumes,0);assert.equal(a.autoPassStatus,'timeout');});
 test(a=>{pass.queue(a);a.worker=null;a.bot.entity.onGround=false;advance(10500);assert.equal(a.resumes,0);});
 test(a=>{a.worker=null;a.movementHoldUntil=now;pass.queue(a);advance(300);a.bot.entity.position.x+=.15;advance(300);assert.equal(a.resumes,0);advance(300);assert.equal(a.resumes,1);});
 test(a=>{assert(!pass.set(a,'true').ok);});
 // Cross-layer wiring, default OFF and location below the four controls.
 const root=__dirname+'/..',html=fs.readFileSync(root+'/src/renderer/index.html','utf8');
 assert(html.indexOf('id="ab-auto-pass"')>html.indexOf('id="ab-stop"'));
 assert(!html.match(/id="ab-auto-pass"[^>]*checked/));
 const {AutoBuild}=require('../src/main/bot/auto-build');assert.equal(new AutoBuild(null).state().autoPass,false);
 const source=fs.readFileSync(root+'/src/main/bot/auto-build.js','utf8');assert(source.includes("require('./build-auto-pass').queue(this)"));assert(source.includes("require('./build-auto-pass').cancel(this,'cancelled')"));
 console.log(`Automatic pass tests passed: ${cases+1} cases; default OFF, checkbox below controls, unchanged cooldown, worker and stable loaded footing, one Resume/60s, second correction/forced move cancels, unrelated errors/crops remain paused, disable/stop/epoch/window/timeout cancel.`);
}finally{Date.now=realNow;global.setTimeout=realSet;global.clearTimeout=realClear;}
