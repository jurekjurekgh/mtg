// M190 — uwagi właściciela z testów (2026-08-22):
// A  — dwie zdolności many Heap Gate mają identyczny opis w panelu,
// A2 — log sugeruje 5 many zamiast jednej dowolnego koloru,
// B  — Undercity to GRAF pokoi (gracz wybiera ścieżkę), nie lista 1..9.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { commandLabel } from '../src/table/render.js';
import { manaSourcesOf } from '../src/table/mana-wizard.js';
import { describeGameEvent } from '../src/table/session.js';
import { UNDERCITY_ROOMS, ventureIntoUndercityForTest } from '../src/engine/effects.js';
import { createHeuristicBot, UNDERCITY_ROOM_LINKS as HEURISTIC_UNDERCITY_LINKS } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();
const HELPERS = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
  nameOfObject: (id) => String(id),
};
const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };
const SESSION = {
  nameOf: HELPERS.nameOf,
  nameOfObject: HELPERS.nameOfObject,
  cardDetails: (id) => REGISTRY.get(id) ?? null,
  colorsOf: (id) => REGISTRY.get(id)?.colors ?? [],
  abilitiesOf: (id) => REGISTRY.get(id)?.abilities ?? [],
};

function game(playerId = 'p1') {
  const state = createGameState({ seed: 190, players: [{ id: 'p1' }, { id: 'p2' }] });
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

// ---- A: rozróżnialne etykiety zdolności many ------------------------------

test('M190/A: dwie zdolności many Heap Gate mają RÓŻNE opisy w panelu', () => {
  const state = game('p1');
  putCard(state, 'gate', 'heap-gate', 'p1', 'battlefield', {});
  putCard(state, 'src', 'basic-plains', 'p1');
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'gate');
  assert.ok(offers.length >= 2, `co najmniej dwie oferty (jest ${offers.length})`);
  const labels = offers.map((c) => commandLabel(c, SESSION, playerView(state, 'p1')));
  const unique = new Set(labels);
  assert.equal(unique.size, labels.length,
    `każda oferta ma własny opis, inaczej gracz nie wie, co klika: ${JSON.stringify(labels)}`);
  assert.ok(labels.some((l) => /dowolnego koloru|dowolny kolor/i.test(l)),
    `wariant „add one mana of any color" nazwany wprost: ${JSON.stringify(labels)}`);
  assert.ok(labels.some((l) => /bezbarwn/i.test(l)),
    `wariant „{T}: Add {C}" nazwany wprost: ${JSON.stringify(labels)}`);
});

test('M190/A1b: zdolność produkująca KONKRETNE kolory nadal je wymienia', () => {
  // Jeskai Devotee: „{1}: Add {U}, {R}, or {W}" — trzy kolory do wyboru,
  // to NIE jest „dowolny kolor" (kontrola anty-over-fix dla M150/C2).
  const state = game('p1');
  putCard(state, 'dev', 'jeskai-devotee', 'p1', 'battlefield', {});
  putCard(state, 'land', 'basic-plains', 'p1');
  const offer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'dev');
  assert.ok(offer, 'oferta aktywacji');
  const label = commandLabel(offer, SESSION, playerView(state, 'p1'));
  assert.ok(!/dowolnego koloru/i.test(label),
    `trzy wybrane kolory to nie „dowolny kolor": ${JSON.stringify(label)}`);
});

// ---- A2: log nie kłamie o liczbie many -----------------------------------

test('M190/A2: log mówi o JEDNEJ manie dowolnego koloru, nie o pięciu', () => {
  const line = String(describeGameEvent({
    type: 'ability_activated', playerId: 'p1', cardId: 'heap-gate',
    sourceId: 'gate', effectTypes: ['add_mana'], manaColors: ['W', 'U', 'B', 'R', 'G'],
    manaAmount: 1, manaAnyColor: true,
  }, HELPERS, NAMES));
  assert.ok(!line.includes('{W}, {U}, {B}, {R}, {G}'),
    `lista pięciu symboli sugeruje pięć many: ${JSON.stringify(line)}`);
  assert.match(line, /dowolnego koloru/,
    `opis mówi wprost o manie dowolnego koloru: ${JSON.stringify(line)}`);
});

test('M190/A2b: mana o wybranych kolorach nadal wymienia kolory (kontrola)', () => {
  // M193/A1 zmienil KONTRAKT opisu: konkretne kolory nazywamy po polsku
  // („niebieskiej, czerwonej lub bialej") zamiast symbolami („{U}, {R}, {W}").
  // Intencja tego testu zostaje: zdolnosc o TRZECH kolorach nie moze byc
  // opisana jak „dowolny kolor" (kontrola anty-over-fix dla M150/C2).
  const line = String(describeGameEvent({
    type: 'ability_activated', playerId: 'p1', cardId: 'jeskai-devotee',
    sourceId: 'dev', effectTypes: ['add_mana'], manaColors: ['U', 'R', 'W'], manaAmount: 1,
  }, HELPERS, NAMES));
  assert.match(line, /niebieskiej, czerwonej lub białej/,
    `M150/C2 bez regresji — konkretne kolory nadal widoczne: ${JSON.stringify(line)}`);
  assert.ok(!/dowolnego koloru/i.test(line), 'trzy kolory to nie „dowolny kolor"');
});

test('M190/A2c: REALNA aktywacja Heap Gate — log bez listy pięciu symboli', () => {
  // Pełna ścieżka (silnik → zdarzenie → opis), nie ręcznie sklejone zdarzenie:
  // zgłoszenie właściciela dotyczyło tego, co widać po kliknięciu w grze.
  const state = game('p1');
  putCard(state, 'gate', 'heap-gate', 'p1', 'battlefield', {});
  addMana(state, 'p1', 1, { colors: ['G'] });
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'gate');
  // Wariant za {1} — „Add one mana of any color".
  const anyColor = offers.find((c) => c.abilityIndex === 1);
  assert.ok(anyColor, 'oferta zdolności „dowolny kolor"');
  assert.ok(execute(state, anyColor).ok);
  const activated = state.events.find((e) => e.type === 'ability_activated'
    && e.cardId === 'heap-gate');
  assert.ok(activated, 'zdarzenie aktywacji');
  assert.equal(activated.manaAmount, 1, 'zdarzenie niesie LICZBĘ many (L6)');
  const line = String(describeGameEvent(activated, HELPERS, NAMES));
  assert.ok(!line.includes('{W}, {U}, {B}, {R}, {G}'),
    `log nie wymienia pięciu symboli: ${JSON.stringify(line)}`);
  assert.match(line, /1 many dowolnego koloru/, `log mówi wprost: ${JSON.stringify(line)}`);
});

// ---- B: Undercity to GRAF pokoi, nie lista 1..9 --------------------------
// Zgłoszenie właściciela: „Rozpocząłem eksplorację od Secret Entrance.
// W kolejnej turze przeniosło mnie do pokoju 2 Forge. To tak nie działa.
// Powinienem wybrać ścieżkę — albo Forge, albo Lost Well."
// Oracle (Scryfall tclb/20): każdy pokój ma klauzulę „(Leads to: …)".

function venture(state, playerId = 'p1') {
  const before = state.events.length;
  ventureIntoUndercityForTest(state, playerId);
  return state.events.slice(before);
}

test('M190/B1: mapa przejść lochu zgadza się z Oracle (tclb/20)', () => {
  // Jedno źródło prawdy: dane, nie rozsypane warunki (ADR 0002/0010).
  const byName = new Map(UNDERCITY_ROOMS.map((room) => [room.name, room]));
  const expected = {
    'Secret Entrance': ['Forge', 'Lost Well'],
    Forge: ['Trap!', 'Arena'],
    'Lost Well': ['Arena', 'Stash'],
    'Trap!': ['Archives'],
    Arena: ['Archives', 'Catacombs'],
    Stash: ['Catacombs'],
    Archives: ['Throne of the Dead Three'],
    Catacombs: ['Throne of the Dead Three'],
    'Throne of the Dead Three': [],
  };
  for (const [name, leadsTo] of Object.entries(expected)) {
    const room = byName.get(name);
    assert.ok(room, `pokój ${name} istnieje`);
    assert.deepEqual(room.leadsTo ?? [], leadsTo, `ścieżki z „${name}"`);
  }
});

test('M190/B2: pierwsze venture wchodzi do Secret Entrance (bez wyboru)', () => {
  const state = game('p1');
  venture(state, 'p1');
  assert.equal(state.undercityProgress.p1, 1, 'gracz w pokoju 1');
  assert.ok(!state.pendingUndercityRoute, 'wejście do lochu nie wymaga wyboru trasy');
});

test('M190/B3: drugie venture PYTA o ścieżkę (Forge albo Lost Well)', () => {
  const state = game('p1');
  venture(state, 'p1');
  // Domykamy ewentualną decyzję pokoju 1 (Secret Entrance — szukanie landu).
  for (let i = 0; i < 6 && (state.pendingSearchChoice || state.pendingRoomTargets?.length); i += 1) {
    const cmd = playerView(state, 'p1').legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!cmd) break;
    execute(state, cmd);
  }
  venture(state, 'p1');
  assert.ok(state.pendingUndercityRoute, 'gracz wybiera następny pokój (CR 309.4)');
  const choices = state.pendingUndercityRoute.candidates.map((c) => c.name).sort();
  assert.deepEqual(choices, ['Forge', 'Lost Well'], 'obie ścieżki z Secret Entrance');
  assert.equal(state.undercityProgress.p1, 1, 'postęp NIE przesuwa się przed decyzją');
});

test('M190/B4: wybór „Lost Well" prowadzi do pokoju 3, nie do Forge', () => {
  const state = game('p1');
  venture(state, 'p1');
  for (let i = 0; i < 6 && (state.pendingSearchChoice || state.pendingRoomTargets?.length); i += 1) {
    const cmd = playerView(state, 'p1').legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!cmd) break;
    execute(state, cmd);
  }
  venture(state, 'p1');
  const lostWell = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_undercity_route' && c.roomName === 'Lost Well');
  assert.ok(lostWell, 'oferta wyboru „Lost Well"');
  assert.ok(execute(state, lostWell).ok);
  assert.equal(UNDERCITY_ROOMS[state.undercityProgress.p1 - 1].name, 'Lost Well',
    'gracz trafia tam, gdzie wybrał');
});

test('M190/B5: pokój z JEDNĄ ścieżką nie pyta (Trap! → Archives)', () => {
  const state = game('p1');
  // Ustawiamy gracza w Trap! (pokój 4) — jedyne wyjście to Archives.
  state.undercityProgress = { p1: 4 };
  venture(state, 'p1');
  assert.ok(!state.pendingUndercityRoute, 'jedna opcja = bez pytania (jak przy innych decyzjach)');
  assert.equal(UNDERCITY_ROOMS[state.undercityProgress.p1 - 1].name, 'Archives',
    'automatyczne przejście jedyną ścieżką');
});

test('M190/B6: loch kończy się na Throne — dalsze venture nic nie robi', () => {
  const state = game('p1');
  const throneIndex = UNDERCITY_ROOMS.findIndex((r) => r.name === 'Throne of the Dead Three') + 1;
  state.undercityProgress = { p1: throneIndex };
  const events = venture(state, 'p1');
  assert.equal(state.undercityProgress.p1, throneIndex, 'postęp bez zmian');
  assert.ok(!state.pendingUndercityRoute, 'brak decyzji po ukończeniu lochu');
  assert.deepEqual(events.filter((e) => e.type === 'ventured_into_undercity'), [],
    'żadnego wejścia do pokoju');
});

test('M190/B7: ścieżka NIE prowadzi przez wszystkie 9 pokoi (dowód na graf)', () => {
  // Najkrótsza trasa wg Oracle: Secret Entrance → Forge → Trap! → Archives
  // → Throne = 5 pokoi. Stara implementacja (current + 1) przechodziła 9.
  const state = game('p1');
  let visited = 0;
  for (let i = 0; i < 12; i += 1) {
    const beforeRoom = state.undercityProgress.p1 ?? 0;
    venture(state, 'p1');
    // Rozstrzygamy decyzje (trasa + ewentualny cel pokoju).
    for (let j = 0; j < 8; j += 1) {
      const cmd = playerView(state, 'p1').legalCommands.find((c) => c.type.startsWith('resolve_'));
      if (!cmd) break;
      execute(state, cmd);
    }
    if ((state.undercityProgress.p1 ?? 0) === beforeRoom) break;
    visited += 1;
    if (UNDERCITY_ROOMS[state.undercityProgress.p1 - 1].name === 'Throne of the Dead Three') break;
  }
  assert.ok(visited >= 4 && visited <= 6,
    `loch przechodzi się w 4–6 pokojach, nie w 9 (przeszedł ${visited})`);
});

test('M190/B8: bot wycenia ścieżki (nie bierze ślepo pierwszej oferty)', () => {
  const state = game('p2');
  state.undercityProgress = { p2: UNDERCITY_ROOMS.findIndex((r) => r.name === 'Forge') + 1 };
  ventureIntoUndercityForTest(state, 'p2');
  assert.ok(state.pendingUndercityRoute, 'wybór drogi z Forge (Trap! albo Arena)');
  const view = playerView(state, 'p2');
  const chosen = createHeuristicBot({ seed: 3 }).chooseCommand(view);
  assert.equal(chosen.type, 'resolve_undercity_route');
  assert.equal(chosen.roomName, 'Trap!',
    `5 życia w przeciwnika bije goad (bot wybrał: ${JSON.stringify(chosen.roomName)})`);
});

test('M190/B9: mapa dróg bota zgadza się z danymi silnika (jedno źródło prawdy)', () => {
  // Kontroler ma własną kopię do wyceny (ADR 0004 — bot czyta widok, nie stan);
  // strażnik pilnuje, żeby kopie się nie rozjechały (L41).
  const botLinks = HEURISTIC_UNDERCITY_LINKS;
  for (const room of UNDERCITY_ROOMS) {
    assert.deepEqual(botLinks[room.name] ?? [], [...(room.leadsTo ?? [])],
      `drogi z „${room.name}" identyczne w silniku i w bocie`);
  }
});
