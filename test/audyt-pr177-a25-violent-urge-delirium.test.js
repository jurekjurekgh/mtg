// Audyt zmian PR #177: Violent Urge (DSK) i realna zmiana typu grobu na stosie.
// Oracle: "If there are four or more card types among cards in your graveyard,
// that creature gains double strike until end of turn."
// https://scryfall.com/card/dsk/164/violent-urge
// CR 608.2h: "If an effect requires information from the game ... the answer is
// determined only once, when the effect is applied."
// https://crypticstudy.com/rules/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { effectiveKeywords, effectivePower } from '../src/engine/permanents.js';
import { countGraveyardCardTypes } from '../src/engine/graveyard-types.js';
import { CARD_TYPES } from '../src/engine/permanents.js';

const reg = createCardRegistry();
function put(s, id, cardId, zone = 'battlefield', playerId = 'p1') {
  const d = reg.get(cardId); assert.ok(d, cardId);
  addObject(s, { id, instanceId: `i-${id}`, cardId, zone, ownerId: playerId, controllerId: playerId,
    ...gameObjectDataOf(d), types: d.types ?? [], subtypes: d.subtypes ?? [], keywords: d.keywords ?? [] });
}
function scene({ sorcery = false } = {}) {
  const s = createGameState({ seed: 177240, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main1', 'p1'); s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  put(s, 'host', 'highland-game'); put(s, 'urge', 'violent-urge', 'hand');
  put(s, 'land', 'basic-forest', 'graveyard'); put(s, 'scarab', 'halo-scarab', 'graveyard');
  if (sorcery) put(s, 'sorcery', 'caravan-vigil', 'graveyard');
  addMana(s, 'p1', 5, { colors: ['R'] });
  return s;
}
const offers = s => playerView(s, s.turn.priorityPlayerId).legalCommands;
function act(s, cmd) { assert.ok(cmd, 'komenda widoczna'); const result = execute(s, cmd); assert.equal(result.ok, true, JSON.stringify(result)); }
function passUntil(s, done) {
  for (let i = 0; i < 16 && !done(); i++) act(s, offers(s).find(c => c.type === 'pass_priority'));
  assert.ok(done(), 'osiągnięto rozstrzygnięcie');
}
function castUrge(s) {
  act(s, offers(s).find(c => c.type === 'cast_spell' && c.objectId === 'urge' && c.targets?.[0] === 'host'));
}
function check(s, doubleStrike) {
  const host = s.objects.get('host'); const keywords = effectiveKeywords(host, s);
  assert.equal(effectivePower(host, s), 3); assert.ok(keywords.includes('first_strike'));
  assert.equal(keywords.includes('double_strike'), doubleStrike);
}

test('A25: wielotypowy Halo Scarab daje łącznie dwa typy i Violent Urge nie liczy siebie ze stosu', () => {
  const s = scene(); assert.equal(countGraveyardCardTypes(s, 'p1', CARD_TYPES), 3);
  castUrge(s); passUntil(s, () => s.zones.stack.length === 0); check(s, false);
});

test('A25: czwarty typ obecny od rzucenia daje double strike', () => {
  const s = scene({ sorcery: true }); assert.equal(countGraveyardCardTypes(s, 'p1', CARD_TYPES), 4);
  castUrge(s); passUntil(s, () => s.zones.stack.length === 0); check(s, true);
});

test('A25: aktywacja Halo Scarab przed rozstrzygnięciem usuwa delirium', () => {
  const s = scene({ sorcery: true }); castUrge(s);
  act(s, offers(s).find(c => c.type === 'activate_ability' && c.objectId === 'scarab'));
  assert.equal(countGraveyardCardTypes(s, 'p1', CARD_TYPES), 2);
  passUntil(s, () => s.zones.stack.length === 0); check(s, false);
});

test('A25: Shock w odpowiedzi dodaje czwarty typ przed rozstrzygnięciem Violent Urge', () => {
  const s = scene(); put(s, 'shock', 'shock', 'hand'); castUrge(s);
  act(s, offers(s).find(c => c.type === 'cast_spell' && c.objectId === 'shock' && c.targets?.[0] === 'p2'));
  passUntil(s, () => s.zones.stack.length === 1);
  assert.equal(countGraveyardCardTypes(s, 'p1', CARD_TYPES), 4);
  passUntil(s, () => s.zones.stack.length === 0); check(s, true);
});
