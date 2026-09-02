// Uwaga C (2026-09-02, uwagi właściciela z żywej gry): bot nie może płacić za
// przeniesienie sprzętu, który na nowym nosicielu nic nie robi.
//
// Zgłoszenie:
//   „Karta Thieves' Tools. Bot w jednej turze przełożył tę kartę dwukrotnie —
//    raz wyposażył jednego swojego stwora, a zaraz po chwili drugiego. To bez
//    sensu: po co wydawał manę na wyposażenie pierwszego, skoro zaraz chciał
//    go przełożyć na drugiego? To trzeba ukrócić."
//   Log (wsteczna chronologia): „Thieves' Tools wyposaża Marut ← aktywuje
//   Equip → cel: Marut ← wyposaża Silvanus's Invoker ← aktywuje Equip → cel:
//   Silvanus's Invoker".
//
// Rozpoznanie (repro na tej samej parze kart, przed naprawą):
//   sprzęt na moim 2/1 → oferta `activate_ability(tools#0->marut)` = **+11,00**
//   i była wybierana. Gałąź przeniesienia liczyła wyłącznie
//   `delta = power(cel) − power(nosiciel)`, a Thieves' Tools NIE mają pompy —
//   całą ich wartością jest warunkowa ewazja `cantBeBlockedMaxPower: 3`, czyli
//   na Marucie (7/7) martwa. Płaci {2} za nic → potem płaci {2} za powrót.
//   Wycena M244 (D/G/F) już to umiała rozpoznać, ale była wgałęziona tylko przy
//   PIERWSZYM założeniu sprzętu (L28: jedna zasada, jedno miejsce).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createGameState, execute, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `brak karty ${cardId} w katalogu`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def),
    types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [],
    abilities: def.abilities ?? [], equipment: def.equipment,
    power: def.power, toughness: def.toughness,
  });
}

/**
 * Stan: w grze są Marut (7/7), Silvanus's Invoker (3/2), Highland Game (2/1) i
 * sprzęt `equipmentId` przypięty do `attachedTo`. Bot ma dużo many, żeby equip
 * był legalny — badamy WYBÓR, a nie dostępnosc kosztu.
 */
function stół({ equipmentId = 'tools', cardId = 'thieves-tools', attachedTo = null, hand = [] } = {}) {
  const state = createGameState({ seed: 77, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 20, { W: 4, U: 4, B: 4, R: 4, G: 4 });
  addMana(state, 'p2', 2);
  put(state, equipmentId, cardId, 'p1');
  put(state, 'marut', 'marut', 'p1');
  put(state, 'invoker', 'silvanuss-invoker', 'p1');
  put(state, 'porter', 'highland-game', 'p1');
  for (const [id, idKarty] of hand) put(state, id, idKarty, 'p1', 'hand');
  if (attachedTo) {
    state.objects.set(equipmentId, Object.freeze({ ...state.objects.get(equipmentId), attachedTo }));
  }
  return state;
}

/** Wszystkie oferty equip tego sprzętu, z wyceną bota. */
function ocenyEquipu(state, equipmentId) {
  const bot = createHeuristicBot({ seed: 1 });
  bot.chooseCommand(playerView(state, 'p1'), {});
  const opcje = bot.trace()[0].options;
  return {
    bot,
    equip: opcje.filter((o) => o.cmd.startsWith(`activate_ability(${equipmentId}`)),
    wszystkie: opcje,
  };
}

function ocenaDla(oceny, cel) {
  const o = oceny.equip.find((entry) => entry.cmd.includes(`->${cel}`));
  assert.ok(o, `oczekiwano oferty equip na ${cel}, jest: ${oceny.equip.map((e) => e.cmd).join(', ')}`);
  return o.score;
}

test('C: przeniesienie sprzętu na nosiciela, któremu nic nie daje, schodzi poniżej passu', () => {
  // Sprzęt żyje na Invokerze (3/2 ≤ próg 3), Marut (7/7) to martwy efekt.
  const oceny = ocenyEquipu(stół({ attachedTo: 'invoker' }), 'tools');
  const naMaruta = ocenaDla(oceny, 'marut');
  assert.ok(naMaruta < 0, `przepięcie za nic: score=${naMaruta.toFixed(2)} (przed naprawą +11,00)`);
  assert.ok(!oceny.equip.some((o) => o.cmd.includes('->marut') && o.score >= 0),
    'żadna oferta przeniesienia na martwego nosiciela nie jest dodatnia');
});

test('C: w tej samej pozycji bot NIE wybiera drugiego equipu w turze', () => {
  // Dokładnie sekwencja ze zgłoszenia: sprzęt na Invokerze, pokusa Maruta.
  const state = stół({ attachedTo: 'invoker' });
  const bot = createHeuristicBot({ seed: 1 });
  const pick = bot.chooseCommand(playerView(state, 'p1'), {});
  assert.notEqual(pick.type, 'activate_ability',
    `bot nie płaci za przeniesienie w próżnię (wybrał: ${JSON.stringify(pick)})`);
});

test('C: przeniesienie, które BUDZI efekt sprzętu, jest dozwolone (anty-over-fix)', () => {
  // Odwrotna strona tej samej reguły: sprzęt leży na Marucie (efekt martwy), a
  // nosicielem może być Invoker — na nim warunkowa ewazja żyje, więc ruch jest
  // NAPRAWĄ i nie wolno go zablokować regułą „większy nosiciel".
  const oceny = ocenyEquipu(stół({ attachedTo: 'marut' }), 'tools');
  const naInvokera = ocenaDla(oceny, 'invoker');
  assert.ok(naInvokera > 0, `naprawa błędnego nosiciela musi się opłacać: score=${naInvokera.toFixed(2)}`);
});

test('C: płaska pompa może wędrować za większym ciałem (M100/E13 nietknięte)', () => {
  // Squire's Lightblade: +1/+0 dla każdego — wartość nosiciela liczona ciałem,
  // więc przeniesienie z 2/1 na 6/5 pozostaje sensowne.
  const oceny = ocenyEquipu(stół({ equipmentId: 'blad', cardId: 'squires-lightblade', attachedTo: 'porter' }), 'blad');
  const naKrotiq = oceny.equip.find((o) => o.cmd.includes('->marut'));
  assert.ok(naKrotiq, `oczekiwano oferty na Maruta: ${oceny.equip.map((e) => e.cmd).join(', ')}`);
  assert.ok(naKrotiq.score > 0, `sprzęt z pompą na 7/7 = PREMIA: score=${naKrotiq.score.toFixed(2)}`);
});

test('C: ping-pong sprzętu nie jest nagradzany w żadną stronę', () => {
  // Invoker (żywy efekt) ↔ porter (też żywy, ale mniejsze ciało i delta < 2).
  const naPortera = ocenaDla(ocenyEquipu(stół({ attachedTo: 'invoker' }), 'tools'), 'porter');
  const naInvokera = ocenaDla(ocenyEquipu(stół({ attachedTo: 'porter' }), 'tools'), 'invoker');
  assert.ok(naPortera < 0 && naInvokera < 0,
    `ruch w obie strony kosztuje manę bez zysku: porter=${naPortera.toFixed(2)}, invoker=${naInvokera.toFixed(2)}`);
});

test('C: sekwencja ze zgłoszenia — po zagraniu stworu bot wyposaża RAZ, nie dwa', () => {
  // Sprzęt luzem, w ręce Invoker: bot ma najpierw zagrać stwor, aEquip pójść
  // RAZ. (Przed naprawą: equip na porterze, potem przeniesienie — {4} za jedno.)
  let state = stół({ hand: [['reka-invoker', 'silvanuss-invoker']] });
  const krok1 = createHeuristicBot({ seed: 1 });
  const first = krok1.chooseCommand(playerView(state, 'p1'), {});
  assert.equal(first.type, 'cast_permanent',
    `najpierw gra stwor, nie płaci za equip na tymczasowego nosiciela: ${JSON.stringify(first)}`);
  const r = execute(state, first);
  assert.ok(r.ok !== false, `wykonanie komendy: ${JSON.stringify(r).slice(0, 160)}`);
  const oceny = ocenyEquipu(state, 'tools');
  const equipAdd = oceny.equip.filter((o) => o.score >= 0).map((o) => o.cmd);
  assert.equal(new Set(equipAdd.map((c) => c.split('->')[1])).size <= 1, true,
    `co najwyżej JEDEN nosiciel ma dodatnią wycenę equipu: ${equipAdd.join(', ')}`);
});

test('C: wspólna definicja „sprzęt coś dodaje" jest użyta w OBU gałęziach (L28)', () => {
  const src = fs.readFileSync('src/controllers/heuristic-bot.js', 'utf8');
  const uses = (src.match(/equipValuation\(view, source,/g) ?? []).length;
  assert.ok(uses >= 3,
    `equipValuation ma być wywołany w definicji + gałęzi przeniesienia + gałęzi rzutu (jest ${uses})`);
  const moveBranch = src.slice(src.indexOf('const wornByMine'), src.indexOf('const wornByMine') + 2000);
  assert.match(moveBranch, /payload\.nothingAdded/, 'gałąź przeniesienia pyta o nic-nie-dodaje');
  assert.match(moveBranch, /score -= 12/, 'kara za przeniesienie w próżnię = ta sama co przy rzucie');
});
