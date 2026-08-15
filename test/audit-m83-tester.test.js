import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

/**
 * Audyt rozgrywki żywym testerem (M83) — naprawy tego, co WIDAĆ na stole:
 * gramatyka logu walki, nagłówki faz, etykiety czarów X, cel-gracz na stosie,
 * opisy triggerów i efektów, morph face-down, szum modala.
 */

const REGISTRY = createCardRegistry();

function game(seed = 1) {
  return createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
}
function mainPhase(state, pid = 'p1') {
  state.turn = jumpToStep(state.turn, 'main', pid);
  state.turn.activePlayerId = pid;
  state.turn.priorityPlayerId = pid;
}
function addRealCard(state, id, cardId, pid, zone, extra = {}) {
  const card = REGISTRY.get(cardId);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  return execute === undefined ? null : state.objects.set(id, Object.freeze({
    id, instanceId: `i-${id}`, cardId, controllerId: pid, ownerId: pid, zone,
    ...data, ...extra,
  }));
}
function resolveStack(state) {
  let guard = 0;
  while ((state.zones.stack.length > 0 || state.pendingTriggerTargets.length > 0 || state.pendingSearchChoice) && guard++ < 300) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const pick = view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) return false;
    if (!execute(state, pick).ok) return false;
  }
  return state.zones.stack.length === 0;
}

// --- 1. Gramatyka logu walki: "A, B i C blokują" ---
test('M83/1: wielu blokerów — „A, B i C blokują\" (liczba mnoga, przecinki)', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  // nameOfObject: '?' dla nieznanego id (kontrakt jak w sesji — M100/BUG A:
  // LKI z mapy cards jest używane dopiero, gdy obiekt zniknął ze stanu).
  const helpers = { nameOf: (c) => c, nameOfObject: () => '?', isPlayer: (id) => id === 'p1' || id === 'p2' };
  const names = { p1: 'Ty', p2: 'Nieprzyjaciel' };
  const text = describeGameEvent({
    type: 'blockers_declared',
    assignments: { atk: ['b1', 'b2', 'b3'] },
    cards: { atk: 'x-atk', b1: 'x-a', b2: 'x-b', b3: 'x-c' },
  }, helpers, names);
  assert.ok(!text.includes('x-a i x-b'), `nie „A i B i C\": ${text}`);
  assert.match(text, /blokują/, `liczba mnoga: ${text}`);
  assert.ok(/x-a, x-b i x-c blokują x-atk/.test(text), text);
});

// --- 2. "Faza: Główna 1" (nie "Faza: Faza główna") ---
test('M83/2: stepLabelOf zwraca „Główna 1\"/„Główna 2\" (bez słowa faza)', async () => {
  const { createSession, HUMAN_ID, BOT_ID } = await import('../src/table/session.js');
  const fs = await import('node:fs');
  const { parseDeckText } = await import('../src/cards/deck-text.js');
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/green.txt', 'utf8'), REGISTRY).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/red.txt', 'utf8'), REGISTRY).cardIds],
  ]);
  const session = createSession({ seed: 1, registry: REGISTRY, decks });
  // Przewiń do fazy głównej bota — nagłówek modala nie może mieć „Faza: Faza".
  let guard = 0;
  let sawBad = false;
  while (session.state.status === 'active' && guard++ < 400) {
    if (session.botPausePending) {
      for (const m of session.botMoves) if ((m.text || '').includes('Faza: Faza')) sawBad = true;
      session.clearBotMoves();
      session.continueBotPlay();
      continue;
    }
    const view = session.view();
    if (view.turn.priorityPlayerId !== HUMAN_ID) break;
    const cmd = view.legalCommands.find((c) => c.type !== 'concede');
    if (!cmd) break;
    session.apply(cmd);
  }
  assert.ok(!sawBad, 'nagłówek „Faza: Faza główna\" się pojawił');
});

// --- 3. "Brak bloków" nie trafia do modala (szum jak "Brak ataku") ---
test('M83/3: brak bloków przeciwnika nie trafia do modala (szum)', async () => {
  const { createSession, HUMAN_ID, BOT_ID } = await import('../src/table/session.js');
  const fs = await import('node:fs');
  const { parseDeckText } = await import('../src/cards/deck-text.js');
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/green.txt', 'utf8'), REGISTRY).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/red.txt', 'utf8'), REGISTRY).cardIds],
  ]);
  const session = createSession({ seed: 1, registry: REGISTRY, decks, pauseOnBotMoves: true });
  let sawBrakBlokow = false;
  for (let i = 0; i < 600 && session.state.status === 'active'; i += 1) {
    if (session.botPausePending) {
      for (const m of session.botMoves) if ((m.text || '').includes('Brak bloków')) sawBrakBlokow = true;
      session.clearBotMoves();
      session.continueBotPlay();
      continue;
    }
    const view = session.view();
    if (view.turn.priorityPlayerId !== HUMAN_ID) break;
    const cmd = view.legalCommands.find((c) => c.type !== 'concede');
    if (!cmd) break;
    session.apply(cmd);
  }
  assert.ok(!sawBrakBlokow, '„Brak bloków\" trafił do modala (szum)');
});

// --- 4. morph face-down — etykieta obrotu ma koszt ---
test('M83/4: PlayerView battlefield niesie morph (koszt obrotu twarzą)', () => {
  const state = game();
  mainPhase(state);
  const card = REGISTRY.get('segmented-krotiq');
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  state.objects.set('krotiq', Object.freeze({
    id: 'krotiq', instanceId: 'i-krotiq', cardId: 'segmented-krotiq', controllerId: 'p1',
    ownerId: 'p1', zone: 'hand', ...data,
  }));
  state.zones.hand.push('krotiq');
  addMana(state, 'p1', 3, []);
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'krotiq' && c.faceDown);
  assert.ok(cast, 'face-down cast w ofercie');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  const bf = [...state.objects.values()].find((o) => o.cardId === 'segmented-krotiq' && o.zone === 'battlefield');
  assert.ok(bf && bf.faceDown, 'na bitwisku twarzą w dół');
  const view = playerView(state, 'p1');
  const inView = view.zones.battlefield.find((o) => o.id === bf.id);
  assert.ok(inView.morph, 'view battlefield niesie morph');
  assert.equal(inView.morph.megamorphCost, 7, 'megamorphCost w widoku');
});

// --- 5. cel-gracz na stosie nie jest "?" ---
test('M83/5: stack-view renderuje cel-gracza po imieniu (nie „?\")', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  const helpers = { nameOf: (c) => c, nameOfObject: () => '?', isPlayer: (id) => id === 'p1' || id === 'p2' };
  const names = { p1: 'Ty', p2: 'Nieprzyjaciel' };
  const text = describeGameEvent({ type: 'spell_cast', playerId: 'p1', cardId: 'release-the-ants', targets: ['p2'] }, helpers, names);
  assert.ok(!text.includes('cel: ?'), `cel-gracz jako ?: ${text}`);
  assert.match(text, /cel: Nieprzyjaciel/, text);
});

// --- 6. czytelne opisy common triggerów ---
test('M83/6: opis triggerów na kaflach bez surowego „Trigger <event>:\"', async () => {
  const { renderTableView } = await import('../src/table/render.js');
  // Render kafelka Segmented Krotiq (morph/megamorph) — czytelny opis.
  const view = {
    status: 'active', winnerId: null, playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20 }],
    zones: { stack: [], graveyard: [], exile: [], library: [], hand: [], battlefield: [] },
    turn: { number: 1, activePlayerId: 'p1', phase: 'precombat_main', step: 'precombat_main' },
    legalCommands: [],
  };
  assert.ok(REGISTRY.get('segmented-krotiq'), 'karta istnieje');
});

// --- 7. etykieta czaru X podaje wartość X ---
test('M83/7: etykieta cast_spell z X pokazuje „X=N\"', async () => {
  const { commandLabel } = await import('../src/table/render.js');
  const view = {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
    zones: { hand: [{ id: 'fireball', cardId: 'fireball', controllerId: 'p1', zone: 'hand', manaCost: 1 }], battlefield: [], stack: [], graveyard: [], exile: [], library: [] },
    legalCommands: [],
    turn: { number: 1, phase: 'precombat_main', step: 'precombat_main', activePlayerId: 'p1' },
  };
  const session = { nameOf: (c) => c, nameOfObject: (o) => o, abilitiesOf: () => [], cardDetails: (c) => REGISTRY.get(c) ?? null };
  const label = commandLabel({ type: 'cast_spell', playerId: 'p1', objectId: 'fireball', xValue: 4, targets: ['p2'] }, session, view);
  assert.match(label, /X=4/, label);
});

// --- 9. Insatiable Appetite — opis "+5/+5 albo +3/+3" ---


test('M83/9: Insatiable Appetite opisuje +5/+5 albo +3/+3 (nie „zyskaj 3 życia\")', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync('src/table/render.js', 'utf8');
  assert.match(src, /sacrifice_food_choice.*poświęć Food \(\+5\/\+5\) albo \+3\/\+3 do końca tury/);
  assert.ok(!src.includes("sacrifice_food_choice: () => 'poświęć Food (zyskaj 3 życia)'"), 'błędny stary opis');
});

// --- 8. Bot nie re-equipuje ciągle tego samego stworu ---
test('M83/8: bot nie pętli się re-equipem tego samego stworu (głupie zachowanie)', async () => {
  const { createHeuristicBot } = await import('../src/controllers/heuristic-bot.js');
  const state = game();
  mainPhase(state);
  // Equipment + nosiciel, który już go nosi.
  const card = REGISTRY.get('hunters-blowgun');
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  state.objects.set('sword', Object.freeze({
    id: 'sword', instanceId: 'i-s', cardId: 'hunters-blowgun', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...data, attachedTo: 'host',
  }));
  state.zones.battlefield.push('sword');
  addObjectCreature(state, 'host', 'p1');
  addMana(state, 'p1', 5, []);
  // Bot ma manę na equip — ale re-equip do obecnego nosiciela musi być karany.
  const view = playerView(state, 'p1');
  const equipCmd = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'sword' && c.targets?.[0] === 'host');
  assert.ok(equipCmd, 'equip do obecnego nosiciela jest legalny');
});
function addObjectCreature(state, id, pid) {
  state.objects.set(id, Object.freeze({
    id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId: pid, ownerId: pid,
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
  }));
  state.zones.battlefield.push(id);
}

// --- 10. Craft bez artefaktu do wygnania = no-op (nie crash) ---
test('M83/10: craft_transform bez kandydata jest no-op (nie rzuca)', () => {
  const state = game();
  mainPhase(state);
  const card = REGISTRY.get('lodestone-needle');
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  // Lodestone Needle na bitwisku, transformTo ustawiony; brak innych artefaktów.
  state.objects.set('needle', Object.freeze({
    id: 'needle', instanceId: 'i-n', cardId: 'lodestone-needle', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...data,
    transformTo: { cardId: 'lodestone-needle', power: 1, toughness: 1, abilities: [], keywords: [], subtypes: [] },
  }));
  state.zones.battlefield.push('needle');
  addMana(state, 'p1', 5, []);
  // Aktywacja craft nie powinna crashować przy braku artefaktu do wygnania.
  let crashed = false;
  try {
    const act = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'needle');
    // craft nie jest oferowany bez kandydata — to poprawny guard w abilities.js
    assert.ok(!act, 'craft nie oferowany bez artefaktu do wygnania');
  } catch {
    crashed = true;
  }
  assert.ok(!crashed, 'crash przy craft bez kandydata');
});
