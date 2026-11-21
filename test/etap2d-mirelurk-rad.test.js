import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { legalTriggerTargetCandidates } from '../src/engine/triggers.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { applyEffect } from '../src/engine/effects.js';
import { createAbility, ABILITY_TYPE } from '../src/engine/abilities.js';
import { HOSTILE_TRIGGER_TARGET_EFFECTS } from '../src/engine/effect-intent.js';
import { defineCard, createRegistry } from '../src/cards/registry.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { rulesText } from '../src/table/render.js';
import { EVENT_TYPES } from '../src/protocol/types.js';

function goToStep(state, step, activeId) {
  state.turn = jumpToStep({ ...state.turn, activePlayerId: activeId }, step, activeId);
}

const synQueen = defineCard({
  id: 'syn-mirelurk-queen',
  name: 'Synthetic Mirelurk Queen',
  set: 'SYN',
  types: ['Creature'],
  subtypes: ['Crab', 'Mutant'],
  colors: ['U'],
  manaCost: 5,
  power: 4,
  toughness: 4,
  keywords: ['vigilance'],
  abilities: [
    createAbility({
      type: ABILITY_TYPE.triggered,
      trigger: {
        event: 'enter_battlefield',
        requiresTarget: { type: 'player', prefer: 'opponent' },
      },
      effect: [{ type: 'add_rad_counters', amount: 2 }],
    }),
    createAbility({
      type: ABILITY_TYPE.triggered,
      trigger: {
        event: 'nonland_cards_milled',
        oncePerTurn: true,
      },
      effect: [
        { type: 'draw_cards', amount: 1 },
        { type: 'add_counter', counter: '+1/+1', amount: 1, applyTo: 'self' },
      ],
    }),
  ],
  support: { status: 'supported', limitations: [] },
});

const synProliferate = defineCard({
  id: 'syn-proliferate',
  name: 'Synthetic Proliferate',
  set: 'SYN',
  types: ['Sorcery'],
  colors: ['U'],
  manaCost: 2,
  spell: {
    timing: 'sorcery',
    effects: [{ type: 'proliferate' }],
  },
  support: { status: 'supported', limitations: [] },
});

const synBear = defineCard({
  id: 'syn-bear',
  name: 'Synthetic Bear',
  set: 'SYN',
  types: ['Creature'],
  subtypes: ['Bear'],
  colors: ['G'],
  manaCost: 2,
  power: 2,
  toughness: 2,
  support: { status: 'supported', limitations: [] },
});

function baseState(seed = 24) {
  const s = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  for (let i = 1; i <= 15; i += 1) {
    addObject(s, {
      id: `lib-p1-${i}`, instanceId: `il-1-${i}`, cardId: 'basic-island',
      controllerId: 'p1', zone: 'library', kind: 'land', types: ['Land'],
    });
    addObject(s, {
      id: `lib-p2-${i}`, instanceId: `il-2-${i}`, cardId: 'basic-island',
      controllerId: 'p2', zone: 'library', kind: 'land', types: ['Land'],
    });
  }
  return s;
}

function addFromDef(state, id, controllerId, def, { zone = 'hand', tapped = false, summoningSickness = false } = {}) {
  const data = gameObjectDataOf(def);
  addObject(state, {
    ...data,
    id,
    instanceId: `inst-${id}`,
    cardId: def.id,
    controllerId,
    zone,
    types: [...(def.types ?? [])],
    subtypes: [...(def.subtypes ?? [])],
    keywords: [...(def.keywords ?? [])],
  });
  if (zone === 'battlefield') {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped, summoningSickness }));
  }
  return state.objects.get(id);
}

function passBoth(state) {
  const first = state.turn.priorityPlayerId;
  const second = first === 'p1' ? 'p2' : 'p1';
  assert.equal(execute(state, { type: 'pass_priority', playerId: first }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: second }).ok, true);
}

test('2D-1 (rad counters + playerView + proliferate): ETB target player +2 rad, proliferate +1 rad', () => {
  const state = baseState();
  addFromDef(state, 'queen', 'p1', synQueen, { zone: 'hand' });
  addFromDef(state, 'prolif', 'p1', synProliferate, { zone: 'hand' });
  addMana(state, 'p1', 7, { colors: ['U', 'U'] });

  goToStep(state, 'main1', 'p1');
  assert.equal(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'queen' }).ok, true);
  passBoth(state); // Queen wchodzi, ETB otwiera wybór celu gracza

  assert.equal(state.pendingTriggerTargets.length, 1, 'ETB Królowej pyta o cel (target player)');
  assert.deepEqual(new Set(legalTriggerTargetCandidates(state, state.pendingTriggerTargets[0])), new Set(['p1', 'p2']));
  assert.equal(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'p2' }).ok, true);
  passBoth(state); // ETB schodzi ze stosu

  const viewP1 = playerView(state, 'p1');
  const viewP2 = playerView(state, 'p2');
  assert.equal(viewP1.players.find((p) => p.id === 'p2').rad, 2, 'playerView p1 widzi rad=2 na p2');
  assert.equal(viewP2.players.find((p) => p.id === 'p2').rad, 2, 'playerView p2 widzi rad=2 na sobie');
  assert.ok(state.events.some((e) => e.type === 'rad_counters_added' && e.playerId === 'p2' && e.amount === 2 && e.after === 2));

  // Proliferate ma widzieć p2 z rad=2 jako kandydata i podnieść do 3
  assert.equal(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'prolif' }).ok, true);
  passBoth(state);
  assert.ok(state.pendingProliferate, 'proliferate otwiera wybór przy graczu z rad > 0');
  assert.ok(state.pendingProliferate.candidateIds.includes('p2'), 'p2 z rad > 0 jest kandydatem proliferate');
  assert.equal(execute(state, { type: 'resolve_proliferate', playerId: 'p1', targetIds: ['p2'] }).ok, true);
  assert.equal(state.players.find((p) => p.id === 'p2').rad, 3, 'proliferate podniósł rad p2 z 2 na 3');
});

test('2D-2 (inherent rad trigger na początku main1 — ruling 2024-03-08): mill N, nonland = -1 life & -1 rad; krótsza biblioteka', () => {
  const state = createGameState({ seed: 25, players: [{ id: 'p1' }, { id: 'p2' }] });
  // P2 ma dokładnie: wierzch = Bear (nonland), druga = Island (land)
  addFromDef(state, 'top-bear', 'p2', synBear, { zone: 'library' });
  addObject(state, {
    id: 'second-land', instanceId: 'i-sl', cardId: 'basic-island',
    controllerId: 'p2', zone: 'library', kind: 'land', types: ['Land'],
  });
  addObject(state, {
    id: 'p1-land', instanceId: 'i-p1l', cardId: 'basic-island',
    controllerId: 'p1', zone: 'library', kind: 'land', types: ['Land'],
  });
  applyEffect(state, { type: 'add_rad_counters', amount: 2 }, { id: 'src', controllerId: 'p1' }, ['p2']);
  assert.equal(state.players.find((p) => p.id === 'p2').rad, 2);

  // Przechodzimy z draw do main1 p2 (inherent rad trigger idzie na stos!)
  goToStep(state, 'draw', 'p2');
  state.zones.library = ['top-bear', 'second-land', 'p1-land'];

  passBoth(state); // draw -> main1 (active: p2) -> inherent rad trigger na stos!
  assert.equal(state.turn.step, 'main1');
  assert.equal(state.turn.activePlayerId, 'p2');
  assert.equal(state.zones.stack.length, 1, 'inherent rad trigger wszedł na stos na starcie main1');
  const stackEntry = state.objects.get(state.zones.stack[0]);
  assert.equal(stackEntry.controllerId, 'p2', 'active player kontroluje inherent rad trigger');

  passBoth(state); // rozstrzygnięcie inherent rad triggera ze stosu
  const p2 = state.players.find((p) => p.id === 'p2');
  assert.equal(p2.life, 19, 'zmielono 1 nonland + 1 land -> utrata dokładnie 1 życia');
  assert.equal(p2.rad, 1, 'zdjęto dokładnie 1 rad counter za 1 nonland (został 1)');
  assert.equal(state.zones.library.filter((id) => state.objects.get(id)?.controllerId === 'p2').length, 0);

  // Krawędź: biblioteka p2 ma 1 nonland, a p2 ma 3 rad -> mieli ile się da (1), traci 1 życie, zostają 2 rad, brak przegranej z pustej biblioteki
  applyEffect(state, { type: 'add_rad_counters', amount: 2 }, { id: 'src', controllerId: 'p1' }, ['p2']); // rad = 3
  addFromDef(state, 'last-bear', 'p2', synBear, { zone: 'library' });
  state.zones.library = ['last-bear', 'p1-land'];
  goToStep(state, 'draw', 'p2');
  passBoth(state); // draw -> main1 p2 (rad trigger na stos)
  passBoth(state); // rad trigger (rad=3, w bibliotece 1 karta)
  assert.equal(p2.life, 18, 'zmielono tylko 1 dostępny nonland przy rad=3');
  assert.equal(p2.rad, 2, 'z 3 rad zdjęto 1 za 1 nonland -> zostało 2');
  assert.equal(state.status, 'active', 'mill z rad przy krótszej bibliotece nie powoduje natychmiastowej przegranej');
});

test('2D-3 (nonland_cards_milled + oncePerTurn + all-at-once batching): landy nie, batch 2 nonlandów raz, drugi mill w tej samej turze nie', () => {
  const synMill = defineCard({
    id: 'syn-mill', name: 'Synthetic Mill', set: 'SYN', types: ['Sorcery'], colors: ['U'], manaCost: 1,
    spell: { timing: 'sorcery', targets: [{ type: 'player' }], effects: [{ type: 'mill_cards', amount: 2 }] },
    support: { status: 'supported', limitations: [] },
  });
  const synMill3 = defineCard({
    id: 'syn-mill-3', name: 'Synthetic Mill 3', set: 'SYN', types: ['Sorcery'], colors: ['U'], manaCost: 1,
    spell: { timing: 'sorcery', targets: [{ type: 'player' }], effects: [{ type: 'mill_cards', amount: 3 }] },
    support: { status: 'supported', limitations: [] },
  });

  const s2 = baseState(99);
  addFromDef(s2, 'queen', 'p1', synQueen, { zone: 'battlefield' });
  addFromDef(s2, 'cast-mill-lands', 'p1', synMill, { zone: 'hand' });
  addFromDef(s2, 'cast-mill-batch', 'p1', synMill3, { zone: 'hand' });
  addFromDef(s2, 'cast-mill-second', 'p1', synMill, { zone: 'hand' });
  addMana(s2, 'p1', 3, { colors: ['U', 'U', 'U'] });
  addFromDef(s2, 'b-1', 'p2', synBear, { zone: 'library' });
  addFromDef(s2, 'b-2', 'p2', synBear, { zone: 'library' });
  addFromDef(s2, 'b-3', 'p2', synBear, { zone: 'library' });
  const p2L = s2.zones.library.filter((id) => s2.objects.get(id)?.controllerId === 'p2' && s2.objects.get(id)?.kind === 'land');
  const p1L = s2.zones.library.filter((id) => s2.objects.get(id)?.controllerId === 'p1');
  s2.zones.library = [p2L[0], p2L[1], 'b-1', p2L[2], 'b-2', 'b-3', ...p2L.slice(3), ...p1L];

  goToStep(s2, 'main1', 'p1');
  const h0 = s2.zones.hand.filter((id) => s2.objects.get(id)?.controllerId === 'p1').length;

  // A: mill 2 landy -> 0 triggerów
  assert.equal(execute(s2, { type: 'cast_spell', playerId: 'p1', objectId: 'cast-mill-lands', targets: ['p2'] }).ok, true);
  passBoth(s2);
  assert.equal(s2.zones.stack.length, 0, 'po zmieleniu 2 landów stos pusty (brak triggera)');
  assert.equal(s2.objects.get('queen').counters['+1/+1'] ?? 0, 0);

  // B: mill 3 (b-1, land, b-2) -> DOKŁADNIE 1 trigger -> +1 karta, +1/+1 counter = 1
  assert.equal(execute(s2, { type: 'cast_spell', playerId: 'p1', objectId: 'cast-mill-batch', targets: ['p2'] }).ok, true);
  passBoth(s2);
  assert.equal(s2.zones.stack.length, 1, 'batch 2 nonlandów stawia dokładnie 1 trigger na stos');
  passBoth(s2);
  const hAfterBatch = s2.zones.hand.filter((id) => s2.objects.get(id)?.controllerId === 'p1').length;
  // Wyszły 2 czary z ręki (-2), dobrano 1 kartę (+1) => h0 - 1
  assert.equal(hAfterBatch, h0 - 1, 'dobrano dokładnie 1 kartę za batch 2 nonlandów');
  assert.equal(s2.objects.get('queen').counters['+1/+1'], 1, 'Królowa dostała dokładnie 1 licznik +1/+1');

  // C: drugi mill nonlanda (b-3) w TEJ SAMEJ turze -> oncePerTurn blokuje!
  assert.equal(execute(s2, { type: 'cast_spell', playerId: 'p1', objectId: 'cast-mill-second', targets: ['p2'] }).ok, true);
  passBoth(s2);
  assert.equal(s2.zones.stack.length, 0, 'oncePerTurn blokuje drugie wyzwolenie w tej samej turze');
  assert.equal(s2.objects.get('queen').counters['+1/+1'], 1);

  // W nowej turze (przejście z end p1 do tury p2 resetuje triggerFiredThisTurn!) trigger znów może zadziałać raz!
  applyEffect(s2, { type: 'add_rad_counters', amount: 1 }, { id: 'r', controllerId: 'p1' }, ['p2']);
  addFromDef(s2, 'b-next', 'p2', synBear, { zone: 'library' });
  const p2Rest = s2.zones.library.filter((id) => s2.objects.get(id)?.controllerId === 'p2' && id !== 'b-next');
  const p1Rest = s2.zones.library.filter((id) => s2.objects.get(id)?.controllerId === 'p1');
  // draw weźmie pierwszy z p2Rest (land), a rad 1 zmieli b-next!
  s2.zones.library = [p2Rest[0], 'b-next', ...p2Rest.slice(1), ...p1Rest];
  goToStep(s2, 'cleanup', 'p1');
  passBoth(s2); // cleanup p1 -> upkeep p2 (nowa tura, reset triggerFiredThisTurn)
  passBoth(s2); // upkeep -> draw p2 (dobrał land)
  passBoth(s2); // draw -> main1 p2 (rad trigger na stos)
  passBoth(s2); // rad trigger mieli b-next -> Królowa (p1) wyzwala się w turze p2!
  assert.equal(s2.zones.stack.length, 1, 'Królowa wyzwala się ponownie w nowej turze od rad milla przeciwnika');
  passBoth(s2); // rozstrzygnięcie triggera Królowej ze stosu
  assert.equal(s2.objects.get('queen').counters['+1/+1'], 2, 'Królowa ma już 2 liczniki +1/+1');
});

test('2D-4 (surveil milluje nonland): zmielony nonland przez surveil odpala nonland_cards_milled', () => {
  const state = baseState(33);
  addFromDef(state, 'queen', 'p1', synQueen, { zone: 'battlefield' });
  const synSurveil = defineCard({
    id: 'syn-surveil', name: 'Synthetic Surveil', set: 'SYN', types: ['Sorcery'], colors: ['U'], manaCost: 1,
    spell: { timing: 'sorcery', effects: [{ type: 'surveil', amount: 2 }] },
    support: { status: 'supported', limitations: [] },
  });
  addFromDef(state, 'surv', 'p2', synSurveil, { zone: 'hand' });
  addMana(state, 'p2', 1, { colors: ['U'] });
  addFromDef(state, 'nl-surv-1', 'p2', synBear, { zone: 'library' });
  addFromDef(state, 'nl-surv-2', 'p2', synBear, { zone: 'library' });
  const p2L = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === 'p2' && state.objects.get(id)?.kind === 'land');
  const p1L = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === 'p1');
  state.zones.library = ['nl-surv-1', 'nl-surv-2', ...p2L, ...p1L];

  goToStep(state, 'main1', 'p2');
  assert.equal(execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'surv' }).ok, true);
  passBoth(state);
  assert.ok(state.pendingSurveil);
  assert.equal(execute(state, {
    type: 'resolve_surveil', playerId: 'p2', millIds: ['nl-surv-1', 'nl-surv-2'], topOrder: [],
  }).ok, true);
  assert.equal(state.zones.stack.length, 1, 'surveil dwóch nonlandów do grobu wyzwala Królową raz');
  passBoth(state);
  assert.equal(state.objects.get('queen').counters['+1/+1'], 1);
});

test('2D-5 (L84 + bot + render + session): polskie opisy rad i nonland_cards_milled, celowanie zawsze w przeciwnika', () => {
  assert.ok(EVENT_TYPES.includes('rad_counters_added'));
  assert.ok(EVENT_TYPES.includes('rad_counters_removed'));
  assert.ok(HOSTILE_TRIGGER_TARGET_EFFECTS.has('add_rad_counters'), 'effect-intent klasyfikuje add_rad_counters jako wrogie');

  const desc = rulesText(synQueen);
  assert.ok(desc.includes('rad') || desc.includes('radiacj'), `rulesText opisuje rad counters: ${desc}`);
  assert.ok(desc.includes('raz na turę'), `rulesText opisuje raz na turę: ${desc}`);
  assert.ok(!desc.includes('add_rad_counters') && !desc.includes('nonland_cards_milled'), `brak surowych kluczy w opisie: ${desc}`);

  const baseReg = createCardRegistry();
  const reg = createRegistry([...baseReg.all(), synQueen]);
  const bot = createHeuristicBot({ seed: 11, registry: reg });
  const state = baseState(77);
  addFromDef(state, 'queen', 'p1', synQueen, { zone: 'hand' });
  addMana(state, 'p1', 5, { colors: ['U'] });
  goToStep(state, 'main1', 'p1');
  assert.equal(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'queen' }).ok, true);
  passBoth(state);
  assert.equal(state.pendingTriggerTargets.length, 1);

  const view = playerView(state, 'p1');
  const pick = bot.chooseCommand(view);
  assert.equal(pick.type, 'resolve_trigger_target');
  assert.equal(pick.targetId, 'p2', 'bot daje rad countery przeciwnikowi, nigdy sobie');
});

test('2D-6 (UI): panel radiacji jak Poison/Energy — wiersz tylko dla graczy z rad > 0', async () => {
  const { renderRadPanel } = await import('../src/table/render.js');
  const { els } = panelZPrzechwytem((els_) => {
    renderRadPanel(els_, {
      playerId: 'p1',
      players: [{ id: 'p1', name: 'Ty', rad: 1 }, { id: 'p2', name: 'Bot', rad: 3 }],
    }, {});
  });
  assert.equal(els.rad.hidden, false, 'panel widoczny, gdy ktokolwiek ma rad');
  const liczniki = els.rad.findAll((n) => String(n.className).includes('poison-count')).map((n) => n.textContent);
  assert.equal(liczniki.length, 2, 'wiersz dla każdego napromieniowanego gracza');
  assert.match(liczniki.join(' '), /Gracz/, 'etykieta właściciela');
  assert.match(liczniki.join(' '), /Bot/, 'etykieta przeciwnika');
  assert.match(liczniki.join(' '), /radiacj/, 'polska nazwa licznika');

  // Nikt bez rad → panel ukryty (zero = brak wiersza, jak w panelu energii).
  const pusty = panelZPrzechwytem((els_) => {
    renderRadPanel(els_, { playerId: 'p1', players: [{ id: 'p1', rad: 0 }, { id: 'p2', rad: 0 }] }, {});
  });
  assert.equal(pusty.els.rad.hidden, true, 'panel ukryty, gdy nikt nie ma liczników radiacji');
});

test('2D-6b (UI, drut): stół ma div#rad, main.js przekazuje els.rad i handler pełnego ekranu', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync('src/table/index.html', 'utf8');
  assert.match(html, /id="rad"/, 'panel radiacji istnieje w stole');
  const main = fs.readFileSync('src/table/main.js', 'utf8');
  assert.match(main, /rad: el\('rad'\)/, 'main.js mapuje element panelu');
  assert.match(main, /onRadCardClick:/, 'main.js podaje handler pełnego ekranu markera Radiation');
});

/** Mini-DOM (wzorzec m195/m313) — panele specjalne rysują się bez prawdziwego DOM. */
function panelZPrzechwytem(run) {
  class MiniEl {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.listeners = {};
      this.className = ''; this.text = ''; this.dataset = {}; this.hidden = false;
      this.src = ''; this.alt = ''; this.loading = '';
    }
    set textContent(v) { this.text = String(v); this.children = []; }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
    appendChild(c) { this.children.push(c); return c; }
    addEventListener(t, l) { (this.listeners[t] ??= []).push(l); }
    all() { return [this, ...this.children.flatMap((c) => (c.all ? c.all() : [c]))]; }
    find(pred) { return this.all().find(pred); }
    findAll(pred) { return this.all().filter(pred); }
  }
  globalThis.document = globalThis.document ?? {};
  const old = globalThis.document.createElement;
  globalThis.document.createElement = (tag) => new MiniEl(tag);
  try {
    const els = { rad: new MiniEl('div') };
    return run(els) ?? { els };
  } finally {
    if (old) globalThis.document.createElement = old; else delete globalThis.document.createElement;
  }
}
