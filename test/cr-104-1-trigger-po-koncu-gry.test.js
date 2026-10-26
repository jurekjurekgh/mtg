// Etap 4 — polowanie na niezgodność z CR, INNĄ ścieżką niż poprzednia sesja
// (tam: LKI/zakryte, CR 708.9 i 603.10); tutaj: kolejność triggerów a
// state-based actions i koniec gry (CR 510 / 704 / 104).
//
// Cytaty zweryfikowane dosłownie w `.arena/cr-raw.txt` (wydanie „effective as
// of September 25, 2026", SHA-256 8d860e451f20f38865b725b42d82feb714c725373
// dd8f3b32b8652b3eeb070ca — zgodny z pinem w test/helpers/cr-numery-tabela.js):
//
//   510.2  „Second, all combat damage that's been assigned is dealt
//           simultaneously. This turn-based action doesn't use the stack."
//   510.3a „Any abilities that triggered on damage being dealt or while
//           state-based actions are performed afterward are put onto the
//           stack before the active player gets priority; the order in which
//           they triggered doesn't matter."
//   704.5a „If a player has 0 or less life, that player loses the game."
//   104.1  „A game ends immediately when a player wins, when the game is a
//           draw, or when the game is restarted."
//
// OBJAW (transkrypt Żywiego Testera tt-4, seed 7004): śmiertelne obrażenia
// bojowe → w logu „Przegrywasz (brak życia)", a STOS finalny nadal nieść
// „Zdolność: Relic Robber (obrażenia bojowe graczowi)" — trigger trafiał na
// stos PO zakończeniu gry ( Visibility user-facing na ekranie porażki).
// Sonda headless: `.arena/probe-cr510-loss.mjs` (scenariusz A = śmiertelny,
// B = kontrolny nieśmiertelny — B chroni przed fałszywie „czystym" wynikiem).
//
// Wniosek po naprawie: po `player_lost` gra kończy się natychmiast (104.1) —
// ani umieszczenie triggera na stosie, ani dalsza zmiana kroku nie następują;
// nieśmiertelne trafienie nadal DOSTAJE trigger na stosie (510.3a).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();

function addCard(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `brak karty ${cardId}`);
  const data = gameObjectDataOf(def);
  return addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...data, types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  });
}

/** Relic Robber atakuje bez bloków; `defenderLife` = życia obrońcy przed trafieniem. */
function hitUnblocked(defenderLife) {
  const state = createGameState({ seed: 510, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const rr = addCard(state, 'rr', 'relic-robber', 'p1');
  state.objects.set('rr', Object.freeze({ ...rr, summoningSickness: false }));
  state.players.find((p) => p.id === 'p2').life = defenderLife;

  const da = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['rr'] });
  assert.ok(da.ok, da.events?.[0]?.reason);
  execute(state, { type: 'pass_priority', playerId: 'p1' }); // okno po deklaracji
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const noBlocks = playerView(state, 'p2').legalCommands.find((c) => c.type === 'declare_blockers');
  assert.ok(noBlocks, 'setup: oferta deklaracji bloków');
  execute(state, noBlocks);
  execute(state, { type: 'pass_priority', playerId: 'p2' }); // okno obrońcy po blokach
  const r = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.ok(r.ok, r.events?.[0]?.reason);
  return state;
}

test('CR 104.1: po player_lost trigger z obrażeń bojowych NIE trafia na stos', () => {
  const state = hitUnblocked(1); // 2 obrażenia przy 1 życiu → 704.5a: ofiara przegrywa
  const life = state.players.find((p) => p.id === 'p2').life;
  assert.ok(life <= 0, `setup: życie ofiary ${life} ≤ 0`);
  assert.equal(state.status, 'finished', 'SBA kończy grę (704.5a)');
  assert.equal(state.winnerId, 'p1', 'zwycięzca wyznaczony');

  assert.equal(state.zones.stack.length, 0,
    `gra skończona (104.1), a stos nie jest pusty: ${JSON.stringify(state.zones.stack)}`);

  const lossIdx = state.events.findIndex((e) => e.type === 'player_lost');
  assert.ok(lossIdx >= 0, 'zdarzenie player_lost obecne');
  const after = state.events.slice(lossIdx + 1);
  assert.deepEqual(after.map((e) => e.type).filter((t) => t === 'ability_triggered'), [],
    `po player_lost nie może być ability_triggered (104.1 „ends immediately"): ${JSON.stringify(after.map((e) => e.type))}`);
  assert.deepEqual(after.map((e) => e.type).filter((t) => t === 'step_advanced'), [],
    `po player_lost nie może być zmiany kroku (104.1): ${JSON.stringify(after.map((e) => e.type))}`);
});

test('kontrola CR 510.3a: NIEśmiertelne trafienie DOSTAJE trigger na stosie', () => {
  const state = hitUnblocked(20); // 2 obrażenia przy 20 → gra trwa
  assert.equal(state.status, 'active', 'gra trwa dalej');
  assert.equal(state.winnerId, null);
  assert.equal(state.zones.stack.length, 1,
    '510.3a: trigger z obrażeń leży na stosie przed priorytetem');
  const entry = state.objects.get(state.zones.stack[0]);
  assert.ok(entry, 'wpis stosu istnieje');
  assert.equal(entry.cardId, 'relic-robber', 'to zdolność Relic Robber');
  assert.equal(state.turn.step, 'end_of_combat', 'krok poszedł dalej (gra aktywna)');
});
