// Audyt Batch53, C-R3 (zlecenie właściciela 2026-09-05): wybór ofiary
// refleksowej (Glorifier of Suffering — „you may sacrifice another creature
// or artifact. When you do, [...]").
// (b) artefakty/nie-stwory liczone były jako 0 → cenny artefakt był
//     „darmową ofiarą" przed tokenem 1/1 (artefakt 40 > token 37 > 3/3 31).
// (a) opcjonalna ofiara NIGDY nie rezygnowała — nawet gdy refleks nie ma na
//     kim działać (jałowe poświęcenie). Engine anotuje oferty flagą
//     reflexReady (precedens cmd.friendly M150); bot przy false wybiera skip.
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

function addVanilla(s, id, pid, { power = 2, toughness = 2, zone = 'battlefield' } = {}) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: pid, ownerId: pid,
    zone, kind: 'creature', power, toughness, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
  });
  return s.objects.get(id);
}

function addArtifact(s, id, pid, manaCost = 3) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: pid, ownerId: pid,
    zone: 'battlefield', kind: 'artifact', manaCost, power: null, toughness: null,
    abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors: [],
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

const GLOR_REFLEX = {
  type: 'triggered',
  effect: { type: 'add_counter', counter: '+1/+1', amount: 1 },
  trigger: { event: 'reflexive_sacrifice', requiresTarget: { type: 'creature', count: 2, upTo: true } },
};

test('C-R3b: Glorifier poświęca token 1/1, nie artefakt za 6 many', () => {
  const s = game();
  library(s, 'p1', 5);
  addMana(s, 'p1', 8, { colors: ['W', 'U', 'B', 'R', 'G'] });
  addCard(s, 'glor', 'glorifier-of-suffering', 'p1');
  addArtifact(s, 'art6', 'p1', 6); // cenny artefakt — pierwszy kandydat
  addVanilla(s, 'tok', 'p1', { power: 1, toughness: 1 });
  addVanilla(s, 'grub', 'p1', { power: 3, toughness: 3 });
  assert.ok(execute(s, { type: 'cast_permanent', playerId: 'p1', objectId: 'glor' }).ok);
  resolveStack(s);
  const { cmd } = pick(s);
  assert.equal(cmd.type, 'resolve_sacrifice_choice');
  assert.equal(cmd.targetId, 'tok', 'ofiara = najsłabsza wartościowo (token 1/1), nie artefakt liczący się jako 0');
});

test('C-R3a: refleks jałowy (brak celu dla „When you do") → bot rezygnuje', () => {
  const s = game();
  library(s, 'p1', 5);
  // Źródło jako nie-stwór (sztuczka harnessu, by refleks „target creature"
  // nie miał na kim działać) + jedyny kandydat ofiary = artefakt.
  addObject(s, {
    id: 'glor', instanceId: 'i-glor', cardId: 'glorifier-of-suffering', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'artifact', manaCost: 4, power: null, toughness: null,
    abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors: [],
  });
  addArtifact(s, 'art1', 'p1', 1);
  s.pendingSacrifice = {
    playerId: 'p1', candidateIds: ['art1'], optional: true,
    sourceId: 'glor', cardId: 'glorifier-of-suffering',
    reflexiveEvent: 'reflexive_sacrifice', reflexiveAbility: GLOR_REFLEX,
    restorePriorityTo: 'p1',
  };
  const view = playerView(s, 'p1');
  const sac = view.legalCommands.filter((c) => c.type === 'resolve_sacrifice_choice');
  assert.ok(sac.length === 2 && sac.some((c) => c.skip), `oferta skip+kandydat: ${JSON.stringify(sac)}`);
  assert.strictEqual(sac[0].reflexReady, false, 'engine anotuje jałowy refleks flagą reflexReady=false (M150-style)');
  const { cmd } = pick(s);
  assert.ok(cmd.skip === true, 'bot rezygnuje z bezcelowej ofiary (dawniej: nigdy)');
});

test('C-R3 anti-over-fix: obowiązkowa ofiara nadal wybiera najsłabszego stwora', () => {
  // Grave Exchange (ofiara obowiązkowa, bez refleksu) — polityka „najsłabszy
  // pierwszy" ma przetrwać C-R3 bez zmian: token 1/1 przed 3/3.
  const s = game();
  library(s, 'p1', 5);
  addVanilla(s, 'tok', 'p1', { power: 1, toughness: 1 });
  addVanilla(s, 'grub', 'p1', { power: 3, toughness: 3 });
  s.pendingSacrifice = {
    playerId: 'p1', candidateIds: ['grub', 'tok'], optional: false,
    sourceId: 'x', cardId: null, restorePriorityTo: 'p1',
  };
  const { cmd } = pick(s);
  assert.equal(cmd.type, 'resolve_sacrifice_choice');
  assert.equal(cmd.targetId, 'tok', 'ofiara obowiązkowa: najsłabszy stwór, bez flagi refleksu (bez zmian)');
});
