/**
 * Zgłoszenie właściciela K (2026-10-24): Abstruse Interference —
 * „Counter target spell unless its controller pays {1}…”. Gdy bot kontrował
 * czar gracza, w „Twoje działania” była TYLKO opcja „Nie płać — czar
 * skontrowany”, mimo że gracz mógł pozyskać manę z poświęcenia własnego
 * Eldrazi Sciona/Spawna.
 *
 * Właściwa droga (korekta właściciela): decyzja pokazuje „Zapłać {1}”,
 * kliknięcie otwiera KREATOR MANY ze wszystkimi źródłami (w tym Scionami) —
 * poświęcanie Scionów NIE trafia do panelu akcji. Brakowało trzech ogniw:
 *  1. OFERTA silnika: `pay:true` powstawała tylko przy manie „automatycznej”
 *     (`producibleMana`), choć bramka otwarcia decyzji (effects.js, Batch 54)
 *     od dawna liczy też ręczne zdolności many (CR 608.2g: „If an effect
 *     gives a player the option to pay mana, they may activate mana
 *     abilities before taking that action”). Teraz oferta używa tej samej
 *     miary osiągalności (`paymentReachableMana`) — dla kontr-płatności
 *     i dopłaty ward (jedna rodzina). Wykonawca nadal wymaga many realnie
 *     wyprodukowanej — kreator/bot aktywują źródła PRZED komendą płatności
 *     (`manaGeneratingCommandFor`), silnik nigdy nie poświęca sam.
 *  2. BRAMKA KREATORA: przy jednym kształcie płatności kreator się nie
 *     otwierał (M202/O) i komenda szła wprost do silnika — za mało, gdy
 *     jedyny kształt wymaga ręcznego źródła. `shouldOpenManaWizard`
 *     otwiera go też, gdy auto-tap kosztu nie pokrywa (`autoPayableMana`).
 *  3. BOT: jako płatnik nie może wybrać `pay:true`, którego silnik odrzuci
 *     (sterowniki rzucają na odrzuceniu) — najpierw aktywuje źródło many,
 *     płaci w następnej decyzji; bot losowy losuje spośród komend
 *     wykonywalnych od razu (ta sama dwufazowość).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { buildActionEntries } from '../src/table/render.js';
import { countPaymentVariants, shouldOpenManaWizard } from '../src/table/mana-wizard.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

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

function fakeSession(state) {
  return {
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? String(cardId),
    nameOfObject: (objectId) => state.objects.get(objectId)?.cardName ?? String(objectId),
    cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
    abilitiesOf: (cardId) => REGISTRY.get(cardId)?.abilities ?? [],
    state,
  };
}

function panelCommands(entries) {
  const out = [];
  for (const entry of entries) {
    if (entry.command) out.push(entry.command);
    for (const option of entry.request?.options ?? []) out.push(option);
  }
  return out;
}

function pass(state) {
  const pid = state.turn.priorityPlayerId;
  const cmd = playerView(state, pid).legalCommands.find((c) => c.type === 'pass_priority');
  assert.ok(cmd, `pass dostępny dla ${pid}`);
  assert.equal(execute(state, cmd).ok, true);
}

/**
 * Scena zgłoszenia: rzucający płaci za Goblin Pikera obiema Górami (pula
 * pusta, landy tapnięte), ma Eldrazi Sciona; przeciwnik kontruje Abstruse
 * Interference. Gra stoi na decyzji płatności rzucającego.
 */
function scenaKontry(rzucajacy, kontrujacy) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', rzucajacy);
  state.turn.activePlayerId = state.turn.priorityPlayerId = rzucajacy;
  state.pendingMulligans = [];
  put(state, 'mtn1', 'basic-mountain', 'battlefield', rzucajacy);
  put(state, 'mtn2', 'basic-mountain', 'battlefield', rzucajacy);
  put(state, 'scion', 'token_eldrazi_scion', 'battlefield', rzucajacy, { token: true });
  put(state, 'piker', 'goblin-piker', 'hand', rzucajacy);
  put(state, 'isl1', 'basic-island', 'battlefield', kontrujacy);
  put(state, 'isl2', 'basic-island', 'battlefield', kontrujacy);
  put(state, 'isl3', 'basic-island', 'battlefield', kontrujacy);
  put(state, 'abstruse', 'abstruse-interference', 'hand', kontrujacy);

  const rzut = playerView(state, rzucajacy).legalCommands
    .find((c) => c.type.startsWith('cast') && c.objectId === 'piker');
  assert.ok(rzut);
  assert.equal(execute(state, rzut).ok, true);
  pass(state);
  const kontra = playerView(state, kontrujacy).legalCommands
    .find((c) => c.type.startsWith('cast') && c.objectId === 'abstruse');
  assert.ok(kontra);
  assert.equal(execute(state, kontra).ok, true);
  pass(state); pass(state);
  assert.ok(state.pendingCounterPay, 'decyzja płatności otwarta');
  assert.equal(state.pendingCounterPay.playerId, rzucajacy);
  return state;
}

test('K/1: oferta zawiera „Zapłać {1}” przy samej ręcznej manie; poświęcenie Sciona NIE jest akcją panelu', () => {
  const state = scenaKontry('p1', 'p2');
  const view = playerView(state, 'p1');
  const zaplac = view.legalCommands
    .find((c) => c.type === 'resolve_counter_pay_choice' && c.pay === true);
  assert.ok(zaplac, 'silnik oferuje „Zapłać {1}” (osiągalne przez Sciona — CR 608.2g)');
  const komendy = panelCommands(buildActionEntries(view.legalCommands, fakeSession(state), view));
  assert.ok(komendy.some((c) => c.type === 'resolve_counter_pay_choice' && c.pay === true),
    'przycisk zapłaty jest w decyzjach panelu (otworzy kreator many)');
  assert.ok(komendy.some((c) => c.type === 'resolve_counter_pay_choice' && c.pay === false),
    'odmowa nadal obecna');
  assert.ok(!komendy.some((c) => c.type === 'activate_ability' && c.objectId === 'scion'),
    'poświęcanie Sciona NIE trafia do „Twoje działania” (życzenie właściciela — od tego jest kreator)');
});

test('K/2: wykonawca nie poświęca sam — płatność przed wyprodukowaniem many jest odrzucana, po niej przechodzi', () => {
  const state = scenaKontry('p1', 'p2');
  const zaplac = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_counter_pay_choice' && c.pay === true);
  assert.ok(zaplac, 'oferta „Zapłać” istnieje już przed wyprodukowaniem many');
  const przedwczesna = execute(state, zaplac);
  assert.equal(przedwczesna.ok, false, 'pusta pula = odrzucenie (żadnego auto-poświęcenia)');
  assert.ok(state.pendingCounterPay, 'decyzja nadal otwarta po odrzuceniu');
  assert.ok([...state.objects.values()].some((o) => o.id === 'scion' && o.zone === 'battlefield'),
    'Scion nietknięty przez odrzuconą próbę');
  // Droga kreatora: najpierw źródło, potem komenda płatności.
  const aktywacja = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'scion');
  assert.equal(execute(state, aktywacja).ok, true);
  const zaplac2 = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_counter_pay_choice' && c.pay === true);
  assert.equal(execute(state, zaplac2).ok, true);
  pass(state); pass(state);
  const stale = [...state.objects.values()].filter((o) => o.zone === 'battlefield');
  assert.ok(stale.some((o) => o.cardId === 'goblin-piker' && o.controllerId === 'p1'),
    'Goblin Piker NIE został skontrowany');
  assert.ok(!stale.some((o) => o.id === 'scion'), 'Scion gracza poświęcony świadomie');
  assert.ok(stale.some((o) => o.cardId === 'token_eldrazi_scion' && o.controllerId === 'p2'),
    'bot utworzył token z drugiej części Abstruse Interference');
});

test('K/3: bramka kreatora — jedno ręczne źródło otwiera kreator, gdy auto-tap kosztu nie pokrywa', () => {
  const scionSource = { id: 'scion', cardId: 'token_eldrazi_scion', colors: [], amount: 1, kind: 'ability' };
  assert.equal(countPaymentVariants([scionSource], 0, 1, [], 2, []), 1,
    'jeden kształt płatności (sam Scion)');
  assert.equal(shouldOpenManaWizard({
    sources: [scionSource], poolMana: 0, poolUnits: [], totalNeeded: 1, requirements: [],
  }), false, 'bez wiedzy o auto-płatności stara reguła M202/O (1 wariant = brak kreatora)');
  assert.equal(shouldOpenManaWizard({
    sources: [scionSource], poolMana: 0, poolUnits: [], totalNeeded: 1, requirements: [],
    autoPayableMana: 0,
  }), true, 'auto-tap nie pokrywa kosztu → kreator jest jedyną drogą zapłaty');
  assert.equal(shouldOpenManaWizard({
    sources: [scionSource], poolMana: 0, poolUnits: [], totalNeeded: 1, requirements: [],
    autoPayableMana: 3,
  }), false, 'auto-tap pokrywa koszt → bez kreatora jak dotąd');
});

test('K/4: bot-płatnik najpierw produkuje manę ze Sciona i dopiero płaci (żadnej odrzucanej komendy)', () => {
  const state = scenaKontry('p2', 'p1'); // bot rzucał Pikera, gracz kontruje
  const bot = createHeuristicBot({ seed: 5 });
  const wybor1 = bot.chooseCommand(playerView(state, 'p2'), {});
  assert.equal(wybor1.type, 'activate_ability',
    `pierwszy ruch bota to produkcja many, nie: ${JSON.stringify(wybor1)}`);
  assert.equal(wybor1.objectId, 'scion');
  assert.equal(execute(state, wybor1).ok, true);
  const wybor2 = bot.chooseCommand(playerView(state, 'p2'), {});
  assert.equal(wybor2.type, 'resolve_counter_pay_choice');
  assert.equal(wybor2.pay, true, 'po wyprodukowaniu many bot płaci i ratuje czar');
  assert.equal(execute(state, wybor2).ok, true);
  pass(state); pass(state);
  assert.ok([...state.objects.values()]
    .some((o) => o.zone === 'battlefield' && o.cardId === 'goblin-piker' && o.controllerId === 'p2'),
    'czar bota wszedł do gry');
});

test('K/5: ta sama miara osiągalności przy dopłacie ward (jedna rodzina decyzji płatniczych)', () => {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  put(state, 'scion', 'token_eldrazi_scion', 'battlefield', 'p1', { token: true });
  // Oczekująca dopłata ward {1} dla p1 — oferta liczona względem tego stanu.
  state.pendingWardPay = {
    playerId: 'p1', amount: 1, wardSourceId: 'scion', wardCardId: 'token_eldrazi_scion',
    targetingStackId: 'brak', restorePriorityTo: 'p1',
  };
  const komendy = playerView(state, 'p1').legalCommands;
  assert.ok(komendy.some((c) => c.type === 'resolve_ward_pay_choice' && c.pay === true),
    'ward: „Zapłać” oferowane przy samej ręcznej manie');
  assert.ok(komendy.some((c) => c.type === 'resolve_ward_pay_choice' && c.pay === false),
    'ward: odmowa nadal oferowana');
  assert.ok(komendy.some((c) => c.type === 'activate_ability' && c.objectId === 'scion'),
    'ward: oferta niesie aktywację źródła many (kreator ma z czego budować listę źródeł)');
});

test('K/6: pozostałe decyzje płatnicze też niosą aktywacje many (CR 608.2g — jedna rodzina)', () => {
  function scenaPending(ustaw) {
    const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
    state.turn = jumpToStep(state.turn, 'main', 'p1');
    state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
    state.pendingMulligans = [];
    put(state, 'scion', 'token_eldrazi_scion', 'battlefield', 'p1', { token: true });
    ustaw(state);
    return playerView(state, 'p1').legalCommands;
  }
  const opcjonalna = scenaPending((s) => {
    s.pendingOptionalPay = {
      playerId: 'p1', sourceId: 'scion',
      ability: { trigger: { payMana: 1 } }, restorePriorityTo: 'p1',
    };
  });
  assert.ok(opcjonalna.some((c) => c.type === 'activate_ability' && c.objectId === 'scion'),
    'opcjonalna płatność: aktywacja Sciona w ofercie');
  const alboPoswiec = scenaPending((s) => {
    s.pendingPayOrSacrifice = { playerId: 'p1', amount: 1, sourceId: 'scion', restorePriorityTo: 'p1' };
  });
  assert.ok(alboPoswiec.some((c) => c.type === 'activate_ability' && c.objectId === 'scion'),
    'zapłać-albo-poświęć: aktywacja Sciona w ofercie');
});
