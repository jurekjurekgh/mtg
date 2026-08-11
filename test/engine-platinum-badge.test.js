import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep, initialTurn } from '../src/engine/turn.js';
import { applyEffect } from '../src/engine/effects.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

// =============================================================================
// Platynowa odznaka „wyłapywacz błędów" (sesja 2026-08-09, M58) — 5 błędów vs
// zasady MtG znalezionych w przeglądzie istniejących kart i mechanik:
//   1. CR 510.1c/702.19b — przydział obrażeń combat (lethal/trample)
//      uwzględniał prewencję: tarcze ODEJMOWANO od lethal, filtr „prevent all
//      damage" zerował lethal. Zasady: przy sprawdzaniu lethal IGNORUJE się
//      efekty zmieniające faktycznie zadane obrażenia (trample 5/5 vs 3/3
//      z tarczą 2 przepuszczał 4 na gracza zamiast 2).
//   2. CR 119.3 — zdarzenia damage_dealt niosły kwotę PRZED prewencją w
//      ścieżkach combat atakujący→bloker, bloker→atakujący oraz
//      damage_to_controller (niespójność z konwencją złotej odznaki).
//   3. CR 701.27a — proliferate nie mógł celować w graczy ze znacznikami
//      trucizny (czytał/pisał player.counters.poison zamiast player.poison).
//   4. CR 401.4 — mill_from_bottom brał ostatni element WSPÓLNEJ listy
//      biblioteki zamiast spodu biblioteki GRACZA-CELU (Cellar Door młynował
//      kartę drugiego gracza po scry/mulligan-bottom pierwszego).
//   5. CR 108.3/400.7 — bounce_permanent zwracał permanent na rękę
//      DOTYCHCZASOWEGO KONTROLERA zamiast WŁAŚCICIELA (Jill, Lunar Rejection).
// =============================================================================

const REGISTRY = createCardRegistry();

function addCreature(state, id, ctrl, p, t, extra = {}) {
  return addObject(state, {
    id, instanceId: `i-${id}`, cardId: `c-${id}`, controllerId: ctrl, zone: 'battlefield',
    kind: 'creature', power: p, toughness: t, manaCost: 2, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], summoningSickness: false, ...extra,
  });
}

function enterCombat(p1Attacks, p2Blocks) {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep({ ...initialTurn('p1') }, 'declare_attackers', 'p1');
  for (const [id, ctrl, p, t, extra] of p1Attacks) addCreature(state, id, ctrl, p, t, extra);
  for (const [id, ctrl, p, t, extra] of p2Blocks) addCreature(state, id, ctrl, p, t, extra);
  return state;
}

// -------------------------------------------------- 1. CR 510.1c / 702.19b


/** M66 (R): trample/multi-bloker kolejkuje decyzję rozdzielania obrażeń —
 * test odpowiada defaultem (jak bot). Zwraca zdarzenia obu komend. */
function resolveCombatWithAssignment(state, playerId, defendingPlayerId) {
  const first = execute(state, { type: 'resolve_combat', playerId, defendingPlayerId });
  assert.equal(first.ok, true, JSON.stringify(first.events));
  const view = playerView(state, playerId);
  const assign = view.legalCommands.find((c) => c.type === 'resolve_damage_assignment');
  if (!assign) return first.events;
  const second = execute(state, assign);
  assert.equal(second.ok, true, JSON.stringify(second.events));
  return [...first.events, ...second.events];
}

test('B1: trample przydziela lethal bez uwzględniania tarcz prewencji (CR 510.1c/702.19b)', () => {
  const state = enterCombat(
    [['att', 'p1', 5, 5, { keywords: ['trample'] }]],
    [['blk', 'p2', 3, 3]],
  );
  // Tarcza Withstand „prevent the next 2 damage" na blokerze.
  state.damageShields = [{ targetId: 'blk', remaining: 2, sourceCardId: 'withstand' }];
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['att'] }).ok, true);
  assert.equal(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { att: ['blk'] } }).ok, true);
  const events = resolveCombatWithAssignment(state, 'p1', 'p2');
  // Lethal = 3 (ignorując tarczę): przydział 3 na blokera, tarcza zjada 2,
  // 1 doszło; nadmiar trample = 2 na gracza (poprzednio: przydział 1 + 4 na gracza).
  const blocker = state.objects.get('blk');
  assert.equal(blocker.zone, 'battlefield', 'bloker przeżywa (1 z 3 wytrzymałości)');
  assert.equal(blocker.damage, 1, 'bloker ma zaznaczone 1 obrażenie (2 zapobiegnięte)');
  assert.equal(state.players.find((p) => p.id === 'p2').life, 18, 'trample: 2 obrażenia do gracza');
  // CR 119.3: event damage_dealt do blokera niesie kwotę ZADANĄ (1, nie 3).
  const evBlocker = events.find((e) => e.type === 'damage_dealt' && e.target === 'blk');
  assert.equal(evBlocker.amount, 1);
  const evPlayer = events.find((e) => e.type === 'damage_dealt' && e.target === 'p2');
  assert.equal(evPlayer.amount, 2);
  assert.ok(events.some((e) => e.type === 'damage_prevented' && e.target === 'blk'));
});

test('B1b: filtr „prevent all damage" nie zmniejsza wymogu lethal przy trample (CR 702.19b)', () => {
  const state = enterCombat(
    [['att', 'p1', 5, 5, { keywords: ['trample'] }]],
    [['blk', 'p2', 3, 3]],
  );
  // Ethersworn Shieldmage: „prevent all damage that would be dealt to creatures".
  state.preventDamageThisTurn = [{ typesInclude: ['Creature'], isCreature: true }];
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['att'] }).ok, true);
  assert.equal(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { att: ['blk'] } }).ok, true);
  const events = resolveCombatWithAssignment(state, 'p1', 'p2');
  // Lethal = 3 MUSI zostać przydzielone blokerowi (nawet w pełni zapobiegnięte),
  // zanim cokolwiek pójdzie na gracza — gracz dostaje 2, nie 5.
  const blocker = state.objects.get('blk');
  assert.equal(blocker.zone, 'battlefield');
  assert.equal(blocker.damage, 0, 'obrażenia w pełni zapobiegnięte');
  assert.equal(state.players.find((p) => p.id === 'p2').life, 18, 'trample: 2 do gracza po lethal');
  const evBlocker = events.find((e) => e.type === 'damage_dealt' && e.target === 'blk');
  assert.equal(evBlocker.amount, 0, '0 zadanych = event z kwotą 0 (CR 119.3)');
  assert.ok(events.some((e) => e.type === 'damage_prevented' && e.objectId === 'blk'));
});

// --------------------------------------------------------------- 2. CR 119.3

test('B2: damage_dealt blokera niesie kwotę ZADANĄ (po prewencji), lifelink od zadanych (CR 119.3/702.15)', () => {
  const state = enterCombat(
    [['att', 'p1', 5, 5]],
    [['blk', 'p2', 4, 4, { keywords: ['lifelink'] }]],
  );
  // Tarcza 3 na atakującym — bloker 4/4 zadaje 4, tarcza zjada 3, doszło 1.
  state.damageShields = [{ targetId: 'att', remaining: 3, sourceCardId: 'withstand' }];
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['att'] }).ok, true);
  assert.equal(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { att: ['blk'] } }).ok, true);
  const result = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.equal(result.ok, true, JSON.stringify(result.events));
  assert.equal(state.objects.get('att').damage, 1, 'atakujący ma 1 obrażenie');
  assert.equal(state.players.find((p) => p.id === 'p2').life, 21, 'lifelink = 1 (tylko doszłe obrażenia)');
  const ev = result.events.find((e) => e.type === 'damage_dealt' && e.source === 'blk');
  assert.equal(ev.amount, 1, 'event niesie 1, nie 4 (sprzed prewencji)');
});

test('B2b: damage_to_controller raportuje kwotę zadaną po prewencji (CR 119.3)', () => {
  const state = createGameState({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }] });
  addCreature(state, 'src', 'p1', 1, 1);
  state.damageShields = [{ targetId: 'p1', remaining: 1, sourceCardId: 'withstand' }];
  // Forge Devil: „it deals 1 damage to you" — kontroler ma tarczę 1.
  applyEffect(state, { type: 'damage_to_controller', amount: 1 }, state.objects.get('src'), []);
  const ev = state.events.filter((e) => e.type === 'damage_dealt').at(-1);
  assert.equal(ev.amount, 0, 'w pełni zapobiegnięte — event z kwotą 0');
  assert.equal(state.players.find((p) => p.id === 'p1').life, 20, 'brak utraty życia');
});

// ---------------------------------------------------------- 3. CR 701.27a

test('B3: proliferate celuje w gracza ze znacznikami trucizny i dokłada poison (CR 701.27a)', () => {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  addCreature(state, 'src', 'p1', 1, 1);
  const victim = state.players.find((p) => p.id === 'p2');
  victim.poison = 2; // trucizna z infect — pole player.poison (SBA)
  applyEffect(state, { type: 'proliferate' }, state.objects.get('src'), []);
  assert.ok(state.pendingProliferate, 'proliferate kolejkuje decyzję');
  assert.ok(state.pendingProliferate.candidateIds.includes('p2'), 'gracz z poison jest kandydatem');
  const r = execute(state, { type: 'resolve_proliferate', playerId: 'p1', targetIds: ['p2'] });
  assert.equal(r.ok, true, JSON.stringify(r.events));
  assert.equal(victim.poison, 3, '+1 licznik trucizny na graczu');
});

test('B3b: proliferate doprowadza poison do 10 i kończy grę (CR 104.2c/701.27a)', () => {
  const state = createGameState({ seed: 6, players: [{ id: 'p1' }, { id: 'p2' }] });
  addCreature(state, 'src', 'p1', 1, 1);
  const victim = state.players.find((p) => p.id === 'p2');
  victim.poison = 9;
  applyEffect(state, { type: 'proliferate' }, state.objects.get('src'), []);
  const r = execute(state, { type: 'resolve_proliferate', playerId: 'p1', targetIds: ['p2'] });
  assert.equal(r.ok, true, JSON.stringify(r.events));
  assert.equal(state.status, 'finished', '10 trucizny = przegrana');
  assert.equal(state.winnerId, 'p1');
  assert.ok(r.events.some((e) => e.type === 'player_lost' && e.reason === 'poison_ten'));
});

// ------------------------------------------------------------ 4. CR 401.4

function resolveStack(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 100) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const pick = view.legalCommands.find((c) => c.type === 'pass_priority') ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) return false;
    const r = execute(state, pick);
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0;
}

test('B4: mill_from_bottom bierze spód biblioteki GRACZA-CELU, nie koniec wspólnej listy (CR 401.4)', () => {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  // Wspólna lista biblioteki: [p1-x, p2-a, p2-b, p1-y] — p1-y to karta P1 na
  // końcu listy (np. po scry-bottom albo mulligan-bottom P1). Spód biblioteki
  // P2 to p2-b (ostatnia WŁASNA karta P2), nie ostatni element listy.
  for (const id of ['p1-x', 'p2-a', 'p2-b', 'p1-y']) {
    const ctrl = id.startsWith('p1') ? 'p1' : 'p2';
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: `c-${id}`, controllerId: ctrl, zone: 'library',
      kind: 'land', manaCost: 0, abilities: [], keywords: [], subtypes: [],
      types: ['Land'], colors: [],
    });
  }
  // Cellar Door (ISD): {3}, {T}: target player mills 1 (z warunkowym Zombie).
  const def = REGISTRY.get('cellar-door');
  const data = gameObjectDataOf(def);
  addObject(state, {
    id: 'door', instanceId: 'i-door', cardId: 'cellar-door', controllerId: 'p1',
    zone: 'battlefield', kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], cardName: def.name,
  });
  addMana(state, 'p1', 3);
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'door', abilityIndex: 0, targets: ['p2'] });
  assert.equal(r.ok, true, JSON.stringify(r.events));
  resolveStack(state); // D: zdolność na stosie → mill po rozstrzygnięciu
  // Młynowana karta dostaje nowe id w grobie (CR 400.7) — szukamy po cardId.
  const milled = state.zones.graveyard
    .map((id) => state.objects.get(id))
    .find((o) => o?.cardId === 'c-p2-b');
  assert.ok(milled, 'młynowana jest ostatnia karta P2 (spód biblioteki celu)');
  assert.ok(state.zones.library.some((id) => state.objects.get(id)?.cardId === 'c-p1-y'),
    'karta P1 z końca wspólnej listy zostaje w bibliotece');
  assert.ok(state.zones.library.some((id) => state.objects.get(id)?.cardId === 'c-p2-a'),
    'pozostałe karty P2 zostają w bibliotece');
});

// ------------------------------------------------------------ 5. CR 108.3

test('B5: bounce_permanent wraca na rękę WŁAŚCICIELA, nie kontrolera (CR 108.3/400.7)', () => {
  const state = createGameState({ seed: 13, players: [{ id: 'p1' }, { id: 'p2' }] });
  addCreature(state, 'src', 'p1', 1, 1);
  // Stwór P2 przejęty przez P1 (Puppeteer Clique): ownerId = p2, controllerId = p1.
  addCreature(state, 'stolen', 'p1', 2, 2, { ownerId: 'p2' });
  applyEffect(state, { type: 'bounce_permanent' }, state.objects.get('src'), ['stolen']);
  const handId = state.zones.hand.find((id) => state.objects.get(id)?.cardId === 'c-stolen');
  assert.ok(handId, 'przejęty stwór wylądował w czyjejś ręce');
  const bounced = state.objects.get(handId);
  assert.equal(bounced.controllerId, 'p2', 'karta w ręce WŁAŚCICIELA');
  assert.equal(state.objects.get('stolen'), undefined, 'stary obiekt zniknął (nowe id strefy)');
});
