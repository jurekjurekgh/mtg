// M199 — „Przebieg tur (dla AI)" w pelnym Fog of War (zlecenie wlasciciela
// 2026-08-23): „opisy dzialan Czarodziejki powinny byc pokazywane z pozycji
// trzeciej osoby BEZ wgladu w jej dzialania niewidoczne dla Bota. Zeby nie
// bylo widac np. dobranych kart, kto jest morphem — dokladnie tak samo jak
// w dzialaniach Nieprzyjaciela".
//
// Sekcja jest przeznaczona do wklejenia modelowi AI, wiec musi byc zapisem
// PUBLICZNYM: tym, co widzialby obserwator przy stole (CR 400.2 — reka i
// biblioteka to strefy ukryte; CR 708.2 — zakryty permanent nie ujawnia
// tozsamosci). Glowny log stolu zostaje bez zmian: tam gracz WIDZI swoje
// karty i to jest poprawne.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { BOT_ID, HUMAN_ID, createSession, describeGameEvent, FACE_DOWN_LABEL } from '../src/table/session.js';

const REGISTRY = createCardRegistry();

function playedSession(seed = 20, steps = 400) {
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/tarkir.txt', 'utf8'), REGISTRY).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/warhammer.txt', 'utf8'), REGISTRY).cardIds],
  ]);
  const session = createSession({ seed, registry: REGISTRY, decks });
  for (let i = 0; i < steps; i += 1) {
    const view = session.view();
    if (view.status !== 'active') break;
    // Gramy AKTYWNIE (land, potem czar) — partia samych passow nie
    // wyprodukowalaby zagran, wiec kontrola „nie cenzurujemy za duzo"
    // nie mialaby czego sprawdzic.
    const cmd = view.legalCommands.find((c) => c.type === 'play_land')
      ?? view.legalCommands.find((c) => c.type === 'cast_permanent')
      ?? view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands[0];
    if (!cmd) break;
    session.apply(cmd);
  }
  return session;
}

/** Caly zapis partii z panelu „Przebieg tur (dla AI)". */
function fullHistory(session) {
  return session.turnHistoryEntries()
    .map((entry) => session.turnHistoryTextFor(entry.number))
    .join('\n');
}

const NAMES = { [HUMAN_ID]: 'Czarodziejka', [BOT_ID]: 'Nieprzyjaciel' };
const HELPERS = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
  nameOfObject: (id) => String(id),
  isPlayer: (id) => id === HUMAN_ID || id === BOT_ID,
  controllerOf: () => null,
};

/** Opis zdarzenia w trybie przebiegu tur (3. osoba + FoW obu stron). */
const publicText = (e) => describeGameEvent(e, HELPERS, NAMES, { drugaOsoba: false, fogOfWar: true });
/** Opis w trybie GLOWNEGO LOGU (wiedza wlasna gracza) — dla kontrastu. */
const ownerText = (e) => describeGameEvent(e, HELPERS, NAMES, { drugaOsoba: false });

test('M199: zapis partii nie zdradza kart dobranych przez Czarodziejke', () => {
  const history = fullHistory(playedSession());
  const leaks = history.split('\n').filter((line) => /Czarodziejka dobiera:/.test(line));
  assert.deepEqual(leaks, [], 'dobrana karta gracza jest informacja ukryta (CR 400.2)');
  // Obie strony opisane TAK SAMO.
  assert.match(history, /Czarodziejka dobiera kartę/, 'gracz: „dobiera kartę"');
  assert.match(history, /Nieprzyjaciel dobiera kartę/, 'bot: tak samo');
});

test('M199: symetria — zdarzenie gracza i bota daje ten sam ksztalt opisu', () => {
  const draw = (playerId) => publicText({ type: 'card_drawn', playerId, object: { cardId: 'colossodon-yearling' } });
  assert.equal(draw(HUMAN_ID), 'Czarodziejka dobiera kartę');
  assert.equal(draw(BOT_ID), 'Nieprzyjaciel dobiera kartę');
  // Kontrola anty-over-fix: GLOWNY LOG dalej nazywa wlasna karte gracza.
  assert.match(ownerText({ type: 'card_drawn', playerId: HUMAN_ID, object: { cardId: 'colossodon-yearling' } }),
    /Czarodziejka dobiera: /, 'log stolu zachowuje wiedze wlasna gracza');
});

test('M199: morph gracza jest bezimienny jak morph bota (CR 708.2)', () => {
  for (const playerId of [HUMAN_ID, BOT_ID]) {
    const cast = publicText({ type: 'permanent_cast', playerId, faceDown: true, object: { cardId: 'segmented-krotiq' } });
    assert.match(cast, new RegExp(`${NAMES[playerId]} zagrywa ${FACE_DOWN_LABEL} twarzą w dół`),
      `${playerId}: zakryty rzut bez nazwy karty`);
    assert.doesNotMatch(cast, /Segmented Krotiq/, 'nazwa karty nie moze wyciec');
  }
  const resolved = publicText({ type: 'spell_resolved', controllerId: HUMAN_ID, faceDown: true, cardId: 'segmented-krotiq' });
  assert.doesNotMatch(resolved, /Segmented Krotiq/, 'rozstrzygniecie tez bez nazwy');
  // Glowny log nadal nazywa WLASNY morph gracza (CR 708.6 — wolno mu patrzec).
  assert.match(ownerText({ type: 'permanent_cast', playerId: HUMAN_ID, faceDown: true, object: { cardId: 'segmented-krotiq' } }),
    /Segmented Krotiq/, 'w logu stolu wlasny morph zostaje nazwany');
});

test('M199: decyzje na kartach ukrytych nie ujawniaja nazw (scry, mulligan, wierzch)', () => {
  const cases = [
    { type: 'scry_started', playerId: HUMAN_ID, amount: 2, cardIds: ['colossodon-yearling', 'basic-forest'] },
    { type: 'scry_resolved', playerId: HUMAN_ID, bottomCardIds: ['colossodon-yearling'], topCardIds: ['basic-forest'], bottomCount: 1, topCount: 1, total: 2 },
    { type: 'hand_top_choice_resolved', playerId: HUMAN_ID, cardId: 'colossodon-yearling' },
    { type: 'look_top_resolved', playerId: HUMAN_ID, pickCardId: 'colossodon-yearling', restTo: 'graveyard' },
    { type: 'satyr_look_started', playerId: HUMAN_ID, count: 2, cardIds: ['colossodon-yearling', 'basic-forest'] },
    { type: 'satyr_look_resolved', playerId: HUMAN_ID, pickId: 'o1', pickCardId: 'basic-forest' },
    { type: 'mulligan_bottom_resolved', playerId: HUMAN_ID, cardIds: ['colossodon-yearling'] },
  ];
  for (const e of cases) {
    const text = publicText(e);
    if (text == null) continue;
    assert.doesNotMatch(text, /Colossodon Yearling/, `${e.type}: nazwa karty z ukrytej strefy wyciekla`);
  }
});

test('M199: informacja PUBLICZNA zostaje widoczna (nie cenzurujemy za duzo)', () => {
  // Zagranie landa, rzut czaru i grob sa jawne dla obu graczy — zapis dla AI
  // bez nich bylby bezuzyteczny.
  assert.match(publicText({ type: 'land_played', playerId: HUMAN_ID, object: { cardId: 'basic-forest' } }), /Forest/);
  assert.match(publicText({ type: 'spell_cast', playerId: HUMAN_ID, cardId: 'colossodon-yearling' }), /Colossodon Yearling/);
  assert.match(publicText({ type: 'permanent_cast', playerId: HUMAN_ID, object: { cardId: 'colossodon-yearling' } }), /Colossodon Yearling/);
  const history = fullHistory(playedSession());
  assert.match(history, /Czarodziejka zagrywa /, 'zagrania gracza dalej opisane');
});

test('M199: panel kopiuje DOKLADNIE ten sam zapis, ktory widac', () => {
  const session = playedSession();
  const entries = session.turnHistoryEntries();
  const all = session.turnHistoryTextAll();
  assert.doesNotMatch(all, /dobiera: /, 'kopia calej partii tez jest w FoW');
  const one = session.turnHistoryTextFor(entries[0].number);
  assert.doesNotMatch(one, /dobiera: /, 'kopia pojedynczej tury tez');
});
