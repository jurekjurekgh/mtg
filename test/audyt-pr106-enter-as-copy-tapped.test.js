// F3 (audyt PR106): kopia przejmuje kopiowalne wartości oryginału — CR 707.2
// („the copy acquires the copiable values of the original object's
// characteristics” — „values derived from the text printed on the object”,
// w tym regułowy „enters tapped”, CR 614.1d). Źródła pobrane 2026-09-08/09:
// ancestral.vision/additional-rules/copying-objects.html (707.2),
// mtg.wiki/page/Replacement_effect (614.1d, 614.12).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { replaceObject } from '../src/engine/permanents.js';
import { applyEffect } from '../src/engine/effects.js';

const registry = createCardRegistry();
function put(s, id, cardId, zone = 'battlefield') {
  const d = registry.get(cardId);
  addObject(s, { ...gameObjectDataOf(d), types: d.types, keywords: d.keywords, subtypes: d.subtypes ?? [], id, instanceId: `i-${id}`, cardId, ownerId: 'p1', controllerId: 'p1', zone });
}
function state() {
  const s = createGameState({ seed: 106, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  return s;
}

// Jwari kopiuje tylko Ally, a żaden Ally nie ma entersTapped — kandydata
// (Rotting Legion) podajemy wprost w pending, jak zbudowałby go rzut przy
// szerszym „any creature”. Filtrowanie kandydatów testują testy Jwari; tu
// samo przeniesienie kopiowalnych wartości przy rozstrzygnięciu kopii.
test('F3: Jwari jako kopia Rotting Legion wchodzi tapnięty', () => {
  const s = state();
  put(s, 'jwari', 'jwari-shapeshifter');
  put(s, 'legion', 'rotting-legion');
  assert.equal(s.objects.get('jwari').tapped, false);
  replaceObject(s, s.objects.get('jwari'), { enteringAsCopy: true });
  s.pendingEnterAsCopy = { playerId: 'p1', sourceId: 'jwari', candidateIds: ['legion'], restorePriorityTo: null };
  const cmd = playerView(s, 'p1').legalCommands.find((c) => c.type === 'resolve_enter_as_copy' && c.targetId === 'legion');
  assert.ok(cmd, 'kopia Legionu oferowana');
  assert.ok(execute(s, cmd).ok);
  const j = s.objects.get('jwari');
  assert.equal(j.power, 4);
  assert.equal(j.toughness, 5);
  assert.ok((j.subtypes ?? []).includes('Zombie'));
  assert.equal(j.tapped, true, 'kopiowany „enters tapped” tapie przy wejściu (707.2 + 614.1d)');
  assert.equal(j.entersTapped, true, 'pole kopiowalne niesione dalej (kopia kopii, 707.3)');
  assert.equal(s.events.some((e) => e.type === 'object_tapped' && e.objectId === 'jwari'), false,
    'wejście tapnięte to nie „becomes tapped” (701.21a)');
});

test('F3: odmowa kopii = zwykłe 0/0, ginie w SBA bez tapnięcia (kontrola negatywna)', () => {
  const s = state();
  put(s, 'jwari', 'jwari-shapeshifter');
  put(s, 'legion', 'rotting-legion');
  replaceObject(s, s.objects.get('jwari'), { enteringAsCopy: true });
  s.pendingEnterAsCopy = { playerId: 'p1', sourceId: 'jwari', candidateIds: ['legion'], restorePriorityTo: null };
  const cmd = playerView(s, 'p1').legalCommands.find((c) => c.type === 'resolve_enter_as_copy' && c.targetId == null);
  assert.ok(cmd, 'odmowa oferowana');
  assert.ok(execute(s, cmd).ok);
  assert.equal(s.objects.get('jwari'), undefined, '0/0 bez kopii ginie w SBA (704.5f)');
  assert.equal(s.events.some((e) => e.type === 'object_tapped' && e.objectId === 'jwari'), false);
});

// Cogwork Assembler kopiuje artefakty; żaden artefakt katalogu nie ma
// entersTapped, więc artefakt jest synetyczny (jak synthetic-aura w testach).
test('F3: token-kopia artefaktu z entersTapped wchodzi tapnięty', () => {
  const s = state();
  addObject(s, {
    id: 'art', instanceId: 'i-art', cardId: 'synthetic-tapped-artifact',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'artifact',
    manaCost: 2, types: ['Artifact'], colors: [], abilities: [], keywords: [], subtypes: [],
    entersTapped: true,
  });
  const before = new Set(s.objects.keys());
  applyEffect(s, { type: 'create_copy_token' },
    { id: 'assembler', cardId: 'cogwork-assembler', controllerId: 'p1' }, ['art']);
  const token = [...s.objects.values()].find((o) => !before.has(o.id) && o.zone === 'battlefield');
  assert.ok(token, 'token powstał');
  assert.equal(token.tapped, true, 'kopia wchodzi tapnięta (707.2 + 614.1d)');
});
