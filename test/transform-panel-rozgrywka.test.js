// E6/A2 planu 2026-09-07 (zgłoszenie właściciela z żywej partii,
// s20603: Moonscarred Werewolf): transformacja wilkołaka BOTA NIE pokazała się
// w panelu „Rozgrywka" — informacja była tylko w logu. Dla gracza grającego
// przez modale panel to główny podgląd: widział „Scorned Villager — trigger
// (krok upkeep)", nie widział, że trigger wilkołaka obrócił kartę (a w LOG-ie
// było). Root cause ma DWA okna zależnie od KOLEJNOŚCI PASSÓW:
//  - bot pasuje pierwszy, stos rozstrzyga się przy passie CZŁOWIEKA
//    (botActing=false): object_transformed nie było w BOT_RESOLUTION_EVENTS,
//    więc noteBotMove je WYPADAŁ (trigger się pokazywał, transform nie);
//  - człowiek pasuje pierwszy, stos rozstrzyga się przy passie BOTA
//    (botActing=true): wchodził tekst, ale miniatury brak (poza
//    BOT_MOVE_CARD_EVENTS).
// Reguła klasowa (ADR 0002, CR 400.2): twarz permanentu na polu bitwy jest
// PUBLICZNA (P/T, zdolności, daybound/nightbound) — transformacja jest treścią
// panelu NIEZALEŻNIE od okna botActing/stosu, a miniatura pokazuje NOWĄ twarz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const REGISTRY = (await import('../src/cards/card-data.js')).createCardRegistry();
const { parseDeckText } = await import('../src/cards/deck-text.js');
const { playerView, execute } = await import('../src/engine/game-state.js');
const { jumpToStep } = await import('../src/engine/turn.js');
const { moveObjectDirectly } = await import('../src/engine/objects.js');
const { queueTriggerToStack } = await import('../src/engine/triggers.js');

const BRG = parseDeckText(readFileSync('decks/innistrad-brg.txt', 'utf8'), REGISTRY).cardIds;
const WU = parseDeckText(readFileSync('decks/innistrad-wu.txt', 'utf8'), REGISTRY).cardIds;

/**
 * Sesja z wilkołakiem BOTA na polu bitwy i jego triggerem transform na stosie.
 * `pierwszyPass` decyduje o oknie rozstrzygnięcia: 'bot' = żywy przypadek
 * s20603 (stos schodzi przy passie CZŁOWIEKA), 'human' = stos schodzi przy
 * passie BOTA.
 */
async function sesjaZWilkolakiemBota(pierwszyPass) {
  const { createSession, HUMAN_ID, BOT_ID } = await import('../src/table/session.js');
  // Wilkołak (BRG) po stronie BOTA — lustrzany obraz pinu M257/K4 (tam człowiek).
  const session = createSession({ seed: 11, registry: REGISTRY, decks: new Map([[HUMAN_ID, WU], [BOT_ID, BRG]]) });
  const state = session.state;
  // Wzorzec freshState (audyt M257): start sesji wisi na decyzjach mulligan —
  // do toru „trigger na stosie + passy" wchodzimy po ich wyczyszczeniu.
  state.pendingMulligans = [];
  const find = (cid) => {
    for (const [id, o] of state.objects) {
      if (o.cardId === cid && o.controllerId === BOT_ID && (o.zone === 'hand' || o.zone === 'library')) return id;
    }
    return null;
  };
  const hid = find('scorned-villager');
  assert.ok(hid, 'Scorned Villager po stronie bota');
  const bfId = moveObjectDirectly(state, hid, 'battlefield', `bf-bot-wolf-${hid}`).id;
  const ability = REGISTRY.get('scorned-villager').abilities.find((a) => a.trigger?.event === 'upkeep');
  state.turn = jumpToStep(state.turn, 'main', HUMAN_ID);
  state.turn.activePlayerId = HUMAN_ID;
  state.turn.priorityPlayerId = pierwszyPass === 'bot' ? BOT_ID : HUMAN_ID;
  state.turn.passes = 0;
  queueTriggerToStack(state, ability, state.objects.get(bfId), [], []);
  return { session, state, HUMAN_ID, BOT_ID };
}

const wpisTransformu = (session) => session.botMoves.find((m) => m.text?.includes('przemienia się w Moonscarred Werewolf'));

test('E6/A2 (żywa kolejność s20603): bot pasuje pierwszy — transform w panelu + miniatura', async () => {
  const { session, state, HUMAN_ID, BOT_ID } = await sesjaZWilkolakiemBota('bot');
  // Pass BOTA wykonujemy bezpośrednio na stanie (nie przez streaming sesji) —
  // w żywej partii ten pass nic nie wnosił do panelu (auto-pass bota).
  const botPass = playerView(state, BOT_ID).legalCommands.find((c) => c.type === 'pass_priority');
  assert.ok(botPass, 'bot może spasować jako pierwszy');
  assert.ok(execute(state, botPass).ok, 'pass bota przyjęty');
  // Pass CZŁOWIEKA przez sesję — to on zamyka parę i rozstrzyga trigger,
  // więc strumień zdarzeń niesie object_transformed przy botActing=false.
  const humanPass = playerView(state, HUMAN_ID).legalCommands.find((c) => c.type === 'pass_priority');
  assert.ok(humanPass, 'człowiek może spasować');
  session.apply(humanPass);
  const wpis = wpisTransformu(session);
  assert.ok(wpis, `transform bota w „Rozgrywce" (widziano: ${JSON.stringify(session.botMoves.map((m) => m.text).slice(0, 10))})`);
  assert.equal(wpis.cardId, 'moonscarred-werewolf',
    'miniatura = NOWA twarz (publiczna na polu bitwy, CR 400.2)');
});

test('E6/A2: człowiek pasuje pierwszy — stos schodzi przy passie BOTA (miniatura)', async () => {
  const { session, state, HUMAN_ID } = await sesjaZWilkolakiemBota('human');
  const humanPass = playerView(state, HUMAN_ID).legalCommands.find((c) => c.type === 'pass_priority');
  assert.ok(humanPass, 'człowiek może spasować');
  session.apply(humanPass);
  const wpis = wpisTransformu(session);
  assert.ok(wpis, 'transform w „Rozgrywce" również przy rozstrzygnięciu w oknie bota');
  assert.equal(wpis.cardId, 'moonscarred-werewolf', 'miniatura = nowa twarz (BOT_MOVE_CARD_EVENTS)');
});
