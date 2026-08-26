// M218/1 — audyt wyceny działań bota wg grup czarów: okna walki w CZARACH.
//
// Uzasadnienie (zlecenie właściciela 2026-08-26): „czary bojowe pompujące
// statystyki mają sens wyłącznie w sytuacjach bojowych; zdolności/czary
// o szybkości instant tylko w fazach walki i TYLKO po deklaracji atakujących
// (wzmacnianie ataku) i po deklaracji blokujących (wzmacnianie bloku)".
//
// L64 (lekcja projektowa): bramka `phase === 'combat'` przepuszcza kroki,
// w których nikt jeszcze (albo już) nie walczy — `beginning_of_combat` i
// `end_of_combat` należą do tej samej fazy co `declare_attackers`.
// M206 naprawił to w `activate_ability`, ale bliźniacza gałąź `cast_spell`
// (naprawa M146) zachowała stary warunek — L41: bliźniacze gałęzie
// rozjeżdżają się w ciszy.
//
// Te testy sprawdzają ZACHOWANIE `cast_spell` (Brute Force +3/+3), bo test
// M206/A1 pokrywał wyłącznie zdolność aktywowaną (Snarling Wolf).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

/**
 * Plansza: stwór bota 1/1 + stwór wroga 2/2 (bloker). Bot ma w ręce
 * Brute Force (instant +3/+3) i manę 10. Krok i udział w walce konfigurowane.
 */
function board(step, { attacking = false, blocker = false } = {}) {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);
  const bf = REGISTRY.get('brute-force');
  addObject(state, {
    id: 'wolf', instanceId: 'i-w', cardId: 'snarling-wolf', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 1, toughness: 1, manaCost: 1,
    abilities: (REGISTRY.get('snarling-wolf').abilities ?? []), keywords: [],
    subtypes: ['Wolf'], types: ['Creature'], colors: ['G'],
  });
  state.objects.set('wolf', Object.freeze({ ...state.objects.get('wolf'), summoningSickness: false }));
  if (blocker) {
    addObject(state, {
      id: 'blk', instanceId: 'i-b', cardId: 'goblin-piker', controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2,
      abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['R'],
    });
  }
  // Ręka bota: Brute Force.
  addObject(state, {
    id: 'bf', instanceId: 'i-bf', cardId: 'brute-force', controllerId: 'p2', ownerId: 'p2',
    zone: 'hand', kind: 'spell', manaCost: 1, spell: bf.spell ?? null, types: ['Instant'], colors: ['R'],
  });
  if (attacking) {
    state.combat = {
      attackers: ['wolf'],
      attackingPlayerId: 'p2',
      blockers: blocker ? new Map([['wolf', ['blk']]]) : new Map(),
      blockedAttackers: blocker ? new Set(['wolf']) : new Set(),
    };
  }
  return state;
}

const castsBruteForce = (cmd) => cmd.type === 'cast_spell' && cmd.objectId === 'bf';

test('M218/1a: bot NIE rzuca instant-pump w POCZĄTKU WALKI (przed deklaracją)', () => {
  // L64 w gałęzi cast_spell: `phase === 'combat'` przepuszcza beginning_of_combat,
  // choć atakujący jeszcze nie są zadeklarowani — +3/+3 wygaśnie w cleanup
  // (CR 514.2), a czekanie do declare_attackers nic nie kosztuje (CR 508.1).
  const view = playerView(board('beginning_of_combat', { attacking: false }), 'p2');
  assert.ok((view.legalCommands ?? []).some(castsBruteForce), 'warunek wstępny: czar legalny');
  const choice = createHeuristicBot({ seed: 11 }).chooseCommand(view, {});
  assert.ok(!castsBruteForce(choice),
    `pump przed deklaracją ataku to wyrzucona karta+mana: ${JSON.stringify(choice)}`);
});

test('M218/1b: bot NIE rzuca instant-pump w KOŃCU WALKI (spotka się po deklaracji, ale stwór nie walczy)', () => {
  // Uczestnictwo w walce liczy się z `state.combat` (view.combat.attackers/blockers),
  // nie z nazwy kroku: w end_of_combat stwór już nie atakuje, więc +3/+3
  // nie dotknie żadnych obrażeń.
  const view = playerView(board('end_of_combat'), 'p2');
  assert.ok((view.legalCommands ?? []).some(castsBruteForce), 'warunek wstępny: czar legalny');
  const choice = createHeuristicBot({ seed: 11 }).chooseCommand(view, {});
  assert.ok(!castsBruteForce(choice),
    `pump poza wymianą bojową: ${JSON.stringify(choice)}`);
});

test('M218/1c: bot rzuca instant-pump PO deklaracji blokujących (wzmacnia blok)', () => {
  // Kontrola pozytywna: 1/1 atakującego blokuje 2/2. Bez pumpu wilk ginie
  // i nic nie przechodzi; z +3/+3 wilk 4/4 zabija 2/2 i przeżywa. To jest
  // właściwe okno instantu (po deklaracji blokujących) — czar MUSI być wybrany,
  // inaczej naprawa zabiłaby mechanikę zamiast ją naprawić (M206/A2 analog).
  const state = board('declare_blockers', { attacking: true, blocker: true });
  const choice = createHeuristicBot({ seed: 11 }).chooseCommand(playerView(state, 'p2'), {});
  assert.ok(castsBruteForce(choice),
    `pump w obronie wymiany bojowej ma sens i ma być wybrany: ${JSON.stringify(choice)}`);
});

test('M218/1d: bot NIE rzuca instant-pump w PODTRZYMANIU przeciwnika (nikt nie atakuje)', () => {
  // Tura przeciwnika: pump na stwora, który nikogo nie blokuje, to strata
  // (kara obowiązywała dotąd tylko dla własnej tury — M206/A1c dla zdolności;
  // czary miały `!myTurnNow → trick 12` bezwarunkowo).
  const state = board('upkeep');
  state.turn.activePlayerId = 'p1';
  const view = playerView(state, 'p2');
  assert.ok((view.legalCommands ?? []).some(castsBruteForce), 'warunek wstępny: czar legalny');
  const choice = createHeuristicBot({ seed: 11 }).chooseCommand(view, {});
  assert.ok(!castsBruteForce(choice),
    `pump w upkeepie przeciwnika: ${JSON.stringify(choice)}`);
});

test('M218/1e: bot rzuca instant-pump na WŁASNYM ATKAKUJĄCYM po deklaracji atakujących, gdy brak blokerów', () => {
  // Kontrola pozytywna nr 2: atakujący 1/1, wróg nie ma czym zablokować —
  // +3/+3 zamienia 1 obrażenie w 4 (zadawane już po deklaracji, więc efekt
  // nie może być "spoiled"). Okno: declare_attackers.
  const state = board('declare_attackers', { attacking: true, blocker: false });
  const choice = createHeuristicBot({ seed: 11 }).chooseCommand(playerView(state, 'p2'), {});
  assert.ok(castsBruteForce(choice),
    `pump na otwartego atakującego po deklaracji: ${JSON.stringify(choice)}`);
});

// ---------------------------------------------------------------------------
// A2 (L41): ta sama bramka `phase === 'combat'` w masowym buffu czarów
// (Turn the Tide: „Creatures your opponents control get -2/-0 until end
// of turn") — początek/koniec walki to fazowe „combat", choć nikt nie walczy.
// ---------------------------------------------------------------------------

/** Plansza + Turn the Tide w ręce bota (masowy debuff wrogich stworów). */
function boardWithTide(step, { attacking = false } = {}) {
  const state = createGameState({ seed: 13, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);
  // Wróg ma 2/2 — jest na kogo działać (efekt nie jest pusty).
  addObject(state, {
    id: 'foe', instanceId: 'i-f', cardId: 'goblin-piker', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['R'],
  });
  const tide = REGISTRY.get('turn-the-tide');
  addObject(state, {
    id: 'tide', instanceId: 'i-t', cardId: 'turn-the-tide', controllerId: 'p2', ownerId: 'p2',
    zone: 'hand', kind: 'spell', manaCost: 2, spell: tide.spell ?? null, types: ['Instant'], colors: ['U'],
  });
  if (attacking) {
    // Wróg zadeklarował atak: foe nadlatuje, bot ma okno odpowiedzi.
    state.combat = {
      attackers: ['foe'],
      attackingPlayerId: 'p1',
      blockers: new Map(),
      blockedAttackers: new Set(),
    };
  }
  return state;
}

const castsTide = (cmd) => cmd.type === 'cast_spell' && cmd.objectId === 'tide';

test('M218/1f: bot NIE rzuca masowego debuffu wrogich stworów w POCZĄTKU WALKI (nikt nie walczy)', () => {
  // Bliźniacza L64 w gałęzi buff_opponents_creatures: `phase === 'combat'`
  // przepuszcza beginning_of_combat, choć atakujący nie są zadeklarowani.
  const view = playerView(boardWithTide('beginning_of_combat'), 'p2');
  assert.ok((view.legalCommands ?? []).some(castsTide), 'warunek wstępny: czar legalny');
  const choice = createHeuristicBot({ seed: 13 }).chooseCommand(view, {});
  assert.ok(!castsTide(choice),
    `masowy debuff przed deklaracjami: ${JSON.stringify(choice)}`);
});

test('M218/1g: bot NIE rzuca masowego debuffu w PODTRZYMANIU przeciwnika (nikt nie atakuje)', () => {
  const state = boardWithTide('upkeep');
  state.turn.activePlayerId = 'p1';
  const view = playerView(state, 'p2');
  assert.ok((view.legalCommands ?? []).some(castsTide), 'warunek wstępny: czar legalny');
  const choice = createHeuristicBot({ seed: 13 }).chooseCommand(view, {});
  assert.ok(!castsTide(choice),
    `masowy debuff w upkeepie przeciwnika: ${JSON.stringify(choice)}`);
});

test('M218/1h: bot rzuca masowy debuff PO deklaracji atakujących wroga (osłabia nadlatujące obrażenia)', () => {
  // Kontrola pozytywna A2: wróg zadeklarował 2/2, −2/−0 sprowadza go do 0/2 —
  // obrażenia zostają zredukowane. To właściwe okno instanta.
  const state = boardWithTide('declare_attackers', { attacking: true });
  const choice = createHeuristicBot({ seed: 13 }).chooseCommand(playerView(state, 'p2'), {});
  assert.ok(castsTide(choice),
    `masowy debuff po deklaracji atakujących wroga: ${JSON.stringify(choice)}`);
});

// ---------------------------------------------------------------------------
// L41 c.d.: bliźniacza gałąź ZDOLNOŚCI (M206) czyta `recipient?.blocking`,
// ale playerView NIE wystawia tego pola (game-state.js zna tylko
// `entry.attacking` z state.combat.attackers). Bloker jest widoczny
// WYŁĄCZNIE w widoku przez `view.combat.blockers` — M206/A2 przechodził
// tylko dlatego, że jego wilk był ATAKUJĄCYM. Pump na BLOKERZE (wzmacnianie
// bloku — wprost w kryteriach właściciela) ma być dostępny.
// ---------------------------------------------------------------------------

/** Plansza z wilkiem bota + 2/2 wroga; tura p1 (p1 atakuje, p2 broni). */
function boardDefending(step, { blocking = false } = {}) {
  const state = createGameState({ seed: 17, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);
  const wolf = REGISTRY.get('snarling-wolf');
  addObject(state, {
    id: 'wolf', instanceId: 'i-w2', cardId: 'snarling-wolf', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 1, toughness: 1, manaCost: 1,
    abilities: wolf.abilities ?? [], keywords: [], subtypes: ['Wolf'], types: ['Creature'], colors: ['G'],
  });
  state.objects.set('wolf', Object.freeze({ ...state.objects.get('wolf'), summoningSickness: false }));
  addObject(state, {
    id: 'foe2', instanceId: 'i-f2', cardId: 'goblin-piker', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['R'],
  });
  if (blocking) {
    state.combat = {
      attackers: ['foe2'],
      attackingPlayerId: 'p1',
      blockers: new Map([['foe2', ['wolf']]]),
      blockedAttackers: new Set(['foe2']),
    };
  }
  return state;
}

const pumpsWolfAbility = (cmd) => cmd.type === 'activate_ability' && cmd.objectId === 'wolf';

test('M218/1i: bot pompuje ZDOLNOŚCIĄ własnego BLOKERA po deklaracji blokujących (wzmacnia blok)', () => {
  // Kryterium właściciela: „po deklaracji blokujących (wzmacnianie bloku)".
  // 1/1 vs 2/2: bez pumpu wilk ginie; z +2/+2 (3/3) zabija i przeżywa.
  // M206 czyta przy tym `recipient?.blocking` — pola, którego widok NIE
  // wystawia, więc zdolności pomijały blokera jako „nieuczestniczącego".
  const state = boardDefending('declare_blockers', { blocking: true });
  const view = playerView(state, 'p2');
  assert.ok((view.legalCommands ?? []).some(pumpsWolfAbility), 'warunek wstępny: zdolność legalna');
  const choice = createHeuristicBot({ seed: 17 }).chooseCommand(view, {});
  assert.ok(pumpsWolfAbility(choice),
    `pump blokera w obronie wymiany ma być wybrany: ${JSON.stringify(choice)}`);
});

test('M218/1j: bot NIE pompuje ZDOLNOŚCIĄ w PODTRZYMANIU przeciwnika, gdy stwór nikogo nie blokuje', () => {
  // Kontrola do 1i: to samo okno, ale bez deklaracji bloków (upkeep p1) —
  // M206/A1c już to pokrywał; potwierdzamy po zmianie na wspólny helper.
  const state = boardDefending('upkeep');
  const view = playerView(state, 'p2');
  assert.ok((view.legalCommands ?? []).some(pumpsWolfAbility), 'warunek wstępny: zdolność legalna');
  const choice = createHeuristicBot({ seed: 17 }).chooseCommand(view, {});
  assert.ok(!pumpsWolfAbility(choice),
    `pump w upkeepie przeciwnika: ${JSON.stringify(choice)}`);
});
