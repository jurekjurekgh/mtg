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

// ---------------------------------------------------------------------------
// M218/2 — MEANINGFULNESS (kryterium właściciela, 2026-08-26):
// „jeśli atakuje kreatura 1/1 i blokuje ją kreatura 5/5, to pompowanie
// atakującego +2/+2 nie ma żadnego sensu, bo nie zmienia wyniku walki ani
// o jotę”. Okno walki (Etap 1) to warunek KONIECZNY, nie wystarczający —
// pump/debuff, który nie zmienia wyniku toczonej wymiany, ma wartość zero.
// Każdy scenariusz symuluje wynik walki przed/po (simulateCombat).
// ---------------------------------------------------------------------------

/**
 * Pojedynek 1v1 w kroku declare_blockers: `bot` (p2) kontra `foe` (p1).
 * `botAttacks=true` → bot atakuje, wróg blokuje; false → wróg atakuje,
 * bot blokuje. Parametry P/T i keywordy jawne, ręka bota według `hand`
 * (null = brak czaru, tylko zdolność wilka).
 */
function duelBoard({ botAttacks, botPower, botToughness, botKeywords = [], foePower, foeToughness, foeKeywords = [], hand = 'brute-force', wolfAbilities = [] }) {
  const state = createGameState({ seed: 23, players: [{ id: 'p1' }, { id: 'p2' }] });
  const active = botAttacks ? 'p2' : 'p1';
  state.turn = jumpToStep(state.turn, 'declare_blockers', active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);
  const wolf = REGISTRY.get('snarling-wolf');
  addObject(state, {
    id: 'wolf', instanceId: 'i-w3', cardId: 'snarling-wolf', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: botPower, toughness: botToughness, manaCost: 1,
    abilities: wolfAbilities, keywords: botKeywords, subtypes: ['Wolf'], types: ['Creature'], colors: ['G'],
  });
  state.objects.set('wolf', Object.freeze({ ...state.objects.get('wolf'), summoningSickness: false }));
  addObject(state, {
    id: 'foe', instanceId: 'i-f3', cardId: 'goblin-piker', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: foePower, toughness: foeToughness, manaCost: 2,
    abilities: [], keywords: foeKeywords, subtypes: [], types: ['Creature'], colors: ['R'],
  });
  if (hand) {
    const def = REGISTRY.get(hand);
    addObject(state, {
      id: hand, instanceId: `i-${hand}`, cardId: hand, controllerId: 'p2', ownerId: 'p2',
      zone: 'hand', kind: 'spell', manaCost: def.manaCost ?? 1, spell: def.spell ?? null,
      types: ['Instant'], colors: ['U'],
    });
  }
  state.combat = botAttacks
    ? { attackers: ['wolf'], attackingPlayerId: 'p2', blockers: new Map([['wolf', ['foe']]]), blockedAttackers: new Set(['wolf']) }
    : { attackers: ['foe'], attackingPlayerId: 'p1', blockers: new Map([['foe', ['wolf']]]), blockedAttackers: new Set(['foe']) };
  // M280/D: syntetyczna plansza nie modeluje biblioteki, a rider „Dobierz
  // kartę" (Fleeting Distraction) przy pustej bibliotece wygląda jak deck-out
  // (CR 121.4/704.5b) — bot odmawiał rzutu debuffu, choć test sprawdza WYNIK
  // WALKI, nie bibliotekę. Kilka kart przywraca realne warunki.
  for (let i = 0; i < 5; i += 1) {
    addObject(state, {
      id: `lib-${i}`, instanceId: `i-lib-${i}`, cardId: 'hill-giant', controllerId: 'p2', ownerId: 'p2',
      zone: 'library', kind: 'creature', power: 3, toughness: 3, manaCost: 4,
      abilities: [], keywords: [], subtypes: ['Giant'], types: ['Creature'], colors: ['R'],
    });
  }
  return state;
}

const castsHand = (cmd, handId) => cmd?.type === 'cast_spell' && cmd.objectId === handId;

test('M218/2a: pump +3/+3 NIE rzucany, gdy atakujący 1/1 i tak ginie od 5/5 (przykład właściciela)', () => {
  // Przykład wprost z kryterium: 1/1 atakuje, blokuje 5/5. Bez pumpu: 1/1
  // ginie, 5/5 przeżywa, 0 na twarz. Z +3/+3: 4/4 ginie (5 ≥ 4), 5/5 przeżywa
  // — dokładnie ten sam wynik walki. Zero wartości → NIE rzuca.
  const state = duelBoard({ botAttacks: true, botPower: 1, botToughness: 1, foePower: 5, foeToughness: 5 });
  const view = playerView(state, 'p2');
  assert.ok((view.legalCommands ?? []).some((c) => castsHand(c, 'brute-force')), 'warunek wstępny: czar legalny');
  const choice = createHeuristicBot({ seed: 23 }).chooseCommand(view, {});
  assert.ok(!castsHand(choice, 'brute-force'),
    `pump bez zmiany wyniku walki: ${JSON.stringify(choice)}`);
});

test('M218/2b: pump +3/+3 rzucany, gdy 2/2 atakuje 4/4 (zmienia wynik na zysk)', () => {
  // Bez pumpu 2/2 ginie, bloker przeżywa. Z +3/+3: 5/5 zabija 4/4 i przeżywa
  // — wynik walki realnie się zmienia (wymiana na korzyść).
  const state = duelBoard({ botAttacks: true, botPower: 2, botToughness: 2, foePower: 4, foeToughness: 4 });
  const choice = createHeuristicBot({ seed: 23 }).chooseCommand(playerView(state, 'p2'), {});
  assert.ok(castsHand(choice, 'brute-force'),
    `pump zmieniający wynik walki ma być wybrany: ${JSON.stringify(choice)}`);
});

test('M218/2c: pump NIE rzucany, gdy nasz bloker 1/1 i tak ginie od 5/5', () => {
  // Symetrycznie: bronimy się 1/1 przed 5/5. +3/+3 daje 4/4 — atakujący
  // wciąż zadaje 5 ≥ 4 i zabija; nasz bloker dalej ginie, atakujący przeżywa.
  const state = duelBoard({ botAttacks: false, botPower: 1, botToughness: 1, foePower: 5, foeToughness: 5 });
  const choice = createHeuristicBot({ seed: 23 }).chooseCommand(playerView(state, 'p2'), {});
  assert.ok(!castsHand(choice, 'brute-force'),
    `pump blokera bez zmiany wyniku: ${JSON.stringify(choice)}`);
});

test('M218/2d: pump na 1/1 deathtouch+trample vs 5/5 rzucany (face 0→3)', () => {
  // Deathtouch: 1 obrażenie wystarcza na zabicie blokera (CR 702.4), więc
  // nadmiar z trample po lethal idzie na twarz (CR 702.19). Bez pumpu: 1/1
  // zadaje 1 (5/5 ginie od deathtouch), ale sam ginie od 5 — face 0.
  // Z +3/+3: 4/4 — lethal nadal 1, nadmiar 3 na twarz, ginie od 5 → face 3.
  const state = duelBoard({ botAttacks: true, botPower: 1, botToughness: 1, botKeywords: ['deathtouch', 'trample'], foePower: 5, foeToughness: 5 });
  const choice = createHeuristicBot({ seed: 23 }).chooseCommand(playerView(state, 'p2'), {});
  assert.ok(castsHand(choice, 'brute-force'),
    `trample+deathtouch ma realny efekt — pump wybrany: ${JSON.stringify(choice)}`);
});

test('M218/2e: pump na 3/3 trample vs 2/2 rzucany (face 1→4)', () => {
  // Bez pumpu: lethal 2, nadmiar 1 na twarz — 3/3 przeżywa (otrzyma 2).
  // Z +3/+3: face 4 → realna zmiana.
  const state = duelBoard({ botAttacks: true, botPower: 3, botToughness: 3, botKeywords: ['trample'], foePower: 2, foeToughness: 2 });
  const choice = createHeuristicBot({ seed: 23 }).chooseCommand(playerView(state, 'p2'), {});
  assert.ok(castsHand(choice, 'brute-force'),
    `trample nadmiarowy: ${JSON.stringify(choice)}`);
});

test('M218/2f: pump na 3/3 BEZ trample vs 2/2 NIE rzucany (wynik bez zmian)', () => {
  // Brak trample: nadmiar po lethal wpada w blokera (CR 510.1b) — bloker
  // i tak ginie, 3/3 przeżywa, face 0. Z +3/+3 wynik identyczny.
  const state = duelBoard({ botAttacks: true, botPower: 3, botToughness: 3, foePower: 2, foeToughness: 2 });
  const choice = createHeuristicBot({ seed: 23 }).chooseCommand(playerView(state, 'p2'), {});
  assert.ok(!castsHand(choice, 'brute-force'),
    `pump bez trample nie zmienia wyniku: ${JSON.stringify(choice)}`);
});

test('M218/2g: pump na naszym blokerze 2/2 vs 4/4 rzucany (bloker przeżywa, atakujący ginie)', () => {
  // Bez pumpu: 4/4 zadaje 4 ≥ 2 → nasz bloker ginie; bloker zadaje 2, wróg
  // przeżywa. Z +3/+3: 5/5 przyjmuje 4 < 5 → przeżywa i zabija 4/4 (5 ≥ 4).
  const state = duelBoard({ botAttacks: false, botPower: 2, botToughness: 2, foePower: 4, foeToughness: 4 });
  const choice = createHeuristicBot({ seed: 23 }).chooseCommand(playerView(state, 'p2'), {});
  assert.ok(castsHand(choice, 'brute-force'),
    `pump blokera zmieniający wynik: ${JSON.stringify(choice)}`);
});

test('M218/2h: masowy debuff −2/−0 NIE rzucany, gdy 5/5 atakuje nasz 1/1', () => {
  // Turn the Tide: −2/−0 na wszystkich wrogich stworach. 5/5 → 3/5, ale
  // wobec 1/1 wynik walki identyczny: bloker ginie (3 ≥ 1), face 0.
  const state = duelBoard({ botAttacks: false, botPower: 1, botToughness: 1, foePower: 5, foeToughness: 5, hand: 'turn-the-tide' });
  const view = playerView(state, 'p2');
  const castsTide2 = (cmd) => castsHand(cmd, 'turn-the-tide');
  assert.ok((view.legalCommands ?? []).some(castsTide2), 'warunek wstępny: czar legalny');
  const choice = createHeuristicBot({ seed: 23 }).chooseCommand(view, {});
  assert.ok(!castsTide2(choice),
    `debuff bez zmiany wyniku: ${JSON.stringify(choice)}`);
});

test('M218/2i: masowy debuff −2/−0 rzucany, gdy 5/5 atakuje nasz 4/4', () => {
  // Bez debuffu: 5 ≥ 4 → bloker ginie, 4 ≥ 5? nie — atakujący przeżywa.
  // Z −2/−0: 3/5 zadaje 3 < 4 → bloker przeżywa. Wynik się zmienia.
  const state = duelBoard({ botAttacks: false, botPower: 4, botToughness: 4, foePower: 5, foeToughness: 5, hand: 'turn-the-tide', wolfAbilities: [] });
  const choice = createHeuristicBot({ seed: 23 }).chooseCommand(playerView(state, 'p2'), {});
  assert.ok(castsHand(choice, 'turn-the-tide'),
    `debuff zmieniający wynik: ${JSON.stringify(choice)}`);
});

test('M218/2j: debuff −1/−0 rzucany, gdy 5/5 atakuje nasz 4/5 (bloker przestaje ginąć)', () => {
  // Fleeting Distraction: −1/−0. Bez: 5 ≥ 5 → 4/5 ginie. Z: 4/5 zadaje 4 < 5
  // → przeżywa. Realna zmiana.
  const state = duelBoard({ botAttacks: false, botPower: 4, botToughness: 5, foePower: 5, foeToughness: 5, hand: 'fleeting-distraction', wolfAbilities: [] });
  const choice = createHeuristicBot({ seed: 23 }).chooseCommand(playerView(state, 'p2'), {});
  assert.ok(castsHand(choice, 'fleeting-distraction'),
    `debuff ratujący blokera: ${JSON.stringify(choice)}`);
});

test('M218/2k: debuff −1/−0 NIE rzucany, gdy 5/5 atakuje nasz 1/1 (wciąż ginie)', () => {
  // 5/5 → 4/5, ale 4 ≥ 1 — bloker dalej ginie, wynik bez zmian.
  const state = duelBoard({ botAttacks: false, botPower: 1, botToughness: 1, foePower: 5, foeToughness: 5, hand: 'fleeting-distraction', wolfAbilities: [] });
  const choice = createHeuristicBot({ seed: 23 }).chooseCommand(playerView(state, 'p2'), {});
  assert.ok(!castsHand(choice, 'fleeting-distraction'),
    `debuff bez zmiany wyniku: ${JSON.stringify(choice)}`);
});

test('M218/2l: zdolność +2/+2 (Snarling Wolf) NIE aktywowana, gdy bloker 1/1 i tak ginie od 5/5', () => {
  // Kolejność z 2a–2c przez gałąź ZDOLNOŚCI (Etap 1 pokrył tylko okno):
  // +2/+2 daje 3/3, atakujący 5/5 wciąż zabija (5 ≥ 3) — zero wartości.
  const state = duelBoard({ botAttacks: false, botPower: 1, botToughness: 1, foePower: 5, foeToughness: 5, hand: null, wolfAbilities: REGISTRY.get('snarling-wolf').abilities ?? [] });
  const view = playerView(state, 'p2');
  assert.ok((view.legalCommands ?? []).some(pumpsWolfAbility), 'warunek wstępny: zdolność legalna');
  const choice = createHeuristicBot({ seed: 23 }).chooseCommand(view, {});
  assert.ok(!pumpsWolfAbility(choice),
    `zdolność bez zmiany wyniku: ${JSON.stringify(choice)}`);
});
