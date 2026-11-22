'use strict';
const assert=require('assert');const {BuildRows}=require('../src/main/bot/build-rows');const {AutoBuild,region}=require('../src/main/bot/auto-build');const {Vec3}=require('vec3');let passed=0;
for(const axis of ['x','z'])for(const low of [true,false])for(const width of [1,2,4]){
 const r=region({x:-3,y:85,z:-2},{x:4,y:85,z:3}),entry=new Vec3(low?-5:7,83.875,low?-5:7),a=new BuildRows(r,entry,{axis,low});
 r.max[a.cross]=r.min[a.cross]+width-1;r.layer=BigInt((r.max.x-r.min.x+1)*(r.max.z-r.min.z+1));a.width=BigInt(width);
 const cells=Array.from({length:Number(r.layer)},(_,i)=>a.cell(BigInt(i),85));assert.equal(new Set(cells.map(p=>`${p.x},${p.z}`)).size,cells.length);assert.equal(a.cell(r.layer,85),null);
 for(let i=0;i<cells.length;i++){const p=cells[i];assert.equal(a.index(p),BigInt(i));assert.deepEqual(a.next(p),cells[i+1]||null);const q=a.stance(p);assert(a.allowed(p,new Vec3(q.x,83.875,q.z)));if(i&&a.describe(p).band===a.describe(cells[i-1]).band&&p[a.cross]===cells[i-1][a.cross])assert.equal(p[a.depth]-cells[i-1][a.depth],a.sign);}
 passed++;
}
for(const axis of ['x','z'])for(const sign of [1,-1]){
 const r=region({x:0,y:85,z:0},{x:8,y:85,z:6}),a=new BuildRows(r,new Vec3(-2,83,.5),{axis,low:true});a.anchor=3;a.crossSign=sign;
 for(let i=0n;i<r.layer;i++){const p=a.cell(i,85);assert.equal(a.index(p),i);}
 const last=a.cell(3n*a.width-1n,85),first=a.cell(3n*a.width,85);assert.equal(last[a.cross],first[a.cross]);passed++;
}
const r=region({x:0,y:85,z:0},{x:11,y:85,z:5}),a=new BuildRows(r,new Vec3(-1.5,83.875,.5),{axis:'x',low:true}),p=a.cell(0n,85);
assert(!a.allowed(p,new Vec3(11.5,83.875,1.5)),'interior behind strip is forbidden');passed++;
assert(!a.allowed(p,new Vec3(8.5,86,0.5)),'new roof stance forbidden');passed++;
assert(!a.routeAllowed(p,new Vec3(10.5,83.875,1.5),new Vec3(8.5,83.875,.5)),'no cutting back through completed interior');passed++;
assert(a.routeAllowed(p,new Vec3(-4.5,86,.5),new Vec3(-5.5,85,.5)),'native approach jump outside the work area remains allowed');passed++;
assert(!a.routeAllowed(p,new Vec3(8.5,86,1.5),new Vec3(8.5,85,.5)),'new roof inside work area is not a transit shortcut');passed++;
assert(a.routeAllowed(p,new Vec3(8.5,83.875,1.5),new Vec3(8.5,83.875,.5)));passed++;
const seed={column:0,side:1};assert(a.allowed({x:2,y:85,z:0},new Vec3(2.5,83.875,1.5),seed));assert(!a.allowed({x:2,y:85,z:0},new Vec3(2.5,83.875,.5),seed));passed++;
const b=new AutoBuild(null);b.Vec3=Vec3;b.bot={blockAt:q=>{const v=q.floored();const floor=v.y===83,roof=v.y===85;return {name:floor?'soul_sand':roof?'stone':'air',shapes:floor?[[0,0,0,1,.875,1]]:roof?[[0,0,0,1,1,1]]:[]};}};
assert(!b.bodyClear(new Vec3(.5,83.875,.5)),'fractional floor plus Y+2 roof intersects head');passed++;
b.bot.blockAt=q=>{const v=q.floored();return {name:v.y===82||v.y===85?'stone':'air',shapes:v.y===82||v.y===85?[[0,0,0,1,1,1]]:[]};};assert(b.bodyClear(new Vec3(.5,83,.5)));passed++;
const huge=region({x:-29999983,y:-64,z:-29999983},{x:29999983,y:319,z:29999983}),h=new BuildRows(huge,new Vec3(0,0,0),{axis:'z',low:true});for(const i of [0n,1n,huge.layer/2n,huge.layer-1n])assert.equal(h.index(h.cell(i,3)),i);assert(!Object.values(h).some(Array.isArray));passed++;
console.log(`Aligned strip/body/route tests passed: ${passed} scenarios.`);
