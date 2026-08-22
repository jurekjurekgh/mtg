// M171/N1 (audyt PR #68): Adamant a jednostki wielokolorowe many.
// CR 106.7: kolor many „dowolnego koloru" (Skarb) wybiera GRACZ przy
// produkcji — racjonalny gracz rzucający Locthwain Paladina wybiera czarny.
// Silnik odracza wybór koloru (jednostka wielokolorowa w puli), więc:
// (1) jednostka dopasowana do pipa {B} została wydana JAKO czarna,
// (2) jednostka wielokolorowa wydana na generic liczy się jako wildcard
//     (gracz mógł wybrać kolor pod adamant).
// Scenariusz osiągalny w decks/dominaria.txt: Fake Your Own Death (Skarb)
// + Locthwain Paladin ({3}{B}, Adamant — 3 czarne = +1/+1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 171, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'hand') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

function castPaladin(state) {
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'pal');
  assert.ok(cast, 'oferta rzutu Paladyna');
  assert.ok(execute(state, cast).ok);
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  const onBf = [...state.objects.values()].find((o) => o.cardId === 'locthwain-paladin' && o.zone === 'battlefield');
  assert.ok(onBf, 'Paladyn na polu bitwy');
  return onBf;
}

test('N1a: 2x Swamp + Skarb (dowolny kolor) + bezbarwna — adamant TRZYMA', () => {
  // Pipy: {B} <- swamp/skarb; generic 3: swamp + skarb + bezbarwna.
  // Racjonalny wybór koloru Skarba przy produkcji = B -> 3 czarne wydane.
  const state = game('p1');
  putCard(state, 'pal', 'locthwain-paladin', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['B'] });
  addMana(state, 'p1', 1, { colors: ['W', 'U', 'B', 'R', 'G'] }); // Skarb
  addMana(state, 'p1', 1, { colors: [] }); // bezbarwna
  const onBf = castPaladin(state);
  assert.equal((onBf.counters ?? {})['+1/+1'], 1,
    'Skarb wydany jako czarna mana liczy się do Adamant (CR 106.7 — wybór gracza)');
});

test('N1b: 1x Swamp + Skarb + 2x bezbarwna — adamant NIE trzyma (max 2 czarne)', () => {
  // Nawet z wildcardem Skarba: swamp + skarb = 2 < 3 — licznika brak.
  const state = game('p1');
  putCard(state, 'pal', 'locthwain-paladin', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['B'] });
  addMana(state, 'p1', 1, { colors: ['W', 'U', 'B', 'R', 'G'] });
  addMana(state, 'p1', 2, { colors: [] });
  const onBf = castPaladin(state);
  assert.equal((onBf.counters ?? {})['+1/+1'], undefined,
    'dwie potencjalnie czarne jednostki to za mało — bez licznika');
});

test('N1c: pip {B} opłacony jednostką dwukolorową B/G — liczy się jako czarny', () => {
  // Jednostka {B/G} dopasowana do pipa {B}: przecięcie jednoznaczne = B.
  const state = game('p1');
  putCard(state, 'pal', 'locthwain-paladin', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['B'] });
  addMana(state, 'p1', 1, { colors: ['B', 'G'] });
  addMana(state, 'p1', 1, { colors: [] });
  const onBf = castPaladin(state);
  assert.equal((onBf.counters ?? {})['+1/+1'], 1,
    'B/G wydana na pip {B} albo generic-wildcard — 3 czarne osiągalne');
});
