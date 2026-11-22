'use strict';
// Pinned minecraft-data 3.117.0 maps modern numeric attribute IDs incorrectly:
// 26.1 ID20 is mining_efficiency (NOT movement_speed); movement_speed is ID22.
// Independent ID sources: net.minestom:data:26.1.2-rv1 / 1.21.4-rv2,
// attribute.json/attributes.json (Maven Central). Only these verified protocols.
// Narrow inbound reader before Mineflayer's entities listener. No dependency
// files/global serializer caches, outgoing traffic or attribute values changed.
const OLD=['armor','armor_toughness','attack_damage','attack_knockback','attack_speed','block_break_speed','block_interaction_range','burning_time','explosion_knockback_resistance','entity_interaction_range','fall_damage_multiplier','flying_speed','follow_range','gravity','jump_strength','knockback_resistance','luck','max_absorption','max_health','mining_efficiency','movement_efficiency','movement_speed','oxygen_bonus','safe_fall_distance','scale','sneaking_speed','spawn_reinforcements','step_height','submerged_mining_speed','sweeping_damage_ratio','tempt_range','water_movement_efficiency'];
const MODERN=[...OLD.slice(0,8),'camera_distance',...OLD.slice(8),'waypoint_transmit_range','waypoint_receive_range'];
const TABLES=new Map([[769,Object.freeze(OLD.map(n=>'minecraft:'+n))],[775,Object.freeze(MODERN.map(n=>'minecraft:'+n))]]);
const cache=new Map();
function info(version){
 if(cache.has(version))return cache.get(version);
 if(typeof version!=='string')return null;
 let result=null;try{
  const d=require('minecraft-data')(version),names=TABLES.get(d?.version?.version);
  if(names){const map=d.protocol.play.toClient.types.packet[1][0].type[1].mappings;
   const id=Number(Object.keys(map).find(k=>map[k]==='entity_update_attributes'));
   if(Number.isInteger(id))result={id,names};
  }
 }catch(_){}cache.set(version,result);return result;
}
function decodeAttributePacket(client,buffer){
 if(client.state!=='play'||!Buffer.isBuffer(buffer)||!buffer.length)return null;
 const schema=info(client.version);if(!schema)return null;
 let offset=0;
 const bad=()=>{throw Error('Invalid modern attribute packet');};
 function varint(){let v=0;for(let i=0;i<5;i++){if(offset>=buffer.length)bad();const b=buffer[offset++];if(i===4&&(b&0xf0))bad();v|=(b&127)<<(i*7);if(!(b&128))return v>>>0;}bad();}
 if(varint()!==schema.id)return null;
 if(buffer.length>1024*1024)bad();
 const entityId=varint()|0,count=varint();if(count>128)bad();
 function double(){if(offset+8>buffer.length)bad();const v=buffer.readDoubleBE(offset);offset+=8;if(!Number.isFinite(v))bad();return v;}
 function text(){const n=varint();if(n>1024||offset+n>buffer.length)bad();const v=buffer.toString('utf8',offset,offset+n);offset+=n;return v;}
 const properties=[];
 for(let i=0;i<count;i++){
  const id=varint(),key=schema.names[id];if(!key)bad();const value=double(),n=varint();if(n>128)bad();
  const modifiers=[];for(let j=0;j<n;j++){const uuid=text(),amount=double();if(offset>=buffer.length)bad();const operation=buffer.readInt8(offset++);if(operation<0||operation>2)bad();modifiers.push({uuid,amount,operation});}
  properties.push({key,value,modifiers});
 }
 if(offset!==buffer.length)bad();
 return {data:{name:'entity_update_attributes',params:{entityId,properties}},metadata:{size:offset},buffer,fullBuffer:buffer};
}
module.exports={decodeAttributePacket};
