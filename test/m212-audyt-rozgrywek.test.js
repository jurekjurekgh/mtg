// M212 — audyt rozgrywek Żywym Testerem (2026-08-25), po Batchu 49.
//
// Sesja gry rolą gracza na dist/mtg-table.html: dominaria vs tarkir (seed 101),
// final-fantasy vs alara (seed 202), theros vs worek-mroczny (seed 303) i dalsze.
// Testy pilnują znalezisk, których detektory testera nie łapały same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep, TURN_STEPS } from '../src/engine/turn.js';
import { rulesText } from '../src/table/render.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { readFileSync } from 'node:fs';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1', step = 'main') {
  const state = createGameState({ seed: 212, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

function tileText(cardId, extra = {}) {
  const def = REGISTRY.get(cardId);
  return rulesText({
    cardId: def.id, controllerId: 'p1', abilities: def.abilities ?? [],
    keywords: def.keywords ?? [], spell: def.spell ?? null,
    equipment: def.equipment ?? null, plot: def.plot ?? null,
    types: def.types ?? [], subtypes: def.subtypes ?? [],
    power: def.power, toughness: def.toughness, ...extra,
  });
}

// ---- Z5: warunek intervening-if triggera end_step na kaflu -----------------

test('M212/Z5: kafel Creakwood Safewright pokazuje WARUNEK zdejmowania licznika', () => {
  // Audyt (theros vs worek-mroczny, seed 303): kafel mówił „Na początku kroku
  // końca: usuń licznik -1/-1.” — bez ani słowa o warunku. Stwór stał całą
  // partię z trzema licznikami jako 2/2, a gracz nie miał jak zrozumieć,
  // dlaczego zdolność „nie działa”. Gałąź end_step w render.js znała WYŁĄCZNIE
  // warunek minTappedCreaturesControlled.
  const text = tileText('creakwood-safewright', { counters: { '-1/-1': 3 } });
  assert.match(text, /Na początku kroku końca/, `brak opisu triggera: ${text}`);
  assert.match(text, /grobie/, `kafel nie mówi o warunku „Elf w grobie”: ${text}`);
  assert.match(text, /licznik/, `kafel nie mówi o warunku „ma licznik”: ${text}`);
  // Konkretnie: oba człony intervening-if (CR 603.4) muszą być widoczne.
  assert.match(text, /Elf/, `kafel nie nazywa podtypu z warunku: ${text}`);
});

test('M212/Z5b: warunek end_step nie znika dla kart sprzed Batcha 49', () => {
  // Strażnik anty-regresji dla wcześniejszego wariantu warunku: rozszerzenie
  // gałęzi nie mogło zgubić minTappedCreaturesControlled.
  const text = tileText('frontline-war-rager');
  assert.match(text, /Na początku kroku końca/, `brak opisu triggera: ${text}`);
  assert.match(text, /zatapnięte stwory/, `zgubiony stary warunek: ${text}`);
});

// ---- Z6: CR 601.2c — dwa sloty celu nie mogą wskazać tego samego obiektu ----

test('M212/Z6 (CR 601.2c): Dead Ringers nie celuje dwa razy w ten sam stwór', () => {
  // Audyt (dominaria vs tarkir, seed 101): panel akcji zaoferował
  // „Rzuć: Dead Ringers → cel: Ainok Artillerist, Ainok Artillerist” przy
  // JEDNYM stworze przeciwnika; czar zniszczył go pojedynczo. Dead Ringers to
  // pierwsza karta w katalogu z dwoma slotami TEGO SAMEGO typu celu, więc
  // kolizja była dotąd nieosiągalna i filtr nie istniał.
  const state = game('p1');
  put(state, 'jedyny', 'razorfoot-griffin', 'p2');
  put(state, 'spell', 'dead-ringers', 'p1', 'hand');
  for (let i = 0; i < 5; i += 1) {
    addObject(state, {
      id: `sw${i}`, instanceId: `i-sw${i}`, cardId: 'basic-swamp', controllerId: 'p1',
      ownerId: 'p1', zone: 'battlefield', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Swamp'],
    });
  }
  const oferty = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'spell');
  assert.equal(oferty.length, 0,
    'jeden nieczarny stwór = brak legalnej pary celów, więc zero ofert rzutu');
});

test('M212/Z6b: filtr CR 601.2c nie psuje kart z RÓŻNYMI typami slotów', () => {
  // Malamet Battle Glyph: „target creature you control” + „target creature you
  // don't control” — sloty rozłączne, filtr nie ma prawa nic wyciąć.
  const state = game('p1');
  put(state, 'moj', 'hill-giant', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'wrog', 'razorfoot-griffin', 'p2');
  put(state, 'spell', 'malamet-battle-glyph', 'p1', 'hand');
  addObject(state, {
    id: 'las', instanceId: 'i-las', cardId: 'basic-forest', controllerId: 'p1',
    ownerId: 'p1', zone: 'battlefield', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Forest'],
  });
  const oferty = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'spell');
  assert.ok(oferty.length > 0, 'czar z rozłącznymi slotami musi mieć oferty');
  assert.ok(oferty.some((o) => o.targets.includes('moj') && o.targets.includes('wrog')),
    'para (własny, wrogi) musi zostać w ofercie');
});

// --- M212/3: rozróżnialne kroki obu faz głównych (uwaga właściciela) -------

test('M212/3: kroki faz głównych mają odrębne nazwy main1 / main2', () => {
  // Root cause: obie fazy główne miały step 'main', więc jumpToStep (findIndex)
  // ZAWSZE trafiał w pierwszą — skok do drugiej fazy głównej cofał turę.
  const steps = TURN_STEPS.map((entry) => entry.step);
  assert.equal(new Set(steps).size, steps.length, 'nazwy kroków są unikalne');
  assert.deepEqual(
    TURN_STEPS.filter((e) => e.phase.endsWith('_main')).map((e) => [e.phase, e.step]),
    [['precombat_main', 'main1'], ['postcombat_main', 'main2']],
  );
});

test('M212/3: jumpToStep faktycznie dociera do DRUGIEJ fazy głównej', () => {
  const state = game('p1', 'main1');
  const jumped = jumpToStep(state.turn, 'main2', 'p1');
  assert.equal(jumped.step, 'main2');
  assert.equal(jumped.phase, 'postcombat_main');
  assert.ok(jumped.stepIndex > TURN_STEPS.findIndex((e) => e.step === 'end_of_combat'),
    'indeks kroku leży PO walce (wcześniej skok wracał do main1)');
});

test('M212/3: alias „main" wybiera fazę właściwą dla miejsca w turze', () => {
  // Zgodność wsteczna: setki wywołań w testach podają 'main'. Przed walką ma
  // to znaczyć main1, po walce — main2 (nigdy „zawsze pierwsza").
  const before = jumpToStep(jumpToStep(createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] }).turn, 'draw', 'p1'), 'main', 'p1');
  assert.equal(before.step, 'main1');
  const afterCombat = jumpToStep(jumpToStep(createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] }).turn, 'end_of_combat', 'p1'), 'main', 'p1');
  assert.equal(afterCombat.step, 'main2');
});

// --- M212/A: Holdout Settlement — dwie odrębne zdolności manowe ------------

test('M212/A: Holdout Settlement ma dwie zdolności zgodne z Oracle', () => {
  const def = REGISTRY.get('holdout-settlement');
  assert.equal(def.abilities.length, 2, 'Oracle wymienia DWIE zdolności manowe');
  const [colorless, anyColor] = def.abilities;
  // {T}: Add {C} — bez dodatkowych kosztów.
  assert.deepEqual(colorless.cost, { tap: true });
  assert.equal(colorless.effect.colors ?? null, null, 'brak listy kolorów = mana bezbarwna');
  // {T}, Tap an untapped creature you control: Add one mana of any color.
  assert.equal(anyColor.cost.tap, true);
  assert.equal(anyColor.cost.tapCreature, true);
  assert.deepEqual(anyColor.effect.colors, ['W', 'U', 'B', 'R', 'G']);
});

test("M212/A: Dragonbroods' Relic daje manę DOWOLNEGO koloru, nie tylko {G}", () => {
  // Fallback `src.colors` podstawiał kolor KARTY (zielony artefakt → {G}),
  // choć Oracle mówi „Add one mana of any color".
  const def = REGISTRY.get('dragonbroods-relic');
  assert.deepEqual(def.abilities[0].effect.colors, ['W', 'U', 'B', 'R', 'G']);
});

// --- M212/B: nazwa źródła decyzji „poświęć ląd" (nie zaszyta w UI) ---------

test('M212/B: warstwa opisu nie zaszywa nazwy karty w decyzji o poświęceniu lądu', () => {
  // Zgłoszenie właściciela: Roiling Regrowth pokazywał „Springbloom Druid —
  // land do poświęcenia". Nazwa karty nie może żyć w etykietach UI (ADR 0002).
  const source = readFileSync(new URL('../src/table/render.js', import.meta.url), 'utf8');
  const labels = source.split('\n').filter((line) => /resolve_springbloom:/.test(line));
  assert.ok(labels.length >= 2, 'etykiety decyzji istnieją');
  for (const line of labels) {
    assert.equal(/Springbloom Druid/.test(line), false,
      `etykieta zaszywa nazwę karty: ${line.trim()}`);
  }
});

test('M212/B: playerView wystawia ŹRÓDŁO decyzji o poświęceniu lądu', () => {
  // Bez sourceCardId w widoku UI nie ma z czego nazwać właściwej karty.
  const state = game('p1', 'main1');
  put(state, 'l1', 'basic-forest', 'p1');
  state.pendingSpringbloom = {
    controllerId: 'p1', sourceId: 'src', cardId: 'roiling-regrowth',
    landIds: ['l1'], mandatory: true,
  };
  const view = playerView(state, 'p1');
  assert.equal(view.pendingSpringbloom?.sourceCardId, 'roiling-regrowth');
  // Przeciwnik nie widzi cudzej decyzji (wzorzec pendingHandTopChoice).
  assert.equal(playerView(state, 'p2').pendingSpringbloom, null);
});

// --- M212/Z7: bot nie kieruje DARMOWEGO rzutu we własne rzeczy -------------
// Zgłoszenie z audytu (dominaria vs tarkir): bot rzucił rebound Ojutai's
// Breath (czar TAPUJĄCY) we WŁASNEGO Trade Route Envoy, choć na stole stał
// stwór przeciwnika. Dwie przyczyny, obie konieczne do naprawy.

function botWybiera(state, playerId, typKomendy) {
  const view = playerView(state, playerId);
  const bot = createHeuristicBot({ playerId, seed: 1 });
  const chosen = bot.chooseCommand(view);
  const oferty = view.legalCommands.filter((c) => c.type === typKomendy);
  return { chosen, oferty, view };
}

function wygnanyCzar(state, id, cardId, controllerId, patch) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'exile',
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes ?? [],
    kind: 'spell', spell: def.spell,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
}

test('M212/Z7: rebound czaru tapującego celuje we WROGIEGO stwora, nie własnego', () => {
  const state = game('p1', 'upkeep');
  put(state, 'moj', 'trade-route-envoy', 'p1');
  put(state, 'wrogi', 'razorfoot-griffin', 'p2');
  wygnanyCzar(state, 'breath', 'ojutais-breath', 'p1', { reboundReady: true });
  state.pendingReboundCast = { playerId: 'p1', objectId: 'breath' };

  const { chosen, oferty } = botWybiera(state, 'p1', 'resolve_rebound_cast');
  // Silnik enumeruje ofertę PER CEL — obie muszą istnieć, inaczej test
  // przechodziłby z braku wyboru, a nie dzięki wycenie.
  assert.ok(oferty.some((o) => o.targets?.[0] === 'moj'), 'oferta w mój stwór istnieje');
  assert.ok(oferty.some((o) => o.targets?.[0] === 'wrogi'), 'oferta we wrogi stwór istnieje');
  assert.equal(chosen.targets?.[0], 'wrogi', 'bot tapuje stwora PRZECIWNIKA');
});

test('M212/Z7: suspend czaru odrzucającego karty celuje w PRZECIWNIKA, nie w siebie', () => {
  // Bliźniacza gałąź (L41) — ta sama ślepota, inna komenda.
  const state = game('p1', 'upkeep');
  wygnanyCzar(state, 'ms', 'mindstab', 'p1', { suspended: true, timeCounters: 0 });
  state.pendingSuspendCast = { playerId: 'p1', objectId: 'ms' };
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 4; i += 1) put(state, `${pid}-h${i}`, 'basic-forest', pid, 'hand');
  }

  const { chosen, oferty } = botWybiera(state, 'p1', 'resolve_suspend_cast');
  assert.ok(oferty.some((o) => o.targets?.[0] === 'p1'), 'oferta w siebie istnieje');
  assert.ok(oferty.some((o) => o.targets?.[0] === 'p2'), 'oferta w przeciwnika istnieje');
  assert.equal(chosen.targets?.[0], 'p2', 'bot każe odrzucać PRZECIWNIKOWI');
});

test('M212/Z7: playerView ujawnia deskryptor czaru czekającego w wygnaniu', () => {
  // Druga przyczyna: bez `spell` w widoku wycena czytała pustą listę efektów,
  // więc każdy cel dostawał identyczny wynik. Wygnanie jest strefą jawną
  // (CR 406.3), a karta i tak pokazuje cardId — to nie jest informacja ukryta.
  const state = game('p1', 'upkeep');
  wygnanyCzar(state, 'breath', 'ojutais-breath', 'p1', { reboundReady: true });
  const wygnane = playerView(state, 'p1').zones.exile.find((o) => o.id === 'breath');
  assert.ok(wygnane, 'karta widoczna w wygnaniu');
  assert.deepEqual(
    (wygnane.spell?.effects ?? []).map((e) => e.type),
    ['tap_permanent', 'dont_untap_next_untap_step'],
    'deskryptor efektów dostępny dla kontrolera',
  );
  // Strefa jawna — przeciwnik widzi to samo (CR 406.3).
  const uPrzeciwnika = playerView(state, 'p2').zones.exile.find((o) => o.id === 'breath');
  assert.ok(uPrzeciwnika?.spell, 'wygnanie jest strefą publiczną');
});

test('M212/Z7b: madness — czar niszczący celuje we WROGIEGO stwora, nie własnego', () => {
  // Trzecia gałąź darmowego rzutu z tą samą ślepotą: `resolve_madness_cast`
  // też enumeruje ofertę per zestaw celów (epicCastOffers), a wyceniał ją
  // stały wynik 60 — bot brał pierwszą ofertę, czyli własnego stwora.
  const state = game('p1', 'main1');
  put(state, 'moj', 'trade-route-envoy', 'p1');
  put(state, 'wrogi', 'razorfoot-griffin', 'p2');
  // Koszt madness Terminal Agony to {1}{B}{R} — bez obu kolorów silnik
  // nie wystawi oferty rzutu i test przechodziłby z braku wyboru.
  for (let i = 0; i < 3; i += 1) put(state, `s${i}`, 'basic-swamp', 'p1');
  for (let i = 0; i < 3; i += 1) put(state, `m${i}`, 'basic-mountain', 'p1');
  wygnanyCzar(state, 'ta', 'terminal-agony', 'p1', { madnessReady: true });
  state.pendingMadnessCast = { playerId: 'p1', objectId: 'ta', cardId: 'terminal-agony' };

  const { chosen, oferty } = botWybiera(state, 'p1', 'resolve_madness_cast');
  assert.ok(oferty.some((o) => o.targets?.[0] === 'moj'), 'oferta w mój stwór istnieje');
  assert.ok(oferty.some((o) => o.targets?.[0] === 'wrogi'), 'oferta we wrogi stwór istnieje');
  assert.equal(chosen.targets?.[0], 'wrogi', 'bot niszczy stwora PRZECIWNIKA');
});
