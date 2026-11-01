// PMSSB-81 (batch 71) — koszt „odrzuć kartę o KWALIFIKATORZE” (Vampire Hounds,
// EXO: „{B}: Vampire Hounds gets +2/+2 until end of turn. Discard a creature
// card: Activate only once each turn.”). Pełna pętla: sonda PRZED → audyt
// kosztu i L41 → pokrętła + piny RED→GREEN.
//
// SONDA PRZED (blok 3/3, tura przeciwnika, `declare_blockers`):
//  • +2/+2 zmienia wynik walki (2/2 zabija 3/3 i przeżywa) → aktywacja +9;
//  • +2/+2 nic nie zmienia (blok 6/6) → aktywacja −19 (kara za spalenie karty);
//  • brak walki → −21.
// Koszt jest realny (karta ze ręki), więc aktywacja NIGDY nie jest „darmowym
// pompowaniem” — piny trzymają ten inwariant.
//
// DRUGI BŁĄD ZNALEZIONY W PĘTLI: picker odrzucenia (ten sam, którego używa
// koszt kwalifikowany) remisował dla kart NIEGRYWALNYCH — gałąź „bez koloru”
// miała clamp `min(10, wartość)`. Pomiar PRZED: 3/2 za 2 many (wartość 10)
// i 5/3 za 4 many (wartość 19) dostawały po 20 pkt → remis, wygrywała
// „pierwsza oferta z listy” (klasa L50 — dokładnie ten wzorzec, który
// właściciel zgłaszał przy M408: „odrzuca rewelacyjne kreatury”).
// Po (suwaki `discardUncastableClamp`/`discardUncastableScale`):
// 22,5 vs 20,25 preferencji → ginie tańszy/gorszy stwór.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGameState, addObject, playerView, execute,
} from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry, VIRTUAL_BASIC_LANDS } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REG = createCardRegistry();
const landDef = (id) => VIRTUAL_BASIC_LANDS.find((c) => c.id === id);

function land(state, id, landId = 'basic-swamp', controllerId = 'p1') {
  const def = landDef(landId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: def.id, controllerId, ownerId: controllerId,
    zone: 'battlefield', ...gameObjectDataOf(def),
    types: def.types, subtypes: def.subtypes, keywords: def.keywords ?? [],
  });
}

function real(state, id, cardId, { zone = 'battlefield', controllerId = 'p1' } = {}) {
  const def = REG.get(cardId);
  assert.ok(def, `karta ${cardId} jest w katalogu`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [],
  });
  const current = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...current, summoningSickness: false }));
}

function creature(state, id, controllerId, power, toughness) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `synthetic-${id}`, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['G'],
    cardName: id,
  });
}

function scene({ lands = ['basic-swamp'], step = 'main', active = 'p1' } = {}) {
  const state = createGameState({ seed: 81, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = 'p1';
  lands.forEach((landId, i) => land(state, `land${i}`, landId));
  for (const playerId of ['p1', 'p2']) {
    for (let i = 0; i < 25; i += 1) {
      addObject(state, {
        id: `lib-${playerId}-${i}`, instanceId: `i-lib-${playerId}-${i}`,
        cardId: 'library-blank', controllerId: playerId, ownerId: playerId,
        zone: 'library', kind: 'sorcery', power: 0, toughness: 0, manaCost: 2,
        abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: [],
        cardName: 'Library blank',
      });
    }
  }
  return state;
}

function scores(state) {
  const bot = createHeuristicBot({ seed: 82, randomness: 0, lookahead: 0, registry: REG });
  bot.chooseCommand(playerView(state, 'p1'));
  return new Map(bot.trace().at(-1).options.map((o) => [o.cmd, o.score]));
}

/** Tura przeciwnika, mój stwór blokuje jego atakującego. */
function blockScene(enemyPower, enemyToughness) {
  const state = scene({ step: 'declare_blockers', active: 'p2' });
  real(state, 'hounds', 'vampire-hounds');
  real(state, 'fodder', 'vampire-hounds', { zone: 'hand' });
  creature(state, 'attacker', 'p2', enemyPower, enemyToughness);
  state.combat = {
    attackingPlayerId: 'p2', defendingPlayerId: 'p1',
    attackers: ['attacker'], blockers: new Map([['attacker', ['hounds']]]),
  };
  addMana(state, 'p1', 4, { colors: ['B'] });
  return state;
}

test('A12: niekwalifikujący się czar w ręce nie zmienia ceny aktywacji Hounds', () => {
  const base = blockScene(3, 3);
  const extra = blockScene(3, 3);
  real(extra, 'blue', 'anticipate', { zone: 'hand' });
  const without = scores(base).get('activate_ability(hounds#0)');
  const withSpell = scores(extra).get('activate_ability(hounds#0)');
  assert.ok(Number.isFinite(without) && Number.isFinite(withSpell));
  assert.equal(withSpell, without, `koszt można zapłacić wyłącznie kartą stwora (${without} vs ${withSpell})`);
  const activation = playerView(extra, 'p1').legalCommands.find(c => c.type === 'activate_ability' && c.objectId === 'hounds');
  assert.ok(execute(extra, activation).ok);
  assert.ok([...extra.objects.values()].some(o => o.cardId === 'vampire-hounds' && o.zone === 'graveyard'));
  assert.equal(extra.objects.get('blue').zone, 'hand');
});

test('A12: tańszy do oddania kwalifikujący się stwór zmienia wycenę', () => {
  const base = blockScene(3, 3);
  const extra = blockScene(3, 3);
  real(extra, 'green', 'garruks-companion', { zone: 'hand' });
  const without = scores(base).get('activate_ability(hounds#0)');
  const withCreature = scores(extra).get('activate_ability(hounds#0)');
  assert.ok(withCreature > without, `kwalifikująca się karta zmienia koszt (${without} → ${withCreature})`);
  const activation = playerView(extra, 'p1').legalCommands.find(c => c.type === 'activate_ability' && c.objectId === 'hounds');
  assert.ok(execute(extra, activation).ok);
  const bot = createHeuristicBot({ seed: 82, randomness: 0, lookahead: 0, registry: REG });
  const chosen = bot.chooseCommand(playerView(extra, 'p1'));
  assert.equal(chosen.type, 'resolve_discard_choice');
  assert.equal(chosen.cardId, 'green');
  assert.ok(execute(extra, chosen).ok);
  assert.equal(extra.objects.get('fodder').zone, 'hand');
  assert.ok([...extra.objects.values()].some(o => o.cardId === 'garruks-companion' && o.zone === 'graveyard'));
});

test('A12: koszt dowolnej karty nadal może uwzględniać niegrywalny czar', () => {
  const base = blockScene(3, 3);
  const extra = blockScene(3, 3);
  for (const state of [base, extra]) {
    const hounds = state.objects.get('hounds');
    const abilities = hounds.abilities.map(a => ({ ...a, cost: { ...a.cost, discardCard: true } }));
    state.objects.set('hounds', Object.freeze({ ...hounds, abilities }));
  }
  real(extra, 'blue', 'anticipate', { zone: 'hand' });
  const without = scores(base).get('activate_ability(hounds#0)');
  const withSpell = scores(extra).get('activate_ability(hounds#0)');
  assert.ok(withSpell > without, `przy braku kwalifikatora czar jest kandydatem (${without} → ${withSpell})`);
});

test('A12: koszt dowolnej karty nie wycenia ukrytej ręki przeciwnika', () => {
  const base = blockScene(3, 3);
  const extra = blockScene(3, 3);
  for (const state of [base, extra]) {
    const hounds = state.objects.get('hounds');
    const abilities = hounds.abilities.map(a => ({ ...a, cost: { ...a.cost, discardCard: true } }));
    state.objects.set('hounds', Object.freeze({ ...hounds, abilities }));
  }
  real(extra, 'opponent-card', 'anticipate', { zone: 'hand', controllerId: 'p2' });
  const handEntry = playerView(extra, 'p1').zones.hand.find(card => card.id === 'opponent-card');
  assert.equal(handEntry.hidden, true);
  const without = scores(base).get('activate_ability(hounds#0)');
  const withOpponent = scores(extra).get('activate_ability(hounds#0)');
  assert.equal(withOpponent, without, `przeciwnik nie płaci kosztu (${without} vs ${withOpponent})`);
});
