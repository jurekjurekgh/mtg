// M378 (wyzwanie „brązowa odznaka", ADR 0030): BRONIĄCY SIĘ GRACZ to fakt
// STANU GRY, nie parametr komendy (CR 508.1b — „the defending player is the
// player being attacked"; CR 510.1b — „An unblocked creature assigns its
// combat damage to the player, planeswalker, or battle it's attacking").
//
// Źródła online (dostęp 2026-09-18):
//  • CR 510.1b, https://media.wizards.com/2026/downloads/MagicCompRules%2020260819.txt
//    (efektywne 2026-08-07): „An unblocked creature assigns its combat damage
//    to the player, planeswalker, or battle it's attacking. If it isn't
//    currently attacking anything (…), it assigns no combat damage."
//
// Root cause (przed M378): `resolveCombatDamage(state, defendingPlayerId)` brał
// wartość z `cmd.defendingPlayerId` (bez walidacji) i przekazywał ją do
// `dealCombatDamageToPlayer` — dla NIEBLOKOWANEGO atakującego obrażenia szły do
// gracza wskazanego komendą, a `defendingPlayerIdOf(state)` (używany w ścieżce
// trample'owej) był DRUGIM źródłem prawdy. Skutki widziane sondą:
//  1. `defendingPlayerId: 'p1'` przy ataku p1 na p2 → życie 20/20 → 18/20,
//     czyli atakujący zadał obrażenia SAM SOBIE (CR 508.1b naruszone),
//  2. brak pola → komenda odrzucana W TRAKCIE rozstrzygania
//     (`illegal_combat:Zmiana życia wymaga gracza i całkowitej wartości`;
//     dla infect: `Dodanie znaczników trucizny wymaga gracza…`) — obrażenia
//     ginęły, a gracz widział wewnętrzny błąd silnika.
//
// Piny: (A) spreparowana komenda jest ODRZUCANA (atomowo — nikt nie traci
// życia), (B) komenda bez pola nadal zadaje obrażenia WŁAŚCIWEMU graczowi,
// (C) poprawna wartość = wynik jak w (B), (D) ścieżka trucizny (infect) działa
// bez pola (CR 702.89b), (E) blokowanie: atakujący z blokerem nie kieruje
// obrażeń do gracza (kontrola negatywna — walidacja nie zepsuła bloków).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();

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

/** Biblioteka na 10 kart — bez niej przejście do kroku dobierania kończy grę. */
function library(state, playerId) {
  for (let i = 0; i < 10; i += 1) {
    addRealCard(state, `lib-${playerId}-${i}`, 'basic-forest', playerId, 'library');
  }
}

/**
 * Stan w kroku obrażeń: p1 atakuje jednym nieblokowanym stworzeniem.
 * `cardId` decyduje o sile (ichorclaw-myr = 1/1 z infect, highland-game = 2/1).
 */
function unblockedAttack({ cardId = 'highland-game', power = 2, keywords = null } = {}) {
  const state = createGameState({ seed: 378, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  library(state, 'p1');
  library(state, 'p2');
  addRealCard(state, 'atk', cardId, 'p1', 'battlefield');
  const attacker = { ...state.objects.get('atk'), power, toughness: 2, summoningSickness: false };
  if (keywords) attacker.keywords = keywords;
  state.objects.set('atk', Object.freeze(attacker));
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' }); // okno po deklaracji (CR 508.2)
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p2' }); // okno obrońcy po blokach (CR 509.4)
  assert.equal(state.turn.step, 'combat_damage');
  return state;
}

const life = (state, id) => state.players.find((p) => p.id === id).life;
const poison = (state, id) => state.players.find((p) => p.id === id).poison ?? 0;

test('M378/A: spreparowany defendingPlayerId jest odrzucany atomowo (CR 508.1b)', () => {
  const state = unblockedAttack();
  const r = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p1' });
  assert.equal(r.ok, false, 'komenda wskazująca atakującego jako obrońcę nie może być przyjęta');
  assert.match(String(r.events?.[0]?.reason ?? ''), /^illegal_combat:/);
  // Atomowość: żaden gracz nie traci życia, krok się nie zmienia.
  assert.equal(life(state, 'p1'), 20);
  assert.equal(life(state, 'p2'), 20);
  assert.equal(state.turn.step, 'combat_damage');
});

test('M378/B: brak defendingPlayerId — obrażenia idą do atakowanego (CR 510.1b)', () => {
  const state = unblockedAttack();
  const r = execute(state, { type: 'resolve_combat', playerId: 'p1' });
  assert.ok(r.ok, r.events?.[0]?.reason);
  assert.equal(life(state, 'p2'), 18, 'obrażenia nieblokowanego atakującego idą do broniącego się gracza');
  assert.equal(life(state, 'p1'), 20, 'atakujący nie zadaje obrażeń sam sobie');
});

test('M378/C: poprawna wartość daje wynik identyczny z brakiem pola', () => {
  const state = unblockedAttack();
  const r = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.ok(r.ok, r.events?.[0]?.reason);
  assert.equal(life(state, 'p1'), 20);
  assert.equal(life(state, 'p2'), 18);
});

test('M378/D: infect bez defendingPlayerId — trucizna do atakowanego (CR 702.89b)', () => {
  const state = unblockedAttack({ cardId: 'ichorclaw-myr', power: 1 });
  const r = execute(state, { type: 'resolve_combat', playerId: 'p1' });
  assert.ok(r.ok, r.events?.[0]?.reason);
  assert.equal(poison(state, 'p2'), 1, 'obrażenia infect = liczniki trucizny broniącego się gracza');
  assert.equal(life(state, 'p2'), 20, 'infect nie zmienia życia');
  assert.equal(poison(state, 'p1'), 0);
});

test('M378/E: atakujący z blokerem nie kieruje obrażeń do gracza (kontrola)', () => {
  const state = createGameState({ seed: 379, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  library(state, 'p1');
  library(state, 'p2');
  addRealCard(state, 'atk', 'highland-game', 'p1', 'battlefield');
  addRealCard(state, 'blk', 'highland-game', 'p2', 'battlefield');
  state.objects.set('atk', Object.freeze({ ...state.objects.get('atk'), power: 2, toughness: 2, summoningSickness: false }));
  state.objects.set('blk', Object.freeze({ ...state.objects.get('blk'), power: 1, toughness: 4, summoningSickness: false }));
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { atk: ['blk'] } }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const r = execute(state, { type: 'resolve_combat', playerId: 'p1' });
  assert.ok(r.ok, r.events?.[0]?.reason);
  // Blok zjada obrażenia: bloker 4 wytrzymałości dostaje 2, gracze bez zmian.
  assert.equal(life(state, 'p2'), 20);
  assert.equal(life(state, 'p1'), 20);
});
