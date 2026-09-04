// Audyt PR #94 (2026-09-03), znalezisko K1 — klasa otwarta przez fix F:
// okno darmowego rzutu z grobu (Halo Forager, M174/M203) dostało tryby
// z celami zmiennymi (`variableTargets`), ale NIE dostało łańcucha, który
// przenosi wybór celu pod stun counter (`stunAmongTargets`). Okno Vaana
// dostało ten łańcuch w tym samym PR (`pushExileCast` niesie `stunTargetId`);
// okno grobu — nie. Skutki sprzed naprawy: (1) push oferty gubi
// `stunTargetId` → w panelu wielokrotne identyczne przyciski; (2) `execute`
// woła `validateVariableTargets` bez stun celu → każdy wariant z ≥1 celem
// odrzucony (martwe przyciski — L48); (3) obiekt stosu nie dostaje
// `modeExtra` → efekt `add_counter applyTo 'extra:stunTargetId'` nie miałby
// czego czytać; (4) etykieta nie zna nazwy trybu (M91/uwaga D).
//
// Repro na realnych kartach: Aerith Rescue Mission (MV 4, tryb „Schody”:
// „Tap up to three target creatures. Put a stun counter on one of them.”,
// talia `final-fantasy`) w DOWOLNYM cmentarzu + Halo Forager (talia
// `worek-basni`). Oracle ARM nie pozwala pominąć stun countera przy ≥1 celu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { commandLabel } from '../src/table/render.js';

const REGISTRY = createCardRegistry();
const MODAL_STUN = 'aerith-rescue-mission'; // tryb 1: variableTargets + stunAmongTargets

function game(playerId = 'p1') {
  const state = createGameState({ seed: 94, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function put(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

function addSimpleCreature(state, id, controllerId, { power = 2, toughness = 2 } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}

function graveState(cardId, { graveOwner = 'p2', mana = 10 } = {}) {
  const state = game('p1');
  addMana(state, 'p1', mana, { colors: ['W', 'U', 'B', 'R', 'G'] });
  addSimpleCreature(state, 'mine', 'p1');
  addSimpleCreature(state, 'foe1', 'p2');
  addSimpleCreature(state, 'foe2', 'p2');
  put(state, 'grave', cardId, graveOwner, 'graveyard');
  state.pendingGraveFreeCast = { playerId: 'p1', sourceCardId: 'halo-forager' };
  return state;
}

const graveCasts = (state) => playerView(state, 'p1').legalCommands
  .filter((c) => c.type === 'resolve_grave_free_cast' && !c.decline);

function resolveStack(state, limit = 40) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    const r = execute(state, pass);
    if (!r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '')) break;
  }
  return state;
}

/** Etykieta bez znaczników HTML. */
const plain = (html) => String(html).replace(/<[^>]*>/g, '');

function tableSession(state) {
  const view = playerView(state, 'p1');
  return {
    view: () => view,
    nameOf: (id) => REGISTRY.get(id)?.name ?? id,
    nameOfObject: (id) => id,
    cardDetails: (id) => REGISTRY.get(id) ?? null,
    colorsOf: (id) => REGISTRY.get(id)?.colors ?? [],
    abilitiesOf: (id) => REGISTRY.get(id)?.abilities ?? [],
    log: [], reasoning: [], state: { seed: 1 },
  };
}

test('A94/K1: grób — tryb ze stunem: wariant z celami niesie wybór celu pod stun', () => {
  const state = graveState(MODAL_STUN);
  const modeB = graveCasts(state).filter((c) => c.modeIndex === 1 && (c.targets ?? []).length > 0);
  assert.ok(modeB.length > 0, 'tryb „Schody” jest w ofercie (fix F: variableTargets w oknie grobu)');
  for (const offer of modeB) {
    assert.ok(offer.stunTargetId != null,
      'wariant niesie wybór stun celu — inaczej panel pokazuje N identycznych przycisków');
    assert.ok(offer.targets.includes(offer.stunTargetId),
      'stun cel jest jednym z celowanych stworów (CR 601.2c)');
  }
  const payloads = graveCasts(state).map((c) => JSON.stringify(c));
  assert.equal(new Set(payloads).size, payloads.length, 'oferta nie zawiera duplikatów komend');
});

test('A94/K1: grób — L48: KAŻDA oferta okna wykonuje się bez odrzucenia', () => {
  const template = graveState(MODAL_STUN);
  const offers = graveCasts(template);
  assert.ok(offers.length > 5, `wariantów jest kilka (jest ${offers.length})`);
  for (const offer of offers) {
    const state = graveState(MODAL_STUN);
    const r = execute(state, offer);
    assert.ok(r.ok,
      `wariant [tryb ${offer.modeIndex}, cele: ${(offer.targets ?? []).join(' ')}, `
      + `stun: ${offer.stunTargetId ?? '-'}] odrzucony (${r.events[0]?.reason ?? ''}) — `
      + 'oferta obiecuje ruch, którego wykonanie nie przyjmuje');
  }
});

test('A94/K1: grób — rozstrzygnięcie: cele stępione, stun counter na WYBRANYM celu', () => {
  const state = graveState(MODAL_STUN);
  const cast = graveCasts(state).find((c) => c.modeIndex === 1
    && (c.targets ?? []).length === 2 && c.stunTargetId === 'foe1'
    && c.targets.includes('foe1') && c.targets.includes('foe2'));
  assert.ok(cast, 'wariant z dwoma wrogimi stworami i stunem na foe1');
  const manaBefore = state.players.find((p) => p.id === 'p1').mana;
  const r = execute(state, cast);
  assert.ok(r.ok, `rzut przyjęty (${r.events[0]?.reason ?? ''})`);
  assert.equal(manaBefore - state.players.find((p) => p.id === 'p1').mana, 4, 'płacimy {X} = MV (4)');
  const stacked = [...state.objects.values()].find((o) => o.zone === 'stack' && o.cardId === MODAL_STUN);
  assert.equal(stacked.chosenMode, 1, 'wybrany tryb jedzie na stos');
  assert.deepEqual(stacked.modeExtra, { stunTargetId: 'foe1' },
    'wybór stun celu jedzie na stos (resolveModalEffectTargets czyta modeExtra)');
  resolveStack(state);
  for (const id of ['foe1', 'foe2']) {
    assert.ok(state.objects.get(id).tapped, `${id} stępiony (tap)`);
  }
  assert.ok((state.objects.get('foe1').counters?.stun ?? 0) > 0, 'foe1 dostaje licznik stun');
  assert.equal(state.objects.get('foe2').counters?.stun ?? 0, 0, 'foe2 bez licznika');
  assert.equal(state.objects.get('mine').tapped ?? false, false, 'własny stwór nie jest celem');
});

test('A94/K1: grób — etykieta nazywa TRYB (M91/uwaga D): „Winda” i puste „Schody” rozróżnialne', () => {
  const state = graveState(MODAL_STUN);
  const offers = graveCasts(state);
  const modeA = offers.find((c) => c.modeIndex === 0);
  const modeBEmpty = offers.find((c) => c.modeIndex === 1 && (c.targets ?? []).length === 0);
  assert.ok(modeA && modeBEmpty, 'oba warianty bez celów są w ofercie');
  const session = tableSession(state);
  const labelA = plain(commandLabel(modeA, session, session.view()));
  const labelB = plain(commandLabel(modeBEmpty, session, session.view()));
  assert.notEqual(labelA, labelB, `etykiety muszą się różnić: „${labelA}” vs „${labelB}”`);
  for (const mode of REGISTRY.get(MODAL_STUN).spell.modes) {
    const cmd = offers.find((c) => c.modeIndex === REGISTRY.get(MODAL_STUN).spell.modes.indexOf(mode));
    assert.ok(plain(commandLabel(cmd, session, session.view())).includes(mode.name),
      `etykieta nazywa tryb „${mode.name}”`);
  }
});

test('A94/K2: etykieta cast_spell nazywa cel pod stun (warianty o różnych skutkach rozróżnialne)', () => {
  const state = game('p1');
  addMana(state, 'p1', 10, { colors: ['W', 'U', 'B', 'R', 'G'] });
  addSimpleCreature(state, 'foe1', 'p2');
  addSimpleCreature(state, 'foe2', 'p2');
  put(state, 'arm', MODAL_STUN, 'p1', 'hand');
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'arm' && c.modeIndex === 1
      && (c.targets ?? []).length === 2);
  assert.equal(offers.length, 2, 'dwa warianty tych samych celów — różnią się celem pod stun');
  assert.notEqual(offers[0].stunTargetId, offers[1].stunTargetId, 'każdy wariant wskazuje inny stun cel');
  const session = tableSession(state);
  const labels = offers.map((cmd) => plain(commandLabel(cmd, session, session.view())));
  assert.notEqual(labels[0], labels[1], `etykiety muszą się różnić: „${labels[0]}”`);
  for (const [i, cmd] of offers.entries()) {
    assert.ok(labels[i].includes(cmd.stunTargetId),
      `etykieta nazywa stun cel (${cmd.stunTargetId}): „${labels[i]}”`);
  }
});

test('A94/K2: etykieta okna Vaana nazywa cel pod stun (ta sama klasa M91)', () => {
  const state = game('p1');
  addMana(state, 'p1', 10, { colors: ['W', 'U', 'B', 'R', 'G'] });
  addSimpleCreature(state, 'foe1', 'p2');
  addSimpleCreature(state, 'foe2', 'p2');
  put(state, 'stolen', MODAL_STUN, 'p2', 'exile');
  state.pendingExileCast = {
    playerId: 'p1', objectId: 'stolen', cardId: MODAL_STUN, sourceId: 'vaan',
    restorePriorityTo: 'p1',
  };
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'resolve_exile_cast' && c.cast === true && c.modeIndex === 1
      && (c.targets ?? []).length === 2);
  assert.equal(offers.length, 2, 'dwa warianty tych samych celów — różnią się celem pod stun');
  const session = tableSession(state);
  const labels = offers.map((cmd) => plain(commandLabel(cmd, session, session.view())));
  assert.notEqual(labels[0], labels[1], `etykiety muszą się różnić: „${labels[0]}”`);
  for (const [i, cmd] of offers.entries()) {
    assert.ok(labels[i].includes(cmd.stunTargetId),
      `etykieta nazywa stun cel (${cmd.stunTargetId}): „${labels[i]}”`);
  }
});

test('A94/K1: strażnik klasy — każdy modal ze stunAmongTargets: oferta z grobu kompletna i wykonalna', () => {
  const stunCards = REGISTRY.all().filter((card) => (card.spell?.modes ?? [])
    .some((mode) => mode.variableTargets && mode.stunAmongTargets));
  assert.ok(stunCards.length >= 1, `katalog ma modalne czary ze stunem (znaleziono ${stunCards.length})`);
  for (const card of stunCards) {
    const state = graveState(card.id, { mana: 16 });
    const offers = graveCasts(state);
    const stunModeIndexes = card.spell.modes
      .map((mode, index) => ({ mode, index }))
      .filter(({ mode }) => mode.variableTargets && mode.stunAmongTargets)
      .map(({ index }) => index);
    for (const modeIndex of stunModeIndexes) {
      const withTargets = offers.filter((c) => c.modeIndex === modeIndex && (c.targets ?? []).length > 0);
      assert.ok(withTargets.length > 0, `${card.id}: tryb ${modeIndex} ma warianty z celami`);
      for (const offer of withTargets) {
        assert.ok(offer.targets.includes(offer.stunTargetId),
          `${card.id}: stun cel ∈ cele (tryb ${modeIndex})`);
        const fresh = graveState(card.id, { mana: 16 });
        const r = execute(fresh, offer);
        assert.ok(r.ok, `${card.id}: wariant trybu ${modeIndex} wykonalny (${r.events[0]?.reason ?? ''})`);
      }
    }
  }
});
