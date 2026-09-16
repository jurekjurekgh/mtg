// Audyt PR #123 (sesja arena/01a0aac8-mtg, 2026-09-16) — znaleziska A1+A2.
//
// A1 (M359, CR 514.3a): model cleanupu liczył tylko AKTYWNOŚĆ STOSU, a reguła
// otwiera priorytet także po SAMYM wykonaniu akcji stanowych — dosłownie
// (mtg.wiki/page/Ending_phase, CR effective 2026-08-07):
//
//   „514.3a. At this point, the game checks to see if any state-based actions
//   would be performed and/or any triggered abilities are waiting to be put
//   onto the stack. If so, those state-based actions are performed, then those
//   triggered abilities are put on the stack, then the active player gets
//   priority. Players may cast spells and activate abilities. Once the stack
//   is empty and all players pass in succession, another cleanup step begins."
//
// Scenariusz (realne ścieżki silnika): Goblin Piker 2/1 (wytrzymałość 1)
// z EOT-buffem +2/+2 z RZUCONEGO Savage Surge (cast_spell przez execute) i
// dwoma licznikami −1/−1 (addCounter) — efektywna wytrzymałość 1 w turze,
// −1 bez buffa. Wejście w cleanup (514.2) zdejmuje buff → SBA 704.5f →
// creature_destroyed PO stemplu aktywności → 514.3a MUSI otworzyć priorytet.
//






//
// A2 (M360/B3, klasa L16): `pendingCombatSecondPass` blokuje rundę passów
// (game-state.js, bramka obok pendingDamageAssignment) i zmienia przyszłe
// możliwości (czy następny resolve_combat wykona przebieg zwykły — CR 510.4),
// więc dwa stany różniące się wyłącznie tą flagą NIE mogą mieć tego samego
// odcisku (reguła M323/F3: pole zmieniające przyszłe możliwości należy do
// fingerprintu; replay/no-op byłyby na nie ślepe).
//
// RED→GREEN: oba testy czerwone przed naprawą. Mutacje (L13):
//  - usuń `creature_destroyed` z dowodów SBA w cleanupHadActivity → T2 RED;
//  - usuń `pendingCombatSecondPass` z PENDING_DECISION_FIELDS → T4 RED.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import {
  createGameState, addObject, execute, playerView, cleanupPriorityOpen,
} from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { addCounter } from '../src/engine/counters.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';


const REGISTRY = createCardRegistry();

function setup() {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function putCard(state, id, cardId, controllerId = 'p1', zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

/**
 * Wspólny setup A1: piker p1 (T=1) utrzymywany przy życiu EOT-buffem z
 * RZUCONEGO Savage Surge (+2/+2, realna ścieżka cast_spell→resolve), z dwoma
 * licznikami −1/−1 (efektywna T=1 w turze, −1 bez buffa). Wejście w cleanup
 * zdejmuje buff → śmierć SBA w 514.3a-checku.
 */
function setupSbaDeathInCleanup(state) {
  putCard(state, 'piker', 'goblin-piker');
  putCard(state, 'src', 'goblin-piker', 'p2');
  putCard(state, 'surge', 'savage-surge', 'p1', 'hand');
  putCard(state, 'surge2', 'savage-surge', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['G'] });
  const cast = execute(state, {
    type: 'cast_spell', playerId: 'p1', objectId: 'surge', targets: ['piker'],
  });
  assert.ok(cast.ok, `cast Savage Surge: ${cast.reason ?? ''}`);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, 'surge się rozstrzyga');
  addCounter(state, 'piker', '-1/-1', 2);
  // Wejście w cleanup: koniec kroku end → pełna runda passów → nextTurnStep.
  state.turn = jumpToStep(state.turn, 'end', state.turn.activePlayerId);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(state.turn.step, 'cleanup', 'po rundzie passów z end — cleanup');
  // Śmierć SBA MUSI nastąpić właśnie tu (514.2 zdejmuje buff, SBA w accepted):
  assert.ok(
    state.zones.graveyard.some((id) => state.objects.get(id)?.cardId === 'goblin-piker'
      && state.objects.get(id)?.ownerId === 'p1'),
    'piker ginie SBA przy wejściu w cleanup (buff EOT zszedł, liczniki zostały)',
  );
  assert.ok(
    state.events.slice(state.cleanupActivityFromEvent ?? 0)
      .some((e) => e.type === 'creature_destroyed'),
    'creature_destroyed PO stemplu aktywności cleanupu',
  );
}

function passRound(state) {
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
}

test('A1/T1 (CR 514.3a): SBA w cleanupie otwiera priorytet — oferta i wykonanie cast_spell', () => {
  const state = setup();
  setupSbaDeathInCleanup(state);
  // Pula many wyczyściona przy wejściu w cleanup (CR 500.4) — dosypujemy
  // testowo (helper), bo tap_for_mana jest w oknie legalne dopiero PO
  // otwarciu priorytetu, a chcemy sprawdzić samą bramkę rzutu.
  addMana(state, 'p1', 4, { colors: ['G'] });
  assert.equal(cleanupPriorityOpen(state), true,
    'SBA wykonane w cleanupie → priorytet otwarty (CR 514.3a: „then the active player gets priority")');
  const offers = playerView(state, 'p1').legalCommands;
  assert.ok(offers.some((c) => c.type === 'cast_spell'),
    'oferta cast_spell w cleanupie po SBA („Players may cast spells…")');
  const manual = execute(state, {
    type: 'cast_spell', playerId: 'p1', objectId: 'surge2', targets: ['src'],
  });
  assert.ok(manual.ok, `cast w otwartym cleanupie legalny: ${manual.reason ?? ''}`);
  // Runda passów przy NIEPUSTYM stosie rozstrzyga czar (okno trwa — CR
  // 514.3a: „Once the stack is EMPTY and all players pass in succession…").
  passRound(state);
  assert.ok(state.zones.stack.length === 0, 'stos pusty po rozstrzygnięciu surge2');
  assert.equal(state.turn.step, 'cleanup', 'nadal cleanup — runda z niepustym stosem nie kończy okna');
  assert.equal(cleanupPriorityOpen(state), true, 'okno trwa do rundy passów przy pustym stosie');
  // Wyjście z okna: pełna runda passów przy pustym stosie → KOLEJNY cleanup
  // (514.3a: „…another cleanup step begins"), nie następna tura.
  passRound(state);
  assert.equal(state.turn.step, 'cleanup', 'aktywność w cleanupie → kolejny cleanup, nie nowa tura');
  assert.equal(state.turn.number, 1, 'nadal tura 1');
  // Nowy cleanup = nowy stempel: brak nowej aktywności → okno zamknięte
  // (pętla 514.3a terminuje; tu cast JUŻ odrzucony).
  assert.equal(cleanupPriorityOpen(state), false, 'kolejny cleanup bez aktywności — zamknięty');
  addMana(state, 'p1', 4, { colors: ['G'] });
  const after = execute(state, {
    type: 'cast_spell', playerId: 'p1', objectId: 'surge2', targets: ['src'],
  });
  assert.ok(!after.ok, 'rzut w kolejnym (pustym) cleanupie odrzucony — brak nieskończonej pętli');
  assert.equal(after.events.find((e) => e.type === 'command_rejected')?.reason, 'cleanup_no_priority',
    'powód odrzucenia: zamknięty cleanup (CR 514.3)');
  passRound(state);
  assert.equal(state.turn.number, 2, 'pusty kolejny cleanup kończy turę');
});

test('A1/T2 (CR 514.3a): pętla cleanup po SAMEJ aktywności SBA (bez rzutów i triggerów)', () => {
  const state = setup();
  setupSbaDeathInCleanup(state);
  // Czysta pętla SBA: nikt nic nie rzuca, pełna runda passów — 514.3a mówi
  // „another cleanup step begins", bo SBA zostały wykonane po wejściu.
  passRound(state);
  assert.equal(state.turn.step, 'cleanup', 'SBA bez triggerów też otwiera pętlę 514.3a');
  assert.equal(state.turn.number, 1, 'tura nie idzie dalej po pierwszej rundzie');
  assert.equal(cleanupPriorityOpen(state), false,
    'nowy stempel bez nowej aktywności — okno zamknięte (terminacja)');
  passRound(state);
  assert.equal(state.turn.number, 2, 'drugi (pusty) cleanup kończy turę');
});

test('A1/T3 (anty-regresja 514.1): discard z limitu ręki NIE otwiera priorytetu', () => {
  const state = setup();
  putCard(state, 'piker', 'goblin-piker');
  for (let i = 1; i <= 8; i += 1) putCard(state, `f${i}`, 'basic-forest', 'p1', 'hand');
  state.turn = jumpToStep(state.turn, 'end', state.turn.activePlayerId);
  passRound(state);
  assert.ok(state.pendingDiscardChoice, '514.1 pyta o discard');
  const discards = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'resolve_discard_choice');
  assert.ok(discards.length > 0);
  assert.ok(execute(state, discards[0]).ok);
  // Discard limitu ręki to akcja turowa 514.1 — same w sobie nie daje
  // priorytetu (eventy object_moved/card_discarded NIE są dowodem SBA).
  assert.equal(cleanupPriorityOpen(state), false, 'discard 514.1 nie otwiera okna');
  passRound(state);
  assert.equal(state.turn.number, 2, 'brak aktywności = brak kolejnego cleanupu');
});

test('A2/T4 (L16/M323-F3): pendingCombatSecondPass musi być w odciskie stanu', () => {
  // Flagę produkuje resolve_combat po pierwszym kroku obrażeń przy
  // first/double strike (M360/B3, CR 510.4); tu ustawiamy ją wprost, bo test
  // fingerprintu ma izolować pole (reset gry po walce to osobna ścieżka).
  const bare = setup();
  const withFlag = setup();
  withFlag.pendingCombatSecondPass = { defendingPlayerId: 'p2' };
  const fpBare = stateFingerprint(bare);
  const fpFlag = stateFingerprint(withFlag);
  assert.notEqual(fpBare, fpFlag,
    'dwa stany różniące się tylko pendingCombatSecondPass muszą mieć różne odciski (replay/no-op)');
});
