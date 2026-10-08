// PMSSB-59 (batch 64) — audyt jakości scoringu dla mechanik nowych kart.
// Kotwice pomiarowe: bot realny (`createHeuristicBot`), seed zamrożony,
// `randomness: 0`, `lookahead: 0` (konfiguracja produkcyjna z session.js),
// punkty z `bot.trace()`. Każdy test = pomiar NA ŻYWYM silniku, nie symulacja.
//
// Fala A (F1) — twarde usuwanie w ścieżce ZDOLNOŚCI aktywowanych:
//   Universal Solvent „{7}, {T}, poświęć: zniszcz celowy permanent" —
//   `activate_ability` nie miało gałęzi nagrody dla `destroy_permanent`/
//   `exile_permanent` (wyceniana wyłącznie rodzina BOUNCE_STRENGTH), więc
//   aktywacja płaciła koszt i dostawała ZA NIC. Pomiar PRZED (10 many, wrogi
//   2/2, seed 2026): −5 dla KAŻDEGO celu — 4/4, 1/1, ląd i własny permanent
//   punktowane identycznie (cel nie wchodził w ogóle do oceny), pass = 0 →
//   bot nigdy nie aktywował. Naprawa: `REMOVAL_EFFECTS` wyciągnięte z ścieżki
//   czarów na poziom modułu (L41 — jeden zestaw) + lustrzana gałąź w ścieżce
//   zdolności z tą samą skalą ofiary (baza + waga + TMC).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, { id, cardId, controllerId, zone, kind }) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: kind ?? data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

/** Scena z pomiaru: Solvent + własny 2/2 + wrogi celembryk, `many` many, main1. */
function solventScene(foeId, many = 10) {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', many);
  put(state, { id: 'solvent', cardId: 'universal-solvent', controllerId: 'p2', zone: 'battlefield' });
  put(state, { id: 'mine', cardId: 'highland-game', controllerId: 'p2', zone: 'battlefield' });
  put(state, { id: 'foe', cardId: foeId, controllerId: 'p1', zone: 'battlefield' });
  return state;
}

function decide(state) {
  const view = playerView(state, 'p2');
  const bot = createHeuristicBot({ seed: 2026, randomness: 0, lookahead: 0 });
  const choice = bot.chooseCommand(view, {});
  const last = bot.trace().at(-1) ?? {};
  return { choice, options: last.options ?? [] };
}

function optionScore(options, cmd) {
  const found = options.find((o) => o.cmd === cmd);
  assert.ok(found, `brak opcji ${cmd} w: ${options.map((o) => o.cmd).join(' | ')}`);
  return found.score;
}

// ---------------------------------------------------------------------------
// Fala A / F1 — nagroda za cel wroga (było: 0 → remis z passem).
// ---------------------------------------------------------------------------

test('PMSSB-59/A: Solvent aktywuje się na wrogim stworze (było −5 = pass)', () => {
  const { choice, options } = decide(solventScene('highland-game'));
  assert.deepEqual(choice, {
    type: 'activate_ability', playerId: 'p2', objectId: 'solvent', abilityIndex: 0, targets: ['foe'],
  });
  assert.equal(optionScore(options, 'activate_ability(solvent#0->foe)'), 27);
  assert.ok(optionScore(options, 'activate_ability(solvent#0->foe)') > optionScore(options, 'pass_priority'));
});

test('PMSSB-59/A-skala: cel 6/5 = 51 > cel 2/1 = 27 (skala ofiary, L41 z cast_spell)', () => {
  const small = decide(solventScene('highland-game'));
  const big = decide(solventScene('segmented-krotiq'));
  const s = optionScore(small.options, 'activate_ability(solvent#0->foe)');
  const b = optionScore(big.options, 'activate_ability(solvent#0->foe)');
  assert.equal(s, 27);
  assert.equal(b, 51);
  // 51 − 27 = 24 = 2 × 7 (delta ofiary, removalWorthWeight) + 10 (delta bonusu
  // TMC `enemyRemovalTargetBonus` — 6/5 to realniejsze zagrożenie niż 2/2).
  assert.ok(b - s > 2 * ((6 + 5) - (2 + 2)), 'delta zawiera wagę ofiary + bonus TMC');
});

test('PMSSB-59/A-własny: cel własny karany (−95/−98) — pass wygrywa', () => {
  const { options } = decide(solventScene('highland-game'));
  assert.equal(optionScore(options, 'activate_ability(solvent#0->solvent)'), -95);
  assert.equal(optionScore(options, 'activate_ability(solvent#0->mine)'), -98);
  assert.equal(optionScore(options, 'pass_priority'), 0);
});

test('PMSSB-59/A-many: 3 many — zdolność {7} nie jest w ofercie (nieopłacalna)', () => {
  const { choice, options } = decide(solventScene('highland-game', 3));
  assert.deepEqual(choice, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(!options.some((o) => o.cmd.startsWith('activate_ability(solvent')), 'brak oferty aktywacji');
});

// ---------------------------------------------------------------------------
// Fala B (F2) — pompka „do końca tury" z ograniczeniem sorcery: kara
// „poza walką w mojej turze" wyceniała JEDYNE legalne okno tej zdolności jak
// błąd (pisana dla sztuczek instant-speed, które zawsze można odłożyć), a
// utratę ataku za koszt {T} doliczano ODBIORCY pumpu zamiast TAPNIĘTEMU
// źródłu. Pomiar PRZED (seed 2026, main1): Brave-Kin Duo = −28 → pass, bot
// nigdy nie użył zdolności.
// ---------------------------------------------------------------------------

function duoScene({ foeId, foeOnBoard = true, foeLife = 20, mana = 3 }) {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', mana);
  state.players.find((p) => p.id === 'p1').life = foeLife;
  put(state, { id: 'duo', cardId: 'brave-kin-duo', controllerId: 'p2', zone: 'battlefield' });
  put(state, { id: 'mine', cardId: 'highland-game', controllerId: 'p2', zone: 'battlefield' });
  if (foeOnBoard) put(state, { id: 'foe', cardId: foeId, controllerId: 'p1', zone: 'battlefield' });
  return state;
}

test('PMSSB-59/B: Duo pompuje na LETAL — atak za 3 na wroga w 4 życia (było −28 = pass)', () => {
  // Moc wysyłana w tej turze = 3 (Duo 1/1 + Highland Game 2/1), pump +1 mocy
  // domyka 4 obrażenia = lethal. Jedyny przypadek, w którym zdolność
  // sorcery-speed jest jednoznacznie opłacalna.
  const { choice, options } = decide(duoScene({ foeId: 'highland-game', foeOnBoard: false, foeLife: 4 }));
  assert.deepEqual(choice, {
    type: 'activate_ability', playerId: 'p2', objectId: 'duo', abilityIndex: 0, targets: ['mine'],
  });
  assert.equal(optionScore(options, 'activate_ability(duo#0->mine)'), 49);
});

test('PMSSB-59/B-kontrola: atak już letalny (wróg w 3) — pompa nie jest potrzebna', () => {
  const { options } = decide(duoScene({ foeId: 'highland-game', foeOnBoard: false, foeLife: 3 }));
  assert.ok(optionScore(options, 'activate_ability(duo#0->mine)') < optionScore(options, 'pass_priority'),
    'bez premii lethal bot nie płaci za jałową pompę');
});

test('PMSSB-59/B-kontrola: pump w pustą planszę (wróg 2/2, 20 życia) wciąż nieopłacalny', () => {
  const { choice, options } = decide(duoScene({ foeId: 'highland-game' }));
  assert.deepEqual(choice, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(optionScore(options, 'activate_ability(duo#0->mine)'), -1);
});

test('PMSSB-59/B-źródło: utrata ataku liczona na TAPNIĘTYM źródle — pump innego stwora > pump samego Duo', () => {
  const { options } = decide(duoScene({ foeId: 'highland-game' }));
  const other = optionScore(options, 'activate_ability(duo#0->mine)');
  const self = optionScore(options, 'activate_ability(duo#0->duo)');
  assert.ok(other > self + 20, `pump odbiorcy (${other}) vs pump samego siebie (${self})`);
});

test('PMSSB-59/B-wróg: debuff wrogiego stwora nadal mocno karany', () => {
  const { options } = decide(duoScene({ foeId: 'highland-game' }));
  assert.ok(optionScore(options, 'activate_ability(duo#0->foe)') < -50, 'pump wroga to strata');
});
