// PMSSB-21 (mikro-pętla) krok-1: sonda decyzji `resolve_opponent_target`
// (Cuombajj Witches — DRUGI cel obrażeń wskazuje przeciwnik; CR 601.2c).
// Pomiar PRZED/PO: tabela ofert bota w roli PRZECIWNIKA (wybierającego cel).
//
// Scenariusze (p1 = aktywujący Cuombajj; p2 = bot-wybierający):
//   A) dwie ocalałe istoty p1: 4/4 (duże zagrożenie) i 1/3 (małe),
//   B) jedna z 1/1 (ping ZABIJA) + jedna ocalała 3/3,
//   C) własna istota p2 w zasięgu (kara kierunku),
//   D) tylko gracze (bez istot).
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { execute } from '../src/engine/game-state.js';

const REG = createCardRegistry();

function put(state, id, controllerId, power, toughness, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
    ...extra,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function setup({ foes = [], mine = [] } = {}) {
  const s = createGameState({ seed: 21, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = 'p1';
  s.turn.priorityPlayerId = 'p1';
  for (let i = 0; i < 20; i++) {
    for (const pid of ['p1', 'p2']) {
      addObject(s, {
        id: `lib-${pid}-${i}`, instanceId: `i-lib-${pid}-${i}`, cardId: 'basic-forest',
        controllerId: pid, ownerId: pid, zone: 'library', kind: 'land', power: 0, toughness: 0,
        manaCost: 0, abilities: [], keywords: [], subtypes: ['Forest'], types: ['Basic', 'Land'], colors: [],
      });
    }
  }
  const d = REG.get('cuombajj-witches');
  addObject(s, {
    id: 'witch', instanceId: 'i-witch', cardId: 'cuombajj-witches', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...gameObjectDataOf(d),
  });
  s.objects.set('witch', Object.freeze({ ...s.objects.get('witch'), summoningSickness: false }));
  for (const f of foes) put(s, f.id, 'p1', f.power, f.toughness, f.extra ?? {});
  for (const m of mine) put(s, m.id, 'p2', m.power, m.toughness, m.extra ?? {});
  return s;
}

function probe(name, cfg, firstTarget = 'p2') {
  const s = setup(cfg);
  const res = execute(s, {
    type: 'activate_ability', playerId: 'p1', objectId: 'witch', abilityIndex: 0, targets: [firstTarget],
  });
  if (!res || res.ok === false) {
    console.log(`${name}: AKTYWACJA ODRZUCONA (${JSON.stringify(res)})`);
    return;
  }
  const pending = s.pendingOpponentTarget;
  const view = playerView(s, 'p2');
  const bot = createHeuristicBot({ seed: 9 });
  const choice = bot.chooseCommand(view, {});
  const opts = (bot.trace().at(-1)?.options ?? [])
    .filter((o) => o.cmd.startsWith('resolve_opponent_target'))
    .sort((a, b) => b.score - a.score);
  console.log(`--- ${name} (pending dla ${pending?.playerId}) ---`);
  for (const o of opts) console.log(`   ${o.score.toFixed(2).padStart(8)}  ${o.cmd}`);
  console.log(`   WYBÓR: ${choice?.command?.type ?? choice?.type ?? '?'} ` +
    `${JSON.stringify(choice?.command?.targetId ?? choice?.targetId ?? choice ?? null)}`);
}

console.log('=== PMSSB-21 sonda PRE/PO (resolve_opponent_target) ===');
probe('A: 4/4 (duże) + 1/3 (małe), oba ocalają', {
  foes: [{ id: 'big', power: 4, toughness: 4 }, { id: 'small', power: 1, toughness: 3 }],
});
probe('B: 1/1 (ping zabija) + 3/3 (ocala)', {
  foes: [{ id: 'fragile', power: 1, toughness: 1 }, { id: 'tank', power: 3, toughness: 3 }],
});
probe('C: własny stwór p2 2/2 w zasięgu', {
  foes: [{ id: 'big', power: 4, toughness: 4 }], mine: [{ id: 'own', power: 2, toughness: 2 }],
});
probe('D: tylko gracze', {});
