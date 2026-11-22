'use strict';
// End-to-end loopback protocol test: real BotManager + Mineflayer native look,
// equip, physics, pathfinder and placement. No replacement of these APIs.
// The small test server validates both wire angles, shape cursor, inventory,
// reach and crouch before issuing a block acknowledgement. Not a live-server test.
const assert = require('assert');
const net = require('net');
const { once } = require('events');
const { Vec3 } = require('vec3');
const protocol = require('minecraft-protocol');
const BotManager = require(process.env.CLIENT_TEST_ROOT?process.env.CLIENT_TEST_ROOT+'/src/main/bot/bot-manager':'../src/main/bot/bot-manager');
const {sendSpeed}=require('./attribute-wire-fixture');
const CLIENT_BUILD=require(process.env.CLIENT_TEST_ROOT?process.env.CLIENT_TEST_ROOT+'/src/main/build-info':'../src/main/build-info').package;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  while (!fn() && Date.now() < end) await sleep(20);
  assert(fn(), 'full-client deadline exceeded');
}
async function scenario(version, spec) {
  const data = require('minecraft-data')(version), Chunk = require('prismarine-chunk')(version), Item = require('prismarine-item')(version);
  const modernInput=require('prismarine-registry')(version).supportFeature('newPlayerInputPacket');
  const checkTicks=require('prismarine-registry')(version).supportFeature('sendsClientTickEndPacket')&&(CLIENT_BUILD>=127||!!process.env.BUILD_TICKS);
  let expectsEnd=false,teleportMotion=false,tickEnds=0,normalMotion=0,tickOrderErrors=0;
  const interactive = new Set(require('mineflayer-pathfinder/lib/interactable.json'));
  const reservation = net.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(r => reservation.close(r));
  const columns = new Map(), lines = [], placements = [], protocolErrors = [];
  const log = { L: (_tr, en) => en, ts: () => '' };
  for (const k of ['info','warn','error','connect','disconnect','reconnect','chat']) log[k] = m => {lines.push(k+': '+m);if(process.env.BUILD_TRACE&&String(m).includes('[Auto Build/'))console.log(m);};
  const floorY = spec.floorY??(spec.floor === 'soul_sand' ? 65 : 64), floorTop = spec.floor === 'soul_sand' ? .875 : 1, y = spec.targetY || floorY + 1;
  const colAt = p => columns.get(`${Math.floor(p.x/16)},${Math.floor(p.z/16)}`);
  const local = p => new Vec3((p.x%16+16)%16,p.y,(p.z%16+16)%16);
  const blockAt = p => colAt(p)?.getBlock(local(p));
  const put = (p, name) => colAt(p).setBlockStateId(local(p), data.blocksByName[name].minStateId);
  for (let cx=-2;cx<=2;cx++) for (let cz=-2;cz<=2;cz++) {
    if(spec.edge&&!(cx===0&&cz===0))continue;
    const col = new Chunk({minY:-64,worldHeight:384}); columns.set(`${cx},${cz}`,col);
    for (let x=0;x<16;x++) for (let z=0;z<16;z++) {const gx=cx*16+x,gz=cz*16+z,g=spec.groundBounds;if(!g||gx>=g.minX&&gx<=g.maxX&&gz>=g.minZ&&gz<=g.maxZ)col.setBlockStateId(new Vec3(x,floorY,z),data.blocksByName[spec.floor].minStateId);}
  }
  if(spec.seed)put(new Vec3(spec.seed.x,y,spec.seed.z??0),'oak_planks');
  for(const p of spec.prefilled||[])put(new Vec3(p.x,y,p.z),spec.block);
  if(spec.lastGap)for(let x=0;x<=spec.maxX;x++)for(let z=0;z<=spec.maxZ;z++)if(x!==spec.lastGap.x||z!==spec.lastGap.z)put(new Vec3(x,y,z),spec.block);
  if(spec.obstacle)for(let h=floorY+1;h<=floorY+3;h++)put(new Vec3(2,h,0),'stone');
  let refillRaceSent=false,noiseTimer=null,noiseUpdates=0;
  let physicalStep=0,previousPhysical,strafeTicks=0,strafeYaw=null,skippedStrafeTicks=0,latePrefillDone=false;
  let manager, server, player, stateId = 1, quickbar = 0, cursor = null, clicks = 0, maxStep = 0, moves = 0;
  const digPackets=[],events=[],positionRequests=[];
  const nativeFrames=new Map();let wireInputs=null,inputPackets=0,inputFrames=0,maxHeadingError=0;
  const frameKey=p=>[p.x,p.y,p.z].map(v=>Number(v).toFixed(8)).join(',');
  const fields={forward:'forward',backward:'back',left:'left',right:'right',jump:'jump',shift:'sneak',sprint:'sprint'};
  let pose = {x:spec.startX??.5,y:floorY+floorTop,z:spec.startZ??.5,yaw:0,pitch:0}, crouch = false;
  const startPose = {...pose}, slots = Array(46).fill(null); slots[spec.slot] = new Item(data.itemsByName[spec.block].id,64);
  if(spec.large||spec.rows||spec.tickLong||spec.refillRace||spec.pattern)for(let i=9;i<=18;i++)slots[i]=new Item(data.itemsByName[spec.block].id,64);
  const sync = c => c.write('window_items',{windowId:0,stateId:++stateId,items:slots.map(i=>Item.toNotch(i)),carriedItem:Item.toNotch(cursor)});
  const difference = (a,b) => Math.abs((((a-b)%360+540)%360)-180);
  const dirs = [[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
  try {
    server = protocol.createServer({host:'127.0.0.1',port,version,'online-mode':false,keepAlive:false,hideErrors:true});
    server.on('connection', c => c.on('error', e => protocolErrors.push(e.message)));
    server.on('playerJoin', c => {
      c.on('packet',(_p,meta)=>{
        if(!checkTicks)return;
        const n=meta.name;
        if(n==='tick_end'){expectsEnd=false;tickEnds++;return;}
        if(n==='teleport_confirm'){teleportMotion=true;return;}
        if(/^(position|position_look|look|flying)$/.test(n)){
          if(teleportMotion){teleportMotion=false;return;}
          if(expectsEnd){tickOrderErrors++;if(protocolErrors.length<12)protocolErrors.push('movement before prior tick_end: '+n);}
          expectsEnd=true;normalMotion++;return;
        }
        // This is a narrow wire-order regression, NOT a complete anti-cheat.
        // Native mandatory server replies may occur asynchronously.
        if(expectsEnd&&!/^(pong|keep_alive|chunk_batch_received|window_confirmation)$/.test(n)){
          tickOrderErrors++;if(protocolErrors.length<12)protocolErrors.push('action after movement before tick_end: '+n);
        }
      });
      player = c; c.write('login',{...data.loginPacket,entityId:1,death:null});
      for (const [key,col] of columns) { const [x,z] = key.split(',').map(Number);
        c.write('map_chunk',{x,z,heightmaps:{type:'compound',name:'',value:{}},chunkData:col.dump(),blockEntities:[],skyLightMask:[],blockLightMask:[],emptySkyLightMask:[],emptyBlockLightMask:[],skyLight:[],blockLight:[]});
      }
      c.write('position',{...pose,dx:0,dy:0,dz:0,flags:['1.21.4','26.1'].includes(version)?{}:0,teleportId:1});
      c.write('update_health',{health:20,food:20,foodSaturation:5}); sync(c);
      if(spec.serverSpeed!==undefined)sendSpeed(c,version,spec.serverSpeed);
      if(spec.movementLock==='base-modifier')sendSpeed(c,version,0,[{uuid:'server:add',amount:.04,operation:0}]);
      for (const n of ['position','position_look','look']) c.on(n, p => {
        if (Number.isFinite(p.x)) { maxStep = Math.max(maxStep,Math.hypot(p.x-pose.x,p.z-pose.z)); moves++; }
        if((spec.inputTurns||(spec.edge||spec.wartRows)&&modernInput)&&Number.isFinite(p.x)){
          const f=nativeFrames.get(frameKey(p));
          if(f)try{
            assert(wireInputs,'real forward movement must have a complete input report');
            for(const [wire,local] of Object.entries(fields))assert.equal(!!wireInputs[wire],f.controls[local],'wire key differs from native controls: '+wire);
            if(f.controls.forward){
              const wireYaw=p.yaw??pose.yaw,error=difference(wireYaw,(Math.PI-f.yaw)*180/Math.PI);
              maxHeadingError=Math.max(maxHeadingError,error);assert(error<20,'forward acceleration before transmitted turn: '+error);inputFrames++;
            }
          }catch(e){if(protocolErrors.length<12)protocolErrors.push(e.message);}
        }
        pose = {...pose,...p};
        if(n==='position_look')for(const expected of positionRequests)if(!expected.replied&&['x','y','z'].every(k=>Math.abs(p[k]-expected.target[k])<1e-6)){
          expected.replied=true;expected.replyMs=Date.now()-expected.time;break;
        }
      });
      c.on('teleport_confirm',p=>{const expected=positionRequests.find(q=>q.id===p.teleportId);if(expected)expected.ack=true;});
      c.on('entity_action', p => { if (p.actionId===0 || p.actionId==='start_sneaking') crouch=true; if(p.actionId===1 || p.actionId==='stop_sneaking') crouch=false; });
      c.on('player_input', p => { if(p.inputs){crouch=!!p.inputs.shift;wireInputs=p.inputs;inputPackets++;} });
      c.on('held_item_slot', p => {quickbar=p.slotId;});
      c.on('window_click', p => {
        if(p.mode===0 && p.mouseButton===0 && p.slot>=0) { clicks++; [slots[p.slot],cursor]=[cursor,slots[p.slot]]; }
        sync(c); // Server-owned inventory, not blindly accepting changedSlots.
      });
      c.on('block_dig',p=>{
        if(!spec.rescue&&!spec.large)return;
        try {
          const v=new Vec3(p.location.x,p.location.y,p.location.z);
          if(spec.large)assert(v.y===y&&v.x>=0&&v.x<=spec.maxX&&v.z>=0&&v.z<=spec.maxZ&&placements.some(p=>p.ok&&p.target[0]===v.x&&p.target[1]===v.y&&p.target[2]===v.z),'only a previously confirmed placed block, never the original floor');
          else assert(v.x===1&&v.z===0&&[65,66].includes(v.y),'only the confirmed own doorway may be dug');
          if(p.status===0||p.status===2) {
            const b=blockAt(v),axis=p.face<=1?1:p.face<=3?2:0,plus=[1,3,5].includes(p.face),shape=b.shapes[0];
            const q=[0,1,2].map(i=>i===axis?shape[i+(plus?3:0)]:(shape[i]+shape[i+3])/2),d=v.offset(...q).minus(new Vec3(pose.x,pose.y+1.62,pose.z));
            const yaw=(Math.PI-Math.atan2(-d.x,-d.z))*180/Math.PI,pitch=-Math.atan2(d.y,Math.hypot(d.x,d.z))*180/Math.PI;
            assert(difference(pose.yaw,yaw)<3&&Math.abs(pose.pitch-pitch)<3,'dig must use the actually visible face and wire angles');
          }
          digPackets.push({status:p.status,p:[v.x,v.y,v.z],face:p.face});
          if(p.status===2){put(v,'air');c.write('block_change',{location:v,type:0});events.push({type:'dig',p:[v.x,v.y,v.z],pose:{...pose}});}
        }catch(e){protocolErrors.push(e.stack);}
      });
      c.on('block_place', p => {
        try {
          const refPos = new Vec3(p.location.x,p.location.y,p.location.z), target = refPos.offset(...dirs[p.direction]);
          const ref = blockAt(refPos), targetBlock = blockAt(target), held = slots[36+quickbar];
          const eye = new Vec3(pose.x,pose.y+(crouch?1.27:1.62),pose.z), aim = refPos.offset(p.cursorX,p.cursorY,p.cursorZ), d = aim.minus(eye);
          const yaw = (Math.PI-Math.atan2(-d.x,-d.z))*180/Math.PI, pitch = -Math.atan2(d.y,Math.hypot(d.x,d.z))*180/Math.PI;
          const axis = p.direction<=1?1:p.direction<=3?2:0, plus = [1,3,5].includes(p.direction), cursorPos=[p.cursorX,p.cursorY,p.cursorZ];
          const onFace = ref.shapes.some(s => Math.abs(cursorPos[axis]-s[axis+(plus?3:0)])<.00001 && [0,1,2].every(i=>i===axis || cursorPos[i]>=s[i]&&cursorPos[i]<=s[i+3]));
          const cubeCollision = spec.block!=='nether_wart' && pose.x+.3>target.x&&pose.x-.3<target.x+1&&pose.z+.3>target.z&&pose.z-.3<target.z+1&&pose.y+1.8>target.y&&pose.y<target.y+1;
          const ok = difference(pose.yaw,yaw)<3 && Math.abs(pose.pitch-pitch)<3 && d.norm()<4.3 && onFace && !cubeCollision && targetBlock.name==='air' && held?.name===spec.block && (!interactive.has(ref.name)||crouch) && (spec.block!=='nether_wart'||ref.name==='soul_sand'&&p.direction===1);
          events.push({type:'place',p:[target.x,target.y,target.z],pose:{...pose}});
          if(spec.rescue&&digPackets.some(p=>p.status===2)){
            const pos=new Vec3(pose.x,pose.y,pose.z),a=manager.autoBuild;
            assert(a.safety.outside(pos),'never reseal or fill from inside the cuboid');
            assert([...a.safety.repairs.values()].every(r=>!a.collision(r.p,pos)),'actual body must be clear of every opened doorway cell');
          }
          const planner=manager?.autoBuild,seed=planner?.seedPlan;
          placements.push({ok,time:Date.now(),target:[target.x,target.y,target.z],yawError:difference(pose.yaw,yaw),pitchError:Math.abs(pose.pitch-pitch),onFace,crouch,held:held?.name,...(spec.rows||spec.wartRows||spec.pattern?{pose:{...pose},aim:[aim.x,aim.y,aim.z],seed:!!seed,openSide:planner.rows.allowed(target,pose,seed),rowIndex:String(planner.rows.index(target))}:{}),...(!ok?{reach:d.norm(),cubeCollision,existing:targetBlock.name,support:ref.name}: {})});
          if(spec.permissionDenied){
            c.write('system_chat',{content:{type:'compound',value:{text:{type:'string',value:'ᴀᴇꜱɪʀ ꜱᴋʏʙʟᴏᴄᴋ » Bu adada yetkin yok: Blok Koyabilme'}}},isActionBar:false});
            c.write('block_change',{location:refPos,type:ref.stateId});
            c.write('block_change',{location:target,type:0});
            return;
          }
          c.write('block_change',{location:refPos,type:ref.stateId});
          if (ok) {put(target,spec.block);held.count--;if(!held.count)slots[36+quickbar]=null;}
          c.write('block_change',{location:target,type:ok?data.blocksByName[spec.block].minStateId:0});
          if(ok&&spec.latePrefill&&!latePrefillDone&&target.x===spec.latePrefill.after.x&&target.z===spec.latePrefill.after.z){
            // Another player's real server update after the far/middle cells
            // are finished. An initially filled near cell would instead
            // occlude the far cell: that is a genuine geometry obstruction.
            latePrefillDone=true;
            for(const q of spec.latePrefill.cells){const v=new Vec3(q.x,y,q.z);put(v,spec.block);c.write('block_change',{location:v,type:data.blocksByName[spec.block].minStateId});}
          }
          if(ok&&spec.serverSpeed&&!spec.pace&&placements.length===9)sendSpeed(c,version,spec.serverSpeed*.75,[{uuid:'server:slow',operation:2,amount:-.1}]);
          if(ok)c.write('set_slot',{windowId:0,stateId:++stateId,slot:36+quickbar,item:Item.toNotch(slots[36+quickbar])});
        } catch(e) {protocolErrors.push(e.stack);}
      });
    });
    await once(server,'listening'); manager = new BotManager(log,'/unused-local-auth');
    await manager.connect({connection:{host:'127.0.0.1',port,version,loginDelay:0,resourcePack:'decline'},toggles:{offline:true,physics:false},settings:{packetLog:false},antiAfk:{enabled:false},autoSpam:{enabled:false},autoReconnect:{enabled:false},macros:{},spawnerProtect:{enabled:false}},{username:'LocalBuilder',type:'offline'});
    await until(()=>manager.spawned&&manager.bot.inventory.items().length&&manager.bot.world.getColumn(0,0));
    if(spec.serverSpeed!==undefined)await until(()=>manager.bot.entity.attributes?.['minecraft:movement_speed']?.value===spec.serverSpeed);
    // Observe the pathfinder in the same tick BEFORE Mineflayer sends its pose.
    // It may set control inputs, never recenter XYZ or synthesize a brake.
    let nativeBefore;let observedTicks=0;
    if(CLIENT_BUILD>=117){
      manager.bot.prependListener('physicsTick',()=>{nativeBefore={p:manager.bot.entity.position.clone(),v:manager.bot.entity.velocity.clone()};});
      manager.bot.on('physicsTick',()=>{if((manager.autoBuild.reserved||manager.autoBuild.brakeDrain)&&nativeBefore){
        assert(manager.bot.entity.position.distanceTo(nativeBefore.p)<1e-9,'non-physics position write');
        assert(manager.bot.entity.velocity.distanceTo(nativeBefore.v)<1e-9,'non-physics velocity write');observedTicks++;
      }});
    }
    if(spec.inputTurns||(spec.edge||spec.wartRows)&&modernInput)manager.bot.prependListener('physicsTick',()=>{
      const b=manager.bot;nativeFrames.set(frameKey(b.entity.position),{yaw:b.entity.yaw,controls:Object.fromEntries(Object.values(fields).map(k=>[k,!!b.controlState[k]]))});
      while(nativeFrames.size>256)nativeFrames.delete(nativeFrames.keys().next().value);
    });
    if(CLIENT_BUILD>=120)manager.bot.on('physicsTick',()=>{
      const b=manager.bot,c=b.controlState;
      if(manager.autoBuild.phase==='strafe'&&(c.left||c.right)){
        if(strafeYaw===null)strafeYaw=b.entity.yaw;
        assert(Math.abs(Math.atan2(Math.sin(b.entity.yaw-strafeYaw),Math.cos(b.entity.yaw-strafeYaw)))<.02,'strafe must not turn the camera');
        assert(!c.forward&&!c.back&&!c.jump&&!c.sprint,'A/D-only row shift');strafeTicks++;
        const t=manager.autoBuild.target;if(spec.skipTransition&&t?.x===spec.skipTransition.x&&t?.z===spec.skipTransition.z)skippedStrafeTicks++;
      }else strafeYaw=null;
    });
    const placementSendTimes=[];manager.bot.on('kb:build-place-sent',()=>placementSendTimes.push(Date.now()));
    const sentTimes=[];player.on('packet',(_p,meta)=>{if(manager.autoBuild.status==='running')sentTimes.push({t:Date.now(),n:meta.name});});
    manager.autoBuild.on('state',st=>{if(spec.large&&st.placed&&Number(st.placed)%50===0&&st.placed!==manager.__lastProgress){manager.__lastProgress=st.placed;console.log('Progress',st.placed,st.phase);}});
    // Turn on after connection, exactly like the user's packet-log action.
    manager.cfg.settings.packetLog=true;previousPhysical=manager.bot.entity.position.clone();manager.bot.on('physicsTick',()=>{const p=manager.bot.entity.position;physicalStep=Math.max(physicalStep,Math.hypot(p.x-previousPhysical.x,p.z-previousPhysical.z));previousPhysical=p.clone();});
    if(spec.movementLock){
      const a=manager.autoBuild,start=manager.bot.entity.position.clone(),started=manager.startAutoBuild({corner1:{x:24,y,z:0},corner2:{x:24,y,z:0},block:spec.block});assert(started.ok);
      await until(()=>a.status==='paused',8000);await until(()=>!a.worker);assert.equal(a.reason,'movement_disabled');
      assert(manager.bot.entity.position.distanceTo(start)<.05,'real server zero stays stationary, no invented default');assert.equal(placements.length,0);
      sendSpeed(player,version,0,[{uuid:'server:add',amount:.04,operation:0}]);await until(()=>manager.bot.entity.attributes['minecraft:movement_speed'].modifiers.length===1);
      const resumed=a.resume();assert(resumed.ok);await until(()=>a.phase==='walk'&&manager.bot.entity.position.distanceTo(start)>.4,8000);
      sendSpeed(player,version,0);await until(()=>a.status==='paused');await until(()=>!a.worker);assert.equal(a.reason,'movement_disabled');assert(!manager.bot.controlState.forward&&!manager.bot.controlState.left&&!manager.bot.controlState.right);
      assert.deepEqual(protocolErrors,[]);console.log(JSON.stringify({version,scenario:spec.name,realZeroPaused:true,baseZeroPositiveModifierWalks:true,midWalkZeroPauses:true,noPlacement:true}));return;
    }
    if(spec.inputTurns){
      const a=manager.autoBuild,started=manager.startAutoBuild({corner1:{x:24,y,z:0},corner2:{x:24,y,z:0},block:spec.block});assert(started.ok);a.pause();await until(()=>!a.worker);
      a.status='running';const token=++a.epoch;const originalControl=manager.bot.setControlState;
      for(const [i,[x,z]] of [[5,0],[5,5],[-2,5],[-2,0]].entries()){
        a.phase=i<2?'walk':'escape_walk';await a.navigate(new a.nav.goals.GoalBlock(x,floorY+1,z),token);await a.settle(token);
        assert.strictEqual(manager.bot.setControlState,originalControl,'travel wrapper restored');
      }
      a.pause();assert(wireInputs,'missing complete player_input throughout native walk');await until(()=>Object.values(wireInputs).every(v=>!v));
      assert(inputFrames>30,'real moving frame sample');assert(inputPackets>4&&inputPackets<80,'changed-input reporting, no per-tick spam');assert.deepEqual(protocolErrors,[]);
      console.log(JSON.stringify({version,scenario:spec.name,inputFrames,inputPackets,maxHeadingError,wireMatchesActualKeys:true,walkAndEscapeTurns:true}));return;
    }
    if(spec.rescue) {
      // Controlled setup uses native placement + actual server ACK, so rescue
      // ownership is earned, never fabricated or inferred from matching blocks.
      const a=manager.autoBuild,started=manager.startAutoBuild({corner1:{x:0,y:65,z:0},corner2:{x:1,y:66,z:0},block:'dirt',rescueOwn:true});assert(started.ok);
      a.pause();await until(()=>!a.worker);a.status='running';const token=++a.epoch;
      await a.placeOne({x:1,y:65,z:0},token);await a.placeOne({x:1,y:66,z:0},token);
      assert.equal(a.safety.owned.size,2);assert.equal(a.placed,2n);
      // External/pre-existing walls close the other route. Never authorize them
      // for digging. A two-high own doorway is the only safe escape candidate.
      const walls=[];for(const h of [65,66])for(const [x,z] of [[-1,0],[0,-1],[0,1]])walls.push(new Vec3(x,h,z));walls.push(new Vec3(0,67,0));
      for(const p of walls){put(p,'stone');player.write('block_change',{location:p,type:data.blocksByName.stone.minStateId});}
      await until(()=>manager.bot.blockAt(new Vec3(0,67,0)).name==='stone');
      // The new row planner deliberately approaches the doorway from its
      // open side. Put the test subject INSIDE the closed room through a real
      // server position packet, not by mutating native client coordinates.
      a.pause('manual');await until(()=>!a.worker);
      player.write('position',{x:.5,y:65,z:.5,dx:0,dy:0,dz:0,yaw:0,pitch:0,flags:['1.21.4','26.1'].includes(version)?{}:0,teleportId:77});
      await until(()=>manager.bot.entity.position.distanceTo(new Vec3(.5,65,.5))<.01);
      a.status='running';++a.epoch;
      assert.equal(await a.safety.plan(a.epoch),null,'the real closed room has no normal escape');
      a.status='paused';a.scan=0n;a.passProgress=0;a.frontier=[];a.frontierKeys.clear();a.launch();
      await until(()=>['complete','paused'].includes(a.status),45000);
      assert.equal(a.status,'complete',JSON.stringify({state:a.state(),log:lines.filter(x=>x.includes('Auto Build')).slice(-15),events}));
      assert.equal(a.safety.broken,2);assert.equal(a.safety.repairs.size,0);assert.equal(a.placed,4n);assert.equal(a.cursor,4n);
      for(const p of walls)assert.equal(blockAt(p).name,'stone');
      for(const y of [65,66])for(const x of [0,1])assert.equal(blockAt(new Vec3(x,y,0)).name,'dirt');
      assert.equal(digPackets.filter(p=>p.status===2).length,2);assert(digPackets.filter(p=>p.status===0||p.status===2).every(p=>[1,4].includes(p.face)),'visible face used for native digging');
      assert(lines.some(x=>x.includes('exit verified')));assert(lines.some(x=>x.includes('rescue closed')));assert(a.safety.outside(new Vec3(pose.x,pose.y,pose.z)));assert.deepEqual(protocolErrors,[]);
      console.log(JSON.stringify({version,scenario:spec.name,confirmedRescueBreaks:a.safety.broken,remainingRepairs:a.safety.repairs.size,finalFilled:4,originalWallsProtected:true,allClosingFromOutside:true}));return;
    }
    if(spec.correctionCase){
      const receiveTarget=p=>{
        const expected=positionRequests.find(q=>q.id===p.teleportId);
        const pos=manager.bot?.entity?.position;
        if(expected?.relative&&pos)expected.target={x:pos.x+p.x,y:pos.y+p.y,z:pos.z+p.z};
      };
      manager.bot._client.prependListener('position',receiveTarget);
      const result=manager.startAutoBuild({corner1:{x:0,y,z:0},corner2:{x:24,y,z:0},block:spec.block});assert(result.ok);
      await until(()=>manager.autoBuild.phase==='walk'&&manager.bot.controlState.forward);
      const sendPosition=async(mode)=>{
        const id=100+positionRequests.length,relative=mode==='marker'||mode==='small';
        const offset=mode==='rollback'?-.6:mode==='warp'?6:mode==='small'?.1:0;
        const target=relative?{x:pose.x+offset,y:pose.y,z:pose.z}:{x:pose.x+offset,y:floorY+floorTop,z:pose.z};
        // Zero relative markers preserve current velocity/angles. They are not
        // treated as evidence of a positional rollback.
        const request={id,target,relative,time:Date.now(),replied:false,ack:false};positionRequests.push(request);
        const flags=['1.21.4','26.1'].includes(version)?(relative?{x:true,y:true,z:true,yaw:true,pitch:true}:{}):(relative?31:0);
        player.write('position',{x:relative?offset:target.x,y:relative?0:target.y,z:relative?0:target.z,dx:0,dy:0,dz:0,yaw:relative?0:pose.yaw,pitch:relative?0:pose.pitch,flags,teleportId:id});
        // Relative target must be based on the actual native receive position,
        // not the last sampled wire pose which can be one physics tick behind.
        await until(()=>request.ack&&request.replied);
        await sleep(100);
      };
      if(spec.correctionCase==='rollback'){
        for(let i=0;i<3;i++){
          await sendPosition('rollback');
          if(CLIENT_BUILD>=125)assert.equal(manager.autoBuild.status,'paused','pause immediately after first real correction; still acknowledge later requests');
        }
        await until(()=>manager.autoBuild.status==='paused');assert.equal(manager.autoBuild.reason,'server_corrections');
      }else if(spec.correctionCase==='warp'){
        await sendPosition('warp');assert.equal(manager.autoBuild.status,'paused');assert.equal(manager.autoBuild.reason,'server_teleport');
      }else{
        for(let i=0;i<12;i++){
          for(let n=0;n<40;n++)player.write('ping',{id:i*40+n});
          await sendPosition(spec.correctionCase==='marker'?'marker':'small');
        }
        assert.equal(manager.autoBuild.status,'running',JSON.stringify(manager.autoBuild.state()));
        assert.equal(manager._movementWatch.snapshot().realCorrections,0);assert(!manager._packetBudget.latched);
        assert.equal(manager._networkHealth.pongTx,manager._networkHealth.pingRx);
        manager.autoBuild.pause('manual');
      }
      manager.bot._client.removeListener('position',receiveTarget);
      await until(()=>!manager.autoBuild.worker);assert.equal(placements.length,0,'no placement after early position protection');
      assert(positionRequests.every(p=>p.ack&&p.replied),'native confirmation AND position reply are retained');assert.deepEqual(protocolErrors,[]);
      console.log(JSON.stringify({version,scenario:spec.name,status:manager.autoBuild.status,reason:manager.autoBuild.reason,requests:positionRequests.length,positions:manager._movementWatch.snapshot(),pong:manager._networkHealth.pongTx,ping:manager._networkHealth.pingRx,requiredPositionReplies:manager._packetBudget.snapshot().currentPositionReplies}));return;
    }
    if(spec.refillRace)manager.bot.on('kb:view-sent',()=>{
      if(refillRaceSent||manager.autoBuild.phase!=='aim')return;
      refillRaceSent=true;slots[36+quickbar]=null;
      player.write('set_slot',{windowId:0,stateId:++stateId,slot:36+quickbar,item:Item.toNotch(null)});
    });
    if(spec.noise)noiseTimer=setInterval(()=>{
      if(manager.autoBuild.status!=='running')return;
      const v=new Vec3(-25,y+20,-25),name=++noiseUpdates%2?'stone':'air';put(v,name);
      player.write('block_change',{location:v,type:data.blocksByName[name].minStateId});
    },50);
    const buildStartedAt=Date.now();
    const buildSpec={corner1:{x:spec.minX||0,y,z:spec.minZ||0},corner2:{x:spec.maxX,y:y+(spec.layers||1)-1,z:spec.maxZ||0},block:spec.block,fastWalk:!!spec.sprint,solidPattern:!!spec.pattern};
    const result = manager.startAutoBuild(buildSpec); assert(result.ok,JSON.stringify(result));
    if(spec.autoPassCase){
      const a=manager.autoBuild,b=manager.bot;
      assert.equal(a.autoPass,false);
      const rollback=async()=>{
        const p=b.entity.position,id=700+positionRequests.length,target={x:p.x+.35,y:p.y,z:p.z};
        const request={id,target,relative:false,time:Date.now(),replied:false,ack:false};positionRequests.push(request);
        player.write('position',{...target,dx:0,dy:0,dz:0,yaw:pose.yaw,pitch:pose.pitch,flags:['1.21.4','26.1'].includes(version)?{}:0,teleportId:id});
        await until(()=>request.ack&&request.replied);
      };
      await until(()=>a.placed>=3n&&a.status==='running'&&['walk','column_step'].includes(a.phase)||a.status==='paused',45000);assert.equal(a.status,'running');
      await rollback();assert.equal(a.status,'paused');assert.equal(a.reason,'server_corrections');
      const count=placements.length;await sleep(3300);assert.equal(a.status,'paused');assert.equal(placements.length,count,'default OFF never restarts');
      assert(a.setAutoPass(true).ok);assert(a.autoPassTask);
      await until(()=>a.status==='running');assert.equal(a.autoPassHistory.length,1);
      await until(()=>a.placed>=6n&&['walk','column_step'].includes(a.phase)||a.status==='paused',45000);assert.equal(a.status,'running');
      await rollback();await sleep(600);assert.equal(a.status,'paused');assert.equal(a.reason,'server_corrections');assert.equal(a.autoPassStatus,'limit');assert(!a.autoPassTask);
      assert(a.setAutoPass(false).ok);assert.equal(a.state().autoPass,false);
      assert.equal(tickOrderErrors,0);assert.deepEqual(protocolErrors,[]);
      console.log(JSON.stringify({version,scenario:spec.name,defaultOffNoRestart:true,liveEnableOneResume:true,secondCorrectionStops:true,actualServerAcknowledgements:positionRequests.filter(p=>p.ack&&p.replied).length,confirmed:String(a.placed),tickOrderErrors}));return;
    }
    let restartPrefix=0;
    if(spec.movingStop){
      const a=manager.autoBuild,b=manager.bot;
      await until(()=>a.placed>=3n&&a.phase==='walk'&&Math.hypot(b.entity.velocity.x,b.entity.velocity.z)>.02||a.status==='paused',45000);assert.equal(a.status,'running');
      const corner={...a.rows.corner},depth=a.rows.depth,speed=Math.hypot(b.entity.velocity.x,b.entity.velocity.z);
      a.stop('manual');restartPrefix=placements.length;
      assert(a.brakeDrain);assert(b.physicsEnabled);assert.equal(manager.startAutoBuild(buildSpec).error,'settling');
      await until(()=>!a.worker&&!a.brakeDrain);assert.equal(placements.length,restartPrefix);assert.equal(b.physicsEnabled,false);assert(Math.hypot(b.entity.velocity.x,b.entity.velocity.z)<.003);
      assert(manager.startAutoBuild(buildSpec).ok);assert.deepEqual(a.rows.corner,corner);assert.equal(a.rows.depth,depth);
      console.log(JSON.stringify({scenario:spec.name,movingStopSpeed:speed,naturalBrakeBeforePhysicsOff:true,noPlacementWhileStopped:true,pinnedCorner:corner,restartPrefix}));
    }
    if(spec.lifecycle){
      const a=manager.autoBuild;
      await until(()=>a.placed>=5n||a.status==='paused',45000);assert.equal(a.status,'running');
      const corner={...a.rows.corner},depth=a.rows.depth;
      a.pause('manual');await until(()=>!a.worker);
      assert(a.resume().ok);assert.deepEqual(a.rows.corner,corner);assert.equal(a.rows.depth,depth);
      await until(()=>placements.length>=12&&a.placed>=12n||a.status==='paused',45000);assert.equal(a.status,'running');
      a.stop('manual');await until(()=>!a.worker);restartPrefix=placements.length;
      assert(manager.startAutoBuild(buildSpec).ok);assert.deepEqual(a.rows.corner,corner);assert.equal(a.rows.depth,depth);
      console.log(JSON.stringify({scenario:spec.name,manualPauseResume:true,manualStopRestart:true,restartPrefix,pinnedCorner:corner,depth}));
    }
    let manualResumes=0;
    for(;;){
      await until(()=>['complete','paused'].includes(manager.autoBuild.status),spec.large?1800000:spec.rows||spec.wartRows||spec.pattern?360000:45000);
      // Long local scenario includes native inventory handoffs. Simulate the
      // user's explicit Resume only after an inventory safety pause settles;
      // production never resumes it automatically.
      if(!spec.tickLong||manager.autoBuild.status!=='paused'||manager.autoBuild.reason!=='inventory_changed'||manualResumes>=3)break;
      await until(()=>!manager.autoBuild.worker);await sleep(250);
      assert(manager.autoBuild.resume().ok);manualResumes++;
    }
    if(spec.permissionDenied){
      await until(()=>!manager.autoBuild.worker);
      assert.equal(manager.autoBuild.status,'paused');assert.equal(manager.autoBuild.reason,'permission_denied');
      assert.equal(placements.length,1,'one request, never automatically retry an explicit permission denial');
      assert.equal(manager.autoBuild.placed,0n);assert.equal(blockAt(new Vec3(...placements[0].target)).name,'air');
      assert(placements[0].ok,'valid real geometry is not permission to build');
      assert.deepEqual(protocolErrors,[]);assert(!manager._packetBudget.latched);
      console.log(JSON.stringify({version,scenario:spec.name,status:'paused',reason:'permission_denied',requests:1,confirmed:0,targetUnchanged:true}));return;
    }
    if(spec.lastGap&&process.env.EXPECT_GAP_PAUSE){assert.equal(manager.autoBuild.status,'paused');assert.equal(manager.autoBuild.reason,'row_route_blocked');assert.equal(placements.length,0);console.log('Baseline reproduced: occupied future rows cause row_route_blocked despite open 2x10 rear lane.');return;}
    assert.equal(manager.autoBuild.status,'complete',JSON.stringify({state:manager.autoBuild.state(),placements,log:lines.filter(x=>x.includes('Auto Build')).slice(-8)}));
    if(spec.refillRace){assert(refillRaceSent);assert(clicks>=2,'real native inventory refill');assert.equal(manualResumes,0);console.log('Native inventory change during aim: refilled automatically without manual Resume.');}
    if(spec.tickLong)console.log(JSON.stringify({scenario:spec.name,manualInventoryResumes:manualResumes}));
    const expected=(spec.pattern?-1:0)+(spec.lastGap?1:(spec.maxX-(spec.minX||0)+1)*(spec.layers||1)*((spec.maxZ||0)-(spec.minZ||0)+1)-(spec.prefilled?.length||0)-(spec.latePrefill?.cells.length||0));
    if(!spec.large){assert.equal(placements.length,expected+digPackets.filter(p=>p.status===2).length);assert(placements.every(p=>p.ok));}
    if(spec.large){
      const accepted=placements.filter(p=>p.ok),rejected=placements.filter(p=>!p.ok),attempts=new Map(),confirmed=new Set();
      for(const p of placements){const k=p.target.join(',');attempts.set(k,(attempts.get(k)||0)+1);if(p.ok){assert(!confirmed.has(k),'a cell may only be confirmed once');confirmed.add(k);}}
      // The builder already allows at most three placement attempts from
      // different stances. Count real server confirmations, not wire attempts.
      // Keep all refusals visible; never count a rejection as a filled cell.
      console.log(JSON.stringify({scenario:spec.name,attempts:placements.length,confirmed:accepted.length,rejected}));
      assert.equal(digPackets.length,0,'this open one-layer fixture needs no rescue digging');
      assert.equal(accepted.length,expected);
      assert([...attempts.values()].every(n=>n<=3),'bounded attempts for every target');
      for(let x=spec.minX||0;x<=spec.maxX;x++)for(let z=spec.minZ||0;z<=spec.maxZ;z++)assert.equal(blockAt(new Vec3(x,y,z)).name,spec.block);
      assert.equal(manager.autoBuild.placed,BigInt(expected));assert.equal(manager.autoBuild.safety.repairs.size,0);
      assert(clicks<=Math.ceil(expected/64)*3,'no per-block inventory swapping');
    }
    if(spec.pattern){
      const a=manager.autoBuild,r=a.rows,last=r.last(y),groups=new Map();
      if(spec.columnSteps){assert(lines.some(l=>l.includes('solid column step')&&l.includes('band=2 ')),'third normal band must use native short controller');assert(lines.some(l=>l.includes('solid column settled')&&l.includes('band=2 ')));}
      if(spec.prefilledFrontier)assert.equal(placements[0].rowIndex,'12','first placement starts at the empty frontier, never the filled corner');
      if(spec.lifecycle){assert.equal(lines.filter(l=>l.includes('solid corner')).length,1);assert.equal(lines.filter(l=>l.includes('solid checkpoint restored')).length,1);assert(lines.some(l=>l.includes('solid continue')&&l.includes('index='+restartPrefix+' ')));}
      assert.equal(a.manualRemaining,1);assert.equal(a.reason,'manual_last_block');assert.deepEqual(a.manualTarget,last);
      assert.equal(blockAt(new Vec3(last.x,last.y,last.z)).name,'air');
      assert.equal(a.cursor,a.area.total-1n);assert.equal(a.skipped,BigInt(restartPrefix+(spec.prefilled?.length||0)));assert.equal(a.placed,BigInt(expected-restartPrefix));
      assert.equal(digPackets.length,0);assert(!lines.some(l=>l.includes('straight seed line')));
      assert(placements.every((p,i)=>p.ok&&!p.seed&&p.openSide&&(!i||BigInt(p.rowIndex)>BigInt(placements[i-1].rowIndex))));
      for(const p of placements){const cell={x:p.target[0],y:p.target[1],z:p.target[2]};if(r.terminal(cell))continue;const id=r.describe(cell).band+':'+cell[r.cross];if(!groups.has(id))groups.set(id,[]);groups.get(id).push(p);}
      for(const group of groups.values()){
        assert.equal(group.length,3);assert(group.every((p,i)=>!i||p.target[r.depth==='x'?0:2]-group[i-1].target[r.depth==='x'?0:2]===r.sign));
        assert(group.every(p=>Math.hypot(p.pose.x-group[0].pose.x,p.pose.z-group[0].pose.z)<.025),'one actual stationary stance for each normal trio');
      }
      for(let i=0n;i<a.area.layer-1n;i++){const p=r.cell(i,y);assert.equal(blockAt(new Vec3(p.x,p.y,p.z)).name,spec.block);}
      console.log(JSON.stringify({scenario:spec.name,corner:r.corner,depth:r.depth,trios:groups.size,confirmed:placements.length,manualRemaining:a.manualRemaining,manualTarget:last,noSeedLine:true,fixedSharedStances:true,noiseUpdates}));
    }
    if(spec.wartRows){
      const r=manager.autoBuild.rows,groups=new Map();
      for(const p of placements){assert(p.ok&&p.openSide);const cell={x:p.target[0],y:p.target[1],z:p.target[2]},id=r.describe(cell).band+':'+cell[r.cross];if(!groups.has(id))groups.set(id,[]);groups.get(id).push(p);}
      for(const group of groups.values()){assert(group.length<=3);for(const p of group)assert(Math.hypot(p.pose.x-group[0].pose.x,p.pose.z-group[0].pose.z)<.02,'three crops from one shared stance');}
      assert(placements.every((p,i)=>!i||BigInt(p.rowIndex)>BigInt(placements[i-1].rowIndex)),'pinned crop strip order');
      if(CLIENT_BUILD>=128){
        let terminalGroups=0;
        for(const group of groups.values()){
          const first=group[0],cell={x:first.target[0],y:first.target[1],z:first.target[2]},info=r.describe(cell);
          if(info.band*3+info.len<Number(r.length))continue;
          terminalGroups++;
          for(const p of group){const i=r.depth==='x'?0:2;assert((p.aim[i]-p.pose[r.depth])*r.sign<0,'terminal clicks stay on one side of actual stance');}
          assert(group.every(p=>difference(p.pose.yaw,first.pose.yaw)<90),'no terminal 180-degree turn within a trio');
        }
        console.log(JSON.stringify({terminalGroups,terminalClicksOneSide:true,noTrioCentreStance:true}));
      }

      assert(strafeTicks>0,'adjacent crop strips use real A/D');assert(physicalStep<spec.serverSpeed*1.3,'received server speed must not be ignored: '+physicalStep);
      assert(inputFrames>20&&inputPackets<(spec.tickLong?expected*10:240),'native actual keys, no tick input spam: '+JSON.stringify({inputFrames,inputPackets}));assert.equal(digPackets.length,0);
      assert.equal(manager.bot.entity.attributes['minecraft:movement_speed'].value,spec.serverSpeed*.75);
      assert.equal(manager._movementWatch.snapshot().realCorrections,0);
      console.log(JSON.stringify({cropGroups:groups.size,strafeTicks,inputFrames,inputPackets,maxHeadingError,serverSpeed:spec.serverSpeed,finalServerSpeed:spec.serverSpeed*.75,threeFromOneStance:true}));
    }
    if(spec.edge){
      assert.equal(manager.autoBuild.placed,2n);assert.equal(placements.length,2);assert.equal(digPackets.length,0);assert(strafeTicks>0,'two adjacent rows use real lateral input');
      assert.equal(manager.bot.blockAt(new Vec3(16,y,14)),null,'unopened neighbour stays unknown');
      assert(events.filter(e=>e.type==='place').every(e=>e.pose.x>=spec.groundBounds.minX+.299&&e.pose.x<=spec.groundBounds.maxX+.701&&e.pose.z>=spec.groundBounds.minZ+.299&&e.pose.z<=spec.groundBounds.maxZ+.701),'stand entirely on the two loaded tiles');
      console.log('Skyblock edge: last two line cells confirmed from loaded 1x2 ledge, neighbouring chunks remain unknown, no forced excursion/dig.');
    }
    if(spec.lastGap){for(let x=spec.minX||0;x<=spec.maxX;x++)for(let z=spec.minZ||0;z<=spec.maxZ;z++)assert.equal(blockAt(new Vec3(x,y,z)).name,spec.block);assert.equal(manager.autoBuild.placed,1n);assert.equal(manager.autoBuild.skipped,71n);assert.equal(manager.autoBuild.safety.broken,0);console.log('Last gap confirmed; occupied future rows skipped; open 2x10 rear lane preserved.');}
    if(spec.rows){
      assert(placements.every(p=>p.ok&&p.openSide),'wire placement must be from the open working side, not behind the strip');
      assert(placements.every(p=>p.pose.y<=p.target[1]+.001),'never climb onto the new roof');
      const seeded=placements.filter(p=>p.seed),normal=placements.filter(p=>!p.seed),axis=manager.autoBuild.rows.depth,cross=manager.autoBuild.rows.cross,i=axis==='x'?0:2,j=cross==='x'?0:2;
      assert(seeded.every((p,n)=>!n||p.target[j]===seeded[n-1].target[j]&&Math.abs(p.target[i]-seeded[n-1].target[i])===1),'one straight seed line, no stepped frame');
      assert(normal.every((p,n)=>!n||BigInt(p.rowIndex)>BigInt(normal[n-1].rowIndex)),'pinned three-deep strip order, no frontier drift');
      for(let x=spec.minX||0;x<=spec.maxX;x++)for(let z=spec.minZ||0;z<=spec.maxZ;z++)assert.equal(blockAt(new Vec3(x,y,z)).name,spec.block);
      assert.equal(manager.autoBuild.safety.broken,0);assert.equal(manager.autoBuild.safety.repairs.size,0);
      console.log(JSON.stringify({scenario:spec.name,floorFeet:floorY+floorTop,targetY:y,confirmed:placements.length,seedLine:seeded.length,stripPlacements:normal.length,openWorkingSide:true,aligned:true,rescueBreaks:0}));
      if(spec.pace){
        const r=manager.autoBuild.rows,byBand=[];
        for(let band=0;band<Math.ceil(Number(r.length)/3);band++){
          const ps=normal.filter(p=>r.describe({x:p.target[0],y:p.target[1],z:p.target[2]}).band===band);
          const gaps=ps.slice(1).map((p,i)=>p.time-ps[i].time).sort((a,b)=>a-b);
          byBand.push({band,cells:ps.length,medianGapMs:gaps[Math.floor(gaps.length/2)]??null});
        }
        if(CLIENT_BUILD>=123)assert(strafeTicks>10,'solid full and terminal strips must actually use native A/D');
        if(CLIENT_BUILD>=123&&spec.skipTransition)assert(skippedStrafeTicks>3&&latePrefillDone,'actual A/D across filled near/far cells, without empty-cell skipping');
        console.log(JSON.stringify({scenario:spec.name,package:CLIENT_BUILD,strafeTicks,skippedStrafeTicks,placementTempo:byBand}));
      }
    }
    assert(placements.every((p,i)=>!i||p.target[1]>=placements[i-1].target[1]));
    if(spec.rows&&spec.floor==='soul_sand')assert(physicalStep<.14,'partial-floor row must retain native soul-sand walk slowdown');
    assert(physicalStep<.5,'native per-tick horizontal movement, no teleport during work: '+physicalStep);assert(maxStep<2,'bounded wire displacement: '+maxStep);
    if(spec.slot===9)assert(clicks>=2,'actual main-inventory to hotbar transfer');
    if(spec.startX< -4)assert(pose.x>startPose.x+3,'real approach, not just nearby placement');
    if(spec.floor!=='crafting_table')assert(placements.every(p=>!p.crouch),'no unnecessary crouch on normal floor');
    if(spec.floor==='crafting_table')assert(placements.some(p=>p.crouch),'interactive support requires crouch');
    assert(lines.some(x=>x.includes('-> block_place')),'logging enabled after connect must show outgoing placement');
    assert(lines.some(x=>x.includes('[Auto Build/'+CLIENT_BUILD+'] confirmed')));assert.deepEqual(protocolErrors,[]);
    if(checkTicks){
      assert(tickEnds>10,'real native loaded ticks must emit end markers, including idle frames');
      assert.equal(tickOrderErrors,0);
      assert(manager._clientTicks.ended>=tickEnds&&manager._clientTicks.ended-tickEnds<=4,'one received marker per native tick, not an independent extra timer');
      console.log(JSON.stringify({scenario:spec.name,tickEnds,normalMotion,tickOrderErrors,nativeTicks:manager._clientTicks.ended}));
    }
    let wirePeakSecond=0,wirePeak100ms=0,motionPeak100ms=0;const recent=[];for(const p of sentTimes){recent.push(p);while(p.t-recent[0].t>=1000)recent.shift();wirePeakSecond=Math.max(wirePeakSecond,recent.length);const short=recent.filter(q=>p.t-q.t<100);wirePeak100ms=Math.max(wirePeak100ms,short.length);motionPeak100ms=Math.max(motionPeak100ms,short.filter(q=>/^(look|position|position_look)$/.test(q.n)).length);}assert(motionPeak100ms<=3,'motion spacing across real wire');
    if(CLIENT_BUILD>=116)assert(placementSendTimes.every((t,i)=>!i||t-placementSendTimes[i-1]>=275),'native placement sends stay spaced');
    console.log(JSON.stringify({version,elapsedMs:Date.now()-buildStartedAt,minPlaceSendGapMs:placementSendTimes.length>1?Math.min(...placementSendTimes.slice(1).map((t,i)=>t-placementSendTimes[i])):null,wirePeakSecond,wirePeak100ms,motionPeak100ms,scenario:spec.name,placed:placements.length,nativeInventoryClicks:clicks,moves,maxHorizontalStep:+maxStep.toFixed(3),maxPhysicalStep:+physicalStep.toFixed(3),maxPitchError:+Math.max(...placements.map(p=>p.pitchError)).toFixed(3),traffic:manager._packetBudget.snapshot()}));
  } finally { clearInterval(noiseTimer);manager?.disconnect();player?.end();if(server) { const closed = once(server.socketServer, 'close'); server.close(); await closed; } }
}
async function main() {
  const versions = process.env.LOCAL_MC_VERSION?[process.env.LOCAL_MC_VERSION]:(process.env.BUILD_INPUT?['1.21.4','26.1']:['1.20.1','1.21.4']);
  const specs = [
    ...(process.env.BUILD_PATTERN?[
      {name:'solid-pattern-auto-pass-live-toggle',pattern:true,autoPassCase:true,block:'soul_sand',floor:'soul_sand',floorY:69,targetY:71,slot:36,maxX:3,maxZ:6,seed:{x:0,z:-1},startX:.5,startZ:3.5},
      {name:'solid-pattern-third-band-column-step',pattern:true,columnSteps:true,serverSpeed:.1008,block:'soul_sand',floor:'soul_sand',floorY:69,targetY:71,slot:36,maxX:3,maxZ:12,seed:{x:0,z:-1},startX:.5,startZ:3.5},
      {name:'solid-pattern-prefilled-frontier-no-checkpoint',pattern:true,prefilledFrontier:true,block:'soul_sand',floor:'soul_sand',floorY:69,targetY:71,slot:36,maxX:3,maxZ:6,seed:{x:0,z:-1},startX:3.5,startZ:6.5,prefilled:Array.from({length:12},(_,i)=>({x:Math.floor(i/3),z:i%3}))},
      {name:'solid-pattern-moving-stop-restart',pattern:true,movingStop:true,block:'soul_sand',floor:'soul_sand',floorY:69,targetY:71,slot:36,maxX:3,maxZ:6,seed:{x:0,z:-1},startX:.5,startZ:3.5},
      {name:'solid-pattern-manual-pause-stop-restart',pattern:true,lifecycle:true,block:'soul_sand',floor:'soul_sand',floorY:69,targetY:71,slot:36,maxX:3,maxZ:6,seed:{x:0,z:-1},startX:.5,startZ:3.5},
      {name:'solid-pattern-explicit-permission-stop',pattern:true,permissionDenied:true,block:'soul_sand',floor:'soul_sand',floorY:69,targetY:71,slot:36,maxX:3,maxZ:6,seed:{x:0,z:-1},startX:.5,startZ:3.5},
      {name:'solid-pattern-roof-soul-sand',pattern:true,block:'soul_sand',floor:'soul_sand',floorY:69,targetY:71,slot:36,maxX:3,maxZ:6,seed:{x:0,z:-1},startX:.5,startZ:3.5},
      {name:'solid-pattern-log-height-7x46-no-exterior-platform',pattern:true,noise:true,block:'soul_sand',floor:'soul_sand',floorY:69,targetY:71,slot:36,maxX:6,maxZ:45,seed:{x:6,z:-1},startX:5.864,startZ:5.189,groundBounds:{minX:0,maxX:6,minZ:0,maxZ:45}},
      {name:'solid-pattern-X-reverse-terminal-two',pattern:true,block:'stone',floor:'stone',floorY:64,targetY:66,slot:9,maxX:7,maxZ:3,seed:{x:8,z:3},startX:4.5,startZ:3.5}
    ]:[]),
    ...(process.env.BUILD_REFILL?[{name:'native-refill-during-aim',refillRace:true,block:'nether_wart',floor:'soul_sand',slot:36,maxX:5,startX:-1.5}]:[]),
    ...(process.env.BUILD_TICK_LONG?[{name:'tick-long-180-wart-native-inventory-handoffs',tickLong:true,wartRows:true,serverSpeed:.1004,block:'nether_wart',floor:'soul_sand',slot:36,maxX:8,maxZ:19,startX:-1.5}]:[]),
    ...(process.env.BUILD_PERMISSION?[{name:'explicit-island-build-permission-denied',permissionDenied:true,block:'nether_wart',floor:'soul_sand',slot:36,maxX:2,startX:-1.5}]:[]),
    ...(process.env.BUILD_SOLID_PACE?[
      {name:'solid-pace-two-full-strips-and-terminal-two',pace:true,rows:true,block:'soul_sand',floor:'soul_sand',floorY:67,targetY:69,slot:36,maxX:7,maxZ:7,seed:{x:-1},startX:-1.5},
      {name:'solid-pace-terminal-one',pace:true,rows:true,block:'soul_sand',floor:'soul_sand',floorY:67,targetY:69,slot:36,maxX:6,maxZ:5,seed:{x:-1},startX:-1.5},
      {name:'solid-pace-Z-axis-offset-entry',pace:true,rows:true,block:'soul_sand',floor:'soul_sand',floorY:67,targetY:69,slot:36,maxX:7,maxZ:7,seed:{x:0,z:-1},startX:0.0,startZ:-1.5,serverSpeed:.1004},
      {name:'solid-pace-prefilled-near-and-far',pace:true,rows:true,block:'soul_sand',floor:'soul_sand',floorY:67,targetY:69,slot:36,maxX:7,maxZ:4,seed:{x:-1},startX:-1.5,prefilled:[{x:7,z:3}],latePrefill:{after:{x:6,z:2},cells:[{x:5,z:2}]},skipTransition:{x:6,z:3}}
    ]:[]),
    ...(process.env.BUILD_SPEED_LOCK?[{name:'real-zero-speed-and-release',movementLock:'zero',serverSpeed:0,block:'nether_wart',floor:'soul_sand',slot:36}]:[]),
    ...(process.env.BUILD_WART_ROWS?[
      {name:'wart-three-deep-X-server-speed',wartRows:true,block:'nether_wart',floor:'soul_sand',slot:9,maxX:6,maxZ:6,startX:-1.5,startZ:3.5,serverSpeed:.06},
      {name:'wart-three-deep-Z-server-speed',wartRows:true,block:'nether_wart',floor:'soul_sand',slot:36,maxX:6,maxZ:6,startX:3.5,startZ:-1.5,serverSpeed:.04}
    ]:[]),
    ...(process.env.BUILD_INPUT?[
      {name:'native-turn-and-input-flat',inputTurns:true,block:'stone',floor:'stone',slot:36},
      {name:'native-turn-and-input-soul-sand',inputTurns:true,block:'stone',floor:'soul_sand',slot:36}
    ]:[]),
    ...(process.env.BUILD_CORRECTIONS?[
      {name:'repeated-real-rollback-pauses',correctionCase:'rollback',block:'stone',floor:'soul_sand',slot:36,startX:-12.5},
      {name:'zero-relative-marker-with-ping-burst',correctionCase:'marker',block:'stone',floor:'soul_sand',slot:36,startX:-12.5},
      {name:'small-adjustments-with-ping-burst',correctionCase:'small',block:'stone',floor:'stone',slot:36,startX:-12.5},
      {name:'large-server-move-pauses',correctionCase:'warp',block:'stone',floor:'stone',slot:36,startX:-12.5}
    ]:[]),
    ...(process.env.BUILD_LARGE?[{name:'large-600-one-layer',block:'stone',floor:'stone',slot:36,maxX:29,maxZ:19,startX:-1.5,large:true}]:[]),
    ...(process.env.BUILD_LASTGAP?[{name:'last-gap-with-open-2x10-rear-lane',lastGap:{x:3,z:11},block:'stone',floor:'stone',floorY:82,targetY:85,slot:36,maxX:5,maxZ:11,startX:2.5,startZ:5.5,groundBounds:{minX:1,maxX:6,minZ:2,maxZ:11}}]:[]),
    ...(process.env.BUILD_EDGE?[
      {name:'skyblock-unopened-edge-last-Z-line',edge:true,rows:true,block:'soul_sand',floor:'soul_sand',floorY:65,targetY:67,slot:36,minX:14,maxX:14,minZ:14,maxZ:15,seed:{x:13,z:14},startX:15.5,startZ:14.5,groundBounds:{minX:15,maxX:15,minZ:14,maxZ:15}},
      {name:'skyblock-unopened-edge-last-X-line',edge:true,rows:true,block:'soul_sand',floor:'soul_sand',floorY:65,targetY:67,slot:36,minX:14,maxX:15,minZ:14,maxZ:14,seed:{x:14,z:13},startX:14.5,startZ:15.5,groundBounds:{minX:14,maxX:15,minZ:15,maxZ:15}}
    ]:[]),
    ...(process.env.BUILD_26?[{name:'26.1-seven-by-seven-fractional-floor',rows:true,block:'soul_sand',floor:'soul_sand',floorY:65,targetY:67,slot:36,maxX:6,maxZ:6,seed:{x:-1},startX:5.316,startZ:1.314}]:[]),
    ...(process.env.BUILD_ROWS?[
      {name:'rows-fractional-Y83-to-Y85-no-trap',rows:true,block:'soul_sand',floor:'soul_sand',floorY:83,targetY:85,slot:9,maxX:11,maxZ:5,seed:{x:-1},startX:-1.5},
      {name:'rows-full-Y83-to-Y85-three-deep',rows:true,block:'stone',floor:'stone',floorY:82,targetY:85,slot:9,maxX:8,maxZ:3,seed:{x:-1},startX:-1.5}
    ]:[]),
    {name:'wart-hotbar-downward-pitch',block:'nether_wart',floor:'soul_sand',slot:36,maxX:6},
    {name:'wart-main-inventory-approach',block:'nether_wart',floor:'soul_sand',slot:9,maxX:6,startX:-5.5},
    {name:'soul-sand-main-inventory-two-layers',block:'soul_sand',floor:'stone',slot:9,maxX:2,layers:2,startX:-8.5},
    {name:'stone-on-fractional-soul-sand',block:'stone',floor:'soul_sand',slot:9,maxX:6,startX:-5.5},
    {name:'elevated-seed-expands-Y68',block:'soul_sand',floor:'stone',slot:9,minX:0,maxX:5,targetY:68,seed:{x:-1},startX:-1.5},
    {name:'elevated-reverse-seed',block:'stone',floor:'stone',slot:9,minX:0,maxX:5,targetY:68,seed:{x:6},startX:7.5},
    {name:'obstructed-angle-auto-detour',block:'stone',floor:'stone',slot:36,minX:4,maxX:5,obstacle:true,startX:-1.5},
    {name:'wide-solid-fill-no-self-trap',block:'stone',floor:'stone',slot:36,maxX:3,maxZ:3,layers:2,startX:.5},
    {name:'native-rescue-break-exit-fill-reseal',block:'dirt',floor:'stone',slot:9,maxX:1,rescue:true},
    {name:'interactive-support-crouch-eye',block:'stone',floor:'crafting_table',slot:36,maxX:1,startX:-1.5}
  ];
  const selected=specs.filter(s=>(!process.env.BUILD_PATTERN||s.pattern)&&(!process.env.BUILD_REFILL||s.refillRace)&&(!process.env.BUILD_TICK_LONG||s.tickLong)&&(!process.env.BUILD_PERMISSION||s.permissionDenied)&&(!process.env.BUILD_SOLID_PACE||s.pace)&&(!process.env.BUILD_CORRECTIONS||s.correctionCase)&&(!process.env.BUILD_LARGE||s.large)&&(!process.env.BUILD_ROWS||s.rows)&&(!process.env.BUILD_LASTGAP||s.lastGap)&&(!process.env.BUILD_CASE||s.name.includes(process.env.BUILD_CASE))&&(!process.env.BUILD_26||s.name.startsWith('26.1-'))&&(!process.env.BUILD_INPUT||s.inputTurns)&&(!process.env.BUILD_EDGE||s.edge)&&(!process.env.BUILD_WART_ROWS||s.wartRows)&&(!process.env.BUILD_SPEED_LOCK||s.movementLock));
  for (const version of versions) for(const spec of selected)await scenario(version,spec);
  console.log(`Full native-client network build tests passed: ${versions.length*selected.length} scenarios.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
