'use strict';
// Real Prismarine chunk layouts; entirely local/in-memory, no game login.
const assert=require('assert');
const {EventEmitter}=require('events');
const {performance}=require('perf_hooks');
const {Vec3}=require('vec3');
const SpawnerIndex=require('../src/main/bot/spawner-index');
async function main(){
 for(const version of ['1.8','1.16.5','1.20.1','1.21.4']){
  const registry=require('prismarine-registry')(version),Chunk=require('prismarine-chunk')(registry),World=require('prismarine-world')(registry);
  const bot=new EventEmitter();bot.registry=registry;bot._client=new EventEmitter();bot.entity={position:new Vec3(0,65,0)};
  const minY=version==='1.8'||version==='1.16.5'?0:-64,height=minY===0?256:384;bot.game={minY,height};
  bot.supportFeature=(f)=>registry.supportFeature(f);bot.world=new World(null,null).sync;
  require('mineflayer/lib/plugins/blocks')(bot,{version,hideErrors:true});
  const block=registry.blocksByName.spawner||registry.blocksByName.mob_spawner;assert(block);
  const expected=[];
  for(let x=-6;x<=6;x++)for(let z=-6;z<=6;z++){
   const c=new Chunk({minY,worldHeight:height});
   // Simulate terrain palettes in each loaded section, plus some spawners.
   for(let y=minY;y<minY+height;y+=16)c.setBlockStateId(new Vec3(0,y,0),registry.blocksByName.stone.minStateId);
   if((x+z)%7===0){c.setBlockStateId(new Vec3(1,65,1),block.minStateId);const p=new Vec3(x*16+1,65,z*16+1);if(p.distanceTo(bot.entity.position)<=150)expected.push(p);}
   bot.world.setColumn(x,z,c);
  }
  const baselineStart=performance.now();const native=bot.findBlocks({point:bot.entity.position,matching:b=>b&&['spawner','mob_spawner'].includes(b.name),maxDistance:150,count:512});const nativeMs=performance.now()-baselineStart;
  const expectedKeys=new Set(expected.map(p=>`${p.x},${p.y},${p.z}`));
  assert(native.every(p=>expectedKeys.has(`${p.x},${p.y},${p.z}`))); // Native octahedron can omit sphere corners.
  const index=new SpawnerIndex(bot),start=performance.now();let beats=0;const beat=setInterval(()=>beats++,1);
  try{
   assert(await index.whenIdle());const initialMs=performance.now()-start;
   const indexed=index.query(bot.entity.position,bot.entity.position,150);assert.equal(indexed.length,expected.length);
   const key=p=>`${p.x},${p.y},${p.z}`;assert.deepStrictEqual(indexed.map(key).sort(),expected.map(key).sort());
   assert(native.every(p=>indexed.some(q=>key(p)===key(q))));
   const before=index.stats.slices,reads=index.stats.blocksRead,queryStart=performance.now();
   for(let i=0;i<100;i++)index.query(bot.entity.position,bot.entity.position,150);
   const queryMs=performance.now()-queryStart;assert.equal(index.stats.slices,before);assert.equal(index.stats.blocksRead,reads);
   assert(beats>0,'event loop must run while indexing');
   // Updates/unload verified with real chunk state IDs, including older layouts.
   const point=new Vec3(2,65,2),col=bot.world.getColumn(0,0);col.setBlockStateId(point,block.minStateId);
   bot.emit('blockUpdate',null,{name:block.name,position:point});assert(index.query(point,point,150).some(p=>key(p)===key(point)));
   col.setBlockStateId(point,0);bot.emit('blockUpdate',null,{name:'air',position:point});assert(!index.query(point,point,150).some(p=>key(p)===key(point)));
   console.log(JSON.stringify({version,columns:169,spawners:indexed.length,nativeBlockingScanMs:+nativeMs.toFixed(2),initialIndexTotalMs:+initialMs.toFixed(2),slices:index.stats.slices,maxSliceMs:+index.stats.maxSliceMs.toFixed(2),hundredCachedQueriesMs:+queryMs.toFixed(2),timerBeatsDuringIndex:beats}));
  }finally{clearInterval(beat);index.stop();}
 }
 console.log('Real chunk layout/performance tests passed: 4 versions.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
