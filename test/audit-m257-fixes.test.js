// M257 (audyt Żywym Testerem, pool Innistrad, g1001) — poprawki:
//
// K5 (CR 711.4a/711.7/711.8): DFC poza polem bitwy ma wyłącznie cechy
//    twarzy PRZEDNIEJ. W partii g1001 obrócony na tył Scorned Villager
//    (Moonscarred Werewolf) odbity Lunar Rejectionem został w ręce tyłem
//    (2/2, Czujność) i z ręki wszedł na pole bitwy TYŁEM — wg CR w ręce
//    widnieje przód (Scorned Villager 1/1), a rzut z ręki idzie na stos
//    przodem (711.7) i wchodzi przodem (711.8).
//
// K4 (panel „Rozgrywka"): zdarzenie `object_transformed` nie niosło
//    kontrolera, więc `isHumanHeadline` (M100/E5) dla transformu
//    własnego permanentu był martwy — wpis 'object_transformed' w
//    HUMAN_DIGEST_EVENTS nigdy nie zadziałał. Transform człowieka był
//    widoczny tylko w głównym logu, nie w podsumowaniu pauzy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { setupCardMatch } from '../src/cards/materialize.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { playerView, execute } from '../src/engine/game-state.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { queueTriggerToStack } from '../src/engine/triggers.js';
import { jumpToStep } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();
const BRG = parseDeckText(readFileSync('decks/innistrad-brg.txt', 'utf8'), REGISTRY).cardIds;
const WU = parseDeckText(readFileSync('decks/innistrad-wu.txt', 'utf8'), REGISTRY).cardIds;

function freshState() {
  return setupCardMatch({
    seed: 11,
    players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([['p1', BRG], ['p2', WU]]),
    registry: REGISTRY,
  });
}

function findCardId(state, cardId) {
  for (const [id, o] of state.objects) {
    if (o.cardId === cardId && (o.zone === 'hand' || o.zone === 'library')) return id;
  }
  return null;
}

/** Pełna runda passów aż do pustego stosu (wzorzec: audit-batch26). */
function resolveStack(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 200) {
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

/**
 * P1 na polu bitwy + WŁASNY trigger upkeep na stosie + pełna runda passów.
 * Deterministyczny tor obrotu front→back przez generyczną ścieżkę
 * rozstrzygania triggerów (bez ręcznego odpalania processTriggers).
 */
function flipFrontToBack(state) {
  const hid = findCardId(state, 'scorned-villager');
  assert.ok(hid, 'Scorned Villager w ręce/bibliotece talii BRG');
  const source = state.objects.get(hid);
  assert.equal(source.frontFaceId, 'scorned-villager', 'frontFaceId z materializacji (karta z talii = przód)');
  assert.equal(source.transformTo?.cardId, 'moonscarred-werewolf', 'transformTo z createCardDeck');
  const bfId = moveObjectDirectly(state, hid, 'battlefield', `bf-villager-${hid}`).id;
  const ability = REGISTRY.get('scorned-villager').abilities.find((a) => a.trigger?.event === 'upkeep');
  assert.ok(ability, 'trigger upkeep w definicji Scorned Villager');
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.passes = 0;
  queueTriggerToStack(state, ability, state.objects.get(bfId), [], []);
  assert.ok(resolveStack(state), 'stos (trigger transform) rozstrzygnięty');
  return bfId;
}

test('M257/K5: obrócony DFC opuszczający pole bitwy wraca przodem (CR 711.4a)', () => {
  const state = freshState();
  const bfId = flipFrontToBack(state);
  const flipped = state.objects.get(bfId);
  assert.equal(flipped.cardId, 'moonscarred-werewolf', 'obrotu front→back dokonał się');
  assert.equal(flipped.power, 2);
  assert.equal(flipped.toughness, 2);

  // Bounce na rękę (to samo robi Lunar Rejection: moveObjectDirectly).
  const handId = moveObjectDirectly(state, bfId, 'hand', `hand-villager-${bfId}`).id;
  const inHand = state.objects.get(handId);
  assert.equal(inHand.cardId, 'scorned-villager', 'CR 711.4a: w ręce twarz PRZEDNIA');
  assert.equal(inHand.cardName, 'Scorned Villager');
  assert.equal(inHand.power, 1);
  assert.equal(inHand.toughness, 1);
  assert.equal(inHand.frontFaceId, 'scorned-villager');
  assert.equal(inHand.transformTo?.cardId, 'moonscarred-werewolf', 'transformTo dalej wskazuje na tył (flicker w obie strony)');
  assert.equal(inHand.transformTo?.cardName, 'Moonscarred Werewolf');

  // LKI (CR 603.10) zachowuje twarz z pola bitwy — rejestr ma TYŁ.
  const lki = state.lastKnownObjects?.get(bfId);
  assert.equal(lki?.cardId, 'moonscarred-werewolf', 'LKI = stan na polu bitwy (tył)');

  // Powtórny rzut wchodzi przodem (CR 711.7/711.8).
  const bf2 = moveObjectDirectly(state, handId, 'battlefield', `bf2-villager-${handId}`).id;
  const reentered = state.objects.get(bf2);
  assert.equal(reentered.cardId, 'scorned-villager', 'rzut z ręki wchodzi PRZODEM');
  assert.equal(reentered.power, 1);
});

test('M257/K5: DFC na przodzie opuszczający pole bitwy nie zmienia się (guard no-op)', () => {
  const state = freshState();
  const hid = findCardId(state, 'scorned-villager');
  assert.ok(hid);
  const bfId = moveObjectDirectly(state, hid, 'battlefield', `bf-noflip-${hid}`).id;
  const handId = moveObjectDirectly(state, bfId, 'hand', `hand-noflip-${bfId}`).id;
  const inHand = state.objects.get(handId);
  assert.equal(inHand.cardId, 'scorned-villager');
  assert.equal(inHand.power, 1);
  assert.equal(inHand.transformTo?.cardId, 'moonscarred-werewolf');
});

test('M257/K5: obrotu na polu bitwy NIE rusza reset (tylko wyjście z pola)', () => {
  const state = freshState();
  const bfId = flipFrontToBack(state);
  // Powrót tyłem na pole bitwy (np. reanimacja/wygnanie→stół) — twarz się nie zmienia.
  const handId = moveObjectDirectly(state, bfId, 'hand', `hand-re-${bfId}`).id;
  const bf2 = moveObjectDirectly(state, handId, 'battlefield', `bf2-re-${handId}`).id;
  const onField = state.objects.get(bf2);
  assert.equal(onField.cardId, 'scorned-villager', 'po drodze przez rękę wrócił przodem');
  // ...a drugi obrót (przez trigger) dalej działa — flicker w obie strony.
  const ability = REGISTRY.get('scorned-villager').abilities.find((a) => a.trigger?.event === 'upkeep');
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.passes = 0;
  queueTriggerToStack(state, ability, state.objects.get(bf2), [], []);
  assert.ok(resolveStack(state), 'drugi obrót rozstrzygnięty');
  assert.equal(state.objects.get(bf2).cardId, 'moonscarred-werewolf');
});

test('M257/K4: zdarzenie object_transformed niesie kontrolera (do panelu Rozgrywka)', () => {
  const state = freshState();
  const bfId = flipFrontToBack(state);
  const ev = state.events.filter((e) => e.type === 'object_transformed');
  assert.ok(ev.length >= 1, 'zdarzenie object_transformed wyemitowane');
  const flip = ev.find((e) => e.fromCardId === 'scorned-villager' && e.cardId === 'moonscarred-werewolf');
  assert.ok(flip, 'obrót front→back w zdarzeniach');
  assert.equal(flip.controllerId, 'p1', 'kontrolera w zdarzeniu (isHumanHeadline, M100/E5)');
  assert.equal(flip.objectId, bfId);
});

// --- Warstwa stołu: transform człowieka trafia do podsumowania „Rozgrywka" ---
test('M257/K4: transform własnego permanentu widoczny w panelu Rozgrywka', async () => {
  const { createSession, HUMAN_ID, BOT_ID } = await import('../src/table/session.js');
  const decks = new Map([[HUMAN_ID, BRG], [BOT_ID, WU]]);
  const session = createSession({ seed: 11, registry: REGISTRY, decks });
  const state = session.state;
  // Deterministycznie: postaw Scorned Villagera na polu i wstaw trigger na stos.
  const hid = findCardId(state, 'scorned-villager');
  assert.ok(hid, 'Scorned Villager u człowieka');
  const bfId = moveObjectDirectly(state, hid, 'battlefield', `bf-digest-${hid}`).id;
  const ability = REGISTRY.get('scorned-villager').abilities.find((a) => a.trigger?.event === 'upkeep');
  state.turn = jumpToStep(state.turn, 'main', HUMAN_ID);
  state.turn.activePlayerId = HUMAN_ID;
  state.turn.priorityPlayerId = HUMAN_ID;
  state.turn.passes = 0;
  queueTriggerToStack(state, ability, state.objects.get(bfId), [], []);

  let sawFlip = null;
  let guard = 0;
  while (state.status === 'active' && guard++ < 60 && !sawFlip) {
    if (session.botPausePending) {
      for (const m of session.botMoves) {
        if (m.text?.includes('przemienia się w Moonscarred Werewolf')) sawFlip = m.text;
      }
      session.clearBotMoves();
      session.continueBotPlay();
      continue;
    }
    const view = session.view();
    if (view.turn.priorityPlayerId !== HUMAN_ID) break;
    const cmd = view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type !== 'concede');
    if (!cmd) break;
    session.apply(cmd);
    for (const m of session.botMoves) {
      if (m.text?.includes('przemienia się w Moonscarred Werewolf')) sawFlip = m.text;
    }
  }
  assert.ok(sawFlip, `transform człowieka w podsumowaniu „Rozgrywka" (zobaczono: ${JSON.stringify(session.botMoves.map((m) => m.text).slice(0, 8))})`);
});
