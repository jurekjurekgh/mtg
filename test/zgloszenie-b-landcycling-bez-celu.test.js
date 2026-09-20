// Zgłoszenie B (2026-09-20, uwagi z gry): „Karta Seismic Monstrosaur. Bot
// aktywuje zdolność Mountaincycling nie mając w talii Mountains. To
// bezsensowne zmarnowanie many i karty z ręki. To powinno być w scoringu
// piętnowane. Przecież grający zna swoją talię i wie, że jeśli ma określoną
// ilość basic lands na stole to więcej w talii nie ma. Dotyczy wszystkich
// land-cyclingów."
//
// Reguła: bot zna WŁASNĄ talię (`ownDeck` — gracz zna swój decklist, więc to
// nie jest naruszenie Fog of War) i liczy DOLNĄ granicę kart, które mogą
// jeszcze leżeć w bibliotece: kopie zadeklarowane w talii minus kopie widoczne
// poza biblioteką. Przy zerze typecycling/basic landcycling to zmarnowana
// mana i karta (CR 701.19b „fail to find" jest legalne, ale bezsensowne), więc
// wycena spada PONIŻEJ passu (L3: kara musi przebić premię +2 z gałęzi
// cyklowania).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const registry = createCardRegistry();

function game() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function put(state, id, cardId, playerId, zone) {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    manaCost: def.manaCost, types: def.types, subtypes: def.subtypes,
    keywords: def.keywords, spell: def.spell, abilities: def.abilities,
  });
  return state.objects.get(id);
}

/** Seismic Monstrosaur na ręce + dwie Góry na stole + wróg; biblioteka jak w `libraryCards`. */
function monstrosaurScene({ libraryCards, deck }) {
  const state = game();
  libraryCards.forEach((cardId, index) => put(state, `lib-${index}`, cardId, 'p1', 'library'));
  for (let i = 0; i < 4; i++) put(state, `libb-${i}`, 'basic-island', 'p2', 'library');
  put(state, 'monst', 'seismic-monstrosaur', 'p1', 'hand');
  put(state, 'mt1', 'basic-mountain', 'p1', 'battlefield');
  put(state, 'mt2', 'basic-mountain', 'p1', 'battlefield');
  put(state, 'foe', 'lightwalker', 'p2', 'battlefield');
  addMana(state, 'p1', 2, { colors: ['R', 'R'] });
  return { state, bot: createHeuristicBot({ seed: 7, ownDeck: deck }) };
}

const MOUNTAINLESS_DECK = [
  'basic-island', 'basic-island', 'basic-island', 'basic-island', 'basic-island', 'basic-island',
  'seismic-monstrosaur', 'lightwalker', 'lightwalker', 'basic-mountain', 'basic-mountain',
];

const cyclingCommand = (view) => view.legalCommands
  .find((cmd) => cmd.type === 'activate_ability' && cmd.objectId === 'monst');

test('B: brak celu w bibliotece (0 Gór) — bot NIE aktywuje Mountaincyclingu', () => {
  const { state, bot } = monstrosaurScene({
    libraryCards: ['basic-island', 'basic-island', 'basic-island', 'basic-island', 'basic-island', 'basic-island'],
    deck: MOUNTAINLESS_DECK,
  });
  const view = playerView(state, 'p1');
  assert.ok(cyclingCommand(view), 'oferta cyklowania istnieje (oferta = legalność)');
  const chosen = bot.chooseCommand(view, {});
  assert.notEqual(chosen?.type, 'activate_ability',
    `bot nie marnuje karty na szukanie bez celu (wybrał ${JSON.stringify(chosen)})`);
});

test('B: pozytywna kontrola — Góra ZOSTAŁA w bibliotece, bot cykluje po nią', () => {
  const { state, bot } = monstrosaurScene({
    libraryCards: ['basic-island', 'basic-island', 'basic-island', 'basic-island', 'basic-island', 'basic-mountain'],
    deck: [...MOUNTAINLESS_DECK, 'basic-mountain'],
  });
  const view = playerView(state, 'p1');
  const chosen = bot.chooseCommand(view, {});
  assert.equal(chosen?.type, 'activate_ability', `bot cykluje, gdy cel realnie istnieje: ${JSON.stringify(chosen)}`);
  assert.equal(chosen?.objectId, 'monst', 'cykluje Monstrosaura');
});

test('B: basic landcycling (Fiery Fall) bez landów w bibliotece — brak aktywacji', () => {
  const state = game();
  for (let i = 0; i < 4; i++) put(state, `lib-${i}`, 'lightwalker', 'p1', 'library');
  put(state, 'fall', 'fiery-fall', 'p1', 'hand');
  // Wszystkie podstawowe landy talii są JUŻ na stole — w bibliotece zostały
  // tylko czary, więc basic landcycling nie ma czego znaleźć.
  put(state, 'isle1', 'basic-island', 'p1', 'battlefield');
  put(state, 'isle2', 'basic-island', 'p1', 'battlefield');
  put(state, 'mt1', 'basic-mountain', 'p1', 'battlefield');
  put(state, 'mt2', 'basic-mountain', 'p1', 'battlefield');
  put(state, 'foe', 'lightwalker', 'p2', 'battlefield');
  addMana(state, 'p1', 2, { colors: ['R', 'R'] });
  const cyclingIndex = registry.get('fiery-fall').abilities
    .findIndex((ability) => ability.cycling?.allTypes?.length);
  assert.ok(cyclingIndex >= 0, 'Fiery Fall ma zdolność basic landcyclingu (deskryptor allTypes)');
  const bot = createHeuristicBot({
    seed: 7,
    ownDeck: ['lightwalker', 'lightwalker', 'lightwalker', 'lightwalker', 'fiery-fall',
      'basic-island', 'basic-island', 'basic-mountain', 'basic-mountain'],
  });
  const view = playerView(state, 'p1');
  const offered = view.legalCommands.some((cmd) => cmd.type === 'activate_ability'
    && cmd.objectId === 'fall' && cmd.abilityIndex === cyclingIndex);
  assert.ok(offered, 'oferta basic landcyclingu istnieje (oferta = legalność)');
  const chosen = bot.chooseCommand(view, {});
  const cycled = chosen?.type === 'activate_ability' && chosen?.objectId === 'fall'
    && chosen?.abilityIndex === cyclingIndex;
  assert.equal(cycled, false,
    `bot nie szuka landu, którego w bibliotece nie ma (wybrał ${JSON.stringify(chosen)})`);
});

test('B: brak wiedzy o własnej talii = zachowanie sprzed zgłoszenia (kompatybilność)', () => {
  const state = game();
  for (let i = 0; i < 6; i++) put(state, `lib-${i}`, 'basic-island', 'p1', 'library');
  put(state, 'monst', 'seismic-monstrosaur', 'p1', 'hand');
  put(state, 'mt1', 'basic-mountain', 'p1', 'battlefield');
  put(state, 'mt2', 'basic-mountain', 'p1', 'battlefield');
  put(state, 'foe', 'lightwalker', 'p2', 'battlefield');
  addMana(state, 'p1', 2, { colors: ['R', 'R'] });
  const bot = createHeuristicBot({ seed: 7 }); // bez ownDeck
  const chosen = bot.chooseCommand(playerView(state, 'p1'), {});
  assert.equal(chosen?.type, 'activate_ability',
    'bez znajomości talii bot zachowuje się jak dotąd (testy jednostkowe bez kontekstu)');
});
