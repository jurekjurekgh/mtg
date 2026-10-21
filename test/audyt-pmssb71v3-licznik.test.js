// PMSSB-71 v3 (2026-10-20) — licznik +1/+1 na SOBIE bez celu (ETB/wyzwalacze) przestaje być stałą 5.
// Wartość kontekstowa (counterValue): ciało 3 + presja (siła ataku wroga / moje życie) + przewaga
// liczebna wroga. Przypadek testowy: Nightshade Harvester (wyzwalacz „land opponent controls enters”
// + licznik na sobie). Pomiar PRZED: `.arena/pmssb71v3-pre.txt` — wycena stała 69,57 przy każdym życiu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { normalizeHeuristicParams } from '../src/controllers/heuristic-params.js';

const registry = createCardRegistry();

function scene({ myLife = 20, foeCreatures = 0, foePower = 4, myCreatures = 0 } = {}) {
  const state = createGameState({ seed: 72, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  const put = (id, cardId, pid, zone) => {
    const def = registry.get(cardId);
    addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId: pid, ownerId: pid, zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords });
  };
  put('nsh', 'nightshade-harvester', 'p1', 'hand');
  for (let i = 0; i < myCreatures; i += 1) {
    put(`m${i}`, 'myr-scrapling', 'p1', 'battlefield');
    state.objects.set(`m${i}`, Object.freeze({ ...state.objects.get(`m${i}`), summoningSickness: false }));
  }
  for (let i = 0; i < foeCreatures; i += 1) {
    put(`f${i}`, 'myr-scrapling', 'p2', 'battlefield');
    state.objects.set(`f${i}`, Object.freeze({ ...state.objects.get(`f${i}`), power: foePower, toughness: 2 }));
  }
  state.players.find((p) => p.id === 'p1').life = myLife;
  addMana(state, 'p1', 4, { colors: ['B'] });
  return state;
}

/** Wycena rzutu Nightshade Harvester przez bota (trace opcji). */
function castScore(opts, params = undefined) {
  const state = scene(opts);
  const bot = createHeuristicBot({ seed: 7, params });
  bot.chooseCommand(playerView(state, 'p1'), {});
  const opt = (bot.trace().at(-1)?.options ?? []).find((o) => o.cmd.startsWith('cast_permanent(nsh)'));
  assert.ok(opt, 'opcja rzutu Nightshade w ocenach bota');
  return opt.score;
}

test('PMSSB-71 v3 RED: presja podnosi licznik na sobie (życie 5 wobec ataku wroga 12 > życie 20)', () => {
  const pod = castScore({ myLife: 5, foeCreatures: 3, foePower: 4 });
  const spokoj = castScore({ myLife: 20, foeCreatures: 3, foePower: 4 });
  assert.ok(pod > spokoj, `pod presją ${pod} musi być wyżej niż ${spokoj}`);
});

test('PMSSB-71 v3 pin (nie RED: przechodzi też na HEAD, różnicę niesie część wyceny): przewaga liczebna wroga', () => {
  const przegrywam = castScore({ foeCreatures: 3, myCreatures: 0 });
  const prowadze = castScore({ foeCreatures: 3, myCreatures: 3 });
  assert.ok(przegrywam > prowadze, `z tyłu ${przegrywam} wyżej niż na prowadzeniu ${prowadze}`);
});

test('PMSSB-71 v3 anti-over-fix: neutralny stół (brak presji i przewagi wroga) — licznik to wartość ciała, bez stałej 5', () => {
  // Pomiar PRZED: 69,57 (stała 5). Po: 68,31 (ciało 3 za licznik). Różnica 1,26 = (5 − 3) × waga licznika.
  const neutral = castScore({});
  assert.ok(Math.abs(neutral - 68.3109) < 1e-3, `neutralna wycena ${neutral} (oczekiwano wartości ciała 3)`);
});

test('PMSSB-71 v3 pokrętła: presja 0 i przewaga 0 wyłączają kontekst (wycena jak przy pustym stole)', () => {
  const zerowe = normalizeHeuristicParams({ counterPressureWeight: 0, counterBoardWeight: 0 });
  const pod = castScore({ myLife: 5, foeCreatures: 3, foePower: 4 }, zerowe);
  const spokoj = castScore({ myLife: 20, foeCreatures: 3, foePower: 4 }, zerowe);
  assert.equal(pod, spokoj, 'bez wag kontekst nie zmienia licznika');
});
