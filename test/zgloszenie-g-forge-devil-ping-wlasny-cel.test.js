// =============================================================================
// Zgłoszenie G (2026-10-08, właściciel) — Forge Devil:
//   „Bot wystawia ją, mimo, że na stole ma tylko swoją kreaturę 1/1. To powoduje,
//   że wystawienie Forge Devil zmusza go do zabicia swojej kreatury. Nic nie
//   zyskuje i jeszcze traci 1 życia (ETB). Bez sensu. Nie powinien w tej turze
//   wystawiać tej karty tylko poczekać aż przeciwnik będzie miał jakąś kartę
//   kreatury na stole albo w najgorszym razie bot będzie miał kogoś kto może
//   wchłonąć ten damage."
//
// Oracle: „When this creature enters, it deals 1 damage to target creature and
// 1 damage to you." Cel `creature` obejmuje WŁASNIE — bez wrogiego stwora ping
// jest skazany na własne ciało.
//
// Pomiar PRZED (sonda `.arena/probe-g-forge.mjs`): własna 1/1 tylko → cast 62,1
// (powyżej passu 0). Strażnik M103/A bronił wyłącznie PUSTEGO stołu (bramka
// „jest jakikolwiek stwór na stole"), więc własne ciało przeszło.
//
// Fix: `etbForcedOwnPingPenalty` — kara po OFIARACH pingu (własne stwory + sam
// wchodzący, CR 603.6a); 0 gdy własne ciało wchłonie obrażenia, ciało najtańszej
// ofiary gdy spłoną wszyscy (CR 704.5g).
//
// Dowód mutacyjny (sonda `.arena/probe-g5.mjs`: w katalogu tylko forge-devil
// (obowiązkowy, stała kwota) i reclusive-artificer (OPCJONALNY „you may",
// kwota dynamiczna) spełniają kształt triggera):
//   - usunięcie filtra „spłonie\”  → czerwone G/2 i G/2b (wchłanianie),
//   - usunięcie wczesnego returna „wróg ma cel\” → czerwone G/2c (pin M103/A),
//   - płaska kara 80 zamiast min po ofiarach → czerwone G/5.
// Dwie gałęzie są DEFENSYWNE (dla dziś istniejącego katalogu mutacje
// równoważne, bez fałszywego zielonego): filtr `mayFire` (opcjonalny trigger
// nigdy nie jest przymusowy) i kara 80 przy braku kandydatów (osiągalna tylko
// dla nosiciela-NIE-stwora — dziś obie karty w detektorze są stworami).
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game() {
  const s = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main1', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  for (const p of ['p1', 'p2']) {
    for (let i = 0; i < 10; i += 1) {
      addObject(s, {
        id: `lib-${p}-${i}`, instanceId: `i-lib-${p}-${i}`, cardId: 'basic-plains',
        controllerId: p, ownerId: p, zone: 'library', kind: 'spell', manaCost: 0,
      });
    }
  }
  return s;
}

function put(s, id, cardId, playerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(s, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) s.objects.set(id, Object.freeze({ ...s.objects.get(id), ...patch }));
  return s.objects.get(id);
}

const creature = (s, id, pid, power, toughness) => addObject(s, {
  id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: pid, ownerId: pid, zone: 'battlefield',
  kind: 'creature', power, toughness, manaCost: 2, abilities: [], keywords: [], subtypes: [],
  types: ['Creature'], colors: [],
});

/** Scena rzutu bota (p1): karta w ręce, mana, własne i wrogie ciała. */
function scena({ card = 'forge-devil', mana = 3, own = [], foe = [] } = {}) {
  const s = game();
  put(s, 'karta', card, 'p1', 'hand');
  addMana(s, 'p1', mana);
  own.forEach(([id, p, t]) => creature(s, id, 'p1', p, t));
  foe.forEach(([id, p, t]) => creature(s, id, 'p2', p, t));
  return s;
}

function decyzja(s, seed = 5) {
  const bot = createHeuristicBot({ seed });
  const cmd = bot.chooseCommand(playerView(s, 'p1'));
  const scores = {};
  for (const o of bot.trace().at(-1)?.options ?? []) scores[o.cmd] = o.score;
  return { cmd, scores };
}
const castScore = (s) => decyzja(s).scores['cast_permanent(karta)'];

// =============================================================================
// G/1 — scenariusz właściciela: jedyna kreatura to WŁASNA 1/1
// =============================================================================

test('G/1: bot NIE wystawia Forge Devil, gdy jedynym celem jest własna 1/1 (zgłoszenie)', () => {
  const { cmd, scores } = decyzja(scena({ own: [['my11', 1, 1]] }));
  assert.equal(cmd.type, 'pass_priority',
    `ping zmuszony we własne ciało = strata; bot wybrał: ${JSON.stringify(cmd)}`);
  assert.ok(scores['cast_permanent(karta)'] < 0,
    `nota rzutu (${scores['cast_permanent(karta)']}) poniżej passu (0)`);
});

test('G/1b: to samo przy DWÓCH własnych 1/1 (oba spłoną)', () => {
  const { cmd } = decyzja(scena({ own: [['a11', 1, 1], ['b11', 1, 1]] }));
  assert.equal(cmd.type, 'pass_priority', `każdy kandydat ginie: ${JSON.stringify(cmd)}`);
});

test('G/1c: własna 1/1 z już naniesionym obrażeniem — nadal odmowa', () => {
  const s = scena({ own: [['my11', 1, 1]] });
  s.objects.set('my11', Object.freeze({ ...s.objects.get('my11'), damage: 1 }));
  const { cmd } = decyzja(s);
  assert.equal(cmd.type, 'pass_priority', `1/1 z 1 obrażeniem spłonie od pinga: ${JSON.stringify(cmd)}`);
});

// =============================================================================
// G/2 — anty-over-fix: ciało, które WCHŁONI obrażenia, nie karamy
// =============================================================================

test('G/2: bot WYSTAWIA Forge Devil, gdy własne ciało wchłonie ping (3/3)', () => {
  const { cmd } = decyzja(scena({ own: [['my33', 3, 3]] }));
  assert.equal(cmd.type, 'cast_permanent',
    `właściciel: „w najgorszym razie bot będzie miał kogoś, kto może wchłonąć ten damage": ${JSON.stringify(cmd)}`);
});

test('G/2b: 2/2 przetrwa 1 obrażenie — rzut dozwolony (nielethalny ping)', () => {
  const { cmd } = decyzja(scena({ own: [['my22', 2, 2]] }));
  assert.equal(cmd.type, 'cast_permanent', `2/2 wchłonie 1 obrażenie: ${JSON.stringify(cmd)}`);
});

test('G/2c: gdy WRÓG ma stwora, ping idzie w niego — rzut bez kary (pin M103/A)', () => {
  const { cmd } = decyzja(scena({ own: [['my11', 1, 1]], foe: [['foe11', 1, 1]] }));
  assert.equal(cmd.type, 'cast_permanent', `cel wroga opłacalny: ${JSON.stringify(cmd)}`);
  assert.ok(castScore(scena({ own: [['my11', 1, 1]], foe: [['foe11', 1, 1]] }))
    > castScore(scena({ own: [['my11', 1, 1]] })),
    'cel wroga notowany wyżej niż zmuszony ping we własne ciało');
});

test('G/2d: PUSTY stół (jedyny cel = sam wchodzący) — odmowa (pin M103/A)', () => {
  const { cmd } = decyzja(scena({}));
  assert.equal(cmd.type, 'pass_priority', `samobójstwo wchodzącego: ${JSON.stringify(cmd)}`);
});

// =============================================================================
// G/3 — precyzja celu: wróg z SAMYM artefaktem nie jest celem pingu
// =============================================================================

test('G/3: wróg ma artefakt, ale nie stwora — ping i tak zmuszony we własne ciało', () => {
  const s = scena({ own: [['my11', 1, 1]] });
  put(s, 'foeart', 'warmaker-gunship', 'p2', 'battlefield', { kind: 'artifact' });
  const { cmd } = decyzja(s);
  assert.equal(cmd.type, 'pass_priority',
    `cel \"creature\" nie obejmuje artefaktu wroga: ${JSON.stringify(cmd)}`);
});

// =============================================================================
// G/4 — generyczność (ADR 0002): kara tylko dla pingu OBOWIĄZKOWEGO
// =============================================================================

test('G/4: trigger OPCOJNALNY („you may") nie jest karany — karta bez ryzyka', () => {
  // Reclusive Artificer: „you may have it deal damage to target creature…" —
  // odmowa jest darmowa, więc obecność własnej 1/1 nie dyskwalifikuje rzutu.
  const { cmd } = decyzja(scena({ card: 'reclusive-artificer', mana: 6, own: [['my11', 1, 1]] }));
  assert.equal(cmd.type, 'cast_permanent',
    `opcjonalny trigger = bez kary za własne ciało: ${JSON.stringify(cmd)}`);
});

// =============================================================================
// G/5 — mechanizm: kara = ciało najtańszej ofiary (spłoną WSZYSCY kandydaci)
// =============================================================================

test('G/5: bot pali NAJTAŃSZE ciało — ofiara 0/1 zmniejsza karę (minimum po ofiarach)', () => {
  // Kara nie jest stała (M103/A dawało płaskie 80) ani maksimum: bot wybiera
  // najtańszą ofiarę, więc dodatkowa 0/1 obniża stratę wobec samej 1/1.
  const only11 = castScore(scena({ own: [['my11', 1, 1]] }));
  const withCheap = castScore(scena({ own: [['my01', 0, 1], ['my11', 1, 1]] }));
  assert.ok(only11 < 0 && withCheap < 0, `obie noty poniżej passu (${only11}, ${withCheap})`);
  assert.ok(withCheap > only11,
    `tańsza ofiara (0/1) = mniejsza kara (${withCheap} > ${only11})`);
  // Różnica = ciało 1/1 − 0/1 = 2 pkt kary, przeskalowane skalą gałęzi rzutu
  // (cała nota rzutu idzie przez dyskont permanentu — stąd 1,8, nie 2,0).
  assert.ok(Math.abs((withCheap - only11) - 1.8) < 0.01,
    `różnica not = różnica ciał × skala gałęzi (${(withCheap - only11).toFixed(2)})`);
});
