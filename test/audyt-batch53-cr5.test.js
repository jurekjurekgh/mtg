// Audyt Batch53, C-R5 (zlecenie właściciela 2026-09-05): sim wyścigu ignorował
// wygraną TRUCIZNĄ (infect liczony jak chip w życie). Liczniki trucizny
// przeciwnika są w widoku (players.poison) — zegar wygrywej to 10 − poison,
// nie życie. Przy 6+ truciznach wyścig ma się odpalać także przy pełnym życiu
// (wycisza kary ryzyka B3/M297, dokłada dopłatę), a przenikająca moc infect
// dostaje bonus lethal (+1000) jak życiowy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game(step = 'declare_attackers', pid = 'p1') {
  const s = createGameState({ seed: 53, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, step, pid);
  s.turn.activePlayerId = pid;
  s.turn.priorityPlayerId = pid;
  // Wysokie życie obu stron — wyścigu życiowego NIE MA (żadnych <= 10).
  for (const p of s.players) {
    p.life = 20;
    p.poison = 0;
  }
  return s;
}

function addCard(s, id, cardId, pid, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(s, {
    id, instanceId: `i-${id}`, cardId, controllerId: pid, ownerId: pid, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  s.objects.set(id, Object.freeze({ ...s.objects.get(id), summoningSickness: false }));
  return s.objects.get(id);
}

function addVanilla(s, id, pid, { power = 2, toughness = 2, keywords = [] } = {}) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: pid, ownerId: pid,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 1,
    abilities: [], keywords, subtypes: [], types: ['Creature'], colors: [],
  });
  return s.objects.get(id);
}

function addForest(s, id, pid, zone) {
  const def = REGISTRY.get('basic-forest');
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: 'basic-forest', controllerId: pid, ownerId: pid,
    zone, kind: 'land', manaCost: 0, abilities: [], keywords: [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: [],
  });
}

/** Plansza ryzyka (B3): mój 3/3 w otwartego, przeciwnik z MANĄ (bring-low
 * koszt 4) i znaną talią pełną removalu ×4 — hipergeometria P(holds) ≈ 0,72.
 * Bez wyścigu kara ryzyka wywraca atak poniżej passa; zegar trucizny (racing)
 * ma wyciszyć karę — na 9 truciznach licznik wygrywa z ryzykiem. */
function riskBoard(s, poison) {
  for (let i = 0; i < 10; i += 1) addForest(s, `L1${i}`, 'p1', 'library');
  const p2 = s.players.find((p) => p.id === 'p2');
  p2.poison = poison;
  p2.mana = 4; // otwarta mana na bring-low
  addVanilla(s, 'atk', 'p1', { power: 3, toughness: 3 });
  // Ręka (7) i biblioteka (20) przeciwnika — FoW: liczy się liczebność.
  for (let i = 0; i < 7; i += 1) addForest(s, `H2${i}`, 'p2', 'hand');
  for (let i = 0; i < 20; i += 1) addForest(s, `B2${i}`, 'p2', 'library');
}

/** Bot z znaną talią przeciwnika (B3): cztery bring-low (instant, 3 obrażenia). */
function chooseWithDeck(s, pid = 'p1', seed = 7) {
  const b = createHeuristicBot({ seed, opponentDeck: ['bring-low', 'bring-low', 'bring-low', 'bring-low'] });
  const cmd = b.chooseCommand(playerView(s, pid));
  return { cmd, entry: b.trace().at(-1) };
}

function choose(s, pid = 'p1', seed = 7) {
  const b = createHeuristicBot({ seed });
  const cmd = b.chooseCommand(playerView(s, pid));
  return { cmd, entry: b.trace().at(-1) };
}

test('C-R5: na 9 truciznach zegar trucizny wycisza karę ryzyka (B3) — bot atakuje', () => {
  const s = game();
  riskBoard(s, 9);
  const { cmd } = chooseWithDeck(s);
  assert.equal(cmd.type, 'declare_attackers');
  assert.ok((cmd.attackerIds ?? []).includes('atk'),
    'wyścig o 10. licznik: 3/3 idzie do ataku (racing wycisza karę ryzyka B3)');
});

test('C-R5 anti-over-fix: przy 0 trucizn kara ryzyka trzyma 3/3 w domu', () => {
  const s = game();
  riskBoard(s, 0);
  const { cmd } = chooseWithDeck(s);
  assert.ok(cmd.type !== 'declare_attackers' || (cmd.attackerIds ?? []).length === 0,
    `bez zegara trucizny kara B3 wywraca atak poniżej passa: ${JSON.stringify(cmd)}`);
});

test('C-R5: przenikająca moc infect ≥ 10 − poison dostaje bonus lethal', () => {
  const s = game();
  for (let i = 0; i < 10; i += 1) addForest(s, `L1${i}`, 'p1', 'library');
  s.players.find((p) => p.id === 'p2').poison = 9;
  addCard(s, 'inf', 'ichorclaw-myr', 'p1');
  // Pusta obrona: 1/1 infect = 10. licznik = wygrana (życie 20 nieistotne).
  const { entry } = choose(s);
  assert.ok((entry.score ?? 0) >= 1000,
    `truciznowy lethal premiowany jak życiowy (+1000), jest ${entry.score}`);
});
