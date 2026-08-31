import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { setupCardMatch } from '../src/cards/materialize.js';
import { playerView, execute } from '../src/engine/game-state.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { jumpToStep } from '../src/engine/turn.js';

/**
 * M258 (Żywy Tester, sesja PR #89): znalezisko „pięciu deskryptorów"
 * klasy L21/M146 — installDeck (src/engine/deck.js) kładzie na obiekcie
 * biblioteki JAWNĄ listę pól z wpisu talii, a `gameObjectDataOf`
 * (materialize.js) kładzie ich więcej. Pięć pól ginęło po cichu
 * w PRAWDZIWYCH partiach (setupCardMatch → installDeck), podczas gdy
 * testy jednostkowe (putCard + `...gameObjectDataOf(def)`) były zielone:
 *
 *   echo    → Bone Shredder (mirrodin-brg): brak echoUnpaid → brak pytania
 *             o płatność echo w upkeep (CR 702.29),
 *   madness → Revolutionist, Terminal Agony (warhammer-brg): odrzucenie
 *             nie oferowało rzutu za koszt madness (CR 702.34),
 *   surge   → Jwar Isle Avenger (zendikar): brak oferty rzutu za {2}{U}
 *             po innym czarze w turze (CR 702.111),
 *   toxic   → Crawling Chorus (mirrodin-wu): combat damage graczowi NIE dawał
 *             poison counterów (CR 702.180a; zaobserwowane na żywym stole:
 *             3 ataki Chorus bez trucizny, licznik ruszył dopiero od tokenu
 *             Mite, który niesie toxic jawnie w efekcie create_token),
 *   warp    → Weftblade Enhancer (worek-legend): brak alternatywnego kosztu.
 *
 * Testy idą przez PRAWDZIWĄ ścieżkę materializacji (setupCardMatch z talią
 * realnych kart — L1/L7), nie przez helpery omijające installDeck.
 */

const REGISTRY = createCardRegistry();

function matchWithCards() {
  const cardIds = ['bone-shredder', 'revolutionist', 'terminal-agony',
    'jwar-isle-avenger', 'weftblade-enhancer', 'crawling-chorus',
    'basic-plains', 'basic-plains', 'basic-plains', 'basic-plains'];
  return setupCardMatch({
    seed: 13,
    players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([['p1', cardIds], ['p2', cardIds]]),
    registry: REGISTRY,
  });
}

test('M258/D1: deskryptory echo/madness/surge/toxic/warp docierają do obiektów z TALII (ścieżka realna)', () => {
  const state = matchWithCards();
  state.pendingMulligans = [];
  const byCard = new Map();
  for (const [id, o] of state.objects) {
    if (!byCard.has(o.cardId) && o.controllerId === 'p1') byCard.set(o.cardId, o);
  }
  assert.equal(byCard.get('bone-shredder').echo?.cost != null || byCard.get('bone-shredder').echo != null, true,
    'Bone Shredder niesie echo z definicji');
  assert.ok(byCard.get('revolutionist').madness, 'Revolutionist niesie madness');
  assert.ok(byCard.get('terminal-agony').madness, 'Terminal Agony niesie madness');
  assert.ok(byCard.get('jwar-isle-avenger').surge, 'Jwar Isle Avenger niesie surge');
  assert.ok(byCard.get('weftblade-enhancer').warp, 'Weftblade Enhancer niesie warp');
  assert.equal(byCard.get('crawling-chorus').toxic, 1, 'Crawling Chorus niesie toxic 1');
});

test('M258/D2: toxic z talii działa — atak Crawling Chorus daje obrońcy poison (symptom z żywego stołu)', () => {
  const state = matchWithCards();
  state.pendingMulligans = [];
  let chorusId = null;
  for (const [id, o] of state.objects) {
    if (o.cardId === 'crawling-chorus' && o.controllerId === 'p1' && o.zone === 'library') chorusId = id;
  }
  assert.ok(chorusId, 'Crawling Chorus w bibliotece p1');
  const bfId = moveObjectDirectly(state, chorusId, 'battlefield', `bf-chorus`).id;
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: [bfId] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p2' }); // okno obrońcy (CR 509.4)
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok);
  const p2 = state.players.find((p) => p.id === 'p2');
  assert.equal(p2.life, 19, 'życie spada normalnie (toxic ≠ infect)');
  assert.equal(p2.poison, 1, 'toxic 1 z ObiektU Z TALII → 1 poison counter (CR 702.180a)');
});

test('M258/D3: echo z talii działa — Bone Shredder wchodzi z echoUnpaid (CR 702.29)', () => {
  const state = matchWithCards();
  state.pendingMulligans = [];
  let boneId = null;
  for (const [id, o] of state.objects) {
    if (o.cardId === 'bone-shredder' && o.controllerId === 'p1' && o.zone === 'library') boneId = id;
  }
  assert.ok(boneId, 'Bone Shredder w bibliotece p1');
  const bfId = moveObjectDirectly(state, boneId, 'battlefield', 'bf-bone').id;
  assert.equal(state.objects.get(bfId).echoUnpaid, true,
    'stwór z echo wchodzi z echoUnpaid — upkeep zażąda płatności ofiary/kosztu');
});
