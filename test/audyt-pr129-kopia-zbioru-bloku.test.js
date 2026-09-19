// Audyt PR #129 — domknięcie znaleziska F-1 audytu PR #128
// (`docs/audits/AUDYT_PR128_2026-09-18.md`).
//
// F-1 (średnie): `blockAssignmentViolation` (M387) zunifikował legalność
//   ZBIORU bloku w walidacji `declareBlockers`, filtrze enumeracji i pętli
//   „wszystkie minus jeden", ale enumeracja singletonów w gałęzi
//   przekroczonego `COMBAT_OPTION_CAP` (fallback) liczyła menace i „can't block
//   alone" RĘCZNIE — trzecia kopia tej samej reguły (L41/L48). Strażnik
//   rodziny M387/D skanował tylko `declareBlockers`, więc obiecywał więcej,
//   niż mierzył (L5/L113: zasięg skanu = zasięg KLASY). Naprawa: fallback
//   woła TEN SAM predykat; strażnik poniżej pilnuje, żeby negowana bramka
//   zbioru nie wróciła do oferty pojedynczych bloków.
//
// Źródła (dostęp 2026-09-18, potwierdzone w AUDYT_PR128 §3): CR 509.1b/702.110b
// cytowane w m387; nośniki: Dire Fleet Ravager (menace), Highland Game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addObject, createGameState, execute } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { legalBlockerOptions } from '../src/engine/combat.js';

const REGISTRY = createCardRegistry();

function combatState() {
  const state = createGameState({ seed: 129, players: [{ id: 'p1' }, { id: 'p2' }] });
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

function verdict(baseState, assignments) {
  const clone = structuredClone(baseState);
  const result = execute(clone, { type: 'declare_blockers', playerId: 'p2', assignments });
  return { ok: result.ok, reason: result.reason ?? result.events?.[0]?.reason ?? null };
}

test('PR129/F-1 strażnik: fallback oferty bloków nie liczy reguł zbioru negacją (jedno źródło)', () => {
  const src = readFileSync(new URL('../src/engine/combat.js', import.meta.url), 'utf8');
  const start = src.indexOf('export function legalBlockerOptions');
  assert.ok(start > 0, 'nie znaleziono legalBlockerOptions');
  const body = src.slice(start); // ostatnia funkcja pliku
  // Konkretna zdublowana bramka: negacja menace + negacja „can't block alone”
  // strzegące pojedynczego `options.push`. (Negacja menace w pętli PAR menace
  // `...'menace')) continue;` jest legalna — chodzi o bramkę singletona.)
  const negatedGate = /!hasKeyword\(state, attacker, 'menace'\)\s*\n\s*&& !hasAloneRestriction/;
  assert.ok(!negatedGate.test(body),
    'F-1: legalBlockerOptions znów liczy reguły zbioru negacją przy pojedynczym bloku — ma wołać blockAssignmentViolation');
  assert.ok(!/!hasAloneRestriction\(blocker, 'cantBlockAlone'\)\) options\.push/.test(body),
    'F-1: pojedynczy blok w ofercie znów strzeżony ręczną negacją „can\'t block alone”');
});

test('PR129/F-1 zachowanie: gałąź fallback (przekroczony cap) oferuje tylko legalne przypisania', () => {
  const state = combatState();
  putCreature(state, 'menacer', 'dire-fleet-ravager', 'p1'); // menace + deathtouch
  for (let i = 0; i < 5; i += 1) putCreature(state, `atk${i}`, 'highland-game', 'p1');
  putCreature(state, 'b0', 'highland-game', 'p2');
  putCreature(state, 'b1', 'highland-game', 'p2');
  putCreature(state, 'b2', 'highland-game', 'p2');
  enterBlockStep(state, ['menacer', 'atk0', 'atk1', 'atk2', 'atk3', 'atk4']);

  const offers = legalBlockerOptions(state, 'p2');
  assert.ok(offers.length > 0, 'gałąź fallback bez ofert — scena bez sensu');
  // Menace: przypisania pod menacerem mają 0 albo ≥2 blokerów, nigdy 1.
  for (const offer of offers) {
    const underMenacer = offer.menacer ?? [];
    assert.ok(underMenacer.length === 0 || underMenacer.length >= 2,
      `fallback proponuje ${underMenacer.length} blokerów pod menace (ma być 0 lub ≥2)`);
  }
  // Spójność L48: KAŻDE oferowane przypisanie jest przyjmowane przez walidację.
  const rejected = [];
  for (const offer of offers) {
    const result = verdict(state, offer);
    if (!result.ok) rejected.push({ offer, reason: result.reason });
  }
  assert.deepEqual(rejected, [],
    `fallback publikuje przypisania, które walidacja odrzuca (L48): ${JSON.stringify(rejected)}`);
  // Co najmniej jedna para blokerów pod menace jest widoczna (fallback nie zniknął).
  assert.ok(offers.some((o) => (o.menacer ?? []).length >= 2),
    'fallback nie proponuje żadnej pary pod atakującego z menace');
});
