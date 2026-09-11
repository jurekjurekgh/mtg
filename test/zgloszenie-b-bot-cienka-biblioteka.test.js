// =============================================================================
// Zgłoszenie właściciela B (2026-09-11): bot z cienką biblioteką mieli się sam.
//
// Objaw z partii testowej: bot miał ~9 kart w bibliotece, tapował ląd
// zaczarowany Chronic Flooding („Whenever enchanted land becomes tapped, its
// controller mills three cards" — 3 karty na każde tapnięcie) i dokładał
// własnemu stworowi Curiosity („Whenever enchanted creature deals damage to an
// opponent, you may draw a card"), czyli powtarzalne źródło dobierania.
// Właściciel: przy małej bibliotece (~<20 kart) bot nie powinien ani tapować
// lądów, które mielą mu bibliotekę, ani używać kart, które dobierają/mielą
// z jego własnej biblioteki.
//
// Dwie drogi naprawy (CR 121.4/704.5b: próba dobrania z pustej biblioteki
// przegrywa partię):
//   B/1 silnik — auto-tap (`spendMana`, CR 601.2h) nie narzuca, KTÓRE źródła
//       płacą, więc przy równym kolorze odkłada na koniec te, których tapnięcie
//       miele bibliotekę kontrolera (`millsLibraryOnTap`).
//   B/2 bot — podatek biblioteczny w jednym lejku wyceny (`libraryDrainTax`
//       odejmowane w `finish`, jak wardTax): tapnięcie mielącego permanentu,
//       płatność, której bez mielącego źródła nie da się złożyć, oraz rzut
//       karty tworzącej POWTARZALNY trigger doboru/millu.
//
// Reguły są po DANYCH karty (typ triggera, typ efektu, `applyTo`) i po liczbie
// kart w bibliotece (informacja publiczna, ADR 0017) — zero nazw kart
// (ADR 0002): Scroll Thief (dobór po obrażeniach) jest karany tak samo jak
// Curiosity, a Giant Spider (brak triggera bibliotecznego) nie jest karany
// wcale. Progi są parametrami (heuristic-params.js), więc właściciel może je
// przestawić bez dotykania logiki.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { spendMana } from '../src/engine/resources.js';
import { COMMAND_TYPES } from '../src/protocol/types.js';
import { createHeuristicBot, LIBRARY_DRAIN_CAST_TYPES } from '../src/controllers/heuristic-bot.js';
import { DEFAULT_HEURISTIC_PARAMS } from '../src/controllers/heuristic-params.js';

const REGISTRY = createCardRegistry();
const BOT_ID = 'p1';

/** Główna 1 własnej tury — okno, w którym bot płaci za czary. */
function gra(pid = BOT_ID) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', pid);
  state.turn.activePlayerId = pid;
  state.turn.priorityPlayerId = pid;
  state.turn.phase = 'precombat_main';
  return state;
}

function karta(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} jest w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...patch }));
  return state.objects.get(id);
}

function biblioteka(state, pid, ile) {
  for (let i = 0; i < ile; i += 1) karta(state, `L${pid}${i}`, 'basic-forest', pid, 'library');
}
const licznikBiblioteki = (state, pid) => state.zones.library
  .filter((id) => state.objects.get(id).controllerId === pid).length;
const groby = (state, pid) => state.zones.graveyard
  .filter((id) => state.objects.get(id).controllerId === pid).length;

/** Chronic Flooding jako aura na lądzie: silnik wymaga `kind: 'aura'` + gospodarza. */
function zalej(state, landId, aurId = 'cf', wlasciciel = 'p2') {
  karta(state, aurId, 'chronic-flooding', wlasciciel, 'battlefield',
    { attachedTo: landId, kind: 'aura' });
}

/** Trigger z tapnięcia wchodzi na stos — odkręcamy priorytet, aż się rozliczy. */
function rozliczStos(state) {
  for (let i = 0; i < 6 && state.zones.stack.length > 0; i += 1) {
    const wynik = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    assert.equal(wynik.ok, true, `pass_priority po tapnięciu: ${JSON.stringify(wynik)}`);
  }
}

function decyzja(state, params, pid = BOT_ID) {
  const bot = createHeuristicBot({ seed: 7, params });
  const chosen = bot.chooseCommand(playerView(state, pid));
  return { chosen, options: bot.trace().at(-1)?.options ?? [] };
}
const score = (options, prefix) => options.find((o) => String(o.cmd).startsWith(prefix))?.score ?? null;

// =============================================================================
// B/1 — silnik: auto-tap nie tapuje mielącego źródła, gdy ma wybór
// =============================================================================

test('B/1 (silnik): płatność tapuje CZYSTY ląd, a nie zalany Chronic Flooding', () => {
  const state = gra();
  biblioteka(state, 'p1', 9);
  karta(state, 'landF', 'basic-forest', 'p1');   // zalany — dodany PIERWSZY
  zalej(state, 'landF');
  karta(state, 'landC', 'basic-forest', 'p1');   // czysty

  spendMana(state, 'p1', 1, []);

  assert.equal(state.objects.get('landC').tapped, true, 'czysty ląd płaci');
  assert.equal(state.objects.get('landF').tapped, false,
    'zalany ląd zostaje odkręcony, choć był pierwszy w kolejności (CR 601.2h nie narzuca źródła)');
  assert.equal(licznikBiblioteki(state, 'p1'), 9, 'biblioteka nienaruszona');
  assert.equal(groby(state, 'p1'), 0, 'nic nie zostało zmielone');
});

test('B/1 (silnik): tapnięcie zalanego lądu miele 3 — dogrywka nie jest zakazem tapowania', () => {
  const state = gra();
  biblioteka(state, 'p1', 9);
  karta(state, 'landF', 'basic-forest', 'p1');
  zalej(state, 'landF');

  // Przez komendę (nie goły `spendMana`): dopiero `execute` przetwarza zdarzenie
  // `object_tapped`, od którego trigger Chronic Flooding wchodzi na stos.
  const wynik = execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: 'landF' });
  assert.equal(wynik.ok, true, `tapnięcie zalanego lądu jest legalne: ${JSON.stringify(wynik)}`);
  rozliczStos(state);

  assert.equal(state.objects.get('landF').tapped, true, 'zalany ląd może zapłacić');
  assert.equal(licznikBiblioteki(state, 'p1'), 6, 'trigger Chronic Flooding zmielił 3 karty');
  assert.equal(groby(state, 'p1'), 3, 'zmielone karty są w grobie');
});

// =============================================================================
// B/2 — bot: Curiosity (powtarzalne dobieranie) przy cienkiej bibliotece
// =============================================================================

function scenariuszAury(lib) {
  const state = gra();
  biblioteka(state, 'p1', lib);
  biblioteka(state, 'p2', 20);
  karta(state, 'island', 'basic-island', 'p1');        // {U} na pip Curiosity
  karta(state, 'stwor1', 'giant-spider', 'p1');        // gospodarz aury
  karta(state, 'h1', 'curiosity', 'p1', 'hand');
  return state;
}

test('B/2 (zgłoszenie właściciela): przy 9 kartach bot NIE rzuca Curiosity na własnego stwora', () => {
  const cienka = decyzja(scenariuszAury(9));
  const zdrowa = decyzja(scenariuszAury(25));
  const sCienka = score(cienka.options, 'cast_permanent(h1');
  const sZdrowa = score(zdrowa.options, 'cast_permanent(h1');

  assert.ok(sCienka < 0, `przy 9 kartach wariant schodzi poniżej passu: ${sCienka}`);
  assert.equal(cienka.chosen.type, 'pass_priority',
    `bot ma passować, nie dokładać sobie powtarzalnego doboru: ${JSON.stringify(cienka.chosen)}`);
  assert.ok(sZdrowa > 0, `przy 25 kartach przewaga kartowa zostaje wartością: ${sZdrowa}`);
  assert.equal(zdrowa.chosen.type, 'cast_permanent', 'przy zdrowej bibliotece bot rzuca aurę');
  assert.ok(sZdrowa - sCienka >= 100,
    `kara biblioteczna musi być istotna (delta ${sZdrowa - sCienka}) — inaczej nie przebije bazy rzutu`);
});

test('B/2 (parametr): `librarySafeMargin: 0` wyłącza karę — pokrętło naprawdę przepływa', () => {
  const bezBramki = decyzja(scenariuszAury(9), { librarySafeMargin: 0 });
  const zdrowa = decyzja(scenariuszAury(25));
  assert.equal(score(bezBramki.options, 'cast_permanent(h1'), score(zdrowa.options, 'cast_permanent(h1'),
    'z zerowym zapasem cienka biblioteka nie zmienia wyceny (kara pochodzi z parametru, nie ze stałej)');
  assert.equal(bezBramki.chosen.type, 'cast_permanent', 'bez bramki bot znów rzuca aurę');
});

// =============================================================================
// B/3 — bot: płatność, której bez mielącego lądu nie da się złożyć
// =============================================================================

function scenariuszPlatnosci(lib, { zalany, czyste }) {
  const state = gra();
  biblioteka(state, 'p1', lib);
  biblioteka(state, 'p2', 20);
  if (zalany) { karta(state, 'landF', 'basic-forest', 'p1'); zalej(state, 'landF'); }
  for (let i = 0; i < czyste; i += 1) karta(state, `landC${i}`, 'basic-forest', 'p1');
  karta(state, 'h1', 'welder-automaton', 'p1', 'hand');   // koszt generyczny, bez pipów
  return state;
}

test('B/3: bot nie rzuca czaru, którego płatność musi tapnąć zalany ląd (9 kart w bibliotece)', () => {
  const cienka = decyzja(scenariuszPlatnosci(9, { zalany: true, czyste: 1 }));
  const zdrowa = decyzja(scenariuszPlatnosci(25, { zalany: true, czyste: 1 }));
  const sCienka = score(cienka.options, 'cast_permanent(h1');
  const sZdrowa = score(zdrowa.options, 'cast_permanent(h1');

  assert.ok(sCienka < 0, `mana nie jest warta deck-outu: ${sCienka}`);
  assert.equal(cienka.chosen.type, 'pass_priority',
    `bot ma passować zamiast mleć się przez auto-tap: ${JSON.stringify(cienka.chosen)}`);
  assert.ok(sZdrowa > 0, `przy 25 kartach ten sam rzut jest opłacalny: ${sZdrowa}`);
  assert.equal(zdrowa.chosen.type, 'cast_permanent');
});

test('B/3: gdy płatność mieści się w czystych lądach, kary nie ma (zero fałszywych trafień)', () => {
  const cienka = decyzja(scenariuszPlatnosci(9, { zalany: false, czyste: 2 }));
  const zdrowa = decyzja(scenariuszPlatnosci(25, { zalany: false, czyste: 2 }));
  assert.equal(score(cienka.options, 'cast_permanent(h1'), score(zdrowa.options, 'cast_permanent(h1'),
    'dwa czyste lądy pokrywają koszt — biblioteka nie bierze udziału w wycenie');
  assert.ok(score(cienka.options, 'cast_permanent(h1') > 0, 'rzut zostaje opłacalny');
});

// =============================================================================
// B/4 — reguła jest po danych, nie po nazwie karty (ADR 0002)
// =============================================================================

function scenariuszStwora(lib, cardId, ileLadow = 4) {
  const state = gra();
  biblioteka(state, 'p1', lib);
  biblioteka(state, 'p2', 20);
  karta(state, 'island', 'basic-island', 'p1');   // pip {U} dla Scroll Thiefa
  for (let i = 0; i < ileLadow - 1; i += 1) karta(state, `f${i}`, 'basic-forest', 'p1');
  karta(state, 'h1', cardId, 'p1', 'hand');
  return state;
}

test('B/4 (ADR 0002): Scroll Thief (trigger „combat damage → draw") jest karany tak samo jak Curiosity', () => {
  const cienka = decyzja(scenariuszStwora(9, 'scroll-thief'));
  const zdrowa = decyzja(scenariuszStwora(25, 'scroll-thief'));
  assert.ok(score(cienka.options, 'cast_permanent(h1') < 0,
    `powtarzalne dobieranie z własnej biblioteki przy 9 kartach: ${score(cienka.options, 'cast_permanent(h1')}`);
  assert.equal(cienka.chosen.type, 'pass_priority');
  assert.ok(score(zdrowa.options, 'cast_permanent(h1') > 0, 'przy zdrowej bibliotece stwór jest wart rzutu');
});

test('B/4 (ADR 0002): Giant Spider (brak triggera bibliotecznego) nie dostaje żadnej kary', () => {
  const cienka = decyzja(scenariuszStwora(9, 'giant-spider'));
  const zdrowa = decyzja(scenariuszStwora(25, 'giant-spider'));
  assert.equal(score(cienka.options, 'cast_permanent(h1'), score(zdrowa.options, 'cast_permanent(h1'),
    'kara dotyczy kart, które NAPRAWDĘ ruszają własną bibliotekę — nie wszystkich przy cienkiej bibliotece');
  assert.ok(score(cienka.options, 'cast_permanent(h1') > 0, 'cieńka biblioteka nie blokuje zwykłego stwora');
});

test('B/4: Chronic Flooding rzucona na ląd PRZECIWNIKA nie jest karana (applyTo decyduje, nie nazwa)', () => {
  function scenariusz(lib) {
    const state = gra();
    biblioteka(state, 'p1', lib);
    biblioteka(state, 'p2', 20);
    karta(state, 'island', 'basic-island', 'p1');
    karta(state, 'lasP1', 'basic-forest', 'p1');
    karta(state, 'landP2', 'basic-forest', 'p2');        // cel przeciwnika
    karta(state, 'h1', 'chronic-flooding', 'p1', 'hand');
    return state;
  }
  const cienka = decyzja(scenariusz(9));
  const zdrowa = decyzja(scenariusz(25));
  const naCudzy = 'cast_permanent(h1->landP2)';
  assert.equal(score(cienka.options, naCudzy), score(zdrowa.options, naCudzy),
    'mill PRZECIWNIKA to zysk, nie ryzyko własnego deck-outu — odbiorcę niesie `applyTo`');
  assert.equal(cienka.chosen.type, 'cast_permanent', 'bot nadal chce zalewać cudzy ląd');
  assert.deepEqual(cienka.chosen.targets, ['landP2'], `cel: cudzy ląd — ${JSON.stringify(cienka.chosen)}`);
});

// =============================================================================
// B/5 — strażnik zakresu rodziny (lekcja M324/F1 przy WARD_TAXED_TYPES)
// =============================================================================

test('B/5 (strażnik): rodzina rzutów jest wyprowadzona z kontraktu COMMAND_TYPES', () => {
  const rzuty = COMMAND_TYPES.filter((type) => type.startsWith('cast_') || type.endsWith('_cast'));
  assert.ok(rzuty.length >= 8, `kontrakt wciąż niesie rodzinę rzutów (${rzuty.length})`);
  for (const type of rzuty) {
    assert.ok(LIBRARY_DRAIN_CAST_TYPES.has(type),
      `nowy typ rzutu ${type} — zdecyduj świadomie, czy podlega karze bibliotecznej (jak ward w M324)`);
  }
  for (const type of ['pass_priority', 'tap_for_mana', 'declare_attackers', 'declare_blockers', 'activate_ability']) {
    assert.ok(!LIBRARY_DRAIN_CAST_TYPES.has(type), `${type} nie jest rzutem karty`);
  }
});

test('B/5 (parametry): progi bezpieczeństwa biblioteki są pokrętłami właściciela', () => {
  assert.equal(DEFAULT_HEURISTIC_PARAMS.libraryDeckOutPenalty, 120);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.libraryThinPenalty, 60);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.libraryThinPerCardPenalty, 6);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.librarySafeMargin, 20, 'właściciel: ~<20 kart = cienka biblioteka');
  assert.equal(DEFAULT_HEURISTIC_PARAMS.repeatLibraryDrainTurns, 3);
});
