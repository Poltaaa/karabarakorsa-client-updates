'use strict';
const assert=require('assert');
const {pauseOnBuildPermissionDenial:handle}=require('../src/main/bot/build-permission');
let passed=0;
const deny='ᴀᴇꜱɪʀ ꜱᴋʏʙʟᴏᴄᴋ » Bu adada yetkin yok: Blok Koyabilme';
function build(phase='place',status='running'){
 return {phase,status,calls:0,pause(reason){this.calls++;this.status='paused';this.reason=reason;}};
}
for(const position of ['system','game_info',1,2]){
 const a=build();assert(handle(a,deny,position,null));assert.equal(a.reason,'permission_denied');assert.equal(a.calls,1);
 assert(!handle(a,deny,position,null));assert.equal(a.calls,1);passed++;
}
for(const [text,position,sender,phase,status] of [
 [deny,'chat',null,'place','running'],
 [deny,'system','11111111-1111-1111-1111-111111111111','place','running'],
 [deny,undefined,null,'place','running'],
 [deny,'system',null,'walk','running'],
 [deny,'system',null,'place','paused'],
 ['Bu adada yetkin yok: Sandık Açabilme','system',null,'place','running'],
 ['Bu adada Blok Koyabilme yetkin var','system',null,'place','running'],
 ['Oyuncu: '+deny,'chat',null,'place','running']
]){
 const a=build(phase,status);assert(!handle(a,text,position,sender));assert.equal(a.calls,0);passed++;
}
const a=build('rescue_close');assert(handle(a,'§c'+deny+'!','system','00000000-0000-0000-0000-000000000000'));passed++;
console.log(`Build permission tests passed: ${passed} cases; explicit system denial stops, player chat/unrelated messages ignored, no permission bypass.`);