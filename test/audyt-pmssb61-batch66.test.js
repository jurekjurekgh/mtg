import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry, REAL_CARDS, VIRTUAL_BASIC_LANDS } from '../src/cards/card-data.js';
import { createRegistry } from '../src/cards/registry.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { processTriggers } from '../src/engine/triggers.js';

const REG = createCardRegistry();
const SEED = 2066;
const allDefs = () => [...REAL_CARDS, ...VIRTUAL_BASIC_LANDS];

function registryCounterfactual(id, mutate, extras = []) {
  return createRegistry([
    ...allDefs().map((card) => (card.id === id ? mutate({ ...card }) : card)),
    ...extras,
  ]);
}

function scene({ registry = REG, mana = 14, manaColors, step = 'main', active = 'p1',
  priority = active, library = 30, setup = () => {} } = {}) {
  const state = createGameState({ seed: SEED, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = priority;
  if (mana > 0) addMana(state, priority, mana,
    manaColors === undefined ? undefined : { colors: manaColors });
  for (const playerId of ['p1', 'p2']) {
    for (let i = 0; i < library; i += 1) {
      addObject(state, {
        id: `lib-${playerId}-${i}`, instanceId: `i-lib-${playerId}-${i}`,
        cardId: 'library-blank', controllerId: playerId, ownerId: playerId,
        zone: 'library', kind: 'sorcery', power: 0, toughness: 0, manaCost: 2,
        abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: [],
        cardName: 'Library blank',
      });
    }
  }
  setup(state, registry);
  state.__registry = registry;
  return state;
}

function put(state, id, cardId, controllerId = 'p1', zone = 'battlefield',
  registry = state.__registry ?? REG, patch = {}) {
  const def = registry.get(cardId);
  if (!def) throw new Error(`Brak definicji ${cardId}`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes,
    keywords: def.keywords,
  });
  const current = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...current, summoningSickness: false, ...patch }));
  return state.objects.get(id);
}

function creature(state, id, controllerId, power, toughness, patch = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `synthetic-${id}`, controllerId,
    ownerId: controllerId, zone: 'battlefield', kind: 'creature', power, toughness,
    manaCost: Math.max(1, power), abilities: [], keywords: [], subtypes: [],
    types: ['Creature'], colors: [], cardName: id, summoningSickness: false,
    ...patch,
  });
  const current = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...current, summoningSickness: false, ...patch }));
  return state.objects.get(id);
}

function scored(state, botOptions = {}, viewPatch = null) {
  const bot = createHeuristicBot({
    seed: SEED + 1,
    randomness: 0,
    lookahead: 0,
    registry: state.__registry ?? REG,
    ...botOptions,
  });
  const base = playerView(state, state.turn.priorityPlayerId);
  const view = viewPatch ? Object.freeze({ ...base, ...viewPatch }) : base;
  bot.chooseCommand(view);
  return bot.trace().at(-1).options;
}

function scoreWhere(rows, predicate, description) {
  const row = rows.find((entry) => predicate(entry.cmd));
  assert.ok(row, `Brak opcji: ${description}; dostępne: ${rows.map((x) => x.cmd).join(', ')}`);
  return row.score;
}

function scoreLabel(rows, label) {
  return scoreWhere(rows, (cmd) => cmd === label, label);
}

function attackScore(state, ids, botOptions = {}) {
  return scoreLabel(scored(state, botOptions), `attack[${ids.join(',')}]`);
}

const cazurWithoutPartner = registryCounterfactual('cazur-ruthless-stalker', (card) => ({
  ...card,
  abilities: (card.abilities ?? []).filter((ability) => ability.effect?.type !== 'search_library_to_hand'),
}));
const cazurWithoutCombat = registryCounterfactual('cazur-ruthless-stalker', (card) => ({
  ...card,
  abilities: (card.abilities ?? []).filter((ability) => ability.trigger?.event !== 'any_combat_damage_to_player'),
}));
const coatlWithoutTrigger = registryCounterfactual('lorescale-coatl', (card) => ({ ...card, abilities: [] }));
const wildWithoutEtb = registryCounterfactual('wild-celebrants', (card) => ({ ...card, abilities: [] }));
const tigerWithoutEtb = registryCounterfactual('scythe-tiger', (card) => ({ ...card, abilities: [] }));
const rakishFree = registryCounterfactual('rakish-revelers', (card) => ({
  ...card,
  abilities: card.abilities.map((ability) => (ability.fromHand
    ? { ...ability, cost: { ...ability.cost, mana: 0 } }
    : ability)),
}));

function wardenAttack(withVigilance) {
  const registry = withVigilance ? REG : registryCounterfactual('warden-of-geometries', (card) => ({
    ...card,
    keywords: (card.keywords ?? []).filter((keyword) => keyword !== 'vigilance'),
  }));
  return scene({ registry, mana: 0, step: 'declare_attackers', setup: (state, reg) => {
    put(state, 'warden', 'warden-of-geometries', 'p1', 'battlefield', reg);
    creature(state, 'crackback', 'p2', 4, 4, { cantBlock: true });
    state.players.find((player) => player.id === 'p1').life = 4;
  } });
}

test('PMSSB-61/F2: vigilance zachowuje Wardena jako gardę po ataku', () => {
  const withVigilance = attackScore(wardenAttack(true), ['warden']);
  const withoutVigilance = attackScore(wardenAttack(false), ['warden']);
  assert.ok(withVigilance > withoutVigilance,
    `vigilance ma usunąć karę crackbacku: ${withVigilance} <= ${withoutVigilance}`);
  assert.ok(withoutVigilance < 0, 'kontrfaktyk bez vigilance nadal ma nie oddawać lethalnej gardy');
});

function cazurCast(registry) {
  return scene({ registry, setup: (state, reg) => {
    put(state, 'cazur-card', 'cazur-ruthless-stalker', 'p1', 'hand', reg);
  } });
}

function castScore(state, objectId, botOptions = {}) {
  return scoreWhere(scored(state, botOptions),
    (cmd) => cmd.startsWith(`cast_permanent(${objectId}`) || cmd.startsWith(`cast_spell(${objectId}`),
    `cast ${objectId}`);
}

test('PMSSB-61/F3: Partner daje premię tylko, gdy nazwana karta może być w bibliotece', () => {
  const noPartnerKnown = castScore(cazurCast(REG), 'cazur-card', {
    ownDeck: ['cazur-ruthless-stalker'],
  });
  const noPartnerAbility = castScore(cazurCast(cazurWithoutPartner), 'cazur-card', {
    ownDeck: ['cazur-ruthless-stalker'],
  });
  assert.equal(noPartnerKnown, noPartnerAbility,
    'nieistniejący cel Partnera nie może dawać premii za wyszukiwanie');

  const fakeUkkima = {
    ...REG.get('druid-of-the-cowl'), id: 'fake-ukkima', name: 'Ukkima, Stalking Shadow',
    oracleText: '', artId: null, imageUri: null,
  };
  const withUkkima = registryCounterfactual('__none__', (card) => card, [fakeUkkima]);
  const available = castScore(cazurCast(withUkkima), 'cazur-card', {
    ownDeck: ['cazur-ruthless-stalker', 'fake-ukkima'],
  });
  assert.ok(available > noPartnerKnown,
    `dostępna Ukkima ma przywracać wartość Partnera: ${available} <= ${noPartnerKnown}`);
});

function cazurAttack(registry, { sources = 1, blocked = false } = {}) {
  return scene({ registry, mana: 0, step: 'declare_attackers', setup: (state, reg) => {
    for (let i = 0; i < sources; i += 1) {
      put(state, `cazur-${i}`, 'cazur-ruthless-stalker', 'p1', 'battlefield', reg);
    }
    creature(state, 'runner', 'p1', 2, 2);
    if (blocked) creature(state, 'blocker', 'p2', 5, 5);
  } });
}

test('PMSSB-61/F3: deklaracja ataku wycenia licznik Cazura tylko przy połączeniu', () => {
  const baseline = attackScore(cazurAttack(cazurWithoutCombat), ['runner']);
  const one = attackScore(cazurAttack(REG), ['runner']);
  assert.ok(one > baseline, `pewny combat damage ma wyceniać licznik: ${one} <= ${baseline}`);

  const baselineTwo = attackScore(cazurAttack(cazurWithoutCombat, { sources: 2 }), ['runner']);
  const two = attackScore(cazurAttack(REG, { sources: 2 }), ['runner']);
  const firstMarginal = one - baseline;
  const twoPayoff = two - baselineTwo;
  assert.ok(twoPayoff > firstMarginal, 'drugi trigger Cazura ma dodać drugi licznik');
  assert.ok(twoPayoff < 2 * firstMarginal,
    'agregacja liczników nie może drugi raz naliczyć bazy gospodarza M429');

  const blockedFull = attackScore(cazurAttack(REG, { blocked: true }), ['runner']);
  const blockedCounter = attackScore(cazurAttack(cazurWithoutCombat, { blocked: true }), ['runner']);
  assert.equal(blockedFull, blockedCounter,
    'bez trample i z legalnym blokerem nie wolno zakładać combat damage do gracza');
});

function withCoatl(registry, setup) {
  return scene({ registry, setup: (state, reg) => {
    put(state, 'coatl', 'lorescale-coatl', 'p1', 'battlefield', reg);
    setup(state, reg);
  } });
}

function optionScore(state, piece, botOptions = {}) {
  return scoreWhere(scored(state, botOptions), (cmd) => cmd.includes(piece), piece);
}

test('PMSSB-61/F4 L41: własny draw premiuje Lorescale w spell, ability i ETB, cudzy draw nie', () => {
  const spellFullState = withCoatl(REG, (state) => put(state, 'draw', 'inspiration', 'p1', 'hand'));
  const spellCounterState = withCoatl(coatlWithoutTrigger,
    (state, reg) => put(state, 'draw', 'inspiration', 'p1', 'hand', reg));
  const ownFull = optionScore(spellFullState, 'cast_spell(draw->p1)');
  const ownCounter = optionScore(spellCounterState, 'cast_spell(draw->p1)');
  assert.ok(ownFull > ownCounter, 'dobór bota z czaru ma doliczać trigger Lorescale');
  const foeFull = optionScore(spellFullState, 'cast_spell(draw->p2)');
  const foeCounter = optionScore(spellCounterState, 'cast_spell(draw->p2)');
  assert.equal(foeFull, foeCounter, 'dobór przeciwnika nie wyzwala Lorescale bota');

  const abilityFull = withCoatl(REG, (state) => {
    put(state, 'scholar', 'civilized-scholar', 'p1', 'battlefield');
    put(state, 'discard', 'naturalize', 'p1', 'hand');
  });
  const abilityCounter = withCoatl(coatlWithoutTrigger, (state, reg) => {
    put(state, 'scholar', 'civilized-scholar', 'p1', 'battlefield', reg);
    put(state, 'discard', 'naturalize', 'p1', 'hand', reg);
  });
  assert.ok(optionScore(abilityFull, 'activate_ability(scholar#0)')
    > optionScore(abilityCounter, 'activate_ability(scholar#0)'),
  'draw_then_discard ze zdolności ma doliczać trigger Lorescale');

  const etbFull = withCoatl(REG, (state) => put(state, 'rager', 'phyrexian-rager', 'p1', 'hand'));
  const etbCounter = withCoatl(coatlWithoutTrigger,
    (state, reg) => put(state, 'rager', 'phyrexian-rager', 'p1', 'hand', reg));
  assert.ok(castScore(etbFull, 'rager') > castScore(etbCounter, 'rager'),
    'ETB draw ma antycypować trigger Lorescale');
});

function modalRows(registry, amountOne = 1, amountTwo = 2) {
  const state = withCoatl(registry, () => {});
  return scored(state, {}, {
    pendingModalTrigger: {
      playerId: 'p1', sourceId: 'coatl', cardId: 'lorescale-coatl',
      modes: [
        { name: 'draw one', effects: [{ type: 'draw_cards', amount: amountOne }], targets: [] },
        { name: 'draw two', effects: [{ type: 'draw_cards', amount: amountTwo }], targets: [] },
      ],
    },
    legalCommands: [
      { type: 'resolve_modal_choice', playerId: 'p1', modeIndex: 0 },
      { type: 'resolve_modal_choice', playerId: 'p1', modeIndex: 1 },
    ],
  });
}

test('PMSSB-61/F4 L41+M429: modal i optional draw agregują liczbę drawów bez duplikacji bazy', () => {
  const modalFull = modalRows(REG);
  const modalCounter = modalRows(coatlWithoutTrigger);
  const deltaOne = scoreLabel(modalFull, 'resolve_modal_choice(0)')
    - scoreLabel(modalCounter, 'resolve_modal_choice(0)');
  const deltaTwo = scoreLabel(modalFull, 'resolve_modal_choice(1)')
    - scoreLabel(modalCounter, 'resolve_modal_choice(1)');
  assert.ok(deltaOne > 0 && deltaTwo > deltaOne, 'dwa drawy mają dawać dwa liczniki');
  assert.ok(deltaTwo < 2 * deltaOne,
    'dwa drawy na tym samym gospodarzu nie mogą dwa razy naliczać bazy M429');

  const optionalScore = (registry) => {
    const state = withCoatl(registry, () => {});
    const rows = scored(state, {}, {
      pendingOptionalTrigger: {
        sourceCardId: 'curiosity',
        effect: { type: 'draw_cards', amount: 1 },
        effects: [{ type: 'draw_cards', amount: 1 }],
      },
      legalCommands: [
        { type: 'resolve_optional_trigger_choice', playerId: 'p1', fire: true },
        { type: 'pass_priority', playerId: 'p1' },
      ],
    });
    return scoreLabel(rows, 'resolve_optional_trigger_choice(fire)');
  };
  assert.ok(optionalScore(REG) > optionalScore(coatlWithoutTrigger),
    'decyzja may-draw ma widzieć trigger Lorescale');
});

function nobleScene(incoming = false) {
  return scene({ mana: 0, step: incoming ? 'declare_blockers' : 'main',
    active: incoming ? 'p2' : 'p1', priority: 'p1', setup: (state) => {
      put(state, 'noble', 'noble-vestige', 'p1', 'battlefield');
      if (incoming) {
        creature(state, 'attacker', 'p2', 3, 3, { attacking: true, cantBeBlocked: true });
        state.combat = {
          attackingPlayerId: 'p2', defendingPlayerId: 'p1', attackers: ['attacker'],
          blockers: new Map(), blockedAttackers: new Set(),
        };
      }
    } });
}

test('PMSSB-61/F6: Noble Vestige nie marnuje tarczy, ale chroni przy incoming damage', () => {
  const quiet = scored(nobleScene(false));
  const quietOwn = scoreLabel(quiet, 'activate_ability(noble#0->p1)');
  assert.ok(quietOwn < 0, `jałowa tarcza ma przegrać z passem: ${quietOwn}`);

  const danger = scored(nobleScene(true));
  const protectMe = scoreLabel(danger, 'activate_ability(noble#0->p1)');
  const protectFoe = scoreLabel(danger, 'activate_ability(noble#0->p2)');
  assert.ok(protectMe > quietOwn, 'nadchodzące obrażenia mają podnieść wartość tarczy');
  assert.ok(protectMe > 0, 'realna prewencja obrażeń gracza ma być dodatnia');
  assert.ok(protectMe > protectFoe, 'ochrona przeciwnika nie może być równie dobra');
});

function rakishScene(registry = REG, { redundant = false } = {}) {
  return scene({ registry, mana: 2, manaColors: [], setup: (state, reg) => {
    put(state, 'forest', 'basic-forest', 'p1', 'battlefield', reg);
    put(state, 'plains', 'basic-plains', 'p1', 'battlefield', reg);
    put(state, 'swamp', redundant ? 'rupture-spire' : 'basic-swamp', 'p1', 'battlefield', reg);
    put(state, 'swamp2', 'basic-swamp', 'p1', 'battlefield', reg);
    put(state, 'swamp3', 'basic-swamp', 'p1', 'battlefield', reg);
    put(state, 'foe-land', 'basic-mountain', 'p2', 'battlefield', reg);
    put(state, 'rakish', 'rakish-revelers', 'p1', 'hand', reg);
  } });
}

function activationScore(rows, targetId) {
  return scoreLabel(rows, `activate_ability(rakish#1->${targetId})`);
}

test('PMSSB-61/F9 S11+M429: Rakish wybiera land po realnym dopasowaniu pipów', () => {
  const rows = scored(rakishScene());
  const forest = activationScore(rows, 'forest');
  const plains = activationScore(rows, 'plains');
  const swamp = activationScore(rows, 'swamp');
  const foe = activationScore(rows, 'foe-land');
  assert.ok(swamp > forest && swamp > plains,
    `tylko Swamp domyka osobne pipy R/G/W: swamp=${swamp}, forest=${forest}, plains=${plains}`);
  assert.ok(foe < 0 && swamp > foe, 'grant dla lądu przeciwnika ma być zły');

  const free = activationScore(scored(rakishScene(rakishFree)), 'swamp');
  assert.equal(free - swamp, 2, 'koszt {2} aktywacji musi być realnie odjęty dokładnie raz');

  const redundant = activationScore(scored(rakishScene(REG, { redundant: true })), 'swamp');
  assert.ok(redundant < 0,
    `redundantny profil many nie może dostać sztucznej premii M429: ${redundant}`);
});

function resolveRakishGrant(state, targetId = 'swamp') {
  const view = playerView(state, 'p1');
  const activate = view.legalCommands.find((command) => command.type === 'activate_ability'
    && command.objectId === 'rakish' && command.targets?.[0] === targetId);
  assert.ok(activate, 'brak legalnej aktywacji Rakish');
  assert.equal(execute(state, activate).ok, true);
  for (let i = 0; i < 20; i += 1) {
    const current = playerView(state, state.turn.priorityPlayerId);
    const cast = current.legalCommands.find((command) => command.type === 'cast_permanent'
      && state.objects.get(command.objectId)?.cardId === 'rakish-revelers');
    if (cast) return cast;
    const pass = current.legalCommands.find((command) => command.type === 'pass_priority');
    if (!pass) break;
    const result = execute(state, pass);
    assert.equal(result.ok, true, result.reason);
  }
  return null;
}

test('PMSSB-61/F9: grant Rakish otwiera późniejszy rzut z exile', () => {
  const state = rakishScene();
  const before = playerView(state, 'p1').legalCommands
    .some((command) => command.type === 'cast_permanent' && command.objectId === 'rakish');
  assert.equal(before, false, 'bez czerwonego źródła Revelers nie są jeszcze rzucalne');
  const after = resolveRakishGrant(state, 'swamp');
  assert.ok(after, 'po nadaniu Swampowi profilu R/G/W Revelers mają być rzucalne z exile');
});

function tigerCastScene(landCount, registry = REG, withGreenDemand = false) {
  return scene({ registry, mana: 1, manaColors: ['G'], setup: (state, reg) => {
    const landCards = ['basic-forest', 'basic-swamp', 'basic-plains', 'basic-island', 'foul-orchard'];
    for (let i = 0; i < landCount; i += 1) {
      put(state, `land${i}`, landCards[i % landCards.length], 'p1', 'battlefield', reg);
    }
    if (withGreenDemand) put(state, 'demand', 'naturalize', 'p1', 'hand', reg);
    put(state, 'tiger-card', 'scythe-tiger', 'p1', 'hand', reg);
  } });
}

function tigerCastScore(landCount, registry = REG, demand = false) {
  return castScore(tigerCastScene(landCount, registry, demand), 'tiger-card');
}

test('PMSSB-61/F10: Scythe Tiger czeka, gdy koszt lądu skasowałby jego własne ciało', () => {
  const zero = tigerCastScore(0);
  const one = tigerCastScore(1);
  const two = tigerCastScore(2);
  const three = tigerCastScore(3);
  const five = tigerCastScore(5);
  assert.ok(zero < 0 && one < 0 && two < 0,
    `przy 0–2 landach Tiger ma przegrać z passem: ${zero}, ${one}, ${two}`);
  assert.ok(three > 0 && five > 0, 'przy redundantnym landzie rzut ma pozostać wartościowy');
  assert.equal(three, five, 'dalsze redundantne landy nie mają sztucznie pompować ETB');
  assert.ok(tigerCastScore(1, tigerWithoutEtb) > one,
    'kontrfaktyk bez kosztownego ETB ma ujawnić koszt poświęcenia');
});

function tigerSacrificeScene(landCount, withGreenDemand = false) {
  const state = scene({ mana: 0, setup: (s) => {
    const cards = ['basic-forest', 'basic-swamp', 'basic-plains', 'basic-island'];
    for (let i = 0; i < landCount; i += 1) put(s, `land${i}`, cards[i % cards.length]);
    if (withGreenDemand) put(s, 'demand', 'naturalize', 'p1', 'hand');
    put(s, 'tiger', 'scythe-tiger');
    processTriggers(s, [{ type: 'permanent_entered_battlefield', object: s.objects.get('tiger') }]);
  } });
  for (let i = 0; i < 12 && !state.pendingSacrifice; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((command) => command.type === 'pass_priority');
    assert.ok(pass, 'trigger Tigera nie doszedł do decyzji poświęcenia');
    const result = execute(state, pass);
    assert.equal(result.ok, true, result.reason);
  }
  assert.ok(state.pendingSacrifice, 'brak pendingSacrifice Tigera');
  return state;
}

test('PMSSB-61/F10: wybór ofiary zachowuje ostatni land i potrzebny kolor', () => {
  const one = scored(tigerSacrificeScene(1));
  const keepLand = scoreLabel(one, 'resolve_sacrifice_choice(tiger)');
  const loseLastLand = scoreLabel(one, 'resolve_sacrifice_choice(land0)');
  assert.ok(keepLand > loseLastLand,
    `z jednym landem bot ma poświęcić Tigera: ${keepLand} <= ${loseLastLand}`);

  const three = scored(tigerSacrificeScene(3, true));
  const forest = scoreLabel(three, 'resolve_sacrifice_choice(land0)');
  const swamp = scoreLabel(three, 'resolve_sacrifice_choice(land1)');
  const plains = scoreLabel(three, 'resolve_sacrifice_choice(land2)');
  const tiger = scoreLabel(three, 'resolve_sacrifice_choice(tiger)');
  assert.ok(swamp > forest && plains > forest,
    'unikalny zielony land potrzebny dla Naturalize ma być droższą ofiarą');
  assert.ok(Math.max(swamp, plains) > tiger,
    'przy trzech landach bot ma jednak zachować Tigera i oddać zbędny land');
});

test('PMSSB-61/kontrole dodatnie: Sporecap, Wild, Foul Orchard i Naturalize zachowują rodziny', () => {
  const sporecap = scene({ mana: 0, step: 'declare_blockers', active: 'p2', priority: 'p1', setup: (state) => {
    put(state, 'spider', 'sporecap-spider');
    creature(state, 'flyer', 'p2', 3, 3, { keywords: ['flying'], attacking: true });
    state.combat = {
      attackingPlayerId: 'p2', defendingPlayerId: 'p1', attackers: ['flyer'],
      blockers: new Map(), blockedAttackers: new Set(),
    };
  } });
  const blockRows = scored(sporecap);
  assert.ok(scoreLabel(blockRows, 'block[flyer<spider]') > scoreLabel(blockRows, 'block[]'),
    'reach Sporecapa ma nadal uzasadniać blok latacza');

  const wildScene = (registry) => scene({ registry, setup: (state, reg) => {
    put(state, 'artifact', 'universal-solvent', 'p2', 'battlefield', reg);
    put(state, 'wild-card', 'wild-celebrants', 'p1', 'hand', reg);
  } });
  assert.ok(castScore(wildScene(REG), 'wild-card') > castScore(wildScene(wildWithoutEtb), 'wild-card'),
    'ETB Wild Celebrants ma nadal wyceniać zniszczenie artefaktu');

  const lands = scene({ mana: 0, setup: (state) => {
    put(state, 'orchard', 'foul-orchard', 'p1', 'hand');
    put(state, 'forest', 'basic-forest', 'p1', 'hand');
    put(state, 'green', 'naturalize', 'p1', 'hand');
    put(state, 'black', 'village-rites', 'p1', 'hand');
    creature(state, 'fodder', 'p1', 1, 1);
  } });
  const landRows = scored(lands);
  const orchard = scoreWhere(landRows, (cmd) => cmd.startsWith('play_land(orchard'), 'Foul Orchard');
  const forest = scoreWhere(landRows, (cmd) => cmd.startsWith('play_land(forest'), 'Forest');
  assert.ok(orchard > 0 && forest > orchard,
    'tapped dual ma pozostać dodatni, lecz Forest wygrywa przy bieżącym zapotrzebowaniu');

  const naturalize = scene({ setup: (state) => {
    put(state, 'nat', 'naturalize', 'p1', 'hand');
    put(state, 'small', 'universal-solvent', 'p2');
    put(state, 'big', 'bomat-bazaar-barge', 'p2');
    put(state, 'own', 'universal-solvent', 'p1');
  } });
  const natRows = scored(naturalize);
  const small = scoreLabel(natRows, 'cast_spell(nat->small)');
  const big = scoreLabel(natRows, 'cast_spell(nat->big)');
  const own = scoreLabel(natRows, 'cast_spell(nat->own)');
  assert.ok(big > small && small > own && big > 0,
    'Naturalize ma nadal wybierać najcenniejszy legalny permanent wroga');
});

test('Audyt PR #163 F-6: linkedManaGrantValue filtruje exile, scoredWithLookahead łamie remisy many, tieProjection widzi activatableAbilities', () => {
  // F-6b: zwykła karta wygnana bez uprawnienia rzutu (np. przez removal) NIE może
  // sztucznie zawyżać wyceny grantu many Rakish Revelers.
  const withoutExile = rakishScene();
  const withDeadExile = rakishScene();
  // Dodajemy na stół Mountain, żeby sam Rakish w ręce miał już wszystkie kolory (R/G/W),
  // a w wygnaniu kładziemy kartę wymagającą podwójnego białego pipa (np. Griffin Guide / Day of Judgment)
  // bez uprawnienia do rzutu z exile.
  put(withoutExile, 'mtn', 'basic-mountain', 'p1', 'battlefield');
  put(withDeadExile, 'mtn', 'basic-mountain', 'p1', 'battlefield');
  put(withDeadExile, 'dead-exile', 'ballista-watcher', 'p1', 'exile');
  const scoreWithoutDeadExile = activationScore(scored(withoutExile), 'swamp');
  const scoreWithDeadExile = activationScore(scored(withDeadExile), 'swamp');
  assert.equal(scoreWithDeadExile, scoreWithoutDeadExile,
    'karta w exile bez prawa rzutu nie może zmieniać wyceny linkedManaGrantValue');

  // F-6b kontrola negatywna wyżej; audyt PR #164 A-2 (strona DODATNIA): karta
  // w exile z realnym stemplem rzutu z PlayerView (`playableUntilTurn` — okno
  // impulsu, CR 701.18) MUSI wejść do wyceny grantu. Filtr `castableExile`
  // czytał pola widoku, których nie ma (`playableFromExile`, `onAdventure`,
  // `warpedAtTurn`), więc gubił impuls/madness/rebound/warp/przygodę.
  // Scena: same Swampy (grant R/G/W domyka dokładnie jeden pip Rakisha, więc
  // własna karta w ręce nie wysyca `bestCardGain`) + biała karta w exile, dla
  // której nadany biały pip jest JEDYNYM źródłem koloru (impuls ⇒ +8 za unlock).
  const buildImpulseScene = (patch, { withCard = true } = {}) => scene({ registry: rakishFree, mana: 2, manaColors: [], setup: (state, reg) => {
    put(state, 'swamp', 'basic-swamp', 'p1', 'battlefield', reg);
    put(state, 'swamp2', 'basic-swamp', 'p1', 'battlefield', reg);
    put(state, 'swamp3', 'basic-swamp', 'p1', 'battlefield', reg);
    put(state, 'foe-land', 'basic-mountain', 'p2', 'battlefield', reg);
    put(state, 'rakish', 'rakish-revelers', 'p1', 'hand', reg);
    if (withCard) put(state, 'impulse-exile', 'midnight-guard', 'p1', 'exile', reg, patch);
  } });
  const noCardScore = activationScore(scored(buildImpulseScene({}, { withCard: false })), 'swamp');
  const deadStampScore = activationScore(scored(buildImpulseScene({})), 'swamp');
  const impulseScore = activationScore(scored(buildImpulseScene({ playableUntilTurn: 9 })), 'swamp');
  assert.equal(deadStampScore, noCardScore,
    'karta w exile bez prawa rzutu nie może zmieniać wyceny linkedManaGrantValue');
  assert.ok(impulseScore > noCardScore,
    `karta z oknem impulsu (playableUntilTurn) jest rzucalna z wygnania i musi podnieść wycenę grantu: bez stempla=${noCardScore}, ze stemplem=${impulseScore}`);

  // F-6a: scoredWithLookahead musi stosować breakCastSpellManaTies PRZED ucięciem do LOOKAHEAD_TOP_K,
  // żeby tańszy czar z remisu wchodził do okna symulacji przed droższym.
  const tieSpellsState = scene({ setup: (state) => {
    put(state, 'art1', 'universal-solvent', 'p2', 'battlefield');
    // Dwa czary niszczące ten sam artefakt: droższy i tańszy (ustawiamy identyczny bazowy score przed tie-breakiem).
    put(state, 'expensive-nat', 'naturalize', 'p1', 'hand', REG, { manaCost: 4 });
    put(state, 'cheap-nat', 'naturalize', 'p1', 'hand', REG, { manaCost: 2 });
  } });
  const simulatedCmds = [];
  const botWithLookahead = createHeuristicBot({ seed: SEED + 1, randomness: 0, lookahead: 1, registry: REG });
  botWithLookahead.chooseCommand(playerView(tieSpellsState, 'p1'), {
    simulate: (cmd) => {
      simulatedCmds.push(cmd);
      return { rejected: true };
    },
  });
  const firstSimulatedSpell = simulatedCmds.find((cmd) => cmd.type === 'cast_spell');
  assert.equal(firstSimulatedSpell?.objectId, 'cheap-nat',
    'scoredWithLookahead musi szeregować tańszy czar przed droższym przed wyborem kandydatów lookahead');

  // F-6c: tieProjection dla activate_ability musi widzieć nadaną zdolność w activatableAbilities
  // (a nie zwracać null przez brak wpisu w def.abilities).
  const grantedAbility = Object.freeze({
    type: 'activated',
    cost: Object.freeze({ mana: 1, tap: true }),
    effect: Object.freeze([{ type: 'gain_life', amount: 1 }]),
  });
  const grantedTieState = scene({ setup: (state) => {
    put(state, 'swamp-a', 'basic-swamp', 'p1', 'battlefield', REG, {
      abilityGrants: [grantedAbility],
    });
    put(state, 'swamp-b', 'basic-swamp', 'p1', 'battlefield', REG, {
      abilityGrants: [grantedAbility],
    });
  } });
  const tieBot = createHeuristicBot({ seed: SEED + 1, randomness: 0, lookahead: 0, registry: REG });
  const baseView = playerView(grantedTieState, 'p1');
  const onlyGranted = baseView.legalCommands.filter((cmd) => cmd.type === 'activate_ability');
  assert.equal(onlyGranted.length, 2, 'dwie nadane zdolności aktywowane na dwóch Swampach');
  tieBot.chooseCommand(Object.freeze({ ...baseView, legalCommands: onlyGranted }));
  const traceEntry = tieBot.trace().at(-1);
  assert.ok(traceEntry.tie && traceEntry.tie.every((entry) => entry.proj !== null),
    'tieProjection dla nadanej zdolności w activatableAbilities nie może zwracać null');
});

