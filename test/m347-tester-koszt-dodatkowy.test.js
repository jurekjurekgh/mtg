import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { choiceGroupLabel } from '../src/table/render.js';
import { detectEmptyCostDescriptor, runDetectors } from '../tools/table-tester/detectors.mjs';

const registry = createCardRegistry();
function costGroup(cardId, zone) {
  const state = createGameState({ seed: 347, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  const put = (id, cid, location) => {
    const def = registry.get(cid);
    addObject(state, { id, instanceId: `i-${id}`, cardId: cid, controllerId: 'p1', ownerId: 'p1', zone: location,
      ...gameObjectDataOf(def), types: def.types, keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    });
  };
  put('spell', cardId, 'hand');
  for (const id of ['cost-a', 'cost-b']) put(id, 'goblin-piker', zone);
  addMana(state, 'p1', 10);
  const view = playerView(state, 'p1');
  const options = view.legalCommands.filter((c) => c.type === 'cast_permanent' && c.objectId === 'spell' && c.exileTargetId);
  assert.equal(options.length, 2, 'prawdziwe warianty zapłaty kosztu wygnaniem');
  const session = { nameOf: (id) => registry.get(id)?.name ?? id };
  const label = choiceGroupLabel({ type: 'target', options }, session, view);
  const result = execute(state, options[0]);
  assert.ok(result.ok, JSON.stringify(result));
  assert.ok(state.zones.exile.some((id) => state.objects.get(id)?.cardId === 'goblin-piker'), 'rzut rzeczywiście zapłacił wygnaniem');
  return label;
}

for (const [cardId, zone, wording] of [
  ['makeshift-mauler', 'graveyard', 'z grobu'],
  ['fear-of-abduction', 'battlefield', 'z pola bitwy'],
]) {
  test(`M347/A: koszt wygnania ${wording} ma kompletną etykietę, nie pustą cenę`, () => {
    const label = costGroup(cardId, zone);
    assert.ok(label.includes(`Wygnaj stwora ${wording} (koszt) —`), label);
    assert.deepEqual(detectEmptyCostDescriptor([`  AKCJE: ${label}`]), [], 'znacznik opisuje funkcję wygnania, nie zapowiada kwoty');
  });
}

test('M347/B: prawdziwa pusta cena nadal jest błędem — także bez spacji przed nawiasem', () => {
  const lines = ['  AKCJE: Rzuć za warp: Karta (koszt)', '  AKCJE: Rzuć: Karta (cena )', '  AKCJE: Rzuć: Karta (koszt 2W + kicker )'];
  assert.equal(detectEmptyCostDescriptor(lines).length, 3);
});

test('M347/C: poprawny znacznik obok pustej ceny nie może wyciszyć całego panelu', () => {
  const label = costGroup('makeshift-mauler', 'graveyard');
  const findings = detectEmptyCostDescriptor([`  AKCJE: ${label} || Rzuć: Karta (koszt 2W + kicker )`]);
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /kicker/, 'zgłoszenie dotyczy rzeczywistego braku, nie poprawnego znacznika');
});

test('M347/D: puste ceny panelu wykrywane z rekordów okien, jednakowo pod quiet i ze snapshotami', () => {
  const actions = ['Rzuć za warp: Karta (koszt)', 'Rzuć: Karta (koszt 2W + kicker )'];
  const windowRecords = [{ actions, gameOver: false }, { actions: [actions[0]], gameOver: false }];
  const onlyCosts = (lines) => runDetectors(lines, { windowRecords }).filter((f) => /Pusty deskryptor/.test(f.message));
  const quiet = onlyCosts([]);
  assert.equal(quiet.length, 2, 'pełne etykiety każdego okna, bez zależności od snapshotów/deduplikacji pokrycia');
  assert.deepEqual(onlyCosts([`  AKCJE: ${actions.join(' || ')}`]), quiet, 'snapshot nie dubluje tych samych zgłoszeń');
});

test('M347/E: prawidłowe kwoty, glosy i znacznik dodatkowego kosztu są dozwolone również w rekordach', () => {
  const actions = [costGroup('fear-of-abduction', 'battlefield'), 'Ucieczka (Escape): karty do wygnania', 'Zagraj: Karta (koszt 2U)', 'Rzuć: Karta (koszt 2W + kicker 1W)'];
  assert.deepEqual(detectEmptyCostDescriptor([], { windowRecords: [{ actions }] }), []);
});
