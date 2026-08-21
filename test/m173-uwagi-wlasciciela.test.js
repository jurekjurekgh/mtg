// M173 — uwagi właściciela (2026-08-21, transza 2): Gray Slaad/Adventure (A),
// grafika tokena Squirrel (B), badge czasowych stanów (C), Rustvine (D).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry, TOKEN_IMAGES } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { buildStateOverlay, commandLabel } from '../src/table/render.js';

const REGISTRY = createCardRegistry();

function game(activeId = 'p2') {
  const state = createGameState({ seed: 173, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', activeId);
  state.turn.activePlayerId = activeId;
  state.turn.priorityPlayerId = activeId;
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

// ---- A: Gray Slaad — Przygoda (Entropic Decay) -------------------------------

test('A1: widok RĘKI niesie deskryptor adventure (koszt przygody dla etykiety)', () => {
  const state = game('p1');
  putCard(state, 'slaad', 'gray-slaad', 'p1', 'hand');
  const entry = playerView(state, 'p1').zones.hand.find((o) => o.id === 'slaad');
  assert.ok(entry?.adventure, 'deskryptor adventure w widoku ręki (klasa L1/ADR 0017)');
  assert.equal(entry.adventure.cost, 2, 'mana value przygody');
  assert.deepEqual(entry.adventure.colors, ['B'], 'pip {B}');
});

test('A2: etykieta „Przygoda:" pokazuje koszt {1}{B} (generic = cost − pipy)', () => {
  const state = game('p1');
  putCard(state, 'slaad', 'gray-slaad', 'p1', 'hand');
  const view = playerView(state, 'p1');
  const session = {
    nameOf: (id) => (id === 'gray-slaad' ? 'Gray Slaad' : String(id)),
    nameOfObject: () => '?',
    faceDownName: () => 'morph',
    cardDetails: (id) => REGISTRY.get(id) ?? null,
  };
  const label = String(commandLabel({ type: 'cast_adventure', objectId: 'slaad' }, session, view));
  assert.match(label, /Przygoda/, 'etykieta przygody');
  assert.doesNotMatch(label, /koszt \)/, 'koszt nie jest pusty');
  // manaCostHtml koduje symbole jako ikony/teksty z „1" i „B" — nigdy {2}{B}.
  assert.ok(label.includes('1') && label.includes('B'), `koszt {1}{B}: ${label}`);
  assert.ok(!/\{2\}|>2</.test(label), `bez błędnego {2}: ${label}`);
});

test('A3: bot RZUCA przygodę Gray Slaada przy synergii grobu (mill 4 własnych)', () => {
  const state = game('p2');
  putCard(state, 'slaad', 'gray-slaad', 'p2', 'hand');
  for (let i = 0; i < 10; i += 1) putCard(state, `lib${i}`, 'highland-game', 'p2', 'library');
  addMana(state, 'p2', 2, { colors: ['B'] }); // stać tylko na przygodę ({1}{B})
  const view = playerView(state, 'p2');
  const offer = view.legalCommands.find((c) => c.type === 'cast_adventure' && c.objectId === 'slaad');
  assert.ok(offer, 'oferta cast_adventure w widoku');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.equal(chosen.type, 'cast_adventure',
    'bot wybiera przygodę (self-mill z synergią grobu — Slaad w ręce ma warunek 4+ stworów w grobie)');
});

// ---- B: grafika tokena Squirrel ----------------------------------------------

test('B1: TOKEN_IMAGES ma druk Scryfalla dla token_squirrel (i mapa działa w sesji)', () => {
  assert.match(TOKEN_IMAGES.token_squirrel ?? '', /^https:\/\/cards\.scryfall\.io\/large\//,
    'adres druku Scryfall dla Squirrel (L26 — z API, nie zgadywany)');
});

// ---- C: badge czasowych stanów ------------------------------------------------

test('C1: widok battlefield niesie czasowe flagi (saddled/untap-lock/kontrola/regeneracja)', () => {
  const state = game('p1');
  putCard(state, 'crt', 'highland-game', 'p1', 'battlefield');
  const base = state.objects.get('crt');
  state.objects.set('crt', Object.freeze({
    ...base, saddled: true, untapLockedBy: ['x'], dontUntapNextUntapStep: 'p1',
    tempControlUntilTurn: state.turn.number,
  }));
  state.cantBeRegeneratedThisTurn = ['crt'];
  const entry = playerView(state, 'p2').zones.battlefield.find((o) => o.id === 'crt');
  assert.equal(entry.saddled, true, 'saddled w widoku');
  assert.equal(entry.untapLocked, true, 'untap-lock w widoku');
  assert.equal(entry.dontUntapNextUntapStep, true, 'dontUntapNextUntapStep w widoku');
  assert.equal(entry.tempControlUntilEOT, true, 'kontrola do EOT w widoku');
  assert.equal(entry.cantBeRegeneratedThisTurn, true, 'bez regeneracji w widoku');
});

test('C2: nakładka kafla pokazuje badge czasowych stanów', () => {
  const flagsOf = (info) => {
    const visual = { appendChild: () => {}, children: [] };
    // buildStateOverlay zwraca element — czytamy etykiety z flags przez
    // renderowanie do mini-hosta.
    const host = buildStateOverlay(new MiniHost(), { isBattlefield: true, ...info });
    return collectText(host);
  };
  class MiniHost {
    constructor() { this.children = []; this.className = ''; this.dataset = {}; this.listeners = {}; }
    appendChild(c) { this.children.push(c); return c; }
    addEventListener() {}
  }
  const oldCreate = globalThis.document?.createElement;
  class MiniEl extends MiniHost {
    constructor(tag) { super(); this.tagName = tag; this.text = ''; }
    set textContent(v) { this.text = String(v); }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  }
  globalThis.document = globalThis.document ?? {};
  globalThis.document.createElement = (tag) => new MiniEl(tag);
  const collectText = (node) => String(node?.textContent ?? '');
  try {
    const text = flagsOf({
      saddledNow: true, untapLockedNow: true, tempControlNow: true, cantRegenerateNow: true,
      grantedKeywords: [], lostKeywordsUntilEOT: [], counters: {},
    });
    assert.match(text, /osiodłany/, 'badge saddle');
    assert.match(text, /nie odtapuje się/, 'badge untap-lock');
    assert.match(text, /kontrola do końca tury/, 'badge kontroli');
    assert.match(text, /bez regeneracji/, 'badge regeneracji');
  } finally {
    if (oldCreate) globalThis.document.createElement = oldCreate;
  }
});

// ---- D: Rustvine Cultivator — koniec spamu oil --------------------------------

function rustvineSetup(phase = 'postcombat_main') {
  const state = game('p2');
  putCard(state, 'rust', 'rustvine-cultivator', 'p2', 'battlefield', { summoningSickness: false });
  state.turn = { ...state.turn, phase, step: phase, activePlayerId: 'p2', priorityPlayerId: 'p2' };
  return state;
}

test('D1: bot NIE tapuje Rustvine na oil, gdy zapas pokrywa konsumenta (1 oil)', () => {
  const state = rustvineSetup();
  const base = state.objects.get('rust');
  state.objects.set('rust', Object.freeze({ ...base, counters: { oil: 1 } }));
  const view = playerView(state, 'p2');
  const oilOffer = view.legalCommands.find((c) => c.type === 'activate_ability'
    && c.objectId === 'rust' && c.abilityIndex === 0);
  assert.ok(oilOffer, 'oferta produkcji oil istnieje');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.ok(!(chosen.type === 'activate_ability' && chosen.objectId === 'rust' && chosen.abilityIndex === 0),
    `bot nie hoarduje oil ponad potrzeby konsumenta (wybrał: ${chosen.type})`);
});

test('D2 (anty-over-fix): bot UZUPEŁNIA oil po walce, gdy zapas pusty', () => {
  const state = rustvineSetup('postcombat_main');
  const view = playerView(state, 'p2');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.ok(chosen.type === 'activate_ability' && chosen.objectId === 'rust' && chosen.abilityIndex === 0,
    `0 oil + konsument w karcie = produkcja po walce ma sens (wybrał: ${chosen.type})`);
});

test('D3: bot nie tapuje Rustvine na oil we WŁASNYM upkeepie (przed walką)', () => {
  const state = rustvineSetup('upkeep');
  state.turn = { ...state.turn, phase: 'beginning', step: 'upkeep' };
  const view = playerView(state, 'p2');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.ok(!(chosen.type === 'activate_ability' && chosen.objectId === 'rust'),
    `upkeep to nie czas na oil (tap kosztuje atak/blok; wybrał: ${chosen.type})`);
});

// ---- E: Death-Hood Cobra — granty keywordów tylko we właściwym oknie walki ----

function cobraSetup(activeId = 'p2') {
  const state = game(activeId);
  putCard(state, 'cobra', 'death-hood-cobra', 'p2', 'battlefield', { summoningSickness: false });
  addMana(state, 'p2', 2, { colors: ['G'] });
  return state;
}

test('E1: bot NIE aktywuje reach/deathtouch we własnej main fazie (mana w cleanup)', () => {
  const state = cobraSetup('p2');
  const view = playerView(state, 'p2');
  assert.ok(view.legalCommands.some((c) => c.type === 'activate_ability' && c.objectId === 'cobra'),
    'oferty grantów istnieją');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.ok(!(chosen.type === 'activate_ability' && chosen.objectId === 'cobra'),
    `grant poza oknem walki to strata many (wybrał: ${chosen.type})`);
});

test('E2: bot AKTYWUJE reach, gdy broni się przed zadeklarowanym atakiem z flying', () => {
  const state = cobraSetup('p2');
  // p1 atakuje flyerem — deklaracja ataku otwiera okno bloków p2.
  putCard(state, 'flyer', 'rustwing-falcon', 'p1', 'battlefield', { summoningSickness: false });
  state.turn = { ...state.turn, phase: 'combat', step: 'declare_attackers', activePlayerId: 'p1', priorityPlayerId: 'p1' };
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['flyer'] }).ok);
  state.turn.priorityPlayerId = 'p2';
  const view = playerView(state, 'p2');
  const reach = view.legalCommands.find((c) => c.type === 'activate_ability'
    && c.objectId === 'cobra' && c.abilityIndex === 0);
  assert.ok(reach, 'oferta reach w oknie bloków');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.ok(chosen.type === 'activate_ability' && chosen.objectId === 'cobra' && chosen.abilityIndex === 0,
    `reach przeciw atakowi z flying = właściwe okno (wybrał: ${chosen.type} ${chosen.abilityIndex ?? ''})`);
});

test('E3: bot AKTYWUJE deathtouch dopiero, gdy kobra jest W STARCIU (blokuje)', () => {
  const state = cobraSetup('p2');
  putCard(state, 'bigfoe', 'segmented-krotiq', 'p1', 'battlefield', { summoningSickness: false }); // 6/5
  state.turn = { ...state.turn, phase: 'combat', step: 'declare_attackers', activePlayerId: 'p1', priorityPlayerId: 'p1' };
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['bigfoe'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { bigfoe: ['cobra'] } }).ok);
  // M172/C: po deklaracji bloków priorytet ma obrońca (p2) — okno tricku.
  const view = playerView(state, 'p2');
  const dt = view.legalCommands.find((c) => c.type === 'activate_ability'
    && c.objectId === 'cobra' && c.abilityIndex === 1);
  assert.ok(dt, 'oferta deathtouch po deklaracjach');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.ok(chosen.type === 'activate_ability' && chosen.objectId === 'cobra' && chosen.abilityIndex === 1,
    `deathtouch na blokującej kobrze w starciu z 6/5 (wybrał: ${chosen.type} ${chosen.abilityIndex ?? ''})`);
});

