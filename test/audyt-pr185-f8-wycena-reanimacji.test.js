// Audyt PR #185, F-8 (Etap E2.8) — generyczna gałąź reanimacji w bocie wyceniała
// ciało STAŁYMI P/T Necrosavanta: `const reanimatedValue = 10 + (5 * 2) + 5;`.
//
// Pomiar audytu: mutacja `10 + (5*2) + 5` → `10 + (1*2) + 1` (zmiana wyceny
// o 12 punktów) PRZEŻYŁA cały zestaw `audyt-pmssb89-batch73` (rc=0, 12/0) —
// wycena gałęzi nie była pinowana wcale. Pomiar uzupełniający (sonda
// `.arena/probe-e28b.mjs`, ten plik): przy tym samym fodderze score aktywacji
// wynosił 19/15/4 niezależnie od tego, czy z grobu wracało ciało 1/1, 5/5 czy
// 7/7 — wartość ciała nie zależała od ciała.
//
// Zasada: ADR 0002 (rozpoznawanie po deskryptorach, nie po karcie) — predykat
// gałęzi JEST generyczny (`reanimate_under_your_control` + `fromGraveyard` +
// `cost.sacrificeCreature`), więc wartość też musi być: P/T z widoku grobu
// (ADR 0017 — bot czyta widok, nie reguły z głowy). L41: ta sama skala
// `10 + 2P + T` żyła już w dwóch gałęziach `return_permanent_from_graveyard`
// (cast_spell i activate_ability, M157/Batch 60) — trzecia kopia ze stałymi to
// trzecie źródło tej samej reguły.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createRegistry, defineCard } from '../src/cards/registry.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

// Karty syntetyczne: TEN SAM generyczny deskryptor co Necrosavant (zdanie Oracle
// „{3}{B}{B}, Sacrifice a creature: Return this card from your graveyard to the
// battlefield. Activate only during your upkeep."), różne ciała. Bez nich pin
// „wycena idzie z P/T" nie ma czym zmierzyć — katalog ma dziś dokładnie jedną
// kartę spełniającą deskryptor (5/5), czyli stałe 5/5 były nieodróżnialne od
// odczytu z danych.
const ORACLE = '{3}{B}{B}, Sacrifice a creature: Return this card from your graveyard to the battlefield. Activate only during your upkeep.';
const reanimator = (id, name, power, toughness, manaCost) => defineCard({
  id, name, set: null, plan: null, types: ['Creature'], subtypes: ['Zombie'], colors: ['B'],
  manaCost, power, toughness, oracleText: ORACLE,
  support: { status: 'supported', limitations: [] },
  abilities: [{
    type: 'activated', timing: 'instant',
    cost: { mana: 5, colors: ['B', 'B'], sacrificeCreature: true },
    effect: { type: 'reanimate_under_your_control' },
    onlyInStep: 'upkeep', fromGraveyard: true,
  }],
});
const wanilia = (id, name, power, toughness, manaCost, colors, subtypes) => defineCard({
  id, name, set: null, plan: null, types: ['Creature'], subtypes, colors,
  manaCost, power, toughness, oracleText: '',
  support: { status: 'supported', limitations: [] }, abilities: [],
});

const SYNTETYKI = [
  reanimator('f8-rean-1-1', 'F8 Reanimator 1/1', 1, 1, 1),
  reanimator('f8-rean-5-5-a', 'F8 Reanimator 5/5 A', 5, 5, 6),
  reanimator('f8-rean-5-5-b', 'F8 Reanimator 5/5 B', 5, 5, 6),
  reanimator('f8-rean-7-7', 'F8 Reanimator 7/7', 7, 7, 8),
  wanilia('f8-fodder-1-1', 'F8 Fodder 1/1', 1, 1, 1, ['W'], ['Spirit']),
  wanilia('f8-fodder-6-6', 'F8 Fodder 6/6', 6, 6, 6, ['G'], ['Beast']),
];
const REJESTR = createRegistry([...createCardRegistry().all(), ...SYNTETYKI]);

/**
 * Scena: własny upkeep (okno `onlyInStep: 'upkeep'` — F-4), karta z deskryptorem
 * reanimacji w grobie, jeden stwór do poświęcenia, mana {3}{B}{B} w puli.
 * Zwraca wyceny bota z `trace()` (wzór liczbowego pinu: batch73 F-6) — decyzja
 * `activate_ability` kontra `pass_priority`.
 */
function scena({ reanId, fodderId = 'river-herald-guide', seed = 880 }) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'upkeep', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const payload = (cardId, ownerId) => {
    const [entry] = createCardDeck({ cardIds: [cardId], ownerId, registry: REJESTR });
    const { id, instanceId, cardId: _c, ownerId: _o, controllerId, zone, objectId, ...rest } = entry;
    return rest;
  };
  const put = (id, cardId, zone = 'battlefield') => addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone, ...payload(cardId, 'p1'),
  });
  put('rean', reanId, 'graveyard');
  put('fodder', fodderId);
  addMana(state, 'p1', 6, { colors: [] });
  addMana(state, 'p1', 4, { colors: ['B'] });

  const bot = createHeuristicBot({ seed, registry: REJESTR });
  const choice = bot.chooseCommand(playerView(state, 'p1'), {});
  const wpis = bot.trace().at(-1);
  const scoreOf = (cmd) => wpis.options.find((o) => o.cmd === cmd)?.score;
  return {
    choice,
    activate: scoreOf('activate_ability(rean#0+sac:fodder)'),
    pass: scoreOf('pass_priority'),
  };
}

const ciało = (id) => `${REJESTR.get(id).power}/${REJESTR.get(id).toughness}`;

test('F-8/1: wycena reanimacji idzie z P/T karty — różnica = 2*ΔP + ΔT (skala 10 + 2P + T)', () => {
  // Ten sam fodder (strata poświęcenia identyczna), różne ciała z grobu: jedyną
  // zmienną jest P/T reanimowanej karty. Stałe 5/5 dawały tu 0 w obu kierunkach.
  const maly = scena({ reanId: 'f8-rean-1-1' });
  const sredni = scena({ reanId: 'necrosavant' });
  const duzy = scena({ reanId: 'f8-rean-7-7' });
  for (const [nazwa, s] of [['1/1', maly], ['5/5', sredni], ['7/7', duzy]]) {
    assert.ok(Number.isFinite(s.activate), `wycena aktywacji dla ciała ${nazwa} jest liczbą`);
    assert.ok(Number.isFinite(s.pass), `wycena passu dla ciała ${nazwa} jest liczbą`);
  }
  assert.equal(sredni.activate - maly.activate, 12,
    `5/5 kontra 1/1: 2*(5-1) + (5-1) = 12 (było ${maly.activate} i ${sredni.activate} — stała 5/5)`);
  assert.equal(duzy.activate - sredni.activate, 6,
    `7/7 kontra 5/5: 2*(7-5) + (7-5) = 6 (było ${sredni.activate} i ${duzy.activate})`);
});

test('F-8/2: małe ciało z grobu NIE jest warte drogiego poświęcenia — pass wygrywa (CR 602.2b: koszt)', () => {
  // Fodder 6/6 (strata poświęcenia większa niż wartość ciała 1/1) → reanimacja
  // 1/1 jest poniżej passu. Przy stałych 5/5 bot aktywował („opłaca się"), choć
  // oddaje 6/6 za 1/1 — dokładnie ta sama wada klasy, którą F-8 zgłasza.
  const s = scena({ reanId: 'f8-rean-1-1', fodderId: 'f8-fodder-6-6' });
  assert.ok(s.activate < s.pass,
    `reanimacja ${ciało('f8-rean-1-1')} za poświęcenie ${ciało('f8-fodder-6-6')} poniżej passu: ${s.activate} < ${s.pass}`);
  assert.notEqual(s.choice.type, 'activate_ability',
    `bot nie oddaje 6/6 za 1/1: ${JSON.stringify(s.choice)}`);
});

test('F-8/3: duże ciało z grobu JEST warte tego samego poświęcenia — bot aktywuje (anty-over-fix)', () => {
  // Ta sama scena, tylko ciało 7/7: wycena musi wrócić powyżej passu. Bez tego
  // pinu „naprawa" sprowadzona do zaniżania każdej reanimacji też byłaby zielona
  // (mutacja audytu `10 + (1*2) + 1` = 13 dla każdego ciała).
  const s = scena({ reanId: 'f8-rean-7-7', fodderId: 'f8-fodder-6-6' });
  assert.ok(s.activate > s.pass,
    `reanimacja ${ciało('f8-rean-7-7')} za poświęcenie ${ciało('f8-fodder-6-6')} powyżej passu: ${s.activate} > ${s.pass}`);
  assert.equal(s.choice.type, 'activate_ability',
    `bot bierze 7/7 za 6/6: ${JSON.stringify(s.choice)}`);
});

test('F-8/4: Necrosavant (5/5) bez zmiany zachowania — aktywacja w upkeepie przy fodderze 3/1', () => {
  // Pin istniejącej karty batcha 73: skala 10 + 2P + T daje dla 5/5 dokładnie
  // tyle, ile dawały stałe, więc naprawa nie przestraja dotychczasowej gry bota.
  const s = scena({ reanId: 'necrosavant', fodderId: 'river-herald-guide' });
  assert.equal(s.activate, 15,
    `25 (10 + 2*5 + 5) minus strata poświęcenia River Herald Guide 3/1 = 15 (mierzone: ${s.activate})`);
  assert.ok(s.activate > s.pass, 'reanimacja powyżej passu');
  assert.equal(s.choice.type, 'activate_ability', `bot aktywuje: ${JSON.stringify(s.choice)}`);
});

test('F-8/5: wycena nie zależy od TOŻSAMOŚCI karty — dwa różne wpisy o tym samym ciele mają ten sam score (ADR 0002)', () => {
  const a = scena({ reanId: 'f8-rean-5-5-a', fodderId: 'river-herald-guide' });
  const b = scena({ reanId: 'f8-rean-5-5-b', fodderId: 'river-herald-guide' });
  assert.notEqual(a.activate, undefined);
  assert.equal(a.activate, b.activate,
    `ten sam deskryptor i to samo ciało → ta sama wycena (${a.activate} vs ${b.activate}) — brak przypadku po nazwie/id karty`);
  assert.equal(a.activate, 15, 'ciało 5/5 wycenione jak Necrosavant (skala 10 + 2P + T)');
});

test('F-8/6: gdy wpis grobu nie niesie P/T, wartość bierze się z definicji karty (zapas helpera)', () => {
  // W produkcji karty w grobie mają P/T z `createCardDeck`, ale helper czyta
  // widok (ADR 0017) i ma zapas z definicji — gałąź zapasu musi być pinowana,
  // inaczej jest nieprzetestowanym kodem (L21/L34). Scena B buduje obiekt grobu
  // BEZ statystyk (tylko `cardId` + `abilities`), więc widok daje `power: null`.
  const zStatystykami = scena({ reanId: 'f8-rean-5-5-a', fodderId: 'river-herald-guide' });

  const state = createGameState({ seed: 881, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'upkeep', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const def = REJESTR.get('f8-rean-5-5-a');
  addObject(state, {
    id: 'rean', instanceId: 'i-rean', cardId: def.id, controllerId: 'p1', ownerId: 'p1',
    zone: 'graveyard', kind: 'creature', abilities: def.abilities, manaCost: def.manaCost,
  });
  const [fodder] = createCardDeck({ cardIds: ['river-herald-guide'], ownerId: 'p1', registry: REJESTR });
  const { id: _i, instanceId, cardId: _c, ownerId: _o, controllerId, zone, objectId, ...reszta } = fodder;
  addObject(state, { id: 'fodder', instanceId: 'i-fodder', cardId: 'river-herald-guide', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', ...reszta });
  addMana(state, 'p1', 6, { colors: [] });
  addMana(state, 'p1', 4, { colors: ['B'] });

  const widok = playerView(state, 'p1');
  const wpisGrobu = widok.zones.graveyard.find((o) => o.id === 'rean');
  assert.equal(wpisGrobu.power ?? null, null, 'widok grobu bez P/T (warunek testu zapasu)');
  const bot = createHeuristicBot({ seed: 881, registry: REJESTR });
  bot.chooseCommand(widok, {});
  const opcje = bot.trace().at(-1).options;
  const bezStatystyk = opcje.find((o) => o.cmd === 'activate_ability(rean#0+sac:fodder)')?.score;
  assert.ok(Number.isFinite(bezStatystyk), 'aktywacja wyceniona mimo braku P/T w widoku');
  assert.equal(bezStatystyk, zStatystykami.activate,
    `zapas z definicji daje tę samą wartość co P/T z widoku (${bezStatystyk} vs ${zStatystykami.activate})`);
});
