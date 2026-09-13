// D3 — znalezisko właściciela 2026-09-12 (Balamb Garden, Airborne): atak
// stworem z triggerem „attacks → dobierz kartę" zjada WŁASNĄ bibliotekę
// przy KAŻDYM ataku. Przy cienkiej bibliotece bot atakował Balambem
// za +4 obrażenia, dobierając w deck-out.
//
// Naprawa: gałąź `declare_attackers` w libraryDrainTax sumuje drenaż
// (attacks-triggered draw/mill na mnie) po WSZYSTKICH atakujących
// i karze drabiną libraryLossPenalty — generycznie po typie triggera/
// efektu (ADR 0002), bez nazw kart. Przykład: biblioteka 3, atak Balambem
// (drenaż 1, zapas 2) → kara 60+18×6=168 ≫ wartość ataku → bot nie atakuje.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const R = createCardRegistry();

function scenario(libCount) {
  const s = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p2');
  s.turn.activePlayerId = 'p2'; s.turn.priorityPlayerId = 'p2';
  // Balamb po transformacji i crew: stwór 5/4 z attacks→draw (tył, FIN).
  const back = gameObjectDataOf(R.get('balamb-garden-airborne'));
  addObject(s, {
    ...back, id: 'balamb', instanceId: 'i-balamb', cardId: 'balamb-garden-airborne',
    controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', kind: 'creature',
    power: 5, toughness: 4, types: ['Legendary', 'Artifact', 'Creature'],
    subtypes: back.subtypes ?? ['Vehicle'],
  });
  s.objects.set('balamb', Object.freeze({
    ...s.objects.get('balamb'), tapped: false, summoningSickness: false,
    originalBeforeAnimation: { kind: 'artifact', types: ['Legendary', 'Artifact'] },
  }));
  for (let i = 0; i < libCount; i++) {
    addObject(s, { id: `L${i}`, instanceId: `i-L${i}`, cardId: 'goblin-piker', controllerId: 'p2', ownerId: 'p2', zone: 'library' });
  }
  for (let i = 0; i < 30; i++) {
    addObject(s, { id: `E${i}`, instanceId: `i-E${i}`, cardId: 'goblin-piker', controllerId: 'p1', ownerId: 'p1', zone: 'library' });
  }
  // Wróg bez stworów: brak blokerów, atak ma czystą wartość obrażeń.
  const bot = createHeuristicBot({ seed: 1 });
  const cmd = bot.chooseCommand(playerView(s, 'p2'), {});
  const options = bot.trace()[0].options;
  const attack = options.find((o) => o.cmd === 'attack[balamb]')?.score;
  const skip = options.find((o) => o.cmd === 'attack[]')?.score;
  return { cmd, attack, skip };
}

test('D3: przy 3 kartach w bibliotece bot NIE atakuje Balambem (drenaż > obrażenia)', () => {
  const { cmd, attack, skip } = scenario(3);
  assert.ok(Number.isFinite(attack), 'oferta attack[balamb] musi istnieć');
  assert.ok(Number.isFinite(skip), 'oferta attack[] (brak ataku) musi istnieć');
  assert.ok(attack < skip, `atak z drenażem (${attack}) poniżej rezygnacji (${skip})`);
  assert.deepEqual(cmd.attackerIds ?? [], [], `bot nie atakuje: ${JSON.stringify(cmd.attackerIds)}`);
});

test('D3: przy pełnej bibliotece atak Balambem wraca (anty-over-fix)', () => {
  const { attack, skip } = scenario(30);
  assert.ok(Number.isFinite(attack) && Number.isFinite(skip), 'obie oferty muszą istnieć');
  assert.ok(attack > skip, `bez ryzyka deck-outu atak (${attack}) bije rezygnację (${skip})`);
});
