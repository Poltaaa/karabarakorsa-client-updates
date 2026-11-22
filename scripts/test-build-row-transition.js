'use strict';
const assert=require('assert'),{BuildRows}=require('../src/main/bot/build-rows');
const {adjacentRow}=require('../src/main/bot/build-strafe');
const {AutoBuild}=require('../src/main/bot/auto-build'),{world}=require('./test-build-local'),{Vec3}=require('vec3');
let passed=0;
for(const depth of ['x','z'])for(const low of [true,false])for(const length of [3,4,5,6,7,8]){
 const cross=depth==='x'?'z':'x',area={min:{x:0,y:69,z:0},max:{x:4,y:69,z:4}};
 area.max[depth]=length-1;area.layer=BigInt(length*5);
 const rows=new BuildRows(area,{x:-1,z:-1},{axis:depth,low});
 const filled=new Set(),repairs=new Map();
 const a={rows,safety:{repairs},vec:p=>p,bot:{blockAt:p=>filled.has(`${p.x},${p.y},${p.z}`)?{name:'soul_sand'}:{name:'air'}}};
 for(let band=0;band<Math.ceil(length/3);band++){
  const first=BigInt(band)*15n,len=rows.describe(rows.cell(first,69)).len;
  const old=rows.cell(first+BigInt(len-1),69),p=rows.cell(first+BigInt(len),69);
  a.lastRowCell=old;assert(adjacentRow(a,p));passed++;
  if(len>1){
   a.lastRowCell=rows.cell(first+BigInt(len-2),69);
   assert(!adjacentRow(a,p),'empty near cell must not be skipped');
   filled.add(`${old.x},${old.y},${old.z}`);assert(adjacentRow(a,p),'filled near cell keeps shortcut');
   const far=p,next=rows.cell(first+BigInt(len+1),69);filled.add(`${far.x},${far.y},${far.z}`);
   assert(adjacentRow(a,next),'filled far cell keeps shortcut');
   repairs.set(`${old.x},${old.y},${old.z}`,{});assert(!adjacentRow(a,next),'outstanding repair is not a skip');repairs.clear();
   const blockAt=a.bot.blockAt;
   a.bot.blockAt=q=>q[depth]===old[depth]&&q[cross]===old[cross]?null:blockAt(q);
   assert(!adjacentRow(a,next),'unknown skipped cell rejects shortcut');a.bot.blockAt=blockAt;passed+=5;
  }
  assert(!adjacentRow(a,{...p,y:70}),'another Y layer');passed++;
 }
}
for(const depth of ['x','z']){
 const w=world('slow','26.1'),a=new AutoBuild(null),cross=depth==='x'?'z':'x';
 try{
  a.bot=w.b;a.Vec3=Vec3;a.block={name:'soul_sand'};a.rows={cross};a.seedPlan=null;
  w.b.put(new Vec3(0,2,0),'soul_sand');
  const p={x:0,y:2,z:0};p[depth]=1;
  for(const [position,cursor] of [[.02,.06],[.5,.5],[.98,.94],[2.5,.94]]){
   w.b.entity.position[cross]=position;
   const ref=a.references(p).find(r=>r.ref.position.equals(new Vec3(0,2,0)));
   assert(ref,'loaded real support');assert(Math.abs(ref.delta[cross]-cursor)<1e-8,'cursor stays inside actual face with edge margin');
   assert.equal(ref.delta.y,.4375,'soul sand real-height face remains exact');passed++;
  }
  a.rows=null;const ref=a.references(p).find(r=>r.ref.position.equals(new Vec3(0,2,0)));
  assert.equal(ref.delta[cross],.5,'ordinary/non-strip placement keeps centre cursor');passed++;
 }finally{w.stop();}
}
console.log(`Adjacent-strip/cursor tests passed: ${passed} checks, both axes/signs, full/1/2-cell tails, occupied/unknown/repair/layer safety, exact real-shape cursor.`);