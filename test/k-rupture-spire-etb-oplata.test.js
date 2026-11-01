// K (zgłoszenie właściciela 2026-10-29): „Karta Rupture Spire. Bot zagrywa ją,
// mimo, że nie ma many na opłacenie kosztu (1) i musi ją poświęcić. Kompletnie
// bez sensu. Ta karta powinna być zagrywana tylko wtedy gdy bot ma manę na
// opłacenie (1).”
//
// Root cause (klasa L41): koszt ETB „zapłać {1} albo poświęć ten permanent”
// był modelowany WEWNĄTRZ `landPlayDelta`, czyli w klamrze ±14/25. Przy braku
// many delta spadała do −12, klamra dobijała do −14 i `play_land` dostawał
// 90 − 14 = 76 — komfortowo więcej niż pass (0), więc bot zagrywał ląd, który
// natychmiast ginął (CR 701.21a — Sacrifice przenosi permanent z pola bitwy
// prosto do cmentarza, bez okna na odpowiedź). „Stać na {1}” liczyło przy tym
// wyłącznie PULĘ, ignorując nietapnięte lądy, z których da się zapłacić
// w odpowiedzi na trigger.
//
// Reguła (jedno miejsce, deskryptorowo — ADR 0002): ląd z trigerem
// `enter_battlefield` + `payMana` + `sacrificeIfUnpaid` jest wyceniany przez
// `landEtbPayOrSacrifice`:
//  • stać na {N} (`ownOpenMana` = pula + własne NIETAPNIĘTE źródła many) →
//    realny koszt {N} obniża deltę lądu (dotychczasowa ścieżka);
//  • nie stać → kara POZA klamrą (`landEtbUpkeepUnplayablePenalty` 20), czyli
//    zagranie przegrywa z passem: land drop i karta przepadają.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf, createCardDeck } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REG = createCardRegistry();
const P1 = 'p1';

function land(s, id, cardId, tapped = false) {
  const [{ objectId, ...data }] = createCardDeck({ cardIds: [cardId], ownerId: P1, registry: REG });
  addObject(s, { ...data, id, instanceId: `i-${id}`, controllerId: P1, zone: 'battlefield' });
  if (tapped) s.objects.set(id, Object.freeze({ ...s.objects.get(id), tapped: true }));
}

/** Stół: Rupture Spire w ręce + (opcjonalnie) pula i nietapnięte lądy. */
function setup({ mana = 0, untappedLands = 0, tappedLands = 0, hand = 'rupture-spire' } = {}) {
  const s = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main1', P1);
  s.turn.activePlayerId = P1;
  s.turn.priorityPlayerId = P1;
  if (mana > 0) addMana(s, P1, mana);
  for (let i = 0; i < untappedLands; i += 1) land(s, `u${i}`, 'basic-forest');
  for (let i = 0; i < tappedLands; i += 1) land(s, `t${i}`, 'basic-forest', true);
  const def = REG.get(hand);
  addObject(s, {
    id: 'c1', instanceId: 'i-c1', cardId: hand, controllerId: P1, ownerId: P1, zone: 'hand',
    ...gameObjectDataOf(def),
  });
  return s;
}

function choose(state) {
  const bot = createHeuristicBot({ seed: 9 });
  const chosen = bot.chooseCommand(playerView(state, P1));
  const options = bot.trace().at(-1)?.options ?? [];
  const play = options.find((option) => option.cmd.startsWith('play_land'));
  return { chosen, playScore: play?.score };
}

const isPlay = (wynik) => wynik.chosen?.type === 'play_land';

// ── K/1: sedno zgłoszenia — brak jakiejkolwiek many ────────────────────────
test('K/1: brak many i brak nietapniętych źródeł — bot NIE zagrywa Rupture Spire', () => {
  const wynik = choose(setup({ mana: 0 }));
  assert.equal(isPlay(wynik), false, `bot zagrał ląd bez pokrycia: ${JSON.stringify(wynik.chosen)}`);
  assert.ok(wynik.playScore < 0, `play_land musi przegrać z passem, ma ${wynik.playScore}`);
});

// ── K/2: tapnięte lądy nic nie dają (nie da się zapłacić w odpowiedzi) ─────
test('K/2: same TAPNIĘTE lądy — bot NIE zagrywa (mana niedostępna)', () => {
  const wynik = choose(setup({ mana: 0, tappedLands: 2 }));
  assert.equal(isPlay(wynik), false);
  assert.ok(wynik.playScore < 0);
});

// ── K/3: nietapnięty ląd pokrywa {1} — zagranie MA sens ───────────────────
test('K/3: jeden NIETAPNIĘTY ląd — bot zagrywa i PŁACI {1} (pełna ścieżka)', () => {
  const s = setup({ mana: 0, untappedLands: 1 });
  const wynik = choose(s);
  assert.equal(isPlay(wynik), true, 'koszt {1} jest opłacalny z nietapniętego lądu');
  assert.equal(execute(s, wynik.chosen).ok, true);
  for (let i = 0; i < 8 && !s.pendingPayOrSacrifice; i += 1) {
    execute(s, { type: 'pass_priority', playerId: s.turn.priorityPlayerId });
  }
  assert.equal(s.pendingPayOrSacrifice?.amount, 1, 'trigger ETB czeka na decyzję');
  const payment = createHeuristicBot({ seed: 9 }).chooseCommand(playerView(s, P1));
  assert.equal(payment?.type, 'resolve_pay_or_sacrifice');
  assert.equal(payment.pay, true, 'bot płaci, zamiast poświęcać permanent');
});

// ── K/4: mana w puli — dotychczasowe zachowanie bez zmian ─────────────────
test('K/4: mana w puli — bot zagrywa, wynik jak przed K (84)', () => {
  const wynik = choose(setup({ mana: 1 }));
  assert.equal(isPlay(wynik), true);
  assert.equal(wynik.playScore, 84);
});

// ── K/5: kotwica anty-over-fix — zwykły ląd dalej zagrywany bez many ──────
test('K/5: zwykły ląd bez many dalej zagrywany (kara dotyczy tylko kosztu ETB)', () => {
  const wynik = choose(setup({ mana: 0, hand: 'basic-forest' }));
  assert.equal(isPlay(wynik), true, JSON.stringify(wynik.chosen));
  assert.ok(wynik.playScore > 0);
});

// ── K/6: pokrętło, nie stała w kodzie ─────────────────────────────────────
test('K/6: kara jest pokrętłem (`landEtbUpkeepUnplayablePenalty`)', () => {
  const s = setup({ mana: 0 });
  const bot = createHeuristicBot({ seed: 9, params: { landEtbUpkeepUnplayablePenalty: 130 } });
  bot.chooseCommand(playerView(s, P1));
  const play = (bot.trace().at(-1)?.options ?? []).find((option) => option.cmd.startsWith('play_land'));
  assert.equal(play?.score, -130);
});
