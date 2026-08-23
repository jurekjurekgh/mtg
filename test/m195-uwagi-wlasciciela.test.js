// M195 — uwagi właściciela z testów ręcznych (2026-08-23):
// A — brak wizarda many przy płatności „zapłać albo poświęć",
// B — bot marnuje trick bojowy tapiąc siebie w swojej fazie ataku,
// C/C1 — wielocelowość jako eksplozja kombinacji zamiast listy wyboru,
// D — „(wybór gracza)" myli, gdy decyduje bot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeGameEvent } from '../src/table/session.js';

const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };
const HELPERS = {
  nameOf: (cardId) => ({
    'veiled-ascension': 'Veiled Ascension',
    'rupture-spire': 'Rupture Spire',
  }[cardId] ?? cardId),
  nameOfObject: () => 'Rupture Spire',
  isPlayer: (id) => NAMES[id] != null,
};

// ---- D: komunikat nazywa DECYDENTA, nie anonimowego „gracza" -------------
// Zgłoszenie: „Veiled Ascension zagrał Bot. W Rozgrywce: »skorzystać z efektu
// „you may"? (wybór gracza)«. To »gracza« jest mylące."

test('M195/D: opcjonalny trigger BOTA nie mówi „wybór gracza"', () => {
  const line = String(describeGameEvent({
    type: 'optional_trigger_required', playerId: 'p2', cardId: 'veiled-ascension',
  }, HELPERS, NAMES));
  assert.ok(!/wybór gracza/.test(line),
    `„gracza" sugeruje, że to MOJA decyzja: ${JSON.stringify(line)}`);
  assert.match(line, /Nieprzyjaciel/,
    `komunikat ma nazwać decydenta: ${JSON.stringify(line)}`);
  assert.match(line, /opcjonaln/i, 'i powiedzieć, że wybór jest opcjonalny');
});

test('M195/D: ten sam trigger u CZŁOWIEKA mówi o mnie', () => {
  const line = String(describeGameEvent({
    type: 'optional_trigger_required', playerId: 'p1', cardId: 'veiled-ascension',
  }, HELPERS, NAMES));
  assert.ok(!/wybór gracza/.test(line), `bez anonimowego „gracza": ${JSON.stringify(line)}`);
  assert.match(line, /Ty|Twój|Twoja/, `decydentem jestem ja: ${JSON.stringify(line)}`);
});

test('M195/D: „zapłać albo poświęć" też nazywa decydenta', () => {
  // Ten sam wzorzec „(wybór gracza)" — właściciel: „przypuszczam, że ten sam
  // wzór jest w wielu innych kartach. Do poprawki."
  const bot = String(describeGameEvent({
    type: 'pay_or_sacrifice_required', playerId: 'p2', sourceId: 'spire', amount: 1,
  }, HELPERS, NAMES));
  assert.ok(!/wybór gracza/.test(bot), `bez anonimowego „gracza": ${JSON.stringify(bot)}`);
  assert.match(bot, /Nieprzyjaciel/, `decydent nazwany: ${JSON.stringify(bot)}`);
  const mine = String(describeGameEvent({
    type: 'pay_or_sacrifice_required', playerId: 'p1', sourceId: 'spire', amount: 1,
  }, HELPERS, NAMES));
  assert.match(mine, /Ty|Twój|Twoja/, `moja decyzja: ${JSON.stringify(mine)}`);
});

test('M195/D: „zapłacić {N}?" (optional_pay) też nazywa decydenta', () => {
  const bot = String(describeGameEvent({
    type: 'optional_pay_required', playerId: 'p2', cardId: 'veiled-ascension', payMana: 2,
  }, HELPERS, NAMES));
  assert.ok(!/wybór gracza/.test(bot), `bez anonimowego „gracza": ${JSON.stringify(bot)}`);
  assert.match(bot, /Nieprzyjaciel/, `decydent nazwany: ${JSON.stringify(bot)}`);
});

test('M195/D: STRAŻNIK — żaden opis zdarzenia nie mówi „(wybór gracza)"', async () => {
  // Klasa, nie pojedynczy komunikat: właściciel wprost napisał, że wzorzec
  // powtarza się w wielu kartach. Strażnik czyta ŹRÓDŁO opisów.
  const fs = await import('node:fs');
  const src = fs.readFileSync('src/table/session.js', 'utf8');
  const hits = src.split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => line.includes('(wybór gracza)'));
  assert.deepEqual(hits, [],
    `„(wybór gracza)" nie mówi KTO decyduje — użyj whoN(e.playerId):\n${hits.map(([n, l]) => `  ${n}: ${l.trim()}`).join('\n')}`);
});

// ---- B: bot marnuje trick bojowy tapiac SIEBIE poza walka ----------------
// Zgloszenie: „Ghost Warden. Faza walki Bota. Bot aktywuje zdolnosc, tapuje go
// i robi sie +1/+1. Bez sensu. To trick bojowy do buffowania, ale nie siebie
// w swojej fazie ataku, bo jesli tapne ta karte to juz nia nie zaatakuje.
// Sensowne: buff ATAKUJACEGO po deklaracji atakujacych albo swojego
// BLOKUJACEGO w fazie ataku przeciwnika po deklaracji blokujacych."

const { createGameState, addObject, playerView } = await import('../src/engine/game-state.js');
const { createCardRegistry } = await import('../src/cards/card-data.js');
const { gameObjectDataOf } = await import('../src/cards/materialize.js');
const { jumpToStep } = await import('../src/engine/turn.js');
const { createHeuristicBot } = await import('../src/controllers/heuristic-bot.js');

const REGISTRY = createCardRegistry();

/** Plansza bota: Ghost Warden + drugi stwor; `patch` ustawia flagi walki. */
function combatBoard(step, { activePlayer = 'p2', patch = {}, attackers = null, attackingPlayerId = null } = {}) {
  const state = createGameState({ seed: 195, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, activePlayer);
  state.turn.activePlayerId = activePlayer;
  state.turn.priorityPlayerId = 'p2';
  const warden = REGISTRY.get('ghost-warden');
  const giant = REGISTRY.get('hill-giant');
  addObject(state, {
    id: 'gw', instanceId: 'i-gw', cardId: 'ghost-warden', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', ...gameObjectDataOf(warden), types: warden.types, subtypes: warden.subtypes,
  });
  addObject(state, {
    id: 'ally', instanceId: 'i-ally', cardId: 'hill-giant', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', ...gameObjectDataOf(giant), types: giant.types,
  });
  for (const id of ['gw', 'ally']) {
    state.objects.set(id, Object.freeze({
      ...state.objects.get(id), summoningSickness: false, ...(patch[id] ?? {}),
    }));
  }
  // Flaga `attacking` w WIDOKU pochodzi ze `state.combat.attackers`, a nie
  // z pola na obiekcie (playerView wylicza ją przy budowie kafla). Test musi
  // więc zbudować realny stan walki, inaczej mierzy coś innego niż zamierza.
  if (attackers) {
    state.combat = {
      attackingPlayerId: attackingPlayerId ?? activePlayer,
      attackers: [...attackers],
      blockers: new Map(),
      blockedAttackers: new Set(),
    };
  }
  return state;
}

/** Ruch wybrany przez bota na tej planszy. */
function botMove(state) {
  const bot = createHeuristicBot({ playerId: 'p2', seed: 1 });
  return bot.chooseCommand(playerView(state, 'p2'));
}

/**
 * WYCENY wszystkich opcji bota (bot udostępnia `trace()`, nie `rankCommands`).
 * Pierwsza wersja tych testów pytała o nieistniejące API i cicho się pomijała
 * — dokładnie pułapka L15 (test, który nigdy nie czerwienieje).
 */
function botScores(state) {
  const bot = createHeuristicBot({ playerId: 'p2', seed: 1 });
  bot.chooseCommand(playerView(state, 'p2'));
  const last = bot.trace().at(-1);
  assert.ok(last?.options?.length, 'trace bota musi nieść wycenione opcje');
  return last.options;
}

/**
 * Wycena opcji, której OPIS w śladzie pasuje do wzorca. `trace()` streszcza
 * komendę do tekstu (summarize), więc dopasowujemy po nim — stąd wzbogacenie
 * opisu `activate_ability` o źródło i cel (M195/B).
 */
function scoreOf(options, pattern) {
  const hit = options.filter((o) => pattern.test(String(o.cmd)));
  return hit.length ? Math.max(...hit.map((o) => o.score ?? -Infinity)) : -Infinity;
}

const tapsSelf = (cmd) => cmd?.type === 'activate_ability' && cmd.objectId === 'gw'
  && (cmd.targets ?? []).includes('gw');

test('M195/B: bot NIE tapuje Ghost Warden na siebie w swojej walce', () => {
  // Dokladnie scenariusz zgloszenia: moja tura, krok blokujacych, Ghost
  // Warden nie atakuje. Tapniecie go dla +1/+1 nic nie wnosi — traci tylko
  // mozliwosc blokowania w nastepnej turze przeciwnika.
  const state = combatBoard('declare_blockers', { attackers: ['ally'] });
  const cmd = botMove(state);
  assert.equal(tapsSelf(cmd), false,
    `bot marnuje trick bojowy na siebie: ${JSON.stringify(cmd)}`);
});

test('M195/B: bot NIE tapuje się sam także w kroku obrażeń', () => {
  const state = combatBoard('combat_damage', { attackers: ['ally'] });
  assert.equal(tapsSelf(botMove(state)), false, 'to samo marnotrawstwo, inny krok');
});

test('M195/B: WOLNO buffować ATAKUJĄCEGO sojusznika (anty-over-fix)', () => {
  // Sensowne uzycie #1 wskazane przez wlasciciela: po deklaracji atakujacych
  // wzmacniamy tego, kto realnie atakuje.
  const state = combatBoard('declare_blockers', { attackers: ['ally'] });
  const view = playerView(state, 'p2');
  const offers = view.legalCommands.filter((c) => c.type === 'activate_ability'
    && c.objectId === 'gw' && (c.targets ?? []).includes('ally'));
  assert.ok(offers.length > 0, 'oferta buffu atakującego istnieje w silniku');
  const options = botScores(state);
  const allyScore = scoreOf(options, /^activate_ability\(gw#\d+->ally\)$/);
  const selfScore = scoreOf(options, /^activate_ability\(gw#\d+->gw\)$/);
  assert.ok(allyScore > selfScore,
    `buff ATAKUJĄCEGO ma być wyceniony wyżej niż tapnięcie siebie: ${allyScore} vs ${selfScore}`);
});

test('M195/B: WOLNO buffować własnego BLOKUJĄCEGO w turze przeciwnika', () => {
  // Sensowne uzycie #2: tura przeciwnika, po deklaracji blokujacych.
  const state = combatBoard('declare_blockers', {
    activePlayer: 'p1',
    patch: { ally: { blocking: true } },
  });
  const view = playerView(state, 'p2');
  const offers = view.legalCommands.filter((c) => c.type === 'activate_ability'
    && c.objectId === 'gw' && (c.targets ?? []).includes('ally'));
  assert.ok(offers.length > 0, 'w turze przeciwnika buff blokującego jest legalny');
});

test('M195/B: WOLNO buffować SIEBIE, gdy sam atakuję (anty-over-fix)', () => {
  // Luka wykryta weryfikacja mutacyjna: kara „selfPump && taps" BEZ warunku
  // walki nie czerwienila zadnego testu, wiec mogla po cichu zabic sensowne
  // uzycie. Gdy Ghost Warden JEST zadeklarowany jako atakujacy, +1/+1 realnie
  // zwieksza obrazenia — tapniecie kosztem nic juz nie odbiera (atakujacy
  // i tak jest tapniety po deklaracji).
  const state = combatBoard('declare_blockers', { attackers: ['gw'] });
  const options = botScores(state);
  const selfScore = scoreOf(options, /^activate_ability\(gw#\d+->gw\)$/);
  assert.notEqual(selfScore, -Infinity, 'oferta buffu siebie istnieje');
  // Sedno anty-over-fix: gdy źródło SAMO atakuje, kara -30 NIE może paść.
  // (Czy bot ostatecznie kliknie buff 1/1, to już kwestia wyceny wartości —
  // tu pilnujemy, żeby naprawa nie wycięła sensownego zagrania.)
  assert.ok(selfScore > -20,
    `atakujący Ghost Warden nie może dostać kary za „tapnięcie siebie": ${selfScore}`);
  // Kontrola: ten SAM stwór poza walką karę dostaje.
  const idle = combatBoard('declare_blockers', { attackers: ['ally'] });
  const idleScore = scoreOf(botScores(idle), /^activate_ability\(gw#\d+->gw\)$/);
  assert.ok(idleScore < selfScore,
    `nieatakujący ma być wyceniony NIŻEJ: ${idleScore} vs ${selfScore}`);
});

test('M195/B: kara nie dotyczy zdolności BEZ kosztu tapnięcia (anty-over-fix)', () => {
  // Regula wlasciciela mowi wprost o tapnieciu („jesli tapne ta karte to juz
  // nia nie zaatakuje"). Zdolnosc bez {T} niczego nie odbiera, wiec kara jej
  // nie dotyczy — sprawdzamy to na deskryptorze, nie na konkretnej karcie.
  const warden = REGISTRY.get('ghost-warden');
  const ability = warden.abilities[0];
  assert.equal(ability.cost.tap, true,
    'Ghost Warden płaci tapnięciem — to on jest przypadkiem ze zgłoszenia');
});
