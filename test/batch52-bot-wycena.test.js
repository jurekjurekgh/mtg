// =============================================================================
// Batch 52 (2026-09-01) — wycena BOTA dla nowych kart (audyt Żywym Testerem).
//
// Luki znalezione przy weryfikacji „bot poprawnie używa nowych kart”:
//
//   1. Cemetery Recruitment (`return_card_from_graveyard_to_hand`) — brak
//      wyceny = warianty celu REMISOWAŁY na bazie 50 i bot brał PIERWSZĄ
//      (najgorszą) kartę z grobu; Zombie → dobranie nie było premiowane.
//   2. Jolrael, Mwonvuli Recluse (`set_base_pt_creatures_you_control`) —
//      zdolność dostawała gołe score=2 i bot aktywował ją nawet, gdy
//      OSŁABIAŁA własną planszę (6/6 → 2/2 przy 2 kartach w ręce).
//   3. Leonin Surveyor (zdolność AKTYWOWANA Z GROBU) — `abilityObject` nie
//      widział karty w grobie (tylko pola bitwy/ręka), więc pętla efektów
//      nie wyceniała `draw_cards` — gołe score=2.
//
// Reguły po deskryptorach efektów (ADR 0002), zero nazw kart.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1', step = 'main') {
  const state = createGameState({ seed: 52, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  state.turn.phase = 'precombat_main'; // Główna 1 (okno dla zdolności „do końca tury")
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

function addSimpleCreature(state, id, controllerId, { power = 2, toughness = 2 } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
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
// Cemetery Recruitment — zwrot stwora z grobu (warianty celu NIE remisują)
// =============================================================================

test('B52-bot: Cemetery Recruitment zwraca NAJLEPSZEGO stwora z grobu (bez remisu wariantów)', () => {
  const state = game('p1');
  addMana(state, 'p1', 2, { colors: ['B'] });
  put(state, 'recruit', 'cemetery-recruitment', 'p1', 'hand');
  put(state, 'g1', 'highland-game', 'p1', 'graveyard');   // 2/1 — słaby
  put(state, 'g2', 'woolly-loxodon', 'p1', 'graveyard');  // 6/7 — mocny
  const view = playerView(state, 'p1');
  const { chosen, options } = decide(view);
  const g1 = scoreOf(options, 'cast_spell(recruit->g1)');
  const g2 = scoreOf(options, 'cast_spell(recruit->g2)');
  assert.notEqual(g1, g2, `warianty celu muszą się różnić (remis = przypadkowy wybór): ${JSON.stringify(options)}`);
  assert.ok(g2 > g1, `6/7 ma być cenniejszy od 2/1: g1=${g1}, g2=${g2}`);
  assert.equal(chosen.type, 'cast_spell');
  assert.deepEqual(chosen.targets, ['g2'], `bot ma zwrócić mocniejszego stwora: ${JSON.stringify(chosen)}`);
});

test('B52-bot: Cemetery Recruitment premiuje Zombie (dodatkowe dobranie)', () => {
  const state = game('p1');
  addMana(state, 'p1', 2, { colors: ['B'] });
  put(state, 'recruit', 'cemetery-recruitment', 'p1', 'hand');
  // 5/5 nie-Zombie ma surowe ciało 15 vs Zombie 4/6 = 14 — bez premii za
  // dobranie wygrałby nie-Zombie. Z premią (drawIfSubtypes: Zombie) wygrywa Zombie.
  put(state, 'g1', 'gloomfang-mauler', 'p1', 'graveyard');      // 5/5 nie-Zombie
  put(state, 'g2', 'minotaur-abomination', 'p1', 'graveyard');  // 4/6 Zombie
  const view = playerView(state, 'p1');
  const { chosen, options } = decide(view);
  const g1 = scoreOf(options, 'cast_spell(recruit->g1)');
  const g2 = scoreOf(options, 'cast_spell(recruit->g2)');
  assert.ok(g2 > g1, `Zombie (dobranie) ma przebić surowe ciało nie-Zombie: g1=${g1}, g2=${g2}`);
  assert.deepEqual(chosen.targets, ['g2'], `bot ma zwrócić Zombie (dobranie): ${JSON.stringify(chosen)}`);
});

// =============================================================================
// Jolrael, Mwonvuli Recluse — bazowe X/X do końca tury (bez samodestrukcji)
// =============================================================================

test('B52-bot: Jolrael NIE aktywuje X/X, gdy osłabia własną planszę', () => {
  const state = game('p1');
  addMana(state, 'p1', 6, { colors: ['G', 'G'] });
  put(state, 'jolrael', 'jolrael-mwonvuli-recluse', 'p1');
  addSimpleCreature(state, 'bear', 'p1', { power: 6, toughness: 6 });
  // X = 2 karty w ręce — 6/6 spadnie do 2/2, a 1/2 (Jolrael) urośnie do 2/2.
  // Netto plansza traci — aktywacja to samodestrukcja. Marut {8} = nie do
  // rzucenia za 6 many (bez morph/cyklingu), żeby nie konkurował z decyzją.
  put(state, 'h1', 'marut', 'p1', 'hand');
  put(state, 'h2', 'marut', 'p1', 'hand');
  const view = playerView(state, 'p1');
  const { chosen, options } = decide(view);
  const act = scoreOf(options, 'activate_ability(jolrael#1)');
  assert.ok(act != null, 'zdolność jest oferowana (mana wystarcza)');
  assert.ok(act < 0, `aktywacja osłabiająca planszę ma schodzić poniżej passu: ${act}`);
  assert.notEqual(chosen.type, 'activate_ability',
    `bot nie aktywuje X/X, gdy to osłabia planszę: ${JSON.stringify(chosen)}`);
});

test('B52-bot: Jolrael AKTYWUJE X/X w Głównej 1, gdy wzmacnia planszę', () => {
  const state = game('p1');
  addMana(state, 'p1', 6, { colors: ['G', 'G'] });
  put(state, 'jolrael', 'jolrael-mwonvuli-recluse', 'p1');
  addSimpleCreature(state, 'saproling', 'p1', { power: 1, toughness: 1 });
  // X = 5 kart w ręce — 1/1 i 1/2 (Jolrael) rosną do 5/5: netto duży plus.
  for (let i = 1; i <= 5; i += 1) put(state, `h${i}`, 'marut', 'p1', 'hand');
  const view = playerView(state, 'p1');
  const { chosen, options } = decide(view);
  const act = scoreOf(options, 'activate_ability(jolrael#1)');
  assert.ok(act != null, 'zdolność jest oferowana (mana wystarcza)');
  assert.ok(act > 0, `wzmacniająca aktywacja w Głównej 1 ma być dodatnia: ${act}`);
  assert.equal(chosen.type, 'activate_ability', `bot ma aktywować X/X: ${JSON.stringify(chosen)}`);
  assert.equal(chosen.objectId, 'jolrael');
});

// =============================================================================
// Leonin Surveyor — {3} exile z grobu: dobierz kartę (wycena dobrania)
// =============================================================================

test('B52-bot: Leonin Surveyor — dobranie z grobu wycenione jak karta (nie goła baza 2)', () => {
  const state = game('p1');
  addMana(state, 'p1', 3, { colors: ['W'] });
  state.players.find((p) => p.id === 'p1').speed = 4; // max speed
  put(state, 'leonin', 'leonin-surveyor', 'p1', 'graveyard');
  // M280/D: dobranie OSTATNIEJ karty biblioteki jest karane (deck-out,
  // CR 121.4/704.5b), więc scenariusz testu nie może mieć jednej karty —
  // inaczej „dobranie z grobu" zeszłoby pod pass i test wyceniałby
  // deck-out, a nie wartość karty. Pięć kart = bezpieczne dobranie.
  for (let i = 1; i <= 5; i += 1) put(state, `l${i}`, 'highland-game', 'p1', 'library');
  const view = playerView(state, 'p1');
  const { chosen, options } = decide(view);
  const draw = scoreOf(options, 'activate_ability(leonin#2)');
  assert.ok(draw != null, 'zdolność z grobu oferowana przy max speed');
  assert.ok(draw >= 6, `dobranie karty ma być warte co najmniej wartość karty: ${draw}`);
  assert.equal(chosen.type, 'activate_ability', `bot ma dobrać kartę: ${JSON.stringify(chosen)}`);
  assert.equal(chosen.objectId, 'leonin');
});
