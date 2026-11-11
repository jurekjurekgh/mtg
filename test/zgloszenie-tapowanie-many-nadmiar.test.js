// Zgłoszenie właściciela 2026-11-11 (log partii, deck `decks/zendikar-wu.txt`):
//
//   „Niepotrzebnie tapuje manę niebieską, której potem mu brakuje na inny czar,
//    więc musi tapnąć stwora i holdout settlement i przez to nie może zaatakować
//    mnie Makindi Aeronaut mimo, że nie mam nikogo do blokowania. (...) Wystarczyło
//    rzucając pierwszy niebieski czar użyć many białej, a nie niebieskiej, skoro
//    wiedział, że kolejny czar będzie tej many potrzebował."
//
// Źródło problemu: auto-tap `spendMana` (src/engine/resources.js) sortował
// źródła fazy SUMY tak, że kolor wymagań wygrywał z kolorem NADMIAROWYM.
// Przy ręce {1}{U} + {1}{U} + {1}{W} rzut pierwszego czaru tapował dwie
// wyspy i zostawiał Plains nietknięty — potem brakowało niebieskiej many.
//
// Pomiar PRZED fixem (`.arena/probe-mana-sekwencja.mjs`):
//   ior:   tapnięte isl1, isl2   → wyspy wolne 1, plains wolne 1
//   jwari: NIEDOSTĘPNY (brak {U})
// Pomiar PO: plains tapowany pierwszy, wyspy wolne 2.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { game, put, playerView, execute } from './helpers/pmssb58.js';

/** Stan z logu: 3 wyspy, Plains, Holdout Settlement, Coralhelm Guide na stole. */
function scenariusz({ reka = ['ior', 'jwari', 'mak'], stol = null } = {}) {
  const s = game({ step: 'main1', active: 'p2' });
  for (const [id, cid] of [['isl1', 'basic-island'], ['isl2', 'basic-island'], ['isl3', 'basic-island'], ['pl1', 'basic-plains']]) {
    put(s, id, cid, 'p2', 'battlefield');
  }
  put(s, 'hs', 'holdout-settlement', 'p2', 'battlefield');
  put(s, 'coral', 'coralhelm-guide', 'p2', 'battlefield');
  const karty = { ior: 'ior-ruin-expedition', jwari: 'jwari-shapeshifter', mak: 'makindi-aeronaut' };
  for (const id of reka) put(s, id, karty[id], 'p2', 'hand');
  const p = s.players.find((x) => x.id === 'p2');
  p.mana = 0;
  p.manaPool = {};
  if (stol) for (const [id, cid] of stol) put(s, id, cid, 'p2', 'battlefield');
  return s;
}

/**
 * Rozstrzyga stos i oddaje priorytet botowi. Wołane po rzucie: priorytet
 * wędruje p2 → p1 → p2, więc sama obecność oferty u p2 NIE znaczy, że wolno
 * mu działać (`not_priority`). Warunkiem wyjścia jest `priorityPlayerId`.
 */
function rozstrzygnij(s) {
  for (let i = 0; i < 12; i += 1) {
    // Warunek: priorytet u bota ORAZ stos pusty (sam powrót priorytetu nie
    // znaczy, że czar się rozstrzygnął — trzeba jeszcze spasować obie strony).
    // Stos to `s.zones.stack` (NIE `s.stack` — to pole nie istnieje, a `?? []`
    // dawało zawsze „pusty" i pętla kończyła się przed rozstrzygnięciem).
    const stosPusty = (s.zones.stack ?? []).length === 0;
    if (s.turn.priorityPlayerId === 'p2' && stosPusty) return;
    const pid = s.turn.priorityPlayerId;
    const pass = playerView(s, pid).legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) return;
    execute(s, pass);
  }
}

const wolne = (s, cardId) => [...s.objects.values()]
  .filter((o) => o.controllerId === 'p2' && o.zone === 'battlefield' && o.cardId === cardId && !o.tapped).length;

test('M/1: rzut {1}{U} tapuje Plains, a wyspy zostawia na drugi {1}{U}', () => {
  // Właściciel: „wystarczyło rzucając pierwszy niebieski czar użyć many białej".
  const s = scenariusz();
  const ior = playerView(s, 'p2').legalCommands
    .find((c) => c.type.startsWith('cast_') && c.objectId === 'ior');
  assert.ok(ior, 'Ior Ruin Expedition jest rzucalny');
  assert.ok(execute(s, ior).ok, 'rzut się udaje');
  rozstrzygnij(s);
  assert.equal(wolne(s, 'basic-plains'), 0,
    `Plains pokrywa generic — powinien być tapnięty pierwszy (stan: ${JSON.stringify(
      [...s.objects.values()].filter((o) => o.kind === 'land' && o.controllerId === 'p2')
        .map((o) => `${o.cardId}:${o.tapped ? 'tap' : 'wolny'}`))})`);
  assert.equal(wolne(s, 'basic-island'), 2,
    'dwie wyspy zostają wolne — jedna płaci {U}, druga jest potrzebna na następny czar');
});

test('M/2: drugi {1}{U} płaci się Z SAMYCH LANDÓW — stwór zostaje do ataku', () => {
  // Sedno zgłoszenia: „musi tapnąć stwora i holdout settlement i przez to nie
  // może zaatakować mnie Makindi Aeronaut". Bez tego pinu wystarczyło sprawdzić
  // „oferta istnieje" — a ona jest też wtedy, gdy płatność sięgnie po stwora.
  const s = scenariusz();
  const pierwszy = playerView(s, 'p2').legalCommands
    .find((c) => c.type.startsWith('cast_') && c.objectId === 'ior');
  execute(s, pierwszy);
  rozstrzygnij(s);
  const drugi = playerView(s, 'p2').legalCommands
    .find((c) => c.type.startsWith('cast_') && c.objectId === 'jwari');
  assert.ok(drugi, `drugi {1}{U} musi być rzucalny: ${JSON.stringify(
    playerView(s, 'p2').legalCommands.map((c) => `${c.type}:${c.objectId ?? ''}`))}`);
  assert.ok(execute(s, drugi).ok, 'rzut drugiego czaru się udaje');
  // Stwory NIE zostały tapowane na manę — mogą atakować.
  const stwor = [...s.objects.values()].find((o) => o.cardId === 'coralhelm-guide' && o.zone === 'battlefield');
  assert.equal(stwor?.tapped, false,
    'Coralhelm Guide nietknięty — bez tego bot „musi tapnąć stwora" i traci atak');
  // Holdout Settlement MOŻE być tapowany — po drugim rzucie nie ma już czarów
  // {U} w ręce (został tylko Makindi {1}{W}), więc to nie jest strata. Sedno
  // zgłoszenia to STWÓR: „musi tapnąć stwora (...) i przez to nie może
  // zaatakować mnie Makindi Aeronaut". Tapowanie landu nic nie kosztuje.
  const drugiWolnyStwor = [...s.objects.values()]
    .filter((o) => o.controllerId === 'p2' && o.kind === 'creature' && o.zone === 'battlefield' && !o.tapped);
  assert.ok(drugiWolnyStwor.length >= 1, 'co najmniej jeden stwór zostaje nietknięty do ataku');
});

test('M/3: anti-over-fix — kolor wymagań nadal pierwszy, gdy nadmiaru brak', () => {
  // Ręka bez przyszłych czarów: nie ma planu, więc nie ma nadmiaru. Płatność
  // musi nadal pokryć pip {U} wyspą (nie wolno tapować Plains na pip).
  const s = scenariusz({ reka: ['ior'] });
  const ior = playerView(s, 'p2').legalCommands
    .find((c) => c.type.startsWith('cast_') && c.objectId === 'ior');
  assert.ok(execute(s, ior).ok, 'rzut się udaje');
  rozstrzygnij(s);
  // Dokładnie 2 źródła tapnięte (koszt {1}{U}) i wśród nich wyspa (pip).
  const tapniete = [...s.objects.values()]
    .filter((o) => o.controllerId === 'p2' && o.kind === 'land' && o.tapped);
  assert.equal(tapniete.length, 2, `koszt {1}{U} = 2 jednostki: ${JSON.stringify(tapniete.map((o) => o.cardId))}`);
  assert.ok(tapniete.some((o) => o.cardId === 'basic-island'), 'pip {U} musi zapłacić wyspa');
});

test('M/4: anti-over-fix — bez przyszłych czarów w tym kolorze nie ma nadmiaru', () => {
  // Dwie wyspy + Plains, ręka tylko {1}{U}: podaż {U} = 2, popyt = 0 po
  // wykluczeniu płaconego czaru... ale wyspa JEST potrzebna na pip, więc
  // nie wolno jej uznać za nadmiar kosztem Plains tylko dlatego, że jest
  // więcej wysp. Pokrycie pipa zostaje gwarantowane (M/3 wyżej).
  const s = scenariusz({ reka: ['ior'] });
  const ior = playerView(s, 'p2').legalCommands
    .find((c) => c.type.startsWith('cast_') && c.objectId === 'ior');
  assert.ok(ior, 'oferta istnieje');
  assert.ok(execute(s, ior).ok, 'płatność przechodzi bramkę kolorów');
});
