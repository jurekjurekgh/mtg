// Uwaga z gry właściciela, 2026-09-23 (P) — Vandalize.
//
// „Choose one or both — • Destroy target artifact. • Destroy target land.”
// „Bot nie umie jej optymalnie wykorzystać. Niszczy mi artefakt, ale nie
// niszczy lądu. Optymalne wykorzystanie to zniszczenie artefaktu ORAZ
// zniszczenie lądu. A nie tylko jedno.”
//
// Root cause: tryb „oba” niesie JEDEN efekt removalu działający na kilka celów
// naraz (`targetIndices: [0, 1]`). Silnik to rozumie i niszczy oba
// (`src/engine/effects.js`), ale wycena bota czytała wyłącznie
// `effect.targetIndex ?? 0` — punktowała sam artefakt, a zniszczenie lądu
// wnosiło zero. Tryb „oba” remisował więc z trybem „tylko artefakt” i bot brał
// uboższy. Skutek uboczny tej samej luki: drugim celem mógł zostać MÓJ własny
// ląd bez żadnej kary, bo nie wchodził do oceny.
//
// Naprawa klasowa (ADR 0002 — po deskryptorze `targetIndices`, nie po nazwie
// karty): blok removalu punktuje KAŻDY cel, którego efekt dotyka.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, ctrl, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: ctrl, ownerId: ctrl, zone,
    ...data, types: def.types, subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], cardName: def.name,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}

/** Scena ze zgłoszenia: przeciwnik ma artefakt i lądy, ja mam czym rzucić. */
function scene() {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.phase = 'precombat_main';
  state.turn.step = 'main1';
  state.turn.number = 8;
  for (let i = 0; i < 6; i += 1) put(state, `m${i}`, 'basic-mountain', 'p1');
  put(state, 'vand', 'vandalize', 'p1', 'hand');
  for (let i = 0; i < 18; i += 1) put(state, `lib${i}`, 'basic-mountain', 'p1', 'library');
  put(state, 'art', 'pristine-talisman', 'p2');
  for (let i = 0; i < 4; i += 1) put(state, `foeland${i}`, 'basic-island', 'p2');
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 5 });
  const chosen = bot.chooseCommand(view);
  const opts = bot.trace()[0].options;
  const score = (frag) => opts.find((o) => o.cmd === `cast_spell(vand->${frag})`)?.score;
  return { chosen, score };
}

test('P: bot wybiera tryb „oba” — niszczy artefakt ORAZ ląd', () => {
  const { chosen } = scene();
  assert.equal(chosen.type, 'cast_spell');
  assert.equal((chosen.targets ?? []).length, 2,
    `optymalne zagranie celuje w DWA permanenty, a bot podał: ${JSON.stringify(chosen.targets)}`);
  assert.ok(chosen.targets.includes('art'), 'jednym celem musi być artefakt');
  assert.ok(chosen.targets.some((t) => String(t).startsWith('foeland')),
    'drugim celem musi być LĄD PRZECIWNIKA');
});

test('P: „artefakt + ląd” punktuje wyżej niż sam artefakt', () => {
  // Sedno zgłoszenia: dopóki drugi cel wnosi 0, oba tryby remisują i wygrywa uboższy.
  const { score } = scene();
  assert.ok(score('art+foeland0') > score('art'),
    `oba cele (${score('art+foeland0')}) muszą bić sam artefakt (${score('art')})`);
  assert.ok(score('art+foeland0') > score('foeland0'),
    `oba cele (${score('art+foeland0')}) muszą bić sam ląd (${score('foeland0')})`);
});

test('P: drugim celem nigdy nie zostaje WŁASNY ląd', () => {
  // Ta sama luka: nieoceniany drugi cel mógł trafić we własny permanent.
  const { score, chosen } = scene();
  assert.ok(score('art+m0') < score('art+foeland0'),
    `własny ląd jako drugi cel (${score('art+m0')}) musi być gorszy niż wrogi (${score('art+foeland0')})`);
  assert.ok(!(chosen.targets ?? []).some((t) => /^m\d+$/.test(String(t))),
    'bot nie może zniszczyć własnego lądu');
});
