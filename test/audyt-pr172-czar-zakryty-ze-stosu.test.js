/**
 * Audyt PR #172 (2026-10-24, PR #173) — pin z sondy audytu: druga połowa
 * CR 708.9 dla ZAKRYTEGO CZARU NA STOSIE. Dosłowny tekst (CR wyd. 2026-09-25,
 * cr-raw.txt, ADR 0030):
 *
 *   "If a face-down spell moves from the stack to any zone other than the
 *    battlefield, its owner must reveal it to all players as they move it."
 *
 * PR #172 (CR-1) przypiął zakryte PERMANENTY schodzące z pola bitwy
 * (`test/petla-jakosci-cr-lki-i-zakryte.test.js`), ale nie czar skontrzony
 * wprost ze stosu. Scenariusz: *Segmented Krotiq* rzucony zakryty (megamorph,
 * CR 702.37b: "a 2/2 face-down creature with no text, no name, no subtypes,
 * and no mana cost") siedzi na stosie jako zakryty czar — efekty widzą tylko
 * cechy zakrytego czaru (CR 708.4), a przeciwnik nie zna karty (FoW).
 * *Stoic Rebuttal* go kontruje, a karta w grobie właściciela
 * musi mieć pełne cechy druku (CR 708.9 + CR 400.7 — nowy obiekt bez zakrycia).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const registry = createCardRegistry();

function put(state, id, cardId, zone, playerId) {
  const [{ objectId, ...data }] = createCardDeck({ cardIds: [cardId], ownerId: playerId, registry });
  addObject(state, { ...data, id, instanceId: `i-${id}`, controllerId: playerId, zone });
  return state.objects.get(id);
}

function run(state, cmd) {
  assert.ok(cmd, 'oczekiwano legalnej komendy');
  const res = execute(state, cmd);
  assert.equal(res.ok, true, JSON.stringify(res));
  return res;
}

test('CR 708.9: zakryty czar morpha skontrzony ze stosu odzyskuje pełne cechy karty w grobie', () => {
  const s = createGameState({ seed: 172, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  put(s, 'krotiq', 'segmented-krotiq', 'hand', 'p1');
  put(s, 'rebuttal', 'stoic-rebuttal', 'hand', 'p2');

  // Rzut zakryty za {3} (megamorph): oferta faceDown z legalCommands, nie ręczna komenda (L21).
  addMana(s, 'p1', 3, { colors: ['G', 'G', 'G'] });
  run(s, playerView(s, 'p1').legalCommands.find((c) => c.objectId === 'krotiq' && c.faceDown));

  const onStack = [...s.objects.values()].find((o) => o.zone === 'stack' && o.cardId === 'segmented-krotiq');
  assert.ok(onStack, 'zakryty czar jest na stosie');
  assert.equal(onStack.faceDown, true);
  assert.equal(onStack.cardName, null, 'zakryty czar nie ma nazwy (CR 702.37a/b + 708.2)');

  // FoW na stosie (ADR 0003): przeciwnik widzi zakryty czar bez tożsamości,
  // właściciel widzi własną kartę.
  const oppEntry = playerView(s, 'p2').zones.stack.find((o) => o.id === onStack.id);
  assert.equal(oppEntry.cardId, null, 'przeciwnik nie może znać zakrytej karty na stosie');
  assert.equal(oppEntry.faceDown, true);
  const ownEntry = playerView(s, 'p1').zones.stack.find((o) => o.id === onStack.id);
  assert.equal(ownEntry.cardId, 'segmented-krotiq', 'właściciel zna własny zakryty czar');

  // Kontra przeciwnika: "Counter target spell" legalnie celuje w zakryty
  // czar — cel wymaga czaru na stosie, nie znajomości jego tożsamości,
  // a cechy zakrytego czaru to 2/2 creature spell (CR 708.4).
  run(s, { type: 'pass_priority', playerId: 'p1' });
  addMana(s, 'p2', 3, { colors: ['U', 'U', 'U'] });
  run(s, playerView(s, 'p2').legalCommands.find(
    (c) => c.objectId === 'rebuttal' && (c.targets ?? []).includes(onStack.id),
  ));
  for (let i = 0; s.zones.stack.length > 0 && i < 10; i += 1) {
    const pid = s.turn.priorityPlayerId;
    run(s, playerView(s, pid).legalCommands.find((c) => c.type === 'pass_priority'));
  }
  assert.equal(s.zones.stack.length, 0, 'stos opróżniony po rozstrzygnięciu kontry');

  const inGrave = [...s.objects.values()].find((o) => o.zone === 'graveyard' && o.cardId === 'segmented-krotiq');
  assert.ok(inGrave, 'skontrzony czar trafia do grobu właściciela (CR 701.6a)');
  assert.equal(inGrave.ownerId, 'p1');
  assert.equal(inGrave.faceDown, false, 'w grobie karta jest odkryta (CR 708.9)');
  assert.equal(inGrave.cardName, 'Segmented Krotiq', 'nazwa wraca z odkryciem (CR 708.9)');
  assert.equal(inGrave.power, 6, 'drukowane 6/5, nie 2/2 zakrycia (CR 400.7)');
  assert.equal(inGrave.toughness, 5);
  assert.equal(inGrave.manaCost, 6, 'drukowane MV 6, nie 0 zakrycia');
  assert.deepEqual(inGrave.subtypes, ['Insect']);
  assert.deepEqual(inGrave.colors, ['G']);
});
