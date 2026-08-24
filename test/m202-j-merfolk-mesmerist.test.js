// M202/J — zgłoszenie właściciela:
//
//   „Karta Merfolk Mesmerist. Bot co kolejkę wyrzuca mi 2 karty do grobu. Robi
//    to mimo to, że ten mesmerist to jego jedyna kreatura i jak ją tapuje to
//    nie może mnie blokować. Mam jeszcze 30 kart więc bot prędzej zginie niż
//    opróżni mi bibliotekę, szczególnie, że sam ma tylko 18 kart. To działanie
//    bota jest bez sensu. Powinien korzystać z tej zdolności tylko wtedy gdy:
//    a. ma kim blokować moje kreatury; b. gracz ma mało kart, mniej niż on.”
//
// Przyczyna: mill przeciwnika miał stałą wartość +20+3·amount i żadnej z dwóch
// bramek. Zdolność TAPUJE źródło, więc mill kosztem jedynego blokera jest
// stratą obrony, a przy 18 kartach vs 30 wyścig bibliotek jest przegrany
// z góry — mill nie przybliża bota do wygranej.
//
// Oba warunki są policzalne z PlayerView: liczba kart w bibliotece jest
// informacją jawną (CR 402.1), więc FoW nie jest naruszone (ADR 0003).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function setup({ extraBlocker = false, myLibrary = 18, foeLibrary = 30, foeAttacker = true }) {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn('p1'), ...TURN_STEPS[3], stepIndex: 3, number: 4, activePlayerId: 'p1', priorityPlayerId: 'p1', passes: 0 };
  const put = (id, cardId, controllerId, zone = 'battlefield', patch = {}) => {
    const def = REGISTRY.get(cardId);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
      ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
      subtypes: def.subtypes ?? [], spell: def.spell,
    });
    if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  };
  put('mes', 'merfolk-mesmerist', 'p1', 'battlefield', { summoningSickness: false, tapped: false });
  if (extraBlocker) put('blk', 'hill-giant', 'p1', 'battlefield', { summoningSickness: false });
  if (foeAttacker) put('foe', 'goblin-piker', 'p2', 'battlefield', { summoningSickness: false });
  put('isle', 'basic-island', 'p1');
  const filler = (pid, prefix, count) => {
    for (let i = 0; i < count; i += 1) {
      addObject(state, {
        id: `${prefix}${i}`, instanceId: `i-${prefix}${i}`, cardId: 'filler', controllerId: pid,
        ownerId: pid, zone: 'library', kind: 'card', types: [], subtypes: [], colors: [], manaCost: 0, abilities: [],
      });
    }
  };
  filler('p1', 'lib1-', myLibrary);
  filler('p2', 'lib2-', foeLibrary);
  addMana(state, 'p1', 3, { colors: ['U', 'U', 'U'] });
  return state;
}

const mills = (state) => {
  const cmd = createHeuristicBot({ seed: 19 }).chooseCommand(playerView(state, 'p1'), { simulate: null });
  return cmd?.type === 'activate_ability' && cmd.objectId === 'mes';
};

test('M202/J: Mesmerist NIE milluje, gdy jest jedynym blokerem (a wróg ma więcej kart)', () => {
  const state = setup({ extraBlocker: false, myLibrary: 18, foeLibrary: 30 });
  assert.ok(!mills(state), 'mill kosztem jedynego blokera przy 18 vs 30 kart to czysta strata');
});

test('M202/J (anty-over-fix): milluje, gdy ma innego blokera I mniejszą bibliotekę niż wróg', () => {
  const state = setup({ extraBlocker: true, myLibrary: 12, foeLibrary: 5 });
  assert.ok(mills(state), 'jest kim blokować, a przeciwnik ma 5 kart — mill realnie przybliża deck-out');
});

test('M202/J: nie milluje, gdy przeciwnik ma więcej kart, nawet z zapasowym blokerem', () => {
  const state = setup({ extraBlocker: true, myLibrary: 18, foeLibrary: 30 });
  assert.ok(!mills(state), 'wyścig bibliotek przegrany z góry — mill nie przybliża wygranej');
});

test('M202/J: nie milluje jedynym blokerem, nawet przy małej bibliotece wroga', () => {
  const state = setup({ extraBlocker: false, myLibrary: 30, foeLibrary: 5 });
  assert.ok(!mills(state), 'utrata jedynego blokera kosztuje więcej niż 5 kart u wroga');
});
