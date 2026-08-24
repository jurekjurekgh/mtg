// M201 — zgłoszenia właściciela z rozgrywki (2026-08-23).
//
// F: Reassembling Skeleton — „możliwość reanimacji dopiero w moim upkeep,
//    a powinna być już w postcombat main przeciwnika”.
// M: „Frightful Delusion (rzuca: Nieprzyjaciel) → cel: ?” na stosie.
// M2: „bot rzucił czar na moją zdolność aktywowaną z Cellar Door; czar się
//    rozstrzyga, ale nie kontruje zdolności”.
//
// Weryfikacja wobec Oracle/CR PRZED zmianą (L57) — patrz asercje niżej.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

function stateAtStep(active, stepIndex, priority = active) {
  const state = createGameState({ seed: 21, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = {
    ...initialTurn(active), ...TURN_STEPS[stepIndex], stepIndex,
    activePlayerId: active, priorityPlayerId: priority, passes: 0,
  };
  return state;
}

// ---------------------------------------------------------------------------
// F — Reassembling Skeleton: „{1}{B}: Return this card from your graveyard to
// the battlefield tapped.” Oracle NIE ma klauzuli „Activate only as a sorcery”
// (docs/cards/scryfall-reassembling-skeleton.json), więc CR 602.2 pozwala
// aktywować zdolność w KAŻDYM oknie priorytetu — także w turze przeciwnika.
// Warunek konieczny jest jeden: gracz musi móc ZAPŁACIĆ {1}{B}.
// ---------------------------------------------------------------------------

const POSTCOMBAT_MAIN = 9;
const END_OF_COMBAT = 8;

test('M201/F: reanimacja jest w ofercie w KAŻDYM oknie tury przeciwnika (mana dostępna)', () => {
  for (const stepIndex of [END_OF_COMBAT, POSTCOMBAT_MAIN]) {
    const state = stateAtStep('p2', stepIndex, 'p1'); // tura bota, priorytet człowieka
    put(state, 'skel', 'reassembling-skeleton', 'p1', 'graveyard');
    put(state, 'sw1', 'basic-swamp', 'p1', 'battlefield');
    put(state, 'sw2', 'basic-swamp', 'p1', 'battlefield');
    const offers = playerView(state, 'p1').legalCommands
      .filter((c) => c.type === 'activate_ability' && c.objectId === 'skel');
    assert.equal(offers.length, 1,
      `CR 602.2: zdolność bez „only as a sorcery” działa w oknie priorytetu (krok ${TURN_STEPS[stepIndex].phase}/${TURN_STEPS[stepIndex].step})`);
  }
});

test('M201/F: bez dostępnej many oferty NIE ma (to jedyny powód braku okna)', () => {
  const state = stateAtStep('p2', POSTCOMBAT_MAIN, 'p1');
  put(state, 'skel', 'reassembling-skeleton', 'p1', 'graveyard');
  put(state, 'sw1', 'basic-swamp', 'p1', 'battlefield', { tapped: true });
  put(state, 'sw2', 'basic-swamp', 'p1', 'battlefield', { tapped: true });
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'skel');
  assert.equal(offers.length, 0, 'tapnięte lądy = brak many = brak legalnej aktywacji (CR 602.2a)');
});

test('M201/F: auto-pass sesji NIE przewija okna z reanimacją w turze bota', () => {
  // Sesja zatrzymuje się na pierwszym oknie z realną decyzją — okno w turze
  // przeciwnika musi być jednym z nich (hasMeaningfulDecision).
  const human = [...Array(12).fill('basic-swamp'), ...Array(8).fill('reassembling-skeleton')];
  const bot = [...Array(12).fill('basic-mountain'), ...Array(8).fill('goblin-piker')];
  const decks = new Map([[HUMAN_ID, human], [BOT_ID, bot]]);
  const session = createSession({ seed: 3, registry: REGISTRY, decks, pauseOnBotMoves: false });
  let sawBotTurnOffer = false;
  let sawGraveSkeleton = false;
  let castsLeft = 1;
  for (let i = 0; i < 400 && session.state.status === 'active'; i += 1) {
    const view = session.view();
    const grave = view.zones.graveyard.filter((o) => o.cardId === 'reassembling-skeleton' && o.controllerId === HUMAN_ID);
    if (grave.length > 0) sawGraveSkeleton = true;
    const offers = view.legalCommands.filter((c) => c.type === 'activate_ability');
    if (view.turn.activePlayerId === BOT_ID && offers.length > 0) sawBotTurnOffer = true;
    const cmds = view.legalCommands;
    const pick = cmds.find((c) => c.type === 'resolve_mulligan_choice' && c.keep)
      ?? cmds.find((c) => c.type === 'play_land')
      ?? cmds.find((c) => c.type === 'declare_blockers' && Object.keys(c.assignments ?? {}).length > 0)
      ?? (castsLeft > 0 ? cmds.find((c) => c.type === 'cast_permanent') : null)
      ?? cmds.find((c) => c.type === 'draw_card')
      ?? cmds.find((c) => c.type === 'pass_priority')
      ?? cmds[0];
    if (!pick) break;
    if (pick.type === 'cast_permanent') castsLeft -= 1;
    if (!session.apply(pick).ok) break;
    if (sawBotTurnOffer) break;
    if (view.turn.number > 12) break;
  }
  assert.equal(sawGraveSkeleton, true, 'scenariusz: szkielet trafił do grobu');
  assert.equal(sawBotTurnOffer, true,
    'gracz z niewykorzystaną maną dostaje okno reanimacji jeszcze w turze bota');
});

// ---------------------------------------------------------------------------
// M/M2 — Frightful Delusion („Counter target spell unless its controller pays
// {1}. That player discards a card.”). Cel = SPELL (CR 701.5a); zdolność
// aktywowana czarem nie jest i celem być nie może.
// ---------------------------------------------------------------------------

test('M201/M2: zdolność aktywowana na stosie NIE jest legalnym celem (oferta i walidacja)', () => {
  const state = stateAtStep('p1', 3); // precombat main, priorytet p1
  put(state, 'door', 'cellar-door', 'p1', 'battlefield', { summoningSickness: false });
  for (let i = 0; i < 4; i += 1) put(state, `sw${i}`, 'basic-swamp', 'p1', 'battlefield');
  put(state, 'fd', 'frightful-delusion', 'p2', 'hand');
  for (let i = 0; i < 4; i += 1) put(state, `is${i}`, 'basic-island', 'p2', 'battlefield');
  const activate = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'door');
  assert.ok(activate, 'Cellar Door aktywowalna');
  assert.equal(execute(state, activate).ok, true);
  const abilityId = state.zones.stack[0];
  assert.equal(state.objects.get(abilityId).kind, 'activated', 'na stosie zdolność, nie czar');
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);

  const offers = playerView(state, 'p2').legalCommands.filter((c) => c.type === 'cast_spell');
  assert.deepEqual(offers, [], 'brak legalnego celu (tylko zdolność na stosie) = brak oferty rzutu');
  const forced = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'fd', targets: [abilityId] });
  assert.equal(forced.ok, false, 'walidacja odrzuca zdolność jako cel „target spell” (CR 701.5a)');
});

test('M201/M: skontrowany czar ma NAZWĘ na stosie, nie „?” (LKI, CR 603.10)', () => {
  // Repro z sesji (seed 4, warhammer vs innistrad): bot kontruje czar gracza,
  // gracz nie ma many na {1} → cel jest kontrowany OD RAZU, a Frightful
  // Delusion zostaje na stosie (czeka na odrzucenie karty). Etykieta stosu
  // pytała o nazwę obiektu, którego już nie ma → „cel: ?”.
  const human = [...Array(8).fill('basic-swamp'), ...Array(8).fill('reassembling-skeleton')];
  const bot = [...Array(8).fill('basic-island'), ...Array(8).fill('frightful-delusion')];
  const decks = new Map([[HUMAN_ID, human], [BOT_ID, bot]]);
  const session = createSession({ seed: 4, registry: REGISTRY, decks, pauseOnBotMoves: false });
  const state = session.state;
  state.pendingMulligans = [];
  state.turn = { ...state.turn, ...TURN_STEPS[3], stepIndex: 3, activePlayerId: HUMAN_ID, priorityPlayerId: HUMAN_ID, passes: 0 };
  // Gracz: 2 lądy — wejdą w całości w koszt {1}{B}, więc na {1} kontry nie
  // zostanie mana (ścieżka „canPay === false”: kontra od razu + odrzucenie).
  for (let i = 0; i < 2; i += 1) put(state, `hsw${i}`, 'basic-swamp', HUMAN_ID, 'battlefield');
  put(state, 'giant', 'reassembling-skeleton', HUMAN_ID, 'hand');
  for (let i = 0; i < 4; i += 1) put(state, `bis${i}`, 'basic-island', BOT_ID, 'battlefield');
  put(state, 'delusion', 'frightful-delusion', BOT_ID, 'hand');

  const cast = playerView(state, HUMAN_ID).legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'giant');
  assert.ok(cast, 'czar-stwór rzucalny');
  assert.equal(execute(state, cast).ok, true);
  const spellId = state.zones.stack.find((id) => state.objects.get(id)?.cardId === 'reassembling-skeleton');
  assert.ok(spellId, 'czar-stwór na stosie');
  assert.equal(execute(state, { type: 'pass_priority', playerId: HUMAN_ID }).ok, true);
  const counter = playerView(state, BOT_ID).legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'delusion');
  assert.ok(counter, 'bot ma legalny cel: czar na stosie');
  assert.deepEqual(counter.targets, [spellId], 'celem jest CZAR (nie zdolność)');
  assert.equal(execute(state, counter).ok, true);
  // Kontra rozstrzyga się po passach obu graczy (CR 608): dopiero wtedy cel
  // opuszcza stos, a sam czar-kontra ZOSTAJE (czeka na odrzucenie karty).
  for (let i = 0; i < 4 && state.objects.get(spellId); i += 1) {
    const prio = state.turn.priorityPlayerId;
    const pass = playerView(state, prio).legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    assert.equal(execute(state, pass).ok, true);
  }

  assert.equal(state.objects.get(spellId), undefined, 'cel został skontrowany (opuścił stos)');
  const delusionOnStack = state.zones.stack.map((id) => state.objects.get(id))
    .find((o) => o?.cardId === 'frightful-delusion');
  assert.ok(delusionOnStack, 'czar-kontra zostaje na stosie do czasu odrzucenia karty');
  assert.equal(session.nameOfObject(spellId), 'Reassembling Skeleton',
    'CR 603.10 (LKI): etykieta celu musi nazwać obiekt, który opuścił strefę — nie „?”');
});

test('M201/M: anty-over-fix — nieznany identyfikator nadal daje „?”', () => {
  const decks = new Map([
    [HUMAN_ID, [...Array(8).fill('basic-swamp'), ...Array(8).fill('hill-giant')]],
    [BOT_ID, [...Array(8).fill('basic-island'), ...Array(8).fill('frightful-delusion')]],
  ]);
  const session = createSession({ seed: 4, registry: REGISTRY, decks, pauseOnBotMoves: false });
  assert.equal(session.nameOfObject('nie-ma-takiego-obiektu'), '?');
});
