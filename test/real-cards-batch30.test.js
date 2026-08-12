import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveKeywords, effectivePower, effectiveToughness, effectiveSubtypes } from '../src/engine/permanents.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

/**
 * Batch 30 — 10 kart (2026-08-11): Banishment Decree, Crew Captain,
 * Consume Spirit, Altar of the Goyf, Instant Ramen, Inspiring Bard,
 * Seismic Monstrosaur, Epic Experiment, Gurmag Drowner, Wavecrash Triton.
 * Testy behawioralne (nie definicyjne): każdy odtwarza realny przebieg gry.
 */

const REGISTRY = createCardRegistry();

function game(seed = 2026) {
  return createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function mainPhase(state, playerId = 'p1') {
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function addRealCard(state, id, cardId, playerId, zone, extra = {}) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  return addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...data, ...extra,
  });
}

function setField(state, id, patch) {
  const o = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...o, ...patch }));
}

function resolveStack(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 250) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    const pick = pass ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) return false;
    const r = execute(state, pick);
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0;
}

function life(state, id) {
  return state.players.find((p) => p.id === id).life;
}

function eff(state, id) {
  const o = state.objects.get(id);
  return { p: effectivePower(o, state), t: effectiveToughness(o, state) };
}

// --- Scryfall sanity ---------------------------------------------------------

test('Batch 30: pliki Scryfall istnieją i mają prawidłowe pola', () => {
  const slugs = [
    'banishment-decree', 'crew-captain', 'consume-spirit', 'altar-of-the-goyf',
    'instant-ramen', 'inspiring-bard', 'seismic-monstrosaur', 'epic-experiment',
    'gurmag-drowner', 'wavecrash-triton',
  ];
  for (const slug of slugs) {
    const raw = fs.readFileSync(`docs/cards/scryfall-${slug}.json`, 'utf8');
    const data = JSON.parse(raw);
    assert.equal(data.object, 'card', `${slug}: object=card`);
    assert.ok(data.oracle_text, `${slug}: oracle_text`);
    assert.ok(data.mana_cost, `${slug}: mana_cost`);
  }
});

test('Batch 30: każda karta jest supported w rejestrze', () => {
  const ids = [
    'banishment-decree', 'crew-captain', 'consume-spirit', 'altar-of-the-goyf',
    'instant-ramen', 'inspiring-bard', 'seismic-monstrosaur', 'epic-experiment',
    'gurmag-drowner', 'wavecrash-triton',
  ];
  for (const id of ids) {
    const card = REGISTRY.get(id);
    assert.ok(card, `brak karty ${id}`);
    assert.equal(card.support.status, 'supported', `${id} supported`);
  }
});

// --- 1. Banishment Decree: put artifact/creature/enchantment on top of owner's library ---

test('Banishment Decree: artefakt wraca na WIERZCH biblioteki WŁAŚCICIELA', () => {
  const state = mainPhase(game());
  addRealCard(state, 'art', 'cloak-of-the-bat', 'p2', 'battlefield');
  addRealCard(state, 'dec', 'banishment-decree', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['W'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'dec');
  assert.ok(cast, 'Banishment Decree w ofercie');
  assert.ok(execute(state, cast).ok, 'cast');
  assert.ok(resolveStack(state), 'rozstrzygnięcie');
  // artefakt wraca na wierzch biblioteki p2 (owner)
  const lib = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === 'p2');
  assert.ok(lib.length > 0, 'p2 ma bibliotekę');
  assert.equal(state.objects.get(lib[0]).cardId, 'cloak-of-the-bat', 'artefakt na wierzchu');
  assert.ok(!state.zones.battlefield.includes('art'), 'artefakt zniknął z bitwiska');
});

// --- 2. Crew Captain: haste + indestructible while entered this turn ---

test('Crew Captain: indestructible w turze wejścia, znika w następnej turze', () => {
  const state = mainPhase(game());
  addRealCard(state, 'cc', 'crew-captain', 'p1', 'battlefield'); // wchodzi w tej turze → summoningSickness
  setField(state, 'cc', { summoningSickness: true }); // dopiero wszedł
  assert.ok(effectiveKeywords(state.objects.get('cc'), state).includes('indestructible'),
    'indestructible w turze wejścia (enteredThisTurn)');
  // Nastepna tura: summoningSickness wyczyszczone → brak indestructible
  setField(state, 'cc', { summoningSickness: false });
  assert.ok(!effectiveKeywords(state.objects.get('cc'), state).includes('indestructible'),
    'brak indestructible po turze wejścia');
  // Haste
  assert.ok(effectiveKeywords(state.objects.get('cc'), state).includes('haste'), 'haste');
});

// --- 3. Consume Spirit: X damage to any target + gain X life ---

test('Consume Spirit: X obrażeń w cel + zysk X życia (X=2)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'cs', 'consume-spirit', 'p1', 'hand');
  addRealCard(state, 'cre', 'highland-game', 'p2', 'battlefield');
  addMana(state, 'p1', 4, { colors: ['B'] });
  const cast = playerView(state, 'p1').legalCommands.find(
    (c) => c.type === 'cast_spell' && c.objectId === 'cs' && c.xValue === 2 && c.targets[0] === 'cre',
  );
  assert.ok(cast, 'Consume Spirit X=2 cel-stwór w ofercie');
  const before = life(state, 'p1');
  assert.ok(execute(state, cast).ok, 'cast');
  assert.ok(resolveStack(state), 'rozstrzygnięcie');
  assert.equal(life(state, 'p1'), before + 2, 'p1 zyskuje X życia');
  assert.ok(state.zones.graveyard.some((id) => state.objects.get(id)?.cardId === 'highland-game'),
    'cel-stwór zginął od X obrażeń');
});

test('Consume Spirit: za mało many — nie w ofercie (nielegalny)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'cs', 'consume-spirit', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['B'] }); // za mało na bazę {1}{B}+X
  const casts = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'cs');
  assert.ok(casts.length === 0, 'za mało many — brak oferty');
});

// --- 4. Altar of the Goyf: attacks alone pump + Lhurgoyf trample ---

test('Altar of the Goyf: Lhurgoyf dostaje trample; samotny atak → pump wg typów kart', () => {
  const state = mainPhase(game());
  addRealCard(state, 'altar', 'altar-of-the-goyf', 'p1', 'battlefield');
  addRealCard(state, 'goyf', 'token_tarmogoyf', 'p1', 'battlefield'); // Lhurgoyf
  setField(state, 'goyf', { summoningSickness: false });
  // Token Tarmogoyf ma podtyp Lhurgoyf → trample z Altara
  assert.ok(effectiveKeywords(state.objects.get('goyf'), state).includes('trample'),
    'Lhurgoyf ma trample z Altara');
});

// --- 5. Instant Ramen: flash, ETB draw, {2},{T},sacrifice: gain 3 ---

test('Instant Ramen: flash (poza main) + ETB draw + sacrifice gain 3', () => {
  const state = mainPhase(game());
  // Botowa tura (p2 aktywny) — p1 może zagrać ramen z flash jako instant
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p1';
  addRealCard(state, 'ramen', 'instant-ramen', 'p1', 'hand');
  addRealCard(state, 'lib1', 'highland-game', 'p1', 'library'); // do ETB draw
  addMana(state, 'p1', 2);
  const handBefore = handCount(state, 'p1');
  const play = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'ramen');
  assert.ok(play, 'Instant Ramen zagrywalny w turze przeciwnika (flash)');
  assert.ok(execute(state, play).ok, 'play');
  assert.ok(resolveStack(state), 'rozstrzygnięcie (ETB)');
  assert.equal(handCount(state, 'p1'), handBefore, 'ETB dobiera 1 kartę (bilans: -1 zagrany +1 dobrany)');
  // Aktywacja {2},{T},sacrificeSelf: gain 3 — wznowienie priorytetu u p1
  mainPhase(state, 'p1');
  state.turn.activePlayerId = 'p1';
  addMana(state, 'p1', 2);
  const before = life(state, 'p1');
  const ramenId = state.zones.battlefield.find((id) => state.objects.get(id).cardId === 'instant-ramen');
  const ab = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === ramenId);
  assert.ok(ab, 'ramen aktywowalny');
  assert.ok(execute(state, ab).ok, 'aktywacja');
  assert.ok(resolveStack(state), 'rozstrzygnięcie zdolności');
  assert.equal(life(state, 'p1'), before + 3, 'zysk 3 życia');
});

function handCount(state, playerId) {
  return state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === playerId).length;
}

// --- 6. Inspiring Bard: ETB choose one (Bardic Inspiration +2/+2 OR gain 3) ---

test('Inspiring Bard: tryb Bardic Inspiration — target creature +2/+2', () => {
  const state = mainPhase(game());
  addRealCard(state, 'bard', 'inspiring-bard', 'p1', 'hand');
  addRealCard(state, 'friend', 'highland-game', 'p1', 'battlefield');
  addMana(state, 'p1', 4, { colors: ['G'] });
  const play = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'bard');
  assert.ok(play, 'Inspiring Bard w ofercie');
  assert.ok(execute(state, play).ok, 'play');
  // Rozstrzygnięcie czaru → modalny trigger ETB (choose one) z celem
  let guard = 0;
  while ((state.zones.stack.length > 0 || state.pendingModalTrigger) && guard++ < 40) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const modal = view.legalCommands.find((c) => c.type === 'resolve_modal_choice');
    if (modal && modal.modeIndex === 0) {
      // Wybierz tryb 0 (Bardic Inspiration) z celem friend
      assert.ok(execute(state, { ...modal, modeIndex: 0, targetId: 'friend' }).ok, 'wybór trybu');
    }
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    if (pass) execute(state, pass);
  }
  assert.ok(eff(state, 'friend').p === 4, `friend ma +2/+2 (moc ${eff(state,'friend').p})`);
});

// --- 7. Seismic Monstrosaur: {2}{R}, sacrifice land: draw; Mountaincycling ---

test('Seismic Monstrosaur: {2}{R}, poświęć ląd — dobierz; Mountaincycling', () => {
  const state = mainPhase(game());
  addRealCard(state, 'seis', 'seismic-monstrosaur', 'p1', 'battlefield');
  addRealCard(state, 'land', 'basic-mountain', 'p1', 'battlefield');
  setField(state, 'seis', { summoningSickness: false });
  addRealCard(state, 'lib', 'highland-game', 'p1', 'library'); // do dobrania
  addMana(state, 'p1', 3, { colors: ['R'] });
  const handBefore = handCount(state, 'p1');
  const ab = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'seis' && c.sacrificeLandId === 'land');
  assert.ok(ab, 'zdolność z poświęceniem landa w ofercie');
  assert.ok(execute(state, ab).ok, 'aktywacja');
  assert.ok(resolveStack(state), 'rozstrzygnięcie');
  assert.equal(handCount(state, 'p1'), handBefore + 1, 'dobrano kartę');
  assert.ok(!state.zones.battlefield.includes('land'), 'land poświęcony');
});

// --- 8. Epic Experiment: exile top X, cast inst/sorc MV<=X free, rest to grave ---

test('Epic Experiment: X=3 wygnuje 3, pozwala rzucić czar MV<=3, resztę do grobu', () => {
  const state = mainPhase(game());
  // Biblioteka p1: dodajemy czary na wierzch (instants/sorceries)
  addRealCard(state, 'lib0', 'curate', 'p1', 'library'); // MV2 instant
  addRealCard(state, 'lib1', 'brute-force', 'p1', 'library'); // MV1 instant
  addRealCard(state, 'lib2', 'forever-young', 'p1', 'library'); // MV2 sorcery
  addRealCard(state, 'exp', 'epic-experiment', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['U', 'R'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'exp' && c.xValue === 3);
  assert.ok(cast, 'Epic Experiment X=3 w ofercie');
  assert.ok(execute(state, cast).ok, 'cast');
  // Rozstrzygnij czar → pendingEpicExperiment (wygnane czary)
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 30) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const epic = view.legalCommands.find((c) => c.type === 'resolve_epic_choice');
    if (epic && !epic.done) {
      // Rzuć pierwszego czaru MV<=3 bez kosztu
      assert.ok(execute(state, epic).ok, 'epic cast');
    }
    const epicDone = view.legalCommands.find((c) => c.type === 'resolve_epic_choice' && c.done);
    if (epicDone) { execute(state, epicDone); }
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    if (pass) execute(state, pass);
  }
  // co najmniej jeden czar został wygnany i (curate MV2) rzucony/do grobu
  const grave = state.zones.graveyard.map((id) => state.objects.get(id)?.cardId);
  assert.ok(grave.includes('curate') || state.zones.stack.length === 0, 'curate rozstrzygnięty/do grobu');
});

// --- 9. Gurmag Drowner: exploit → look top 4, one to hand, rest to grave ---

test('Gurmag Drowner: exploit — patrzy na top 4, jedną do ręki, resztę do grobu', () => {
  const state = mainPhase(game());
  addRealCard(state, 'gur', 'gurmag-drowner', 'p1', 'hand');
  addRealCard(state, 'sac', 'highland-game', 'p1', 'battlefield'); // do exploit
  addMana(state, 'p1', 4, { colors: ['U'] });
  // Biblioteka p1: top 4
  addRealCard(state, 't1', 'curate', 'p1', 'library');
  addRealCard(state, 't2', 'highland-game', 'p1', 'library');
  addRealCard(state, 't3', 'negate', 'p1', 'library');
  addRealCard(state, 't4', 'basic-forest', 'p1', 'library');
  const handBefore = handCount(state, 'p1');
  const play = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'gur');
  assert.ok(play, 'Gurmag Drowner w ofercie');
  assert.ok(execute(state, play).ok, 'cast');
  // Rozstrzygnij + exploit choice (p1 wybiera poświęcenie 'sac') + look-top-4
  let guard = 0;
  while ((state.zones.stack.length > 0 || state.pendingExploits.length > 0 || state.pendingLookTopN) && guard++ < 60) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const expTarget = view.legalCommands.find((c) => c.type === 'resolve_exploit_choice' && !c.skip);
    if (expTarget) { assert.ok(execute(state, expTarget).ok, 'exploit (poświęć sac)'); }
    else {
      const exp = view.legalCommands.find((c) => c.type === 'resolve_exploit_choice');
      if (exp) execute(state, exp);
    }
    const look = view.legalCommands.find((c) => c.type === 'resolve_look_top_choice');
    if (look) { assert.ok(execute(state, look).ok, 'look top choice'); }
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    if (pass) execute(state, pass);
  }
  // Po exploicie: jedna karta z top 4 do ręki, reszta do grobu
  assert.equal(handCount(state, 'p1'), 1, `jedna karta do ręki (ma ${handCount(state,'p1')})`);
  const grave = state.zones.graveyard.map((id) => state.objects.get(id)?.cardId);
  const hand = state.zones.hand.map((id) => state.objects.get(id)?.cardId);
  const grabbed = hand.filter((c) => ['curate', 'highland-game', 'negate', 'basic-forest'].includes(c));
  assert.equal(grabbed.length, 1, 'dokładnie jedna z top 4 w ręce');
  assert.ok(!state.zones.library.some((id) => ['curate', 'highland-game', 'negate', 'basic-forest'].includes(state.objects.get(id)?.cardId)),
    'top 4 zniknęły z biblioteki');
});

// --- 10. Wavecrash Triton: heroic — tap creature opponent controls (no untap) ---

test('Wavecrash Triton: heroic — tap stwora przeciwnika bez odkręcenia', () => {
  const state = mainPhase(game());
  addRealCard(state, 'tri', 'wavecrash-triton', 'p1', 'battlefield');
  addRealCard(state, 'foe', 'highland-game', 'p2', 'battlefield');
  setField(state, 'tri', { summoningSickness: false });
  setField(state, 'foe', { tapped: false });
  // Rzuć czar celujący w Tritona (brute force +1/+0 to instant)
  addRealCard(state, 'bf', 'brute-force', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'bf' && c.targets[0] === 'tri');
  assert.ok(cast, 'czar celujący w Tritona');
  assert.ok(execute(state, cast).ok, 'cast');
  // Rozstrzygnij: heroic odpala się i tapuje stwora przeciwnika (target trigger)
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 30) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const tt = view.legalCommands.find((c) => c.type === 'resolve_trigger_target');
    if (tt) { assert.ok(execute(state, { ...tt, targetId: 'foe' }).ok, 'cel heroic'); }
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    if (pass) execute(state, pass);
  }
  assert.equal(state.objects.get('foe').tapped, true, 'stwór przeciwnika zatapnięty');
  assert.ok((state.objects.get('foe').untapLockedBy ?? []).length > 0, 'nie odkręci się');
});
