// CR 702.72a: "When this permanent enters, sacrifice it unless you exile
// another [object] you control"; "When this permanent leaves the battlefield,
// return the exiled card to the battlefield under its owner's control."
// CR 702.18 (702.18a): „Shroud is a static ability. “Shroud” means “This
// permanent or player can’t be the target of spells or abilities.”” Wybór
// championa nie celuje.
// CR 704.5d: "If a token is in a zone other than the battlefield, it ceases to exist."
// CR 111.7: token poza polem przestaje istnieć. 111.8: token, który opuścił
// pole, nie może zmienić strefy ani wrócić na pole bitwy.
// Źródło: github.com/nwgarne/mtg-data/blob/main/rules/cr-raw.txt, wyd. 2026-09-25,
// SHA-256 8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';
import { replayFromState, verifyReplay } from '../src/engine/replay.js';
const registry = createCardRegistry();
function put(s, id, cardId, zone='hand', player='p1') {
  const d=registry.get(cardId); assert.ok(d, cardId);
  addObject(s,{id,instanceId:`i-${id}`,cardId,zone,ownerId:player,controllerId:player,
    ...gameObjectDataOf(d),types:d.types??[],subtypes:d.subtypes??[],keywords:d.keywords??[]});
}
function setup(host='scythe-tiger') {
 const s=createGameState({seed:17731,players:[{id:'p1'},{id:'p2'}]});
 s.turn=jumpToStep(s.turn,'main','p1'); s.turn.activePlayerId=s.turn.priorityPlayerId='p1';
 if (host) put(s,'host',host,'battlefield');
 put(s,'champ','changeling-berserker'); put(s,'kill','terminal-agony');
 addMana(s,'p1',16,{colors:['R','B','G']}); return s;
}
const view=s=>playerView(s,s.turn.priorityPlayerId);
function act(s,cmd) { assert.ok(cmd,'brak rzeczywistej komendy'); const r=execute(s,cmd); assert.ok(r.ok,JSON.stringify(r)); }
function until(s,predicate) {
 for(let i=0;i<20 && !predicate();i++) act(s,view(s).legalCommands.find(c=>c.type==='pass_priority'));
 assert.ok(predicate(),'oczekiwany stan po rundach priorytetu');
}
function cast(s,id) {act(s,view(s).legalCommands.find(c=>c.type==='cast_permanent'&&c.objectId===id));}
function pending(s) {cast(s,'champ');until(s,()=>s.pendingSacrifice!=null);}
function creature(s,id) {return [...s.objects.values()].find(o=>o.zone==='battlefield'&&o.cardId===id);}
function destroyChampion(s) {
 const champ=creature(s,'changeling-berserker');assert.ok(champ);
 act(s,view(s).legalCommands.find(c=>c.type==='cast_spell'&&c.objectId==='kill'&&c.targets?.includes(champ.id)));
 until(s,()=>s.zones.stack.length===0 || s.pendingSacrifice!=null);
}

test('A31: Scythe Tiger z shroud może zostać wybrany i wraca po śmierci championa',()=>{
 const s=setup();put(s,'land','basic-forest','battlefield');put(s,'enemy','highland-game','battlefield','p2');
 assert.ok(view(s).legalCommands.some(c=>c.type==='cast_spell'&&c.objectId==='kill'&&c.targets?.includes('enemy')),'Terminal Agony ma inny legalny cel');
 assert.ok(!view(s).legalCommands.some(c=>c.type==='cast_spell'&&c.objectId==='kill'&&c.targets?.includes('host')),'shroud zabrania celowania');
 pending(s);
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_sacrifice_choice'&&c.targetId==='host'));
 assert.ok([...s.objects.values()].some(o=>o.cardId==='scythe-tiger'&&o.zone==='exile'));
 destroyChampion(s);assert.ok(creature(s,'scythe-tiger'),'wygnana karta wraca');
 assert.ok(s.pendingSacrifice, 'ETB powracającego tygrysa żąda poświęcenia lądu');
 act(s,view(s).legalCommands.find(c=>c.type==='resolve_sacrifice_choice'&&c.targetId==='land'));
 assert.ok(creature(s,'scythe-tiger'),'tygrys zostaje po poświęceniu lądu');
});

test('A31: Ambassador Oak tworzy token, który champion może wygnać, lecz nie może go zwrócić',()=>{
 const s=setup(null);put(s,'oak','ambassador-oak');cast(s,'oak');until(s,()=>s.zones.stack.length===0);
 const token=creature(s,'token_elf_warrior');assert.ok(token?.isToken);
 pending(s);act(s,view(s).legalCommands.find(c=>c.type==='resolve_sacrifice_choice'&&c.targetId===token.id));
 assert.ok(![...s.objects.values()].some(o=>o.instanceId===token.instanceId),'token przestaje istnieć przed priorytetem');
 destroyChampion(s);assert.ok(!creature(s,'token_elf_warrior'));assert.ok(creature(s,'ambassador-oak'));
});

for (const decision of ['host', 'champion']) test(`A31: rzeczywista decyzja championa (${decision}) we fingerprint i replay`,()=>{
 const s=setup();pending(s);const before=stateFingerprint(s), projected=JSON.parse(before);
 assert.equal(projected.pendingSacrifice.moveTo,'exile');assert.equal(projected.pendingSacrifice.champion,true);
 const targetId=decision==='host'?'host':creature(s,'changeling-berserker').id;
 const choice=view(s).legalCommands.find(c=>c.type==='resolve_sacrifice_choice'&&c.targetId===targetId);act(s,choice);
 assert.notEqual(stateFingerprint(s),before);
 if(decision==='host') assert.ok([...s.objects.values()].some(o=>o.cardId==='scythe-tiger'&&o.zone==='exile'));
 else assert.ok([...s.objects.values()].some(o=>o.cardId==='changeling-berserker'&&o.zone==='graveyard'));
 const replay=replayFromState(s);
 const result=verifyReplay({...replay,commands:replay.commands.slice(-1)},()=>{const x=setup();pending(x);return x;},execute);
 assert.ok(result.deterministic);assert.ok(result.results.every(r=>r.ok));assert.equal(stateFingerprint(result.state),stateFingerprint(s));
});
