// Wyzwanie 1/5 (2026-09-11, „brązowa odznaka wyłapywacza błędów”) —
// Bloodthirst: warunkiem jest ODBIORCA obrażeń, nie ich źródło.
//
// Źródło prawdy (ADR 0030 — pobrane online 2026-09-11, nie z pamięci):
//   • CR 702.54a (mtg.wiki/page/Bloodthirst, CR z 7.08.2026): „Bloodthirst N
//     means 'If an opponent was dealt damage this turn, this permanent enters
//     with N +1/+1 counters on it.'"
//   • M12 FAQ (2011-05-25), tamże: „It doesn't matter who controlled the source
//     of the damage dealt to your opponent. If an opponent was dealt damage by
//     a source they controlled (such as Manabarbs), creatures with bloodthirst
//     that enter the battlefield under your control later that turn will get
//     +1/+1 counters."
//   • Oracle Gorehorn Minotaurs (api.scryfall.com): „Bloodthirst 2 (If an
//     opponent was dealt damage this turn, this creature enters with two +1/+1
//     counters on it.)"
//
// Stan przed naprawą: `state.dealtDamageToOpponentThisTurn[dealer] = true`
// (game-state.js) z warunkiem `dealer !== e.target` — klucz to KONTROLER
// ŹRÓDŁA, a warunek znaczy „źródło trafiło kogoś innego niż cel”. Oba
// kierunki są niezgodne z 702.54a:
//   (a) przeciwnik rani samego siebie (Manabarbs, Shock we własny nos) —
//       mój stwór z bloodthirst POWINIEN wejść z licznikami, a nie wchodził;
//   (b) ja ranię samego siebie — mój stwór NIE powinien dostać liczników,
//       a dostawał (dealer = ja ≠ cel? nie — dealer == cel, więc… patrz test
//       3: przy obrażeniach zadanych PRZEZ przeciwnika MI klucz dostawał
//       przeciwnik, więc mój stwór i tak nie dostawał nic — błąd w drugą
//       stronę pokazuje test 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower } from '../src/engine/permanents.js';

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 4111, players: [{ id: 'p1' }, { id: 'p2' }] });
  // Biblioteki nie mogą być puste — inaczej krok dobrania drugiej tury kończy
  // grę (CR 704.5b) i test W1/4 nie dojdzie do kolejnej tury.
  for (const playerId of ['p1', 'p2']) {
    for (let i = 0; i < 12; i += 1) {
      addObject(state, {
        id: `lib-${playerId}-${i}`, instanceId: `il-${playerId}-${i}`, cardId: 'basic-mountain',
        controllerId: playerId, ownerId: playerId, zone: 'library', kind: 'land',
        types: ['Basic', 'Land'], subtypes: ['Mountain'],
      });
    }
  }
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'hand') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], bloodthirst: data.bloodthirst ?? null,
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [],
  });
  return state.objects.get(id);
}

/** Rozstrzyga stos pełnymi rundami passów (jak w real-cards-batch20). */
function resolveStack(state) {
  const blocked = (r) => !r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '');
  let guard = 0;
  while (state.zones.stack.length > 0 && guard < 12) {
    let passesDone = state.turn.passes;
    while (passesDone < state.players.length) {
      const holder = state.turn.priorityPlayerId;
      const r = execute(state, { type: 'pass_priority', playerId: holder });
      if (blocked(r)) return;
      assert.ok(r.ok, r.events[0]?.reason);
      if (state.turn.passes === 0) break;
      passesDone = state.turn.passes;
    }
    guard += 1;
  }
}

/** Rzuca Shocka (2 obrażenia w dowolny cel) i rozstrzyga stos. */
function castShock(state, casterId, targetId, tag) {
  // Instant z ręki gracza BEZ priorytetu (np. przeciwnika w mojej fazie głównej)
  // wymaga najpierw passa bieżącego posiadacza priorytetu (CR 116.3).
  if (state.turn.priorityPlayerId !== casterId) {
    const holder = state.turn.priorityPlayerId;
    const rp = execute(state, { type: 'pass_priority', playerId: holder });
    assert.ok(rp.ok, `pass przed Shockiem: ${rp.events[0]?.reason}`);
  }
  putCard(state, `shock-${tag}`, 'shock', casterId, 'hand');
  addMana(state, casterId, 1, { colors: ['R'] });
  const r = execute(state, {
    type: 'cast_spell', playerId: casterId, objectId: `shock-${tag}`, targets: [targetId],
  });
  assert.ok(r.ok, `Shock rzucony: ${r.events[0]?.reason}`);
  resolveStack(state);
  const hit = [...state.objects.values()].find((o) => o.cardId === 'shock' && o.zone === 'graveyard');
  assert.ok(hit, 'Shock rozstrzygnięty (karta w grobie)');
}

/** Gorehorn Minotaurs ({2}{R}{R}, Bloodthirst 2) wchodzi na pole bitwy p1. */
function castGorehorn(state) {
  putCard(state, 'gore', 'gorehorn-minotaurs', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['R'] });
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'gore' });
  assert.ok(r.ok, `Gorehorn rzucony: ${r.events[0]?.reason}`);
  resolveStack(state);
  const obj = [...state.objects.values()].find((o) => o.cardId === 'gorehorn-minotaurs' && o.zone === 'battlefield');
  assert.ok(obj, 'Gorehorn na polu bitwy');
  return obj;
}

test('W1/1: przeciwnik rani SAM SIEBIE ⇒ mój stwór z bloodthirst wchodzi z licznikami (CR 702.54a + M12 FAQ)', () => {
  const state = game();
  const before = state.players.find((p) => p.id === 'p2').life;
  castShock(state, 'p2', 'p2', 'self'); // źródło PRZECIWNIKA trafia PRZECIWNIKA (Manabarbs)
  assert.equal(state.players.find((p) => p.id === 'p2').life, before - 2, 'setup: p2 stracił 2 życia');

  const gore = castGorehorn(state);
  assert.equal(gore.counters?.['+1/+1'] ?? 0, 2,
    'przeciwnik dostał obrażenia w tej turze ⇒ bloodthirst 2 (CR 702.54a: „an opponent was dealt damage”)');
  assert.equal(effectivePower(gore, state), 5, '3/3 + 2 liczniki = 5/5');
});

test('W1/2: moje własne samouszkodzenie NIE daje mojemu bloodthirstowi liczników', () => {
  const state = game();
  const before = state.players.find((p) => p.id === 'p1').life;
  castShock(state, 'p1', 'p1', 'self'); // JA ranię SIEBIE — żaden przeciwnik nie dostał obrażeń
  assert.equal(state.players.find((p) => p.id === 'p1').life, before - 2, 'setup: p1 stracił 2 życia');

  const gore = castGorehorn(state);
  assert.equal(gore.counters?.['+1/+1'] ?? 0, 0,
    'obrażenia dostałem JA, nie przeciwnik ⇒ brak liczników (CR 702.54a)');
  assert.equal(effectivePower(gore, state), 3, '3/3 bez bloodthirst');
});

test('W1/3: klasyczny przebieg — moje obrażenia w przeciwnika ⇒ bloodthirst działa (regresja)', () => {
  const state = game();
  castShock(state, 'p1', 'p2', 'enemy');
  const gore = castGorehorn(state);
  assert.equal(gore.counters?.['+1/+1'] ?? 0, 2, 'przeciwnik dostał obrażenia ⇒ 2 liczniki');
  assert.equal(effectivePower(gore, state), 5, '5/5');
});

/** Przechodzi passami do głównej fazy tury `targetTurn` (naturalny bieg tury). */
function advanceToMain(state, targetTurn) {
  let guard = 0;
  while (guard < 200) {
    if (state.turn.number >= targetTurn && state.turn.step === 'main1') return;
    const holder = state.turn.priorityPlayerId;
    const r = execute(state, { type: 'pass_priority', playerId: holder });
    if (!r.ok) throw new Error(`pass zablokowany: ${r.events[0]?.reason}`);
    guard += 1;
  }
  throw new Error('nie udało się dojść do kolejnej tury');
}

test('W1/4: obrażenia z POPRZEDNIEJ tury nie liczą się (bloodthirst patrzy na „this turn”)', () => {
  const state = game();
  castShock(state, 'p1', 'p2', 'enemy');
  advanceToMain(state, 3); // tura 2 = przeciwnika, tura 3 = znowu moja
  assert.equal(state.turn.activePlayerId, 'p1', 'setup: znowu tura p1');

  const gore = castGorehorn(state);
  assert.equal(gore.counters?.['+1/+1'] ?? 0, 0, 'obrażenia z minionej tury nie spełniają „this turn”');
});
