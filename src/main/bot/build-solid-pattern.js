'use strict';
const {BuildRows}=require('./build-rows');
// Fixed corner -> three far-to-near cells -> next column -> retreat 3.
// No seed line, frontier, random stance, dig, or synthetic movement.
class SolidPattern extends BuildRows {
 constructor(area,entry,corner,depth){
  super(area,entry,{axis:depth,low:corner[depth]===area.max[depth]});
  this.far=corner[depth];this.sign=this.far===area.min[depth]?1:-1;
  this.crossSign=corner[this.cross]===area.min[this.cross]?1:-1;
  this.corner={...corner};
 }
 terminal(p){const d=this.describe(p);return d.band*3+d.len>=Number(this.length);}
 last(y){return this.cell(this.area.layer-1n,y);}
 stance(p){
  const d=this.describe(p);
  if(!this.terminal(p))return {[this.depth]:d.near+this.sign+ .5,[this.cross]:p[this.cross]+.5};
  // In the final band stand in its still-open near row. Before closing a
  // column's near cell step sideways into the NEXT column, leaving a corridor.
  let c=p[this.cross];
  if(p[this.depth]===d.near){
   const next=c+this.direction(d.band);
   if(next>=this.area.min[this.cross]&&next<=this.area.max[this.cross])c=next;
   else return {[this.depth]:d.near+this.sign+.5,[this.cross]:c+.5};
  }
  return {[this.depth]:d.near+.5,[this.cross]:c+.5};
 }
 allowed(p,pos){const q=this.stance(p);return pos.y<=p.y+.001&&Math.abs(pos.x-q.x)<=.12&&Math.abs(pos.z-q.z)<=.12;}
 routeAllowed(p,pos){return this.transitAllowed(p,pos);}
}
function handoffGoal(a,y){
 const p=a.rows.last(y),q={x:p.x+.5,z:p.z+.5};
 return {isEnd:pos=>pos.y<=p.y+.001&&Math.abs(pos.x-q.x)<=.12&&Math.abs(pos.z-q.z)<=.12,
  heuristic:pos=>Math.abs(pos.x-q.x)+Math.abs(pos.z-q.z)+Math.max(0,pos.y-p.y),
  route:pos=>a.rows.transitAllowed(p,pos)};
}
function jobKey(a){
 return JSON.stringify({block:a.block.name,min:a.area.min,max:a.area.max,version:a.bot.version,
  dimension:a.bot.game?.dimension,minY:a.bot.game?.minY,height:a.bot.game?.height});
}
function rememberPattern(a){
 if(!a.solidPattern||!a.patternReady||!a.bot)return;
 a.patternCheckpoint={bot:a.bot,key:jobKey(a),corner:{...a.rows.corner},depth:a.rows.depth,lastPlaceAt:a.lastPlaceAt};
}
function restorePattern(a){
 const c=a.patternCheckpoint;
 if(!a.solidPattern||!c||c.bot!==a.bot||c.key!==jobKey(a)){a.patternCheckpoint=null;return false;}
 a.rows=new SolidPattern(a.area,a.bot.entity.position,c.corner,c.depth);a.patternReady=true;
 if(Number.isFinite(c.lastPlaceAt))a.lastPlaceAt=Math.max(a.lastPlaceAt??-Infinity,c.lastPlaceAt);
 a.diagnostic('solid checkpoint restored','corner='+JSON.stringify(c.corner)+' depth='+c.depth);
 return true;
}
async function firstPending(a,rows,token,startY=a.area.min.y,endY=a.area.max.y){
 let slice=Date.now(),prefix=0n;
 for(let y=startY;y<=endY;y++)for(let i=0n;i<a.area.layer;i++){
  a.check(token);
  if(Date.now()-slice>=2){await new Promise(r=>setTimeout(r,0));a.check(token);slice=Date.now();}
  const p=rows.cell(i,y),b=a.bot.blockAt(a.vec(p));
  if(!b)throw a.error('chunk_unloaded');
  // The explicitly manual last cell is not a new automatic placement.
  if(y===a.area.max.y&&i===a.area.layer-1n)return {p,index:i,y,prefix,manual:true,filled:!a.air(p)};
  if(a.air(p))return {p,index:i,y,prefix,manual:false};
  prefix++;
 }
 return null;
}
async function choosePattern(a,token){
 const r=a.area,b=a.bot,candidates=[];let unknown=false;
 for(const x of new Set([r.min.x,r.max.x]))for(const z of new Set([r.min.z,r.max.z]))for(const depth of ['x','z']){
  a.check(token);const corner={x,y:r.min.y,z},rows=new SolidPattern(r,b.entity.position,corner,depth);
  let next;try{next=await firstPending(a,rows,token);}catch(e){if(e.code!=='chunk_unloaded')throw e;unknown=true;continue;}
  if(!next)continue;
  const p=next.p;
  // Evaluate the FIRST EMPTY target, not the old corner or its now-roofed
  // standing tile. This also works for a prefilled area with no checkpoint.
  if(!next.manual&&!a.references(p).length)continue;
  const q=next.manual?{x:p.x+.5,z:p.z+.5}:rows.stance(p),stands=a.patternStands(p,q);
  if(!stands.length&&!next.manual)continue;
  candidates.push({rows,next,score:Math.hypot(q.x-b.entity.position.x,q.z-b.entity.position.z)});
 }
 // A completed prefix is stronger evidence of an existing traversal than
 // proximity to a filled corner. Ties use the current reachable work point.
 candidates.sort((x,y)=>x.next.prefix===y.next.prefix?x.score-y.score:x.next.prefix>y.next.prefix?-1:1);
 if(!candidates.length)throw a.error(unknown?'chunk_unloaded':'pattern_corner_unavailable');
 a.rows=candidates[0].rows;a.patternReady=true;rememberPattern(a);
 a.diagnostic('solid corner','corner='+JSON.stringify(a.rows.corner)+' depth='+a.rows.depth+' sign='+a.rows.sign+' firstPending='+JSON.stringify(candidates[0].next.p));
}
async function runSolidPattern(a,token){
 await a.settle(token);a.check(token);
 if(!a.patternReady)await choosePattern(a,token);
 while(a.layerY<=a.area.max.y){
  let slice=Date.now(),placedHere=false;const y=a.layerY,last=a.rows.last(y),reserve=y===a.area.max.y;
  // Read-only reconciliation on every launch: a late ACK or external fill
  // after Pause is skipped; a previously filled block removed during Pause
  // is not silently missed. No walk is issued during this scan.
  const pending=await firstPending(a,a.rows,token,y,y);
  const from=pending?.index??a.area.layer;
  a.patternNext=from;a.diagnostic('solid continue','index='+from+' target='+JSON.stringify(pending?.p||null));
  for(let i=from;i<a.area.layer;i++){
   a.patternNext=i;
   a.check(token);const p=a.rows.cell(i,y);a.target=p;
   if(Date.now()-slice>=2){await new Promise(r=>setTimeout(r,0));a.check(token);slice=Date.now();}
   const b=a.bot.blockAt(a.vec(p));if(!b)throw a.error('chunk_unloaded');
   if(reserve&&i===a.area.layer-1n)continue;
   if(!a.air(p))continue;
   if(!a.references(p).length)throw a.error('no_support');
   if(await a.placeOne(p,token))placedHere=true;a.patternNext=i+1n;rememberPattern(a);
  }
  // Verify real world occupancy. Only the expressly reserved final cell may
  // remain empty; never count a refusal or a different missed cell as done.
  let manual=false;
  for(let i=0n;i<a.area.layer;i++){
   a.check(token);if(Date.now()-slice>=2){await new Promise(r=>setTimeout(r,0));slice=Date.now();}
   const p=a.rows.cell(i,y),b=a.bot.blockAt(a.vec(p));if(!b)throw a.error('chunk_unloaded');
   if(a.air(p)){if(reserve&&i===a.area.layer-1n)manual=true;else throw a.error('unreachable_cells');}
  }
  if(reserve&&manual){
   a.target=last;a.setPhase('manual_handoff');
   await a.patternWalk(last,token,{x:last.x+.5,z:last.z+.5});await a.settle(token);a.check(token);
   if(!a.bodyClear(a.bot.entity.position)||!a.safeFooting(a.bot.entity.position)||!handoffGoal(a,y).isEnd(a.bot.entity.position))throw a.error('unsafe_stance');
   a.manualRemaining=1;a.manualTarget={...last};
  }else if(placedHere&&a.safety.inside(a.bot.entity.position)){
   const exit=await a.safety.plan(token);if(!exit)throw a.error('escape_unverified');await a.safety.exit(exit,token);
  }
  const net=a.placed-a.layerBasePlaced,done=a.area.layer-(manual?1n:0n);
  a.skipped+=done-net;a.finishedVolume+=done;a.cursor=a.finishedVolume;
  a.layerBasePlaced=a.placed;a.layerY++;a.notify(true);
 }
 a.check(token);a.status='complete';a.reason=a.manualRemaining?'manual_last_block':'';a.phase='complete';
 a.target=a.manualTarget||null;a.layerY=a.area.max.y;a.diagnostic('complete','manualRemaining='+a.manualRemaining);a.release();a.notify(true);
}
module.exports={SolidPattern,handoffGoal,choosePattern,runSolidPattern,firstPending,jobKey,rememberPattern,restorePattern};
