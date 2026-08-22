// M187 — naprawy znalezisk audytu PR #69 (M171–M186).
// Każdy test odtwarza błąd znaleziony w audycie (RED przed naprawą).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createBattlefieldToken } from '../src/engine/tokens.js';
import { clearStatModifiers } from '../src/engine/permanents.js';
import { legalBlockerOptions } from '../src/engine/combat.js';
import { jumpToStep } from '../src/engine/turn.js';
import { applyEffect } from '../src/engine/effects.js';
import { addMana } from '../src/engine/resources.js';
import { processTriggers } from '../src/engine/triggers.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

function mite(state, controllerId = 'p1') {
  // Token Phyrexian Mite (Crawling Chorus): „This token can't block\" to
  // WYDRUKOWANA cecha tokenu, nie efekt „until end of turn\".
  return createBattlefieldToken(state, controllerId, {
    cardId: 'token_phyrexian_mite', name: 'Phyrexian Mite', kind: 'creature',
    power: 1, toughness: 1, colors: [], types: ['Artifact', 'Creature'],
    subtypes: ['Phyrexian', 'Mite'], keywords: ['toxic'], toxic: 1, cantBlock: true,
  });
}

// ---- N1: „can't block\" tokenu jest TRWAŁE, cleanup go nie zdejmuje --------

test('M187/N1a: token z wydrukowanym „can\'t block\" zachowuje je po cleanup końca tury', () => {
  const state = game('p1');
  const token = mite(state);
  assert.equal(state.objects.get(token.id).cantBlock, true, 'token startuje z can\'t block');
  clearStatModifiers(state, 'p1');
  assert.equal(state.objects.get(token.id).cantBlock, true,
    'cleanup NIE zdejmuje wydrukowanej cechy tokenu (CR 514.2 dotyczy efektów „until end of turn\")');
});

test('M187/N1b: efekt „can\'t block this turn\" nadal wygasa w cleanup', () => {
  const state = game('p1');
  putCard(state, 'target', 'highland-game', 'p2', 'battlefield', { summoningSickness: false });
  const source = putCard(state, 'src', 'ghost-warden', 'p1', 'battlefield', { summoningSickness: false });
  applyEffect(state, { type: 'cant_block' }, source, ['target']);
  assert.equal(state.objects.get('target').cantBlock, true, 'efekt nałożony');
  clearStatModifiers(state, 'p2');
  assert.equal(state.objects.get('target').cantBlock, false,
    'efekt „do końca tury\" wygasa w cleanup (Panic Spellbomb bez regresji)');
});

test('M187/N1c: token Mite nie jest oferowany jako bloker w NASTĘPNEJ turze', () => {
  const state = game('p2');
  const token = mite(state, 'p1');
  // Symulacja przełomu tury: cleanup, potem atak przeciwnika w kolejnej turze.
  clearStatModifiers(state, 'p1');
  state.objects.set(token.id, Object.freeze({ ...state.objects.get(token.id), summoningSickness: false }));
  putCard(state, 'atk', 'highland-game', 'p2', 'battlefield', { summoningSickness: false });
  state.combat = { attackers: ['atk'], assignments: {}, defendingPlayerId: 'p1' };
  const options = legalBlockerOptions(state, 'p1');
  const blocks = options.filter((assignment) => (assignment.atk ?? []).includes(token.id));
  assert.equal(blocks.length, 0,
    'token z „can\'t block\" nie może zostać zaoferowany jako bloker po przełomie tury');
});

test('M187/N1d: widok gracza niesie can\'t block tokenu po cleanup (badge na kaflu)', () => {
  const state = game('p1');
  const token = mite(state);
  clearStatModifiers(state, 'p1');
  const view = playerView(state, 'p1');
  const entry = (view.zones.battlefield ?? []).find((o) => o.id === token.id);
  assert.ok(entry, 'token w widoku');
  assert.equal(entry.cantBlock, true, 'flaga jedzie do widoku (badge „nie może blokować\")');
});

test('M187/N1f: token z „can\'t block\" + pump — cleanup zdejmuje pump, zakaz zostaje', () => {
  const state = game('p1');
  const token = mite(state);
  // Pump „do końca tury\" sprawia, że obiekt jest „brudny\" dla cleanupu —
  // to właśnie ta ścieżka kasowała wydrukowaną cechę razem z modyfikatorami.
  state.objects.set(token.id, Object.freeze({ ...state.objects.get(token.id), powerModifier: 2 }));
  clearStatModifiers(state, 'p1');
  const after = state.objects.get(token.id);
  assert.equal(after.powerModifier, 0, 'pump wygasł (kontrola: cleanup działa)');
  assert.equal(after.cantBlockPrinted, true, 'wydrukowana cecha nietknięta');
  assert.equal(after.cantBlock, true, 'odczyt zakazu spójny po cleanup');
});

test('M187/N1e: Crawling Chorus — Mite z realnego triggera dies przeżywa cleanup', () => {
  const state = game('p1');
  putCard(state, 'chorus', 'crawling-chorus', 'p1');
  const before = state.events.length;
  applyEffect(state, { type: 'destroy_permanent' }, state.objects.get('chorus'), ['chorus']);
  processTriggers(state, state.events.slice(before));
  for (let i = 0; i < 14 && state.zones.stack.length > 0; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  const token = [...state.objects.values()].find((o) => o.cardId === 'token_phyrexian_mite' && o.zone === 'battlefield');
  assert.ok(token, 'token Mite powstał');
  clearStatModifiers(state, 'p1');
  const after = state.objects.get(token.id);
  assert.equal(after.cantBlock, true, 'Mite nadal nie może blokować');
  assert.equal(after.toxic, 1, 'toxic 1 nietknięte (kontrola: cleanup nie rusza wydrukowanych cech)');
});

// ---- N2: luka pokrycia z weryfikacji mutacyjnej (ADR 0020 B) --------------
// Frightful Delusion ma TRZY gałęzie: zapłata, odmowa i AUTO-KONTRA bez many
// na opłatę. Testy B44/13 pokrywały dwie pierwsze — mutacja `canPay = true`
// (silnik zawsze pyta o opłatę, także gracza bez many) NIE czerwieniła pakietu,
// więc gałąź bez many nie miała strażnika (L13: mutacja mierzy test, nie kod).
test('M187/N2: counter_spell_unless_pays — bez many na opłatę czar kontrowany BEZ decyzji', () => {
  const state = game('p2');
  putCard(state, 'their-spell', 'fleeting-distraction', 'p2', 'hand');
  putCard(state, 'their-target', 'highland-game', 'p1');
  putCard(state, 'their-extra', 'alaborn-trooper', 'p2', 'hand');
  // BEZ źródła many u p2 — nie ma z czego zapłacić {1}.
  putCard(state, 'fd', 'frightful-delusion', 'p1', 'hand');
  addMana(state, 'p2', 1, { colors: ['U'] });
  addMana(state, 'p1', 3, { colors: ['U'] });
  const cast = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'their-spell');
  assert.ok(cast, 'przeciwnik rzuca czar');
  assert.ok(execute(state, { ...cast, targets: ['their-target'] }).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok);
  const stackId = state.zones.stack[state.zones.stack.length - 1];
  const counterCast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'fd');
  assert.ok(counterCast, 'oferta kontrczaru');
  assert.ok(execute(state, { ...counterCast, targets: [stackId] }).ok);
  for (let i = 0; i < 6 && state.zones.stack.length > 0 && !state.pendingDiscardChoice; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  assert.ok(!state.pendingCounterPay,
    'gracz bez many nie dostaje pustej decyzji „zapłać\" (mutacja canPay=true czerwieni ten test)');
  assert.ok(state.events.some((e) => e.type === 'spell_countered'),
    'czar skontrowany od razu (CR 601.2h — nie ma z czego zapłacić)');
  assert.ok(state.pendingDiscardChoice, '„That player discards a card\" nadal następuje');
});
