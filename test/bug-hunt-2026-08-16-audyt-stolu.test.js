// M106 — audyt „z perspektywy gracza" Żywym Testerem (zlecenie właściciela
// 2026-08-16). Testy regresyjne dla DZIESIĘCIU znalezisk z siedmiu partii na
// prawdziwym artefakcie. Metoda i transkrypty:
// docs/plans/2026-08-16-m106-audyt-stolu.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { beginTurn } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { describeGameEvent } from '../src/table/session.js';

const REGISTRY = createCardRegistry();

function newState({ step = 'main', activePlayerId = 'p1', turnNumber = 5 } = {}) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, activePlayerId);
  state.turn.activePlayerId = activePlayerId;
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = turnNumber;
  return state;
}

function putCard(state, id, cardId, controllerId = 'p1', zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], cardName: def.name,
    equipment: def.equipment, aura: def.aura, bestow: def.bestow, morph: def.morph,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function addCreature(state, id, controllerId, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'x-test', controllerId, zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], ...extra,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

const resolveStack = (state) => {
  for (let i = 0; i < 12 && state.zones.stack.length > 0; i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
};

const HELPERS = {
  nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
  nameOfObject: (id) => id,
  cardIdOf: () => null,
};

// =============================================================================
// Z1 — masowy buff „do końca tury" MUSI być widoczny (oś 2 audytu)
// =============================================================================

test('Z1: Hysterical Blindness (−4/−0 stworom przeciwnika) emituje opisywalne zdarzenie', () => {
  const state = newState();
  putCard(state, 'hb', 'hysterical-blindness', 'p1', 'hand');
  addCreature(state, 'foe1', 'p2');
  addCreature(state, 'foe2', 'p2');
  addMana(state, 'p1', 3, { colors: ['U'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.objectId === 'hb');
  assert.ok(cast, 'czar jest w ofercie');
  execute(state, cast);
  resolveStack(state);
  const mass = state.events.filter((e) => e.type === 'mass_stats_modified');
  assert.equal(mass.length, 1, 'masowy buff zgłasza się jednym zdarzeniem');
  assert.equal(mass[0].scope, 'opponents');
  assert.equal(mass[0].objectIds.length, 2, 'zbiór ustalony przy rozstrzygnięciu (CR 611.2c)');
  const text = describeGameEvent(mass[0], HELPERS);
  assert.match(text, /stwory przeciwnika/, `opis dla gracza: ${text}`);
  assert.match(text, /-4\/-0/, `konwencja MtG „-4/-0": ${text}`);
});

test('Z1: buff własnych stworów też jest opisany (Angel of the Dawn)', () => {
  const state = newState();
  addCreature(state, 'mine', 'p1');
  const event = {
    type: 'mass_stats_modified', scope: 'yours', objectIds: ['mine'],
    powerModifier: 1, toughnessModifier: 1, keywords: ['vigilance'],
  };
  const text = describeGameEvent(event, HELPERS);
  assert.match(text, /twoje stwory/);
  assert.match(text, /\+1\/\+1/);
  assert.match(text, /czujno/i, `keyword w opisie: ${text}`);
});

test('Z1: pusty zbiór (nie ma na kogo działać) nie zaśmieca logu', () => {
  const text = describeGameEvent({
    type: 'mass_stats_modified', scope: 'opponents', objectIds: [],
    powerModifier: -4, toughnessModifier: 0, keywords: [],
  }, HELPERS);
  assert.equal(text, null);
});

// =============================================================================
// Z4 — turn_started PRZED odkręceniem (CR 500.1/502.1)
// =============================================================================

test('Z4: zdarzenia kroku odkręcania należą do NOWEJ tury, nie do poprzedniej', () => {
  const state = newState({ turnNumber: 4 });
  addCreature(state, 'tapped-one', 'p1');
  state.objects.set('tapped-one', Object.freeze({ ...state.objects.get('tapped-one'), tapped: true }));
  const before = state.events.length;
  beginTurn(state, 'p1');
  const types = state.events.slice(before).map((e) => e.type);
  const startIndex = types.indexOf('turn_started');
  const untapIndex = types.indexOf('object_untapped');
  assert.ok(startIndex >= 0 && untapIndex >= 0, `oba zdarzenia są: ${types.join(',')}`);
  assert.ok(startIndex < untapIndex,
    'CR 500.1/502.1: tura zaczyna się krokiem odkręcania — nagłówek tury musi być PIERWSZY');
});

test('Z4: turn_started nadal niesie listę odkręconych obiektów', () => {
  const state = newState({ turnNumber: 4 });
  addCreature(state, 'tapped-one', 'p1');
  state.objects.set('tapped-one', Object.freeze({ ...state.objects.get('tapped-one'), tapped: true }));
  const before = state.events.length;
  beginTurn(state, 'p1');
  const started = state.events.slice(before).find((e) => e.type === 'turn_started');
  assert.deepEqual(started.untapped, ['tapped-one']);
});

// =============================================================================
// Z8 — widok stosu niesie cele zdolności aktywowanych (ADR 0017)
// =============================================================================

test('Z8: cele zdolności na stosie są widoczne w PlayerView (informacja publiczna)', () => {
  const state = newState();
  putCard(state, 'bark', 'barkform-harvester');
  putCard(state, 'gy', 'hunters-blowgun', 'p1', 'graveyard');
  addMana(state, 'p1', 4);
  const act = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'bark');
  assert.ok(act, 'zdolność jest oferowana');
  execute(state, act);
  const stack = playerView(state, 'p1').zones.stack;
  assert.equal(stack.length, 1, 'zdolność czeka na stosie');
  assert.deepEqual(stack[0].targets, ['gy'],
    'bez celów w widoku bot nie wie, że już celuje w ten obiekt (M106/Z8)');
});

// =============================================================================
// Z5 — grupa equipu nazywa się „Wyposaż", nie „Cel zdolności"
// =============================================================================

test('Z5: tytuł grupy wariantów equipu mówi „Wyposaż"', async () => {
  const { choiceGroupTitle } = await import('../src/table/render.js');
  const state = newState();
  putCard(state, 'blowgun', 'hunters-blowgun');
  addCreature(state, 'c1', 'p1');
  addCreature(state, 'c2', 'p1');
  addMana(state, 'p1', 4);
  const view = playerView(state, 'p1');
  const equips = view.legalCommands.filter((c) => c.type === 'activate_ability' && c.objectId === 'blowgun');
  assert.ok(equips.length >= 2, `dwa warianty equipu: ${equips.length}`);
  const session = { state, nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId };
  const title = choiceGroupTitle({ type: 'target', options: equips }, session, view);
  assert.match(title, /Wyposaż: Hunter's Blowgun/, `tytuł grupy: ${title}`);
});

// =============================================================================
// Z2 (decyzja właściciela 2026-08-16) — trigger bez skutku MÓWI o tym graczowi,
// a bot nie używa czarów/zdolności, których treść jest pusta JUŻ przy rzucie
// (późniejszy fizzle celu to normalne ryzyko gry — CR 608.2b, bez kary).
// =============================================================================

test('Z2: trigger bez legalnych celów zgłasza „brak legalnych celów"', () => {
  // Puppeteer Clique: ETB „put target creature card from an opponent's
  // graveyard onto the battlefield" — pusty grób przeciwnika = trigger nie
  // odpala. Dotąd na stole nie było po nim ŻADNEGO śladu.
  const state = newState();
  putCard(state, 'clique', 'puppeteer-clique', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['B', 'B'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.objectId === 'clique');
  assert.ok(cast, 'rzut stwora jest legalny');
  execute(state, cast);
  resolveStack(state);
  const skipped = state.events.find((e) => e.type === 'trigger_resolved' && e.noEffect);
  assert.ok(skipped, 'trigger bez celów zostawia ślad w zdarzeniach');
  assert.equal(skipped.reason, 'no_targets');
  const text = describeGameEvent(skipped, HELPERS);
  assert.match(text, /brak legalnych celów/, `komunikat dla gracza: ${text}`);
});

test('Z2: trigger o zerowym wyniku (0 tokenów) też to komunikuje', () => {
  // Undead Servant: „create X 2/2 Zombie tokens, where X is the number of
  // cards named Undead Servant in your graveyard" — pusty grób = 0 tokenów.
  const state = newState();
  putCard(state, 'servant', 'undead-servant', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['B'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.objectId === 'servant');
  assert.ok(cast);
  execute(state, cast);
  resolveStack(state);
  const resolved = state.events.filter((e) => e.type === 'trigger_resolved');
  assert.ok(resolved.length > 0, 'trigger wejścia się rozstrzygnął');
  const zero = resolved.find((e) => e.noEffect && e.reason === 'no_result');
  assert.ok(zero, 'zerowy wynik jest oznaczony');
  assert.match(describeGameEvent(zero, HELPERS), /nic się nie wydarzyło/);
});

test('Z2b: bot NIE rzuca czaru, którego cała treść jest teraz pusta', async () => {
  const { createHeuristicBot } = await import('../src/controllers/heuristic-bot.js');
  const state = newState();
  putCard(state, 'flurry', 'flurry-of-wings', 'p2', 'hand'); // „X = liczba atakujących"
  addMana(state, 'p2', 3, { colors: ['G', 'W', 'U'] });
  state.turn = jumpToStep(state.turn, 'upkeep', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  const bot = createHeuristicBot({ seed: 1 });
  const view = playerView(state, 'p2');
  const cast = view.legalCommands.find((c) => c.objectId === 'flurry');
  assert.ok(cast, 'czar jest legalny (bot MOŻE go rzucić — po prostu nie powinien)');
  const chosen = bot.chooseCommand(view);
  assert.notEqual(chosen?.objectId, 'flurry',
    'poza walką Flurry of Wings tworzy 0 tokenów — bot ma wybrać cokolwiek innego');
});

test('Z2b: przy zadeklarowanych atakujących czar NIE jest już jałowy', async () => {
  // Odwrotna strona bramki: liczba atakujących jest liczona z widoku
  // (kafle niosą `attacking`), więc w walce Flurry of Wings tworzy realne
  // tokeny i bot ma prawo go rzucić. Późniejszy fizzle/zmiana stanu to
  // normalne ryzyko gry (CR 608.2b) i nie jest karana.
  const { createHeuristicBot } = await import('../src/controllers/heuristic-bot.js');
  const state = newState({ step: 'declare_attackers', activePlayerId: 'p2' });
  state.turn.priorityPlayerId = 'p2';
  putCard(state, 'flurry', 'flurry-of-wings', 'p2', 'hand');
  addCreature(state, 'atk', 'p2');
  addMana(state, 'p2', 3, { colors: ['G', 'W', 'U'] });
  execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['atk'] });
  // Po deklaracji priorytet ma obrońca; oddajemy go atakującemu, żeby ocenić
  // JEGO decyzję w oknie z zadeklarowanym atakiem.
  state.turn.priorityPlayerId = 'p2';
  const view = playerView(state, 'p2');
  assert.equal(view.zones.battlefield.filter((o) => o.attacking).length, 1,
    'widok niesie znacznik atakowania (bez tego bot jest ślepy — L1)');
  const cast = view.legalCommands.find((c) => c.objectId === 'flurry');
  assert.ok(cast, 'czar jest w ofercie w oknie walki');
  const bot = createHeuristicBot({ seed: 1 });
  const chosen = bot.chooseCommand(view);
  assert.equal(chosen?.objectId, 'flurry',
    `z atakującym na stole czar tworzy token — bot ma go rzucić, wybrał: ${JSON.stringify(chosen)}`);
});
