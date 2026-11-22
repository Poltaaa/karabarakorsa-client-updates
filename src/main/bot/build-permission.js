'use strict';
// An explicit system denial is a reason to STOP, never a permission grant.
// Player chat and unrelated notifications must not change build state.
function pauseOnBuildPermissionDenial(build,text,position,senderUuid){
 if(!build||build.status!=='running'||!['place','rescue_close'].includes(build.phase))return false;
 if(!['system','game_info',1,2].includes(position))return false;
 if(senderUuid&&String(senderUuid).replace(/-/g,'')!=='0'.repeat(32))return false;
 const normalized=String(text||'').slice(0,4000).replace(/§[0-9a-fk-orx]/gi,'')
  .normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('tr').replace(/ı/g,'i').replace(/\s+/g,' ').trim();
 // Narrow to the observed server response; do not treat generic "permission"
 // mentions as a denial and do not infer that any other area is authorized.
 if(!/(?:^|[»>]\s*)bu adada yetkin yok:\s*blok\s*koyabilme[.!]?$/.test(normalized))return false;
 build.pause('permission_denied');return true;
}
module.exports={pauseOnBuildPermissionDenial};