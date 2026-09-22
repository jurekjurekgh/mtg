// Uwagi z gry właściciela, 2026-09-22 (transza C/D/E) — M408.
//
// C. Sequestered Stash („{4}, {T}, Sacrifice this land: Mill five cards. Then
//    you may put an artifact card from your graveyard on top of your
//    library.”): „Bot ma 11 kart, a mimo to mielił 5 kart do grobu, żeby jedną
//    kartę położyć na szczycie biblioteki. Ta zdolność powinna być
//    wykorzystywana tylko jeśli bot ma bardzo dużo kart w bibliotece (30+), ma
//    powyżej 8 lądów na stole (bo musi poświęcić Sequestered Stash), a w talii
//    ma jakieś artefakty za 8+ many. Tylko wtedy ta zdolność ma jakikolwiek
//    sens.”  → trzy warunki łącznikiem „i”; brak któregokolwiek = poniżej passu.
//
// D. Cathartic Reunion („As an additional cost… discard two cards”): „Bot
//    odrzuca rewelacyjne kreatury, na które ma manę i nie musi tego robić.
//    Powinien odrzucać tylko takie karty, których nie może rzucić z powodu
//    braku many danego koloru.”  → koszt-discard preferuje karty NIEGRYWALNE
//    kolorystycznie, a wśród grywalnych — najsłabsze.
//
// E. Bomat Bazaar Barge (i inne pojazdy): „Bot bezsensownie tapuje sobie
//    stwory, żeby zasilić ten vehicle, bo czym nic z nim nie robi i kończy
//    turę. Bot powinien to zrobić tylko i wyłącznie w fazie swojej walki przed
//    deklaracją atakujących, o ile chce tym vehicle zaatakować, albo w turze
//    gracza, w fazie ataku przed deklaracją blokerów, o ile chce tym vehicle
//    blokować. NIGDY WIĘCEJ!”
//
// Wszystko klasami po deskryptorach (ADR 0002), stan wyłącznie z PlayerView
// (ADR 0017): koszt `sacrificeSelf` na lądzie + mill, koszt `crewPower` +
// `animate_permanent_until_end_of_turn`, koszt `discardCards`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

function game(step = 'main', active = 'p1') {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function put(state, id, cardId, playerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes ?? [],
    ...extra,
  });
  return state.objects.get(id);
}

function scores(state, botOpts = {}) {
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 7, ...botOpts });
  bot.chooseCommand(view, {});
  const trace = bot.trace()[0];
  const pass = trace.options.find((o) => o.cmd === 'pass_priority')?.score ?? 0;
  return { pass, options: trace.options };
}

// ---------------------------------------------------------------- C ---------

const DUZO_LADOW = 10;

function stashScene({ libraryCount, lands, deck }) {
  const state = game();
  put(state, 'stash', 'sequestered-stash', 'p1', 'battlefield');
  for (let i = 0; i < lands; i += 1) put(state, `mt${i}`, 'basic-mountain', 'p1', 'battlefield');
  for (let i = 0; i < libraryCount; i += 1) put(state, `lib${i}`, 'basic-mountain', 'p1', 'library');
  for (let i = 0; i < 20; i += 1) put(state, `elib${i}`, 'basic-island', 'p2', 'library');
  // Artefakt w grobie, żeby odzysk był w ogóle wart punktów (bez tego kara
  // byłaby trywialna — badamy bramkę właściciela, nie pusty grób).
  put(state, 'grave-art', 'marut', 'p1', 'graveyard');
  addMana(state, 'p1', 4, { colors: [] });
  return { state, deck };
}

const TALIA_Z_MARUTEM = [...Array(30).fill('basic-mountain'), 'marut', 'marut'];
const TALIA_BEZ_DROGICH = [...Array(32).fill('basic-mountain')];

function stashScores(scene) {
  const { pass, options } = scores(scene.state, { ownDeck: scene.deck });
  const stash = options.filter((o) => o.cmd.startsWith('activate_ability(stash')
    && !o.cmd.includes('abilityIndex=0'));
  return { pass, stash: stash.map((o) => o.score), all: options.map((o) => o.cmd) };
}

test('C/0: warunki właściciela spełnione (30+ kart, >8 lądów, artefakt 8+ w talii) — poświęcenie zostaje w grze', () => {
  const { pass, stash } = stashScores(stashScene({ libraryCount: 34, lands: DUZO_LADOW, deck: TALIA_Z_MARUTEM }));
  assert.ok(stash.length > 0, 'oferta poświęcenia musi istnieć');
  assert.ok(stash.some((s) => s >= pass), `spełnione warunki: ${JSON.stringify(stash)} vs pass ${pass}`);
});

test('C/1: mało kart w bibliotece (log właściciela: 11) — zdolność poniżej passu', () => {
  const { pass, stash } = stashScores(stashScene({ libraryCount: 11, lands: DUZO_LADOW, deck: TALIA_Z_MARUTEM }));
  assert.ok(stash.length > 0, 'oferta musi istnieć');
  for (const s of stash) assert.ok(s < pass, `mill przy 11 kartach (${s}) musi być poniżej passu (${pass})`);
});

test('C/2: za mało lądów (8 = nie „powyżej 8”) — zdolność poniżej passu', () => {
  const { pass, stash } = stashScores(stashScene({ libraryCount: 34, lands: 7, deck: TALIA_Z_MARUTEM }));
  // 7 gór + sam Stash = 8 lądów łącznie, czyli próg „powyżej 8” niespełniony.
  assert.ok(stash.length > 0, 'oferta musi istnieć');
  for (const s of stash) assert.ok(s < pass, `8 lądów (${s}) musi być poniżej passu (${pass})`);
});

test('C/3: brak artefaktu za 8+ many w talii — zdolność poniżej passu', () => {
  const { pass, stash } = stashScores(stashScene({ libraryCount: 34, lands: DUZO_LADOW, deck: TALIA_BEZ_DROGICH }));
  assert.ok(stash.length > 0, 'oferta musi istnieć');
  for (const s of stash) assert.ok(s < pass, `talia bez drogich artefaktów (${s}) musi być poniżej passu (${pass})`);
});

// ---------------------------------------------------------------- D ---------

/**
 * Ręka: bomba-stwór grywalna kolorem (Hill Giant — czerwony) i karta, której
 * NIE da się rzucić brakiem koloru (niebieski czar przy samych Górach).
 * Sprawdzamy politykę kosztu-discard (`resolve_discard_choice`, purpose=cost).
 */
function discardScene() {
  const state = game();
  for (let i = 0; i < 4; i += 1) put(state, `mt${i}`, 'basic-mountain', 'p1', 'battlefield');
  put(state, 'bomba', 'hill-giant', 'p1', 'hand');
  put(state, 'chwast', 'highland-game', 'p1', 'hand');
  put(state, 'bezkoloru', 'sweet-oblivion', 'p1', 'hand');
  for (let i = 0; i < 10; i += 1) put(state, `lib${i}`, 'basic-mountain', 'p1', 'library');
  state.pendingDiscardChoice = {
    playerId: 'p1', count: 1, handIds: ['bomba', 'chwast', 'bezkoloru'],
    purpose: 'cost', sourceCardId: 'cathartic-reunion', restorePriorityTo: 'p1',
  };
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function discardScores() {
  const { options } = scores(discardScene());
  const map = new Map();
  for (const o of options) {
    const m = /^resolve_discard_choice\(([^)]*)\)$/.exec(o.cmd);
    if (m) map.set(m[1], o.score);
  }
  return map;
}

test('D/0: koszt-discard oddaje NAJPIERW kartę niegrywalną z braku koloru', () => {
  const m = discardScores();
  assert.ok(m.has('bezkoloru') && m.has('bomba') && m.has('chwast'), `oferty: ${JSON.stringify([...m])}`);
  assert.ok(m.get('bezkoloru') > m.get('bomba'), `niegrywalna kolorem (${m.get('bezkoloru')}) > bomba (${m.get('bomba')})`);
  assert.ok(m.get('bezkoloru') > m.get('chwast'), `niegrywalna kolorem (${m.get('bezkoloru')}) > chwast (${m.get('chwast')})`);
});

test('D/1: wśród kart grywalnych bot oddaje SŁABSZĄ, nie „rewelacyjną kreaturę”', () => {
  const m = discardScores();
  assert.ok(m.get('chwast') > m.get('bomba'),
    `słabszy stwór (${m.get('chwast')}) musi być chętniej oddawany niż mocniejszy (${m.get('bomba')})`);
});

// ---------------------------------------------------------------- E ---------

function bargeScene({ step, active, wrogiAtak = false, tapped = false }) {
  const state = game(step, active);
  put(state, 'barge', 'bomat-bazaar-barge', 'p1', 'battlefield', { kind: 'artifact' });
  if (tapped) state.objects.set('barge', Object.freeze({ ...state.objects.get('barge'), tapped: true }));
  for (const id of ['c1', 'c2']) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId: 'p1', zone: 'battlefield',
      kind: 'creature', power: 2, toughness: 2, abilities: [], subtypes: [], types: ['Creature'],
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  }
  if (wrogiAtak) {
    addObject(state, {
      id: 'wrog', instanceId: 'i-wrog', cardId: 'hill-giant', controllerId: 'p2', zone: 'battlefield',
      kind: 'creature', power: 3, toughness: 3, abilities: [], subtypes: [], types: ['Creature'],
    });
    state.objects.set('wrog', Object.freeze({ ...state.objects.get('wrog'), summoningSickness: false, attacking: true }));
    state.combat = { attackingPlayerId: 'p2', attackers: ['wrog'], assignments: {} };
  }
  return state;
}

function crewScores(state) {
  const { pass, options } = scores(state);
  return { pass, crew: options.filter((o) => o.cmd.startsWith('activate_ability(barge')).map((o) => o.score) };
}

test('E/0: załoga w GŁÓWNEJ fazie (log właściciela) jest poniżej passu — „NIGDY WIĘCEJ”', () => {
  const { pass, crew } = crewScores(bargeScene({ step: 'main', active: 'p1' }));
  assert.ok(crew.length > 0, 'oferta crew musi istnieć');
  for (const s of crew) assert.ok(s < pass, `crew w main (${s}) musi być poniżej passu (${pass})`);
});

test('E/1: załoga w postcombat main także poniżej passu', () => {
  const { pass, crew } = crewScores(bargeScene({ step: 'main2', active: 'p1' }));
  for (const s of crew) assert.ok(s < pass, `crew w main2 (${s}) musi być poniżej passu (${pass})`);
});

test('E/2: załoga w MOJEJ walce przed deklaracją atakujących pozostaje legalna', () => {
  const { pass, crew } = crewScores(bargeScene({ step: 'beginning_of_combat', active: 'p1' }));
  assert.ok(crew.length > 0, 'oferta crew musi istnieć');
  assert.ok(crew.some((s) => s >= pass), `okno ataku: ${JSON.stringify(crew)} vs pass ${pass}`);
});

test('E/3: w turze przeciwnika PRZED blokami (jest kogo blokować) crew ma sens', () => {
  const { pass, crew } = crewScores(bargeScene({
    step: 'declare_attackers', active: 'p2', wrogiAtak: true,
  }));
  assert.ok(crew.length > 0, 'oferta crew musi istnieć');
  assert.ok(crew.some((s) => s >= pass), `okno bloku: ${JSON.stringify(crew)} vs pass ${pass}`);
});

test('E/4: w turze przeciwnika BEZ ataku (upkeep/main) crew jest poniżej passu', () => {
  const { pass, crew } = crewScores(bargeScene({ step: 'upkeep', active: 'p2' }));
  for (const s of crew) assert.ok(s < pass, `cudza tura bez ataku (${s}) musi być poniżej passu (${pass})`);
});

test('E/5: tapnięty pojazd w oknie ataku nadal poniżej passu (regresja D1)', () => {
  const { pass, crew } = crewScores(bargeScene({ step: 'beginning_of_combat', active: 'p1', tapped: true }));
  for (const s of crew) assert.ok(s < pass, `tapnięty pojazd (${s}) musi być poniżej passu (${pass})`);
});
