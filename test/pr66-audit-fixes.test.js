// M159 — audyt PR #66: naprawy F1–F4 (RED→GREEN).
//
// F1: Madness (CR 702.34e) — rzut za koszt madness następuje przy
//     rozstrzyganiu i IGNORUJE timing; bramka „Zagranie poza main phase"
//     odrzucała rzut po odrzuceniu w cleanup (limit ręki — najczęstsza
//     realna ścieżka madness) i w turze przeciwnika, a heuristic-bot
//     zawsze wybierał cast:true → crash sesji „Bot wybrał nielegalną komendę".
// F2: oferta cast:true bez walidacji płatności (L48 oferta=walidacja).
// F3: cel ETB Revolutionista jest OBOWIĄZKOWY („return target...", bez
//     „you may") — `optional: true` pozwalał legalnie odmówić (ADR 0022).
// F4: oferty madness bez cardId/objectId → etykieta „Rzuć za koszt
//     madness: ?" nie nazywała karty.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { commandLabel } from '../src/table/render.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 66, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId = 'p1', zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

function discardRevolutionist(state, objectId, purpose = 'effect', restoreTo = 'p1') {
  state.pendingDiscardChoice = {
    playerId: 'p1', count: 1, handIds: [objectId], purpose,
    sourceCardId: null, restorePriorityTo: restoreTo,
  };
  assert.ok(execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardId: objectId }).ok);
  assert.ok(state.pendingMadnessCast, 'decyzja madness otwarta');
}

// ---- F1: timing madness (CR 702.34e) ---------------------------------------

test('F1a: odrzucenie w CLEANUP (limit ręki) — rzut za madness JEST legalny', () => {
  const state = game();
  putCard(state, 'rev', 'revolutionist', 'p1', 'hand');
  state.turn = jumpToStep(state.turn, 'end', 'p1');
  state.turn.step = 'cleanup';
  state.turn.phase = 'ending';
  discardRevolutionist(state, 'rev', 'cleanup');
  addMana(state, 'p1', 4, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_madness_cast' && c.cast);
  assert.ok(cast, 'oferta rzutu za madness w cleanup');
  const result = execute(state, cast);
  assert.ok(result.ok, `rzut za madness w cleanup zaakceptowany (CR 702.34e), a był: ${result.events?.[0]?.reason}`);
  const onStack = [...state.objects.values()].find((o) => o.cardId === 'revolutionist' && o.zone === 'stack');
  assert.ok(onStack, 'czar madness na stosie');
});

test('F1b: odrzucenie w TURZE PRZECIWNIKA — rzut za madness legalny i rozstrzyga się', () => {
  const state = game('p2');
  putCard(state, 'rev', 'revolutionist', 'p1', 'hand');
  discardRevolutionist(state, 'rev', 'effect', 'p2');
  addMana(state, 'p1', 4, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_madness_cast' && c.cast);
  assert.ok(cast, 'oferta rzutu za madness w turze przeciwnika');
  const result = execute(state, cast);
  assert.ok(result.ok, `rzut zaakceptowany, a był: ${result.events?.[0]?.reason}`);
  // Rozstrzygnięcie po rundzie passów — stwór wchodzi na pole bitwy.
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  const onBf = [...state.objects.values()].find((o) => o.cardId === 'revolutionist' && o.zone === 'battlefield');
  assert.ok(onBf, 'Revolutionist na polu bitwy po rozstrzygnięciu');
});

// ---- F2: oferta = walidacja (L48) ------------------------------------------

test('F2a: bez many — widok NIE oferuje cast:true (tylko rezygnację)', () => {
  const state = game();
  putCard(state, 'rev', 'revolutionist', 'p1', 'hand');
  discardRevolutionist(state, 'rev');
  const commands = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_madness_cast');
  assert.ok(!commands.some((c) => c.cast), 'brak oferty cast:true bez many');
  const decline = commands.find((c) => !c.cast);
  assert.ok(decline, 'rezygnacja oferowana');
  assert.ok(execute(state, decline).ok, 'rezygnacja działa');
});

test('F2b: mana jest, ale bez czerwonego źródła — brak oferty cast:true', () => {
  const state = game();
  putCard(state, 'rev', 'revolutionist', 'p1', 'hand');
  discardRevolutionist(state, 'rev');
  addMana(state, 'p1', 4, { colors: ['U'] });
  const commands = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_madness_cast');
  assert.ok(!commands.some((c) => c.cast), 'koszt {3}{R} wymaga czerwonego źródła');
});

test('F2c: strażnik oferta=walidacja — KAŻDA oferowana komenda madness przechodzi', () => {
  // Weryfikacja mutacyjna sensu strażnika: scenariusz z ofertą cast:true
  // (jest mana) — wszystkie oferty muszą być akceptowane przez execute.
  // Dwa niezależne przebiegi (execute mutuje stan) — po jednym na wariant.
  for (const wantCast of [true, false]) {
    const s = game();
    putCard(s, 'rev', 'revolutionist', 'p1', 'hand');
    s.turn = jumpToStep(s.turn, 'end', 'p1');
    s.turn.step = 'cleanup';
    s.turn.phase = 'ending';
    s.pendingDiscardChoice = { playerId: 'p1', count: 1, handIds: ['rev'], purpose: 'cleanup', sourceCardId: null, restorePriorityTo: 'p1' };
    execute(s, { type: 'resolve_discard_choice', playerId: 'p1', cardId: 'rev' });
    addMana(s, 'p1', 4, { colors: ['R'] });
    const offer = playerView(s, 'p1').legalCommands.find((c) => c.type === 'resolve_madness_cast' && Boolean(c.cast) === wantCast);
    assert.ok(offer, `oferta cast:${wantCast} istnieje`);
    const result = execute(s, offer);
    assert.ok(result.ok, `oferta cast:${wantCast} zaakceptowana (oferta=walidacja), a była: ${result.events?.[0]?.reason}`);
  }
});

// ---- F3: obowiązkowy cel ETB Revolutionista (ADR 0022) ----------------------

test('F3: ETB Revolutionista z legalnym celem w grobie — NIE można odmówić celu', () => {
  const state = game();
  putCard(state, 'gySpell', 'wrap-in-flames', 'p1', 'graveyard');
  // M242/H: z JEDNYM kandydatem cel wybrałby się automatycznie, zanim ktokolwiek
  // mógłby próbować odmówić — a tu testujemy regułę „odmowa odrzucana", więc
  // muszą istnieć DWA legalne cele (pytanie remains real).
  putCard(state, 'gySpell2', 'shatter', 'p1', 'graveyard');
  putCard(state, 'rev', 'revolutionist', 'p1', 'hand');
  addMana(state, 'p1', 6, { colors: ['R'] });
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'rev' }).ok);
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  const pending = state.pendingTriggerTargets[0];
  assert.ok(pending, 'trigger ETB czeka na cel');
  assert.equal(pending.allowNone, false, 'cel OBOWIĄZKOWY (Oracle: „return target...", bez „you may")');
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(!offers.some((c) => c.targetId == null), 'brak oferty „bez celu"');
  const declined = execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: null });
  assert.equal(declined.ok, false, 'odmowa obowiązkowego celu odrzucona');
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'gySpell' }).ok);
});

// ---- F4: etykieta oferty madness nazywa kartę -------------------------------

test('F4: oferty madness niosą cardId/objectId, a etykieta nazywa kartę', () => {
  const state = game();
  putCard(state, 'rev', 'revolutionist', 'p1', 'hand');
  discardRevolutionist(state, 'rev');
  addMana(state, 'p1', 4, { colors: ['R'] });
  const commands = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_madness_cast');
  for (const cmd of commands) {
    assert.equal(cmd.cardId, 'revolutionist', 'oferta niesie cardId');
    assert.ok(cmd.objectId, 'oferta niesie objectId (karta w exile)');
  }
  const cast = commands.find((c) => c.cast);
  assert.ok(cast, 'oferta rzutu');
  const exiled = [...state.objects.values()].find((o) => o.cardId === 'revolutionist' && o.zone === 'exile');
  const session = {
    nameOf: (id) => REGISTRY.get(id)?.name ?? id,
    nameOfObject: (id) => id,
    cardDetails: (id) => REGISTRY.get(id) ?? null,
    colorsOf: (id) => REGISTRY.get(id)?.colors ?? [],
    abilitiesOf: (id) => REGISTRY.get(id)?.abilities ?? [],
    log: [], reasoning: [], state: { seed: 1 },
  };
  const view = {
    status: 'active', winnerId: null, playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'On', life: 20 }],
    zones: {
      battlefield: [], hand: [], stack: [], graveyard: [], library: [],
      exile: [{ id: exiled.id, cardId: 'revolutionist', zone: 'exile', kind: 'creature', controllerId: 'p1' }],
    },
    turn: { number: 1, activePlayerId: 'p1', phase: 'precombat_main', step: 'precombat_main' },
    legalCommands: [],
  };
  const label = commandLabel(cast, session, view);
  assert.ok(label.includes('Revolutionist'), `etykieta nazywa kartę, a była: ${label}`);
});
