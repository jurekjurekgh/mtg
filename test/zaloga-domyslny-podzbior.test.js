// A2/A3/A4 (znaleziska właściciela 2026-09-12, Balamb Garden + Bomat/Irontread).
//
// A2: klik dawał modal z listą WSZYSTKICH kombinacji podzbiorów (enumeracja
//     w silniku) zamiast wyboru ptaszkiem.
// A3: przy >6 stworach cap ucinał enumerację do pierwszego wariantu — silnik
//     „sam dobierał załogę" („tapnij Wizard (0 power), Hero"), a zachłanny
//     default tapował bezużyteczne stwory o mocy 0.
// A4: po rozstrzygniętym crew brak badge'a „obsadzony" (pole widoku
//     animatedUntilEOT istniało od M230, ale nic go nie czytało).
//
// CR 702.122a (Crew; CR efektywny 2026-08-07, pobrane 2026-09-12):
//   "Crew N" means "Tap any number of other untapped creatures you control
//   with total power N or greater: This permanent becomes an artifact
//   creature until end of turn."
// CR 702.171a (Saddle):
//   "Saddle N" means "Tap any number of other untapped creatures you control
//   with total power N or greater: This permanent becomes saddled until end
//   of turn. Activate only as a sorcery."
// CR 702.122e: "Whenever [this Vehicle] becomes crewed" means "Whenever
//   a crew ability of [this Vehicle] resolves."
// (Poprzedni numer „CR 701.36" w komentarzach był błędny — ADR 0030.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { animatePermanentUntilEndOfTurn, clearStatModifiers } from '../src/engine/permanents.js';
import { moveObjectDirectly } from '../src/engine/objects.js';

const REGISTRY = createCardRegistry();

function game(seed = 7001) {
  return createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
}
function mainPhase(state, playerId = 'p1') {
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}
function addRealCard(state, id, cardId, playerId, zone, extra = {}) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  return addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...data, ...extra,
  });
}
function addCreature(state, id, ctrl, power, toughness, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId: ctrl, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], ...extra,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}
function resolveStack(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 300) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const pick = view.legalCommands.find((c) => c.type.startsWith('resolve_'))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!pick || !execute(state, pick).ok) return false;
  }
  state.turn.priorityPlayerId = state.turn.activePlayerId;
  return state.zones.stack.length === 0;
}
function crewOffers(state, playerId, objectId) {
  return playerView(state, playerId).legalCommands.filter((c) => c.type === 'activate_ability'
    && c.objectId === objectId && Array.isArray(c.crewCreatureIds));
}

test('E2/1: Irontread Crusher (Crew 3) — JEDNA oferta, default najsłabszy minimalny', () => {
  const state = mainPhase(game());
  addRealCard(state, 'crusher', 'irontread-crusher', 'p1', 'battlefield');
  addCreature(state, 'c1', 'p1', 1, 1);
  addCreature(state, 'c2', 'p1', 2, 2);
  addCreature(state, 'c3', 'p1', 5, 5);
  const offers = crewOffers(state, 'p1', 'crusher');
  assert.equal(offers.length, 1, `ofert crew: ${offers.length}, oczekiwano 1 (A2)`);
  assert.deepEqual(offers[0].crewCreatureIds, ['c1', 'c2'], 'default = 1+2 (chaff, nie bomba 5/5)');
});

test('E2/2 (A3): Balamb (Crew 1) — stwór o mocy 0 NIE wchodzi do defaultu', () => {
  const state = mainPhase(game());
  addRealCard(state, 'balamb', 'balamb-garden-airborne', 'p1', 'battlefield');
  addCreature(state, 'wizard', 'p1', 0, 2); // „Wizard (0 power)" ze zgłoszenia
  addCreature(state, 'hero', 'p1', 2, 2);
  const offers = crewOffers(state, 'p1', 'balamb');
  assert.equal(offers.length, 1);
  assert.deepEqual(offers[0].crewCreatureIds, ['hero'], 'zero mocy = tap za nic, pomijamy');
});

test('E2/3: choroba przywołania NIE wyklucza z załogi (CR 302.6: tapanie cudzym kosztem)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'crusher', 'irontread-crusher', 'p1', 'battlefield');
  addCreature(state, 'sick', 'p1', 3, 3);
  state.objects.set('sick', Object.freeze({ ...state.objects.get('sick'), summoningSickness: true }));
  const offers = crewOffers(state, 'p1', 'crusher');
  assert.equal(offers.length, 1, 'chory stwór tapuje kosztem crew');
  assert.deepEqual(offers[0].crewCreatureIds, ['sick']);
  assert.ok(execute(state, offers[0]).ok, 'aktywacja z chorym w załodze legalna');
});

test('E2/4 (A3): 7 stworów — nadal JEDNA oferta (koniec auto-picku przez cap)', () => {
  const state = mainPhase(game(7004));
  addRealCard(state, 'crusher', 'irontread-crusher', 'p1', 'battlefield');
  for (let i = 0; i < 7; i += 1) addCreature(state, `c${i}`, 'p1', 1, 1);
  const offers = crewOffers(state, 'p1', 'crusher');
  assert.equal(offers.length, 1, `ofert przy 7 stworach: ${offers.length}`);
  assert.equal(offers[0].crewCreatureIds.length, 3, 'default minimalny (3× 1/1 na Crew 3)');
});

test('E2/5: za mało mocy — brak oferty crew', () => {
  const state = mainPhase(game());
  addRealCard(state, 'crusher', 'irontread-crusher', 'p1', 'battlefield');
  addCreature(state, 'c1', 'p1', 1, 1);
  addCreature(state, 'c2', 'p1', 1, 1);
  assert.equal(crewOffers(state, 'p1', 'crusher').length, 0, '1+1 < 3: cisza');
});

test('E2/6: default deterministyczny (ADR 0005) — dwa przebiegi, ten sam zbiór', () => {
  const build = (seed) => {
    const state = mainPhase(game(seed));
    addRealCard(state, 'crusher', 'irontread-crusher', 'p1', 'battlefield');
    addCreature(state, 'a', 'p1', 2, 2);
    addCreature(state, 'b', 'p1', 2, 2);
    addCreature(state, 'c', 'p1', 2, 2);
    return crewOffers(state, 'p1', 'crusher')[0]?.crewCreatureIds;
  };
  assert.deepEqual(build(7006), build(7006));
  assert.deepEqual(build(7006), ['a', 'b'], 'remis mocy = kolejność pola bitwy');
});

test('E2/7 (CR 702.122a „other"): obsadzony pojazd nie tapuje SAM SIEBIE', () => {
  const state = mainPhase(game());
  addRealCard(state, 'crusher', 'irontread-crusher', 'p1', 'battlefield');
  addCreature(state, 'c1', 'p1', 2, 2);
  addCreature(state, 'c2', 'p1', 2, 2);
  addCreature(state, 'c3', 'p1', 3, 3);
  const first = crewOffers(state, 'p1', 'crusher')[0];
  assert.deepEqual(first.crewCreatureIds, ['c1', 'c2']);
  assert.ok(execute(state, first).ok);
  assert.ok(resolveStack(state), 'stos pusty po crew');
  const animated = state.objects.get('crusher');
  assert.equal(animated.kind, 'creature', 'pojazd jest stworem po crew');
  // Druga aktywacja (re-crew): źródło-stwór nie może wejść do własnej załogi.
  const again = crewOffers(state, 'p1', 'crusher')[0];
  assert.ok(again, 're-crew w ofercie (legalny, choć bez sensu)');
  assert.deepEqual(again.crewCreatureIds, ['c3'], 'default = nietapnięty c3, nie źródło');
  const illegal = execute(state, { ...again, crewCreatureIds: ['crusher'] });
  assert.equal(illegal.ok, false, 'walidacja odrzuca własne źródło w załodze');
});

test('E2/8: walidacja przyjmuje dowolny legalny podzbiór (ścieżka kreatora UI)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'crusher', 'irontread-crusher', 'p1', 'battlefield');
  addCreature(state, 'c1', 'p1', 1, 1);
  addCreature(state, 'c2', 'p1', 2, 2);
  addCreature(state, 'c3', 'p1', 5, 5);
  const offer = crewOffers(state, 'p1', 'crusher')[0];
  assert.deepEqual(offer.crewCreatureIds, ['c1', 'c2']);
  // Gracz w kreatorze wybiera inaczej (sama bomba) — silnik ma przyjąć.
  const custom = execute(state, { ...offer, crewCreatureIds: ['c3'] });
  assert.ok(custom.ok, `nie-defaultowy legalny wybór odrzucony: ${custom.reason ?? ''}`);
  assert.ok(resolveStack(state));
  assert.equal(state.objects.get('c3').tapped, true, 'tapnięty wybrany, nie default');
  assert.equal(state.objects.get('c1').tapped, false);
});

test('E2/9: Saddle — jedna oferta z domyślnym minimalnym (Trained Arynx, Saddle 2)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'ax', 'trained-arynx', 'p1', 'battlefield');
  addCreature(state, 's1', 'p1', 2, 2);
  addCreature(state, 's2', 'p1', 3, 3);
  const offers = crewOffers(state, 'p1', 'ax');
  assert.equal(offers.length, 1, `ofert saddle: ${offers.length}`);
  assert.deepEqual(offers[0].crewCreatureIds, ['s1'], 'default = sam 2/2');
  assert.ok(execute(state, offers[0]).ok);
  assert.ok(resolveStack(state));
  assert.equal(state.objects.get('ax').saddled, true);
});

test('A4/1: rozstrzygnięte crew stawia znacznik + animuje (CR 702.122e)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'barge', 'bomat-bazaar-barge', 'p1', 'battlefield');
  addCreature(state, 'c1', 'p1', 2, 2);
  addCreature(state, 'c2', 'p1', 2, 2);
  const offer = crewOffers(state, 'p1', 'barge')[0];
  assert.ok(offer && execute(state, offer).ok);
  assert.equal(state.objects.get('barge').crewed ?? false, false, 'przed rozstrzygnięciem brak znacznika');
  assert.ok(resolveStack(state));
  const vehicle = state.objects.get('barge');
  assert.equal(vehicle.crewed, true, 'po rozstrzygnięciu crew: obsadzony');
  assert.equal(vehicle.kind, 'creature');
  assert.ok((vehicle.types ?? []).includes('Creature'), `typy: ${(vehicle.types ?? []).join(',')}`);
  assert.ok((vehicle.types ?? []).includes('Artifact'), 'artefaktowość zostaje');
  const entry = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'barge');
  assert.equal(entry.crewed, true, 'widok niesie znacznik (ADR 0017)');
  assert.ok((entry.types ?? []).includes('Creature'), 'widok niesie żywą linię typów');
});

test('A4/2: cleanup gasi znacznik razem z animacją', () => {
  const state = mainPhase(game());
  addRealCard(state, 'barge', 'bomat-bazaar-barge', 'p1', 'battlefield');
  addCreature(state, 'c1', 'p1', 3, 3);
  assert.ok(execute(state, crewOffers(state, 'p1', 'barge')[0]).ok);
  assert.ok(resolveStack(state));
  assert.equal(state.objects.get('barge').crewed, true);
  clearStatModifiers(state);
  const vehicle = state.objects.get('barge');
  assert.equal(vehicle.crewed ?? false, false, 'po cleanup nieobsadzony');
  assert.equal(vehicle.originalBeforeAnimation, null, 'animacja cofnięta');
  assert.equal(vehicle.kind, 'artifact', 'znów czysty artefakt');
});

test('A4/3: zmiana strefy gasi znacznik (CR 400.7)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'barge', 'bomat-bazaar-barge', 'p1', 'battlefield');
  addCreature(state, 'c1', 'p1', 3, 3);
  assert.ok(execute(state, crewOffers(state, 'p1', 'barge')[0]).ok);
  assert.ok(resolveStack(state));
  assert.equal(state.objects.get('barge').crewed, true);
  const bounced = moveObjectDirectly(state, 'barge', 'hand', 'hand-barge');
  assert.equal(bounced.crewed ?? false, false, 'po zejściu ze stołu znacznik znika');
});

test('A4/4: animacja spoza crew NIE stawia znacznika (badge mówi prawdę)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'rock', 'irontread-crusher', 'p1', 'battlefield');
  animatePermanentUntilEndOfTurn(state, 'rock', { power: 5, toughness: 5, typesAdd: ['Creature'] });
  const vehicle = state.objects.get('rock');
  assert.ok(vehicle.originalBeforeAnimation != null, 'animacja aktywna');
  assert.equal(vehicle.crewed ?? false, false, 'cudza animacja to nie załoga');
  const entry = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'rock');
  assert.equal(entry.crewed ?? false, false, 'widok milczy o załodze');
  assert.equal(entry.animatedUntilEOT, true, 'ale animację widok niesie jak dotąd');
});
