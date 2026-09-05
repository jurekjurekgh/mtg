import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { coloredPipsOf } from '../src/engine/mana-cost.js';

/**
 * Audyt Batch53 → zlecenie właściciela 2026-09-05: C-R1–C-R7.
 * Ten plik: C-R1 (premia ETB w cast_permanent) + C-R7 (wycena wariantów
 * kicker/offspring — remis → pierwsza oferta).
 *
 * Metoda: score rzutu mierzony z trace() bota przy JEDNEJ rzutowalnej
 * karcie w ręce (deterministycznie; dwa zwykłe porównania zamiast
 * uzależniania się od kolejności oferty).
 */

const REGISTRY = createCardRegistry();

function game() {
  const s = createGameState({ seed: 53, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = 'p1';
  s.turn.priorityPlayerId = 'p1';
  return s;
}

function addRealCard(s, id, cardId, pid, zone = 'hand') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(s, {
    id, instanceId: `i-${id}`, cardId, controllerId: pid, ownerId: pid, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return s.objects.get(id);
}

/** Syntetyczna bliźniaczka-ciało: te same P/T i TA sama waga kosztu co
 * wzorzec (waga = manaCost + pipy kolorowe z def; syntetyk nie ma def
 * w rejestrze, więc coloredPipsOf = 0 — manaCost bliźniaka = wzorca
 * manaCost + liczba jego pipów), zero zdolności. */
function addTwin(s, id, refCardId, pid) {
  const ref = REGISTRY.get(refCardId);
  const pips = coloredPipsOf(refCardId).length; // dokładnie jak w gałęzi cast_permanent
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: pid, ownerId: pid,
    zone: 'hand', kind: 'creature', power: ref.power, toughness: ref.toughness,
    manaCost: (ref.manaCost ?? 0) + pips, keywords: [], abilities: [],
    subtypes: [], types: ['Creature'], colors: [], spell: undefined,
  });
  return { pips };
}

function addVanilla(s, id, pid, { power = 2, toughness = 2, manaCost = 1 } = {}) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: pid, ownerId: pid,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
  });
  s.objects.set(id, Object.freeze({ ...s.objects.get(id), summoningSickness: false }));
  return s.objects.get(id);
}

function addArtifact(s, id, pid, manaCost = 2) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: pid, ownerId: pid,
    zone: 'battlefield', kind: 'artifact', types: ['Artifact'], power: 0, toughness: 0,
    manaCost, abilities: [], keywords: [], subtypes: [], colors: [],
  });
  return s.objects.get(id);
}

function castScore(s, extraMana = 8) {
  addMana(s, 'p1', extraMana, { colors: ['W', 'U', 'B', 'R', 'G'] });
  const bot = createHeuristicBot({ seed: 7 });
  const cmd = bot.chooseCommand(playerView(s, 'p1'));
  const entry = bot.trace().at(-1);
  assert.equal(cmd.type, 'cast_permanent', `oczekiwano rzutu, wybrano ${cmd.type}`);
  assert.ok(entry, 'wpis trace');
  return { cmd, score: entry.score };
}

// =====================================================================
// C-R1 — premia ETB w cast_permanent
// =====================================================================

test('CR1: Acidic Slime (ETB destroy) wyceniony wyżej niż identyczne ciało', () => {
  const withEtb = game();
  addRealCard(withEtb, 'slime', 'acidic-slime', 'p1');
  addArtifact(withEtb, 'grim', 'p2', 4); // legalny cel destroy
  const s1 = castScore(withEtb).score;

  const plain = game();
  addArtifact(plain, 'grim', 'p2', 4);
  addTwin(plain, 'twin', 'acidic-slime', 'p1');
  const s2 = castScore(plain).score;

  assert.ok(s1 > s2, `ETB destroy powinno podnosić wycenę: ${s1} vs ${s2}`);
});

test('CR1: ETB destroy bez celu wroga ≈ zwykłe ciało (premia tylko przy celu)', () => {
  const noTarget = game();
  addRealCard(noTarget, 'slime', 'acidic-slime', 'p1'); // p2 bez artefaktów/lądów? jest basic land? nie — puste pole
  const s1 = castScore(noTarget).score;

  const plain = game();
  addTwin(plain, 'twin', 'acidic-slime', 'p1');
  const s2 = castScore(plain).score;

  // bez celu ETB nie dokłada premii (deathtouch/ewaluacja ciała bez zmian)
  assert.ok(Math.abs(s1 - s2) <= 1, `bez celu wroga premii nie ma: ${s1} vs ${s2}`);
});

test('CR1: Phyrexian Rager (ETB draw 1, lose 1) > bliźniak bez ETB', () => {
  const withEtb = game();
  for (let i = 0; i < 3; i += 1) addRealCard(withEtb, `L${i}`, 'basic-forest', 'p1', 'library');
  addRealCard(withEtb, 'rager', 'phyrexian-rager', 'p1');
  const s1 = castScore(withEtb).score;

  const plain = game();
  for (let i = 0; i < 3; i += 1) addRealCard(plain, `L${i}`, 'basic-forest', 'p1', 'library');
  addTwin(plain, 'twin', 'phyrexian-rager', 'p1');
  const s2 = castScore(plain).score;

  assert.ok(s1 > s2, `dobranie karty przewyższa stratę 1 życia: ${s1} vs ${s2}`);
});

// =====================================================================
// C-R7 — wycena wariantów kicker/offspring (remis → pierwsza oferta)
// =====================================================================

test('CR7: bot dopłaca kicker, gdy warunkowy ETB ma wartość (Kor Sanctifiers)', () => {
  const s = game();
  addArtifact(s, 'grim', 'p2', 4);
  addRealCard(s, 'kor', 'kor-sanctifiers', 'p1');
  addMana(s, 'p1', 8, { colors: ['W'] });
  const bot = createHeuristicBot({ seed: 7 });
  const cmd = bot.chooseCommand(playerView(s, 'p1'));
  assert.equal(cmd.type, 'cast_permanent');
  assert.equal(cmd.kicked, true, 'kicker z celem (artefakt wroga) jest wart dopłaty {W}');
});

test('CR7 anty-over-fix: bez celu kickerowego bot nie dopłaca', () => {
  const s = game();
  addRealCard(s, 'kor', 'kor-sanctifiers', 'p1'); // p2: puste pole
  addMana(s, 'p1', 8, { colors: ['W'] });
  const bot = createHeuristicBot({ seed: 7 });
  const cmd = bot.chooseCommand(playerView(s, 'p1'));
  assert.equal(cmd.type, 'cast_permanent');
  assert.notEqual(cmd.kicked, true, 'bez artefaktu/enchantmentu wroga kicker to wyrzucona manę');
});

test('CR7: bot dopłaca offspring za token-kopię (Rust-Shield Rampager)', () => {
  const s = game();
  addRealCard(s, 'ram', 'rust-shield-rampager', 'p1');
  addMana(s, 'p1', 9, { colors: ['G'] });
  const bot = createHeuristicBot({ seed: 7 });
  const cmd = bot.chooseCommand(playerView(s, 'p1'));
  assert.equal(cmd.type, 'cast_permanent');
  assert.equal(cmd.offspring, true, '1/1 token-kopia za {2} to dobra inwestycja przy nadmiarze many');
});
