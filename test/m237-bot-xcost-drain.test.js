// M237/1 — audyt Żywym Testerem (2026-08-27), partia alara vs theros / szersza
// próbka: bot rzucił Consume Spirit (X-drain: „X obrażeń w dowolny cel + zyskaj
// X życia", spend only black on X) za X=0 — 2 many za ZERO obrażeń i zero życia.
//
// Oś 1 audytu (nieoptymalne użycie czaru). Root cause: efekty czaru X-cost
// niosą `amount: 'X'` (nie-liczba), więc wycena damage/gain_life traktowała je
// jako 0 → WSZYSTKIE warianty X miały tę samą ocenę i bot brał X=0. Fix:
// rozwiązanie `'X'` do wybranego cmd.xValue PRZED wyceną efektów (damage same
// policzy lethal, twarz jak M236/4). Reguła po deskryptorze X (ADR 0002),
// wyłącznie widok (ADR 0017).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const d = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: d.kind, power: d.power, toughness: d.toughness, manaCost: d.manaCost, spell: d.spell,
    abilities: d.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: d.colors ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function csState(mana, foeLife, enemyCreature) {
  const state = createGameState({ seed: 237, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', mana, { colors: ['B'] });
  state.players.find((p) => p.id === 'p1').life = foeLife;
  put(state, 'cs', 'consume-spirit', 'p2', 'hand');
  if (enemyCreature) put(state, 'foe', enemyCreature, 'p1', 'battlefield');
  return state;
}

test('M237/1: bot NIE rzuca Consume Spirit za X=0 (zero obrażeń/życia)', () => {
  const c = createHeuristicBot({ seed: 237 }).chooseCommand(playerView(csState(6, 20, 'cogwork-assembler'), 'p2'), {});
  if (c.type === 'cast_spell' && c.objectId === 'cs') {
    assert.ok((c.xValue ?? 0) > 0, `Consume Spirit rzucony za X=${c.xValue} — X-cost musi mieć sensowny X`);
  }
});

test('M237/1: bot dobiera X DOBIJAJĄCE stwora (X-drain jako removal)', () => {
  // enemy 2/3, mana 6 (X do 4) — X=3 zabija
  const c = createHeuristicBot({ seed: 237 }).chooseCommand(playerView(csState(6, 20, 'cogwork-assembler'), 'p2'), {});
  assert.ok(c.type === 'cast_spell' && c.objectId === 'cs' && (c.targets ?? [])[0] === 'foe',
    `Consume Spirit ma dobić stwora 2/3: ${JSON.stringify(c)}`);
  assert.ok((c.xValue ?? 0) >= 3, `X ma być dobijające (≥3), było ${c.xValue}`);
});

test('M237/1: bot NIE pali X-drain za trywialny chip w twarz (X mały vs 20 ż.)', () => {
  const c = createHeuristicBot({ seed: 237 }).chooseCommand(playerView(csState(3, 20), 'p2'), {});
  assert.notEqual(c.type === 'cast_spell' && c.objectId === 'cs' ? 'cast' : 'inne', 'cast',
    `X-drain chip (X=1 vs 20 ż.) — trzymaj: ${JSON.stringify(c)}`);
});

test('M237/1: bot rzuca X-drain w twarz przy ISTOTNYM ciosie (X≥1/3 życia)', () => {
  // mana 6 → X do 4; foe 9 → 1/3 = 3, X=4 ≥ 3 istotny
  const c = createHeuristicBot({ seed: 237 }).chooseCommand(playerView(csState(6, 9), 'p2'), {});
  assert.ok(c.type === 'cast_spell' && c.objectId === 'cs' && (c.targets ?? [])[0] === 'p1',
    `X-drain istotny w twarz (X=4 vs 9 ż.): ${JSON.stringify(c)}`);
});
