// Audyt PR #150 (2026-10-02) — znaleziska F1 i F3:
//  F1: Fiery Justice (`spell.divided`) NIE miała oferty w oknach rzutu spoza
//      ręki (grób/Halo Forager, Epic Experiment, ręka/Baral) — `epicCastOffers`
//      milczał, więc karta była niegrywalna w tych oknach mimo `supported`
//      (ADR 0022 §4: znaleziona odchyłka = błąd do naprawy u źródła).
//  F3: próg „mana wydana na rzucenie czaru" (Opus, Tackle Artist) liczył
//      również {X} zapłacone ZDOLNOŚCI, która rzut zleca (Halo Forager) —
//      a to nie jest koszt czaru (CR 601.2f); Oracle daje wtedy 1 licznik.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const registry = createCardRegistry();

function game() {
  const state = createGameState({ seed: 150, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  return state;
}

function put(state, id, cardId, playerId = 'p1', zone = 'hand', patch = {}) {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

// Domyślnie pyta gracza z priorytetem (jak helper batch62): stos rozstrzygają
// OBIE strony, więc settle nie może utknąć na pierwszym pasie.
const commands = (s, p = s.turn.priorityPlayerId) => playerView(s, p).legalCommands;
const find = (s, cardId, zone) => [...s.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);
const p1 = (s) => s.players.find((p) => p.id === 'p1');
const p2 = (s) => s.players.find((p) => p.id === 'p2');

function run(s, cmd) {
  assert.ok(cmd, 'komenda istnieje');
  const r = execute(s, cmd);
  assert.ok(r.ok, `${cmd.type} odrzucone: ${r.reason ?? ''}`);
  return r;
}

/** Rozstrzyga stos do końca (jak helper batch62). */
function settle(s, max = 60) {
  for (let i = 0; i < max; i++) {
    const idle = s.zones.stack.length === 0 && s.pendingTriggerTargets.length === 0
      && !(s.pendingExploits?.length);
    const choices = commands(s);
    if (idle && !choices.some((c) => c.type.startsWith('resolve_'))) return;
    const pick = choices.find((c) => c.type === 'pass_priority' && s.zones.stack.length)
      ?? choices.find((c) => c.type.startsWith('resolve_'))
      ?? choices.find((c) => c.type === 'pass_priority');
    if (!pick) return;
    run(s, pick);
  }
}

// ---------------------------------------------------------------------------
// F1: oferty podziału w oknach rzutu spoza ręki
// ---------------------------------------------------------------------------

test('F1/grób: Fiery Justice w oknie Halo Foragera niesie podział i rzuca się porcjami', () => {
  const s = game();
  put(s, 'fj', 'fiery-justice', 'p1', 'graveyard');
  put(s, 'c1', 'oreplate-pangolin', 'p2', 'battlefield'); // 2/2 — porcja 2 zabija
  addMana(s, 'p1', 4, { colors: ['R', 'G', 'W'] });
  s.pendingGraveFreeCast = { playerId: 'p1', sourceCardId: 'halo-forager', restorePriorityTo: 'p1' };
  const offers = commands(s, 'p1').filter((c) => c.type === 'resolve_grave_free_cast' && !c.decline);
  assert.ok(offers.length > 0, 'oferta rzutu istnieje (PRZED: 0 ofert — karta niegrywalna)');
  assert.ok(offers.every((c) => Array.isArray(c.damageDivision) && c.damageDivision.length >= 1),
    'każdy wariant niesie podział (L48: oferta = walidacja)');
  assert.ok(offers.every((c) => c.xValue === 3), 'X = mana value karty (3, pilnowane przez bramkę)');
  const pick = offers.find((c) => c.targets?.length === 1 && c.targets[0] === 'p2'
    && c.damageDivision.some((e) => e.id === 'c1' && e.amount === 2)
    && c.damageDivision.some((e) => e.id === 'p2' && e.amount === 3));
  assert.ok(pick, 'wariant 2 na stwora + 3 na gracza jest w ofercie');
  run(s, pick);
  settle(s);
  assert.equal(find(s, 'oreplate-pangolin', 'battlefield'), undefined, 'porcja 2 zabija 2/2');
  assert.equal(find(s, 'oreplate-pangolin', 'graveyard')?.cardId, 'oreplate-pangolin');
  assert.equal(p2(s).life, 22, '5 obrażeń i +5 życia z jednego rozstrzygnięcia (20 − 3 + 5)');
});

test('F1/Epic Experiment: wygnana Fiery Justice oferowana z podziałem i rozstrzyga się', () => {
  const s = game();
  put(s, 'fj', 'fiery-justice', 'p1', 'exile');
  put(s, 'c1', 'oreplate-pangolin', 'p2', 'battlefield');
  s.pendingEpicExperiment = {
    playerId: 'p1', sourceCardId: 'epic-experiment', exileIds: ['fj'], maxMV: 5, restorePriorityTo: 'p1',
  };
  const offers = commands(s, 'p1').filter((c) => c.type === 'resolve_epic_choice' && !c.done && c.cardId === 'fj');
  assert.ok(offers.length > 0, 'wygnany czar ma ofertę (PRZED: 0 — pomijany mimo MV ≤ X)');
  assert.ok(offers.every((c) => Array.isArray(c.damageDivision)), 'warianty niosą podział');
  const pick = offers.find((c) => c.targets?.[0] === 'p2'
    && c.damageDivision.length === 1 && c.damageDivision[0].id === 'c1' && c.damageDivision[0].amount === 5);
  assert.ok(pick, 'podział 5 na stwora jest w ofercie');
  run(s, pick);
  settle(s);
  assert.equal(find(s, 'oreplate-pangolin', 'battlefield'), undefined, '5 obrażeń zabija 2/2');
  assert.equal(p2(s).life, 25, 'przeciwnik zyskuje 5 życia (karta rzucona bez kosztu many)');
});

test('F1/ręka (Baral): darmowy rzut z ręki też niesie podział', () => {
  const s = game();
  put(s, 'fj', 'fiery-justice', 'p1', 'hand');
  put(s, 'c1', 'oreplate-pangolin', 'p2', 'battlefield');
  s.pendingHandFreeCast = {
    playerId: 'p1', sourceId: 'baral', sourceCardId: 'baral-and-kari-zev',
    cardTypes: ['Sorcery'], maxManaValue: 4, elseEffect: null, restorePriorityTo: 'p1',
  };
  const offers = commands(s, 'p1').filter((c) => c.type === 'resolve_hand_free_cast' && c.objectId === 'fj');
  assert.ok(offers.length > 0, 'oferta z ręki istnieje (PRZED: 0)');
  assert.ok(offers.every((c) => Array.isArray(c.damageDivision)), 'warianty niosą podział');
  const pick = offers.find((c) => c.damageDivision.some((e) => e.id === 'p2' && e.amount === 5));
  assert.ok(pick, 'podział 5 na gracza jest w ofercie');
  run(s, pick);
  settle(s);
  assert.equal(p2(s).life, 20, 'cele pokrywają się: +5 życia i 5 obrażeń znoszą się (ruling 2017-03-14)');
});

test('F1/negatywny: komenda bez podziału odrzucona bez utraty karty i many', () => {
  const s = game();
  put(s, 'fj', 'fiery-justice', 'p1', 'graveyard');
  put(s, 'c1', 'oreplate-pangolin', 'p2', 'battlefield');
  addMana(s, 'p1', 4, { colors: ['R', 'G', 'W'] });
  s.pendingGraveFreeCast = { playerId: 'p1', sourceCardId: 'halo-forager', restorePriorityTo: 'p1' };
  const offer = commands(s, 'p1').find((c) => c.type === 'resolve_grave_free_cast' && !c.decline);
  assert.ok(offer);
  const before = p1(s).mana;
  const bad = { ...offer };
  delete bad.damageDivision;
  const r = execute(s, bad);
  assert.equal(r.ok, false, 'brak podziału = jawny reject (nie cichy rzut bez porcji)');
  assert.equal(s.objects.get('fj')?.zone, 'graveyard', 'karta została w grobie');
  assert.equal(p1(s).mana, before, 'mana nie została wydana (walidacja przed mutacją)');
});

// ---------------------------------------------------------------------------
// F3: {X} Halo Foragera nie jest „maną wydaną na rzucenie czaru"
// ---------------------------------------------------------------------------

test('F3: Opus liczy 1 licznik, gdy czar rzucono bez kosztu (X zapłacono zdolności)', () => {
  const s = game();
  put(s, 'artist', 'tackle-artist', 'p1', 'battlefield');
  put(s, 'rage', 'sarkhans-rage', 'p1', 'graveyard'); // MV 5 — próg „five or more"
  addMana(s, 'p1', 5, { colors: ['R'] });
  s.pendingGraveFreeCast = { playerId: 'p1', sourceCardId: 'halo-forager', restorePriorityTo: 'p1' };
  const offer = commands(s, 'p1').find((c) => c.type === 'resolve_grave_free_cast' && c.objectId === 'rage'
    && c.targets?.[0] === 'p2');
  assert.ok(offer, 'oferta darmowego rzutu istnieje');
  run(s, offer);
  const cast = s.events.filter((e) => e.type === 'spell_cast').at(-1);
  assert.equal(cast?.manaSpent, 0, 'zdarzenie niesie 0 many wydanej NA CZAR (X to koszt zdolności)');
  settle(s);
  assert.equal(s.objects.get('artist')?.counters?.['+1/+1'] ?? 0, 1,
    'poniżej progu five-or-more = jeden licznik (PRZED: 2 po naliczeniu {X})');
});
