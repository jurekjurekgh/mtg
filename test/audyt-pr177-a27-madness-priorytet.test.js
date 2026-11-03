// CR 702.35a: "Madness is a keyword that represents two abilities. ... The
// second is a triggered ability ... When this card is exiled this way, its
// owner may cast it ... If that player doesn't, they put this card into their
// graveyard." https://boardgames.stackexchange.com/questions/59331/
// CR 603.3: "Once an ability has triggered, its controller puts it on the
// stack ... the next time a player would receive priority."
// CR 117.3c: "If a player has priority when they ... activate an ability ...
// that player receives priority afterward."
// https://blogs.magicjudges.org/rules/comprehensive-rules/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower } from '../src/engine/permanents.js';
const registry = createCardRegistry();
function put(s, id, cardId, zone, playerId = 'p1') {
  const card = registry.get(cardId); assert.ok(card);
  addObject(s, { id, instanceId: `i-${id}`, cardId, zone, ownerId: playerId, controllerId: playerId,
    ...gameObjectDataOf(card), types: card.types ?? [], subtypes: card.subtypes ?? [], keywords: card.keywords ?? [] });
}
function scene() {
  const s = createGameState({ seed: 17727, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main1', 'p1'); s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  put(s, 'hounds', 'vampire-hounds', 'battlefield'); put(s, 'rev', 'revolutionist', 'hand');
  addMana(s, 'p1', 6, { colors: ['R'] }); return s;
}
const offers = s => playerView(s, s.turn.priorityPlayerId).legalCommands;
function act(s, cmd) { assert.ok(cmd, 'oczekiwana oferta'); const r = execute(s, cmd); assert.equal(r.ok, true, JSON.stringify(r)); return r; }
function pass(s) { act(s, offers(s).find(c => c.type === 'pass_priority')); }
function activate(s) { act(s, offers(s).find(c => c.type === 'activate_ability' && c.objectId === 'hounds')); }
function enterDecision(s) { pass(s); pass(s); assert.ok(s.pendingMadnessCast, 'decyzja po rozstrzygnięciu triggera'); }
function drain(s) {
  for (let i = 0; i < 20 && s.zones.stack.length; i++) pass(s);
  assert.equal(s.zones.stack.length, 0);
}

test('A27: po odrzuceniu Revolutionist trigger madness jest na stosie i jest okno odpowiedzi', () => {
  const s = scene(); activate(s);
  assert.equal(s.pendingMadnessCast, null, 'decyzja nie wyprzedza rozstrzygnięcia triggera');
  assert.equal(s.zones.stack.length, 2);
  assert.equal(s.objects.get(s.zones.stack[0]).kind, 'activated');
  assert.equal(s.objects.get(s.zones.stack[1]).triggerEntry?.ability?.trigger?.event, 'madness');
  assert.ok(offers(s).some(c => c.type === 'pass_priority'));
  enterDecision(s);
  act(s, offers(s).find(c => c.type === 'resolve_madness_cast' && !c.cast));
  drain(s); assert.equal(effectivePower(s.objects.get('hounds'), s), 4);
  assert.ok([...s.objects.values()].some(o => o.cardId === 'revolutionist' && o.zone === 'graveyard'));
});

test('A27: przeciwnik odpowiada Shockiem na madness przed decyzją o Revolutionist', () => {
  const s = scene(); put(s, 'shock', 'shock', 'hand', 'p2'); addMana(s, 'p2', 1, { colors: ['R'] });
  activate(s); pass(s);
  act(s, offers(s).find(c => c.type === 'cast_spell' && c.objectId === 'shock' && c.targets?.includes('hounds')));
  pass(s); pass(s);
  assert.ok([...s.objects.values()].some(o => o.cardId === 'vampire-hounds' && o.zone === 'graveyard'));
  assert.equal(s.pendingMadnessCast, null, 'trigger madness jeszcze czeka na stosie');
  pass(s); pass(s);
  act(s, offers(s).find(c => c.type === 'resolve_madness_cast' && c.cast));
  drain(s);
  assert.ok([...s.objects.values()].some(o => o.cardId === 'revolutionist' && o.zone === 'battlefield'));
});

test('A27: gracz może odrzucić Revolutionist przez wybór spośród dwóch stworów', () => {
  const s = scene(); put(s, 'other', 'highland-game', 'hand'); put(s, 'spell', 'shock', 'hand'); activate(s);
  assert.ok(s.pendingDiscardChoice);
  assert.ok(!offers(s).some(c => c.type === 'resolve_discard_choice' && c.cardId === 'spell'));
  act(s, offers(s).find(c => c.type === 'resolve_discard_choice' && c.cardId === 'rev'));
  assert.ok(offers(s).some(c => c.type === 'pass_priority'));
  enterDecision(s);
  act(s, offers(s).find(c => c.type === 'resolve_madness_cast' && !c.cast));
  drain(s); assert.equal(s.objects.get('other').zone, 'hand');
});

test('A27: Vampire Hounds w turze przeciwnika — po decyzji priorytet wraca do aktywnego gracza', () => {
  const s = scene(); s.turn.activePlayerId = 'p2'; s.turn.priorityPlayerId = 'p1';
  activate(s); enterDecision(s);
  act(s, offers(s).find(c => c.type === 'resolve_madness_cast' && !c.cast));
  assert.equal(s.turn.priorityPlayerId, 'p2');
  drain(s); assert.equal(effectivePower(s.objects.get('hounds'), s), 4);
});

test('A27: Cathartic Reunion odrzuca Terminal Agony; przeciwnik odpowiada zanim wybierze się cel madness', () => {
  const s = createGameState({ seed: 17728, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main1', 'p1'); s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  put(s, 'reunion', 'cathartic-reunion', 'hand'); put(s, 'agony', 'terminal-agony', 'hand');
  put(s, 'forest', 'basic-forest', 'hand'); put(s, 'victim', 'vampire-hounds', 'battlefield', 'p2');
  for (let i = 0; i < 3; i++) put(s, `lib${i}`, 'basic-island', 'library');
  put(s, 'shock', 'shock', 'hand', 'p2'); addMana(s, 'p1', 4, { colors: ['R', 'B'] });
  addMana(s, 'p2', 1, { colors: ['R'] });
  act(s, offers(s).find(c => c.type === 'cast_spell' && c.objectId === 'reunion'));
  assert.equal(s.pendingMadnessCast, null);
  assert.equal(s.objects.get(s.zones.stack.at(-1)).triggerEntry?.ability?.trigger?.event, 'madness');
  pass(s);
  act(s, offers(s).find(c => c.type === 'cast_spell' && c.objectId === 'shock' && c.targets?.includes('victim')));
  pass(s); pass(s);
  assert.notEqual(s.objects.get('victim')?.zone, 'battlefield');
  enterDecision(s);
  assert.ok(!offers(s).some(c => c.type === 'resolve_madness_cast' && c.cast), 'celu już nie ma');
  act(s, offers(s).find(c => c.type === 'resolve_madness_cast' && !c.cast));
  drain(s);
  assert.ok([...s.objects.values()].some(o => o.cardId === 'terminal-agony' && o.zone === 'graveyard'));
  assert.equal(s.zones.hand.filter(id => s.objects.get(id).controllerId === 'p1').length, 3);
});
