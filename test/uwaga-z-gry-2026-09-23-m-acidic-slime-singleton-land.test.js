// Uwaga M (właściciel, 2026-09-23c — druga wiadomość z tej samej partii):
// Acidic Slime (ETB: „destroy target artifact, enchantment, or land") trafiał
// w LĄD przeciwnika, ale wśród lądów brał pierwszy z listy silnika — czyli ląd
// z kilkoma kopiami. Właściciel: „powinien wybrać o ile to możliwe taki,
// którego mam 1 sztukę, żeby zablokować mi rzucanie czarów tego koloru”.
//
// Root cause (L41 — wycena celu triggera nie znała typu celu): ląd nie niósł
// ŻADNEJ wartości poza baseline'em 30 (lądy mają p/t 0, więc `p * 2 + t` = 0),
// a warianty remisowały → wygrywał pierwszy z listy. Fix: `landDenialDelta`
// w `heuristic-bot.js` dokłada sygnały deskryptorowe (ADR 0002/0017):
//   * unikat — ląd, którego przeciwnik ma JEDNĄ kopię (`cardId` wśród JEGO
//     lądów) → premia 10;
//   * odcięcie koloru — `getSourceForObject` na POZOSTAŁYCH jego lądach: żaden
//     nie produkuje już żadnego koloru celu → premia 18;
//   * kara 8 za każdą dodatkową kopię — duplikat z definicji nie „odcina”
//     (analiza liczy pozostałe lądy), więc lądy z wieloma kopiami schodzą
//     poniżej baseline'u 30 i nie wygrywają z artefaktami (pin C53/C).
//
// Zakres: wyłącznie wycena bota (E1 pozycji M planu z 2026-09-23c); silnik
// bez zmian — lista kandydatów to nadal wszystkie legalne cele triggera.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();
const SLIME = 'acidic-slime';

function game() {
  const state = createGameState({ seed: 20260923, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function put(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def),
    types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  });
  return state.objects.get(id);
}

/** Sześć lasów (mana na {3}{G}{G}) + lądy wroga wg specyfikacji. */
function setup(enemyLands) {
  const state = game();
  put(state, 'slime', SLIME, 'p1', 'hand');
  for (let i = 0; i < 6; i += 1) put(state, `own${i}`, 'basic-forest', 'p1', 'battlefield');
  enemyLands.forEach((cardId, i) => put(state, `foe${i}`, cardId, 'p2', 'battlefield'));
  for (let i = 0; i < 8; i += 1) put(state, `lib${i}`, 'basic-swamp', 'p1', 'library');
  return state;
}

/** Rzut Slime'a, rozstrzygnięcie stosu do decyzji celu triggera, wybór bota. */
function botChoice(state) {
  addMana(state, 'p1', 5, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'slime');
  assert.ok(cast, 'rzut Acidic Slime jest legalny');
  assert.ok(execute(state, cast).ok, 'rzut przyjęty');
  for (let i = 0; i < 12 && state.zones.stack.length > 0
    && !(state.pendingTriggerTargets?.length > 0); i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    assert.ok(pass, 'pass rundy priorytetu dostępny na stosie');
    execute(state, pass);
  }
  assert.ok(state.pendingTriggerTargets?.length > 0, 'decyzja celu triggera otwarta');
  const view = playerView(state, 'p1');
  const cmds = view.legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(cmds.length >= 2, `wybór realny: ≥2 kandydatów (jest ${cmds.length})`);
  const bot = createHeuristicBot({ seed: 1 });
  const cmd = bot.chooseCommand(view);
  assert.equal(cmd.type, 'resolve_trigger_target', 'decyzja celu triggera (nie pass)');
  return { cmd, cmds, view, entry: bot.trace().at(-1) };
}

function cardIdOf(view, id) {
  return (view.zones.battlefield ?? []).find((o) => o.id === id)?.cardId ?? null;
}

test('M/1: unikat koloru wygrywa — bot bierze Las zamiast trzech Gór', () => {
  const state = setup(['basic-mountain', 'basic-mountain', 'basic-mountain', 'basic-forest']);
  const { cmd, view } = botChoice(state);
  assert.equal(cardIdOf(view, cmd.targetId), 'basic-forest',
    'cel = jedyny las wroga (jego jedyna zielona produkcja), nie Góra z trzech kopii');
});

test('M/2: duplikaty nie chronią koloru — wygrywa singleton odcinający', () => {
  // Góry i Wyspy po dwie kopie nie „odcinają” niczego (zostaje po jednej),
  // a Bagno w jednej kopii odcina cały czarny kolor.
  const state = setup(['basic-mountain', 'basic-mountain', 'basic-island', 'basic-island', 'basic-swamp']);
  const { cmd, view } = botChoice(state);
  assert.equal(cardIdOf(view, cmd.targetId), 'basic-swamp', 'cel = jedyne Bagno wroga');
});

test('M/3: dwa różne uniczaty (Island i Forest) — wybór wśród nich, nie Góra', () => {
  const state = setup(['basic-mountain', 'basic-mountain', 'basic-mountain', 'basic-island', 'basic-forest']);
  const { cmd, view } = botChoice(state);
  const card = cardIdOf(view, cmd.targetId);
  // Remis dwóch singletonów jest uczciwy (kolejność silnika); pinujemy tylko,
  // że żaden ląd z wieloma kopiami nie wyprzedza unikatów.
  assert.ok(card === 'basic-island' || card === 'basic-forest',
    `cel ∈ {Island, Forest} (uniczaty), jest: ${card}`);
});

test('M/4 (anty-over-fix): ląd w wielu kopiach przegrywa z artefaktem', () => {
  const state = setup(['basic-forest', 'basic-forest', 'basic-forest', 'basic-forest']);
  addObject(state, {
    id: 'eart', instanceId: 'i-eart', cardId: 'test-eart', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'artifact', power: 2, toughness: 2, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors: [],
  });
  const { cmd } = botChoice(state);
  assert.equal(cmd.targetId, 'eart',
    'cztery Lasy wroga (duplikaty) schodzą poniżej baseline — artefakt wygrywa');
});

test('M/5: ślad nazywa wariant (cel w etykiecie, klasa M131/L34)', () => {
  const state = setup(['basic-mountain', 'basic-mountain', 'basic-mountain', 'basic-forest']);
  const { cmd, entry } = botChoice(state);
  const chosenId = cmd.targetId;
  assert.ok(entry, 'ślad decyzji istnieje');
  assert.equal(entry.chosen, `resolve_trigger_target(${chosenId})`,
    'wybrany wariant jest rozróżnialny w śladzie (audyt remisów ma co parować)');
});

test('M/6: kontrakt katalogowy — cel z deskryptora, nie z nazwy karty (ADR 0002)', () => {
  const def = REGISTRY.get(SLIME);
  assert.ok(def, 'acidic-slime w rejestrze');
  const etb = (def.abilities ?? []).find((a) => a.trigger?.event === 'enter_battlefield');
  assert.equal(etb?.trigger?.requiresTarget?.type, 'artifact_or_enchantment_or_land',
    'klasa celu z deskryptora triggera (artefakt/enchantment/ląd — każdy kontroler)');
  assert.equal(etb?.effect?.type, 'destroy_permanent', 'efekt: zniszczenie permanentu');
  const state = setup(['basic-mountain', 'basic-forest']);
  addObject(state, {
    id: 'eart', instanceId: 'i-eart', cardId: 'test-eart', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'artifact', power: 1, toughness: 1, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors: [],
  });
  const { cmds, view } = botChoice(state);
  const targetIds = new Set(cmds.map((c) => c.targetId ?? c.targetIds?.[0]));
  const enemyPermanents = (view.zones.battlefield ?? []).filter((o) => o.controllerId === 'p2');
  for (const o of enemyPermanents) {
    assert.ok(targetIds.has(o.id), `kandydatem jest ${o.cardId} (${o.id}) wroga`);
  }
});
