// Audyt PR #177 — Changeling Berserker, karty z obecnego katalogu.
// CR 702.72a: "When this permanent leaves the battlefield, return the exiled
// card to the battlefield under its owner's control."
// https://mtg.fandom.com/wiki/Champion
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';

const reg = createCardRegistry();
function put(s, id, cardId, zone, playerId = 'p1') {
  const d = reg.get(cardId); assert.ok(d);
  addObject(s, { id, instanceId: `i-${id}`, cardId, zone, ownerId: playerId, controllerId: playerId,
    ...gameObjectDataOf(d), types: d.types ?? [], subtypes: d.subtypes ?? [], keywords: d.keywords ?? [] });
}
function scene() {
  const s = createGameState({ seed: 17726, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main1', 'p1'); s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  put(s, 'host', 'highland-game', 'battlefield', 'p2');
  put(s, 'steal', 'awaken-the-sleeper', 'hand'); put(s, 'champ', 'changeling-berserker', 'hand');
  put(s, 'kill', 'terminal-agony', 'hand'); addMana(s, 'p1', 12, { colors: ['R', 'B'] });
  return s;
}
const offers = s => playerView(s, s.turn.priorityPlayerId).legalCommands;
function act(s, cmd) { assert.ok(cmd, 'rzeczywista oferta'); const r = execute(s, cmd); assert.equal(r.ok, true, JSON.stringify(r)); }
function passUntil(s, done) {
  for (let i = 0; i < 20 && !done(); i++) act(s, offers(s).find(c => c.type === 'pass_priority'));
  assert.ok(done(), 'osiągnięto oczekiwany stan');
}
function prepareChampion(s) {
  act(s, offers(s).find(c => c.type === 'cast_spell' && c.objectId === 'steal' && c.targets?.includes('host')));
  passUntil(s, () => s.zones.stack.length === 0);
  assert.equal(s.objects.get('host').controllerId, 'p1', 'Awaken the Sleeper naprawdę zmienia kontrolę');
  act(s, offers(s).find(c => c.type === 'cast_permanent' && c.objectId === 'champ'));
  passUntil(s, () => s.pendingSacrifice != null);
}

test('A26: champion wygna przejętego Highland Game, po śmierci wraca on do właściciela', () => {
  const s = scene(); prepareChampion(s);
  act(s, offers(s).find(c => c.type === 'resolve_sacrifice_choice' && c.targetId === 'host'));
  const champ = [...s.objects.values()].find(o => o.cardId === 'changeling-berserker' && o.zone === 'battlefield');
  assert.ok(champ); assert.ok([...s.objects.values()].some(o => o.cardId === 'highland-game' && o.zone === 'exile'));
  act(s, offers(s).find(c => c.type === 'cast_spell' && c.objectId === 'kill' && c.targets?.includes(champ.id)));
  passUntil(s, () => s.zones.stack.length === 0);
  const host = [...s.objects.values()].find(o => o.cardId === 'highland-game' && o.zone === 'battlefield');
  assert.ok(host); assert.equal(host.controllerId, 'p2'); assert.equal(host.ownerId, 'p2');
});

test('A26: odmowa wygnania poświęca championa, a przejęty stwór pozostaje', () => {
  const s = scene(); prepareChampion(s);
  const champ = [...s.objects.values()].find(o => o.cardId === 'changeling-berserker' && o.zone === 'battlefield');
  assert.ok(champ);
  act(s, offers(s).find(c => c.type === 'resolve_sacrifice_choice' && c.targetId === champ.id));
  assert.equal(s.objects.get('host').zone, 'battlefield');
  assert.equal(s.objects.get('host').controllerId, 'p1');
  assert.ok([...s.objects.values()].some(o => o.cardId === 'changeling-berserker' && o.zone === 'graveyard'));
  assert.equal(s.creatureDiedThisTurn, true, 'poświęcenie championa liczy się do Morbida');
});
