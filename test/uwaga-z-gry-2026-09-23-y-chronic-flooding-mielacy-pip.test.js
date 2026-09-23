// Uwaga I (właściciel, 2026-09-23c): „Chronic Flooding — bot tapuje zaczarowany
// ląd i mieli się na śmierć (5 kart w bibliotece); ma tego nie robić przy
// cienkiej bibliotece".
//
// Dwa źródła problemu (oba naprawione w `heuristic-bot.js`, oba deskryptorowe —
// ADR 0002/0017, zero nazw kart):
//
//   1. MODEL PŁATNOŚCI NIE WIDZIAŁ PIPÓW. `paymentLibraryLoss` liczył tylko
//      ilość: koszt − pula − czyste lądy. Gdy koszt miał kolor, którego nie
//      produkuje żadne czyste źródło (a jedynym źródłem tego koloru był ląd
//      zalany aurą mielącą), model zwracał 0 kary, a auto-tap silnika — słusznie,
//      bo inaczej czaru nie da się złożyć — sięgał po zalany ląd i mielił
//      bibliotekę. Teraz `reservedPipsOf` (bliźniak `reservedManaOf`, L41) czyta
//      wymagane pipy, a niepokryte pipy wchodzą do liczby źródeł do zapłaty.
//   2. PRÓG BYŁ ZA NISKI DLA RYZYKA POWTARZALNEGO. Mielące TAPNIĘCIE to nie
//      jednorazowy dobór: każde tapnięcie miele 3 karty. Nowe pokrętło
//      `libraryTapSafeMargin` (domyślnie 30, właściciel: „~30 kart") obowiązuje
//      ścieżki tap_for_mana i płatności; dobory/mille z czarów zostają na
//      `librarySafeMargin` (20).
//
// Reguły są po danych karty: typ triggera (`enchanted_permanent_tapped`), typ
// efektu (`mill_cards`) i `applyTo` — nie po nazwie Chronic Flooding.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { DEFAULT_HEURISTIC_PARAMS } from '../src/controllers/heuristic-params.js';

const REGISTRY = createCardRegistry();
const BOT_ID = 'p1';

function gra(pid = BOT_ID) {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
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

/** Chronic Flooding na lądzie (aura kontrolera 'p2', jak w realnej grze). */
function zalej(state, landId, aurId = 'cf', wlasciciel = 'p2') {
  karta(state, aurId, 'chronic-flooding', wlasciciel, 'battlefield', { attachedTo: landId, kind: 'aura' });
}

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

/** Zalana Wyspa (jedyne {U}) + 3 czyste Lasy; w ręce czar z pipem {U}. */
function scenariuszPipa(lib) {
  const state = gra();
  biblioteka(state, 'p1', lib);
  biblioteka(state, 'p2', 20);
  karta(state, 'islandF', 'basic-island', 'p1');
  zalej(state, 'islandF');
  for (let i = 0; i < 3; i += 1) karta(state, `f${i}`, 'basic-forest', 'p1');
  karta(state, 'h1', 'gearsmith-prodigy', 'p1', 'hand');   // {U} 1/2
  return state;
}

test('I/1: cienka biblioteka — pip {U} tylko z zalanego lądu = bot NIE rzuca', () => {
  const { chosen, options } = decyzja(scenariuszPipa(5));
  assert.ok(score(options, 'cast_permanent(h1') < 0,
    `zapłata pipem z mielącego źródła musi być ujemna: ${score(options, 'cast_permanent(h1')}`);
  assert.equal(chosen.type, 'pass_priority',
    `bot ma passować zamiast mleć się przez auto-tap: ${JSON.stringify(chosen)}`);
});

test('I/2: cienka biblioteka — rzut faktycznie mielił (kontrola silnika)', () => {
  // Kontrola negatywna: bez kary auto-tap sięga po zalany ląd i miele 3 karty
  // (dokładnie objaw z gry, 5 → 2 karty). Wymuszenie komendy pokazuje koszt.
  const state = scenariuszPipa(5);
  const view = playerView(state, 'p1');
  const cast = view.legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'h1');
  assert.ok(cast, 'rzut jest legalny (auto-tap dołoży {U} z zalanego lądu)');
  assert.equal(execute(state, cast).ok, true, 'silnik przyjmuje rzut');
  rozliczStos(state);
  assert.equal(state.objects.get('islandF').tapped, true, 'zalany ląd zapłacił pipa');
  assert.equal(licznikBiblioteki(state, 'p1'), 2, 'trigger zmielił 3 karty (5 → 2)');
});

test('I/3 (anty-over-fix): zdrowa biblioteka — ten sam rzut zostaje opłacalny', () => {
  const zdrowe = decyzja(scenariuszPipa(40));
  assert.ok(score(zdrowe.options, 'cast_permanent(h1') > 0,
    `przy 40 kartach rzut jest opłacalny: ${score(zdrowe.options, 'cast_permanent(h1')}`);
  assert.equal(zdrowe.chosen.type, 'cast_permanent', 'bot rzuca (zapas po mieleniu ≥ 30)');
});

test('I/4: kolorowa pula pokrywa pip — kara nie należy się (zero fałszywych trafień)', () => {
  const state = scenariuszPipa(5);
  addMana(state, 'p1', 1, { colors: ['U'] });
  const { chosen } = decyzja(state);
  assert.equal(chosen.type, 'cast_permanent',
    'pula {U} płaci pip bez tapowania mielącego lądu');
  assert.equal(execute(state, chosen).ok, true, 'rzut płaci się z puli');
  rozliczStos(state);
  assert.equal(state.objects.get('islandF').tapped, false, 'zalany ląd zostaje odkręcony');
  assert.equal(licznikBiblioteki(state, 'p1'), 5, 'biblioteka nienaruszona');
});

test('I/5: próg 30 — przy 25 kartach mieląca płatność jest już karana', () => {
  const cienka = decyzja(scenariuszPipa(25));
  assert.ok(score(cienka.options, 'cast_permanent(h1') < 0,
    `25 kart (zapas 22 po mieleniu) < nowy próg 30 → kara: ${score(cienka.options, 'cast_permanent(h1')}`);
  assert.equal(cienka.chosen.type, 'pass_priority', 'bot czeka z rzutem');
});

test('I/6: pokrętło `libraryTapSafeMargin` naprawdę przepływa (właściciel może je zdjąć)', () => {
  const wylaczone = decyzja(scenariuszPipa(25), { libraryTapSafeMargin: 0 });
  assert.equal(wylaczone.chosen.type, 'cast_permanent',
    'z zapasem 0 kara wraca do progu ogólnego (20) i rzut znów jest opłacalny');
  assert.ok(score(wylaczone.options, 'cast_permanent(h1') > 0, 'wycena dodatnia');
  assert.equal(DEFAULT_HEURISTIC_PARAMS.libraryTapSafeMargin, 30,
    'domyślnie właściciel chce ~30 kart zapasu przy mielącym tapnięciu');
});
