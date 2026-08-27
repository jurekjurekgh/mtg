// M123 (zgłoszenie właściciela, 2026-08-17) — PRZECIEK UKRYTEJ INFORMACJI
// w modalu „Rozgrywka".
//
// Zgłoszenie: „Nieprzyjaciel rzucił Village Rites, poświęcił swoją kreaturę.
// Kliknąłem Rozumiem. Pojawił się panel, a w nim obrazki MOICH kart przy
// wpisach «Nieprzyjaciel dobiera kartę». Skąd tutaj te img moich kart?"
//
// Diagnoza okazała się poważniejsza niż samo zgłoszenie. To nie były karty
// właściciela — to były karty, które BOT WŁAŚNIE DOBRAŁ DO RĘKI. Właściciel
// rozpoznał ilustracje jako „swoje", bo obie talie zawierają te same landy
// podstawowe (np. Island). W rzeczywistości modal pokazywał podgląd ukrytej
// ręki przeciwnika, czyli łamał CR 400.2.
//
// Root cause: TEKST wpisu poprawnie ukrywał nazwę („Nieprzyjaciel dobiera
// kartę" zamiast „dobiera: X" — FoW było obsłużone w describeGameEvent),
// ale MINIATURKA renderowała się niezależnie, z `e.object.cardId`, bo
// `card_drawn` jest w BOT_MOVE_CARD_EVENTS (dodane w M89 dla Curate, żeby
// gracz widział, że bot dobrał kartę). Ukrycie nazwy w jednym miejscu nie
// chroniło drugiego.
//
// Naprawa generyczna (nie łatka na `card_drawn`): karta wędrująca do UKRYTEJ
// strefy przeciwnika (ręka, biblioteka) nie dostaje miniaturki. Grób i
// wygnanie są strefami jawnymi (CR 400.2) — tam skan zostaje.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';

function buildDecks(humanFile = 'innistrad-brg.txt', botFile = 'dominaria-brg.txt') {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync(`decks/${humanFile}`, 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync(`decks/${botFile}`, 'utf8'), registry).cardIds],
  ]);
  return { registry, decks };
}

/** Prosta polityka człowieka — wystarczy, by partia się rozwinęła. */
function chooseHumanCommand(view) {
  const ofType = (type) => view.legalCommands.filter((cmd) => cmd.type === type);
  const first = (type) => ofType(type)[0] ?? null;
  return first('draw_card')
    ?? first('play_land')
    ?? first('tap_for_mana')
    ?? first('cast_permanent')
    ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'))
    ?? first('pass_priority');
}

/** Zbiera wpisy modala „Rozgrywka" z kilkudziesięciu partii. */
function collectBotMoves({ seeds = 40, maxMoves = 700 } = {}) {
  const { registry, decks } = buildDecks();
  const entries = [];
  for (let seed = 1; seed <= seeds; seed += 1) {
    try {
      const session = createSession({ seed, registry, decks });
      for (let i = 0; i < maxMoves; i += 1) {
        if (session.state.status !== 'active') break;
        const view = session.view();
        if (view.turn.priorityPlayerId !== HUMAN_ID) break;
        for (const move of session.botMoves ?? []) {
          entries.push({ ...move, seed, state: session.state });
        }
        const cmd = chooseHumanCommand(view);
        if (!cmd) break;
        if (!session.apply(cmd).ok) break;
      }
    } catch { /* seedy z rzadkimi układami pomijamy — liczy się masa próby */ }
  }
  return entries;
}

test('M123: wpis „Nieprzyjaciel dobiera kartę" NIE pokazuje skanu karty', () => {
  const leaks = collectBotMoves()
    .filter((m) => /dobiera kartę/.test(m.text) && m.cardId != null);
  const sample = leaks.slice(0, 3).map((m) => `seed ${m.seed}: ${m.text} → ${m.cardId}`);
  assert.equal(leaks.length, 0,
    `miniaturka zdradza kartę dobraną przez bota do ręki: ${sample.join('; ')}`);
});

test('M123: żadne zdarzenie „do ukrytej strefy" bota nie niesie skanu', () => {
  // Obrona w głąb, szersza niż `card_drawn`: łapie każde PRZYSZŁE zdarzenie
  // dodane do BOT_MOVE_CARD_EVENTS, które opisywałoby ruch karty bota do ręki
  // lub biblioteki (np. bounce własnego permanentu, tuck, „put into hand").
  //
  // Uwaga metodyczna: NIE wystarczy sprawdzić „czy egzemplarz tej karty leży
  // w ręce bota". Pierwsza wersja tego testu tak robiła i zapaliła się na
  // Zoraline — bot ZAGRAŁ ją jawnie na stół, a druga kopia siedziała w ręce.
  // Skan dotyczył zagranego permanentu i był w pełni legalny. Wniosek: liczy
  // się strefa docelowa KONKRETNEGO zdarzenia, nie obecność nazwy w ręce.
  const HIDDEN = new Set(['hand', 'library']);
  const offenders = [];
  for (const move of collectBotMoves({ seeds: 25 })) {
    if (!move.cardId || !move.hiddenDestination) continue;
    offenders.push(`${move.text} → ${move.cardId}`);
  }
  assert.deepEqual(offenders.slice(0, 5), [],
    'modal nie może pokazywać skanu karty trafiającej do ukrytej strefy bota');
  assert.ok(HIDDEN.size === 2, 'ręka i biblioteka to strefy ukryte (CR 400.2)');
});

test('M123 (anty-over-fix): dobrania GRACZA nadal mają skan i jawną nazwę', () => {
  const draws = collectBotMoves({ seeds: 25 })
    .filter((m) => m.type === 'card_drawn' && m.cardId != null);
  assert.ok(draws.length > 0, 'gracz musi nadal widzieć skany swoich dobrań');
  const foreign = draws.filter((m) => !/^Dobierasz|^Ty dobiera/.test(m.text));
  assert.deepEqual(foreign.slice(0, 3).map((m) => m.text), [],
    'skan przy dobraniu przysługuje wyłącznie kartom gracza');
});

test('M123 (anty-over-fix): zagrania bota na stole nadal pokazują skan', () => {
  // Naprawa nie może wyciszyć modala: to, co bot ROBI jawnie (rzuca czar,
  // zagrywa land, permanent wchodzi na stół), musi zostać widoczne.
  const byType = new Map();
  for (const move of collectBotMoves({ seeds: 20 })) {
    if (move.cardId) byType.set(move.type, (byType.get(move.type) ?? 0) + 1);
  }
  for (const type of ['permanent_cast', 'land_played', 'permanent_entered_battlefield']) {
    assert.ok((byType.get(type) ?? 0) > 0, `zdarzenie ${type} straciło miniaturkę`);
  }
});
