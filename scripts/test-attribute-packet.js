'use strict';
const assert=require('assert'),{wire}=require('./attribute-wire-fixture');
const {decodeAttributePacket}=require('../src/main/bot/attribute-packet'),{movementInfo}=require('../src/main/bot/movement-attributes');
const {world}=require('./test-build-local'),{PlayerState}=require('prismarine-physics');
const {surfacePhysics}=require('../src/main/bot/auto-build');
let passed=0;
for(const version of ['1.21.4','26.1']){
 const latest=version==='26.1',speedId=latest?22:21,miningId=latest?20:19;
 const buf=wire(version,[{key:miningId,value:0,modifiers:[]},{key:speedId,value:.04,modifiers:[{uuid:'server:slow',amount:-.2,operation:2}]}]);
 const corrected=decodeAttributePacket({version,state:'play'},buf);
 assert.deepEqual(corrected.data.params.properties.map(p=>[p.key,p.value]),[['minecraft:mining_efficiency',0],['minecraft:movement_speed',.04]]);
 const old=require('minecraft-protocol/src/transforms/serializer').createDeserializer({version,state:'play'}).parsePacketBuffer(buf);
 if(latest)assert.deepEqual(old.data.params.properties.map(p=>[p.key,p.value]),[['generic.movement_speed',0],['generic.scale',.04]]);
 const w=world('slow',version),b=w.b,restore=surfacePhysics(b);
 try{
  b.controlState.forward=true;
  b.entity.attributes=Object.fromEntries(old.data.params.properties.map(p=>[p.key,{value:p.value,modifiers:p.modifiers}]));
  if(latest){b.physics.simulatePlayer(new PlayerState(b,b.controlState),{getBlock:q=>b.blockAt(q,false)}).apply(b);assert.equal(b.entity.position.z,.5,'old ID20 mining zero reproduces stationary movement');}
  b.entity.attributes=Object.fromEntries(corrected.data.params.properties.map(p=>[p.key,{value:p.value,modifiers:p.modifiers}]));
  const info=movementInfo(b);assert(info.known&&Math.abs(info.value-.032)<1e-10);const oldZ=b.entity.position.z;
  b.physics.simulatePlayer(new PlayerState(b,b.controlState),{getBlock:q=>b.blockAt(q,false)}).apply(b);assert(b.entity.position.z<oldZ-.01,'real corrected speed walks; zero mining not mistaken for movement');
  b.entity.attributes['minecraft:movement_speed']={value:0,modifiers:[]};assert.equal(movementInfo(b).value,0,'real zero never overwritten with .1');
  b.entity.attributes['minecraft:movement_speed']={value:0,modifiers:[{uuid:'server:add',amount:.04,operation:0}]};assert.equal(movementInfo(b).value,.04,'zero base with positive modifier still moves');
 }finally{restore();w.stop();}
 for(const state of ['configuration','login','handshaking'])assert.equal(decodeAttributePacket({version,state},buf),null);
 assert.throws(()=>decodeAttributePacket({version,state:'play'},buf.subarray(0,-1)));
 assert.throws(()=>decodeAttributePacket({version,state:'play'},Buffer.concat([buf,Buffer.from([0])])));
 assert.throws(()=>decodeAttributePacket({version,state:'play'},wire(version,[{key:99,value:1,modifiers:[]}])));
 passed+=8;
}
// Full verified 26.1 table, including IDs absent from the broken mapper.
const names=['armor','armor_toughness','attack_damage','attack_knockback','attack_speed','block_break_speed','block_interaction_range','burning_time','camera_distance','explosion_knockback_resistance','entity_interaction_range','fall_damage_multiplier','flying_speed','follow_range','gravity','jump_strength','knockback_resistance','luck','max_absorption','max_health','mining_efficiency','movement_efficiency','movement_speed','oxygen_bonus','safe_fall_distance','scale','sneaking_speed','spawn_reinforcements','step_height','submerged_mining_speed','sweeping_damage_ratio','tempt_range','water_movement_efficiency','waypoint_transmit_range','waypoint_receive_range'];
const all=decodeAttributePacket({version:'26.1',state:'play'},wire('26.1',names.map((_,key)=>({key,value:0,modifiers:[]}))));
assert.deepEqual(all.data.params.properties.map(p=>p.key),names.map(n=>'minecraft:'+n));passed++;
assert.equal(decodeAttributePacket({version:'1.20.1',state:'play'},Buffer.from([0])),null);passed++;
assert.equal(decodeAttributePacket({version:'26.1',state:'play'},Buffer.from([0])),null);passed++;
const negative=decodeAttributePacket({version:'26.1',state:'play'},wire('26.1',[{key:22,value:.1,modifiers:[]}],-1));assert.equal(negative.data.params.entityId,-1);passed++;
console.log(`Attribute wire-ID tests passed: ${passed} cases; old zero-speed reproduction, canonical true speed, valid zero, modifiers, full35 IDs, other packets/states, malformed bounds.`);
