// Diagnostyka rozszerzająca buga U: jak kreator many opisuje koszt
// Consume Spirit z xValue=1? Czy uwzględnia xCost.black w requirements?
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { paymentDescriptorOf } from '../src/table/mana-wizard.js';
import { jumpToStep } from '../src/engine/turn.js';

const registry = createCardRegistry();

function game() {
  const s = createGameState({ seed: 67, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn.activePlayerId = 'p1';
  s.turn.priorityPlayerId = 'p1';
  s.turn = jumpToStep(s.turn, 'main1', 'p1');
  s.turn.activePlayerId = 'p1';
  s.turn.priorityPlayerId = 'p1';
  return s;
}

function put(state, id, cardId, zone, patch = {}) {
  const def = registry.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1',
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes,
    keywords: def.keywords ?? [], spell: def.spell ?? null, ...patch,
  });
  return state.objects.get(id);
}

test('U/C RED DEBUG: paymentDescriptorOf dla Consume Spirit xValue=1 — czy X-pip „B" jest w requirements?', () => {
  const s = game();
  put(s, 'cs', 'consume-spirit', 'hand');
  // symulacja: pula p1 = {B:1, R:2}
  addMana(s, 'p1', 1, { colors: ['B'] });
  addMana(s, 'p1', 1, { colors: ['R'] });
  addMana(s, 'p1', 1, { colors: ['R'] });
  const view = playerView(s, 'p1');
  // komenda wejściowa jak z `legalSpellCasts` (xValue=1)
  const cmd = { type: 'cast_spell', playerId: 'p1', objectId: 'cs', xValue: 1, targets: [] };
  const desc = paymentDescriptorOf(cmd, view);
  console.log('  desc.requirements:', JSON.stringify(desc?.requirements, null, 0));
  console.log('  desc.totalNeeded:', desc?.totalNeeded);
  console.log('  desc.costStr:', desc?.costStr);
  // Bazowy koszt {1}{B} ⇒ 1 generic, 1 czarny pip.
  // X=1 z xCost.black = „spend only black mana on X" ⇒ DOKŁADNIE X czarnych pipów do wyboru.
  // Kreator many POWINIEN mieć requirements = [(B), (B), (B)] (1B na bazie + 1B z X)
  // albo przynajmniej 1B (baza) + etykieta mówiąca użytkownikowi „X=1 = 1B".
  // Obecnie (pin H/4 sprawdzimy): kreator ma requirements = [(B)], totalNeeded
  // = 2 (1 generic + X=1), BEZ oznaczenia „X musi być czarny".
  const reqs = desc?.requirements ?? [];
  const coveredBlack = reqs.filter((r) => Array.isArray(r) && r[0] === 'B').length;
  console.log('  liczba pokrytych kolorów B w wymaganiach:', coveredBlack);
  // X=1 z xCost.black MUSI wymagać +1 czarnego pipu = łącznie ≥ 2 czarne.
  assert.ok(coveredBlack >= 2,
    'PO FIXIE: requirements deskryptora MANY WIZARDA MUSZĄ zawierać 1 czarne pip (baza) '
    + '+ 1 czarne pip (xCost.black dla X=1) — łącznie ≥ 2 czarne.');
});
