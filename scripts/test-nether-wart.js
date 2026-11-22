'use strict';
// Small dependency-free regression checks: actual selected crop, support and
// collision/clearance rules. Real packet/pathfinder coverage is a separate test.
const assert = require('assert');
const { AutoBuild } = require('../src/main/bot/auto-build');
class Vec {
  constructor(x,y,z){Object.assign(this,{x,y,z});}
  offset(x,y,z){return new Vec(this.x+x,this.y+y,this.z+z);}
  plus(v){return this.offset(v.x,v.y,v.z);} minus(v){return this.offset(-v.x,-v.y,-v.z);}
  scaled(n){return new Vec(this.x*n,this.y*n,this.z*n);} norm(){return Math.hypot(this.x,this.y,this.z);}
  equals(v){return this.x===v.x&&this.y===v.y&&this.z===v.z;} floored(){return new Vec(Math.floor(this.x),Math.floor(this.y),Math.floor(this.z));}
}
const a = new AutoBuild(); a.Vec3 = Vec; a.block={name:'nether_wart'};
const map=new Map([['0,65,0','soul_sand']]);
a.bot={entity:{position:new Vec(.5,65.875,.5)},blockAt:p=>{
 p=p.floored();const name=map.get(`${p.x},${p.y},${p.z}`)||'air';
 const empty=['air','nether_wart'].includes(name);
 return {name,position:p,boundingBox:empty?'empty':'block',shapes:empty?[]:[[0,0,0,1,name==='soul_sand'?.875:1,1]]};
}};
const target={x:0,y:66,z:0};let tests=0;
assert.equal(a.planting,true);assert.equal(a.collision(target),false);tests++;
a.block={name:'stone'};assert.equal(a.collision(target),true);tests++;a.block={name:'nether_wart'};
const refs=a.references(target);assert.equal(refs.length,1);assert.equal(refs[0].ref.name,'soul_sand');assert.deepEqual(refs[0].face,new Vec(0,1,0));tests++;
assert.equal(refs[0].delta.y,.875);assert.equal(refs[0].aim.y,65.875);assert.equal(refs[0].aim.x,.5);assert.equal(refs[0].aim.z,.5);tests++;
assert(a.usable(target,refs),'planting at feet must be usable');tests++;
map.set('0,66,0','nether_wart');assert(a.clearance(target));assert(!a.air(target),'existing crop is not air and must be preserved');tests++;
map.set('0,66,0','stone');assert(!a.clearance(target));tests++;map.delete('0,66,0');
map.set('0,65,0','soul_soil');assert.throws(()=>a.references(target),e=>e.code==='wart_soil');tests++;
map.set('0,65,0','stone');map.set('1,66,0','soul_sand');assert.throws(()=>a.references(target),e=>e.code==='wart_soil');tests++;
map.delete('0,65,0');assert.throws(()=>a.plantingSupport(target),e=>e.code==='wart_soil');tests++;
a.bot.blockAt=()=>null;assert.throws(()=>a.plantingSupport(target),e=>e.code==='chunk_unloaded');tests++;
console.log(`Nether wart support/collision regression tests passed: ${tests} scenarios.`);
