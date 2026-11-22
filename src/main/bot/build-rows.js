'use strict';
// Constant-memory, world-aligned three-deep strips. Coordinates never drift
// with the player's yaw, pathfinder result or a failed placement.
class BuildRows {
  constructor(area, entry, side) {
    this.area=area;this.depth=side.axis;this.cross=this.depth==='x'?'z':'x';
    this.sign=side.low?-1:1;this.far=side.low?area.max[this.depth]:area.min[this.depth];
    this.length=BigInt(area.max[this.depth]-area.min[this.depth]+1);
    this.width=BigInt(area.max[this.cross]-area.min[this.cross]+1);
    this.crossSign=Math.abs(entry[this.cross]-area.min[this.cross])<=Math.abs(entry[this.cross]-area.max[this.cross]-1)?1:-1;
    this.anchor=null;
  }
  column(row,band) {
    const w=Number(this.width),low=this.area.min[this.cross];
    if(!band&&this.anchor!==null){
      const n=this.anchor-low,first=this.crossSign>0?w-n:n+1;
      return low+(row<first?n+this.crossSign*row:n-this.crossSign*(row-first+1));
    }
    const sign=this.direction(band);
    return sign>0?low+row:this.area.max[this.cross]-row;
  }
  direction(band){
    if(!band)return this.crossSign;
    const end=this.column(Number(this.width)-1,0),sign=end===this.area.min[this.cross]?1:-1;
    return (band-1)%2?-sign:sign;
  }
  cell(index,y) {
    if(index<0n||index>=this.area.layer)return null;
    const band=Number(index/(3n*this.width)),len=Number(this.length-BigInt(band*3)<3n?this.length-BigInt(band*3):3n);
    const inner=index-BigInt(band)*3n*this.width,row=Number(inner/BigInt(len)),off=Number(inner%BigInt(len));
    return {[this.depth]:this.far+this.sign*(band*3+off),[this.cross]:this.column(row,band),y};
  }
  describe(p) {
    const offset=(p[this.depth]-this.far)*this.sign,band=Math.floor(offset/3);
    const len=Math.min(3,Number(this.length)-band*3);
    return {band,len,near:this.far+this.sign*(band*3+len-1)};
  }
  index(p) {
    const {band,len}=this.describe(p),low=this.area.min[this.cross],w=Number(this.width);
    let row;
    if(!band&&this.anchor!==null){
      const n=this.anchor-low,c=p[this.cross]-low,first=this.crossSign>0?w-n:n+1;
      row=(c-n)*this.crossSign>=0?(c-n)*this.crossSign:first+(n-c)*this.crossSign-1;
    }else row=this.direction(band)>0?p[this.cross]-low:w-1-(p[this.cross]-low);
    const off=(p[this.depth]-this.far)*this.sign-band*3;
    return BigInt(band)*3n*this.width+BigInt(row*len+off);
  }
  next(p){return this.cell(this.index(p)+1n,p.y);}
  stance(p,seed=null){
    if(seed)return {[this.depth]:p[this.depth]+.5,[this.cross]:seed.column+seed.side+.5};
    return {[this.depth]:this.describe(p).near+this.sign+.5,[this.cross]:p[this.cross]+.5};
  }
  allowed(p,pos,seed=null){
    if(pos.y>p.y+.001)return false; // Never choose the roof of this layer.
    // An existing obstacle can require a visible angle along an outer side.
    // This is not permission to cross behind a filled interior strip.
    if(!seed&&this.edge(pos)&&Math.abs(pos[this.depth]-p[this.depth]-.5)<=1.7&&Math.abs(pos[this.cross]-p[this.cross]-.5)<=2.7)return true;
    const q=this.stance(p,seed),axis=seed?this.cross:this.depth,sign=seed?seed.side:this.sign,boundary=seed?seed.column:this.describe(p).near;
    const side=sign<0?pos[axis]+.31<=boundary+.001:pos[axis]-.31>=boundary+1-.001;
    return side&&Math.abs(pos[this.depth]-q[this.depth])<=(seed?1.15:.7)&&Math.abs(pos[this.cross]-q[this.cross])<=.7;
  }
  transitAllowed(p,pos){
    const r=this.area;
    const overWork=pos.x+.31>r.min.x&&pos.x-.31<r.max.x+1&&pos.z+.31>r.min.z&&pos.z-.31<r.max.z+1;
    // Native transit may jump a pre-existing obstacle on the approach road.
    // It must not climb the new roof inside the active work rectangle.
    return !(overWork&&pos.y>p.y+.001);
  }
  routeAllowed(p,pos,origin,seed=null){
    const r=this.area;
    if(!this.transitAllowed(p,pos))return false;
    if(!seed&&this.edge(pos))return true;
    const axis=seed?this.cross:this.depth,sign=seed?seed.side:this.sign,boundary=seed?seed.column:this.describe(p).near;
    // Allow retreat from the previous band, never forward across its newly
    // completed wall. After retreat, navigation stays on the open working side.
    return sign<0?pos[axis]+.31<=Math.max(boundary,origin[axis]+.31)+.001:
      pos[axis]-.31>=Math.min(boundary+1,origin[axis]-.31)-.001;
  }
  edge(pos){const r=this.area,k=this.cross;return pos[k]+.31<=r.min[k]+.001||pos[k]-.31>=r.max[k]+1-.001;}
}
module.exports={BuildRows};