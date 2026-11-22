'use strict';
// Track only loaded block states actually read by a predictive proof. Remote
// farms and repeated identical block updates do not stale an unrelated route.
class WorldProof {
 constructor(bot,limit=65536){this.bot=bot;this.limit=limit;this.reads=new Map();this.stale=false;}
 record(p,b){
  const k=`${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`,state=b?.stateId??null;
  if(this.reads.has(k)){if(this.reads.get(k).state!==state)this.stale=true;}
  else if(this.reads.size>=this.limit)this.stale=true;
  else this.reads.set(k,{p:p.floored(),state});
 }
 valid(){
  if(this.stale)return false;
  for(const {p,state} of this.reads.values())if((this.bot.blockAt(p,false)?.stateId??null)!==state)return false;
  return true;
 }
}
module.exports={WorldProof};
