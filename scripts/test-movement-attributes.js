'use strict';
const assert=require('assert'),{world}=require('./test-build-local'),{PlayerState}=require('prismarine-physics');
const {surfacePhysics}=require(process.env.ATTRIBUTE_CLIENT_ROOT?process.env.ATTRIBUTE_CLIENT_ROOT+'/src/main/bot/auto-build':'../src/main/bot/auto-build');
function trace(version,floor,alias,prop,sprint=false){
 const w=world(floor,version),b=w.b,restore=surfacePhysics(b),key=alias?'generic.movement_speed':b.physics.movementSpeedAttribute;
 // Crops really occupy the garden: not an empty-soil shortcut.
 if(floor==='slow')for(let x=-18;x<=44;x++)for(let z=-14;z<=14;z++)b.put(b.entity.position.floored().offset(x,1,z),'nether_wart');
 b.entity.attributes={[key]:structuredClone(prop)};const before=JSON.stringify(b.entity.attributes),points=[];
 b.controlState.forward=true;b.controlState.sprint=sprint;
 try{for(let i=0;i<80;i++){const prev=b.entity.position.clone();b.physics.simulatePlayer(new PlayerState(b,b.controlState),{getBlock:p=>b.blockAt(p,false)}).apply(b);points.push(b.entity.position.distanceTo(prev));}
 if(version!=='1.20.1')assert.equal(JSON.stringify(b.entity.attributes),before,'hypothetical/native simulation must not mutate live server modifiers');
 }finally{restore();w.stop();}return points;
}
let passed=0;
for(const version of ['1.21.4','26.1'])for(const floor of ['flat','slow'])for(const sprint of [false,true])for(const prop of [
 {value:.04,modifiers:[]},
 {value:.08,modifiers:[{uuid:'server:add',operation:0,amount:.01},{uuid:'server:base',operation:1,amount:-.2},{uuid:'server:total',operation:2,amount:-.15}]},
 {value:.08,modifiers:[{uuid:'minecraft:sprinting',operation:2,amount:.3}]}
]){
 const normalized=structuredClone(prop);normalized.modifiers=normalized.modifiers.filter(m=>m.uuid!=='minecraft:sprinting');
 const expected=trace('1.20.1',floor,false,normalized,sprint),actual=trace(version,floor,true,prop,sprint);
 for(let i=0;i<actual.length;i++)assert(Math.abs(expected[i]-actual[i])<1e-8,`${version} ${floor} sprint=${sprint} server speed ignored at tick ${i}: ${actual[i]} != ${expected[i]}`);
 passed++;
}
console.log(`Server movement attribute tests passed: ${passed} independent 80-tick traces, crops, base/three operations, sprint removal, no server mutation.`);
