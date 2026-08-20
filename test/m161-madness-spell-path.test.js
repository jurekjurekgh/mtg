// M161 — gotowość madness na czary (zasada właściciela 2026-08-20).
//
// Zasada: nie zostawiamy nieobsłużonych sytuacji zależnych od przyszłych kart
// — kod mechaniki ma być gotowy na ich nadejście, a ścieżka martwa dziś
// (bo żadna karta katalogu jej nie obsługuje) musi być ZASYGNALIZOWANA,
// żeby o niej nie zapomnieć. Dwie obserwacje audytu PR #66 (podjęte w
// docs/audits/AUDYT_PR67_2026-08-20.md jako O1/O2):
//
// S1–S4 (O1): routing po kind — instant/sorcery z madness leci ścieżką
//     czarów (cele + płatność kosztu madness + stos), nie castPermanent
//     („Ten obiekt nie jest zagrywalnym permanentem"). Timing ignorowany
//     (CR 702.34e, jak fix F1 M159).
// S5–S6 (O2): bramka kolorów przy koszcie alternatywnym sprawdza pipy
//     KOSZTU MADNESS (madness.colors), nie pipy karty — karty o różnych
//     kolorach kosztu madness i bazowego (dziś: żadna) przechodzą poprawnie.
// S7/S8: kompletność ofert (brak celów → tylko rezygnacja, CR 601.2c)
//     i strażnik oferta=walidacja (L48) — KAŻDA oferowana komenda przechodzi.
// S9: SYGNAŁ — strażnik katalogu: w katalogu nie ma (jeszcze) instanta/
//     sorcery z madness; pierwsza taka karta czerwieni ten test. Ścieżka
//     czarowa ISTNIEJE i jest przetestowana wyżej (S1–S4) — wtedy dopisz
//     testy kartowe (batch) i ew. rozszerz zakres castMadnessSpell, jeśli
//     karta wnosi koszty dodatkowe / variableTargets / X.
// S10: granice zakresu sygnalizowane JAWNYM rejectem (nie cichym obejściem):
//     czar z kosztem dodatkowym nie dostaje oferty rzutu, a ręczna komenda
//     dostaje czytelny powód odrzucenia.
//
// Wszystkie scenariusze madness-czarów używają OBIEKTÓW SYNTETYCZNYCH
// (karty bazowe z katalogu + pole madness nadane w teście) — katalog nie
// rośnie spekulatywnie (ADR 0001/0022).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 161, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

/** Karta katalogu + SYNTETYCZNY deskryptor madness (obiekt gry, nie katalog). */
function putCard(state, id, cardId, controllerId = 'p1', zone = 'hand', madness = null) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
    ...(madness ? { madness } : {}),
  });
  return state.objects.get(id);
}

function discard(state, objectId, purpose = 'effect', restoreTo = 'p1') {
  state.pendingDiscardChoice = {
    playerId: 'p1', count: 1, handIds: [objectId], purpose,
    sourceCardId: null, restorePriorityTo: restoreTo,
  };
  assert.ok(execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardId: objectId }).ok);
  assert.ok(state.pendingMadnessCast, 'decyzja madness otwarta');
  assert.equal(state.pendingMadnessCast.objectId !== objectId, true, 'karta w exile pod nowym id');
}

function madnessCommands(state, playerId = 'p1') {
  return playerView(state, playerId).legalCommands.filter((c) => c.type === 'resolve_madness_cast');
}

function onZone(state, cardId, zone) {
  return [...state.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);
}

// ---- O1: routing po kind do ścieżki czarów ----------------------------------

test('S1: instant bez celu z madness — oferta, rzut za koszt, stos, madness:true', () => {
  const state = game();
  putCard(state, 'cur', 'curate', 'p1', 'hand', { cost: 1, colors: ['U'] });
  discard(state, 'cur');
  addMana(state, 'p1', 1, { colors: ['U'] });
  const cast = madnessCommands(state).find((c) => c.cast);
  assert.ok(cast, 'oferta rzutu za madness (czar bez celów)');
  assert.deepEqual(cast.targets ?? [], [], 'czar bez celów: oferta bez targets');
  const result = execute(state, cast);
  assert.ok(result.ok, `rzut zaakceptowany, a był: ${result.events?.[0]?.reason}`);
  const stacked = onZone(state, 'curate', 'stack');
  assert.ok(stacked, 'czar madness na stosie');
  assert.equal(stacked.madnessReady, false, 'gotowość madness skonsumowana');
  assert.ok(!onZone(state, 'curate', 'graveyard'), 'karta nie w grobie przed rozstrzygnięciem');
  const e = result.events.find((ev) => ev.type === 'spell_cast');
  assert.ok(e, 'zdarzenie spell_cast');
  assert.equal(e.madness, true, 'spell_cast oznacza madness');
  assert.equal(e.manaSpent, 1, 'zapłacono koszt madness (1 many)');
});

test('S2: instant z celem — oferta per legalny cel, rozstrzygnięcie działa', () => {
  const state = game();
  const guy = putCard(state, 'guy', 'highland-game', 'p1', 'battlefield');
  const foe = putCard(state, 'foe', 'highland-game', 'p2', 'battlefield');
  putCard(state, 'bf', 'brute-force', 'p1', 'hand', { cost: 1, colors: ['R'] });
  discard(state, 'bf');
  addMana(state, 'p1', 1, { colors: ['R'] });
  const casts = madnessCommands(state).filter((c) => c.cast);
  assert.equal(casts.length, 2, 'oferta per legalny cel (dwa stwory na stole)');
  const targetIds = casts.map((c) => c.targets[0]).sort();
  assert.deepEqual(targetIds, [foe.id, guy.id].sort(), 'cele w ofertach to legalne stwory');
  const chosen = casts.find((c) => c.targets[0] === guy.id);
  const result = execute(state, chosen);
  assert.ok(result.ok, `rzut zaakceptowany, a był: ${result.events?.[0]?.reason}`);
  const stacked = onZone(state, 'brute-force', 'stack');
  assert.deepEqual(stacked.chosenTargets, [guy.id], 'chosenTargets na obiekcie stosu');
  // Rozstrzygnięcie po rundzie passów — pump działa przez zwykłą ścieżkę czarów.
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  assert.equal(state.objects.get(guy.id).powerModifier, 3, '+3/+3 po rozstrzygnięciu');
  assert.ok(onZone(state, 'brute-force', 'graveyard'), 'rozstrzygnięty czar w grobie');
});

test('S3: modalny instant z madness — oferta per tryb (modeIndex)', () => {
  const state = game();
  putCard(state, 'guy', 'highland-game', 'p1', 'battlefield');
  putCard(state, 'sc', 'selesnya-charm', 'p1', 'hand', { cost: 2, colors: ['G'] });
  discard(state, 'sc');
  addMana(state, 'p1', 2, { colors: ['G'] });
  const casts = madnessCommands(state).filter((c) => c.cast);
  const modeIndexes = new Set(casts.map((c) => c.modeIndex));
  assert.ok(modeIndexes.has(0), 'tryb A (pump, cel) oferowany');
  assert.ok(modeIndexes.has(2), 'tryb C (token, bez celu) oferowany');
  const token = casts.find((c) => c.modeIndex === 2);
  const result = execute(state, token);
  assert.ok(result.ok, `rzut trybem C zaakceptowany, a był: ${result.events?.[0]?.reason}`);
  assert.equal(onZone(state, 'selesnya-charm', 'stack').chosenMode, 2, 'chosenMode na stosie');
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  const knight = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.name === 'Knight');
  assert.ok(knight, 'tryb C rozstrzygnięty: token Knight na stole');
});

test('S4: timing ignorowany (CR 702.34e) — cleanup i tura przeciwnika', () => {
  // S4a: odrzucenie w cleanup (limit ręki) — sorcery z madness legalny.
  const a = game('p2');
  putCard(a, 'fy', 'forever-young', 'p1', 'hand', { cost: 2, colors: ['B'] });
  a.turn = jumpToStep(a.turn, 'end', 'p2');
  a.turn.step = 'cleanup';
  a.turn.phase = 'ending';
  discard(a, 'fy', 'cleanup', 'p2');
  addMana(a, 'p1', 2, { colors: ['B'] });
  const castA = madnessCommands(a).find((c) => c.cast);
  assert.ok(castA, 'oferta rzutu sorcery-madness w cleanup');
  const resA = execute(a, castA);
  assert.ok(resA.ok, `sorcery za madness w cleanup legalny (CR 702.34e), a był: ${resA.events?.[0]?.reason}`);
  assert.ok(onZone(a, 'forever-young', 'stack'), 'sorcery na stosie');

  // S4b: tura przeciwnika — instant z madness legalny (czar bez celu, żeby
  // oferta nie zależała od puli celów — patrz S7).
  const b = game('p2');
  putCard(b, 'cur', 'curate', 'p1', 'hand', { cost: 1, colors: ['U'] });
  discard(b, 'cur', 'effect', 'p2');
  addMana(b, 'p1', 1, { colors: ['U'] });
  const castB = madnessCommands(b).find((c) => c.cast);
  assert.ok(castB, 'oferta rzutu w turze przeciwnika');
  const resB = execute(b, castB);
  assert.ok(resB.ok, `rzut w turze przeciwnika legalny, a był: ${resB.events?.[0]?.reason}`);
});

// ---- O2: bramka kolorów wg kosztu madness, nie pipów karty ------------------

test('S5: instant {1}{U} z madness {R} — czerwona mana wystarcza (O2)', () => {
  const state = game();
  putCard(state, 'cur', 'curate', 'p1', 'hand', { cost: 1, colors: ['R'] });
  discard(state, 'cur');
  addMana(state, 'p1', 1, { colors: ['R'] });
  const cast = madnessCommands(state).find((c) => c.cast);
  assert.ok(cast, 'pipy KOSZTU MADNESS ({R}), nie karty ({1}{U}) — sama czerwona mana wystarcza');
  const result = execute(state, cast);
  assert.ok(result.ok, `rzut zaakceptowany, a był: ${result.events?.[0]?.reason}`);
  assert.equal(result.events.find((ev) => ev.type === 'spell_cast').manaSpent, 1);
});

test('S5b: instant {1}{U} z madness {R} — sama niebieska mana NIE wystarcza', () => {
  const state = game();
  putCard(state, 'cur', 'curate', 'p1', 'hand', { cost: 1, colors: ['R'] });
  discard(state, 'cur');
  addMana(state, 'p1', 1, { colors: ['U'] });
  assert.ok(!madnessCommands(state).some((c) => c.cast), 'koszt madness {R} wymaga czerwonego źródła');
  assert.ok(madnessCommands(state).some((c) => !c.cast), 'rezygnacja pozostaje oferowana');
});

test('S6: PERMANENT {1}{G} z madness {2}{R} — routing bez zmian, bramka wg madness (O2)', () => {
  const state = game();
  putCard(state, 'hg', 'highland-game', 'p1', 'hand', { cost: 2, colors: ['R'] });
  discard(state, 'hg');
  addMana(state, 'p1', 2, { colors: ['R'] });
  const cast = madnessCommands(state).find((c) => c.cast);
  assert.ok(cast, 'permanent z madness: pipy kosztu madness ({R}), nie karty ({G})');
  const result = execute(state, cast);
  assert.ok(result.ok, `rzut permanentu zaakceptowany, a był: ${result.events?.[0]?.reason}`);
  assert.ok(onZone(state, 'highland-game', 'stack'), 'czar-stwór na stosie (castPermanent)');
  const e = result.events.find((ev) => ev.type === 'permanent_cast');
  assert.ok(e, 'zdarzenie permanent_cast (ścieżka permanentów bez zmian)');
});

// ---- Kompletność ofert i oferta=walidacja (L48) ------------------------------

test('S7: instant z madness WYMAGA celów, brak legalnych → tylko rezygnacja', () => {
  const state = game();
  putCard(state, 'en', 'enter-the-enigma', 'p1', 'hand', { cost: 1, colors: ['U'] });
  discard(state, 'en');
  addMana(state, 'p1', 1, { colors: ['U'] });
  const cmds = madnessCommands(state);
  assert.ok(!cmds.some((c) => c.cast), 'bez legalnych celów czar z celem nie jest oferowany (CR 601.2c)');
  assert.ok(cmds.some((c) => !c.cast), 'rezygnacja oferowana');
});

test('S8: strażnik oferta=walidacja — KAŻDA oferowana komenda madness przechodzi', () => {
  // Dwa niezależne przebiegi (execute mutuje stan): czar z celami (S2) i
  // permanent o innych kolorach kosztu madness (S6).
  for (const scenario of ['spell', 'permanent']) {
    for (const wantCast of [true, false]) {
      const s = game();
      if (scenario === 'spell') {
        putCard(s, 'guy', 'highland-game', 'p1', 'battlefield');
        putCard(s, 'bf', 'brute-force', 'p1', 'hand', { cost: 1, colors: ['R'] });
      } else {
        putCard(s, 'hg', 'highland-game', 'p1', 'hand', { cost: 2, colors: ['R'] });
      }
      discard(s, scenario === 'spell' ? 'bf' : 'hg');
      addMana(s, 'p1', scenario === 'spell' ? 1 : 2, { colors: ['R'] });
      const offered = madnessCommands(s);
      assert.ok(offered.length > 0, 'oferty obecne');
      const cmd = offered.find((c) => c.cast === wantCast);
      assert.ok(cmd, `wariant cast=${wantCast} (${scenario})`);
      const done = execute(s, cmd);
      assert.ok(done.ok, `oferta ma przechodzić execute (${scenario}, cast=${wantCast}), a była: ${done.events?.[0]?.reason}`);
    }
  }
});

// ---- SYGNAŁ: strażnik katalogu + gotowość materialize ------------------------

test('S9: SYGNAŁ — brak instantów/sorcery z madness w katalogu; materialize gotowy', () => {
  // Zasada właściciela (2026-08-20): ścieżka czarowa madness jest gotowa i
  // testowana (S1–S4), ale ŻADNA karta katalogu jej dziś nie obsługuje.
  // Ten strażnik czerwienieje przy dodaniu PIERWSZEJ karty instant/sorcery
  // z madness — wtedy: dopisz testy kartowe (batch) i sprawdź, czy karta
  // mieści się w zakresie castMadnessSpell (koszty dodatkowe/variableTargets/X
  // wymagają rozszerzenia — patrz S10).
  const spellMadness = REGISTRY.supported().filter((card) => card.madness
    && (card.types.includes('Instant') || card.types.includes('Sorcery')));
  assert.deepEqual(spellMadness.map((c) => c.id), [],
    'pierwszy instant/sorcery z madness w katalogu: dopisz testy kartowe (ścieżka czarowa gotowa — S1–S4)');
  // Pozytywna kotwica: jedyna karta z madness to permanent (ścieżka
  // castPermanent pozostaje główną drogą katalogu).
  const revolutionist = REGISTRY.get('revolutionist');
  assert.ok(revolutionist?.madness && revolutionist.types.includes('Creature'),
    'revolutionist: permanent z madness (routing po kind nie zmienia jego ścieżki)');
  // Gotowość łańcucha pól (klasa Z5/L21): definicja instantu z madness
  // materializuje się z deskryptorem madness (gałąź spell nie może go gubić).
  const data = gameObjectDataOf({
    id: 'synthetic-madness-instant', name: 'Synthetic Madness Instant',
    types: ['Instant'], colors: ['U'], manaCost: 1,
    spell: { timing: 'instant', targets: [], effects: [] },
    madness: { cost: 1, colors: ['U'] },
    support: { status: 'supported', limitations: [] },
  });
  assert.equal(data.kind, 'spell');
  assert.deepEqual(data.madness, { cost: 1, colors: ['U'] },
    'gałąź spell gameObjectDataOf zachowuje deskryptor madness');
});

// ---- Granice zakresu: jawny sygnał, nie ciche obejście -----------------------

test('S10: czar z kosztem dodatkowym — poza zakresem: brak oferty, jawny reject', () => {
  const state = game();
  putCard(state, 'vr', 'village-rites', 'p1', 'hand', { cost: 1, colors: ['B'] });
  discard(state, 'vr');
  addMana(state, 'p1', 1, { colors: ['B'] });
  assert.ok(!madnessCommands(state).some((c) => c.cast),
    'czar z kosztem dodatkowym (sacrifice a creature) nie dostaje oferty rzutu');
  // Ręczna komenda dostaje CZYTELNY powód (maszynowo rozpoznawalny sygnał
  // zakresu — pierwsza realna karta z madness + additional cost rozszerza
  // castMadnessSpell świadomie).
  const done = execute(state, { type: 'resolve_madness_cast', playerId: 'p1', cast: true, targets: [] });
  assert.ok(!done.ok, 'rzut poza zakresem odrzucony');
  assert.match(done.events[0].reason, /dodatkowy koszt/,
    `powód odrzucenia nazywa granicę zakresu, a był: ${done.events[0].reason}`);
});
