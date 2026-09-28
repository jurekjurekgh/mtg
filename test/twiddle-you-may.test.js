// F7/PR140 (2026-09-28): korekta Oracle — Twiddle NIE jest modalny.
// Poniższa historia Fix A dotyczy wcześniejszej reprezentacji; piny
// zachowują odmowę/wznowienie, ale tap/untap wybierają przy rozstrzyganiu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { commandLabel } from '../src/table/render.js';
import { COMMAND_TYPES } from '../src/protocol/types.js';

/**
 * Fix A (2026-09-27): „you may ... target" bez decline.
 *
 * Zgłoszenie dotyczyło Battle-Rattle Shamana, ale ścieżka triggerów mayFire
 * okazała się naprawiona już w E (2026-09-25g) — właściciel grał na starym
 * buildzie. Audyt klasy znalazł PRAWDZIWĄ dziurę: Twiddle („You may tap or
 * untap target artifact, creature, or land") gubił „you may" po cichu —
 * tryb wybierany przy rzuceniu wykonywał się przy rozstrzygnięciu ZAWSZE.
 *
 * Naprawa: generyczny `may` na efekcie czaru (trybów też) — pytanie Tak/Nie
 * PRZED zastosowaniem efektu (queueOptionalSpellEffect, decyzja
 * resolve_optional_spell_effect, wznowienie resumeSuspendedSpell).
 */

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function putCard(state, id, cardId, controllerId = 'p1', zone = 'battlefield') {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  return addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone, ...data,
  });
}

function castTwiddle(state, targetId = 'cel') {
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell'
    && c.objectId === 'tw' && c.modeIndex == null && (c.targets ?? [])[0] === targetId);
  assert.ok(cast, `niemodalna oferta z celem ${targetId}`);
  assert.ok(execute(state, cast).ok, 'rzut Twiddle');
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, 'pass p1');
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, 'pass p2');
  assert.ok(state.pendingOptionalSpellEffect, 'rozstrzygnięcie pyta o „you may"');
}

function answerMay(state, playerId, apply) {
  const cmd = playerView(state, playerId).legalCommands.find((c) =>
    c.type === 'resolve_optional_spell_effect' && c.apply === apply);
  assert.ok(cmd, `oferta ${apply ? 'Tak' : 'Nie'}`);
  const r = execute(state, cmd);
  assert.ok(r.ok, `decyzja may (${r.reason ?? 'ok'})`);
}

function twiddleTable(tappedCel = false) {
  const state = newState();
  putCard(state, 'cel', 'highland-game', 'p2', 'battlefield');
  if (tappedCel) {
    state.objects.set('cel', Object.freeze({ ...state.objects.get('cel'), tapped: true }));
  }
  putCard(state, 'tw', 'twiddle', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['U'] });
  return state;
}

test('FixA-T0: Szaman (beginning_of_combat) — decline przy celu działa (pin zgłoszenia)', () => {
  const state = newState();
  putCard(state, 'shaman', 'battle-rattle-shaman', 'p1', 'battlefield');
  putCard(state, 'cel', 'highland-game', 'p1', 'battlefield');
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, 'pass p1');
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, 'pass p2');
  assert.equal(state.turn.step, 'beginning_of_combat');
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(offers.some((c) => c.targetId == null), 'oferta decline (targetId null)');
  const decline = offers.find((c) => c.targetId == null);
  assert.ok(execute(state, decline).ok, 'odmowa przy celu');
  assert.equal(state.zones.stack.length, 0, 'skrót E: trigger nie idzie na stos');
});

test('FixA-T1: Twiddle tap + Nie — cel nietknięty, czar w grobie, bez trybu w logu', () => {
  const state = twiddleTable();
  castTwiddle(state);
  answerMay(state, 'p1', false);
  assert.equal(state.objects.get('cel').tapped, false, 'odmowa = brak tapnięcia');
  assert.equal(state.zones.stack.length, 0, 'stos pusty po decyzji');
  const resolved = state.events.find((e) => e.type === 'spell_resolved');
  assert.ok(resolved && resolved.modal !== true, 'niemodalny spell_resolved po wznowieniu');
  assert.equal(resolved.modeName ?? null, null, 'brak fikcyjnego trybu');
  const grave = state.zones.graveyard.map((id) => state.objects.get(id)?.cardId);
  assert.ok(grave.includes('twiddle'), 'Twiddle w grobie');
});

test('FixA-T2: Twiddle tap + Tak — cel tapnięty', () => {
  const state = twiddleTable();
  castTwiddle(state);
  answerMay(state, 'p1', true);
  assert.equal(state.objects.get('cel').tapped, true);
  assert.equal(state.zones.stack.length, 0);
});

test('FixA-T3: Twiddle untap + Tak — cel odkręcony', () => {
  const state = twiddleTable(true);
  castTwiddle(state);
  answerMay(state, 'p1', true);
  assert.equal(state.objects.get('cel').tapped, false);
  const resolved = state.events.find((e) => e.type === 'spell_resolved');
  assert.ok(resolved && resolved.modal !== true);
  assert.equal(state.events.find((e) => e.type === 'optional_spell_effect_resolved').effectType, 'untap_permanent');
});

test('FixA-T4: Twiddle fizzle (cel nielegalny) — brak pytania „you may"', () => {
  const state = twiddleTable();
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell'
    && c.objectId === 'tw' && c.modeIndex == null && (c.targets ?? [])[0] === 'cel');
  assert.ok(cast, 'oferta rzutu');
  execute(state, cast);
  // Cel znika w odpowiedzi (strefa grobu) — przy rozstrzygnięciu nielegalny.
  const cel = state.objects.get('cel');
  state.objects.set('cel', Object.freeze({ ...cel, zone: 'graveyard' }));
  state.zones.battlefield = state.zones.battlefield.filter((id) => id !== 'cel');
  state.zones.graveyard = [...state.zones.graveyard, 'cel'];
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(state.pendingOptionalSpellEffect, null, 'fizzle nie pyta o may');
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'resolve_optional_spell_effect');
  assert.equal(offers.length, 0, 'brak ofert may po fizzlu');
  const resolved = state.events.find((e) => e.type === 'spell_resolved');
  assert.equal(resolved?.fizzled, true);
});

test('FixA-T5: etykiety decyzji may — Tak nazywa czynność i cel, Nie to odmowa', () => {
  const view = {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Wróg' }],
    zones: {
      hand: [], stack: [], graveyard: [], exile: [], library: [],
      battlefield: [{ id: 'cel', cardId: 'highland-game', controllerId: 'p2' }],
    },
    legalCommands: [],
    turn: { number: 1, phase: 'main', step: 'main1', activePlayerId: 'p1' },
    pendingOptionalSpellEffect: {
      playerId: 'p1', sourceCardId: 'twiddle', effectType: 'tap_permanent', targetIds: ['cel'],
    },
  };
  const session = { nameOf: (c) => `N(${c})` };
  const yes = commandLabel(
    { type: 'resolve_optional_spell_effect', playerId: 'p1', apply: true, effectType: 'tap_permanent', targetId: 'cel', sourceCardId: 'twiddle' },
    session, view);
  assert.equal(yes, 'N(twiddle) — tapnij: N(highland-game) („you may")');
  const no = commandLabel(
    { type: 'resolve_optional_spell_effect', playerId: 'p1', apply: false, effectType: 'tap_permanent', targetId: 'cel', sourceCardId: 'twiddle' },
    session, view);
  assert.equal(no, 'N(twiddle) — nie rób nic (odmowa — „you may")');
});

test('FixA-T6: bot — tapnij wrogi / odkręć własny, reszta to odmowa', () => {
  const decide = (celController, tapped) => {
    const state = newState();
    putCard(state, 'cel', 'highland-game', celController, 'battlefield');
    if (tapped) state.objects.set('cel', Object.freeze({ ...state.objects.get('cel'), tapped: true }));
    putCard(state, 'tw', 'twiddle', 'p1', 'hand');
    addMana(state, 'p1', 1, { colors: ['U'] });
    castTwiddle(state);
    return createHeuristicBot({ seed: 7 }).chooseCommand(playerView(state, 'p1'), {});
  };
  assert.equal(decide('p2', false)?.apply, true, 'tap wrogiego: Tak');
  assert.equal(decide('p1', false)?.apply, false, 'tap własnego: Nie');
  assert.equal(decide('p1', true)?.apply, true, 'untap własnego tapniętego: Tak');
  assert.equal(decide('p2', true)?.apply, false, 'untap wrogiego: Nie');
});

test('FixA-T7: generyczny may działa też niemodalnie (syntetyczny czar na stosie)', () => {
  const state = newState();
  putCard(state, 'cel', 'highland-game', 'p2', 'battlefield');
  addObject(state, {
    id: 'stack-spell', instanceId: 'i-stack-spell', cardId: 'test-optional-tap',
    controllerId: 'p1', ownerId: 'p1', zone: 'stack', kind: 'spell', colors: ['U'],
    spell: {
      timing: 'instant',
      targets: [{ type: 'creature' }],
      effects: [{ type: 'tap_permanent', may: true }],
    },
    // chosenTargets doklejamy po addObject (kontrakt L21 ucina je przy dodaniu).
  });
  state.objects.set('stack-spell',
    Object.freeze({ ...state.objects.get('stack-spell'), chosenTargets: ['cel'] }));
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(state.pendingOptionalSpellEffect, 'niemodalny may też pyta');
  assert.equal(state.pendingOptionalSpellEffect.modeIndex, null);
  answerMay(state, 'p1', true);
  assert.equal(state.objects.get('cel').tapped, true, 'Tak stosuje efekt');
  assert.equal(state.zones.stack.length, 0);
});

/**
 * Strażnik klasy „you may ... target" (zdanie Oracle z oboma): każda taka
 * karta ma jawną ścieżkę decline albo jest sklasyfikowanym wyjątkiem.
 * Nowa karta wpadająca w regex, a nie w poniższe gałęzie, wywala test —
 * to jest pin „żeby ta klasa już nigdy nie wróciła".
 */
test('FixA-T8: strażnik katalogu — każde „you may ... target" ma ścieżkę decline', () => {
  const hit = [];
  for (const card of REGISTRY.all()) {
    const sentences = (card.oracleText ?? '').split(/\n|\. /);
    if (!sentences.some((s) => /you may/i.test(s) && /target/i.test(s))) continue;
    const triggers = card.abilities ?? [];
    const mayTrigger = triggers.some((a) => a.trigger?.mayFire === true && a.trigger?.requiresTarget);
    if (mayTrigger) continue; // E: decline w modalu celu (allowNone).
    const spellMay = (card.spell?.effects ?? []).some((e) => e.may === true)
      || (card.spell?.modes ?? []).some((m) => (m.effects ?? []).some((e) => e.may === true));
    if (spellMay) continue; // Fix A: decline przy rozstrzygnięciu czaru.
    if (card.id === 'spreading-insurrection') {
      // „You may choose new targets for the copies" (storm) — wybór celów
      // kopii, nie odmowa efektu; decyzja istnieje w silniku.
      assert.equal(card.spell?.storm, true, 'storm w definicji');
      assert.ok(COMMAND_TYPES.includes('resolve_copy_targets'), 'decyzja celów kopii');
      continue;
    }
    if (card.id === 'halo-forager') {
      // „When you do, you may cast target ..." — wolny rzut z grobu z odmową.
      const types = triggers.flatMap((a) => (Array.isArray(a.effect) ? a.effect : [a.effect]).map((e) => e?.type));
      assert.ok(types.includes('pay_x_cast_from_graveyard'), 'efekt wolnego rzutu');
      assert.ok(COMMAND_TYPES.includes('resolve_grave_free_cast'), 'decyzja rzutu z odmową');
      continue;
    }
    if (card.id === 'cherished-hatchling') {
      // „you may cast ... as though they had flash" (pozwolenie) + OBOWIĄZKOWY
      // fight przy ETB (cel bez „may" — poprawnie bez decline).
      const types = triggers.flatMap((a) => (Array.isArray(a.effect) ? a.effect : [a.effect]).map((e) => e?.type));
      assert.ok(types.includes('subtype_spells_gain_flash_and_etb_fight_this_turn'), 'efekt pozwolenia');
      continue;
    }
    hit.push(card.id);
  }
  assert.deepEqual(hit, [], `niesklasyfikowane „you may ... target": ${hit.join(', ')}`);
});
