// Audyt PR #84 (znalezisko E1) — L16: każda struktura blokująca priorytet
// (decyzja gracza) musi być częścią fingerprintu stanu.
//
// Problem: M240/M241 wprowadziły DWUKROKOWY Escape — `cast_escape` kolejkuje
// `state.pendingEscapeExile` (decyzja „wygnij N kart", wstrzymuje grę), a
// `resolve_escape_exile` domyka koszt. Ta decyzja NIE trafiła do
// `PENDING_DECISION_FIELDS` w `src/engine/fingerprint.js`, więc fingerprint
// nie odróżniał stanu „przed otwarciem" od „po otwarciu" decyzji Escape.
//
// Skutek (klasa L16/L18): sonda „oferta bez skutku" mogła uznać `cast_escape`
// za akcję bez widocznego skutku (bo poza `priorityPlayerId` nic w odcisku nie
// drgnęło), a weryfikacja replayów nie widziała zamrożonej decyzji.
//
// Test RED→GREEN: przed dopisaniem `pendingEscapeExile` do listy kranieje.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, execute, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';

const REGISTRY = createCardRegistry();

function game({ escapeCard = 'sleep-of-the-dead', graveSize = 9 } = {}) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 20);
  addMana(state, 'p1', 20, { U: 4, G: 4, B: 4, R: 4, W: 4 });
  const spellDef = REGISTRY.get(escapeCard);
  addObject(state, {
    id: 'esc', instanceId: 'i-esc', cardId: escapeCard, controllerId: 'p1', ownerId: 'p1',
    zone: 'graveyard', kind: 'spell', types: ['Sorcery'], colors: spellDef.colors, manaCost: spellDef.manaCost,
    spell: spellDef.spell,
  });
  for (let i = 0; i < graveSize; i += 1) {
    addObject(state, {
      id: `g${i}`, instanceId: `i-g${i}`, cardId: 'goblin-piker', controllerId: 'p1', ownerId: 'p1',
      zone: 'graveyard', kind: 'creature', types: ['Creature'], colors: ['R'], power: 2, toughness: 1,
    });
  }
  addObject(state, {
    id: 'victim', instanceId: 'i-victim', cardId: 'goblin-piker', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 1, abilities: [], subtypes: [],
    types: ['Creature'], colors: ['R'],
  });
  return state;
}

test('E1: fingerprint obejmuje oczekującą decyzję wygnania Escape (L16)', () => {
  const state = game({ escapeCard: 'sleep-of-the-dead' });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_escape' && c.targets?.[0] === 'victim');
  assert.ok(cast, 'deklaracja Escape z celem');
  const before = stateFingerprint(state);
  const r = execute(state, cast);
  assert.ok(r.ok, JSON.stringify(r.events));
  assert.ok(state.pendingEscapeExile, 'pendingEscapeExile jest ustawione');

  const afterStr = stateFingerprint(state);
  const after = JSON.parse(afterStr);

  // 1) Otwarcie decyzji MUSI zmienić odcisk (L16) — różnica nie może być
  //    tylko wynikiem priorityPlayerId.
  assert.notEqual(afterStr, before, 'otwarcie decyzji Escape musi zmienić fingerprint');

  // 2) Decyzja jest JAWNIE projekowana w odcisku (tak, by weryfikacja replayu
  //    i sonda „oferta bez skutku" widziały zamrożony wybór kandydatów).
  const decisions = after.pendingDecisions ?? {};
  assert.ok(decisions.pendingEscapeExile, 'pendingDecisions niesie pendingEscapeExile');
  assert.equal(decisions.pendingEscapeExile.exileCount, state.pendingEscapeExile.exileCount,
    'liczba do wygnania w odcisku');
  assert.deepEqual([...decisions.pendingEscapeExile.candidateIds].sort(),
    [...state.pendingEscapeExile.candidateIds].sort(),
    'kandydaci do wygnania w odcisku');
});
