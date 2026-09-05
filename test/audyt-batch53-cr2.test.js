// Audyt Batch53, C-R2 (zlecenie właściciela 2026-09-05): cele triggerów
// SPOZA pola bitwy (grób/wygnanie) remisowały do zera — „return target Aura
// or Equipment card from your graveyard to your hand" (Ironclad Slayer),
// „put target instant or sorcery card from your graveyard on top" (Mystic
// Sanctuary) wybierały PIERWSZĄ kartę grobu, nie najlepszą. Grób i wygnanie
// są strefami JAWNYMI (CR 400.2/406.3) i widok niesie kind/types/P/T/
// manaCost (M274) — wycena ma z tego korzystać: stwór po P/T, reszta po
// koszcie (wzorzec craft_exile).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game(step = 'main', pid = 'p1') {
  const s = createGameState({ seed: 53, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, step, pid);
  s.turn.activePlayerId = pid;
  s.turn.priorityPlayerId = pid;
  return s;
}

function addCard(s, id, cardId, pid, zone = 'hand') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(s, {
    id, instanceId: `i-${id}`, cardId, controllerId: pid, ownerId: pid, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return s.objects.get(id);
}

/** Karta-syntetyk w GROBIE: aura (Enchantment+Aura) albo instant, o zadanym
 * koszcie — bez `name` (tokeny nie są kartami, CR 108.2b, patrz filtr
 * kandydatów w triggers.js). */
function addGraveCard(s, id, pid, { manaCost = 1, types = ['Enchantment'], subtypes = ['Aura'], kind = 'enchantment' } = {}) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: pid, ownerId: pid,
    zone: 'graveyard', kind, manaCost, power: null, toughness: null,
    abilities: [], keywords: [], subtypes, types, colors: [],
  });
  return s.objects.get(id);
}

function library(s, pid, n) {
  for (let i = 0; i < n; i += 1) addCard(s, `L${pid}${i}`, 'basic-forest', pid, 'library');
}

function resolveStack(s, limit = 24) {
  for (let i = 0; i < limit && s.zones.stack.length > 0; i += 1) {
    const v = playerView(s, s.turn.priorityPlayerId);
    const pass = v.legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    if (!execute(s, pass).ok) break;
  }
}

function pick(s, pid = 'p1', seed = 7) {
  const b = createHeuristicBot({ seed });
  const cmd = b.chooseCommand(playerView(s, pid));
  return { cmd, entry: b.trace().at(-1) };
}

test('C-R2: Ironclad Slayer zabiera z grobu NAJDROŻSZĄ aurę/equipment, nie pierwszą', () => {
  const s = game();
  library(s, 'p1', 5);
  addMana(s, 'p1', 8, { colors: ['W', 'U', 'B', 'R', 'G'] });
  addCard(s, 'slayer', 'ironclad-slayer', 'p1');
  // Grób: tania aura (1), drogi equipment (5), średnia aura (3) —
  // NAJPierw w kolejności jest TANIA (tak wybierał stary remis-0).
  addGraveCard(s, 'aura1', 'p1', { manaCost: 1 });
  addGraveCard(s, 'eq5', 'p1', { manaCost: 5, types: ['Artifact'], subtypes: ['Equipment'], kind: 'artifact' });
  addGraveCard(s, 'aura3', 'p1', { manaCost: 3 });
  assert.ok(execute(s, { type: 'cast_permanent', playerId: 'p1', objectId: 'slayer' }).ok);
  resolveStack(s);
  const { cmd } = pick(s);
  assert.equal(cmd.type, 'resolve_trigger_target');
  assert.equal(cmd.targetId, 'eq5', 'bot wraca po equipment za 5 many, nie po aurę za 1 (pierwszą z listy)');
});

test('C-R2: Mystic Sanctuary kładzie na wierzch NAJDROŻSZY instant z grobu', () => {
  const s = game();
  library(s, 'p1', 5);
  addMana(s, 'p1', 8, { colors: ['W', 'U', 'B', 'R', 'G'] });
  addCard(s, 'sanct', 'mystic-sanctuary', 'p1');
  // „enters tapped unless you control three or more other Islands" —
  // trigger warunkuje się na enteredUntapped, więc bez 3 Islandów ląd
  // wchodzi zatapowany i wyboru w ogóle nie ma.
  for (let i = 0; i < 3; i += 1) {
    addObject(s, {
      id: `isl${i}`, instanceId: `i-isl${i}`, cardId: `test-isl${i}`, controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'land', manaCost: 0, abilities: [], keywords: [],
      subtypes: ['Island'], types: ['Land'], colors: [],
    });
  }
  addGraveCard(s, 'inst2', 'p1', { manaCost: 2, types: ['Instant'], subtypes: [], kind: 'spell' });
  addGraveCard(s, 'inst6', 'p1', { manaCost: 6, types: ['Instant'], subtypes: [], kind: 'spell' });
  assert.ok(execute(s, { type: 'play_land', playerId: 'p1', objectId: 'sanct' }).ok);
  // Trigger wejścia lądu (enteredUntapped) ląduje na stosie — drenuj.
  resolveStack(s);
  const { cmd } = pick(s);
  assert.equal(cmd.type, 'resolve_trigger_target');
  assert.equal(cmd.targetId, 'inst6', 'na wierzch idzie instant za 6, nie pierwszy za 2 (remis-0 skubał pierwszego)');
});

test('C-R2 anti-over-fix: brak sensownego celu z grobu = none, nie wymuszony wybór', () => {
  // Trigger optionAL: pusty grób → jedyna oferta to none/brak; bot nie może
  // wymyślić celu, którego nie ma (oferta = walidacja, L48).
  const s = game();
  library(s, 'p1', 5);
  addMana(s, 'p1', 8, { colors: ['W', 'U', 'B', 'R', 'G'] });
  addCard(s, 'slayer', 'ironclad-slayer', 'p1');
  assert.ok(execute(s, { type: 'cast_permanent', playerId: 'p1', objectId: 'slayer' }).ok);
  resolveStack(s);
  const { cmd } = pick(s);
  assert.ok(cmd.type !== 'resolve_trigger_target' || cmd.targetId == null || cmd.targetIds == null,
    `pusty grób nie otwiera wyboru celu: ${JSON.stringify(cmd)}`);
});
