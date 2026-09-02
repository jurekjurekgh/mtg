// Uwaga D (2026-09-02, uwagi właściciela z żywej gry):
//   „Nakładka z aktualną turą i wynikiem życia — warstwa na górze ekranu. Gdy
//    gra się kończy, do tekstu ›Koniec partii - wygrywa X‹ chciałbym dodać
//    ilość życia, z którą skończyli gracze, plus opcjonalną informację, jeśli
//    koniec gry wynika z wyczerpania kart u któregoś gracza i u któregoś."
//
// Nakładka (main.js `updateTurnIndicator`, gałąź kończąca) pisała jeden string
// i ani życia, ani przyczyny. Silnik przyczynę ZNAŁ — `player_lost.reason`
// (= life_zero | poison_ten | empty_library, CR 104.3b/704.10) oraz
// `player_conceded` — i log już ją tłumaczył, ale tabela etykiet leżała w środku
// formatowania logu. Najpierw wspólna tabela i czysty zwiad (`gameOverNotice`),
// potem prezentacja; UI nie układa faktów po swojemu (L48).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gameOverNotice, LOSS_REASON_LABELS } from '../src/table/session.js';

function widok({ life = { p1: 20, p2: 0 }, winnerId = 'p1', isDraw = false } = {}) {
  return {
    status: 'finished',
    winnerId,
    isDraw,
    playerId: 'p1',
    players: [
      { id: 'p1', name: 'Ty', life: life.p1 },
      { id: 'p2', name: 'Nieprzyjaciel', life: life.p2 },
    ],
  };
}

test('D: nakładka ma życia obu graczy w kolejności widoku', () => {
  const info = gameOverNotice(widok({ life: { p1: 3, p2: 17 } }), { events: [] });
  assert.deepEqual(info.life, [{ playerId: 'p1', life: 3 }, { playerId: 'p2', life: 17 }],
    `życia: ${JSON.stringify(info.life)}`);
  assert.deepEqual(info.losses, [], 'bez zdarzeń — brak przyczyn (UI nie zgaduje)');
});

test('D: wyczerpanie biblioteki jest wskazane i nazwane, u konkretnego gracza', () => {
  const info = gameOverNotice(widok({ life: { p1: 1, p2: 0 } }), {
    events: [{ type: 'player_lost', playerId: 'p2', reason: 'empty_library' }],
  });
  assert.deepEqual(info.exhaustedPlayerIds, ['p2'], 'wyczerpał przeciwnik');
  assert.equal(info.losses[0].label, 'pusta biblioteka',
    `etykieta z tabeli: ${info.losses[0].label}`);
  assert.equal(LOSS_REASON_LABELS.empty_library, 'pusta biblioteka');
});

test('D: życie poniżej zera NIE jest dublowane w nakładce (widać je po licznikach)', () => {
  const info = gameOverNotice(widok(), {
    events: [{ type: 'player_lost', playerId: 'p2', reason: 'life_zero' }],
  });
  assert.deepEqual(info.exhaustedPlayerIds, []);
  assert.equal(info.losses[0].reason, 'life_zero', 'fakt zostaje do dyspozycji UI');
  assert.equal(info.losses[0].label, 'brak życia');
});

test('D: poddanie partii i trucizna też mają etykietę', () => {
  const info = gameOverNotice(widok(), {
    events: [
      { type: 'player_conceded', playerId: 'p1', winnerId: 'p2' },
      { type: 'player_lost', playerId: 'p1', reason: 'poison_ten' },
    ],
  });
  assert.deepEqual(info.losses.map((l) => l.reason), ['conceded', 'poison_ten'],
    `przyczyny: ${JSON.stringify(info.losses.map((l) => l.reason))}`);
  assert.equal(info.losses[0].label, 'poddanie partii');
  assert.equal(info.losses[1].label, '10 znaków trucizny');
});

test('D: ta sama przyczyna zgłoszona dwa razy = jeden wiersz', () => {
  const e = { type: 'player_lost', playerId: 'p2', reason: 'empty_library' };
  const info = gameOverNotice(widok(), { events: [e, e, e] });
  assert.equal(info.losses.length, 1, `dedyplikacja: ${info.losses.length} wierszy`);
});

test('D: remis (oboje wyczerpali bibliotekę) — brak zwycięzcy, dwie przyczyny', () => {
  const info = gameOverNotice(
    widok({ life: { p1: 1, p2: 1 }, winnerId: null, isDraw: true }),
    { events: [
      { type: 'player_lost', playerId: 'p1', reason: 'empty_library', draw: true },
      { type: 'player_lost', playerId: 'p2', reason: 'empty_library', draw: true },
    ] },
  );
  assert.equal(info.isDraw, true);
  assert.equal(info.winnerId, null);
  assert.deepEqual(info.exhaustedPlayerIds, ['p1', 'p2']);
});

test('D: zwiad czyta tez `state.log` (delegat) — UI nie wymaga drugiej kopii zdarzeń', () => {
  const info = gameOverNotice(widok(), {
    log: [{ type: 'player_lost', playerId: 'p2', reason: 'poison_ten' }],
  });
  assert.equal(info.losses.length, 1, 'fallback na log działa');
});

test('D: nakładka w main.js UŻYWA zwiadu (drut, nie żarówka) i nie buduje przyczyn sama', () => {
  const src = fs.readFileSync('src/table/main.js', 'utf8');
  const start = src.indexOf('function updateTurnIndicator');
  assert.ok(start > 0, 'updateTurnIndicator istnieje');
  const end = src.indexOf('\n  }', start);
  const body = src.slice(start, end);
  assert.match(body, /gameOverNotice\(view, session\.state\)/,
    'gałąź kończąca pyta session.gameOverNotice — inaczej przyczyny są wymyślane w UI');
  assert.match(body, /ti-life/, 'życia w nakładce końca gry (ta sama klasa co w trakcie)');
  assert.match(body, /ti-reason/, 'przyczyna nieoczywista ma własny span');
  assert.match(body, /wyczerpał bibliotekę/, 'słowo „wyczerpał bibliotekę" pada w UI');
  assert.ok(!/player_lost/.test(body), 'main.js nie skanuje zdarzeń — to rola sesji');
});

test('D: tabela etykiet przyczyn ma JEDNO źródło w sesji', () => {
  const src = fs.readFileSync('src/table/session.js', 'utf8');
  const count = (src.match(/poison_ten: '/g) ?? []).length;
  assert.equal(count, 1, `mapa etykiet przegranej ma być jedna (jest ${count}) — L28`);
  assert.match(src, /case 'player_lost': \{\s*\n\s*const reasons = LOSS_REASON_LABELS;/,
    'log stołu korzysta ze wspólnej tabeli');
});

// --- Integracja na PRAWDZIWYM deck-oucie (nie na syntetycznych zdarzeniach) ---
// Wzorzec pozycji: test/library-loss.test.js (CR 504.1 — dobieranie w kroku
// dobierania jest akcją turową, więc wyczerpanie biblioteki dzieje się samo).
test('D: partia skończona wyczerpaniem biblioteki — nakładka ma życia i winowajcę', async () => {
  const { createGameState, execute, playerView } = await import('../src/engine/game-state.js');
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  for (let i = 0; i < 60 && state.status === 'active'; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  assert.equal(state.status, 'finished', 'partia musi się skończyć');
  const view = playerView(state, 'p1');
  const info = gameOverNotice(view, state);
  assert.deepEqual(info.exhaustedPlayerIds, ['p2'], `winowajca: ${JSON.stringify(info.exhaustedPlayerIds)}`);
  assert.deepEqual(info.life.map((l) => l.life), [20, 20],
    `życia nietknięte — bez tego dopisku gracz widzi tylko „wygrywa Gracz”: ${JSON.stringify(info.life)}`);
  assert.equal(info.winnerId, 'p1');
  assert.equal(info.isDraw, false);
  // Etykieta ta sama co w logu — jedno źródło (patrz strażnik powyżej).
  assert.equal(info.losses[0].label, 'pusta biblioteka');
});
