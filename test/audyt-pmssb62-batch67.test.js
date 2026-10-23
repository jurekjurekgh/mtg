import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry, REAL_CARDS, VIRTUAL_BASIC_LANDS } from '../src/cards/card-data.js';
import { createRegistry } from '../src/cards/registry.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

/**
 * PMSSB-62 — audyt scoringu po pętli dla mechanik batcha 67 (10 kart).
 *
 * Rola: zamrozić wyniki pomiaru z `tools/pmssb62-batch67-sonda.mjs` (seed 2067)
 * jako PIANY. Każdy finding jest parą „pełna karta vs kontrfakt/granica", więc
 * test byłby CZERWONY na kodzie sprzed fali (tam oba warianty dawały tę samą
 * liczbę — dowody w planie `docs/plans/PLAN_2026-10-15-pmssb62-batch67.md`).
 * Twarde asercje to porównania (>, ==) na liczbach Z TEGO kodu, nie literały —
 * strojenie wag nie ma prawa wywracać audytu, ma wywracać REGRESJĘ mechaniki.
 */

const REG = createCardRegistry();
const SEED = 2067;
const allDefs = () => [...REAL_CARDS, ...VIRTUAL_BASIC_LANDS];

function registryCounterfactual(id, mutate, extras = []) {
  return createRegistry([
    ...allDefs().map((card) => (card.id === id ? mutate({ ...card }) : card)),
    ...extras,
  ]);
}

function scene({ registry = REG, mana = 14, step = 'main', active = 'p1', priority = active,
  library = 30, setup = () => {} } = {}) {
  const state = createGameState({ seed: SEED, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = priority;
  if (mana > 0) addMana(state, priority, mana);
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

/** Atak p2 na p1: `count` atakujących (widok obu graczy niesie `combat`). */
function attackingMe(state, count, { attackerPower = 2 } = {}) {
  const ids = [];
  for (let i = 1; i <= count; i += 1) {
    const id = `atk${i}`;
    creature(state, id, 'p2', attackerPower, attackerPower, { attacking: true });
    ids.push(id);
  }
  state.combat = {
    attackingPlayerId: 'p2', defendingPlayerId: 'p1', attackers: ids,
    blockers: new Map(), blockedAttackers: new Set(),
  };
  return ids;
}

function scored(state, botOptions = {}) {
  const bot = createHeuristicBot({
    seed: SEED + 1, randomness: 0, lookahead: 0,
    registry: state.__registry ?? REG, ...botOptions,
  });
  bot.chooseCommand(playerView(state, state.turn.priorityPlayerId));
  return bot.trace().at(-1)?.options ?? [];
}

function scoreWhere(rows, predicate, description) {
  const row = rows.find((entry) => predicate(entry.cmd));
  assert.ok(row, `Brak opcji: ${description}; dostępne: ${rows.map((x) => x.cmd).join(', ')}`);
  return row.score;
}

const includes = (piece) => (cmd) => cmd.includes(piece);
const starts = (prefix) => (cmd) => cmd.startsWith(prefix);

// ---------------------------------------------------------------------------
// Kontrfakty (mutacje czytają pole TAM, GDZIE ONO JEST — lekcja z fali A:
// mutacja złe-go-pola nie zmienia niczego i „udowadnia" nieistniejący brak).
// ---------------------------------------------------------------------------
const allianceBezTriggera = registryCounterfactual('improbable-alliance', (card) => ({
  ...card,
  abilities: (card.abilities ?? []).filter((a) => a.trigger?.event !== 'you_draw_second_card_each_turn'),
}));
const allianceBezDobierania = registryCounterfactual('improbable-alliance', (card) => ({
  ...card,
  abilities: (card.abilities ?? []).filter((a) => a.type !== 'activated'),
}));
const butcherBezObnizki = registryCounterfactual('battlefield-butcher', (card) => ({
  ...card,
  // Obniżka zdolności siedzi na `abilities[0]`, nie na karcie.
  abilities: (card.abilities ?? []).map((a) => ({ ...a, costReduction: undefined })),
}));
const sentryBezObnizki = registryCounterfactual('sentry-bot', (card) => ({
  ...card, costReduction: undefined,
}));
const sentryBezEnergiiEtb = registryCounterfactual('sentry-bot', (card) => ({
  ...card,
  abilities: (card.abilities ?? []).filter((a) => a.effect?.type !== 'get_energy'
    && !(Array.isArray(a.effect) && a.effect.some((e) => e?.type === 'get_energy'))),
}));
const quarryBezFood = registryCounterfactual('wolfs-quarry', (card) => ({
  ...card,
  // Rider śmierci jedzie w DESKRYPTORZE `create_token` czaru — `tokenRiderDamage`
  // czyta `effect.abilities`, a dopiero potem definicję tokena.
  spell: {
    ...card.spell,
    effects: (card.spell?.effects ?? []).map((e) => (e?.type === 'create_token' ? { ...e, abilities: [] } : e)),
  },
}));
const ringleaderBezBattleCry = registryCounterfactual('kuldotha-ringleader', (card) => ({
  ...card,
  keywords: (card.keywords ?? []).filter((k) => k !== 'battle_cry'),
  abilities: (card.abilities ?? []).filter((a) => a.effect?.type !== 'buff_attacking_creatures'
    && !(Array.isArray(a.effect) && a.effect.some((e) => e?.type === 'buff_attacking_creatures'))),
}));

// --- F1: `you_draw_second_card_each_turn` (Improbable Alliance) --------------
function allianceCast(registry = REG) {
  return scene({ registry, setup: (state, reg) => put(state, 'ia', 'improbable-alliance', 'p1', 'hand', reg) });
}
const allianceScore = (registry = REG) => scoreWhere(scored(allianceCast(registry)),
  includes('(ia'), 'rzut Improbable Alliance');

test('PMSSB-62/F1: trigger drugiej karty w turze jest wyceniany przy rzucie', () => {
  const full = allianceScore();
  const bez = allianceScore(allianceBezTriggera);
  assert.ok(full > bez + 4,
    `trigger „druga karta w turze" ma dodać wartość tokenu: ${full} vs ${bez}`);
});

test('PMSSB-62/F1-bramka (M429): bez źródła drugiego dobrania trigger milczy', () => {
  const bezTriggera = allianceScore(allianceBezTriggera);
  const bezZrodla = allianceScore(allianceBezDobierania);
  assert.equal(bezZrodla, bezTriggera,
    'karta bez własnej aktywacji doboru nie ma dowodu drugiej karty — premii nie ma');
});

// --- F2: obniżka kosztu AKTYWOWANEJ zdolności (Battlefield Butcher) ----------
function butcherScene(licznikGrobow, registry = REG) {
  return scene({ mana: 8, registry, setup: (state, reg) => {
    put(state, 'butcher', 'battlefield-butcher', 'p1', 'battlefield', reg);
    for (let i = 1; i <= licznikGrobow; i += 1) {
      put(state, `gr${i}`, 'intrepid-tenderfoot', 'p1', 'graveyard', reg);
    }
  } });
}
const butcherScore = (n, registry = REG) => scoreWhere(scored(butcherScene(n, registry)),
  starts('activate_ability'), `aktywacja Butchera (${n} kart w grobie)`);

test('PMSSB-62/F2: koszt aktywacji spada z każdą kartą-stworem w grobie (CR 602.2b → 601.2f)', () => {
  const zero = butcherScore(0);
  const trzy = butcherScore(3);
  const piec = butcherScore(5);
  assert.ok(trzy > zero + 2, `obniżka {1}×3 ma być widoczna: ${trzy} vs ${zero}`);
  assert.ok(piec > trzy + 1, `obniżka do {0} ma być widoczna: ${piec} vs ${trzy}`);
  assert.equal(butcherScore(5, butcherBezObnizki), zero,
    'kontrfakt bez obniżki przy pięciu kartach = cena pełnego kosztu {5}');
});

// --- F3: obniżka kosztu CZARU `perCreatureAttackingYou` (Sentry Bot) ---------
function sentryCast(liczbaAtakujacych, { registry = REG, mana = 5 } = {}) {
  return scene({ mana, registry, setup: (state, reg) => {
    put(state, 'bot', 'sentry-bot', 'p1', 'hand', reg);
    if (liczbaAtakujacych > 0) attackingMe(state, liczbaAtakujacych);
  } });
}

test('PMSSB-62/F3: obniżka kosztu czaru za atakujących podnosi wycenę rzutu (S11)', () => {
  const zero = scoreWhere(scored(sentryCast(0)), includes('(bot'), 'rzut przy 0 atakujących');
  const dwa = scoreWhere(scored(sentryCast(2)), includes('(bot'), 'rzut przy 2 atakujących');
  const cztery = scoreWhere(scored(sentryCast(4)), includes('(bot'), 'rzut przy 4 atakujących');
  assert.ok(dwa > zero, `{2}{W} ma być tańsze niż {4}{W}: ${dwa} vs ${zero}`);
  assert.ok(cztery > dwa, `{W} ma być tańsze niż {2}{W}: ${cztery} vs ${dwa}`);
  const bez = scoreWhere(scored(sentryCast(2, { registry: sentryBezObnizki })), includes('(bot'),
    'kontrfakt bez obniżki przy 2 atakujących');
  assert.ok(dwa > bez, `kontrfakt musi płacić pełne {4}{W}: ${dwa} vs ${bez}`);
});

test('PMSSB-62/F3: przy dokładnie 3 manach Sentry jest rzucalny TYLKO z obniżką', () => {
  const zObnizka = scored(sentryCast(2, { mana: 3 }));
  assert.ok(zObnizka.some((row) => row.cmd.includes('(bot')), 'obniżka {2} → oferta istnieje');
  const bezObnizki = scored(sentryCast(2, { registry: sentryBezObnizki, mana: 3 }));
  assert.ok(!bezObnizki.some((row) => row.cmd.includes('(bot')),
    'bez obniżki silnik nie ma czym zapłacić {4}{W} — oferty być nie może');
});

// --- F4: koszt ENERGII (CR 122.1) ------------------------------------------
function sentryPayChoice({ energia = 3, payEnergy = 3 } = {}) {
  return scene({ mana: 0, step: 'beginning_of_combat', setup: (state) => {
    put(state, 'bot', 'sentry-bot', 'p1', 'battlefield');
    creature(state, 'moj', 'p1', 1, 1);
    state.players.find((player) => player.id === 'p1').energy = energia;
    state.pendingOptionalPay = {
      playerId: 'p1', sourceId: 'bot',
      ability: {
        type: 'triggered',
        trigger: payEnergy == null ? { event: 'beginning_of_combat' } : { event: 'beginning_of_combat', payEnergy },
        effect: { type: 'add_counter_to_creatures_you_control', counter: '+1/+1', amount: 1 },
      },
      onResolution: true,
    };
  } });
}
const payFireScore = (options) => scoreWhere(scored(sentryPayChoice(options)),
  (cmd) => cmd === 'resolve_optional_pay_choice', 'decyzja o opłacie');

test('PMSSB-62/F4: opłata {E}{E}{E} nie remisuje z darmową (CR 122.1)', () => {
  const platna = payFireScore({ energia: 3, payEnergy: 3 });
  const darmowa = payFireScore({ energia: 3, payEnergy: null });
  assert.ok(platna < darmowa - 5,
    `koszt energii musi mieć wymiar: płatna ${platna} vs darmowa ${darmowa}`);
});

function sentryAnticipation(energia) {
  return scene({ mana: 5, setup: (state) => {
    put(state, 'bot', 'sentry-bot', 'p1', 'hand');
    for (let i = 1; i <= 4; i += 1) creature(state, `moj${i}`, 'p1', 3, 3);
    state.players.find((player) => player.id === 'p1').energy = energia;
  } });
}

test('PMSSB-62/F4: antycypacja rzutu widzi payoff opłaty energii (4 własne stwory)', () => {
  const bez = scoreWhere(scored(sentryAnticipation(0)), includes('(bot'), 'rzut bez energii');
  const z = scoreWhere(scored(sentryAnticipation(3)), includes('(bot'), 'rzut z 3 licznikami');
  assert.ok(z > bez + 2, `trzy liczniki mają odblokować payoff +1/+1×4: ${z} vs ${bez}`);
});

test('PMSSB-62/F5: `get_energy` liczy kwotę z widoku (atakujący przeciw mnie)', () => {
  const zEnergia = scoreWhere(scored(sentryCast(2)), includes('(bot'), 'rzut przy 2 atakujących');
  const bezEnergii = scoreWhere(scored(sentryCast(2, { registry: sentryBezEnergiiEtb })), includes('(bot'),
    'kontrfakt bez wpisu get_energy');
  assert.ok(zEnergia > bezEnergii + 3,
    `2 liczniki energii to nie zero: ${zEnergia} vs ${bezEnergii}`);
});

// --- F6: rider `dies` → Food na tokenie Boara (Wolf's Quarry) ----------------
function quarryCast({ registry = REG, life = 20 } = {}) {
  return scene({ mana: 7, registry, setup: (state, reg) => {
    put(state, 'wq', 'wolfs-quarry', 'p1', 'hand', reg);
    state.players.find((player) => player.id === 'p1').life = life;
  } });
}
const quarryScore = (options) => scoreWhere(scored(quarryCast(options)), starts('cast_spell'),
  'rzut Wolf\'s Quarry');

test('PMSSB-62/F6: trigger śmierci tokena liczy się tą samą miarą co u stwora (L41)', () => {
  const zRiderem = quarryScore({ life: 8 });
  const bezRidera = quarryScore({ life: 8, registry: quarryBezFood });
  assert.ok(zRiderem > bezRidera, `Boar → Food pod presją życia: ${zRiderem} vs ${bezRidera}`);
});

test('PMSSB-62/F6-granica: przy pełnym życiu bank życia Fooda = 0 (anty-over-fix)', () => {
  const zRiderem = quarryScore({ life: 20 });
  const bezRidera = quarryScore({ life: 20, registry: quarryBezFood });
  assert.equal(zRiderem, bezRidera,
    'przy 20 życia {2} za 3 życia nie przebija drabiny wartości — brak premii ma być świadomy');
});

// --- F7: battle cry (CR 702.91a) w decyzji ataku ----------------------------
function ringAttack({ registry = REG, dyskryminujaca = false } = {}) {
  return scene({ mana: 0, step: 'declare_attackers', active: 'p1', priority: 'p1', registry,
    setup: (state, reg) => {
      put(state, 'ring', 'kuldotha-ringleader', 'p1', 'battlefield', reg);
      if (dyskryminujaca) {
        creature(state, 'other', 'p1', 2, 2);
        creature(state, 'blocker', 'p2', 3, 3);
        // B (2026-10-22, poprawka „bloker bierze tylko jednego"): przy SAMYM
        // jednym blokerze 3/3 drugi atakujący 2/2 nie jest „wymianą w bloker" —
        // obrońca może zablokować tylko JEDNEGO (CR 509.1a), więc `other`
        // przechodzi w twarz i wariant z nim bije wariant bez niego niezależnie
        // od battle cry. Trzeba DWÓCH blokerów 3/3, żeby `other` faktycznie
        // stanął naprzeciwko blokera i scenariusz zmierzał to, co ma zmierzyć:
        // czy battle cry zmienia ODPOWIEDŹ na tę wymianę (3/2 zamiast 2/2).
        creature(state, 'blocker2', 'p2', 3, 3);
      } else {
        // PMSSB-70: drugi blokujący daje WOLNY SLOT. Przy jednym bloku­jącym
        // Ringleader (przeżywa i zabija go) sam zabija blokera, więc drugi
        // atakujący-wymiana byłby zbędny i dostaje karę `unpaidTradeLoss`.
        // Pin battle cry (CR 702.91a) testujemy tam, gdzie dołożenie ma sens.
        creature(state, 'other', 'p1', 1, 1);
        creature(state, 'blocker', 'p2', 1, 1);
        creature(state, 'blocker2', 'p2', 1, 1);
      }
    } });
}
const attackScore = (options, ids) => scoreWhere(scored(ringAttack(options)),
  (cmd) => cmd === `attack[${ids}]`, `atak [${ids}]`);

test('PMSSB-62/F7: battle cry wchodzi do wyceny DEKLARACJI ataku (CR 702.91a)', () => {
  const razem = attackScore({}, ['ring', 'other']);
  const solo = attackScore({}, ['ring']);
  assert.ok(razem > solo, `Ringleader + inny atakujący ma dostać nagrodę: ${razem} vs ${solo}`);
  assert.equal(attackScore({ registry: ringleaderBezBattleCry }, ['ring', 'other']),
    attackScore({ registry: ringleaderBezBattleCry }, ['ring']),
    'kontrfakt bez battle cry: dołożenie atakującego nic nie dodaje');
});

test('PMSSB-62/F7: pompa zbiorowa zmienia wynik WYMIANY (2/2 vs bloker 3/3)', () => {
  const razem = attackScore({ dyskryminujaca: true }, ['ring', 'other']);
  const kontrfakt = attackScore({ dyskryminujaca: true, registry: ringleaderBezBattleCry }, ['ring', 'other']);
  assert.ok(razem > 0,
    `z battle cry 2/2 staje się 3/2 i zabija blokera — wycena ma być dodatnia: ${razem}`);
  assert.ok(kontrfakt < 0,
    `bez battle cry to ta sama zła wymiana co przed falą: ${kontrfakt}`);
});
