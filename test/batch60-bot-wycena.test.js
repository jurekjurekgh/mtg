// =============================================================================
// Batch 60 (2026-09-27) — wycena BOTA dla nowych kart (audyt „czy bot umie
// rzucać nowe czary i czy scoring jest poprawny").
//
// Luki znalezione sondami chooseCommand (prawdziwe definicje kart):
//
//   1. Summary Judgment (`damage` + `amountIfAddendum`) — gałąź obrażeń
//      czytała statyczne `effect.amount`, więc bot wyceniał czar zawsze na 3
//      i PASSOWAŁ tapniętego 5/5 we własnej main (Addendum daje 5).
//   2. Timely Interference (kicked `blocks_if_able_until_end_of_turn`) —
//      gałąź wymuszonego bloku istniała TYLKO w ścieżce zdolności aktywowanych
//      (karta-czar nigdy tam nie trafia), a rodzeństwo-debuff (−1/−0) dostawał
//      −75 z kaskady M218/2 („debuff poza walką"), topiąc sens kickera.
//      Dodatkowo każdy debuff na wroga łapał PODWÓJNĄ karę −75/−60 (klamra
//      `else if (isPumpEffect)` nie wykluczała ujemnych pumpów).
//   3. Xu-Ifit, Osteoharmonist (`return_permanent_from_graveyard` ze
//      ZDOLNOŚCI) — brak bliźniaka gałęzi M157 w activate_ability, więc cele
//      remisowały na bazie 2 i bot reanimował PIERWSZĄ kartę grobu (L50).
//   4. Clone Shell — brak wpisów ETB/dies w ETB_EFFECT_BONUS (ciche +0);
//      bot i tak rzucał Skorupę (rozwój planszy), ale zaniżał jej wartość.
//
// Reguły po deskryptorach efektów (ADR 0002), zero nazw kart.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1', step = 'main1') {
  const state = createGameState({ seed: 60, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn.activePlayerId = playerId;
  state.turn = jumpToStep(state.turn, step, playerId);
  // Zdrowa biblioteka (strażnik deck-outu karze dobieranie przy ≤3 kartach).
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 10; i++) {
      addObject(state, {
        id: `lib-${pid}-${i}`, instanceId: `ilib-${pid}-${i}`, cardId: `test-lib-${pid}-${i}`,
        controllerId: pid, ownerId: pid, zone: 'library', kind: 'spell', manaCost: 2,
      });
    }
  }
  return state;
}

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, kicker: def.kicker,
  });
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

function addSimpleCreature(state, id, controllerId, { power = 2, toughness = 2, tapped = false } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 3, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, tapped }));
  return state.objects.get(id);
}

function addSimpleArtifact(state, id, controllerId) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId, zone: 'battlefield',
    kind: 'artifact', power: 0, toughness: 0, manaCost: 3, abilities: [], keywords: [],
    subtypes: [], types: ['Artifact'], colors: [],
  });
  return state.objects.get(id);
}

function decide(view, seed = 3) {
  const bot = createHeuristicBot({ seed });
  const chosen = bot.chooseCommand(view);
  const last = bot.trace().at(-1);
  return { chosen, options: last.options };
}

function scoreOf(options, prefix) {
  const opt = options.find((o) => String(o.cmd).startsWith(prefix));
  return opt ? opt.score : null;
}

// =============================================================================
// Summary Judgment — Addendum (5 zamiast 3 we własnej main fazie)
// =============================================================================

test('B60-bot: Summary Judgment dobija tapniętego 5/5 WE WŁASNEJ main (Addendum 5)', () => {
  const state = game('p1');
  addMana(state, 'p1', 2);
  put(state, 'sum', 'summary-judgment', 'p1', 'hand');
  addSimpleCreature(state, 'wurm', 'p2', { power: 5, toughness: 5, tapped: true });
  const { chosen } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'cast_spell', `bot ma rzucić Summary (Addendum 5 dobija): ${JSON.stringify(chosen)}`);
  assert.deepEqual(chosen.targets, ['wurm']);
});

test('B60-bot: Summary Judgment dobija tapniętego 3/3 (kontrola zwykłych 3)', () => {
  const state = game('p1');
  addMana(state, 'p1', 2);
  put(state, 'sum', 'summary-judgment', 'p1', 'hand');
  addSimpleCreature(state, 'beast', 'p2', { power: 3, toughness: 3, tapped: true });
  const { chosen } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'cast_spell');
  assert.deepEqual(chosen.targets, ['beast']);
});

test('B60-bot: Summary Judgment NIE rzuca w 5/5 w combacie (brak Addendum, 3 nie dobija)', () => {
  const state = game('p1');
  put(state, 'sum', 'summary-judgment', 'p1', 'hand');
  addSimpleCreature(state, 'wurm', 'p2', { power: 5, toughness: 5, tapped: true });
  addSimpleCreature(state, 'atk', 'p1', { power: 2, toughness: 2 });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] });
  addMana(state, 'p1', 2);
  const { chosen } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'pass_priority', `w combacie Addendum nie działa — 3 w 5/5 to strata: ${JSON.stringify(chosen)}`);
});

// =============================================================================
// Timely Interference — kopnięty kill-block (i anty-overfixy)
// =============================================================================

function timelyAttackWindow(victimStats) {
  const state = game('p1');
  put(state, 'tim', 'timely-interference', 'p1', 'hand');
  addSimpleCreature(state, 'atk', 'p1', { power: 3, toughness: 3 });
  addSimpleCreature(state, 'foe', 'p2', victimStats);
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] });
  addMana(state, 'p1', 4);
  return state;
}

test('B60-bot: Timely Interference kopie dla czystego kill-blocku (3/3 w 2/2)', () => {
  const state = timelyAttackWindow({ power: 2, toughness: 2 });
  const { chosen } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'cast_spell');
  assert.equal(chosen?.kicked, true, `ma kopnąć (wymuszony blok dobija): ${JSON.stringify(chosen)}`);
  assert.deepEqual(chosen.targets, ['foe']);
});

test('B60-bot: Timely Interference kopie, gdy debuff UMOŻLIWIA przeżycie (3/3 w 3/2)', () => {
  // Bez −1/−0 ofiara 3/2 dobijałaby atakującego 3/3 (3 ≥ 3) — osłabiona (2/2) już nie.
  const state = timelyAttackWindow({ power: 3, toughness: 2 });
  const { chosen } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'cast_spell');
  assert.equal(chosen?.kicked, true, `debuff ratuje atakującego — kicker się zwraca: ${JSON.stringify(chosen)}`);
  assert.deepEqual(chosen.targets, ['foe']);
});

test('B60-bot: Timely Interference NIE kopie bez dobicia (3/3 w 4/4) i NIE debuffuje własnego', () => {
  const state = timelyAttackWindow({ power: 4, toughness: 4 });
  const { chosen, options } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'pass_priority', `bez kill-blocku kicker to strata, a debuff własnego to samookaleczenie: ${JSON.stringify(chosen)}`);
  void options;
});

test('B60-bot: Timely Interference czeka bez ataku (nie pali kickera w próżnię)', () => {
  const state = game('p1');
  addMana(state, 'p1', 4);
  put(state, 'tim', 'timely-interference', 'p1', 'hand');
  addSimpleCreature(state, 'foe', 'p2', { power: 2, toughness: 2 });
  const { chosen } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'pass_priority', `poza walką kicker jałowy — trzymaj: ${JSON.stringify(chosen)}`);
});

// =============================================================================
// Renegade Tactics — cant_block celuje PRAWDZIWEGO blokera (bliźniak cast)
// =============================================================================

test('B60-bot: Renegade Tactics przed atakiem zdejmuje odkręconego blokera (nie tapniętego)', () => {
  const state = game('p1');
  addMana(state, 'p1', 1);
  put(state, 'ren', 'renegade-tactics', 'p1', 'hand');
  addSimpleCreature(state, 'me', 'p1', { power: 3, toughness: 3 });
  addSimpleCreature(state, 'blocker', 'p2', { power: 3, toughness: 3 });
  addSimpleCreature(state, 'tapped', 'p2', { power: 4, toughness: 4, tapped: true });
  const { chosen, options } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'cast_spell');
  assert.deepEqual(chosen.targets, ['blocker'], `ma zdjąć odkręconego blokera: ${JSON.stringify(chosen)}`);
  const good = scoreOf(options, 'cast_spell(ren->blocker)');
  const bad = scoreOf(options, 'cast_spell(ren->tapped)');
  assert.ok(good > bad, `prawdziwy bloker (${good}) ponad tapniętego (${bad})`);
});

// =============================================================================
// Xu-Ifit — reanimacja NAJLEPSZEGO celu (bliźniak activate M157)
// =============================================================================

test('B60-bot: Xu-Ifit reanimuje NAJCENNIEJSZEGO stwora z grobu (5/5, nie pierwszą 2/2)', () => {
  const state = game('p1');
  put(state, 'xu', 'xu-ifit-osteoharmonist', 'p1', 'battlefield');
  put(state, 'bad', 'leafcrown-dryad', 'p1', 'graveyard'); // 2/2 — pierwsza, słaba
  put(state, 'good', 'gorger-wurm', 'p1', 'graveyard');    // 5/5 — druga, mocna
  const { chosen, options } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'activate_ability', `ma aktywować reanimację: ${JSON.stringify(chosen)}`);
  assert.deepEqual(chosen.targets, ['good'], `ma wskrzesić 5/5, nie pierwszą 2/2: ${JSON.stringify(chosen)}`);
  const badScore = scoreOf(options, 'activate_ability(xu#0->bad)');
  const goodScore = scoreOf(options, 'activate_ability(xu#0->good)');
  assert.ok(goodScore > badScore, `5/5 (${goodScore}) ponad 2/2 (${badScore})`);
});

// =============================================================================
// Revealing Wind / Demolish / Trigon / Stensia / Clone Shell — piny zachowań
// =============================================================================

test('B60-bot: Revealing Wind ratuje mgłą przed letalem', () => {
  const state = game('p1');
  state.players.find((p) => p.id === 'p2').life = 5;
  put(state, 'rw', 'revealing-wind', 'p2', 'hand');
  addSimpleCreature(state, 'atk', 'p1', { power: 6, toughness: 5 });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} });
  addMana(state, 'p2', 3);
  const { chosen } = decide(playerView(state, 'p2'));
  assert.equal(chosen?.type, 'cast_spell', `mgła ratuje przed letalem 6 w 5 życia: ${JSON.stringify(chosen)}`);
});

test('B60-bot: Demolish niszczy artefakt przeciwnika', () => {
  const state = game('p1');
  addMana(state, 'p1', 4);
  put(state, 'dem', 'demolish', 'p1', 'hand');
  addSimpleArtifact(state, 'lyre', 'p2');
  const { chosen } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'cast_spell', `ma zniszczyć artefakt: ${JSON.stringify(chosen)}`);
  assert.deepEqual(chosen.targets, ['lyre']);
});

test('B60-bot: Trigon of Thought dobiera zamiast ładować (gdy stać na oba)', () => {
  const state = game('p1');
  addMana(state, 'p1', 4);
  put(state, 'tr', 'trigon-of-thought', 'p1', 'battlefield', { counters: { charge: 3 } });
  const { chosen } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'activate_ability');
  assert.equal(chosen?.abilityIndex, 1, `zdolność 1 to dobór (0 to +licznik): ${JSON.stringify(chosen)}`);
});

test('B60-bot: Stensia Innkeeper wchodzi na stół (ETB tap+skip wycenione)', () => {
  const state = game('p1');
  addMana(state, 'p1', 4);
  put(state, 'st', 'stensia-innkeeper', 'p1', 'hand');
  addSimpleCreature(state, 'foe', 'p2', { power: 2, toughness: 2 });
  const { chosen } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'cast_permanent', `ETB 8+10 niesie rzut: ${JSON.stringify(chosen)}`);
});

test('B60-bot: Clone Shell wchodzi na stół (imprint + dies wycenione)', () => {
  const state = game('p1');
  addMana(state, 'p1', 5);
  put(state, 'sh', 'clone-shell', 'p1', 'hand');
  const { chosen } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'cast_permanent', `bot rozwija planszę Skorupą: ${JSON.stringify(chosen)}`);
});

// =============================================================================
// Fleeting Distraction — regresja M202/G po FIX D3 (debuff ze zmianą wyniku)
// =============================================================================

test('B60-bot: Fleeting Distraction ratuje blokera debuffem (D3 nie zabił M202/G)', () => {
  // Wróg atakuje 3/2 w mojego 2/3: po −1/−0 (2/2) bloker przeżywa (2 < 3).
  const state = game('p2');
  addMana(state, 'p1', 1);
  put(state, 'fd', 'fleeting-distraction', 'p1', 'hand');
  addSimpleCreature(state, 'foe', 'p2', { power: 3, toughness: 2 });
  addSimpleCreature(state, 'me', 'p1', { power: 2, toughness: 3 });
  state.turn.activePlayerId = 'p2';
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p2');
  execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['foe'] });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const { chosen } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'cast_spell', `debuff zmieniający wynik bloku: ${JSON.stringify(chosen)}`);
  assert.deepEqual(chosen.targets, ['foe']);
});

// =============================================================================
// Batch60-followup (2026-09-27) — domknięcie ograniczeń 1–3 z audytu bota
// =============================================================================

function summaryHoldBoard() {
  // Tapnięte 2/2 (dobija zwykłe 3) + tapnięte 5/5 (dobija dopiero Addendum 5).
  const state = game('p1');
  put(state, 'sum', 'summary-judgment', 'p1', 'hand');
  addSimpleCreature(state, 'small', 'p2', { power: 2, toughness: 2 });
  addSimpleCreature(state, 'big', 'p2', { power: 5, toughness: 5 });
  state.objects.set('small', Object.freeze({ ...state.objects.get('small'), tapped: true }));
  state.objects.set('big', Object.freeze({ ...state.objects.get('big'), tapped: true }));
  addMana(state, 'p1', 2);
  return state;
}

test('B60F-1a: Summary TRZYMA do main2 we własnym combacie (nie marnuje w 2/2)', () => {
  const state = summaryHoldBoard();
  addSimpleCreature(state, 'atk', 'p1', { power: 2, toughness: 2 });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] });
  const { chosen } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'pass_priority', `tapnięte 5/5 doczeka main2 (Addendum 5): ${JSON.stringify(chosen)}`);
});

test('B60F-1b: Summary TRZYMA w turze wroga (tapnięte cele stoją do naszej main1)', () => {
  const state = summaryHoldBoard();
  state.turn.activePlayerId = 'p2';
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  const { chosen } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'pass_priority', `wróg odkręci się dopiero po naszej main1: ${JSON.stringify(chosen)}`);
});

test('B60F-1c: Summary NIE trzyma w naszym end stepie (wróg odkręci się pierwszy)', () => {
  const state = summaryHoldBoard();
  state.turn = jumpToStep(state.turn, 'end', 'p1');
  const { chosen } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'cast_spell', `po main2 nie ma na co czekać: ${JSON.stringify(chosen)}`);
  assert.deepEqual(chosen.targets, ['small']);
});

test('B60F-1d: Summary NIE trzyma, gdy nieblokowani dobijają (odpowiedź teraz)', () => {
  const state = game('p2');
  state.players.find((p) => p.id === 'p1').life = 3;
  addMana(state, 'p1', 2);
  put(state, 'sum', 'summary-judgment', 'p1', 'hand');
  addSimpleCreature(state, 'lethal', 'p2', { power: 3, toughness: 3 });
  addSimpleCreature(state, 'big', 'p2', { power: 5, toughness: 5 });
  state.objects.set('big', Object.freeze({ ...state.objects.get('big'), tapped: true }));
  state.turn.activePlayerId = 'p2';
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p2');
  execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['lethal'] });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const { chosen } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'cast_spell', `3 w 3 życia = lethal na stole: ${JSON.stringify(chosen)}`);
  assert.deepEqual(chosen.targets, ['lethal']);
});

test('B60F-2: Renegade zdejmuje ZABÓJCZEGO blokera 5/5, nie chumpa 1/1', () => {
  const state = game('p1');
  addMana(state, 'p1', 1);
  put(state, 'ren', 'renegade-tactics', 'p1', 'hand');
  addSimpleCreature(state, 'me', 'p1', { power: 3, toughness: 3 });
  addSimpleCreature(state, 'chump', 'p2', { power: 1, toughness: 1 }); // pierwszy w kolejności stołu
  addSimpleCreature(state, 'killer', 'p2', { power: 5, toughness: 5 });
  const { chosen, options } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'cast_spell');
  assert.deepEqual(chosen.targets, ['killer'], `5/5 zabija atakującego, 1/1 tylko chumpuje: ${JSON.stringify(chosen)}`);
  const chumpScore = scoreOf(options, 'cast_spell(ren->chump)');
  const killerScore = scoreOf(options, 'cast_spell(ren->killer)');
  assert.ok(killerScore > chumpScore, `zabójczy bloker (${killerScore}) ponad chumpa (${chumpScore})`);
});

test('B60F-2b: Panic Spellbomb (bliźniak activate) też celuje zabójczego blokera', () => {
  const state = game('p1');
  put(state, 'bomb', 'panic-spellbomb', 'p1', 'battlefield');
  addSimpleCreature(state, 'me', 'p1', { power: 3, toughness: 3 });
  addSimpleCreature(state, 'chump', 'p2', { power: 1, toughness: 1 }); // pierwszy w kolejności stołu
  addSimpleCreature(state, 'killer', 'p2', { power: 5, toughness: 5 });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['me'] });
  const { chosen } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'activate_ability', `zdjęcie blokera w oknie ataku: ${JSON.stringify(chosen)}`);
  assert.deepEqual(chosen.targets, ['killer'], `wspólny helper liczy obie ścieżki: ${JSON.stringify(chosen)}`);
});

function stensiaTriggerChoice(setupLands) {
  const state = game('p1');
  addMana(state, 'p1', 4);
  put(state, 'st', 'stensia-innkeeper', 'p1', 'hand');
  setupLands(state);
  const v0 = playerView(state, 'p1');
  const cast = v0.legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'st');
  assert.ok(cast, 'Stensia ma być rzucalna');
  execute(state, cast);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  return decide(playerView(state, 'p1'));
}

test('B60F-3a: Stensia tapuje ODKRĘCONY singleton (połówka tapnięcia łamie remis denialu)', () => {
  // Oba singletons (denial +28 każdy); tapnięta Góra pierwsza w kolejności —
  // bez premii za odkręcony cel bot brałby pierwszą z brzegu.
  const { chosen, options } = stensiaTriggerChoice((state) => {
    put(state, 'mt', 'basic-mountain', 'p2', 'battlefield', { tapped: true });
    put(state, 'iu', 'basic-island', 'p2', 'battlefield');
  });
  assert.equal(chosen?.type, 'resolve_trigger_target');
  assert.equal(chosen.targetId, 'iu', `odkręcona Wyspa (denial + tap teraz): ${JSON.stringify(chosen)}`);
  const tappedScore = scoreOf(options, 'resolve_trigger_target(mt)');
  const untappedScore = scoreOf(options, 'resolve_trigger_target(iu)');
  assert.ok(untappedScore > tappedScore, `odkręcony (${untappedScore}) ponad tapnięty (${tappedScore})`);
});

test('B60F-3b: Stensia tapuje ODKRĘCONY duplikat (nie doklepuje tapniętego)', () => {
  const { chosen } = stensiaTriggerChoice((state) => {
    put(state, 'mt', 'basic-mountain', 'p2', 'battlefield', { tapped: true });
    put(state, 'mu', 'basic-mountain', 'p2', 'battlefield');
  });
  assert.equal(chosen?.type, 'resolve_trigger_target');
  assert.equal(chosen.targetId, 'mu', `tapnięta Góra pierwsza — remis brałby ją: ${JSON.stringify(chosen)}`);
});
