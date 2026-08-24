// M202/N3 — audyt PR #73 (znalezisko N3): koszty dodatkowe zapisane NA OBIEKCIE
// a ścieżki rzutu „bez płacenia kosztu many”.
//
// `payFreeCastAdditionalCost` (M201/U2) czyta `obj.spell.additionalCost` —
// koszty dodatkowe instantów/sorcery. Karty-permanenty noszą swój koszt
// dodatkowy na OBIEKCIE (`additionalCost.exileCreature` — Fear of Abduction,
// `additionalCost.exileCreatureFromGraveyard` — Makeshift Mauler). Gdyby taka
// karta trafiła na ścieżkę darmowego rzutu, poszłaby BEZ kosztu dodatkowego
// (CR 601.2h — „bez kosztu many” nie znaczy „bez kosztów”).
//
// Ścieżki czarowe (Epic Experiment, suspend, rebound, grave free cast) oferują
// wyłącznie `kind === 'spell'`, więc dla nich zostaje STRAŻNIK (L52 §4), który
// czerwienieje w dniu wejścia pierwszej takiej karty.
//
// Natomiast pisanie pinów dla ścieżki IMPULSU (jedynej obejmującej permanenty)
// ujawniło PRAWDZIWY BŁĄD — **N4**: gałąź impulsu w `playerView` nie wiedziała
// o koszcie dodatkowym na obiekcie, więc wygnany impulsem Fear of Abduction
// / Makeshift Mauler dostawał ofertę `cast_permanent` BEZ `exileTargetId`,
// a walidacja ją odrzucała (zmierzone: oferta jest, `execute` → `ok: false`).
// To klasa L48 (oferta ≠ walidacja: stół pokazuje akcję, która zawsze się nie
// udaje, a bot dostaje reject) i L41 (trzy gałęzie oferty `cast_permanent`
// liczyły to samo, tylko jedna znała koszt). Fix: wspólny
// `exileAdditionalCostCandidates` używany przez gałąź z ręki, z flash i z
// impulsu; testy 2–4 pinują zachowanie po naprawie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

test('M202/N3 (strażnik katalogu): żadna karta z kosztem dodatkowym NA OBIEKCIE nie wchodzi na ścieżkę darmowego rzutu', () => {
  const problems = [];
  for (const card of REGISTRY.all()) {
    const objectCost = card.additionalCost ?? null;
    if (!objectCost) continue;
    // Ścieżki „bez płacenia kosztu many” dla CZARÓW: suspend (CR 702.62),
    // rebound (CR 702.97), madness (CR 702.71) i grave free cast. Każda z nich
    // płaci koszt dodatkowy z `obj.spell.additionalCost` — koszt na obiekcie
    // byłby dla nich niewidoczny.
    if (card.suspend) problems.push(`${card.id}: suspend + additionalCost na obiekcie`);
    if (card.rebound) problems.push(`${card.id}: rebound + additionalCost na obiekcie`);
    if (card.madness) problems.push(`${card.id}: madness + additionalCost na obiekcie`);
  }
  assert.deepEqual(problems, [], `${problems.join('\n')}\n\n`
    + 'Jeśli taka karta wchodzi do katalogu: najpierw naucz '
    + '`freeCastAdditionalCostVariants`/`payFreeCastAdditionalCost` czytać '
    + '`obj.additionalCost` (koszty na obiekcie), a dopiero potem oznacz kartę '
    + 'jako obsługiwaną — inaczej pójdzie za darmo (CR 601.2h).');
});

test('M202/N3 (pin): permanent wygnany impulsem NIE jest rzucalny bez kosztu dodatkowego', () => {
  // Impuls (Gila Courser, Caves of Chaos Adventurer) to jedyna ścieżka
  // „bez płacenia kosztu many”, która obejmuje permanenty — i jedyna, którą
  // koszt dodatkowy NA OBIEKCIE realnie dotyczy. Pinujemy, że oferta bez celu
  // wygnania nie powstaje (CR 601.2h).
  const state = createGameState({ seed: 41, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn('p1'), ...TURN_STEPS[3], stepIndex: 3, activePlayerId: 'p1', priorityPlayerId: 'p1', passes: 0 };
  put(state, 'ex1', 'fear-of-abduction', 'p1', 'exile', {
    playableWithoutPaying: true, playableUntilTurn: state.turn.number,
  });
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_permanent' && c.objectId === 'ex1');
  assert.deepEqual(offers, [],
    'bez własnego stwora do wygnania koszt dodatkowy jest nieopłacalny — czaru nie da się rzucić');
});

test('M202/N3 (pin): z zasobem na koszt dodatkowy oferta niesie cel wygnania i go płaci', () => {
  const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn('p1'), ...TURN_STEPS[3], stepIndex: 3, activePlayerId: 'p1', priorityPlayerId: 'p1', passes: 0 };
  put(state, 'ex1', 'fear-of-abduction', 'p1', 'exile', {
    playableWithoutPaying: true, playableUntilTurn: state.turn.number,
  });
  addObject(state, {
    id: 'cre1', instanceId: 'i-cre1', cardId: 'hill-giant', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 3, toughness: 3, types: ['Creature'], abilities: [],
  });
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_permanent' && c.objectId === 'ex1');
  assert.ok(offers.length > 0, 'z własnym stworem rzut jest oferowany');
  assert.ok(offers.every((c) => c.exileTargetId === 'cre1'),
    'każda oferta niesie cel kosztu dodatkowego (bez niego rzut byłby darmowy)');
  assert.equal(execute(state, offers[0]).ok, true);
  // CR 400.7: wygnany stwór to NOWY obiekt (nowe id) — sprawdzamy po karcie.
  assert.ok(state.zones.exile.some((oid) => state.objects.get(oid)?.cardId === 'hill-giant'),
    'stwór zapłacił koszt dodatkowy (wygnany)');
  assert.equal(state.zones.battlefield.includes('cre1'), false, 'stwór zszedł z pola bitwy');
});

test('M202/N3 (pin): Makeshift Mauler — koszt z grobu wymagany także przy rzucie impulsem', () => {
  const state = createGameState({ seed: 43, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn('p1'), ...TURN_STEPS[3], stepIndex: 3, activePlayerId: 'p1', priorityPlayerId: 'p1', passes: 0 };
  put(state, 'ex1', 'makeshift-mauler', 'p1', 'exile', {
    playableWithoutPaying: true, playableUntilTurn: state.turn.number,
  });
  assert.deepEqual(playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_permanent' && c.objectId === 'ex1'), [],
    'pusty grób = nieopłacalny koszt dodatkowy = brak rzutu');
  put(state, 'gr1', 'hill-giant', 'p1', 'graveyard');
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_permanent' && c.objectId === 'ex1');
  assert.ok(offers.length > 0, 'karta stwora w grobie odblokowuje rzut');
  assert.ok(offers.every((c) => c.exileTargetId === 'gr1'), 'oferta niesie kartę z grobu');
});
