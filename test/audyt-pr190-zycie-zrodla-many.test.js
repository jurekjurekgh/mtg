import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { manualManaOfferUnits } from '../src/engine/abilities.js';
import { isActivatedManaAbility } from '../src/engine/mana-sources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

// CR 118.3 (wydanie 2026-11-06): „A player can’t pay a cost without having
// the necessary resources to pay it fully. For example, a player with only
// 1 life can’t pay a cost of 2 life”. https://yawgatog.com/resources/magic-rules/#R1183
// CR 107.4f: „A Phyrexian mana symbol represents a cost that can be paid
// either with one mana of its color or by paying 2 life.”
// https://yawgatog.com/resources/magic-rules/#R1074f
// CR 605.3a pozwala aktywować źródła many podczas płacenia za czar.
// https://api.scryfall.com/cards/ogw/74/rulings (lista pusta).
const registry = createCardRegistry();
function put(s, id, cardId, zone = 'battlefield') {
  const [entry] = createCardDeck({ cardIds: [cardId], ownerId: 'p1', registry });
  const { id: _id, instanceId, cardId: _cardId, ownerId, controllerId, objectId, zone: _zone, ...rest } = entry;
  addObject(s, { ...rest, id, instanceId: `i-${id}`, cardId, ownerId: 'p1', controllerId: 'p1', zone });
}
function scene(life) {
  const s = createGameState({ seed: 190, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  s.players.find(p => p.id === 'p1').life = life;
  put(s, 't1', 'kozileks-translator');
  put(s, 't2', 'kozileks-translator');
  put(s, 'gutsy', 'mister-gutsy', 'hand');
  return s;
}
function castable(s) { return playerView(s, 'p1').legalCommands.some(c => c.type === 'cast_permanent' && c.objectId === 'gutsy'); }
test('Dwa Translatory dzielą wspólne życie: 1 życie = najwyżej jedna mana', () => {
  const s = scene(1);
  assert.equal(manualManaOfferUnits(s, 'p1').amount, 1);
  assert.equal(castable(s), false, 'nie można opłacić dwóch aktywacji jednym życiem');
});
test('Dwa Translatory z dwoma życiami = dwie jednostki do oferty', () => {
  const s = scene(2);
  assert.equal(manualManaOfferUnits(s, 'p1').amount, 2);
  assert.equal(castable(s), true);
});

// Jednowymiarowy wynik manualManaOfferUnits nie reprezentuje alternatyw
// kolorowych. Nowy kształt źródła życia wymaga świadomej rozbudowy planera,
// inaczej przestałaby być dokładna suma osiągalnych jednostek.
test('Strażnik: obecne źródła many opłacane życiem mają jednorodny koszt i wynik', () => {
  const sources = registry.all().flatMap(card => (card.abilities ?? [])
    .filter(a => a.cost?.life && isActivatedManaAbility(a))
    .map(a => ({ card: card.id, cost: a.cost.life, once: a.oncePerTurn, effects: Array.isArray(a.effect) ? a.effect : [a.effect] })));
  assert.ok(sources.length > 0);
  for (const source of sources) {
    assert.equal(source.cost, 1, source.card);
    assert.equal(source.once, true, source.card);
    assert.equal(source.effects.length, 1, source.card);
    assert.equal(source.effects[0].type, 'add_mana', source.card);
    assert.equal(source.effects[0].amount, 1, source.card);
    assert.deepEqual(source.effects[0].colors ?? [], [], source.card);
  }
});

test('Koszt Phyrexian i aktywacje Translatorów zużywają wspólne życie — permanent', () => {
  const s = scene(3);
  put(s, 'legion', 'porcelain-legionnaire', 'hand');
  const phy = () => playerView(s, 'p1').legalCommands.filter(c => c.objectId === 'legion' && c.phyrexianPayWithLife === 1);
  assert.equal(phy().length, 0, '2 many za życie oraz 2 życia za {W/P} wymagają w sumie 4 życia');
  s.players.find(p => p.id === 'p1').life = 4;
  assert.equal(phy().length, 1, 'przy czterech życiach można zapłacić oba koszty');
});

test('Koszt Phyrexian i aktywacje Translatorów zużywają wspólne życie — sorcery', () => {
  const s = scene(4);
  put(s, 't3', 'kozileks-translator');
  put(s, 'invasion', 'ruthless-invasion', 'hand');
  const phy = () => playerView(s, 'p1').legalCommands.filter(c => c.objectId === 'invasion' && c.phyrexianPayWithLife === 1);
  assert.equal(phy().length, 0, '3 many za życie oraz 2 życia za {R/P} wymagają w sumie 5 życia');
  s.players.find(p => p.id === 'p1').life = 5;
  assert.equal(phy().length, 1, 'przy pięciu życiach można zapłacić oba koszty');
});

// Anty-over-fix: mana z puli nie kosztuje ponownie życia.
test('Zapas many i jedno życie na Translatora wystarczają obok Phyrexian', () => {
  const s = scene(3);
  put(s, 'legion', 'porcelain-legionnaire', 'hand');
  addMana(s, 'p1', 1);
  assert.ok(playerView(s, 'p1').legalCommands.some(c => c.objectId === 'legion' && c.phyrexianPayWithLife === 1));
});

test('Jeden Translator i mana z puli nie wystarczają przy dwóch życiach na Phyrexian', () => {
  const s = createGameState({ seed: 190, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  s.players[0].life = 2;
  put(s, 'translator', 'kozileks-translator');
  put(s, 'legion', 'porcelain-legionnaire', 'hand');
  addMana(s, 'p1', 1);
  const offer = () => playerView(s, 'p1').legalCommands.some(c => c.objectId === 'legion' && c.phyrexianPayWithLife === 1);
  assert.equal(offer(), false);
  s.players[0].life = 3;
  assert.equal(offer(), true);
});

test('Przejęty Translator przeciwnika dzieli życie z własnym w ofercie', () => {
  const s = createGameState({ seed: 190, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  s.players[0].life = 1;
  put(s, 'own', 'kozileks-translator');
  const [entry] = createCardDeck({ cardIds: ['kozileks-translator'], ownerId: 'p2', registry });
  const { id: _id, instanceId, cardId: _cardId, ownerId, controllerId, objectId, zone, ...rest } = entry;
  addObject(s, { ...rest, id: 'opponent', instanceId: 'i-opponent', cardId: 'kozileks-translator', ownerId: 'p2', controllerId: 'p2', zone: 'battlefield' });
  put(s, 'awaken', 'awaken-the-sleeper', 'hand');
  put(s, 'gutsy', 'mister-gutsy', 'hand');
  addMana(s, 'p1', 4, { colors: ['R'] });
  const cast = playerView(s, 'p1').legalCommands.find(c => c.objectId === 'awaken' && c.targets?.includes('opponent'));
  assert.ok(cast); assert.equal(execute(s, cast).ok, true);
  for (let i = 0; i < 12 && s.zones.stack.length; i++) {
    const pass = playerView(s, s.turn.priorityPlayerId).legalCommands.find(c => c.type === 'pass_priority');
    assert.ok(pass); assert.equal(execute(s, pass).ok, true);
  }
  assert.equal(s.zones.stack.length, 0);
  assert.equal(s.objects.get('opponent').controllerId, 'p1');
  assert.equal(manualManaOfferUnits(s, 'p1').amount, 1);
  assert.equal(castable(s), false);
});
