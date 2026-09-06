import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

/**
 * M317 (zgłoszenie właściciela — Ghost Warden): bot atakuje 2/2 w moją 2/2,
 * licząc wymianę, ale ja tapnę Ghost Warden ({T}: stwór +1/+1 do końca tury)
 * i mój bloker robi się 3/3 — atakujący ginie bez zada żadnych obrażeń.
 * „Bot heurystyczny powinien wyceniać nie tylko możliwe pumpy/zdolności
 * kreatur blokujących, ale także inne zdolności na moim stole (za tapnięcie
 * albo za manę, o ile ją mam)".
 *
 * Naprawa: `enemyDefensivePumpBonus` — skan wrogiego (z perspektywy bota:
 * obrońcy) stołu pod kątem activated zdolności z pozytywnym pumpem na cel
 * „creature"; dostępność: tap → nietapnięte źródło, mana → pula + nietapnięte
 * landy wroga; zdetainowane źródła odpadają. Wycena ataku liczy staty blokerów
 * Z BONUSEM (najgorszy przypadek dla atakującego) w gałęziach
 * first strike / przeżyje-i-zabija / gang / przeżyje-nie-zabije / wymiana /
 * chump.
 */

const REGISTRY = createCardRegistry();

function vanilla(state, id, controllerId, power, toughness) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'x-test', controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 0,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['R'],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function land(state, id, controllerId, tapped = false) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'basic-mountain', controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'land', manaCost: 0,
    abilities: [], keywords: [], subtypes: ['Mountain'], types: ['Land'], colors: [],
    tapped,
  });
  return state.objects.get(id);
}

function warden(state, id, controllerId, { tapped = false } = {}) {
  const def = REGISTRY.get('ghost-warden');
  assert.ok(def, 'Ghost Warden w rejestrze');
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'ghost-warden', controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature',
    power: def.power, toughness: def.toughness, manaCost: def.manaCost,
    abilities: def.abilities ?? [], colors: def.colors ?? [],
    types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, tapped }));
  return state.objects.get(id);
}

/** Widok bota (p2 atakuje) w kroku deklaracji ataku. */
function attackView(setup) {
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  setup(state);
  const view = playerView(state, 'p2');
  const bot = createHeuristicBot({ seed: 9 });
  const choice = bot.chooseCommand(view, {});
  const attackers = choice.type === 'declare_attackers' ? (choice.attackerIds ?? []) : [];
  return { attackers, choice };
}

test('M317/B1: nietapnięty Ghost Warden obrońcy — bot NIE kupuje wymiany 2/2↔2/2', () => {
  const { attackers } = attackView((state) => {
    vanilla(state, 'atk', 'p2', 2, 2);
    vanilla(state, 'blk', 'p1', 2, 2);
    warden(state, 'gw', 'p1'); // nietapnięty — pump dostępny
  });
  assert.ok(!attackers.includes('atk'),
    `bot zaatakował w wymianę, którą obrońca wygrywa pumpe z Wardena: ${JSON.stringify(attackers)}`);
});

test('M317/B2 (anty-over-fix): bez Wardena 2/2↔2/2 to legalna wymiana — bot atakuje', () => {
  const { attackers } = attackView((state) => {
    vanilla(state, 'atk', 'p2', 2, 2);
    vanilla(state, 'blk', 'p1', 2, 2);
  });
  assert.ok(attackers.includes('atk'), `bez triku wymiana jest poprawna: ${JSON.stringify(attackers)}`);
});

test('M317/B3: TAPNIĘTY Warden — pump niedostępny, bot atakuje', () => {
  const { attackers } = attackView((state) => {
    vanilla(state, 'atk', 'p2', 2, 2);
    vanilla(state, 'blk', 'p1', 2, 2);
    warden(state, 'gw', 'p1', { tapped: true });
  });
  assert.ok(attackers.includes('atk'), `tapnięte źródło nie pompuje: ${JSON.stringify(attackers)}`);
});

test('M317/B4: silny atakujący nie odpuści przez +1/+1 (5/5 w 2/2 z Wardенem nadal atakuje)', () => {
  const { attackers } = attackView((state) => {
    vanilla(state, 'atk', 'p2', 5, 5);
    vanilla(state, 'blk', 'p1', 2, 2);
    warden(state, 'gw', 'p1');
  });
  assert.ok(attackers.includes('atk'), `5/5 przeżywa także 3/3: ${JSON.stringify(attackers)}`);
});

test('M317/B5: zdolność za MANĘ (2: +2/+2) — bez many obrońcy bot atakuje, z maną nie', () => {
  const pumped = (state) => {
    const o = vanilla(state, 'src', 'p1', 1, 1);
    // zdolność-prototype (bez nazwy karty — ADR 0002): {2}: stwór +2/+2 do EOT
    state.objects.set('src', Object.freeze({
      ...o,
      abilities: [{
        type: 'activated',
        cost: { mana: 2 },
        targets: [{ type: 'creature' }],
        effect: { type: 'buff_creature_until_end_of_turn', power: 2, toughness: 2 },
      }],
    }));
    land(state, 'l1', 'p1');
  };
  const bezMany = attackView((state) => {
    pumped(state);
    vanilla(state, 'atk', 'p2', 2, 2);
    vanilla(state, 'blk', 'p1', 2, 2);
  });
  assert.ok(bezMany.attackers.includes('atk'),
    `obrońca nie ma 2 many — trick nie do sfinansowania: ${JSON.stringify(bezMany.attackers)}`);

  const zManą = attackView((state) => {
    pumped(state);
    vanilla(state, 'atk', 'p2', 2, 2);
    vanilla(state, 'blk', 'p1', 2, 2);
    addMana(state, 'p1', 2, { colors: ['R'] });
  });
  assert.ok(!zManą.attackers.includes('atk'),
    `obrońca ma manę na +2/+2 — wymiana pułapką: ${JSON.stringify(zManą.attackers)}`);
});

test('M317/B6: viele atakujących — trick karze tylko tych, których dotyczy (4/4 i 2/2 vs 2/2+Warden)', () => {
  const { attackers } = attackView((state) => {
    vanilla(state, 'big', 'p2', 4, 4);
    vanilla(state, 'small', 'p2', 2, 2);
    vanilla(state, 'blk', 'p1', 2, 2);
    warden(state, 'gw', 'p1');
  });
  assert.ok(attackers.includes('big'), `4/4 przeżywa nawet 3/3: ${JSON.stringify(attackers)}`);
  assert.ok(!attackers.includes('small'), `2/2 ginie po pumpecie: ${JSON.stringify(attackers)}`);
});
