// M201/A (zgłoszenie właściciela 2026-08-23, Mindstab):
// „Karty zawieszone (suspend) i zaplotowane trafiają do worka Exile i nic
//  o nich nie wiadomo. Chcę je widzieć na stole z licznikami. Dodatkowo warto
//  informować w Rozgrywce i w logu, że np. zdejmuję licznik suspend w upkeepie
//  — teraz nie ma takiej informacji.”
//
// Reguły (zweryfikowane u źródła — L57): CR 406.3 — karty wygnane są DOMYŚLNIE
// odkryte i każdy gracz może je oglądać; suspend (CR 702.62a) i plot
// (CR 702.168a) nie mówią „face down”, więc obie strefy są jawne dla obu
// graczy. Pokazanie ich na stole nie łamie Fog of War.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

function stateAt(active, stepIndex, prio = active) {
  const s = createGameState({ seed: 12, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = { ...initialTurn(active), ...TURN_STEPS[stepIndex], stepIndex, activePlayerId: active, priorityPlayerId: prio, passes: 0 };
  return s;
}

// --- A1: zdjęcie licznika czasu MUSI dotrzeć do warstwy opisu -------------
// Zdarzenie `time_counter_removed` było dopisywane wyłącznie do `state.events`
// i nigdy nie trafiało do strumienia komendy — log partii i „Rozgrywka”
// milczały przez cztery tury zawieszenia (klasa L24/L6).

test('M201/A1: zdjęcie licznika czasu jest w strumieniu zdarzeń komendy', () => {
  const state = stateAt('p1', 0); // untap — passy obu graczy wprowadzą upkeep
  put(state, 'susp', 'mindstab', 'p1', 'exile', { suspended: true, timeCounters: 4 });
  const streamed = [];
  for (let i = 0; i < 4 && state.turn.step !== 'upkeep'; i += 1) {
    const prio = state.turn.priorityPlayerId;
    const res = execute(state, { type: 'pass_priority', playerId: prio });
    assert.equal(res.ok, true, JSON.stringify(res.events?.[0] ?? {}));
    streamed.push(...res.events);
  }
  assert.equal(state.turn.step, 'upkeep', 'scenariusz: weszliśmy w upkeep');
  const removed = streamed.filter((e) => e.type === 'time_counter_removed');
  assert.equal(removed.length, 1, 'komenda musi ODDAĆ zdarzenie zdjęcia licznika (log czyta ten strumień)');
  assert.equal(removed[0].remaining, 3);
});

test('M201/A1: log partii i „Rozgrywka” nazywają zdejmowanie liczników', () => {
  const decks = new Map([
    [HUMAN_ID, [...Array(10).fill('basic-swamp'), ...Array(10).fill('mindstab')]],
    [BOT_ID, [...Array(10).fill('basic-mountain'), ...Array(10).fill('goblin-piker')]],
  ]);
  const session = createSession({ seed: 11, registry: REGISTRY, decks, pauseOnBotMoves: false });
  let suspended = false;
  for (let i = 0; i < 300 && session.state.status === 'active'; i += 1) {
    const view = session.view();
    const cmds = view.legalCommands;
    const pick = cmds.find((c) => c.type === 'resolve_mulligan_choice' && c.keep)
      ?? cmds.find((c) => c.type === 'play_land')
      ?? (!suspended ? cmds.find((c) => c.type === 'suspend_card') : null)
      ?? cmds.find((c) => c.type === 'draw_card')
      ?? cmds.find((c) => c.type === 'pass_priority') ?? cmds[0];
    if (!pick) break;
    if (pick.type === 'suspend_card') suspended = true;
    if (!session.apply(pick).ok) break;
    if (view.turn.number > 8) break;
  }
  assert.equal(suspended, true, 'scenariusz: karta została zawieszona');
  // 2. osoba dla gracza („Zdejmujesz…”), 3. dla bota („…zdejmuje…”).
  const logHits = session.log.filter((line) => /[Zz]dejmuj\w* licznik czasu/.test(line.text ?? ''));
  assert.ok(logHits.length >= 2,
    `log musi raportować kolejne liczniki; znaleziono: ${JSON.stringify(session.log.filter((l) => /licznik/.test(l.text)).map((l) => l.text))}`);
  const turnHits = session.turnHistory.flatMap((t) => t.lines).filter((line) => /licznik czasu/.test(line));
  assert.ok(turnHits.length >= 2, 'sekcja „Rozgrywka” (dla AI) też musi to notować');
});

// --- A2: widok wygnania niesie stan „poczekalni” --------------------------
// Bez tych pól stół nie ma z czego narysować kafla z licznikami (ADR 0017).

test('M201/A2: widok wygnania niesie liczniki czasu i status zawieszenia (obaj gracze)', () => {
  const state = stateAt('p1', 3);
  put(state, 'susp', 'mindstab', 'p1', 'exile', { suspended: true, timeCounters: 3 });
  put(state, 'foeSusp', 'mindstab', 'p2', 'exile', { suspended: true, timeCounters: 1 });
  const view = playerView(state, 'p1');
  const own = view.zones.exile.find((o) => o.id === 'susp');
  const foe = view.zones.exile.find((o) => o.id === 'foeSusp');
  assert.equal(own?.suspended, true, 'własna zawieszona karta ma status');
  assert.equal(own?.timeCounters, 3, 'i liczbę liczników czasu');
  // CR 406.3: wygnanie jest odkryte — karta przeciwnika też jest widoczna.
  assert.equal(foe?.suspended, true, 'karta przeciwnika też (CR 406.3 — exile jest jawne)');
  assert.equal(foe?.timeCounters, 1);
  assert.equal(foe?.cardId, 'mindstab', 'tożsamość jawna (nie „face down”)');
});

test('M201/A2: widok wygnania oznacza kartę zaplotowaną (gotową do rzutu)', () => {
  const state = stateAt('p1', 3);
  put(state, 'plot', 'mindstab', 'p1', 'exile', { plotted: true, plottedAtTurn: 1 });
  const entry = playerView(state, 'p1').zones.exile.find((o) => o.id === 'plot');
  assert.equal(entry?.plotted, true);
  assert.equal(entry?.plottedAtTurn, 1, 'tura zaplotowania — kafel powie „od następnej tury”');
});
