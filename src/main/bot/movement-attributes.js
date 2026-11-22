'use strict';
// The pinned modern protocol mapper exposes generic.movement_speed, whereas
// physics asks for minecraft:movement_speed. Preserve server base/modifiers;
// never substitute a higher local default for an available server value.
function movementAttributes(attributes,physics){
 const name=physics.movementSpeedAttribute;
 if(!attributes||name!=='minecraft:movement_speed')return attributes;
 const key=[name,'generic.movement_speed','minecraft:generic.movement_speed','movement_speed'].find(k=>attributes[k]);
 if(!key)return attributes;
 const prop=attributes[key];
 const modifiers=(prop.modifiers||[]).map(m=>({...m,uuid:m.uuid==='minecraft:sprinting'?physics.sprintingUUID:m.uuid}));
 // Native sprint processing mutates this property. A private simulation copy
 // also prevents hypothetical escape/pathfinder ticks altering live attributes.
 return {...attributes,[name]:{...prop,modifiers}};
}
function movementInfo(bot){
 const physics=bot?.physics;if(!physics)return {known:false};
 const attrs=movementAttributes(bot?.entity?.attributes,physics),p=attrs?.[physics.movementSpeedAttribute];
 if(!p||!Number.isFinite(p.value))return {known:false};
 const modifiers=(p.modifiers||[]).filter(m=>m.uuid!==physics.sprintingUUID);
 let base=p.value;for(const m of modifiers)if(m.operation===0)base+=m.amount;
 let value=base;for(const m of modifiers)if(m.operation===1)value+=base*m.amount;
 for(const m of modifiers)if(m.operation===2)value*=1+m.amount;
 return {known:Number.isFinite(value),value:Math.max(0,Math.min(1024,value))};
}
module.exports={movementAttributes,movementInfo};
