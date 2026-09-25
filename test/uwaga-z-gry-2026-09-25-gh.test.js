// Zgłoszenia z gry 2026-09-25 (G + H).
//
// G (Containment Membrane): tytuł grupy „Aura: … (surge)" pokazywał koszt
// WYDRUKU (2U), choć rzut pobiera surge (U). Naprawa: cardCostHtml z komendą
// (ten sam formater co etykieta oferty M223; H/2 — jedna definicja).
//
// H (rozdzielanie obrażeń): bot z 5/7 atakującym, blokowanym przez 4/3, 1/3,
// 1/2 i 3/2, przydzielał 3 w 4/3 i 2 w 1/3 (zmarnowane — nie lethal), choć
// 2 w 3/2 (albo 1/2) dawało drugie zabójstwo. Naprawa: domyślny plan zabija
// podzbiór o maksymalnej wartości (knapsack po worth = P+T), nie lethal-first
// w kolejności deklaracji; wizard startuje z planu silnika (jedno źródło).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { validateDamageAssignment } from '../src/engine/combat.js';
import { choiceGroupTitle } from '../src/table/render.js';
import { costSymbols, manaCostHtml } from '../src/table/mana-icons.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';

const REGISTRY = createCardRegistry();

/** Sesja jak w produkcie (etykiety czytają z niej stan — M327). */
const sesja = (state) => ({
  nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
  nameOfObject: (id) => state.objects.get(id)?.cardName ?? String(id),
  cardDetails: (id) => REGISTRY.get(id) ?? null,
  state,
  abilitiesOf: (id) => state.objects.get(id)?.abilities ?? REGISTRY.get(id)?.abilities ?? [],
});

function stol() {
  const state = createGameState({ seed: 2509, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  return state;
}

function put(state, id, cardId, controllerId, zone = 'battlefield', extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const d = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: d.kind, power: d.power, toughness: d.toughness, manaCost: d.manaCost,
    spell: d.spell, aura: d.aura, surge: def.surge ?? d.surge ?? null,
    abilities: d.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: d.colors ?? [], ...extra,
  });
  return state.objects.get(id);
}

function atStep(state, step, priorityId, activeId = priorityId) {
  state.turn = { ...jumpToStep(state.turn, step, priorityId), activePlayerId: activeId };
  return state;
}

function stwory(state, id, controllerId, power, toughness) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `c-${id}`, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 2,
    types: ['Creature'], colors: [], abilities: [], subtypes: [], keywords: [],
  });
  const object = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...object, summoningSickness: false }));
}

const alive = (state, id) => state.objects.has(id) && state.objects.get(id).zone === 'battlefield';

// ---------------------------------------------------------------------------
// G — tytuł grupy surge pokazuje koszt WARIANTU
// ---------------------------------------------------------------------------

test('G: Aura za surge — tytuł grupy niesie koszt surge (U), nie wydruku (2U)', () => {
  const state = stol();
  put(state, 'mem', 'containment-membrane', 'p1', 'hand');
  put(state, 'isl1', 'basic-island', 'p1');
  put(state, 'isl2', 'basic-island', 'p1');
  put(state, 'isl3', 'basic-island', 'p1');
  put(state, 'wrog', 'goldmeadow-nomad', 'p2');
  // Surge aktywny: inny czar rzucony w tej turze (warunek z game-state.js).
  state.spellsCastThisTurnByPlayer = { p1: 1, p2: 0 };
  addMana(state, 'p1', 5);
  const view = playerView(state, 'p1');
  const oferty = view.legalCommands.filter((c) => c.type === 'cast_permanent' && c.objectId === 'mem');
  assert.ok(oferty.some((c) => c.surgeCast), 'oferta surge istnieje');
  assert.ok(oferty.some((c) => !c.surgeCast), 'oferta zwykła istnieje (kontrola)');
  const surge = oferty.filter((c) => c.surgeCast);
  const zwykla = oferty.filter((c) => !c.surgeCast);
  const tytulSurge = choiceGroupTitle({ options: surge }, sesja(state), view);
  const tytulZwykly = choiceGroupTitle({ options: zwykla }, sesja(state), view);
  const kosztSurge = manaCostHtml(costSymbols(1, ['U']));
  const kosztWydruk = manaCostHtml(MANA_COSTS['containment-membrane']);
  assert.ok(tytulSurge.includes('(surge)'), `znacznik wariantu: ${tytulSurge}`);
  assert.ok(tytulSurge.includes(`(koszt ${kosztSurge})`),
    `tytuł surge z kosztem U: ${tytulSurge}`);
  assert.ok(!tytulSurge.includes(kosztWydruk),
    `tytuł surge BEZ kosztu wydruku: ${tytulSurge}`);
  assert.ok(tytulZwykly.includes(`(koszt ${kosztWydruk})`),
    `tytuł zwykły ze swoim kosztem (kontrola): ${tytulZwykly}`);
});

// ---------------------------------------------------------------------------
// H — domyślny przydział maksymalizuje wartość zabójstw
// ---------------------------------------------------------------------------

test('H: 5/7 w 4/3 + 1/3 + 1/2 + 3/2 — plan zabija 4/3 i 3/2 (dwa zabójstwa)', () => {
  const state = createGameState({ seed: 2509, players: [{ id: 'p1' }, { id: 'p2' }] });
  atStep(state, 'declare_attackers', 'p2');
  stwory(state, 'a', 'p2', 5, 7);
  stwory(state, 'b43', 'p1', 4, 3);
  stwory(state, 'b13', 'p1', 1, 3);
  stwory(state, 'b12', 'p1', 1, 2);
  stwory(state, 'b32', 'p1', 3, 2);
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['a'] }).ok);
  atStep(state, 'declare_blockers', 'p1', 'p2');
  assert.ok(execute(state, {
    type: 'declare_blockers', playerId: 'p1', assignments: { a: ['b43', 'b13', 'b12', 'b32'] },
  }).ok);
  atStep(state, 'combat_damage', 'p2');
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' }).ok);
  assert.ok(state.pendingDamageAssignment, 'decyzja przydziału wisi');
  const oferta = playerView(state, 'p2').legalCommands
    .find((cmd) => cmd.type === 'resolve_damage_assignment').assignments;
  // Worth: 4/3 (7) + 3/2 (5) = 12 — najlepszy podzbiór za 5 mocy (3 + 2).
  // Przed zmianą: [{b43:3},{b13:2},…] — 2 obrażenia marnowały się w 1/3.
  assert.deepEqual(oferta.a, [
    { blockerId: 'b43', amount: 3 },
    { blockerId: 'b13', amount: 0 },
    { blockerId: 'b12', amount: 0 },
    { blockerId: 'b32', amount: 2 },
  ], `plan domyślny (bot): ${JSON.stringify(oferta.a)}`);
  assert.equal(oferta.a.reduce((s, e) => s + e.amount, 0), 5, 'pełna suma (CR 510.1a)');
  assert.equal(validateDamageAssignment(state, 'a', oferta.a), null, 'plan legalny');
  assert.ok(execute(state, {
    type: 'resolve_damage_assignment', playerId: 'p2', assignments: oferta,
  }).ok, 'plan domyślny przechodzi przez execute');
  assert.ok(!alive(state, 'b43') && !alive(state, 'b32'), 'DWA zabite: 4/3 i 3/2');
  assert.ok(alive(state, 'b13') && alive(state, 'b12'), 'reszta przeżywa bez obrażeń');
});

test('H/remis: 5 mocy w 5/5 + 1/1 — ginie CENNIEJSZY (wartość > liczba)', () => {
  const state = createGameState({ seed: 2510, players: [{ id: 'p1' }, { id: 'p2' }] });
  atStep(state, 'declare_attackers', 'p2');
  stwory(state, 'a', 'p2', 5, 5);
  stwory(state, 'big', 'p1', 5, 5);
  stwory(state, 'small', 'p1', 1, 1);
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['a'] }).ok);
  atStep(state, 'declare_blockers', 'p1', 'p2');
  assert.ok(execute(state, {
    type: 'declare_blockers', playerId: 'p1', assignments: { a: ['small', 'big'] },
  }).ok, 'celowo odwrotna kolejność deklaracji — wartość bije kolejność');
  atStep(state, 'combat_damage', 'p2');
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' }).ok);
  const oferta = playerView(state, 'p2').legalCommands
    .find((cmd) => cmd.type === 'resolve_damage_assignment').assignments;
  // Worth 5/5 (10) > 1/1 (2) — jedno zabójstwo, ale cenniejsze (po 5/5 reszty
  // brak, więc 1/1 dostaje 0). Liczba zabójstw remisuje (1:1).
  assert.deepEqual(oferta.a, [
    { blockerId: 'small', amount: 0 },
    { blockerId: 'big', amount: 5 },
  ], `plan domyślny (bot): ${JSON.stringify(oferta.a)}`);
  assert.ok(execute(state, {
    type: 'resolve_damage_assignment', playerId: 'p2', assignments: oferta,
  }).ok, 'plan domyślny przechodzi przez execute');
  assert.ok(!alive(state, 'big') && alive(state, 'small'), 'ginie 5/5, 1/1 cały');
});

test('H/trample: za mało mocy na lethal — CAŁOŚĆ w blokera (nie na gracza, M101/B6)', () => {
  // Regresja znaleziona grzechotką remisów (tarkir-bg|warhammer-ubr): duch 1/1
  // z trample, blokowany przez 4/6. Need 6 > moc 1: żaden lethal nieosiągalny,
  // więc cała moc idzie w blokera (suma = moc — walidator nie wymaga wtedy
  // lethal, a reszta „na gracza" byłaby nielegalna: trample_blocker_below_lethal).
  const state = createGameState({ seed: 2511, players: [{ id: 'p1' }, { id: 'p2' }] });
  atStep(state, 'declare_attackers', 'p2');
  stwory(state, 'a', 'p2', 1, 1);
  stwory(state, 'b', 'p1', 4, 6);
  const a = state.objects.get('a');
  state.objects.set('a', Object.freeze({ ...a, keywords: ['trample'] }));
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['a'] }).ok);
  atStep(state, 'declare_blockers', 'p1', 'p2');
  assert.ok(execute(state, {
    type: 'declare_blockers', playerId: 'p1', assignments: { a: ['b'] },
  }).ok);
  atStep(state, 'combat_damage', 'p2');
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' }).ok);
  // Jeden bloker + trample = decyzja atakującego (CR 510.1c/d: ile na gracza).
  if (!state.pendingDamageAssignment) return; // silnik nie pyta — brak regresji do pinowania
  const oferta = playerView(state, 'p2').legalCommands
    .find((cmd) => cmd.type === 'resolve_damage_assignment').assignments;
  assert.deepEqual(oferta.a, [{ blockerId: 'b', amount: 1 }],
    `cała moc w blokera: ${JSON.stringify(oferta.a)}`);
  assert.equal(validateDamageAssignment(state, 'a', oferta.a), null, 'plan legalny');
  assert.ok(execute(state, {
    type: 'resolve_damage_assignment', playerId: 'p2', assignments: oferta,
  }).ok, 'plan domyślny przechodzi przez execute');
});
