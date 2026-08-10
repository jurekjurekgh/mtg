import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeGameEvent, PLAYER_NAMES } from '../src/table/session.js';
import { commandLabel, choiceGroupTitle } from '../src/table/render.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import fs from 'node:fs';

// =============================================================================
// Uwagi właściciela 2026-08-10 (odznaka brązowa) — log gry i modale wyborów:
//  A. Expunge: „cant_be_regenerated_set" surowym typem, cel zniszczenia „?".
//  B/C. Modal celu triggera: opcje „resolve_trigger_target" bez nazw; modale
//      bez nazwy karty wywołującej (Etherwrought Page, Selhoff Occultist).
//  D. Cały strumień: „modal_trigger_required", „trigger celuje w ?".
// Testy behawioralne: syntetyczne zdarzenia/komendy → czytelne opisy.
// =============================================================================

const REGISTRY = createCardRegistry();
const helpers = {
  nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId ?? '?',
  nameOfObject: () => '?', // obiekt nieosiągalny — jak po zmianie strefy
  isPlayer: (id) => ['p1', 'p2'].includes(id),
};
const d = (e) => describeGameEvent(e, helpers, PLAYER_NAMES);

test('A/D: cant_be_regenerated_set ma opis z nazwą karty (nie surowy typ)', () => {
  const text = d({ type: 'cant_be_regenerated_set', objectId: 'x', cardId: 'cloudbound-moogle', untilEndOfTurn: true });
  assert.equal(text, 'Cloudbound Moogle nie może być regenerowany do końca tury');
});

test('A/D: permanent_destroyed bierze nazwę z cardId, gdy obiekt już zniknął (nie „?")', () => {
  const text = d({ type: 'permanent_destroyed', fromId: 'battle-9', objectId: 'graveyard-21', cardId: 'goblin-deathraiders', toZone: 'graveyard' });
  assert.equal(text, 'Goblin Deathraiders zostaje zniszczony');
});

test('A/D: permanent_destroyed do wygnania (licznik finality) mówi o exile', () => {
  const text = d({ type: 'permanent_destroyed', fromId: 'battle-9', objectId: 'exile-4', cardId: 'goblin-deathraiders', toZone: 'exile' });
  assert.match(text, /^Goblin Deathraiders zostaje zniszczony/);
  assert.match(text, /wygn/i);
});

test('D: modal_trigger_required nazywa kartę (Etherwrought Page), nie surowy typ', () => {
  const text = d({ type: 'modal_trigger_required', playerId: 'p2', sourceId: 'page', cardId: 'etherwrought-page', modeCount: 3 });
  assert.match(text, /Etherwrought Page/);
  assert.match(text, /tryb/i);
});

test('D: modal_trigger_resolved nazywa kartę i wybrany tryb', () => {
  const text = d({ type: 'modal_trigger_resolved', playerId: 'p2', sourceId: 'page', cardId: 'etherwrought-page', modeIndex: 0, modeName: 'Life Gain' });
  assert.match(text, /Etherwrought Page/);
  assert.match(text, /Life Gain/);
});

test('D: trigger_target_resolved z celem-GRACZEM imenuje gracza (nie „?") — Selhoff Occultist', () => {
  const text = d({ type: 'trigger_target_resolved', playerId: 'p2', sourceId: 'selhoff', cardId: 'selhoff-occultist', targetId: 'p1', noEffect: false, remaining: 0 });
  assert.equal(text, 'Selhoff Occultist — trigger celuje w Ty');
});

function fakeSession() {
  return {
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
    nameOfObject: (id) => `obj-${id}`,
    abilitiesOf: () => [],
  };
}

function viewWith(overrides = {}) {
  return {
    playerId: 'p1',
    status: 'active',
    zones: { hand: [], battlefield: [], stack: [], graveyard: [], library: [] },
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
    turn: { number: 5, step: 'upkeep' },
    ...overrides,
  };
}

test('B/C: etykieta opcji resolve_trigger_target niesie ŹRÓDŁO triggera i cel (nie typ komendy)', () => {
  const view = viewWith({
    pendingTriggerTarget: {
      playerId: 'p1', sourceId: 'selhoff', cardId: 'selhoff-occultist',
      allowNone: false, candidateIds: ['p1', 'p2'],
    },
  });
  const cmd = { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'p2' };
  const label = commandLabel(cmd, fakeSession(), view);
  assert.match(label, /Selhoff Occultist/, `bez nazwy źródła: ${label}`);
  assert.match(label, /Nieprzyjaciel/, `bez nazwy celu: ${label}`);
  assert.ok(!label.includes('resolve_trigger_target'), 'surowy typ komendy w etykiecie');
});

test('B/C: opcja odmowy triggera (allowNone, targetId null) nazywa źródło', () => {
  const view = viewWith({
    pendingTriggerTarget: {
      playerId: 'p1', sourceId: 'greatsword', cardId: 'greatsword-of-tyr',
      allowNone: true, candidateIds: [],
    },
  });
  const cmd = { type: 'resolve_trigger_target', playerId: 'p1', targetId: null };
  const label = commandLabel(cmd, fakeSession(), view);
  assert.match(label, /Greatsword of Tyr/);
  assert.match(label, /bez celu|odmow/i);
});

test('B/C: nagłówek modala celu triggera nazywa kartę wywołującą', () => {
  const view = viewWith({
    pendingTriggerTarget: {
      playerId: 'p1', sourceId: 'selhoff', cardId: 'selhoff-occultist',
      allowNone: false, candidateIds: ['p1', 'p2'],
    },
  });
  const req = { id: 'c1', type: 'target', options: [
    { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'p1' },
    { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'p2' },
  ] };
  const title = choiceGroupTitle(req, fakeSession(), view);
  assert.match(title, /Selhoff Occultist/, `nagłówek bez nazwy karty: ${title}`);
});

test('B/C: etykieta opcji trybu modalnego nazywa kartę (Etherwrought Page — Tryb: Life Gain)', () => {
  const view = viewWith({
    pendingModalTrigger: {
      playerId: 'p1', sourceId: 'page', cardId: 'etherwrought-page',
      modes: [{ name: 'Life Gain' }, { name: 'Surveil' }, { name: 'Drain' }],
    },
  });
  const label = commandLabel({ type: 'resolve_modal_choice', playerId: 'p1', modeIndex: 0 }, fakeSession(), view);
  assert.match(label, /Etherwrought Page/, `bez nazwy karty: ${label}`);
  assert.match(label, /Life Gain/);
});

test('B/C: nagłówek modala wyboru trybu nazywa kartę', () => {
  const view = viewWith({
    pendingModalTrigger: {
      playerId: 'p1', sourceId: 'page', cardId: 'etherwrought-page',
      modes: [{ name: 'Life Gain' }, { name: 'Surveil' }, { name: 'Drain' }],
    },
  });
  const req = { id: 'c2', type: 'command', options: [
    { type: 'resolve_modal_choice', playerId: 'p1', modeIndex: 0 },
    { type: 'resolve_modal_choice', playerId: 'p1', modeIndex: 1 },
  ] };
  const title = choiceGroupTitle(req, fakeSession(), view);
  assert.match(title, /Etherwrought Page/, `nagłówek bez nazwy karty: ${title}`);
});

// ---------------------------------------------------------------------------
// Strażnik (uogólnienie uwagi D): każdy typ zdarzenia emitowany przez silnik
// MUSI mieć czytelny opis w logu stołu — default „return e.type" traktujemy
// jako ślepy zaułek, nie jako feature. Nowe zdarzenie = nowy case.
// ---------------------------------------------------------------------------
test('strażnik logu: każdy typ zdarzenia silnika ma case w describeGameEvent', () => {
  const engineSrc = ['game-state.js', 'effects.js', 'triggers.js', 'state-based.js',
    'combat.js', 'abilities.js', 'resources.js', 'spells.js', 'permanents.js', 'tokens.js']
    .map((f) => fs.readFileSync(`src/engine/${f}`, 'utf8')).join('\n');
  const emitted = new Set([...engineSrc.matchAll(/event\('([a-z_]+)'/g)].map((m) => m[1]));
  const sessionSrc = fs.readFileSync('src/table/session.js', 'utf8');
  const handled = new Set([...sessionSrc.matchAll(/case '([a-z_]+)'/g)].map((m) => m[1]));
  const missing = [...emitted].filter((type) => !handled.has(type));
  assert.deepEqual(missing, [],
    `typy zdarzeń bez opisu w logu (wypadłyby surowym tekstem jak w uwagach A/D): ${missing.join(', ')}`);
});
