import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createSession, manaSourceLogText, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { moveObjectDirectly } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';

/**
 * J (zgłoszenie właściciela, 2026-09-20): „Chciałbym w sekcji «Log partii»
 * widzieć dodatkowo każdy tapnięty na manę permanent — to nam ułatwi
 * debugowanie błędów: będzie widać co i kiedy zostało tapnięte”.
 *
 * Kontrakt pinowany tutaj:
 * 1. CZYSTA REGUŁA (`manaSourceLogText`): produkcja many daje zdanie
 *    z nazwą źródła i KOMPLETEM kolorów (też „{C}{C}{C}” i powtórzenia),
 *    a zdarzenie bez nazwy źródła nie zaśmieca logu;
 * 2. LOG STOŁU (ten sam strumień, który czyta „Log partii”): tapnięcie lądu
 *    na manę realnie dokłada wpis rodzaju `tap` z nazwą i kolorem;
 * 3. GRANICE: wpis nie wchodzi do modala „Rozgrywka” (botMoves) ani do
 *    zapisu tur dla AI (turnHistory) — decyzja właściciela o szumie modala
 *    zostaje w mocy; „Log partii” jest miejscem na debug.
 */

const REGISTRY = createCardRegistry();

const KARTY = '# Talia J\n\n20x Island\n20x Swamp\n';
const BOT = '# Talia J-bot\n\n20x Mountain\n20x Forest\n';

function sesja(seed = 5) {
  // Biblioteka z samych lądów (jak w talii właściciela pod debugowanie) —
  // tapnięcie jest wtedy pierwszą akcją, której szukamy.
  const decks = new Map([
    [HUMAN_ID, parseDeckText(KARTY, REGISTRY).cardIds],
    [BOT_ID, parseDeckText(BOT, REGISTRY).cardIds],
  ]);
  return createSession({ seed, registry: REGISTRY, decks, pauseOnBotMoves: false });
}

test('J: reguła — nazwa źródła i pełny zestaw symboli many (wielokrotności, bezbarwna)', () => {
  const nazwa = () => 'Wyspa';
  // Jedna jednostka koloru.
  assert.equal(
    manaSourceLogText({ type: 'mana_produced', playerId: 'p1', source: 'l1', amount: 1, colors: ['U'] },
      { nameOfObject: nazwa, who: 'Ty' }),
    'Ty tapujesz na manę: Wyspa → {U}',
  );
  // Druga osoba (bot) — log mówi, KTO tapnął.
  assert.match(
    manaSourceLogText({ type: 'mana_produced', playerId: 'p2', source: 'l2', amount: 1, colors: ['B'] },
      { nameOfObject: () => 'Bagno', who: 'Nieprzyjaciel' }),
    /^Nieprzyjaciel tapuje na manę: Bagno → \{B\}$/,
  );
  // Trzy many bezbarwne („{T}: Add {C}{C}{C}”) — komplet jednostek.
  assert.equal(
    manaSourceLogText({ type: 'mana_produced', playerId: 'p1', source: 'a1', amount: 3, colors: [] },
      { nameOfObject: () => 'Seer\u2019s Lantern', who: 'Ty' }),
    'Ty tapujesz na manę: Seer\u2019s Lantern → {C}{C}{C}',
  );
  // Dwie jednostki jednego koloru.
  assert.equal(
    manaSourceLogText({ type: 'mana_produced', playerId: 'p1', source: 'l3', amount: 2, colors: ['G'] },
      { nameOfObject: () => 'Las', who: 'Ty' }),
    'Ty tapujesz na manę: Las → {G}{G}',
  );
  // Zdarzenie innego typu, brak źródła i niewiedza o nazwie → brak wpisu.
  assert.equal(manaSourceLogText({ type: 'object_tapped', forMana: true }, { nameOfObject: nazwa, who: 'Ty' }), null);
  assert.equal(manaSourceLogText({ type: 'mana_produced', amount: 1, colors: ['U'] }, { nameOfObject: nazwa, who: 'Ty' }), null);
  assert.equal(manaSourceLogText({ type: 'mana_produced', source: 'l9', amount: 1, colors: ['U'] },
    { nameOfObject: () => '?', who: 'Ty' }), null);
});

/** Ląd gracza na polu bitwy + priorytet w głównej fazie (jak w partii). */
function przygotujLad(session) {
  const state = session.state;
  // Partia startuje decyzją mulligana — bez jej rozstrzygnięcia silnik odrzuca
  // komendy (`mulligan_unresolved`), a ręka nie jest rozdana.
  const keep = session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice');
  if (keep) assert.ok(session.apply(keep).ok, 'mulligan nie rozstrzygnął się');
  const handLand = state.zones.hand
    .find((id) => state.objects.get(id)?.controllerId === HUMAN_ID
      && (state.objects.get(id)?.types ?? []).includes('Land'));
  assert.ok(handLand, 'brak lądu w ręce po mulliganie');
  const land = moveObjectDirectly(state, handLand, 'battlefield', `bf-j-${handLand}`);
  session.state.turn = jumpToStep(session.state.turn, 'main1', HUMAN_ID);
  session.state.turn.activePlayerId = HUMAN_ID;
  session.state.turn.priorityPlayerId = HUMAN_ID;
  return land;
}

test('J: tapnięcie lądu na manę zostawia wpis w logu (i w «Log partii»)', () => {
  const session = sesja();
  const przed = session.logEntries().filter((entry) => entry.kind === 'tap').length;
  // Ląd na polu bitwy gracza + komenda tapnięcia na manę (dokładnie ta droga,
  // którą chodzi kreator many i auto-płatność).
  const land = przygotujLad(session);
  const result = session.apply({ type: 'tap_for_mana', playerId: HUMAN_ID, objectId: land.id });
  assert.equal(result.ok, true, `tapnięcie odrzucone: ${result.reason}`);

  const wpisy = session.logEntries().filter((entry) => entry.kind === 'tap');
  assert.equal(wpisy.length, przed + 1, 'tapnięcie na manę nie zostawiło wpisu w logu');
  const wpis = wpisy.at(-1);
  assert.match(wpis.text, /na manę:/, `wpis bez treści tapnięcia: ${wpis.text}`);
  assert.match(wpis.text, /Island|Swamp/, `wpis bez nazwy permanentu: ${wpis.text}`);
  assert.match(wpis.text, /\{U\}|\{B\}/, `wpis bez koloru many: ${wpis.text}`);
  // „Log partii" czyta ten sam strumień — wpis musi być w tekście całej partii
  // i w tekście tury, w której powstał.
  assert.match(session.logTextAll(), /na manę: /, 'brak wpisu tapnięcia w tekście «całej partii»');
  assert.match(session.logTextFor(wpis.turn), /na manę: /, 'brak wpisu tapnięcia w tekście wybranej tury');
});

test('J: tapnięcia nie wchodzą do modala „Rozgrywka" ani do zapisu tur dla AI', () => {
  const session = sesja();
  const land = przygotujLad(session);
  session.clearBotMoves();
  assert.equal(session.apply({ type: 'tap_for_mana', playerId: HUMAN_ID, objectId: land.id }).ok, true);

  // Modal „Rozgrywka" (botMoves) — decyzja właściciela: bez tapowania many.
  const modal = session.botMoves.map((m) => m.text ?? '').join('\n');
  assert.doesNotMatch(modal, /na manę: /, `tapnięcie weszło do modala: ${modal.slice(0, 200)}`);
  // Zapisu tur dla AI (Fog of War, narracja) też nie zaśmiecamy.
  assert.doesNotMatch(session.turnHistoryTextAll(), /na manę: /, 'tapnięcie weszło do zapisu tur dla AI');
});
