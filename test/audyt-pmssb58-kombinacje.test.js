// PMSSB-58/C: pozostałe kombinacje, stan PRZED = 77ebd06.
// Każdy pozytywny scenariusz decyzji kończy się zaakceptowaną komendą.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {game,put,creature,lands,decide,score,variant,run,pass,settle,choices,registry,addMana,playerView,token,BLOOD_TOKEN_EFFECT} from './helpers/pmssb58.js';
import {addObject} from '../src/engine/game-state.js';
import {grantKeywordsUntilEndOfTurn} from '../src/engine/permanents.js';
import {jumpToStep} from '../src/engine/turn.js';

function mender({target='brawlers-plate',spell=null,controller='p1',shield=false,keywords=[],banned=false}={}) {
  const s=game({active:spell?'p2':'p1',priority:spell?'p2':'p1'});
  put(s,'mender','loxodon-mender');put(s,'target',target,controller,'battlefield',{keywords});lands(s,1,'basic-plains');
  if(shield)s.regenerationShields=['target'];
  if(banned)s.cantBeRegeneratedThisTurn=['target'];
  if(spell){
    put(s,'removal',spell,'p2','hand');addMana(s,'p2',6);
    run(s,choices(s).find(c=>c.type==='cast_spell'&&c.objectId==='removal'&&c.targets?.[0]==='target'));pass(s);
  }
  return s;
}
const regenScore=(s,params)=>score(s,'activate_ability(mender#0->target)',{params});

for(const target of ['brawlers-plate','oreplate-pangolin'])test(`58/C1: zdrowy ${target} nie wymaga regeneracji (0 >= null nie jest śmiercią)`,()=>{
  const s=mender({target});assert.ok(regenScore(s)<0);
  const cmd=decide(s).cmd;assert.equal(cmd.type,'pass_priority');run(s,cmd);
});

for(const target of ['brawlers-plate','oreplate-pangolin'])test(`58/C2: Mender ratuje ${target} przed rzeczywistym Shatter na stosie`,()=>{
  const s=mender({target});
  s.turn=jumpToStep(s.turn,'main','p2');s.turn.activePlayerId=s.turn.priorityPlayerId='p2';
  put(s,'shatter','shatter','p2','hand');addMana(s,'p2',2,{colors:['R']});
  run(s,choices(s).find(c=>c.type==='cast_spell'&&c.objectId==='shatter'&&c.targets?.[0]==='target'));pass(s);
  assert.ok(regenScore(s)>0);const cmd=decide(s).cmd;assert.equal(cmd.type,'activate_ability');assert.equal(cmd.targets[0],'target');
  run(s,cmd);settle(s);assert.equal(s.objects.get('target')?.zone,'battlefield');
  assert.ok(s.events.some(e=>e.type==='permanent_regenerated'&&e.objectId==='target'));
});

for(const extra of [{shield:true},{banned:true},{keywords:['indestructible']}])test(`58/C3: regeneracja nie kupuje nic przy ${JSON.stringify(extra)}`,()=>{
  const s=mender({spell:'shatter',...extra});assert.ok(regenScore(s)<0);assert.equal(decide(s).cmd.type,'pass_priority');
});

test('58/C4: nie ratuje artefaktu przeciwnika; koszt many odróżnia identyczne zdolności',()=>{
  const hostile=mender({spell:'shatter',controller:'p2'});assert.ok(regenScore(hostile)<0);
  const s=mender({spell:'shatter'});addMana(s,'p1',4);
  const def=registry.get('loxodon-mender'),costly={...def.abilities[0],cost:{...def.abilities[0].cost,mana:5}};
  const view=playerView(s,'p1'),expensive=structuredClone(view);
  expensive.zones.battlefield.find(o=>o.id==='mender').activatableAbilities=[costly];
  assert.ok(score(s,'activate_ability(mender#0->target)',{view})>score(s,'activate_ability(mender#0->target)',{view:expensive}));
});

test('58/C5: pokrętło modelu regeneracji wyłącza wymiar zagrożenia ze stosu',()=>{
  const s=mender({target:'oreplate-pangolin',spell:'shatter'});
  assert.ok(regenScore(s)>regenScore(s,{regenerationModelWeight:0}));
  assert.equal(regenScore(s,{regenerationModelWeight:0}),-19,'kotwica PRZED');
});

test('58/C6 L41: ten sam skutek regeneracji w czarze i aktywacji dostaje tę samą korektę',()=>{
  const s=mender({target:'oreplate-pangolin',spell:'shatter'});
  addObject(s,{id:'regen',instanceId:'i-regen',cardId:'fixture-regen',controllerId:'p1',zone:'hand',kind:'spell',manaCost:1,
    types:['Instant'],spell:{timing:'instant',targets:[{type:'artifact'}],effects:[{type:'regenerate'}]}});
  const off={regenerationModelWeight:0};
  const a=regenScore(s)-regenScore(s,off);
  const b=score(s,'cast_spell(regen->target)')-score(s,'cast_spell(regen->target)',{params:off});
  assert.ok(a>0);assert.equal(a,b);
  run(s,choices(s).find(c=>c.type==='cast_spell'&&c.objectId==='regen'));settle(s);assert.ok(s.objects.has('target'));
});

test('58/C7: zakaz regeneracji w tym samym czarze co obrażenia nie jest ratowalnym zagrożeniem',()=>{
  const s=mender({target:'oreplate-pangolin'});
  s.objects.set('target',Object.freeze({...s.objects.get('target'),power:3,toughness:4}));
  s.turn=jumpToStep(s.turn,'main','p2');s.turn.activePlayerId=s.turn.priorityPlayerId='p2';
  put(s,'rage','rage-of-purphoros','p2','hand');addMana(s,'p2',5,{colors:['R']});
  run(s,choices(s).find(c=>c.type==='cast_spell'&&c.objectId==='rage'&&c.targets?.[0]==='target'));pass(s);
  assert.ok(regenScore(s)<0);assert.equal(decide(s).cmd.type,'pass_priority');
});

function blockScene({power=1,toughness=1,flying=false,spider=false,stripped=false}={}){
  const s=game({step:'declare_attackers',active:'p2'});put(s,'mender','loxodon-mender');lands(s,1,'basic-plains');
  put(s,'target',spider?'snarespinner':'oreplate-pangolin','p1','battlefield',spider?{abilitiesStripped:stripped}:{power,toughness});
  if(stripped)grantKeywordsUntilEndOfTurn(s,'target',['reach']);
  creature(s,'atk','p2',{power:3,toughness:2,keywords:flying?['flying']:[]});
  run(s,choices(s).find(c=>c.type==='declare_attackers'&&c.attackerIds?.includes('atk')));
  for(let i=0;i<10&&!choices(s).some(c=>c.type==='declare_blockers');i++)pass(s);
  return s;
}
for(const safe of [true,false])test(`58/C8: bloker ${safe?'przeżywa i zabija atakera — bez tarczy':'ginie — tarcza ma wartość'}`,()=>{
  const s=blockScene(safe?{power:4,toughness:4}:{power:1,toughness:1});
  run(s,choices(s).find(c=>c.type==='declare_blockers'&&c.assignments?.atk?.length===1&&c.assignments.atk[0]==='target'));
  if(s.turn.priorityPlayerId!=='p1')pass(s);
  assert.equal(regenScore(s)>0,!safe);
  const d=decide(s);if(!safe){assert.equal(d.cmd.type,'activate_ability');run(s,d.cmd);settle(s);assert.ok(s.regenerationShields.includes('target'));}
});

function scout({step='main',target='ready',power=2,blocker=true}={}){
  const s=game({step});lands(s,2,'basic-mountain');put(s,'scout','subterranean-scout','p1','hand');
  if(blocker)creature(s,'blocker','p2',{power:3,toughness:3});
  if(target!=='none')creature(s,'host',target==='enemy'?'p2':'p1',{power,summoningSickness:target==='sick',tapped:target==='tapped'});
  return s;
}
function scoutBonus(s,params){
  const def=registry.get('subterranean-scout');return score(s,'cast_permanent(scout)',{params})-
    score(s,'cast_permanent(scout)',{params,reg:variant(def.id,{abilities:[]})});
}

test('58/C9: Scout cast widzi wypłatę ewazji gotowego legalnego gospodarza; OFF wraca do 0',()=>{
  const s=scout();assert.ok(scoutBonus(s)>0);assert.equal(scoutBonus(s,{evasionEtbValueWeight:0}),0);
  const d=decide(s);run(s,d.cmd);settle(s,x=>s.pendingTriggerTargets.length>0);
  if(s.pendingTriggerTargets.length){const pick=decide(s).cmd;assert.equal(pick.targetId,'host');run(s,pick);}
  settle(s);assert.ok(s.objects.get('host').cantBeBlockedUntilTurn);
});
for(const opt of [{target:'none'},{target:'sick'},{target:'tapped'},{target:'enemy'},{power:3},{step:'main2'},{blocker:false}])
 test(`58/C10: Scout nie dostaje premii za pustą ewazję ${JSON.stringify(opt)}`,()=>{
  assert.equal(scoutBonus(scout(opt)),0);
 });

test('58/C11 L41: wartość zapowiedzi Scouta jest najlepszym legalnym wyborem, nie sumą celów',()=>{
  const s=scout();const delta=scoutBonus(s);creature(s,'other','p1',{power:1,toughness:1});
  assert.equal(scoutBonus(s),delta);
  run(s,choices(s).find(c=>c.type==='cast_permanent'&&c.objectId==='scout'));settle(s,x=>s.pendingTriggerTargets.length>0);
  const d=decide(s);assert.equal(d.cmd.targetId,'host');
  const targetValue=score(s,/^resolve_trigger_target.*host/);
  assert.ok(Math.abs(delta-targetValue*0.9)<1e-8,`${delta} == ${targetValue} × 0.9`);
});

function ramp({n=3,step='end',need='sifter-wurm',land='basic-forest',payoff=false,library='basic-swamp'}={}){
  const s=game({step,active:step==='end'?'p2':'p1',priority:'p1',lib:0});lands(s,n,land);
  for(const pid of ['p1','p2'])for(let i=0;i<24;i++)put(s,`lib-${pid}-${i}`,library,pid,'library');
  put(s,'ramp','natural-connection','p1','hand');if(need)put(s,'need',need,'p1','hand');
  if(payoff)put(s,'payoff','skyclave-geopede');
  if(land!=='basic-forest')addMana(s,'p1',3,{colors:['G']});
  return s;
}
const rampScore=(s,opts={})=>score(s,'cast_spell(ramp->)',opts);

test('58/C12: ramp przy potrzebnej manie zostaje dodatni; po nasyceniu nie pali karty (60:60 PRZED)',()=>{
  const need=ramp(),full=ramp({n:9});assert.ok(rampScore(need)>0);assert.ok(rampScore(full)<0);
  assert.equal(decide(full).cmd.type,'pass_priority');run(full,decide(full).cmd);
  const cmd=decide(need).cmd;assert.equal(cmd.type,'cast_spell');run(need,cmd);settle(need);
  assert.equal(playerView(need,'p1').zones.battlefield.filter(o=>o.kind==='land'&&o.controllerId==='p1').length,4);
});

test('58/C13: OFF nowych wymiarów odtwarza 60; potrzeba i cena mają osobne kontrole',()=>{
  const s=ramp({n:9});assert.equal(rampScore(s,{params:{rampNeedWeight:0,rampCastManaWeight:0}}),60);assert.ok(rampScore(s)<0);
  assert.ok(rampScore(s,{params:{rampSaturationPenalty:0}})>0);
  assert.equal(rampScore(ramp()),57,'użyteczny EOT: dawne 60 minus koszt 3, wypłata bez zmiany');
});

test('58/C14: dużo lądów nie wyłącza fixingu brakującego koloru ani payoffu landfall',()=>{
  const fixing=ramp({n:9,land:'basic-swamp'}),landfall=ramp({n:9,payoff:true});
  assert.ok(rampScore(fixing)>0);assert.ok(rampScore(landfall)>0);
});

test('58/C15: instant z tapniętym landem może poczekać do EOT; parametr steruje wymiarem',()=>{
  const main=ramp({step:'main'}),end=ramp();
  assert.ok(rampScore(main)<0);assert.equal(decide(main).cmd.type,'pass_priority');
  assert.ok(rampScore(main)<rampScore(end));
  assert.equal(rampScore(main,{params:{tappedRampWaitPenalty:0}}),rampScore(end));
});

test('58/C16: brak trafień pozostaje ujemny; wybór basicu bierze potrzebny kolor',()=>{
  const no=ramp({library:'highland-game'});
  const ownDeck=['natural-connection','sifter-wurm',...Array(3).fill('basic-forest'),...Array(24).fill('highland-game')];
  assert.ok(rampScore(no,{ownDeck})<0);
  const s=ramp({land:'basic-swamp'});put(s,'forest-lib','basic-forest','p1','library');
  run(s,choices(s).find(c=>c.type==='cast_spell'&&c.objectId==='ramp'));settle(s,x=>Boolean(x.pendingSearchChoice));
  assert.ok(s.pendingSearchChoice);const chosen=decide(s).cmd;
  assert.equal(chosen.found,'forest-lib');run(s,chosen);settle(s);
  assert.ok(playerView(s,'p1').zones.battlefield.some(o=>o.cardId==='basic-forest'&&o.tapped));
});

test('58/C17: Snarespinner po stripie + nadanym reach blokuje legalnie, ale nie odzyskuje drukowanego triggera',()=>{
  const s=blockScene({spider:true,stripped:true,flying:true}),view=playerView(s,'p1');
  const clean=structuredClone(view);clean.zones.battlefield.find(o=>o.id==='target').activatableAbilities=[];
  const label='block[atk<target]';assert.equal(score(s,label,{view}),score(s,label,{view:clean}));
  run(s,choices(s).find(c=>c.type==='declare_blockers'&&c.assignments?.atk?.length===1&&c.assignments.atk[0]==='target'));
  assert.equal(s.zones.stack.length,0,'brak wydrukowanego triggera');
});

for(const zone of ['hand','graveyard'])test(`58/C18 kontrola: Dig Site ${zone}, legalny lepszy gospodarz i skutek`,()=>{
  const s=game();put(s,'dig','dig-site-inventory','p1',zone);lands(s,1,'basic-plains');
  creature(s,'ready','p1',{power:2,toughness:2});creature(s,'sick','p1',{power:2,toughness:2,summoningSickness:true});creature(s,'foe');
  const d=decide(s);assert.equal(d.cmd.targets?.[0],'ready');assert.equal(d.cmd.type,zone==='hand'?'cast_spell':'cast_flashback');
  run(s,d.cmd);settle(s);assert.equal(s.objects.get('ready').counters['+1/+1'],1);
  assert.ok(playerView(s,'p1').zones.battlefield.find(o=>o.id==='ready').keywords.includes('vigilance'));
  if(zone==='graveyard')assert.ok([...s.objects.values()].some(o=>o.cardId==='dig-site-inventory'&&o.zone==='exile'));
});

test('58/C19 kontrola: Helicopter — bot rzuca dwa ciała z jednej karty, ETB ma dodatnią wartość',()=>{
  const s=game();lands(s,3);put(s,'helicopter','news-helicopter','p1','hand');
  const def=registry.get('news-helicopter'),label='cast_permanent(helicopter)';
  assert.ok(score(s,label)>score(s,label,{reg:variant(def.id,{abilities:[]})}));
  const d=decide(s);assert.equal(d.cmd.type,'cast_permanent');run(s,d.cmd);settle(s);
  const mine=playerView(s,'p1').zones.battlefield.filter(o=>o.controllerId==='p1'&&o.kind==='creature');
  assert.equal(mine.length,2);assert.ok(mine.some(o=>o.cardId==='news-helicopter'&&o.keywords.includes('flying')));
  assert.ok(mine.some(o=>o.isToken&&o.subtypes.includes('Citizen')));
});

test('58/C20: nowy wymiar kosztu czystego rampu nie remisuje 2 i 5 many; naliczony raz',()=>{
  const s=ramp();addMana(s,'p1',10,{colors:['G']});
  const v=playerView(s,'p1'),cheap=structuredClone(v),dear=structuredClone(v);
  cheap.zones.hand.find(o=>o.id==='ramp').manaCost=2;dear.zones.hand.find(o=>o.id==='ramp').manaCost=5;
  const low=rampScore(s,{view:cheap}),high=rampScore(s,{view:dear});assert.equal(low-high,3);
  assert.equal(rampScore(s,{view:cheap,params:{rampCastManaWeight:0}}),rampScore(s,{view:dear,params:{rampCastManaWeight:0}}));
});

test('58/C21: fixing widzi drugi pip GG, a granica potrzeb many ma kontrolę progu',()=>{
  const s=ramp({n:8,land:'basic-swamp'});lands(s,1,'basic-forest');assert.ok(rampScore(s)>0,'1G → 2G jest postępem');
  const floor=ramp({need:null});assert.ok(rampScore(floor)>0);
  assert.ok(rampScore(floor,{params:{rampManaFloor:0}})<0,'bez buforu wystarczy już mana na znaną rękę');
});

test('58/C22: zapłacona już pula nie czeka na EOT, gdzie by wyparowała; sorcery i nietapnięty land nie dostają kary oczekiwania',()=>{
  const s=ramp({step:'main'});addMana(s,'p1',3,{colors:['G']});assert.ok(rampScore(s)>0);
  const plain=ramp({step:'main'});const v=playerView(plain,'p1');
  const sorcery=structuredClone(v),untapped=structuredClone(v);
  sorcery.zones.hand.find(o=>o.id==='ramp').spell.timing='sorcery';
  untapped.zones.hand.find(o=>o.id==='ramp').spell.effects[0].entersTapped=false;
  assert.ok(rampScore(plain,{view:sorcery})>0);assert.ok(rampScore(plain,{view:untapped})>0);
});

test('58/C23 L41: nasycenie zmniejsza ten sam rider na czarze, aktywacji i nosicielu ETB, nie karze ciała jak zmarnowanej karty',()=>{
  const s=ramp({n:9,step:'main'});const effect=registry.get('natural-connection').spell.effects[0];
  put(s,'elk','dawntreader-elk');
  const ability={type:'activated',timing:'instant',cost:{},effect:[effect]};
  s.objects.set('elk',Object.freeze({...s.objects.get('elk'),abilities:[ability]}));
  assert.ok(score(s,'activate_ability(elk#0)')<0);
  assert.ok(score(s,'activate_ability(elk#0)',{params:{rampNeedWeight:0,tappedRampWaitPenalty:0}})>0);
  lands(s,2,'basic-plains'); // obie białe many są trwałe; Plains nie naprawia już koloru
  put(s,'kor','kor-cartographer','p1','hand');
  const off=score(s,'cast_permanent(kor)',{params:{rampNeedWeight:0}}),on=score(s,'cast_permanent(kor)');
  assert.ok(on>0&&on<off,'ciało 2/2 pozostaje wartościowe; brak wyłącznie premii rampu');
});

test('58/C24: Dig Site nie jest samą tymczasową czujnością — licznik pozostaje wartościowy w main2',()=>{
  const s=game({step:'main2'});put(s,'dig','dig-site-inventory','p1','hand');lands(s,1,'basic-plains');creature(s,'ready','p1');
  const d=decide(s);assert.equal(d.cmd.type,'cast_spell');run(s,d.cmd);settle(s);
  assert.equal(s.objects.get('ready').counters['+1/+1'],1);
});

test('58/C25: Mender reaguje na lethal damage, nie na wygnanie; są to inne sposoby odejścia',()=>{
  const exile=mender({spell:'merciless-repurposing',target:'oreplate-pangolin'});assert.ok(regenScore(exile)<0);
  const s=mender({target:'oreplate-pangolin'});s.objects.set('target',Object.freeze({...s.objects.get('target'),toughness:2}));
  s.turn=jumpToStep(s.turn,'main','p2');s.turn.activePlayerId=s.turn.priorityPlayerId='p2';
  put(s,'burn','shock','p2','hand');addMana(s,'p2',1,{colors:['R']});
  run(s,choices(s).find(c=>c.type==='cast_spell'&&c.objectId==='burn'&&c.targets?.[0]==='target'));pass(s);
  const d=decide(s);assert.equal(d.cmd.type,'activate_ability');run(s,d.cmd);settle(s);assert.ok(s.objects.has('target'));
});

test('58/C26: pompa do 0 toughness nie jest zagrożeniem ratowalnym regeneracją',()=>{
  const s=mender({target:'oreplate-pangolin'});s.objects.set('target',Object.freeze({...s.objects.get('target'),toughness:2}));
  s.turn=jumpToStep(s.turn,'main','p2');s.turn.activePlayerId=s.turn.priorityPlayerId='p2';
  put(s,'harv','bloodtithe-harvester','p2');token(s,BLOOD_TOKEN_EFFECT,'p2');token(s,BLOOD_TOKEN_EFFECT,'p2');
  run(s,choices(s).find(c=>c.type==='activate_ability'&&c.objectId==='harv'&&c.targets?.[0]==='target'));pass(s);
  assert.ok(regenScore(s)<0);run(s,decide(s).cmd);settle(s);assert.ok(!s.objects.has('target'));
});

test('58/C27: tarcza już zapowiedziana na stosie nie jest ponownie kupowana przez inne źródło',()=>{
  const s=mender({spell:'shatter'});
  addObject(s,{id:'regen',instanceId:'i-regen',cardId:'fixture-regen',controllerId:'p1',zone:'hand',kind:'spell',manaCost:0,
    types:['Instant'],spell:{timing:'instant',targets:[{type:'artifact'}],effects:[{type:'regenerate'}]}});
  run(s,choices(s).find(c=>c.type==='cast_spell'&&c.objectId==='regen'&&c.targets[0]==='target'));
  assert.ok(regenScore(s)<0);settle(s);assert.ok(s.objects.has('target'));
});

test('58/C28: zniszczenie warunkowe na stosie czyta faktyczny próg mocy',()=>{
  const s=mender({target:'oreplate-pangolin'});s.objects.set('target',Object.freeze({...s.objects.get('target'),power:0}));
  s.turn=jumpToStep(s.turn,'main','p2');s.turn.activePlayerId=s.turn.priorityPlayerId='p2';
  put(s,'removal','wretched-banquet','p2','hand');addMana(s,'p2',1,{colors:['B']});
  run(s,choices(s).find(c=>c.type==='cast_spell'&&c.objectId==='removal'&&c.targets[0]==='target'));pass(s);
  assert.ok(regenScore(s)>0);run(s,decide(s).cmd);settle(s);assert.ok(s.objects.has('target'));
});

test('58/C29: Snarespinner widzi latanie NADANE, blok/trigger są realne, a deklaracji nie da się powtórzyć',()=>{
  const s=blockScene({spider:true});grantKeywordsUntilEndOfTurn(s,'atk',['flying']);
  const d=decide(s);assert.equal(d.cmd.type,'declare_blockers');assert.ok(d.cmd.assignments.atk.includes('target'));
  run(s,d.cmd);settle(s);
  assert.equal(playerView(s,'p1').zones.battlefield.find(o=>o.id==='target').power,3);
  assert.ok(!choices(s).some(c=>c.type==='declare_blockers'));
});

test('58/C30: Dig Site ma wymiar kosztu 1 vs 5 many (74 = 74 PRZED); OFF odtwarza remis',()=>{
  const s=game();lands(s,8,'basic-plains');put(s,'dig','dig-site-inventory','p1','hand');creature(s,'host','p1');
  const view=playerView(s,'p1'),dear=structuredClone(view);dear.zones.hand.find(o=>o.id==='dig').manaCost=5;
  const label='cast_spell(dig->host)';assert.equal(score(s,label,{view})-score(s,label,{view:dear}),4);
  const params={counterCastManaWeight:0};assert.equal(score(s,label,{view,params}),score(s,label,{view:dear,params}));
  assert.equal(score(s,label,{view,params}),74);
});

test('58/C31: podwójny licznik/rider nie płaci podwójnego kosztu czaru',()=>{
  const s=game();lands(s,8,'basic-plains');put(s,'dig','dig-site-inventory','p1','hand');creature(s,'host','p1');
  const view=structuredClone(playerView(s,'p1'));view.zones.hand.find(o=>o.id==='dig').spell.effects.push({type:'add_counter',counter:'+1/+1',amount:1});
  const label='cast_spell(dig->host)';assert.equal(score(s,label,{view,params:{counterCastManaWeight:0}})-score(s,label,{view}),1);
});

test('58/C32: ceny ręki i flashbacku odróżniają warianty tej samej wypłaty; nie tracą kierunku celu',()=>{
  const s=game();lands(s,5,'basic-plains');put(s,'hand','dig-site-inventory','p1','hand');put(s,'grave','dig-site-inventory','p1','graveyard');creature(s,'host','p1');
  const d=decide(s);assert.equal(d.scores.get('cast_spell(hand->host)'),d.scores.get('cast_flashback(grave->host)'));
  assert.equal(d.cmd.targets[0],'host');run(s,d.cmd);settle(s);assert.equal(s.objects.get('host').counters['+1/+1'],1);
});
