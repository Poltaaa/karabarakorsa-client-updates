'use strict';
// Independent test encoder: numeric IDs from Minestom 26.1.2-rv1 / 1.21.4-rv2,
// NOT the client's corrected table or the installed broken mapper.
const {ProtoDef}=require('protodef');
const p=new ProtoDef();p.addType('attributesRaw',['container',[
 {name:'entityId',type:'varint'},
 {name:'properties',type:['array',{countType:'varint',type:['container',[
  {name:'key',type:'varint'},{name:'value',type:'f64'},
  {name:'modifiers',type:['array',{countType:'varint',type:['container',[{name:'uuid',type:['pstring',{countType:'varint'}]},{name:'amount',type:'f64'},{name:'operation',type:'i8'}]]}]}
 ]]}]}
]]);
function wire(version,properties,entityId=1){
 const d=require('minecraft-data')(version),map=d.protocol.play.toClient.types.packet[1][0].type[1].mappings;
 const id=Number(Object.keys(map).find(k=>map[k]==='entity_update_attributes'));
 const head=p.createPacketBuffer('varint',id),body=p.createPacketBuffer('attributesRaw',{entityId,properties});return Buffer.concat([head,body]);
}
function sendSpeed(client,version,value,modifiers=[]){
 const modern=require('minecraft-data')(version).version.version===775;
 client.writeRaw(wire(version,[{key:modern?20:19,value:0,modifiers:[]},{key:modern?21:20,value:0,modifiers:[]},{key:modern?22:21,value,modifiers}]));
}
module.exports={wire,sendSpeed};
