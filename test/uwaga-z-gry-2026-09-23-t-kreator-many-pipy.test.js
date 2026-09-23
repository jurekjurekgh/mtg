// Uwaga G z gry (właściciel, 2026-09-23c): „Mana Wizard — płatność {1}{B}{G}
// po tapnięciu UB nie domknęła się (pusta, mimo 4 many)". Kartą z tym kosztem
// w katalogu jest Trestle Troll (M4250); scenariusz odtwarzamy REALNYM
// silnikiem: brama U/B (Dimir Guildgate) + Forest + Island.
//
// Dwie wady warstwy prowadzenia płatności (L14/L41 — jedno źródło prawdy dla
// pokrycia kolorów):
//   Gd/1 — `missingColors` liczone było jako `requirements.slice(covered)`,
//     czyli POZYCYJNIE: liczba pokrytych grup mówi ILE, ale nie KTÓRE, więc
//     przy puli pokrywającej grupę drugą kreator żądał koloru, który już ma,
//     a chował źródła koloru realnie brakującego → lista pusta przy pełnym
//     stole (dokładnie zgłoszenie właściciela);
//   Gd/2 — filtr „źródła bez brakującego koloru znikają z listy" włączał się
//     dopiero po zebraniu CAŁEJ sumy; gdy zostawały tylko kolorowe pipy
//     (część bezbarwna opłacalna z puli), kreator dalej proponował lądy bez
//     potrzebnego koloru — gracz tapował je na darmo.
//
// Wzorzec pinów: `test/zgloszenie-g-kreator-many-brakujacy-kolor.test.js`
// (2026-09-20) — te piny go NIE zastępują, tylko domykają klasę „pipy".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wizardProgress } from '../src/table/mana-wizard.js';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { getSourceForObject, manaAbilityProductionOf } from '../src/engine/mana-sources.js';
import { manaSourcesOf } from '../src/table/mana-wizard.js';
import { expandManaPool } from '../src/engine/resources.js';

const registry = createCardRegistry();

/** Koszt Trestle Trolla — {1}{B}{G} (te same kształty co w silniku). */
const KOSZT = { totalNeeded: 3, requirements: [['B'], ['G']], costStr: '{1}{B}{G}' };

/** Cztery nietapnięte podstawowe lądy — „mimo 4 many" ze zgłoszenia. */
const ZRODLA = [
  { id: 'l-ub', cardId: 'dimir-guildgate', colors: ['U', 'B'], amount: 1 },
  { id: 'l-g', cardId: 'basic-forest', colors: ['G'], amount: 1 },
  { id: 'l-u', cardId: 'basic-island', colors: ['U'], amount: 1 },
  { id: 'l-r', cardId: 'basic-mountain', colors: ['R'], amount: 1 },
  { id: 'l-b', cardId: 'basic-swamp', colors: ['B'], amount: 1 },
];

function widok(battlefield, mana) {
  return { players: [{ id: 'p1', mana }], zones: { battlefield } };
}

const POLE = ZRODLA.map((s) => ({ id: s.id, cardId: s.cardId, kind: 'land', controllerId: 'p1', tapped: false }));
/** Stół po tapnnięciu bramy {U}{B}: zostają cztery nietapnięte podstawowe lądy. */
const POLE_PO_BRAMIE = POLE.filter((o) => o.id !== 'l-ub');

test('Gd/1: po tapnięciu źródła {U}{B} kreator pokazuje WYŁĄCZNIE źródła brakującego koloru', () => {
  // Scenariusz ze zgłoszenia: brama {U}{B} tapnięta, na stole zostają cztery
  // nietapnięte podstawowe lądy („pusta, mimo 4 many").
  const progress = wizardProgress(widok(POLE_PO_BRAMIE, 1), 'p1', KOSZT, ZRODLA, [['U', 'B']]);
  assert.deepEqual(progress.missingColors, ['G'],
    'pula {U}{B} pokrywa pip {B}; brakuje wyłącznie {G}');
  assert.deepEqual(
    progress.requirements.map((r) => ({ colors: r.colors, covered: r.covered })),
    [{ colors: ['B'], covered: true }, { colors: ['G'], covered: false }],
    'pokrycie raportowane PER GRUPA, nie pozycyjnie',
  );
  assert.deepEqual(
    progress.untappedSources.map((s) => s.id),
    ['l-g'],
    'pipy kolorowe zostały same — źródła bez {G} znikają z listy (uwaga właściciela)',
  );
  assert.equal(progress.remainingTotal, 2, 'pozostało 2 many (pula 1 z 3)');
  assert.equal(progress.done, false, 'płatność nie jest domknięta');
});

test('Gd/2 (anty-slice): kolejność grup w koszcie nie zmienia tego, KTÓRY kolor jest pokryty', () => {
  // Odwrócona kolejność pipów (np. koszt zapisany {1}{G}{B}) — ten sam stan
  // puli: {U}{B}. Stary `slice(covered)` żądał {B} (już pokrytego) i chował
  // źródła {G} → lista robiła się pusta przy nietapniętym Lesie.
  const kosztOdwrotny = { totalNeeded: 3, requirements: [['G'], ['B']], costStr: '{1}{G}{B}' };
  const progress = wizardProgress(widok(POLE_PO_BRAMIE, 1), 'p1', kosztOdwrotny, ZRODLA, [['U', 'B']]);
  assert.deepEqual(progress.missingColors, ['G'], 'brakuje {G} — nie {B}, które siedzi w puli');
  assert.deepEqual(
    progress.requirements.map((r) => r.covered),
    [false, true],
    'pokryty jest DRUGI warunek ({B}), więc flaga musi być przy nim',
  );
  assert.ok(progress.untappedSources.some((s) => s.id === 'l-g'),
    'Las (jedyne źródło {G}) NIE MOŻE zniknąć z listy — to zgłoszenie „pusta lista"');
  assert.notDeepEqual(progress.untappedSources.map((s) => s.id), [], 'lista nie jest pusta przy dostępnym źródle');
});

test('Gd/3: płatność {1}{B}{G} domyka się prowadzona przez kreator (trzy tapnięcia, bez marnowania)', () => {
  const poolUnits = [];
  const tapped = new Set();
  // Kreator dostaje TYLKO nietapnięte źródła (jak main.js: manaSourcesOf z widoku) —
  // to jest sedno „tapuj po jednym": po każdym tapnięciu lista się zawęża.
  const sto = () => widok(
    POLE.map((o) => (tapped.has(o.id) ? { ...o, tapped: true } : o)),
    poolUnits.length,
  );
  const zrodla = () => ZRODLA.filter((s) => !tapped.has(s.id));
  const postep = () => wizardProgress(sto(), 'p1', KOSZT, zrodla(), poolUnits);
  const tap = (id) => { tapped.add(id); poolUnits.push(ZRODLA.find((s) => s.id === id).colors); return postep(); };
  // Krok 1: pusta pula — pierwszy wiersz musi nieść brakujący kolor.
  const p0 = wizardProgress(sto(), 'p1', KOSZT, zrodla(), []);
  assert.equal(p0.untappedSources[0].coversMissing, true, 'pierwszy wiersz przybliża płatność');
  // Scenariusz właściciela: tapujemy źródło {U}{B} — kreator wskazuje {G}.
  const poUb = tap('l-ub');
  assert.equal(poUb.requirements[0].covered, true, 'pip {B} pokryty');
  assert.deepEqual(poUb.untappedSources.map((s) => s.id), ['l-g'], 'zostaje tylko Las');
  const poG = tap('l-g');
  assert.equal(poG.requirements[1].covered, true, 'pip {G} pokryty');
  assert.equal(poG.remainingTotal, 1, 'brakuje jeszcze jednej many na część bezbarwną');
  assert.deepEqual(poG.untappedSources.map((s) => s.id), ['l-u', 'l-r', 'l-b'],
    'gdy pipy pokryte, każda nietapnięta mana dolicza się do sumy (odwrócona kolejność: źródło na górze)');
  const poTrzecim = tap('l-u');
  assert.equal(poTrzecim.done, true, 'płatność domyka się po TRZECH tapnięciach');
  assert.equal(poolUnits.length, 3, 'ani jednego tapnięcia ponad koszt');
});

test('Gd/4: filtr dotyczy TYLKO brakującego koloru — koszt bezbarwny nie chowa niczego', () => {
  const bezbarwny = { totalNeeded: 2, requirements: [], costStr: '{2}' };
  const progress = wizardProgress(widok(POLE, 1), 'p1', bezbarwny, ZRODLA, [['U']]);
  assert.deepEqual(progress.untappedSources.map((s) => s.id), ZRODLA.map((s) => s.id),
    'brak wymagań kolorów → lista bez filtra (każda mana dolicza się do sumy)');
});

test('Gd/5: pełna ścieżka silnika — Trestle Troll {1}{B}{G} z bramy {U}{B} + Forest + Island', () => {
  const state = createGameState({ seed: 923, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  const put = (id, cardId, zone, patch = {}) => {
    const def = registry.get(cardId);
    assert.ok(def, `${cardId} w rejestrze`);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone,
      ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
      ...patch,
    });
  };
  for (let i = 0; i < 4; i += 1) put(`lib${i}`, 'basic-swamp', 'library');
  put('gate', 'dimir-guildgate', 'battlefield');   // {T}: Add {U} or {B} — jedna jednostka [U,B]
  put('forest', 'basic-forest', 'battlefield');    // {G}
  put('island', 'basic-island', 'battlefield');    // {U} — mana na część bezbarwną
  put('troll', 'trestle-troll', 'hand');

  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'troll');
  assert.ok(cast, 'setup: silnik oferuje rzut Trestle Trolla');

  // Tapnięcia idą tą samą drogą co kreator: `tap_for_mana` per źródło.
  assert.ok(execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: 'gate' }).ok, 'brama tapnięta');
  const poBramie = playerView(state, 'p1');
  assert.deepEqual(poBramie.players.find((p) => p.id === 'p1').mana, 1, 'jedna mana z bramy');
  const unitsPoBramie = expandManaPool(state.players.find((p) => p.id === 'p1').manaPool);
  assert.deepEqual(unitsPoBramie, [['U', 'B']], 'jednostka puli niesie OBA kolory bramy (profil [U,B])');

  // Lista źródeł kreatora z pełnego stanu (jak main.js: `manaSourcesOf`).
  const abilityInfo = (objectId, abilityIndex) => {
    const obj = state.objects.get(objectId);
    if (!obj) return null;
    if (abilityIndex == null) {
      const src = getSourceForObject(obj, state);
      if (!src || (src.amount ?? 0) <= 0) return null;
      return {
        cardId: obj.cardId, colors: src.colors ?? [], amount: src.amount ?? 1,
        manaCost: 0, costColors: [], isLand: true, spendOnly: src.spendOnly ?? null,
      };
    }
    return null;
  };
  const sources = manaSourcesOf(poBramie, 'p1', abilityInfo);
  const progress = wizardProgress(poBramie, 'p1',
    { totalNeeded: 3, requirements: [['B'], ['G']], costStr: '{1}{B}{G}' },
    sources, unitsPoBramie);
  assert.deepEqual(progress.untappedSources.map((s) => s.cardId), ['basic-forest'],
    'kreator prowadzi do Lasu — dokładnie to, czego brakuje po bramie {U}{B}');

  assert.ok(execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: 'forest' }).ok, 'Las tapnięty');
  assert.ok(execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: 'island' }).ok, 'Wyspa tapnięta');
  const po = playerView(state, 'p1');
  const units = expandManaPool(state.players.find((p) => p.id === 'p1').manaPool);
  const final = wizardProgress(po, 'p1',
    { totalNeeded: 3, requirements: [['B'], ['G']], costStr: '{1}{B}{G}' },
    [], units);
  assert.equal(final.done, true, 'kreator domyka płatność (pula 3 many, kolory pokryte)');

  const rzut = execute(state, cast);
  assert.equal(rzut.ok, true, `silnik przyjmuje rzut z tej puli (${rzut.events?.[0]?.reason ?? 'ok'})`);
  const gdzie = [...state.objects.values()].find((o) => o.cardId === 'trestle-troll');
  assert.ok(['stack', 'battlefield'].includes(gdzie.zone), 'Trestle Troll opłacony i rzucony');
});
