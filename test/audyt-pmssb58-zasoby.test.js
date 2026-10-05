// PMSSB-58/A — zasoby: token-draw, koszt discard, liczony pump/ofiara,
// rezerwa zasobu oraz ostatni bloker zamieniany na manę. PRZED: c60fb42.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {game,put,creature,lands,token,decide,score,variant,run,pass,settle,choices,registry,
  addMana,SPAWN_TOKEN_EFFECT,playerView} from './helpers/pmssb58.js';
import {DEFAULT_HEURISTIC_PARAMS} from '../src/controllers/heuristic-params.js';

function lootScene(card='basic-forest', {lib=24, source='token_blood', step='end', landCount=6}={}) {
  const s=game({step,active:step==='end'?'p2':'p1',priority:'p1',lib});
  lands(s,landCount,'basic-forest','p1',true);addMana(s,'p1',1);
  const src=source==='token_blood'?token(s):put(s,'src',source);
  if(card)put(s,'hand',card,'p1','hand');
  return {s,id:src.id,index:src.abilities.findIndex(a=>a?.cost?.discardCard)};
}
const abilityLabel=d=>`activate_ability(${d.id}#${d.index})`;
const lootScore=(d,params)=>score(d.s,abilityLabel(d),{params});
function etbValue(cid, params, lib=24) {
  const s=game({lib});put(s,'cast',cid,'p1','hand');addMana(s,'p1',20);lands(s,6);
  const def=registry.get(cid);
  const noEtb=variant(cid,{abilities:def.abilities.map(a=>a.trigger?.event==='enter_battlefield'
    ?{...a,effect:[],trigger:{...a.trigger,modes:null}}:a)});
  return {with:score(s,'cast_permanent(cast)',{params}),without:score(s,'cast_permanent(cast)',{reg:noEtb,params})};
}

test('58/A1: token z opcją doboru ma wartość przy tworzeniu, a nie 0; pokrętło wyłącza wymiar',()=>{
  const on=etbValue('bloodtithe-harvester');const off=etbValue('bloodtithe-harvester',{tokenDrawBankWeight:0});
  assert.ok(on.with>on.without,`${on.with} > ${on.without}`);
  assert.equal(off.with,off.without);
  assert.equal(on.without,off.without,'bez efektu tokena nie zmienia się ciało nosiciela');
});

test('58/A2: bank doboru nie jest przymusowym draw — pusta biblioteka daje zerowy dodatek, nie karę za nosiciela',()=>{
  const x=etbValue('bloodtithe-harvester',undefined,0);
  assert.equal(x.with,x.without);
});

for(const [cid,delta] of [['news-helicopter',9],['kozileks-predator',6]])test(`58/A3: kotwica ETB ${cid} bez zmiany (${delta})`,()=>{
  const x=etbValue(cid);
  assert.ok(Math.abs(x.with-x.without-delta)<1e-9);
});

test('58/A4: Blood nie odrzuca grywalnego Predatora za losowe dobranie, nawet na EOT (+16 PRZED)',()=>{
  const good=lootScene('kozileks-predator');
  assert.ok(lootScore(good)<0,'realna utrata karty > zysk doboru, premia EOT tego nie maskuje');
  const chosen=decide(good.s).cmd;assert.equal(chosen.type,'pass_priority');run(good.s,chosen);
  const off=lootScene('kozileks-predator');
  assert.equal(lootScore(off,{abilityDiscardCostWeight:0}),16,'OFF odtwarza +16 PRZED');
  assert.equal(decide(off.s,{params:{abilityDiscardCostWeight:0}}).cmd.type,'activate_ability');
});

test('58/A5: zbędny land przy sześciu źródłach zostaje użyty, jedna komenda płaci koszty i dobiera po stosie',()=>{
  const d=lootScene();assert.equal(lootScore(d),16,'kotwica taniego kosztu / EOT bez zmian');
  const chosen=decide(d.s).cmd;assert.equal(chosen.type,'activate_ability');run(d.s,chosen);
  assert.ok(!d.s.objects.has(d.id),'ofiara jest kosztem');
  assert.equal(d.s.zones.stack.length,1);settle(d.s);
  assert.equal(d.s.zones.hand.filter(id=>d.s.objects.get(id)?.controllerId==='p1').length,1);
  assert.ok(d.s.zones.graveyard.some(id=>d.s.objects.get(id)?.cardId==='basic-forest'));
});

test('58/A6: nie odrzuca potrzebnego landu; bez karty nie ma legalnej aktywacji',()=>{
  const needed=lootScene('basic-forest',{landCount:1});assert.ok(lootScore(needed)<0);
  const empty=lootScene(null);assert.ok(!choices(empty.s).some(c=>c.type==='activate_ability'&&c.objectId===empty.id));
});

test('58/A7: podatek discard używa tego samego wyboru co picker — przy dwóch kartach oddaje zbędny land',()=>{
  const d=lootScene('kozileks-predator');put(d.s,'junk','basic-forest','p1','hand');
  const chosen=decide(d.s).cmd;assert.equal(chosen.type,'activate_ability');run(d.s,chosen);
  assert.ok(d.s.pendingDiscardChoice);
  const discard=decide(d.s).cmd;assert.equal(discard.type,'resolve_discard_choice');assert.equal(discard.cardId,'junk');run(d.s,discard);settle(d.s);
  assert.ok(d.s.objects.get('hand')?.zone==='hand','wartościowy stwór został');
});

for(const source of ['goblin-picker','oin-the-brave'])test(`58/A8 L41: ${source}, dobór za discard bez ofiary źródła też zna stratę karty`,()=>{
  const d=lootScene('kozileks-predator',{source});
  assert.ok(lootScore(d)<0);
  assert.ok(lootScore(d,{abilityDiscardCostWeight:0})>0);
  const cheap=lootScene('basic-forest',{source});assert.ok(lootScore(cheap)>0);
});

test('58/A9 L41: discard za grant również płaci cenę karty; koszt nie znika, gdy efekt nie jest draw',()=>{
  const d=lootScene('kozileks-predator',{source:'fledgling-imp'});
  const on=lootScore(d),off=lootScore(d,{abilityDiscardCostWeight:0});
  assert.ok(on<off,`${on} < ${off}`);
});

for(const lib of [0,1])test(`58/A10: guard biblioteki ${lib} pozostaje ujemny (bez strojenia pod loot)`,()=>{
  const d=lootScene('basic-forest',{lib});assert.ok(lootScore(d)<0);assert.equal(decide(d.s).cmd.type,'pass_priority');
});

function harvester(bloods=2){const s=game();put(s,'harv','bloodtithe-harvester');for(let i=0;i<bloods;i++)token(s);return s;}

test('58/A11: większy zabijany cel wygrywa, zamiast remisu 49:49 i pierwszego 1/1',()=>{
  const s=harvester();creature(s,'small','p2',{power:1,toughness:1,manaCost:1});creature(s,'large','p2',{power:4,toughness:4,manaCost:4});
  const d=decide(s);
  assert.ok(d.scores.get('activate_ability(harv#1->large)')>d.scores.get('activate_ability(harv#1->small)'));
  assert.equal(d.cmd.targets?.[0],'large');run(s,d.cmd);settle(s);
  assert.ok(!s.objects.has('large'));assert.ok(s.objects.has('small'));assert.ok(!s.objects.has('harv'));
});

test('58/A12: nie oddaje 3/2/MV2 za zwykłe 1/1/MV1; OFF odtwarza błąd',()=>{
  const s=harvester();creature(s,'small','p2',{power:1,toughness:1,manaCost:1});
  assert.ok(score(s,'activate_ability(harv#1->small)')<0);
  assert.equal(decide(s).cmd.type,'pass_priority');
  const off={sacrificePumpTradeWeight:0};
  assert.equal(score(s,'activate_ability(harv#1->small)',{params:off}),49);
});

test('58/A13: zero Blood to brak korzyści, jeden Blood zabija 2/2; indestructible nie chroni przed 0 toughness',()=>{
  const zero=harvester(0);creature(zero,'target');assert.ok(score(zero,'activate_ability(harv#1->target)')<0);
  const one=harvester(1);creature(one,'target','p2',{power:6,toughness:2,keywords:['indestructible'],manaCost:5});
  const chosen=decide(one).cmd;assert.equal(chosen.targets?.[0],'target');run(one,chosen);settle(one);assert.ok(!one.objects.has('target'));
});

test('58/A14: zaznaczone obrażenia też mogą uczynić obniżenie toughness lethalnym',()=>{
  const s=harvester(1);creature(s,'target','p2',{power:6,toughness:4,damage:2,damagedThisTurn:true,manaCost:6});
  const chosen=decide(s).cmd;assert.equal(chosen.type,'activate_ability');assert.equal(chosen.targets?.[0],'target');run(s,chosen);settle(s);assert.ok(!s.objects.has('target'));
});

test('58/A14b: toughness 2 po pompie i 2 damage NIE zabijają indestructible ani tarczy regeneracji',()=>{
  for(const protection of ['indestructible','regeneration']){
    const s=harvester(1);creature(s,'target','p2',{power:6,toughness:4,damage:2,damagedThisTurn:true,manaCost:6,
      keywords:protection==='indestructible'?['indestructible']:[]});
    if(protection==='regeneration')s.regenerationShields=['target'];
    assert.ok(score(s,'activate_ability(harv#1->target)')<0,protection);
  }
});

function reserveScene(n){const d=lootScene();put(d.s,'harv','bloodtithe-harvester');for(let i=1;i<n;i++)token(d.s);creature(d.s,'target','p2',{power:4,toughness:4,manaCost:4});return d;}

test('58/A15: Blood nie znika na loot, gdy tylko pełny zapas pozwala na korzystny removal w następnej main',()=>{
  const critical=reserveScene(2);assert.ok(lootScore(critical)<0);
  assert.equal(decide(critical.s).cmd.type,'pass_priority');
  assert.equal(lootScore(critical,{countedPumpReserveWeight:0}),16,'OFF: ignorowany utracony próg X');
  const surplus=reserveScene(3);assert.equal(lootScore(surplus),16,'po zużyciu jednego wciąż jest X=4');
  const chosen=decide(surplus.s).cmd;assert.equal(chosen.type,'activate_ability');run(surplus.s,chosen);settle(surplus.s);
});

function spawnCombat(life=3,{flying=false,trample=false,blocked=false,other=false}={}){
  const s=game({step:'declare_attackers',active:'p2',priority:'p2'});s.players[0].life=life;
  lands(s,3,'basic-island');const spawn=token(s,SPAWN_TOKEN_EFFECT);put(s,'draw','inspiration','p1','hand');
  creature(s,'atk','p2',{power:3,toughness:3,keywords:[...(flying?['flying']:[]),...(trample?['trample']:[])]});
  if(other)creature(s,'other','p1',{power:0,toughness:4});
  run(s,choices(s).find(c=>c.type==='declare_attackers'&&c.attackerIds?.includes('atk')));
  if(blocked){
    for(let i=0;i<8&&!choices(s).some(c=>c.type==='declare_blockers');i++)pass(s);
    run(s,choices(s).find(c=>c.type==='declare_blockers'&&c.assignments?.atk?.includes(spawn.id)));
    if(s.turn.priorityPlayerId!=='p1')pass(s);
  }else pass(s);
  return {s,id:spawn.id,index:0};
}

test('58/A16: ostatni legalny bloker nie jest maną na draw pod pewnym lethalem; OFF odtwarza +6',()=>{
  const d=spawnCombat();assert.ok(lootScore(d)<0);assert.equal(decide(d.s).cmd.type,'pass_priority');
  assert.equal(lootScore(d,{manaSacrificeLethalPenalty:0}),6);
  run(d.s,decide(d.s).cmd);
});

for(const cfg of [{life:20},{life:3,other:true},{life:3,flying:true},{life:3,blocked:true}])test(`58/A17 kontrola: mana Spawn pozostaje legalnie wartościowa ${JSON.stringify(cfg)}`,()=>{
  const {life,...opts}=cfg;const d=spawnCombat(life,opts);
  assert.ok(lootScore(d)>0);
  const chosen=decide(d.s).cmd;assert.equal(chosen.type,'activate_ability');run(d.s,chosen);
  assert.ok(!d.s.objects.has(d.id));assert.ok(choices(d.s).some(c=>c.type==='cast_spell'&&c.objectId==='draw'));
});

test('58/A18: po bloku trample ofiara ostatniego ciała ponownie odsłania lethal',()=>{
  const d=spawnCombat(3,{trample:true,blocked:true});assert.ok(lootScore(d)<0);
});

test('58/A19: wszystkie nowe pokrętła rodziny zasobów są jawne i sterowalne',()=>{
  for(const name of ['tokenDrawBankWeight','abilityDiscardCostWeight','sacrificePumpTradeWeight','countedPumpReserveWeight','manaSacrificeLethalPenalty']){
    assert.ok(Number.isFinite(DEFAULT_HEURISTIC_PARAMS[name])&&DEFAULT_HEURISTIC_PARAMS[name]>0,name);
  }
});

test('58/A20: bank tokena skaluje liczbę, zna koszt many i rozróżnia draw od discard+draw',()=>{
  const def=registry.get('bloodtithe-harvester'),fx=def.abilities[0].effect[0];
  const value=(amount,cost,renamed=false)=>{
    const s=game();put(s,'cast',def.id,'p1','hand');addMana(s,'p1',20);lands(s,6);
    const effect={...fx,amount,...(renamed?{name:'Zasób testowy',cardId:'fixture-resource',subtypes:['Fixture']}:{}),
      abilities:[{...fx.abilities[0],cost}]};
    const reg=variant(def.id,{abilities:[{...def.abilities[0],effect:[effect]},def.abilities[1]]});
    const noEtb=variant(def.id,{abilities:[{...def.abilities[0],effect:[]},def.abilities[1]]});
    return score(s,'cast_permanent(cast)',{reg})-score(s,'cast_permanent(cast)',{reg:noEtb});
  };
  const cost=fx.abilities[0].cost;
  const one=value(1,cost);
  assert.ok(one>0);assert.ok(Math.abs(value(3,cost)-3*one)<1e-9);
  assert.equal(value(1,cost,true),one,'nazwa/ID/podtyp nie sterują wyceną roli doboru');
  assert.ok(value(1,{...cost,discardCard:false})>one);
  assert.ok(value(1,{...cost,mana:4})<one,'większa płatność odbiera wartość opcji');
});

test('58/A21: kontrola kosztu aktywacji — ten sam loot za 4 many jest gorszy niż za 1',()=>{
  const cheap=lootScene(),costly=lootScene();
  const object=costly.s.objects.get(costly.id);
  costly.s.objects.set(costly.id,Object.freeze({...object,abilities:object.abilities.map((a,i)=>i===costly.index
    ?{...a,cost:{...a.cost,mana:4}}:a)}));
  addMana(costly.s,'p1',3);
  assert.ok(lootScore(cheap)>lootScore(costly));
});

test('58/A22: kontrola kosztu pompy-ofiary — ten sam skutek za 2 many ma niższą wycenę niż bez many',()=>{
  const value=mana=>{
    const s=harvester();creature(s,'target','p2',{power:4,toughness:4,manaCost:4});
    const h=s.objects.get('harv');s.objects.set(h.id,Object.freeze({...h,abilities:h.abilities.map((a,i)=>i===1?{...a,cost:{...a.cost,mana}}:a)}));
    addMana(s,'p1',mana);return score(s,'activate_ability(harv#1->target)');
  };
  assert.equal(value(0)-value(2),2);
});
