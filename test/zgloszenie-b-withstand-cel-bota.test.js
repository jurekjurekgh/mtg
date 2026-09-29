import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

// Zgłoszenie właściciela B (2026-09-28e) — log dosłowny:
//   „Nieprzyjaciel rzuca Withstand → cel: Ty”
// w darmowych rzutach Epic Experiment (X=4). „Czemu ma preventować dmg
// u swojego przeciwnika??? On ma zadawać obrażenia przeciwnikowi, a nie
// preventować je. To jest 100% błędna taktyka.”
//
// Root cause: okna darmowych rzutów (`resolve_epic_choice` i rodzina
// suspend/rebound/madness/exile) wyceniają TYP efektu + `freeCastTargetPenalty`,
// a tam: (a) `prevent_next_damage` nie jest w FRIENDLY_TARGET_EFFECTS
// (jest `prevent_damage_this_turn`, brakuje bliźniaka), (b) `objectOnBoard`
// nie widzi graczy-celów, więc kara za przyjazny efekt we wroga NIE
// naliczała się dla celu-gracza. Wszystkie warianty celów remisowały →
// bot brał PIERWSZY z brzegu („Ty” = przeciwnik).
//
// Taktyka właściciela (kryterium akceptacji):
//  — NIGDY cel we wroga (gracz ani stwór) — osłanianie przeciwnika = błąd;
//  — combat trick PRZED obrażeniami: własny stwór, który dostałby LETHAL
//    (i tarcza 3 go realnie ratuje), albo własny gracz, w którego uderzą
//    kreatury przeciwnika;
//  — odpowiedź na dmg-spell ze stosem z lethalem na bota albo jego kreaturę.

const REGISTRY = createCardRegistry();

function putSpell(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
    ...extra,
  });
  return state.objects.get(id);
}

function putCreature(state, id, controllerId, power, toughness) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 2,
    types: ['Creature'], subtypes: [], colors: [], abilities: [], keywords: [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function botTurn() {
  const state = createGameState({ seed: 156, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);
  for (let i = 0; i < 10; i++) putSpell(state, `lib${i}`, 'highland-game', 'p2', 'library');
  return state;
}

function choose(state) {
  return createHeuristicBot({ seed: 156 }).chooseCommand(playerView(state, 'p2'), {});
}

// --- B1: Epic Experiment (log właściciela) — darmowy Withstand nigdy na wroga ---
test('B1: darmowy rzut z Epic Experiment — Withstand NIGDY na przeciwnika („Ty” = bug z logu)', () => {
  const state = botTurn();
  putCreature(state, 'mine', 'p2', 2, 1);
  putCreature(state, 'foe', 'p1', 3, 3);
  putSpell(state, 'w-ex', 'withstand', 'p2', 'exile');
  state.pendingEpicExperiment = {
    playerId: 'p2', sourceCardId: 'epic', exileIds: ['w-ex'], maxMV: 4, restorePriorityTo: 'p2',
  };
  const view = playerView(state, 'p2');
  const offers = (view.legalCommands ?? []).filter((c) => c.type === 'resolve_epic_choice' && !c.done);
  assert.ok(offers.some((c) => c.targets?.[0] === 'p1'), 'setup: wariant z celem-graczem przeciwnika jest w ofercie');
  const choice = choose(state);
  if (choice.type === 'resolve_epic_choice' && !choice.done) {
    assert.ok(choice.targets?.[0] === 'mine' || choice.targets?.[0] === 'p2',
      `prewencja idzie na WŁASNĄ stronę, nie na przeciwnika: ${JSON.stringify(choice)}`);
    assert.ok(!['p1', 'foe'].includes(choice.targets?.[0]),
      `osłanianie wroga własną kartą = błąd: ${JSON.stringify(choice)}`);
  } else {
    // Odmowa darmowego rzutu też jest OK — byle nie osłona przeciwnika.
    assert.equal(choice.done, true);
  }
});

// --- B2: combat trick — ratunek własnego stwora z lethalem (przed obrażeniami) ---
test('B2: walka — Withstand na własnego stwora, który dostałby lethal (tarcza 3 go ratuje)', () => {
  const state = botTurn();
  putSpell(state, 'w', 'withstand', 'p2', 'hand');
  putCreature(state, 'mine', 'p2', 2, 2);
  putCreature(state, 'foe', 'p1', 3, 3);
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  // Stan silnika: blockers to Map (widok zamienia na obiekt — game-state:9244).
  state.combat = {
    attackingPlayerId: 'p1', attackers: ['foe'],
    blockers: new Map([['foe', ['mine']]]), blockedAttackers: new Set(['foe']),
  };
  const choice = choose(state);
  assert.equal(choice.type, 'cast_spell', `ratunek stwora > pass: ${JSON.stringify(choice)}`);
  assert.equal(choice.objectId, 'w');
  assert.equal(choice.targets?.[0], 'mine',
    `combat trick celuje w stwora z lethalem, nie w gracza: ${JSON.stringify(choice)}`);
});

// --- B3: twarz pod atakiem — u siebie, gdy kreatura przeciwnika uderzy ---
test('B3: wróg atakuje nieblokowany — Withstand na siebie (fog), nie na wroga', () => {
  const state = botTurn();
  putSpell(state, 'w', 'withstand', 'p2', 'hand');
  putCreature(state, 'foe', 'p1', 3, 3);
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  state.combat = {
    attackingPlayerId: 'p1', attackers: ['foe'],
    blockers: new Map(), blockedAttackers: new Set(),
  };
  const choice = choose(state);
  assert.equal(choice.type, 'cast_spell', `fog na twarz > pass: ${JSON.stringify(choice)}`);
  assert.equal(choice.objectId, 'w');
  assert.equal(choice.targets?.[0], 'p2',
    `obrażenia idą w bota — tarcza idzie NA BOTA, nie na przeciwnika: ${JSON.stringify(choice)}`);
});

// --- B4: odpowiedź na dmg-spell z lethalem na kreaturę bota ---
test('B4: Shock na stosie w kreaturę bota (lethal) — Withstand w odpowiedzi na nią', () => {
  const state = botTurn();
  putSpell(state, 'w', 'withstand', 'p2', 'hand');
  putCreature(state, 'mine', 'p2', 2, 1);
  putSpell(state, 'shock', 'shock', 'p1', 'stack', { targets: ['mine'] });
  state.zones.stack.push('shock');
  state.turn.priorityPlayerId = 'p2';
  const choice = choose(state);
  assert.equal(choice.type, 'cast_spell', `ratunek przed burnem > pass: ${JSON.stringify(choice)}`);
  assert.equal(choice.objectId, 'w');
  assert.equal(choice.targets?.[0], 'mine',
    `tarcza idzie w cel burna z lethalem: ${JSON.stringify(choice)}`);
});

// --- B5: anty-over-fix — cantrip na własnej stronie bez zagrożenia zostaje dozwolony ---
test('B5: bez zagrożenia Withstand na własną stronę jest OK (cantrip, Q1b) — nigdy na wroga', () => {
  const state = botTurn();
  putSpell(state, 'w', 'withstand', 'p2', 'hand');
  putCreature(state, 'mine', 'p2', 2, 1);
  putCreature(state, 'foe', 'p1', 3, 3);
  const choice = choose(state);
  if (choice.type === 'cast_spell' && choice.objectId === 'w') {
    assert.ok(['mine', 'p2'].includes(choice.targets?.[0]),
      `cel po własnej stronie: ${JSON.stringify(choice)}`);
  } else {
    assert.equal(choice.type, 'pass', `albo pass, albo własny cel: ${JSON.stringify(choice)}`);
  }
});

// --- B6: U1 z audytu PR #145 — kara za osłonę WROGA jest nośna na PŁATNEJ ścieżce ---
// Mutacje B-M (wpis `prevent_next_damage` poza FRIENDLY_TARGET_EFFECTS) i B2-M
// (gałąź celu-gracza w friendlyMisaimPenalty) były ZIELONE: B1–B5 patrzą na
// WYBÓR, a ten poprawiało `- preventShieldTargetValue` z darmowych rzutów.
// Sonda (dist/logs/u1-withstand-sonda.mjs) pokazała więcej: `slot` brał się
// z `effect.targetIndex != null`, a Withstand nie ma `targetIndex` — więc dla
// karty ZE ZGŁOSZENIA gałąź celu-gracza nie odpalała wcale, choć komentarz
// obiecywał inaczej. Próba kontrolna: kara 40 → 4000 zmieniała wycenę celu-
// stwora o 3960, a celu-gracza wroga w ogóle (−24 → −24). Po naprawie
// (konwencja `targets[effect.targetIndex ?? 0]`, jak w reszcie pliku) cel-
// gracz wroga dostaje dokładnie `friendCost` (40 + power gracza = 40).
test('B6: PŁATNY Withstand — osłona PRZECIWNIKA kosztuje tyle co wpis w FRIENDLY_TARGET_EFFECTS', () => {
  const state = botTurn();
  putSpell(state, 'w', 'withstand', 'p2', 'hand');
  putCreature(state, 'mine', 'p2', 2, 2);
  putCreature(state, 'foe', 'p1', 3, 3);
  const bot = createHeuristicBot({ seed: 156 });
  const choice = bot.chooseCommand(playerView(state, 'p2'), {});
  const options = (bot.trace().at(-1)?.options ?? []).filter((o) => o.cmd.startsWith('cast_spell(w->'));
  const scoreOf = (id) => {
    const found = options.find((o) => o.cmd === `cast_spell(w->${id})`);
    assert.ok(found, `brak oferty dla ${id}: ${options.map((o) => o.cmd).join(' | ')}`);
    return found.score;
  };
  // Kotwice pomiarowe (sonda PRZED/PO). Różnica własny gracz ↔ gracz wroga
  // to DOKŁADNIE kara z mapy: `prevent_next_damage` 40 + power beneficjenta
  // (gracz nie ma power → 40). Usunięcie wpisu albo gałęzi celu-gracza
  // zjeżdża do remisu 60/−24 i ten assert pada (mutacje B-M, B2-M).
  assert.equal(scoreOf('p2'), 60, 'osłona SIEBIE bez kary');
  assert.equal(scoreOf('p1'), -64, 'osłona PRZECIWNIKA z karą 40 (U1)');
  assert.equal(scoreOf('p2') - scoreOf('p1'), 124,
    'przepaść między osłoną swoją a wroga = 60 (brak wartości prewencji u wroga) + 40 (wpis) + 24');
  // Cel-stwór wroga: wpis + power (40 + 3) — dowód, że mapa jest nośna
  // także dla obiektów na polu bitwy (próba 40 → 4000 dawała −4027).
  assert.equal(scoreOf('foe'), -67);
  // Anty-over-fix: naprawa NIE karze własnej strony (60 / 61 jak przed nią).
  assert.equal(scoreOf('mine'), 61);
  // Zachowanie: taktyka właściciela — nigdy cel we wroga.
  assert.equal(choice.type, 'cast_spell');
  assert.ok(['mine', 'p2'].includes(choice.targets?.[0]),
    `tarcza idzie po własnej stronie: ${JSON.stringify(choice)}`);
});

