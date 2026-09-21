// =============================================================================
// E6 — PULA KANDYDATÓW NA BLOKUJĄCYCH musi być PEŁNA niezależnie od cap-a menu.
//
// Zgłoszenie właściciela 2026-09-20c: „Czemu świadomie nie naprawiane? Błędy
// powinny być natychmiast naprawiane, a nie «świadomie nie naprawiane»".
// Pozycja audytu PR #130 §6 brzmiała: „`legalBlockerOptions` ponad `COMBAT_OPTION_CAP`
// — fallback tnie OPCJE, nie użycia (L151)". Pomiar 2026-09-20c pokazał, że to
// za optymistyczne: opcje SĄ nośnikiem puli kandydatów w UI.
//
// Łańcuch (zmierzony, nie wywnioskowany):
//   1. `legalBlockerOptions` (src/engine/combat.js) przy `(atakujący+1)^blokerzy > cap`
//      wchodzi w fallback i na końcu robi `options.slice(0, cap)`;
//   2. `game-state.js` zamienia każdą ofertę na komendę `declare_blockers`
//      w `legalCommands` → to są `request.options` decyzji;
//   3. `renderCombatWizard` (src/table/choice-request.js) buduje listę blokerów
//      per atakujący z SUMY OFERT (`for (const cmd of options) ... cmd.assignments?.[attackerId]`)
//      — więc para (atakujący, bloker) wycięta przez cap NIE MA WIERSZA w wizardzie;
//   4. wizard BUDUJE komendę z ptaszków (`declare_blockers` z dowolnym
//      przypisaniem), więc brak wiersza = brak możliwości zadeklarowania bloku.
// Wynik: legalny blok (CR 509.1b — broniący wybiera dowolny legalny zestaw)
// był nieosiągalny dla człowieka na większej planszy.
//
// POMIAR 2026-09-20c (sceny bez ewazji, `highland-game` vs `highland-game`,
// „braki" = legalne pary (atakujący, bloker) nieobecne w sumie ofert):
//   2 atakujących × 5 blokerów → 24 oferty, braki 0
//   4 × 4                      → 32 oferty, braki 0
//   6 × 6                      → 32 oferty, braki 5   ← realisticzna plansza
//   6 × 6 (1 z menace)         → 32 oferty, braki 4
//   8 × 8 (2 z menace)         → 32 oferty, braki 33
//   10 × 10                    → 32 oferty, braki 69
//
// Naprawa: rozdzielenie DWÓCH pojęć, które były sklejone (L41):
//   - MENU szybkich przypisań (`legalBlockerOptions`) zostaje ograniczone cap-em
//     — to kwestia rozmiaru listy, nie legalności;
//   - PULA kandydatów (`blockCandidatePool`) jest liczona wprost z reguł, bez
//     enumeracji, więc cap jej nie dotyczy; widok niesie ją jako
//     `blockCandidates`, a wizard rysuje wiersze z puli (suma z ofertami).
// Piny poniżej biorą ground truth z KOMENDY (`execute(declare_blockers)`), nie z
// wewnętrznych predykatów (L48: oferta/pula nie może obiecywać więcej niż
// walidacja, ani mniej).
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { COMBAT_OPTION_CAP, blockCandidatePool, legalBlockerOptions } from '../src/engine/combat.js';

const REGISTRY = createCardRegistry();

function putCreature(state, id, cardId, controllerId, patch = {}) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    types: card.types ?? [], keywords: card.keywords ?? [], subtypes: card.subtypes ?? [],
    cardName: card.name, ...gameObjectDataOf(card),
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...patch }));
  return id;
}

/**
 * Scena walki: `atk` atakujących p1 (pierwsze `menace` to Dire Fleet Ravager),
 * `blk` blokerów p2 (Highland Game), z opcjonalnym tapniętym blokerem.
 */
function combatScene({ atk, blk, menace = 0, tapped = 0, seed = 606 }) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 9;
  state.pendingMulligans = [];
  const attackerIds = [];
  for (let i = 0; i < atk; i += 1) {
    attackerIds.push(putCreature(state, `a${i}`, i < menace ? 'dire-fleet-ravager' : 'highland-game', 'p1'));
  }
  const blockerIds = [];
  for (let i = 0; i < blk; i += 1) {
    blockerIds.push(putCreature(state, `b${i}`, 'highland-game', 'p2', i < tapped ? { tapped: true } : {}));
  }
  const declared = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds });
  assert.ok(declared.ok, `deklaracja ataku: ${declared.reason ?? ''}`);
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p2');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  return { state, attackerIds, blockerIds };
}

/** Ground truth z KOMENDY: czy para (atakujący, bloker) jest osiągalna legalnym blokiem? */
function paraLegalnaKomenda(state, attackerId, blockerId, wszystkieBlokery) {
  const probe = (assignments) => {
    const clone = structuredClone(state);
    const result = execute(clone, { type: 'declare_blockers', playerId: 'p2', assignments });
    return result.ok === true;
  };
  if (probe({ [attackerId]: [blockerId] })) return true;
  // Menace / „can't block alone": samotny bloker jest nielegalny, ale z
  // partnerem już tak — wtedy bloker JEST osiągalnym kandydatem.
  return wszystkieBlokery
    .filter((id) => id !== blockerId)
    .some((partner) => probe({ [attackerId]: [blockerId, partner] }));
}

function prawdaKomend(state, attackerIds, blockerIds) {
  const prawda = {};
  for (const attackerId of attackerIds) {
    prawda[attackerId] = blockerIds.filter((blockerId) => paraLegalnaKomenda(state, attackerId, blockerId, blockerIds));
  }
  return prawda;
}

function sumaOfert(offers, attackerIds) {
  const suma = {};
  for (const attackerId of attackerIds) suma[attackerId] = [];
  for (const offer of offers) {
    for (const [attackerId, blockerIds] of Object.entries(offer)) {
      for (const blockerId of blockerIds) {
        if (!suma[attackerId].includes(blockerId)) suma[attackerId].push(blockerId);
      }
    }
  }
  return suma;
}

test('E6/1: pula kandydatów = prawda z komendy (6×6, plansza ponad cap-em)', () => {
  const { state, attackerIds, blockerIds } = combatScene({ atk: 6, blk: 6 });
  // Scena faktycznie wchodzi w fallback: (6+1)^6 = 117 649 > cap.
  assert.ok((attackerIds.length + 1) ** blockerIds.length > COMBAT_OPTION_CAP, 'scena ma testować gałąź ponad cap-em');

  const prawda = prawdaKomend(state, attackerIds, blockerIds);
  const pula = blockCandidatePool(state, 'p2');
  assert.deepEqual(Object.keys(pula).sort(), [...attackerIds].sort(),
    'pula ma wpis na każdego atakującego (nawet gdy menu nie pokazało dla niego bloku)');
  for (const attackerId of attackerIds) {
    assert.deepEqual([...pula[attackerId]].sort(), [...prawda[attackerId]].sort(),
      `pula blokerów dla ${attackerId} rozjeżdża się z prawdą z komendy `
      + `(pula: ${pula[attackerId].join(',') || '—'}, komenda: ${prawda[attackerId].join(',') || '—'})`);
  }
});

test('E6/2: pula domyka to, co menu ponad cap-em wycięło (pomiar klasy, nie jednej sceny)', () => {
  const sceny = [
    { atk: 2, blk: 5 }, { atk: 4, blk: 4 }, { atk: 6, blk: 6 },
    { atk: 6, blk: 6, menace: 1 }, { atk: 8, blk: 8, menace: 2 }, { atk: 10, blk: 10 },
  ];
  const raport = [];
  for (const scena of sceny) {
    const { state, attackerIds, blockerIds } = combatScene({ ...scena, seed: 606 + scena.atk });
    const offers = legalBlockerOptions(state, 'p2');
    assert.ok(offers.length <= COMBAT_OPTION_CAP, `menu ponad cap: ${offers.length} > ${COMBAT_OPTION_CAP}`);
    const suma = sumaOfert(offers, attackerIds);
    const pula = blockCandidatePool(state, 'p2');
    const prawda = prawdaKomend(state, attackerIds, blockerIds);
    const brakiMenu = [];
    const brakiPuli = [];
    for (const attackerId of attackerIds) {
      for (const blockerId of prawda[attackerId]) {
        if (!suma[attackerId].includes(blockerId)) brakiMenu.push(`${attackerId}/${blockerId}`);
        if (!pula[attackerId].includes(blockerId)) brakiPuli.push(`${attackerId}/${blockerId}`);
      }
      // Pula nie może obiecywać więcej niż komenda przyjmie (L48 w drugą stronę).
      const nadmiarowe = pula[attackerId].filter((blockerId) => !prawda[attackerId].includes(blockerId));
      assert.deepEqual(nadmiarowe, [],
        `${scena.atk}×${scena.blk}: pula obiecuje nieosiągalne bloki dla ${attackerId}: ${nadmiarowe.join(',')}`);
    }
    raport.push({ scena: `${scena.atk}×${scena.blk}${scena.menace ? ` (${scena.menace} menace)` : ''}`, oferty: offers.length, brakiMenu: brakiMenu.length, brakiPuli: brakiPuli.length });
    assert.deepEqual(brakiPuli, [], `pula niepełna w scenie ${scena.atk}×${scena.blk}: ${brakiPuli.slice(0, 6).join(' ')}`);
  }
  // Duże plansze faktycznie tracą pary w menu — dlatego pula nie może z niego wynikać.
  const duza = raport.find((r) => r.scena === '10×10');
  assert.ok(duza.brakiMenu > 0, `menu 10×10 nie wycina żadnych par (${JSON.stringify(raport)}) — pin stracił przedmiot`);
});

test('E6/3: pula pomija blokery, które nie mogą blokować (tapnięte), i jest stabilna', () => {
  const { state, attackerIds, blockerIds } = combatScene({ atk: 3, blk: 4, tapped: 2 });
  const pula = blockCandidatePool(state, 'p2');
  const prawda = prawdaKomend(state, attackerIds, blockerIds);
  for (const attackerId of attackerIds) {
    assert.deepEqual([...pula[attackerId]].sort(), [...prawda[attackerId]].sort(),
      `pula przy tapniętych blokerach: ${pula[attackerId].join(',')} vs komenda ${prawda[attackerId].join(',')}`);
  }
  assert.ok(blockerIds.slice(0, 2).every((id) => attackerIds.every((a) => !pula[a].includes(id))),
    'tapnięty bloker nie jest kandydatem (CR 509.1b — musi być untapped)');
  assert.ok(blockerIds.slice(2).every((id) => attackerIds.every((a) => pula[a].includes(id))),
    'nietapnięci blokerzy są kandydatami pod każdego atakującego bez ewazji');
  // Determinizm (ADR 0005): dwa wywołania dają ten sam wynik, bez mutacji stanu.
  const przed = structuredClone(state);
  assert.deepEqual(blockCandidatePool(state, 'p2'), blockCandidatePool(state, 'p2'), 'pula jest deterministyczna');
  assert.deepEqual(state, przed, 'liczenie puli nie mutuje stanu gry');
});

test('E6/4: widok niesie `blockCandidates` tylko broniącemu w kroku deklaracji bloków', () => {
  const { state, attackerIds, blockerIds } = combatScene({ atk: 6, blk: 6 });
  const viewObrocy = playerView(state, 'p2');
  assert.ok(viewObrocy.blockCandidates, 'widok broniącego niesie pulę kandydatów');
  assert.deepEqual(Object.keys(viewObrocy.blockCandidates).sort(), [...attackerIds].sort(),
    'pula w widoku ma wpis na każdego atakującego');
  assert.deepEqual(blockCandidatePool(state, 'p2'), viewObrocy.blockCandidates,
    'widok niesie dokładnie pulę z silnika (jedno źródło, L41)');

  assert.equal(playerView(state, 'p1').blockCandidates ?? null, null,
    'atakujący nie dostaje puli blokerów (nie deklaruje bloków, CR 509.1)');

  // Po deklaracji bloków decyzja znika → pole widoku też (bez martwych danych).
  const po = structuredClone(state);
  const result = execute(po, { type: 'declare_blockers', playerId: 'p2', assignments: { a0: ['b0'] } });
  assert.ok(result.ok, `deklaracja bloków: ${result.reason ?? ''}`);
  assert.equal(playerView(po, 'p2').blockCandidates ?? null, null,
    'po zadeklarowaniu bloków pula nie jest już ofertą');
  // Poza walką pola nie ma (koszt widoku tylko tam, gdzie jest decyzja).
  const bezWalki = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  assert.equal(playerView(bezWalki, 'p2').blockCandidates ?? null, null, 'poza walką brak pola');
});

test('E6/6: strażnik łańcucha silnik → widok → main.js → wizard (pin na całą drogę, L5)', () => {
  // E6/1–E6/4 pinują silnik i widok, E6/5 (test/choice-request-ui.test.js) pinuje
  // zachowanie wizarda. Bez tego strażnika wycięcie samego PRZEKAZANIA (main.js →
  // wizard) zostawiłoby wszystkie tamte zielone, a defekt wróciłby do gracza.
  const gameState = readFileSync(new URL('../src/engine/game-state.js', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');
  const choice = readFileSync(new URL('../src/table/choice-request.js', import.meta.url), 'utf8');

  // Widok bierze pulę Z SILNIKA (jedno źródło reguł, L41). Od F14 (audyt
  // PR #131) ten sam builder niesie obok puli liczbę slotów blokera — oba
  // pola powstają w JEDNYM miejscu, żeby bramkowanie (krok/stos/bloki) nie
  // mogło się rozjechać między nimi.
  assert.match(gameState, /blockCandidates: blockerView\?\.pool \?\? null/,
    'widok nie niesie `blockCandidates` — wizard nie ma skąd wziąć pełnej puli');
  assert.match(gameState, /blockCandidatePool\(state, playerId\)/,
    'pula w widoku nie jest liczona `blockCandidatePool` (kopia reguł w warstwie widoku?)');
  assert.match(gameState, /blockerSlots: blockerView\?\.slots \?\? null/,
    'widok nie niesie `blockerSlots` — wizard nie zna liczby użyć przyjętych przez silnik (F14)');
  assert.match(gameState, /slots\[blockerId\] = blockSlotsFor\(state, state\.objects\.get\(blockerId\)\)/,
    'sloty w widoku nie pochodzą z `blockSlotsFor` (kopia reguły w warstwie widoku?)');

  // main.js przekazuje pulę z widoku do wizarda walki.
  assert.match(main, /blockCandidates:\s*choiceView\.blockCandidates/,
    'main.js nie przekazuje `blockCandidates` do `renderCombatWizard` — łańcuch przerwany');

  // Wizard rysuje kandydatów z puli: per atakujący i w listach id.
  assert.match(choice, /blockCandidates\?\.\[attackerId\]/,
    'wizard nie bierze kandydatów per atakujący z puli (tylko z wyciętego menu)');
  assert.match(choice, /Object\.entries\(blockCandidates \?\? \{\}\)/,
    'wizard nie uzupełnia pulą listy atakujących/kandydatów');

  // Warstwa UI NIE liczy legalności bloków sama (reguły żyją w silniku).
  assert.ok(!/blockAssignmentViolation/.test(choice),
    'choice-request.js liczy legalność przypisania — to reguła silnika (L41), UI bierze gotową pulę');
});

test('E6/7: `blockCandidates` znika, gdy stos nie jest pusty (L48 — oferta = walidacja)', () => {
  // Audyt PR #131 (E2, znalezisko F10): warunek `stack.length > 0` w
  // `buildBlockCandidatesView` nie był pinowany (mutacja M-D zostawiała cały
  // plik zielony), a jest OSIĄGALNY: w kroku deklaracji bloków obrońca ma
  // priorytet i może rzucić instant (CR 509.1/117.1a) — wtedy deklaracja
  // bloków jest nielegalna (`stack_not_empty`), więc wizard nie może rysować
  // wierszy z puli. Bez tego warunku UI oferowałoby akcję, którą silnik odrzuca.
  const { state, attackerIds } = combatScene({ atk: 1, blk: 1 });
  const shock = REGISTRY.get('shock');
  assert.ok(shock, 'Shock w rejestrze');
  addObject(state, {
    id: 'shock', instanceId: 'i-shock', cardId: 'shock', controllerId: 'p2', ownerId: 'p2',
    zone: 'hand', ...gameObjectDataOf(shock), types: shock.types ?? [], keywords: shock.keywords ?? [],
    subtypes: shock.subtypes ?? [], cardName: shock.name,
  });
  addMana(state, 'p2', 1, { colors: ['R'] });

  // Przed rzutem: pula jest ofertą (krok deklaracji bloków, stos pusty).
  assert.ok(playerView(state, 'p2').blockCandidates?.[attackerIds[0]]?.length > 0,
    'pula kandydatów jest publikowana w oknie deklaracji');

  // Obrońca rzuca instant → stos niepusty: pula (i oferta deklaracji) muszą zniknąć.
  // Cel: GRACZ (p1), nie stwór — instant nie może zdejmować stworów, bo wtedy
  // po rozstrzygnięciu pula słusznie się zmieni (zabity atakujący = brak pary),
  // a test ma mierzyć powrót OFERTY po opróżnieniu stosu, nie skutek obrażeń.
  const cast = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'shock' && c.targets?.[0] === 'p1');
  assert.ok(cast, 'instant jest oferowany w kroku deklaracji bloków (CR 509.1)');
  assert.ok(execute(state, cast).ok, 'rzut przyjęty');
  assert.equal(state.zones.stack.length, 1, 'czar na stosie');
  assert.equal(playerView(state, 'p2').blockCandidates ?? null, null,
    'przy niepustym stosie pula kandydatów nie jest ofertą (deklaracja odrzucana: stack_not_empty)');
  assert.equal(playerView(state, 'p2').legalCommands.filter((c) => c.type === 'declare_blockers').length, 0,
    'deklaracja bloków nie jest oferowana przy niepustym stosie');

  // Po rozstrzygnięciu czaru pula wraca (okno deklaracji nadal otwarte).
  for (let i = 0; i < 8 && state.zones.stack.length > 0; i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const pick = view.legalCommands.find((c) => c.type.startsWith('resolve_'))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    assert.ok(pick, 'jest czym rozstrzygnąć stos');
    execute(state, pick);
  }
  assert.equal(state.zones.stack.length, 0, 'stos rozstrzygnięty');
  assert.ok(playerView(state, 'p2').blockCandidates?.[attackerIds[0]]?.length > 0,
    'po rozstrzygnięciu pula znów jest ofertą');
});
