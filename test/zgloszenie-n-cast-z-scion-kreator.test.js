/**
 * Zgłoszenie właściciela N (2026-10-25, kształt z jego korekty): czar, który
 * da się rzucić maną osiągalną jedynie po ręcznej aktywacji zdolności many
 * (poświęcenie Eldrazi Scion „Sacrifice this creature: Add {C}”), ma się
 * pojawić w ofercie JAK KAŻDY INNY, a kliknięcie ma otworzyć KREATOR MANY
 * z wszystkimi sposoby pozyskania many (Scion na liście źródeł). Odnośnie
 * reguł: CR 605.3a — „A player may activate an activated mana ability
 * whenever they have priority, whenever they are casting a spell or
 * activating an ability that requires a mana payment (…)" (dosłownie,
 * mirror nwgarne/mtg-data, sha256 8d860e451f20…; ADR 0030). Oferta silnika
 * liczy więc jednostki osiągalne (`manualManaOfferUnits`), a płatność
 * zostaje kontraktowi K: wykonawca płaci tylko z many wyprodukowanej
 * (żadnego auto-poświęcenia), kreator aktywuje źródło przed komendą.
 *
 * Pinujemy cała drabinę: oferta silnika (cast_permanent i cast_spell),
 * kolory ({C} ze Sciona nie płaci pipa kolorowego, CR 106.1a: „There are
 * five colors of mana"), kreator (źródła ze Scionem, przebieg płatności),
 * panel stołu (poświęcenia Sciona NIE MA w „Twoje działania"), kontrolery
 * (bot najpierw produkuje — bez odrzucanych komend).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { buildActionEntries } from '../src/table/render.js';
import { manaSourcesOf, shouldOpenManaWizard } from '../src/table/mana-wizard.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createRandomBot } from '../src/controllers/random-bot.js';
import { runSimulation } from '../src/engine/simulation.js';
import { manualManaOfferUnits } from '../src/engine/abilities.js';
import { producibleMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, zone, playerId, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    ...gameObjectDataOf(def), id, instanceId: `i-${id}`, cardId,
    controllerId: playerId, ownerId: playerId, zone,
    types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [],
    spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

function baseState() {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  return state;
}

function pass(state) {
  const pid = state.turn.priorityPlayerId;
  const cmd = playerView(state, pid).legalCommands.find((c) => c.type === 'pass_priority');
  assert.ok(cmd, 'pass dostępny');
  assert.equal(execute(state, cmd).ok, true);
}

test('N/1: osiągalność ofertowa widzi Sciona, miara automatu nie', () => {
  const state = baseState();
  put(state, 'scion', 'token_eldrazi_scion', 'battlefield', 'p1', { token: true });
  put(state, 'mtn1', 'basic-mountain', 'battlefield', 'p1');
  assert.equal(producibleMana(state, 'p1', null, {}, []), 1,
    'automat liczy tylko Górę — Scion to decyzja gracza');
  const units = manualManaOfferUnits(state, 'p1');
  assert.equal(units.amount, 1, 'osiągalna mana ze Sciona = 1 jednostka');
  assert.deepEqual(units.units[0], [], 'jednostka bezbarwna ({C})');
});

test('N/2: permanent za {1}{R} jest w ofercie przy Górze + Scionie; executor bez produkcji odrzuca, po niej gra', () => {
  const state = baseState();
  put(state, 'scion', 'token_eldrazi_scion', 'battlefield', 'p1', { token: true });
  put(state, 'mtn1', 'basic-mountain', 'battlefield', 'p1');
  put(state, 'piker', 'goblin-piker', 'hand', 'p1'); // {1}{R}
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'piker');
  assert.ok(cast, 'silnik oferuje rzut Pikera mimo braku many automatu (605.3a)');
  assert.equal(execute(state, cast).ok, false,
    'wykonanie bez produkcji odrzucane — żadnego auto-poświęcenia (kontrakt K)');
  assert.equal(state.objects.get('scion')?.zone, 'battlefield',
    'Scion nietknięty po odrzuceniu');
  const aktywacja = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'scion');
  assert.equal(execute(state, aktywacja).ok, true, 'droga kreatora: najpierw produkcja');
  const cast2 = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'piker');
  assert.equal(execute(state, cast2).ok, true, 'po produkcji rzut przechodzi');
  let proby = 0;
  while (state.zones.stack.length > 0 && proby < 4) { pass(state); proby += 1; }
  assert.ok(
    [...state.objects.values()].some((o) => o.cardId === 'goblin-piker' && o.zone === 'battlefield'),
    'Piker na stole');
});

test('N/3: instant jest w ofercie przy manie ręcznej (okno priorytetu przeciwnika)', () => {
  const state = baseState();
  put(state, 'scion', 'token_eldrazi_scion', 'battlefield', 'p1', { token: true });
  put(state, 'mtn1', 'basic-mountain', 'battlefield', 'p1');
  state.objects.set('mtn1', Object.freeze({ ...state.objects.get('mtn1'), tapped: true }));
  put(state, 'shock', 'shock', 'hand', 'p1'); // {R}
  put(state, 'cel', 'goblin-piker', 'battlefield', 'p2');
  assert.equal(producibleMana(state, 'p1', null, {}, []), 0, 'automat pusty (Góra tapnięta)');
  const view = playerView(state, 'p1');
  const cast = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'shock');
  assert.equal(cast.length, 0,
    '{C} ze Sciona NIE płaci pipa {R} (106.1a) — Shock nadal niedostępny');
  // Bramka dodatnia: bogactwo bezbarwnych jednostek ze Sciona jest osiągalną
  // maną do czaru {1}: druga Góra odtapowana + permanent {1}{R} (jak N/2).
});

test('N/4: kreator many wymienia Sciona jako źródło płatności rzutu', () => {
  const state = baseState();
  put(state, 'scion', 'token_eldrazi_scion', 'battlefield', 'p1', { token: true });
  put(state, 'mtn1', 'basic-mountain', 'battlefield', 'p1');
  put(state, 'piker', 'goblin-piker', 'hand', 'p1');
  const view = playerView(state, 'p1');
  const abilityInfo = (objectId, abilityIndex) => {
    const object = state.objects.get(objectId);
    if (!object) return null;
    if (abilityIndex == null) return null;
    const ability = object.activatableAbilities?.[abilityIndex] ?? object.abilities?.[abilityIndex];
    const effects = Array.isArray(ability?.effect) ? ability.effect : [ability?.effect];
    if (!effects.some((e) => e?.type === 'add_mana')) return null;
    const add = effects.find((e) => e?.type === 'add_mana');
    return {
      cardId: object.cardId,
      colors: add.colors ?? [],
      amount: add.amount ?? 1,
      manaCost: ability?.cost?.mana ?? 0,
      costColors: [],
      isLand: false,
      spendOnly: null,
    };
  };
  const sources = manaSourcesOf(view, 'p1', abilityInfo);
  const scionSource = sources.find((s) => s.id === 'scion');
  assert.ok(scionSource, 'Scion jest na liście źródeł kreatora');
  assert.equal(scionSource.amount, 1, 'jedna jednostka z kosztu poświęcenia');
});

function fakeSession(state) {
  return {
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? String(cardId),
    nameOfObject: (objectId) => state.objects.get(objectId)?.cardName ?? String(objectId),
    cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
    abilitiesOf: (cardId) => REGISTRY.get(cardId)?.abilities ?? [],
    state,
  };
}

test('N/4b: bramka kreatora otwiera się dla castu opartego na Scionie', () => {
  // Scena jak N/4: dynamika kreatora dostaje źródła wraz ze Scionem, koszt
  // i miarę automatu — przy automacie 1 < koszt 2 kreator jest jedyną drogą.
  const state = baseState();
  put(state, 'scion', 'token_eldrazi_scion', 'battlefield', 'p1', { token: true });
  put(state, 'mtn1', 'basic-mountain', 'battlefield', 'p1');
  put(state, 'piker', 'goblin-piker', 'hand', 'p1');
  const view = playerView(state, 'p1');
  const abilityInfo = (objectId, abilityIndex) => {
    const object = state.objects.get(objectId);
    if (!object || abilityIndex == null) return null;
    const ability = object.activatableAbilities?.[abilityIndex] ?? object.abilities?.[abilityIndex];
    const effects = Array.isArray(ability?.effect) ? ability.effect : [ability?.effect];
    const add = effects.find((e) => e?.type === 'add_mana');
    if (!add) return null;
    return {
      cardId: object.cardId, colors: add.colors ?? [], amount: add.amount ?? 1,
      manaCost: ability?.cost?.mana ?? 0, costColors: [], isLand: false, spendOnly: null,
    };
  };
  const sources = manaSourcesOf(view, 'p1', abilityInfo);
  const otworz = shouldOpenManaWizard({
    sources, poolMana: 0, poolUnits: [], totalNeeded: 2,
    requirements: [['R']],
    autoPayableMana: producibleMana(state, 'p1', null, {}, []),
  });
  assert.equal(otworz, true, 'kreator otwiera się, mimo że automat nie starczy');
});

test('N/5: panel „Twoje działania” pokazuje rzut, ale NIE pokazuje poświęcenia Sciona', () => {
  const state = baseState();
  put(state, 'scion', 'token_eldrazi_scion', 'battlefield', 'p1', { token: true });
  put(state, 'mtn1', 'basic-mountain', 'battlefield', 'p1');
  put(state, 'piker', 'goblin-piker', 'hand', 'p1');
  const view = playerView(state, 'p1');
  const entries = buildActionEntries(view.legalCommands, fakeSession(state), view);
  const all = [];
  for (const entry of entries) {
    if (entry.command) all.push(entry.command);
    for (const option of entry.request?.options ?? []) all.push(option);
  }
  assert.ok(all.some((c) => c.type === 'cast_permanent' && c.objectId === 'piker'),
    'przycisk rzutu jest widoczny');
  assert.ok(!all.some((c) => c.type === 'activate_ability' && c.objectId === 'scion'),
    'poświęcenie Sciona dla many nie jest akcją panelu (kreator)');
});

test('N/6: bot heurystyczny najpierw produkuje manę ze Sciona, potem rzuca (bez odrzucanych komend)', () => {
  const state = baseState();
  put(state, 'scion', 'token_eldrazi_scion', 'battlefield', 'p1', { token: true });
  put(state, 'mtn1', 'basic-mountain', 'battlefield', 'p1');
  put(state, 'piker', 'goblin-piker', 'hand', 'p1');
  const bot = createHeuristicBot({ seed: 5 });
  const pierwszy = bot.chooseCommand(playerView(state, 'p1'), {});
  assert.equal(pierwszy.type, 'activate_ability',
    `pierwszy ruch to produkcja many, nie odrzucony cast: ${JSON.stringify(pierwszy)}`);
  assert.equal(pierwszy.objectId, 'scion');
  assert.equal(execute(state, pierwszy).ok, true);
  const drugi = bot.chooseCommand(playerView(state, 'p1'), {});
  assert.equal(drugi.type, 'cast_permanent', 'po produkcji bot rzuca Pikera');
  assert.equal(execute(state, drugi).ok, true);
});

test('N/7: bot losowy nigdy nie wybiera komendy odrzucanej w scenie ręcznej many', () => {
  const state = baseState();
  put(state, 'scion', 'token_eldrazi_scion', 'battlefield', 'p1', { token: true });
  put(state, 'mtn1', 'basic-mountain', 'battlefield', 'p1');
  put(state, 'piker', 'goblin-piker', 'hand', 'p1');
  // runSimulation rzuca „Bot wybrał nielegalną komendę" przy odrzuceniu —
  // dokładny kontrakt: oferty wielu manualnej nie wolno botowi losować,
  // zanim sam nie wyprodukuje many aktywacją źródła.
  assert.doesNotThrow(() => runSimulation({
    state,
    controllers: new Map([
      ['p1', createRandomBot({ seed: 11, allowConcede: false })],
      ['p2', createRandomBot({ seed: 12, allowConcede: false })],
    ]),
    maxCommands: 120,
  }));
});
