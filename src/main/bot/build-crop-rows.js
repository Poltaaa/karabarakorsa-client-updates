'use strict';
const {BuildRows}=require('./build-rows');
// Crops are passable, not solid roofs. Keep the same three-deep world grid,
// but work from one shared soil stance and permit transit over existing crops.
class CropRows extends BuildRows {
  stance(p){
    const {band,near,len}=this.describe(p),r=this.area;
    const terminal=band*3+len>=Number(this.length);
    // Normal strips use the next (unplanted) soil row. The last strip must
    // remain ON the loaded garden, at the near end rather than between crops.
    // All three clicks then face the same depth direction (biased top points).
    const d=terminal?near+.5:near+this.sign+.5;
    return {[this.depth]:Math.max(r.min[this.depth]+.32,Math.min(r.max[this.depth]+.68,d)),[this.cross]:p[this.cross]+.5};
  }
  allowed(p,pos){
    const q=this.stance(p);
    return pos.y<=p.y+.001&&pos.y>=p.y-.2&&Math.abs(pos[this.depth]-q[this.depth])<=.12&&Math.abs(pos[this.cross]-q[this.cross])<=.12;
  }
  routeAllowed(){return true;} // Actual loaded body/terrain checks still apply.
}
module.exports={CropRows};
