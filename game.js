'use strict';
(() => {
const canvas=document.getElementById('arena');
let presentation;
try { presentation=new window.SiegeRenderer(canvas); } catch(error) {
  document.getElementById('message').textContent='This game needs WebGL. Enable hardware acceleration and reload.';
  document.getElementById('start').disabled=true;
  console.error(error); return;
}
const $=id=>document.getElementById(id), W=1200,H=720,TOP=245,BOTTOM=651;
const colors=['#ff7661','#65cde5'],bases=[{x:115,y:TOP+12},{x:1085,y:TOP+12}];
// Shuffle resource types and jitter their positions once per match, then mirror
// the entire left half. Spaced slots keep resources clear of each other.
function shuffle(values){for(let i=values.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[values[i],values[j]]=[values[j],values[i]]}return values}
function createResources(){
  const slots=[];
  for(const y of [335,445,555])for(const x of [190,290,390,490])slots.push({x,y});
  shuffle(slots);
  const types=shuffle(['missile','missile','missile','missile','missile','missile','fuel','unit','unit']);
  const left=types.map((type,i)=>({type,x:slots[i].x+Math.round(Math.random()*28-14),y:slots[i].y+Math.round(Math.random()*28-14),alive:true}));
  return [...left,...left.map(item=>({...item,x:W-item.x}))];
}
let mode='ai',state='menu',side=0,turns=[0,0],hp=[100,100],items=[],tunnels=[],saw=null,shots=[],units=[],particles=[],waypoints=[],aiIndex=0,clock=0,last=0,toastTime=0,shake=0,sound=true,audio=null,keys={},pointer=null,resolveTime=0;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t)}
function inside(p,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!=(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes}return yes}
function tone(f,d=.1){if(!sound)return;try{audio??=new(window.AudioContext||window.webkitAudioContext)();audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.frequency.setValueAtTime(f,audio.currentTime);o.frequency.exponentialRampToValueAtTime(f*.5,audio.currentTime+d);g.gain.setValueAtTime(.07,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+d);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+d)}catch{}}
function toast(t){$('toast').textContent=t;toastTime=2}
let previousHP=[100,100],previousSaws=[-1,-1],sawResults=[Array(5).fill("ready"),Array(5).fill("ready")];
function remainingSaws(team){return sawResults[team].filter(result=>result!=='lost').length}
function hud(){
  for(let s=0;s<2;s++){
    const name=s?'blue':'red';$(name+'HP').textContent=hp[s];$(name+'Count').textContent=remainingSaws(s);
    $(name+'Fill').style.width=hp[s]+'%';$(name+'Lag').style.width=hp[s]+'%';
    $(name+'Health').setAttribute('aria-valuenow',hp[s]);
    $(name+'Team').classList.toggle('active',s===side);
    if(hp[s]<previousHP[s]){$(name+'Team').classList.remove('damaged');void $(name+'Team').offsetWidth;$(name+'Team').classList.add('damaged')}
    const inventoryKey=turns[s]+sawResults[s].join();
    if(inventoryKey!==previousSaws[s]){
      $(name+'Saws').innerHTML=sawResults[s].map(result=>`<i class="saw-slot ${result}" title="${result}"><span class="blade-icon"></span>${result==='saved'?'<em>✓</em>':result==='lost'?'<em>×</em>':''}</i>`).join('');
      $(name+'Saws').setAttribute('aria-label',`${remainingSaws(s)} saws remaining`);previousSaws[s]=inventoryKey;
    }
  }
  previousHP=[...hp];
  $('turn').textContent=state==='menu'?'READY':`${side?'BLUE':'RED'} · ${turns[0]+turns[1]+(state==='ready'?1:0)}`;
  $('turnDot').style.background=colors[side];
}
function reset(){sawResults=[Array(5).fill('ready'),Array(5).fill('ready')];for(const name of ['red','blue']){$(name+'Inventory').setAttribute('data-outcome','ready');$(name+'Inventory').classList.remove('inventory-focus');$(name+'SawFeedback').textContent='READY'}$('resultPanel').removeAttribute('data-result');turns=[0,0];hp=[100,100];side=0;items=createResources();tunnels=[];shots=[];units=[];particles=[];saw=null;pointer=null;keys={};state='ready';$('overlay').classList.add('hidden');toast('Loop rockets. Touch units to recruit.');hud()}
function launch(){if(state!=='ready')return;const slot=sawResults[side].findIndex(result=>result==='ready'||result==='saved');if(slot<0){next();return}const b=bases[side];saw={x:b.x,y:b.y,angle:Math.PI/2,fuel:100,path:[{...b}],distance:0,slot};turns[side]++;state='dig';pointer=null;sawResults[side][slot]='active';focusSaw('active');if(side===1&&mode==='ai')planAI();tone(170);hud()}
function planAI(){const b=bases[side],targets=items.filter(i=>i.alive&&i.type==='missile'&&i.x>600).sort((a,c)=>dist(a,b)-dist(c,b));if(!targets.length){const distant=items.filter(i=>i.alive&&i.type==='missile').sort((a,c)=>dist(a,b)-dist(c,b))[0],miner=items.filter(i=>i.alive&&i.type==='unit').sort((a,c)=>dist(a,b)-dist(c,b))[0];waypoints=distant?[{x:distant.x,y:distant.y}]:miner?[{x:miner.x,y:miner.y},{x:miner.x,y:BOTTOM+40}]:[{x:W+40,y:b.y}];aiIndex=0;return}const t=targets[0],r=47;
// The AI digs the same physical path as a player, including pickup and collision checks.
waypoints=[{x:b.x,y:t.y+r},{x:t.x-r,y:t.y+r},{x:t.x-r,y:t.y-r},{x:b.x,y:t.y-r},{...b}];
const remaining=targets.filter(i=>i!==t&&Math.abs(i.y-t.y)<65&&i.x<t.x&&i.x>t.x-180);if(remaining.length&&turns[1]%2===0){const left=Math.min(...remaining.map(i=>i.x))-r;waypoints[1].x=left;waypoints[2].x=left}
aiIndex=0}
function aiTarget(){let target=waypoints[aiIndex];if(target&&dist(saw,target)<9){aiIndex++;target=waypoints[aiIndex]}if(saw.fuel<30&&dist(saw,bases[side])>saw.fuel*7.7-20){const emergency=items.filter(i=>i.alive&&i.type==='missile'&&dist(saw,i)<saw.fuel*7.7+16).sort((a,b)=>dist(saw,a)-dist(saw,b))[0];if(emergency)target=emergency;else{const tank=items.filter(i=>i.alive&&i.type==='fuel'&&dist(saw,i)<saw.fuel*7.7+16).sort((a,b)=>dist(saw,a)-dist(saw,b))[0];if(tank)target=tank}}return target}
function burst(x,y,color,n=20){for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,v=30+Math.random()*130;particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.5+Math.random()*.5,color})}}
function recruit(item){item.alive=false;units.push({x:item.x,y:item.y,side,phase:'dig',timer:0,hit:false,path:[{x:item.x,y:item.y}]});burst(item.x,item.y,colors[side],8);tone(650,.15);toast('UNIT RECRUITED')}
function updateUnits(dt){
  for(const unit of units){
    if(unit.phase==='done')continue;
    if(unit.phase==='dig'){
      unit.y=Math.max(207,unit.y-215*dt);
      if(dist(unit,unit.path[unit.path.length-1])>5)unit.path.push({x:unit.x,y:unit.y});
      if(unit.y===207){unit.phase='march';unit.path.push({x:unit.x,y:unit.y});burst(unit.x,TOP,'#d6b27a',10)}
    }else if(unit.phase==='march'){
      const target=unit.side===0?1030:170,delta=target-unit.x;
      unit.x+=Math.sign(delta)*Math.min(Math.abs(delta),160*dt);
      if(Math.abs(target-unit.x)<1){unit.phase='attack';unit.timer=0}
    }else if(unit.phase==='attack'){
      unit.timer+=dt;
      if(unit.timer>=.28&&!unit.hit){unit.hit=true;const enemy=1-unit.side;hp[enemy]=Math.max(0,hp[enemy]-5);burst(enemy?1080:120,195,'#ffe49c',20);shake=5;tone(95,.18);toast('UNIT STRIKE · −5');hud();if(hp[enemy]===0&&state==='dig')finish('victory')}
      if(unit.timer>.8)unit.phase='done';
    }
  }
}
function focusSaw(outcome){
  const name=side?'blue':'red',card=$(name+'Inventory');
  card.setAttribute('data-outcome',outcome);card.classList.remove('inventory-focus');void card.offsetWidth;card.classList.add('inventory-focus');
  $(name+'SawFeedback').textContent=outcome==='saved'?'✓ SAW SAVED':outcome==='lost'?'× SAW DESTROYED':'SAW IN RUN';
}
function finish(reason,hit){if(state!=='dig')return;sawResults[side][saw.slot]=reason==='return'?'saved':'lost';focusSaw(reason==='return'?'saved':'lost');const captured=hit?[hit]:reason==='return'?items.filter(i=>i.alive&&i.type==='missile'&&inside(i,saw.path)):[];if(reason==='return'){saw.returned=true;saw.x=bases[side].x;saw.y=bases[side].y;saw.path.push({...bases[side]});tone(520);toast(captured.length?`${captured.length} MISSILE${captured.length>1?'S':''} CAPTURED`:'SAW SAVED')}else if(reason==='victory'){tone(600,.25);toast('CASTLE DOWN')}else{if(hit){saw.destroyedAt=clock;saw.destroyedSide=side;saw.destroyedAngle=clock*18;shake=5;burst(saw.x,saw.y,'#ffe5a0',26);burst(saw.x,saw.y,'#e4eff1',10);tone(650,.07)}burst(saw.x,saw.y,colors[side]);tone(80,.25);toast(hit?'SAW DESTROYED':'SAW LOST')}
tunnels.push({path:saw.path.map(p=>({...p})),side});captured.forEach((m,i)=>{m.alive=false;shots.push({x:m.x,y:m.y,start:{x:m.x,y:m.y},side,t:-i*.25,hit:false})});state='resolve';resolveTime=1.3;hud()}
function next(){
  if(hp[0]<=0||hp[1]<=0||remainingSaws(0)===0&&remainingSaws(1)===0){
    state='end';
    const result=hp[0]===hp[1]?'draw':hp[0]>hp[1]?'red':'blue';
    $('resultPanel').setAttribute('data-result',result);
    $('overlay').classList.remove('hidden');$('options').style.display='none';
    $('message').innerHTML=`<strong class="winner winner--${result}">${result==='draw'?'DRAW':result.toUpperCase()+' WINS'}</strong><span class="result-score"><span class="score-red">Red ${hp[0]} HP</span><span class="score-blue">Blue ${hp[1]} HP</span></span>`;
    $('start').innerHTML='PLAY AGAIN ↻';$('hint').textContent='Save saws. Keep fighting.';tone(600,.3);hud();return;
  }
  const opponent=1-side,skipped=remainingSaws(opponent)===0;if(!skipped)side=opponent;saw=null;state='ready';resolveTime=.8;toast(skipped?(side?'BLUE AGAIN':'RED AGAIN'):side===1&&mode==='ai'?'BLUE IS PLANNING':'SPACE / TAP TO LAUNCH');hud();
}
function update(dt){clock+=dt;if(toastTime>0){toastTime-=dt;if(toastTime<=0)$('toast').textContent=''}shake=Math.max(0,shake-dt*30);particles=particles.filter(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=160*dt;return p.life>0});updateUnits(dt);
if(state==='ready'&&side===1&&mode==='ai'){resolveTime-=dt;if(resolveTime<=0)launch()}
if(state==='dig'){let target=null;if(side===1&&mode==='ai'){target=aiTarget()}else{const dx=(keys.ArrowRight||keys.d?1:0)-(keys.ArrowLeft||keys.a?1:0),dy=(keys.ArrowDown||keys.s?1:0)-(keys.ArrowUp||keys.w?1:0);if(dx||dy)target={x:saw.x+dx*100,y:saw.y+dy*100};else if(pointer)target=pointer}if(target&&dist(saw,target)>5)saw.angle=Math.atan2(target.y-saw.y,target.x-saw.x);const old={x:saw.x,y:saw.y},step=142*dt;saw.x+=Math.cos(saw.angle)*step;saw.y+=Math.sin(saw.angle)*step;saw.distance+=step;saw.fuel-=step/7.7;if(dist(saw,saw.path[saw.path.length-1])>5)saw.path.push({x:saw.x,y:saw.y});
const contacts=items.filter(i=>i.alive&&segmentDistance(i,old,saw)<(i.type==='missile'?32:30)).sort((a,b)=>dist(a,old)-dist(b,old));for(const i of contacts){if(i.type==='fuel'){i.alive=false;saw.fuel=Math.min(140,saw.fuel+40);burst(i.x,i.y,'#b9e17c',12);tone(800);toast('FUEL +40')}else if(i.type==='unit'){recruit(i)}else{finish('hit',i);break}}
if(state==='dig'){if(saw.distance>75&&segmentDistance(bases[side],old,saw)<26)finish('return');else if(saw.x<25||saw.x>W-25||saw.y<TOP-5||saw.y>BOTTOM||saw.fuel<=0)finish('lost')}hud()}
if(state==='resolve'){resolveTime-=dt;for(const p of shots){p.t+=dt;if(p.t<0)continue;const target={x:p.side===0?1080:120,y:175};if(p.t<.4){p.x=p.start.x;p.y=p.start.y+(205-p.start.y)*(p.t/.4);p.angle=0}else{const u=Math.min(1,(p.t-.4)/1.2);p.x=p.start.x+(target.x-p.start.x)*u;p.y=205+(target.y-205)*u-Math.sin(Math.PI*u)*90;const dx=target.x-p.start.x,dy=target.y-205-Math.PI*90*Math.cos(Math.PI*u);p.angle=Math.atan2(-dy,dx)-Math.PI/2;if(u===1&&!p.hit){p.hit=true;hp[1-p.side]=Math.max(0,hp[1-p.side]-10);burst(target.x,target.y,'#ffe49c',35);shake=10;tone(65,.3);toast('−10 HP');hud()}}}shots=shots.filter(p=>!p.hit);if(resolveTime<=0&&!shots.length&&units.every(u=>u.phase==='done'))next()}}
function draw(){presentation.render({items,saw,side,state,clock,hp,shots,units,particles,shake})}
let accumulator=0;
function frame(t){accumulator+=Math.min(.1,(t-last)/1000||0);last=t;while(accumulator>=1/120){update(1/120);accumulator-=1/120}draw();requestAnimationFrame(frame)}
document.querySelectorAll('.mode').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('.mode').forEach(v=>v.classList.toggle('selected',v===b))});$('start').onclick=()=>{tone(300);if(state==='menu'||state==='end'){reset();$('options').style.display='flex'}};
$('sound').onclick=()=>{sound=!sound;$('sound').textContent=sound?'♫':'♩';$('sound').style.opacity=sound?1:.5};
window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();keys[e.key.toLowerCase().startsWith('arrow')?e.key:e.key.toLowerCase()]=true;if(e.key===' '&&!e.repeat){if(state==='ready')launch();else if(state==='menu'||state==='end')$('start').click()}});window.addEventListener('keyup',e=>{delete keys[e.key];delete keys[e.key.toLowerCase()]});window.addEventListener('blur',()=>{keys={};pointer=null;});
function locate(e){return presentation.screenToGame(e.clientX,e.clientY)}
canvas.addEventListener('pointerdown',e=>{if(side===1&&mode==='ai')return;if(state==='ready')launch();if(state==='dig'){canvas.setPointerCapture(e.pointerId);pointer=locate(e)}});canvas.addEventListener('pointermove',e=>{if(canvas.hasPointerCapture(e.pointerId))pointer=locate(e)});for(const event of ['pointerup','pointercancel'])canvas.addEventListener(event,()=>pointer=null);
// Geometry surface for regression checks.
window.SawSiegeGeometry={inside,segmentDistance};
reset();state='menu';$('overlay').classList.remove('hidden');$('toast').textContent='';hud();requestAnimationFrame(frame);
})();
