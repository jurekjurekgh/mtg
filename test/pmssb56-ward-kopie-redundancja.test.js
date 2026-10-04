// PMSSB-56 (2026-10-04e) — ward × KOPIE czarów: scoring bota płacił za każdą
// kopię tego samego czaru na ten sam cel, choć efekt się nie kumuluje.
//
// Pomiar (sonda PMSSB-53, `spreading-insurrection` storm=2 na zakrytym
// disguise z ward {2}, 14 Mountain): bot płacił 3× {2} za JEDNO przejęcie
// kontroli — kopie i oryginał celują w ten sam stwór, więc efekt dostarcza
// dokładnie jedna rezolucja, a pozostałe dwie płatności to przepalona mana.
//
// Luka widoku (ADR 0017 — kompletność): wpis stosu nie niósł flagi `copy`
// (CR 707.10), więc wycena nie odróżniała kopii od oryginału. Po naprawie
// widok niesie `copy: true` dla `isSpellCopy`, a wycena wardu odmawia zapłaty
// za kopię, gdy (a) wszystkie jej efekty nie kumulują się na tym samym celu
// i (b) na stosie wisi inna instancja tej samej karty z tym samym zestawem
// celów — efekt dowiezie instancja pozostawiona na stosie (kopia rozwiązuje
// się PRZED oryginałem, więc odmowa nie gubi efektu).
//
// Piny:
//  E1  E2E: 14 Mountain, storm=2, ward {2} → dokładnie JEDNA płatność ward,
//      stwór przejęty (efekt dostarczony — odmowa kopii nie gubi efektu).
//  E2  E2E anty-over-fix/M429: pokrętło `redundantCopyPayPenalty` ×0 = stan
//      sprzed PMSSB-56 (3 płatności).
//  E3  efekt KUMULUJĄCY (damage) → bot dalej płaci za kopię (druga kopia
//      2 obrażeń to realna wartość).
//  E4  kopia BEZ bliźniaka na stosie (efekt potrzebny) → płaci.
//  E5  bliźniak z INNYM zestawem celów → płaci.
//  E6  oryginał (nie kopia) przy kopii na stosie → płaci (gwarancja efektu).
//  E7  efekt NIEZNANY → brak wniosku, płaci (kotwica: nie klasyfikujemy
//      efektów spoza listy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w katalogu`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

/** p1 (bot) ze spreading-insurrection i N Mountainami; p2 z zakrytym disguise. */
function scena({ mountains = 14, counter = 2, wardAmount = 2 } = {}) {
  const state = createGameState({ seed: 77, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  for (let i = 0; i < mountains; i += 1) put(state, `mt${i}`, 'basic-mountain', 'p1', 'battlefield');
  put(state, 'storm', 'spreading-insurrection', 'p1', 'hand');
  const disguise = put(state, 'W', 'riftburst-hellion', 'p2', 'battlefield');
  state.objects.set('W', Object.freeze({
    ...disguise, faceDown: true, faceDownCause: 'disguise', cardName: null,
    types: ['Creature'], subtypes: [], colors: [], power: 2, toughness: 2,
    manaCost: 0, keywords: ['ward'], ward: wardAmount, summoningSickness: false,
  }));
  state.spellsCastThisTurn = counter;
  return state;
}

/** Pętla: p1 gra botem, p2 pasuje; zwraca sekwencję płatności ward i stan. */
function rozegraj(state, params = {}) {
  const bot = createHeuristicBot({ seed: 3, params });
  const platnosci = [];
  for (let i = 0; i < 80; i += 1) {
    const p = state.turn.priorityPlayerId;
    const view = playerView(state, p);
    const cmd = p === 'p1' ? bot.chooseCommand(view, {}) : { type: 'pass_priority', playerId: p };
    if (cmd.type === 'resolve_ward_pay_choice') platnosci.push(cmd.pay);
    const r = execute(state, cmd);
    assert.notEqual(r?.ok, false, `komenda odrzucona: ${cmd.type} (${r?.reason})`);
    if (i > 4 && state.zones.stack.length === 0 && !state.pendingWardPay && !state.pendingCopyTargets) break;
  }
  return { platnosci, state };
}

test('E1 (E2E): storm=2 na wardzie — dokładnie jedna płatność, efekt dostarczony', () => {
  const state = scena();
  const { platnosci } = rozegraj(state);
  const kopie = state.events.filter((e) => e.type === 'spell_copied').length;
  assert.equal(kopie, 2, 'storm=2 tworzy dwie kopie');
  assert.equal(platnosci.length, 3, 'ward pyta o oryginał i obie kopie (CR 702.21a)');
  assert.equal(platnosci.filter((p) => p === true).length, 1,
    'tylko JEDNA płatność — kopie nie kumulują efektu na tym samym celu');
  assert.equal(state.objects.get('W')?.controllerId, 'p1',
    'efekt dostarczony (przejęcie kontroli) — odmowa kopii nie gubi efektu');
});

test('E2 (E2E, M429): pokrętło ×0 przywraca stan sprzed PMSSB-56 (3 płatności)', () => {
  const { platnosci } = rozegraj(scena(), { redundantCopyPayPenalty: 0 });
  assert.equal(platnosci.filter((p) => p === true).length, 3,
    'z karą 0 bot płaci za każdą kopię — dawna zachowanie jako anty-over-fix');
});

/** Ta sama klasa po stronie zapłaty KONTRUJĄCEJ: p1 rzuca stormem (bez warda),
 *  a p2 celuje Frightful Delusion w jedną z KOPII („zapłać {1}, a czar
 *  zostanie"). Ratowanie kopii, która nie kumuluje efektu, to przepalona mana
 *  dokładnie tak samo jak w wardzie. */
function scenaKontry({ mountains = 14, islands = 3, counter = 2 } = {}) {
  const state = createGameState({ seed: 78, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  for (let i = 0; i < mountains; i += 1) put(state, `mt${i}`, 'basic-mountain', 'p1', 'battlefield');
  for (let i = 0; i < islands; i += 1) put(state, `is${i}`, 'basic-island', 'p2', 'battlefield');
  put(state, 'storm', 'spreading-insurrection', 'p1', 'hand');
  put(state, 'cela', 'goblin-piker', 'p2', 'battlefield');
  put(state, 'fd', 'frightful-delusion', 'p2', 'hand');
  state.spellsCastThisTurn = counter;
  return state;
}

function rozegrajKontre(state, params = {}) {
  const bot = createHeuristicBot({ seed: 3, params });
  const platnosci = [];
  let fdPodane = false;
  for (let i = 0; i < 140; i += 1) {
    const p = state.turn.priorityPlayerId;
    const view = playerView(state, p);
    let cmd;
    if (p === 'p1') {
      cmd = bot.chooseCommand(view, {});
      if (cmd.type === 'resolve_counter_pay_choice') platnosci.push(cmd.pay);
    } else {
      const kopie = state.zones.stack.filter((id) => state.objects.get(id)?.isSpellCopy);
      if (!fdPodane && kopie.length >= 1 && state.zones.stack.length >= 3 && !state.pendingCopyTargets) {
        fdPodane = true;
        cmd = { type: 'cast_spell', playerId: 'p2', cardId: 'frightful-delusion', objectId: 'fd', targets: [kopie[0]] };
      } else cmd = { type: 'pass_priority', playerId: 'p2' };
    }
    const r = execute(state, cmd);
    assert.notEqual(r?.ok, false, `komenda odrzucona: ${cmd.type} (${r?.reason})`);
    if (i > 4 && state.zones.stack.length === 0 && !state.pendingCounterPay && !state.pendingWardPay && !state.pendingCopyTargets) break;
  }
  return { platnosci, state };
}

test('E9 (E2E): zapłata kontrująca za REDUNDANTNĄ kopię — bot odmawia, efekt dostarczony', () => {
  const state = scenaKontry();
  const { platnosci } = rozegrajKontre(state);
  assert.equal(state.events.filter((e) => e.type === 'spell_copied').length, 2, 'storm=2 tworzy dwie kopie');
  assert.deepEqual(platnosci, [false],
    'ratowanie kopii bez nowej wartości to przepalona mana (CR 608.2g; bliźniak wardu)');
  assert.equal(state.objects.get('cela')?.controllerId, 'p1',
    'efekt dostarczony przez instancję pozostawioną na stosie');
});

// ── Piny jednostkowe: sama decyzja, spreparowany widok stosu ────────────────
const KOPIA_KONTROLI = { type: 'gain_control_until_end_of_turn' };
const KOPIA_OBRAZEN = { type: 'damage', amount: 2 };
const KOPIA_NIEZNANA = { type: 'wymyslony_efekt' };

function widokStosu(stack, targetId, typ = 'resolve_ward_pay_choice') {
  return {
    playerId: 'p1',
    turn: { number: 1, step: 'main' },
    players: [{ id: 'p1', life: 20 }, { id: 'p2', life: 20 }],
    zones: { hand: [], battlefield: [], library: [], graveyard: [], exile: [], stack },
    legalCommands: [
      { type: typ, playerId: 'p1', pay: true, cost: 2, sourceId: 'zrodlo', targetId },
      { type: typ, playerId: 'p1', pay: false, cost: 2, sourceId: 'zrodlo', targetId },
    ],
  };
}

const wpis = ({ id, cardId = 'spreading-insurrection', copy = false, targets, effects }) => ({
  id, cardId, controllerId: 'p1', zone: 'stack', kind: 'spell', copy,
  targets, spell: { effects },
});

function decyzja(stack, targetId, params = {}, typ = 'resolve_ward_pay_choice') {
  const bot = createHeuristicBot({ seed: 5, params });
  return bot.chooseCommand(widokStosu(stack, targetId, typ), {}).pay;
}

const KONTRA = 'resolve_counter_pay_choice';

test('E3 (anti-over-fix): efekt KUMULUJĄCY się — bot płaci za kopię', () => {
  const stack = [
    wpis({ id: 'spell-copy-1', copy: true, targets: ['W'], effects: [KOPIA_OBRAZEN] }),
    wpis({ id: 'spell-1', targets: ['W'], effects: [KOPIA_OBRAZEN] }),
  ];
  assert.equal(decyzja(stack, 'spell-copy-1'), true,
    'druga kopia 2 obrażeń realnie dodaje wartość — płatność zostaje');
});

test('E4: kopia BEZ bliźniaka (efekt potrzebny) — bot płaci', () => {
  const stack = [wpis({ id: 'spell-copy-1', copy: true, targets: ['W'], effects: [KOPIA_KONTROLI] })];
  assert.equal(decyzja(stack, 'spell-copy-1'), true);
});

test('E5: bliźniak z INNYM zestawem celów — bot płaci', () => {
  const stack = [
    wpis({ id: 'spell-copy-1', copy: true, targets: ['W'], effects: [KOPIA_KONTROLI] }),
    wpis({ id: 'spell-1', targets: ['X'], effects: [KOPIA_KONTROLI] }),
  ];
  assert.equal(decyzja(stack, 'spell-copy-1'), true);
});

test('E6: oryginał przy kopii na stosie — bot płaci (gwarancja efektu)', () => {
  const stack = [
    wpis({ id: 'spell-1', targets: ['W'], effects: [KOPIA_KONTROLI] }),
    wpis({ id: 'spell-copy-1', copy: true, targets: ['W'], effects: [KOPIA_KONTROLI] }),
  ];
  assert.equal(decyzja(stack, 'spell-1'), true,
    'karzemy WYŁĄCZNIE kopie — inaczej oba wpisy odmawiałyby sobie nawzajem');
});

test('E7: efekt NIEZNANY — brak wniosku, bot płaci', () => {
  const stack = [
    wpis({ id: 'spell-copy-1', copy: true, targets: ['W'], effects: [KOPIA_NIEZNANA] }),
    wpis({ id: 'spell-1', targets: ['W'], effects: [KOPIA_NIEZNANA] }),
  ];
  assert.equal(decyzja(stack, 'spell-copy-1'), true,
    'efektu spoza listy nie klasyfikujemy (kotwica anty-over-fix)');
});

test('E8: GREEN na wprost — kopii nie-kumulującej z bliźniakiem bot odmawia', () => {
  const stack = [
    wpis({ id: 'spell-copy-1', copy: true, targets: ['W'], effects: [KOPIA_KONTROLI] }),
    wpis({ id: 'spell-1', targets: ['W'], effects: [KOPIA_KONTROLI] }),
  ];
  assert.equal(decyzja(stack, 'spell-copy-1'), false);
});

test('E10 (kontra): efekt KUMULUJĄCY — bot płaci, by uratować kopię', () => {
  const stack = [
    wpis({ id: 'spell-copy-1', copy: true, targets: ['W'], effects: [KOPIA_OBRAZEN] }),
    wpis({ id: 'spell-1', targets: ['W'], effects: [KOPIA_OBRAZEN] }),
  ];
  assert.equal(decyzja(stack, 'spell-copy-1', {}, KONTRA), true);
});

test('E11 (kontra): kopia BEZ bliźniaka — bot płaci', () => {
  const stack = [wpis({ id: 'spell-copy-1', copy: true, targets: ['W'], effects: [KOPIA_KONTROLI] })];
  assert.equal(decyzja(stack, 'spell-copy-1', {}, KONTRA), true);
});

test('E12 (kontra): bliźniak + efekt nie-kumulujący — bot odmawia', () => {
  const stack = [
    wpis({ id: 'spell-copy-1', copy: true, targets: ['W'], effects: [KOPIA_KONTROLI] }),
    wpis({ id: 'spell-1', targets: ['W'], effects: [KOPIA_KONTROLI] }),
  ];
  assert.equal(decyzja(stack, 'spell-copy-1', {}, KONTRA), false);
});
