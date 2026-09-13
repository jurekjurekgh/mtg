// Łaty luk bramki źródeł kosztowych (symulacja zamiast warstw+trybu ścisłego).
// (b) pipy kosztów finansowane wildcardami; (c) koszty z puli (koniec STRICT,
// atomowość odrzutu); (d) łańcuchy B→A / cykle / prefiksy; (e) granty w bramce;
// (f) budżety per-X (Consume Spirit); (net) netto DOKŁADNE (pip kosztu zjada bazę).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { spendMana, addMana, producibleMana, fundableCostedPlan } from '../src/engine/resources.js';
import { castSpell } from '../src/engine/spells.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 41, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

// Syntetyczne źródło pipowo-kosztowe ({C},{T}: +{P}) — łańcuchy i cykle.
function putPipCosted(state, id, costColor, prodColor) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `syn-${id}`, controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'artifact', types: ['Artifact'], colors: [],
    abilities: [{
      type: 'activated', cost: { tap: true, mana: 1, colors: [costColor] },
      effect: { type: 'add_mana', amount: 1, colors: [prodColor] },
    }],
  });
  return state.objects.get(id);
}

// Lokalny resolveStack (kopia wzorca batch32 — rozstrzyga stos do końca).
function resolveStack(state) {
  let guard = 0;
  while ((state.zones.stack.length > 0 || state.pendingTriggerTargets.length > 0 || state.pendingSearchChoice || state.pendingOptionalTrigger) && guard++ < 300) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const pick = view.legalCommands.find((c) => c.type === 'resolve_search_choice' && c.found)
      ?? view.legalCommands.find((c) => c.type === 'resolve_trigger_target' && c.targetId)
      ?? view.legalCommands.find((c) => c.type === 'resolve_optional_trigger_choice' && c.fire === true)
      ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!pick) return false;
    if (!execute(state, pick).ok) return false;
  }
  return true;
}

function mapsSum(player) {
  return Object.values(player.manaPool ?? {}).reduce((a, b) => a + b, 0)
    + Object.values(player.restrictedPool ?? {}).reduce((a, b) => a + b, 0);
}

test('(net): Apprentice netto +2, nie +3 (pip {U} zjada jednostkę bazy)', () => {
  const state = game('p1');
  putCard(state, 'i', 'basic-island', 'p1');
  putCard(state, 'ap', 'apprentice-wizard', 'p1');
  // Baza 1 (Wyspa) + netto (3 − 0 − 1) = 3. Dawne max(0, 3 − 0) dawało 4.
  assert.equal(producibleMana(state, 'p1', null, {}, []), 3);
});

test('(b): pip kosztu {U} finansowany wildcardem z puli (koniec plainBase)', () => {
  // Dawna bramka (ii') widziała tylko jednostki ≤1 koloru: pula-{dowolna}
  // nie fundowała {U} Apprentice'a (budżet 1 < 3, throw).
  const state = game('p1');
  putCard(state, 'ap', 'apprentice-wizard', 'p1');
  addMana(state, 'p1', 1, { colors: ['W', 'U', 'B', 'R', 'G'] });
  spendMana(state, 'p1', 3, [], {});
  const player = state.players.find((pl) => pl.id === 'p1');
  assert.equal(player.mana, mapsSum(player), 'M201: licznik = suma map');
  assert.equal(state.objects.get('ap').tapped, true, 'Apprentice odpalony');
});

test('(c): pula-any + Cylix + 2 pipy BEZ świeżej bazy → brak oferty, czysty odrzut', () => {
  // Kształt crash-1 bez lądów: finansowanie {1} zjadłoby pulę przypisaną
  // pipom {R}{G} (end-check na reszcie nie przechodzi — następca STRICT).
  const state = game('p1');
  putCard(state, 'f', 'basic-forest', 'p1');
  state.objects.set('f', Object.freeze({ ...state.objects.get('f'), tapped: true }));
  putCard(state, 'cylix', 'mana-cylix', 'p1');
  addMana(state, 'p1', 1, { colors: ['W', 'U', 'B', 'R', 'G'] });
  putCard(state, 'eb', 'exploding-borders', 'p1', 'hand');
  const view = playerView(state, 'p1');
  const offer = (view.legalCommands ?? []).find((c) => c.type === 'cast_spell' && c.objectId === 'eb');
  assert.equal(offer, undefined, 'brak oferty (koszt zjadłby pipy)');
  // Walidator rzuca PRZED mutacją (bramka kolorów pierwsza): Cylix nietapnięty, pula nietknięta.
  assert.throws(() => castSpell(state, 'p1', 'eb', ['p2']), /Brak kolorowego źródła many/);
  assert.equal(state.objects.get('cylix').tapped ?? false, false, 'Cylix nietknięty');
  assert.equal(state.players.find((pl) => pl.id === 'p1').mana, 1, 'pula nietknięta');
});

test('(d1): łańcuch X{U}→R, Y{R}→B finansuje {B} (oferta + płatność w kolejności)', () => {
  const state = game('p1');
  putPipCosted(state, 'x', 'U', 'R');
  putPipCosted(state, 'y', 'R', 'B');
  putCard(state, 'i', 'basic-island', 'p1');
  putCard(state, 'rats', 'lab-rats', 'p1', 'hand');
  const view = playerView(state, 'p1');
  const offer = (view.legalCommands ?? []).find((c) => c.type === 'cast_spell' && c.objectId === 'rats');
  assert.ok(offer, 'oferta istnieje (Y je produkcję X)');
  const result = execute(state, { ...offer });
  assert.equal(result.ok, true, 'płatność przechodzi (tap w kolejności akceptacji)');
  assert.equal(state.objects.get('x').tapped, true, 'ogniwo X tapnięte (domknięcie łańcucha)');
  assert.equal(state.objects.get('y').tapped, true, 'ogniwo Y tapnięte');
  const rats = [...state.objects.values()].find((o) => o.cardId === 'lab-rats');
  assert.ok(rats && rats.zone !== 'hand', 'Szczury rzucone');
});

test('(d2): cykl X{U}→R, Y{R}→U bez bazy nie rusza (odrzut całości)', () => {
  const state = game('p1');
  putPipCosted(state, 'x', 'U', 'R');
  putPipCosted(state, 'y', 'R', 'U');
  const plan = fundableCostedPlan(state, 'p1', [['U']], null, {});
  assert.deepEqual(plan.entries.map((e) => e.object.id), [], 'żadne nie startuje bez bazy');
});

test('(d3): prefiks — Mountain + Y{R}→U + X{U}→R vs {U} wchodzi SAM Y', () => {
  // Fixpoint bierze oba ([Y,X] — X je produkcję Y), ale end [Y,X] to (R),
  // a {U} kryje dopiero prefiks [Y] (end (U)). Full-agregat gubił to legalne.
  const state = game('p1');
  putPipCosted(state, 'x', 'U', 'R');
  putPipCosted(state, 'y', 'R', 'U');
  putCard(state, 'm', 'basic-mountain', 'p1');
  const plan = fundableCostedPlan(state, 'p1', [['U']], null, {});
  assert.deepEqual(plan.entries.map((e) => e.object.id), ['y'], 'najdłuższy przechodzący prefiks');
});

test('(e): grant (Embrace) funduje pip kosztu {U} (Wyspa + Apprentice, płatność {4})', () => {
  // Dawna bramka liczyła grant jako [] (generyczny): ([],[]) nie kryło [U].
  const state = game('p1');
  putCard(state, 'i', 'basic-island', 'p1');
  putCard(state, 'emb', 'natures-embrace', 'p1', 'hand');
  // Aurę RZUCAMY (wzorzec batch32): koszt {2}{G} czyści pulę do zera,
  // więc kształt grantowy zostaje nietknięty (pula pusta, grant jedyny).
  addMana(state, 'p1', 3, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.objectId === 'emb' && c.targets?.[0] === 'i');
  assert.ok(cast, 'oferta aury na Wyspę');
  assert.equal(execute(state, cast).ok, true, 'rzut aury');
  resolveStack(state);
  assert.equal(state.players.find((pl) => pl.id === 'p1').mana, 0, 'pula pusta po rzucie aury');
  putCard(state, 'ap', 'apprentice-wizard', 'p1');
  spendMana(state, 'p1', 4, [], {});
  const player = state.players.find((pl) => pl.id === 'p1');
  assert.equal(player.mana, mapsSum(player), 'M201: licznik = suma map');
  assert.equal(state.objects.get('i').tapped, true, 'Wyspa tapnięta (grant na {U})');
  assert.equal(state.objects.get('ap').tapped, true, 'Apprentice odpalony');
});

test('(f): Consume Spirit — budżet per-X (karta 4, xPips(2) odrzuca kosztowe)', () => {
  // Silnik modeluje Consume'a jako {X}{1}{B} (baza 2, pipy [[B]]).
  // Pula (B) + Wyspa + Apprentice: karta wchodzi z Apprentice'em (2 + 2 = 4),
  // ale xPips(2) = {B}{B}{B} nie kryje się w reszcie (B,C,C,C) → budżet 2.
  const state = game('p1');
  addMana(state, 'p1', 1, { colors: ['B'] });
  putCard(state, 'i', 'basic-island', 'p1');
  putCard(state, 'ap', 'apprentice-wizard', 'p1');
  putCard(state, 'cs', 'consume-spirit', 'p1', 'hand');
  assert.equal(producibleMana(state, 'p1', null, {}, [['B']]), 4, 'budżet karty (z Apprentice)');
  assert.equal(producibleMana(state, 'p1', null, {}, [['B'], ['B'], ['B']]), 2, 'budżet xPips(2) (bez kosztowych)');
  const view = playerView(state, 'p1');
  const offers = (view.legalCommands ?? []).filter((c) => c.type === 'cast_spell' && c.objectId === 'cs');
  assert.ok(offers.length >= 1, 'oferta X=0 istnieje');
  assert.ok(offers.every((c) => c.xValue === 0), 'tylko X=0 (X=1,2 ponad budżetem per-X)');
  const result = execute(state, { ...offers[0] });
  assert.equal(result.ok, true, 'X=0 płaci');
});
