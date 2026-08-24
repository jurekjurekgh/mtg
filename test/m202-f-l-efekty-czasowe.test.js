// M202/F + M202/L — zgłoszenia właściciela (efekty czasowe w złym oknie):
//
//   F. „Karta Twiddle — Bot rzuca tą kartę z opcją Tap i tapuje moją kartę
//       w swojej turze mimo, że nie mam many, żeby wykorzystać tą kartę.
//       W ogóle to jest czar typu combat trick, który powinien być rzucany nie
//       w turze bota, bo wtedy ma niską efektywność, tylko w turze gracza
//       (przeciwnika bota) w fazie upkeep. Wtedy tapnięcie mojej kreatury albo
//       lądu ma sens bo będzie trwało 2 pełne tury (do następnego untap
//       gracza).”
//   L. „Karta Wishful Merfolk. Bot aktywuje zdolność tej karty (utrata defender
//       do końca tury) w fazie gracza. Bez sensu bo ona ma sens tylko w turze
//       Bota w fazie przed walką i tylko wtedy gdy merfolk jest nietapnięty, bo
//       wtedy umożliwia atakowanie. W fazie gracza korzystanie z tej zdolności
//       to czyste marnowanie many.”
//
// Wspólna przyczyna (klasa L42: efekt „do końca tury” wycenia się razem
// z ZEGARKIEM, nie tylko z celem):
//   F — tapnięcie LANDU dostawało bazę +8 jak zdjęcie stworu z gry, choć land
//       nie atakuje i nie blokuje, a jego tapnięcie odbiera tylko manę do
//       najbliższego untapu. Premia wybijała karę za złe okno (L3), więc bot
//       tapował ląd w swojej turze.
//   L — zdolność „traci defender do końca tury” nie była wyceniana wcale, więc
//       aktywacja w turze przeciwnika (efekt wyparuje w cleanup, zanim stwór
//       zdąży zaatakować) remisowała z każdą inną i bot brał pierwszą ofertę.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

/** STEPS: 1=upkeep, 3=main (precombat), 9=main (postcombat). */
function stateAt(stepIndex, { activePlayerId = 'p1' } = {}) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn(activePlayerId), ...TURN_STEPS[stepIndex], stepIndex, number: 4, activePlayerId, priorityPlayerId: 'p1', passes: 0 };
  return state;
}

function put(state, id, cardId, controllerId, patch = {}, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

const pick = (state) => createHeuristicBot({ seed: 13 }).chooseCommand(playerView(state, 'p1'), { simulate: null });

// --- F: Twiddle na LAND przeciwnika -----------------------------------------

test('M202/F: Twiddle NIE tapuje landu przeciwnika w mojej turze po walce', () => {
  const state = stateAt(9); // main po walce — efekt wyparuje przy jego untapie
  put(state, 'tw', 'twiddle', 'p1', {}, 'hand');
  put(state, 'land', 'basic-forest', 'p2', { tapped: false });
  addMana(state, 'p1', 4, { colors: ['U', 'U', 'U', 'U'] });
  const cmd = pick(state);
  const tapsLand = cmd?.type === 'cast_spell' && cmd.objectId === 'tw'
    && (cmd.targets ?? []).includes('land');
  assert.ok(!tapsLand, `bot wybrał ${JSON.stringify(cmd)} — tapnięcie landu w tej turze nic nie daje`);
});

test('M202/F (anty-over-fix): Twiddle tapuje land przeciwnika w JEGO upkeep', () => {
  const state = stateAt(1, { activePlayerId: 'p2' }); // upkeep przeciwnika
  put(state, 'tw', 'twiddle', 'p1', {}, 'hand');
  put(state, 'land', 'basic-forest', 'p2', { tapped: false });
  addMana(state, 'p1', 4, { colors: ['U', 'U', 'U', 'U'] });
  const cmd = pick(state);
  assert.equal(cmd?.type, 'cast_spell', `bot wybrał ${JSON.stringify(cmd)}`);
  assert.equal(cmd.objectId, 'tw');
  assert.ok((cmd.targets ?? []).includes('land'), 'w upkeep przeciwnika tapnięcie trwa do jego następnego untapu');
});

// --- L: Wishful Merfolk ------------------------------------------------------

test('M202/L: Wishful Merfolk NIE aktywuje „traci defender” w turze przeciwnika', () => {
  const state = stateAt(3, { activePlayerId: 'p2' }); // tura przeciwnika
  put(state, 'mer', 'wishful-merfolk', 'p1', { summoningSickness: false, tapped: false });
  put(state, 'isle', 'basic-island', 'p1');
  put(state, 'isle2', 'basic-island', 'p1');
  const cmd = pick(state);
  const activated = cmd?.type === 'activate_ability' && cmd.objectId === 'mer';
  assert.ok(!activated, `bot wybrał ${JSON.stringify(cmd)} — efekt wyparuje w cleanup, zanim stwór zaatakuje`);
});

test('M202/L (anty-over-fix): Wishful Merfolk aktywuje w swojej fazie main przed walką', () => {
  const state = stateAt(3); // własna faza main przed walką
  put(state, 'mer', 'wishful-merfolk', 'p1', { summoningSickness: false, tapped: false });
  put(state, 'isle', 'basic-island', 'p1');
  put(state, 'isle2', 'basic-island', 'p1');
  const cmd = pick(state);
  assert.equal(cmd?.type, 'activate_ability', `bot wybrał ${JSON.stringify(cmd)}`);
  assert.equal(cmd.objectId, 'mer', 'zdolność umożliwia atak w tej turze');
});

test('M202/L (anty-over-fix): tapnięty Merfolk nie marnuje many na „traci defender”', () => {
  const state = stateAt(3);
  put(state, 'mer', 'wishful-merfolk', 'p1', { summoningSickness: false, tapped: true });
  put(state, 'isle', 'basic-island', 'p1');
  put(state, 'isle2', 'basic-island', 'p1');
  const cmd = pick(state);
  const activated = cmd?.type === 'activate_ability' && cmd.objectId === 'mer';
  assert.ok(!activated, `bot wybrał ${JSON.stringify(cmd)} — tapnięty stwór i tak nie zaatakuje`);
});
