// M387 (F-2 audytu PR #126, L41/L48): LEGALNOŚĆ BLOKU — warstwa ZBIORU ma jedno
// źródło prawdy. Audyt PR #126 wykazał, że M380 sprowadził do jednego predykatu
// (`blockRestrictionError`) wyłącznie restrykcje PAROWE, a reguły zbioru
// (menace, „can't block alone", własne zakazy blokowania blokera) nadal żyły
// w DWÓCH równoległych kopiach: walidacja `declareBlockers` i oferta
// `legalBlockerOptions`. To ta sama klasa ryzyka, która dała defekt M380
// (oferta bez pary, walidacja ją przyjmowała) — więc warstwa zbioru dostała
// wspólny predykat `blockAssignmentViolation`, wołany przez OBA wejścia.
//
// Źródła online (dostęp 2026-09-18):
//  • CR 509.1 (https://media.wizards.com/2026/downloads/MagicCompRules%2020260819.txt,
//    efektywne 2026-08-07): „To declare blockers, the defending player follows
//    the steps below, in order. If at any point during the declaration of
//    blockers, the defending player is unable to comply with any of the steps
//    listed below, the declaration is illegal; the game returns to the moment
//    before the declaration."
//  • CR 509.1b: „The defending player checks each creature they control to see
//    whether it's affected by any restrictions … If any restrictions are being
//    disobeyed, the declaration of blockers is illegal."
//  • CR 509.1c: „The defending player checks each creature they control to see
//    whether it's affected by any requirements (effects that say a creature
//    must block, or that it must block if some condition is met). If the number
//    of requirements … the declaration is illegal."
//  • CR 702.111b (menace): „A creature with menace can't be blocked except by
//    two or more creatures."
//  • Oracle Ember Beast (GTC): „This creature can't attack or block alone."
//    (deskryptor `cantBlockAlone` — CR 509.1c: wymóg partnera przy TYM SAMYM
//    atakującym).
//
// Piny: (A) „can't block alone" — samotny bloker nie jest oferowany i komenda
// jest odrzucana, z partnerem oba są oferowane i przyjmowane, (B) menace —
// pojedynczy bloker nie jest oferowany i jest odrzucany, dwóch jest OK,
// (C) zakaz blokowania blokera (`cantBlock` wydrukowany/efekt) — nie w ofercie
// i odrzucony, (D) strażnik rodziny: oba wejścia (walidacja i oferta) wołają
// TEN SAM predykat, a ręczne kopie reguł zbioru nie wróciły do kodu,
// (E) macierz spójności: KAŻDE oferowane przypisanie jest przyjmowane przez
// `declare_blockers` (L48 — oferta nie może publikować komendy, która padnie).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { legalBlockerOptions } from '../src/engine/combat.js';

const REGISTRY = createCardRegistry();

/** Stan tuż przed deklaracją bloków: p1 atakuje, p2 blokuje. */
function combatState() {
  const state = createGameState({ seed: 387, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 9;
  state.pendingMulligans = [];
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 10; i += 1) {
      const id = `lib-${pid}-${i}`;
      const land = REGISTRY.get('basic-forest');
      addObject(state, {
        id, instanceId: `i-${id}`, cardId: 'basic-forest', controllerId: pid, ownerId: pid,
        zone: 'library', types: land.types ?? [], keywords: [], subtypes: land.subtypes ?? [],
        ...gameObjectDataOf(land),
      });
    }
  }
  return state;
}

function putCreature(state, id, cardId, controllerId, patch = {}) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    types: card.types ?? [], keywords: card.keywords ?? [], subtypes: card.subtypes ?? [],
    cardName: card.name, ...gameObjectDataOf(card),
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...patch }));
  return state.objects.get(id);
}

function enterBlockStep(state, attackerIds) {
  const declared = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds });
  assert.ok(declared.ok, `deklaracja atakujących: ${declared.reason ?? ''}`);
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p2');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  return state;
}

const assignmentsOf = (state) => playerView(state, 'p2').legalCommands
  .filter((c) => c.type === 'declare_blockers')
  .map((c) => c.assignments);

const offered = (state, assignments) => assignmentsOf(state)
  .some((candidate) => JSON.stringify(candidate) === JSON.stringify(assignments));

/** Wynik komendy bloku na KLONIE stanu (nie psuje stanu bazowego). */
function verdict(baseState, assignments) {
  const clone = structuredClone(baseState);
  const result = execute(clone, { type: 'declare_blockers', playerId: 'p2', assignments });
  return { ok: result.ok, reason: result.reason ?? result.events?.[0]?.reason ?? null };
}

test('M387/A: „can\'t block alone" — samotny bloker nie w ofercie i odrzucony, z partnerem OK', () => {
  const state2 = combatState();
  putCreature(state2, 'beast', 'ember-beast', 'p2');  // 3/4, cantBlockAlone
  putCreature(state2, 'friend', 'highland-game', 'p2');
  putCreature(state2, 'atk', 'highland-game', 'p1');
  enterBlockStep(state2, ['atk']);

  assert.equal(offered(state2, { atk: ['beast'] }), false,
    'CR 509.1c: samotny bloker z „can\'t block alone" nie może być w ofercie');
  const alone = verdict(state2, { atk: ['beast'] });
  assert.equal(alone.ok, false, 'komenda z samotnym blokerem musi zostać odrzucona');
  assert.match(String(alone.reason), /block/, `odrzucenie po stronie bloków: ${alone.reason}`);

  assert.equal(offered(state2, { atk: ['beast', 'friend'] }), true,
    'bloker z partnerem przy TYM SAMYM atakującym jest oferowany');
  assert.equal(verdict(state2, { atk: ['beast', 'friend'] }).ok, true, 'para blokerów jest przyjmowana');
  assert.equal(offered(state2, { atk: ['friend'] }), true, 'zwykły pojedynczy bloker nadal działa');
});

test('M387/B: menace — pojedynczy bloker nie w ofercie i odrzucony, dwóch OK', () => {
  const state = combatState();
  putCreature(state, 'menacer', 'dire-fleet-ravager', 'p1');  // menace + deathtouch
  putCreature(state, 'b1', 'highland-game', 'p2');
  putCreature(state, 'b2', 'highland-game', 'p2');
  enterBlockStep(state, ['menacer']);

  assert.equal(offered(state, { menacer: ['b1'] }), false,
    'CR 702.111b: pojedynczy bloker nie jest oferowany na atakującego z menace');
  const single = verdict(state, { menacer: ['b1'] });
  assert.equal(single.ok, false, 'komenda z pojedynczym blokerem musi zostać odrzucona');
  assert.match(String(single.reason), /menace|dwóch/i, `odrzucenie po stronie bloków: ${single.reason}`);

  assert.equal(offered(state, { menacer: ['b1', 'b2'] }), true, 'dwóch blokerów jest oferowanych');
  assert.equal(verdict(state, { menacer: ['b1', 'b2'] }).ok, true, 'dwóch blokerów jest przyjmowanych');
  // Pusty blok (0 blokerów) jest legalny — menace mówi „0 albo ≥2" (CR 702.111b).
  assert.equal(offered(state, {}), true, 'brak bloków musi zostać w ofercie');
  assert.equal(verdict(state, {}).ok, true, 'brak bloków jest legalny');
});

test('M387/C: zakaz blokowania blokera („can\'t block") — nie w ofercie i odrzucony', () => {
  const state = combatState();
  putCreature(state, 'atk', 'highland-game', 'p1');
  putCreature(state, 'stopped', 'highland-game', 'p2', { cantBlock: true });
  putCreature(state, 'free', 'highland-game', 'p2');
  enterBlockStep(state, ['atk']);

  assert.equal(offered(state, { atk: ['stopped'] }), false, 'zablokowany stwór nie jest oferowany');
  const result = verdict(state, { atk: ['stopped'] });
  assert.equal(result.ok, false, 'komenda z zablokowanym stworem musi zostać odrzucona');
  assert.match(String(result.reason), /block|Nielegalny/i, `powód odrzucenia: ${result.reason}`);
  assert.equal(offered(state, { atk: ['free'] }), true, 'wolny bloker nadal w ofercie');
});

test('M387/D: strażnik rodziny — walidacja i oferta wołają TEN SAM predykat (L41/L48)', () => {
  const source = readFileSync(new URL('../src/engine/combat.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const calls = [...source.matchAll(/blockAssignmentViolation\(/g)].length;
  assert.ok(calls >= 3, `predykat musi być wołany przez walidację, filtr oferty i fallback (jest ${calls} wywołań)`);
  assert.ok(!/function satisfiesMenace/.test(source),
    'ręczna kopia reguły menace wróciła do kodu (ma być w blockAssignmentViolation)');
  // Zakazy zbioru nie mogą wrócić jako inline w declareBlockers.
  const start = source.indexOf('export function declareBlockers');
  const body = source.slice(start, source.indexOf('export function ', start + 10));
  assert.ok(!/hasAloneRestriction\(/.test(body),
    'declareBlockers znów liczy „can\'t block alone" inline — ma wołać blockAssignmentViolation');
  assert.ok(!/hasKeyword\(state, attacker, 'menace'\)/.test(body),
    'declareBlockers znów liczy menace inline — ma wołać blockAssignmentViolation');
});

test('M387/E: macierz spójności — każde OFEROWANE przypisanie jest przyjmowane (L48)', () => {
  const state = combatState();
  putCreature(state, 'menacer', 'dire-fleet-ravager', 'p1');
  putCreature(state, 'plain', 'highland-game', 'p1');
  putCreature(state, 'beast', 'ember-beast', 'p2');
  putCreature(state, 'b1', 'highland-game', 'p2');
  putCreature(state, 'b2', 'marut', 'p2', { power: 6, toughness: 6 });
  putCreature(state, 'stopped', 'highland-game', 'p2', { cantBlock: true });
  enterBlockStep(state, ['menacer', 'plain']);

  // Puła ofert: enumeracja (cap) + fallback + warianty „wszystkie minus jeden".
  const offers = legalBlockerOptions(state, 'p2');
  assert.ok(offers.length > 1, 'oferta bloków pusta — scena pinu jest bez sensu');
  const rejected = [];
  for (const assignment of offers) {
    const result = verdict(state, assignment);
    if (!result.ok) rejected.push({ assignment, reason: result.reason });
  }
  assert.deepEqual(rejected, [],
    `oferta publikuje przypisania, które walidacja odrzuca (L48): ${JSON.stringify(rejected)}`);
  // I kontrola w drugą stronę dla reguł zbioru: oferta NIE zawiera nielegalnych
  // singletonów (menace/cantBlockAlone/cantBlock).
  const offeredPairs = offers.map((a) => JSON.stringify(a));
  assert.ok(!offeredPairs.includes(JSON.stringify({ menacer: ['b1'] })), 'singleton na menace w ofercie');
  assert.ok(!offeredPairs.includes(JSON.stringify({ plain: ['beast'] })), 'samotny Ember Beast w ofercie');
  assert.ok(!offeredPairs.includes(JSON.stringify({ plain: ['stopped'] })), 'zablokowany stwór w ofercie');
});
