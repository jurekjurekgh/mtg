// PMSSB-58/B — wspólna miara modalnego ETB, ward i zwrotów do ręki.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {game,put,creature,lands,decide,score,variant,run,pass,settle,choices,registry,cast,addMana,playerView} from './helpers/pmssb58.js';
import {addObject} from '../src/engine/game-state.js';
import {addCounter} from '../src/engine/counters.js';
import {DEFAULT_HEURISTIC_PARAMS} from '../src/controllers/heuristic-params.js';

function battle(s,{id='battle',controller='p2',protector=controller,defense=2,ward=0}={}){
  addObject(s,{id,instanceId:`i-${id}`,cardId:'fixture-battle',controllerId:controller,protectorId:protector,
    zone:'battlefield',kind:'battle',types:['Battle'],subtypes:controller!==protector?['Siege']:[],keywords:ward?['ward']:[]});
  addCounter(s,id,'defense',defense);
  if(ward)s.objects.set(id,Object.freeze({...s.objects.get(id),ward}));
}
function modal(s,cid='etched-host-doombringer'){
  cast(s,cid);settle(s,x=>Boolean(x.pendingModalTrigger));assert.ok(s.pendingModalTrigger);return s;
}
const mlabel=(mode,target)=>`resolve_modal_choice(${mode}${target?'->'+target:''})`;
function castDelta(s,cid,params){
  put(s,'cast',cid,'p1','hand');addMana(s,'p1',registry.get(cid).manaCost,{colors:registry.get(cid).colors});
  const d=registry.get(cid);const noEtb=variant(cid,{abilities:d.abilities.map(a=>a.trigger?.event==='enter_battlefield'
    ?{...a,effect:[],trigger:{...a.trigger,modes:null}}:a)});
  return score(s,'cast_permanent(cast)',{params})-score(s,'cast_permanent(cast)',{reg:noEtb,params});
}

test('58/B1: modalny ETB jest wypłatą rzutu, a lethal zwiększa ją; OFF odtwarza 0',()=>{
  const healthy=game();const ordinary=castDelta(healthy,'etched-host-doombringer');
  assert.ok(ordinary>0,'PRZED: +0 za drain');
  const lethal=game();lethal.players[1].life=2;assert.ok(castDelta(lethal,'etched-host-doombringer')>ordinary);
  assert.equal(castDelta(game(),'etched-host-doombringer',{modalEtbValueWeight:0}),0);
});

test('58/B2 L41: po zdrowym rzucie najlepszy efekt modala ma tę samą miarę co anticipacja ETB',()=>{
  const delta=castDelta(game(),'etched-host-doombringer');
  const s=modal(game());const effectScore=score(s,mlabel(0,'p2'))-10;
  assert.ok(Math.abs(delta-effectScore*0.9)<1e-8,'tylko mnożnik rodziny permanent=0,9');
  const d=decide(s);run(s,d.cmd);settle(s);assert.equal(s.players[1].life,18);assert.equal(s.players[0].life,22);
});

test('58/B3: wskazany przeciwnik jest zegarem lethalu, nie pierwszy gracz z enemy(view)',()=>{
  const s=game({players:['p1','p2','p3']});s.players[2].life=2;modal(s);
  const d=decide(s);assert.equal(d.cmd.targetId,'p3');
  assert.ok(d.scores.get(mlabel(0,'p3'))>d.scores.get(mlabel(0,'p2')));
  run(s,d.cmd);settle(s);assert.ok(s.players[2].life<=0);
});

test('58/B4: ward nie do opłacenia przenosi wybór z bitwy na rzeczywisty drain',()=>{
  const s=game();battle(s,{ward:8});modal(s);
  const d=decide(s);assert.equal(d.cmd.modeIndex,0,'PRZED: bitwa 24 > drain 20 mimo ward8/pula0');
  assert.ok(d.scores.get(mlabel(1,'battle'))<0);
  run(s,d.cmd);settle(s);assert.equal(s.players[1].life,18);assert.equal(s.objects.get('battle').counters.defense,2);
});

test('58/B5: opłacalny ward 1 można zapłacić; cały wybór i płatność przyjmuje silnik',()=>{
  const s=game();battle(s,{ward:1});modal(s);addMana(s,'p1',1);
  const d=decide(s);assert.equal(d.cmd.modeIndex,1);run(s,d.cmd);
  settle(s,x=>Boolean(x.pendingWardPay));assert.ok(s.pendingWardPay);
  const pay=decide(s).cmd;assert.equal(pay.type,'resolve_ward_pay_choice');assert.equal(pay.pay,true);run(s,pay);settle(s);
  assert.ok(!s.objects.has('battle'));
});

test('58/B6: własny kontroler i przeciwny protector nie płaci własnego wardu',()=>{
  const s=game();battle(s,{controller:'p1',protector:'p2',defense:2,ward:8});modal(s);
  assert.ok(score(s,mlabel(1,'battle'))>0);const d=decide(s);assert.equal(d.cmd.modeIndex,1);run(s,d.cmd);settle(s);
});

test('58/B7: dwa cele bitwy nie remisują na literalnych 3 — liczba możliwa do zdjęcia i domknięcie obrony',()=>{
  const s=game();battle(s,{id:'close',defense:2});battle(s,{id:'far',defense:6});modal(s);
  assert.ok(score(s,mlabel(1,'close'))>score(s,mlabel(1,'far')));
  const off={battleDefeatBonus:0};assert.ok(score(s,mlabel(1,'close'),{params:off})<score(s,mlabel(1,'far'),{params:off}));
  assert.ok(score(s,mlabel(1,'far'),{params:{battleDefensePerCounter:0}})<score(s,mlabel(1,'far')));
});

test('58/B8: anticipacja modala rezerwuje manę rzutu przed wardem i nie sumuje obu trybów',()=>{
  const normal=castDelta(game(),'etched-host-doombringer');
  const blocked=game();battle(blocked,{ward:8});assert.equal(castDelta(blocked,'etched-host-doombringer'),normal);
  const better=game();battle(better);assert.ok(castDelta(better,'etched-host-doombringer')>normal);
});

test('58/B9: Inspiring Bard używa tego samego modelu pompy — lepszy jest gotowy sojusznik, nie sam heal',()=>{
  const s=game();creature(s,'ready','p1',{power:2,toughness:2});creature(s,'sick','p1',{power:2,toughness:2,summoningSickness:true});modal(s,'inspiring-bard');
  const d=decide(s);assert.equal(d.cmd.modeIndex,0);assert.equal(d.cmd.targetId,'ready');
  assert.ok(d.scores.get(mlabel(0,'ready'))>d.scores.get(mlabel(0,'sick')));
  run(s,d.cmd);settle(s);assert.equal(playerView(s,'p1').zones.battlefield.find(o=>o.id==='ready').power,4);
});

test('58/B10: Downwind Ambusher wybiera rzeczywisty większy kill, nie pierwsze równe 10',()=>{
  const s=game();creature(s,'small','p2',{power:1,toughness:1,manaCost:1});creature(s,'big','p2',{power:5,toughness:5,manaCost:5,damage:1,damagedThisTurn:true});modal(s,'downwind-ambusher');
  const d=decide(s);assert.equal(d.cmd.modeIndex,1);assert.equal(d.cmd.targetId,'big');
  assert.ok(d.scores.get(mlabel(1,'big'))>d.scores.get(mlabel(0,'small')));
  run(s,d.cmd);settle(s);assert.ok(!s.objects.has('big'));assert.ok(s.objects.has('small'));
});

test('58/B11: historyczne zranienie po usunięciu markerów obrażeń jest jawne dla anticipacji modala',()=>{
  const s=game();creature(s,'hurt','p2',{power:5,toughness:5,manaCost:5,damage:0,damagedThisTurn:true});
  assert.equal(playerView(s,'p1').zones.battlefield.find(o=>o.id==='hurt').damagedThisTurn,true);
  const hit=castDelta(s,'downwind-ambusher');const fresh=game();creature(fresh,'hurt','p2',{power:5,toughness:5,manaCost:5});
  assert.ok(hit>castDelta(fresh,'downwind-ambusher'));
});

test('58/B12: mode/target i flashback/target są rozróżnialne w trace',()=>{
  const s=game();battle(s);modal(s);const d=decide(s);
  assert.ok(d.scores.has(mlabel(0,'p2')));assert.ok(d.scores.has(mlabel(1,'battle')));
  const f=game();put(f,'inv','dig-site-inventory','p1','graveyard');creature(f,'a','p1');creature(f,'b','p1');addMana(f,'p1',1);
  const t=decide(f);assert.ok(t.scores.has('cast_flashback(inv->a)'));assert.ok(t.scores.has('cast_flashback(inv->b)'));
});

function uprising({lib=24}={}){
  const s=game({lib});lands(s,5);put(s,'rise','urborg-uprising','p1','hand');
  put(s,'g1','bloodtithe-harvester','p1','graveyard');put(s,'g2','maritime-guard','p1','graveyard');
  return s;
}
const gyLabel=(a='',b='')=>`cast_spell(rise->${a}+${b})`;

test('58/B13: Urborg 0/1/2 cele mają różne wypłaty, drugi slot nie jest pierwszym policzonym dwa razy',()=>{
  const s=uprising();const zero=score(s,gyLabel());const one=score(s,gyLabel('g1'));const two=score(s,gyLabel('g1','g2'));
  const other=score(s,gyLabel('g2'));
  assert.ok(two>one&&one>zero,`${two}>${one}>${zero}`);
  assert.ok(Math.abs((two-one)-(other-zero))<1e-8,'drugi slot wnosi swoją wartość');
  const d=decide(s);assert.equal(d.cmd.targets.filter(Boolean).length,2);run(s,d.cmd);settle(s);
  assert.equal(s.zones.hand.filter(id=>s.objects.get(id)?.controllerId==='p1').length,3,'dwa zwroty + dobór');
});

test('58/B14: pokrętło aliasu Urborg przywraca stary remis 56, bez usuwania doboru',()=>{
  const s=uprising();const params={graveReturnAliasWeight:0,graveReturnCastManaWeight:0};
  for(const label of [gyLabel(),gyLabel('g1'),gyLabel('g1','g2')])assert.equal(score(s,label,{params}),56);
});

test('58/B15: karta możliwa do zagrania wygrywa z większą, ale całkiem bez koloru; odzyskanie jej nadal jest zasobem',()=>{
  const s=game();lands(s,6);put(s,'rise','urborg-uprising','p1','hand');
  put(s,'black','fathom-fleet-cutthroat','p1','graveyard');put(s,'green','woolly-loxodon','p1','graveyard');
  assert.ok(score(s,gyLabel('black'))>score(s,gyLabel('green')));
  assert.ok(score(s,gyLabel('green'))>score(s,gyLabel()));
  const params={graveReturnAvailabilityWeight:0};assert.ok(score(s,gyLabel('green'),{params})>score(s,gyLabel('black'),{params}));
});

test('58/B16: obowiązkowy dobór z pustej biblioteki nie jest ratowany premią za zwracane stwory',()=>{
  const s=uprising({lib:0});const d=decide(s);assert.equal(d.cmd.type,'pass_priority');
  for(const [name,value] of d.scores)if(name.startsWith('cast_spell'))assert.ok(value<0);
});

test('58/B17 L41: alias zwrotu ma tę samą miarę co Cemetery Recruitment bez ridera Zombie',()=>{
  const contribution=cid=>{
    const s=game();lands(s,6,'basic-island');lands(s,6);put(s,'r',cid,'p1','hand');put(s,'g','maritime-guard','p1','graveyard');
    const def=registry.get(cid);const returns=def.spell.effects.filter(e=>['return_creature_card_to_hand','return_card_from_graveyard_to_hand'].includes(e.type));
    const label=cid==='urborg-uprising'?'cast_spell(r->g+)':'cast_spell(r->g)';
    const value=effects=>{
      const view=structuredClone(playerView(s,'p1'));
      // Czary czytają deskryptor z WIDOKU ręki, nie override rejestru.
      // Wspólny rider draw pozostaje w obu wariantach, żeby brak zwrotu
      // nie włączył kary „cały czar jałowy” i nie udawał przyrostu wartości.
      view.zones.hand.find(o=>o.id==='r').spell.effects=[...effects,{type:'draw_cards',amount:1}];
      return score(s,label,{view,params:{graveReturnCastManaWeight:0}});
    };
    return value(returns)-value([]);
  };
  const alias=contribution('urborg-uprising'),general=contribution('cemetery-recruitment');
  assert.ok(alias>0&&general>0,'porównanie nie jest równością dwóch martwych odczytów');
  assert.equal(alias,general);
});

test('58/B18: Grave Exchange odzyskuje stwora i osobno wycenia ofiarę przeciwnika',()=>{
  const s=game();lands(s,6);put(s,'spell','grave-exchange','p1','hand');put(s,'small','maritime-guard','p1','graveyard');put(s,'black','fathom-fleet-cutthroat','p1','graveyard');creature(s,'foe');
  const d=decide(s);assert.equal(d.cmd.targets[0],'black');assert.equal(d.cmd.targets[1],'p2');
  run(s,d.cmd);settle(s);
  assert.ok(s.zones.hand.some(id=>s.objects.get(id)?.cardId==='fathom-fleet-cutthroat'));
});

test('58/B19: jawne pokrętła modali i aliasów są aktywne w pętli',()=>{
  for(const key of ['modalEtbValueWeight','modalEffectModelWeight','battleDefensePerCounter','battleDefeatBonus','graveReturnAliasWeight','graveReturnAvailabilityWeight','graveReturnCastManaWeight']){
    assert.ok(Number.isFinite(DEFAULT_HEURISTIC_PARAMS[key])&&DEFAULT_HEURISTIC_PARAMS[key]>0,key);
  }
});

test('58/B20: wyłączenie wspólnego modelu trybów odtwarza dawny wybór heala zamiast wartościowej pompy',()=>{
  const s=game();creature(s,'ready','p1',{power:2,toughness:2});modal(s,'inspiring-bard');
  assert.equal(decide(s).cmd.modeIndex,0);
  assert.equal(decide(s,{params:{modalEffectModelWeight:0}}).cmd.modeIndex,1);
});

test('58/B21: anticipacja to maksimum trybu, nie suma wypłat wszystkich alternatyw',()=>{
  const s=game();battle(s,{defense:2});const delta=castDelta(s,'etched-host-doombringer');
  const actual=game();battle(actual,{defense:2});modal(actual);
  const values=[score(actual,mlabel(0,'p2')),score(actual,mlabel(1,'battle'))].map(v=>v-10);
  assert.ok(Math.abs(delta-Math.max(...values)*0.9)<1e-8);
  assert.ok(delta<values.reduce((a,b)=>a+b,0)*0.9);
});

test('58/B22: niedostępny cel modala (hexproof/protection) nie daje wypłaty przy rzucie nosiciela',()=>{
  const plain=castDelta(game(),'etched-host-doombringer');
  for(const shield of ['hexproof','protection']){
    const s=game();battle(s,{defense:2});const b=s.objects.get('battle');
    s.objects.set(b.id,Object.freeze({...b,...(shield==='hexproof'?{keywords:['hexproof']}:{protectionFromColors:['B']})}));
    assert.equal(castDelta(s,'etched-host-doombringer'),plain,shield);
  }
});

test('58/B23: istniejący rider Zombie nie jest darmową kartą przy pustej bibliotece',()=>{
  const s=game({lib:0});lands(s,4);put(s,'spell','cemetery-recruitment','p1','hand');
  put(s,'zombie','mournful-zombie','p1','graveyard');put(s,'human','fathom-fleet-cutthroat','p1','graveyard');
  assert.ok(score(s,'cast_spell(spell->zombie)')<0);
  assert.ok(score(s,'cast_spell(spell->human)')>0);
  const d=decide(s);assert.equal(d.cmd.targets?.[0],'human');run(s,d.cmd);settle(s);assert.equal(s.status,'active');
});

test('58/B24: koszt nosiciela pozostaje kosztem — dodanie bonusu modalnego ETB nie kasuje wymiaru many',()=>{
  const value=cost=>{
    const s=game();put(s,'src','etched-host-doombringer','p1','hand',{manaCost:cost});addMana(s,'p1',10);
    return score(s,'cast_permanent(src)');
  };
  assert.ok(value(5)>value(7));
});


test('58/B25: koszt zwrotu liczony raz na czar — 5 many nie remisuje z 2 przy tej samej wypłacie',()=>{
  const value=(cost,params)=>{
    const s=game();lands(s,12);put(s,'r','urborg-uprising','p1','hand',{manaCost:cost});put(s,'g','fathom-fleet-cutthroat','p1','graveyard');
    return score(s,'cast_spell(r->g+)',{params});
  };
  assert.equal(value(2)-value(5),3);
  assert.equal(value(2,{graveReturnCastManaWeight:0}),value(5,{graveReturnCastManaWeight:0}));
});
