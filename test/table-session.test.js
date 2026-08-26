import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { createGameState, addObject, execute as engineExecute, playerView as enginePlayerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { describeGameEvent } from '../src/table/session.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';

/**
 * Warstwa sesji stołu (M5): człowiek gra z botem heurystycznym wyłącznie
 * przez protokół. Sesja sama przewija okna, w których człowiek ma do wyboru
 * wyłącznie pass, i rozgrywa ruchy bota; do człowieka zatrzymuje się dopiero
 * w oknie z prawdziwą decyzją. Testy są headless — bez DOM-u.
 */

function buildDecks(humanFile = 'tarkir.txt', botFile = 'warhammer.txt') {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync(`decks/${humanFile}`, 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync(`decks/${botFile}`, 'utf8'), registry).cardIds],
  ]);
  return { registry, decks };
}

/** Prosta polityka człowieka: preferuje rozwój planszy, czary celuje w przeciwnika. */
function chooseHumanCommand(view) {
  const ofType = (type) => view.legalCommands.filter((cmd) => cmd.type === type);
  const first = (type) => ofType(type)[0] ?? null;
  return first('draw_card')
    ?? first('play_land')
    ?? first('tap_for_mana')
    ?? first('cast_permanent')
    ?? (() => {
      const casts = ofType('cast_spell');
      const hostile = casts.find((cmd) => {
        const target = view.zones.battlefield.find((o) => o.id === cmd.targets?.[0]);
        return target && target.controllerId !== view.playerId;
      });
      return hostile ?? null;
    })()
    ?? (() => {
      const attacks = ofType('declare_attackers');
      if (!attacks.length) return null;
      return attacks.reduce((best, cmd) => (cmd.attackerIds.length > best.attackerIds.length ? cmd : best));
    })()
    ?? first('declare_blockers')
    ?? first('resolve_combat')
    ?? view.legalCommands.find((c) => c.type.startsWith('resolve_')) ?? null
    ?? first('pass_priority');
}

function playOut(session, maxMoves = 600) {
  for (let i = 0; i < maxMoves; i += 1) {
    if (session.state.status !== 'active') return i;
    const view = session.view();
    assert.equal(view.turn.priorityPlayerId, HUMAN_ID, 'sesja zatrzymała się poza oknem człowieka');
    const cmd = chooseHumanCommand(view);
    assert.ok(cmd, 'brak legalnej komendy w oknie decyzyjnym człowieka');
    const result = session.apply(cmd);
    assert.ok(result.ok, `komenda człowieka odrzucona: ${result.reason}`);
  }
  throw new Error('partia nie zakończyła się w limicie ruchów');
}

test('sesja wymaga poprawnego zestawu dwóch talii', () => {
  const { registry, decks } = buildDecks();
  assert.throws(() => createSession({ seed: 1, registry, decks: [] }), TypeError);
  assert.throws(() => createSession({ seed: 1, registry, decks: new Map([[HUMAN_ID, decks.get(HUMAN_ID)]]) }), TypeError);
});

test('świeża sesja przewija puste okna do pierwszej decyzji człowieka', () => {
  const { registry, decks } = buildDecks();
  // Seed 3 po Batch 27 (zmiana talii green/red — przelosowane hunterem).
  const session = createSession({ seed: 3, registry, decks });
  const view = session.view();
  assert.equal(view.playerId, HUMAN_ID);
  assert.equal(view.status, 'active');
  // T4 (mulligan londyński): pierwsza decyzja człowieka to ręka startowa —
  // sesja staje w untap z ofertą keep/mulligan.
  assert.equal(view.turn.phase, 'beginning');
  assert.ok(view.legalCommands.some((cmd) => cmd.type === 'resolve_mulligan_choice'), 'mulligan to pierwsza decyzja');
  assert.ok(session.apply(view.legalCommands.find((cmd) => cmd.type === 'resolve_mulligan_choice')).ok, 'keep');
  // Po zatrzymaniu ręki: untap/upkeep/draw mają wyłącznie pass (CR 103.7a —
  // pierwsza tura nie dobiera) — sesja staje w main na pierwszej decyzji.
  const view2 = session.view();
  assert.equal(view2.turn.phase, 'precombat_main');
  assert.ok(!view2.legalCommands.some((cmd) => cmd.type === 'draw_card'), 'pierwsza tura gry pomija draw step');
  const ownHand = view.zones.hand.filter((o) => !o.hidden);
  assert.equal(ownHand.length, 7, 'ręka otwarcia człowieka jest w pełni jawna dla właściciela');
  assert.ok(ownHand.every((o) => o.cardId && o.kind), 'karty własnej ręki niosą pełne dane do planowania');
});

test('odrzucona komenda nie zmienia stanu i trafia do logu', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 7, registry, decks });
  // T4: najpierw zatrzymaj rękę otwarcia (mulligan keep).
  assert.ok(session.apply(session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice')).ok);
  const before = session.state.commands.length;
  const bogus = { type: 'play_land', playerId: HUMAN_ID, objectId: 'nie-istnieje' };
  const result = session.apply(bogus);
  assert.equal(result.ok, false);
  assert.match(result.reason, /illegal_land/);
  assert.equal(session.state.commands.length, before, 'odrzucona komenda nie wchodzi do logu replayu');
  assert.ok(session.log.some((entry) => entry.kind === 'rejection' && entry.text.includes('illegal_land')));
});

test('pełna partia człowiek–bot kończy się rozstrzygnięciem w engine', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 11, registry, decks });
  const humanMoves = playOut(session);
  assert.ok(humanMoves > 0, 'człowiek nie wykonał żadnego ruchu');
  assert.equal(session.state.status, 'finished');
  assert.ok(session.state.winnerId, 'brak zwycięzcy');
  // Bot faktycznie grał: jego komendy leżą w logu replayu.
  assert.ok(session.state.commands.some((cmd) => cmd.playerId === BOT_ID));
  // Log stołu opisuje zdarzenia po polsku, bez technicznych typów.
  const texts = session.log.map((entry) => entry.text);
  assert.ok(texts.some((t) => t.includes('dobiera')), 'log nie opisuje dobierania');
  assert.ok(texts.some((t) => t.includes('Tura gracza')), 'log nie opisuje tur');
});

test('eksport i import replayu odtwarzają partię bez odrzuceń', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 11, registry, decks });
  playOut(session);
  const text = session.exportReplayText();
  assert.match(text, /^\{"version":1,/);
  // Import na świeżej sesji w tym samym składzie talii.
  const reloader = createSession({ seed: 11, registry, decks });
  const summary = reloader.importReplayText(text);
  assert.equal(summary.steps, session.state.commands.length);
  assert.equal(summary.rejected, 0, 'replay zawiera odrzucone komendy');
  assert.equal(summary.status, 'finished');
  assert.ok(summary.winner, 'brak zwycięzcy w podsumowaniu importu');
  // Odtworzony replay doprowadza do dokładnie tego samego stanu gry.
  assert.equal(summary.fingerprint, stateFingerprint(session.state));
});

test('sesje z tym samym seedem przebiegają identycznie (bez Math.random)', () => {
  const one = buildDecks();
  const two = buildDecks();
  const a = createSession({ seed: 23, registry: one.registry, decks: one.decks });
  const b = createSession({ seed: 23, registry: two.registry, decks: two.decks });
  const moves = [];
  for (let i = 0; i < 40 && a.state.status === 'active'; i += 1) {
    const view = a.view();
    const cmd = chooseHumanCommand(view);
    moves.push(cmd);
    assert.equal(a.apply(cmd).ok, true);
  }
  for (const cmd of moves) assert.equal(b.apply(cmd).ok, true, `rozbieżność przy ${cmd.type}`);
  assert.equal(b.exportReplayText(), a.exportReplayText());
});

test('partia z czarami przechodzi przez stos i event log to opisuje', () => {
  const { registry, decks } = buildDecks('tarkir.txt', 'warhammer.txt');
  // Seed 4 po Batch 35 E3 (green +Trade Route Envoy, red bez zmian) —
  // przelosowane hunterem (kolejne trafienia: 17, 32).
  const session = createSession({ seed: 4, registry, decks });
  playOut(session);
  // W obu taliach są instants — w długiej partii któryś musiał zostać rzucony.
  assert.ok(
    session.state.events.some((e) => e.type === 'spell_cast'),
    'żaden czar nie został rzucony w całej partii',
  );
});

// --- Etykiety logu dla zdarzeń Batchu 18 (2026-08-06) -----------------------
// Seedy/kombinacje zamrożone pomiarem (dokument w duchu ADR 0005): przy
// zmianie talii lub przepływu gry należy je przelosować tym samym hunterem.

function logEventTexts(session) {
  return session.log.filter((entry) => entry.kind === 'event').map((entry) => entry.text);
}

// M178 (rewolucja talii): te cztery testy etykiet były ZAMROŻONYMI SEEDAMI
// pełnych partii i wymagały przelosowania po KAŻDEJ zmianie talii (10+ wpisów
// historii hunterów powyżej każdego). Po przejściu na talie per plan (ADR
// 0023) przepisane na DETERMINISTYCZNE scenariusze silnikowe: te same
// zdarzenia engine przechodzą przez describeGameEvent (ten sam czytelnik,
// którego używa sesja) — bez lososowania talii i seedów.

function scenarioState(activeId = 'p1') {
  const state = createGameState({ seed: 178, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', activeId);
  state.turn.activePlayerId = activeId;
  state.turn.priorityPlayerId = activeId;
  return state;
}

function scenarioPut(state, registry, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = registry.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

function scenarioTexts(state, registry) {
  const helpers = {
    nameOf: (id) => registry.get(id)?.name ?? String(id),
    nameOfObject: (id) => {
      const object = state.objects.get(id);
      return object ? (registry.get(object.cardId)?.name ?? object.name ?? String(id)) : String(id);
    },
    isPlayer: (id) => state.players.some((player) => player.id === id),
  };
  return state.events.map((e) => describeGameEvent(e, helpers)).filter((t) => typeof t === 'string');
}

function scenarioResolve(state, max = 12) {
  for (let i = 0; i < max && state.zones.stack.length > 0; i += 1) {
    engineExecute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
}

test('log opisuje decyzję devour (Gorger Wurm) — wymaganie i poświęcenie', () => {
  const registry = createCardRegistry();
  const state = scenarioState('p2');
  scenarioPut(state, registry, 'gorger', 'gorger-wurm', 'p2', 'hand');
  scenarioPut(state, registry, 'fodder', 'highland-game', 'p2');
  addMana(state, 'p2', 7, { colors: ['R', 'G'] });
  const cast = enginePlayerView(state, 'p2').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'gorger');
  assert.ok(cast, 'oferta rzutu Gorger Wurm');
  assert.ok(engineExecute(state, cast).ok);
  scenarioResolve(state);
  assert.ok(state.pendingDevours.length > 0, 'decyzja devour czeka');
  assert.ok(engineExecute(state, { type: 'resolve_devour_choice', playerId: 'p2', targetId: 'fodder' }).ok);
  // Po poświęceniu ostatniego kandydata decyzja domyka się sama.
  if (state.pendingDevours.length > 0) {
    assert.ok(engineExecute(state, { type: 'resolve_devour_choice', playerId: 'p2', done: true }).ok);
  }
  const texts = scenarioTexts(state, registry);
  assert.ok(texts.some((t) => /^Devour \(Gorger Wurm\): .* może poświęcać inne swoje stwory \(po 1× \+1\/\+1 za każdego\)$/.test(t)),
    `brak etykiety wymagania devour: ${texts.filter((t) => t.includes('Devour')).join(' | ')}`);
  assert.ok(texts.some((t) => /^Devour \(Gorger Wurm\): .+ poświęcony — 1× licznik \+1\/\+1 na źródle/.test(t)),
    'brak etykiety poświęcenia devour');
});

test('log opisuje decyzję endure (Kin-Tree Nurturer) — wybór i tryb', () => {
  const registry = createCardRegistry();
  const state = scenarioState('p2');
  scenarioPut(state, registry, 'nurturer', 'kin-tree-nurturer', 'p2', 'hand');
  addMana(state, 'p2', 3, { colors: ['B'] });
  const cast = enginePlayerView(state, 'p2').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'nurturer');
  assert.ok(cast, 'oferta rzutu Kin-Tree Nurturer');
  assert.ok(engineExecute(state, cast).ok);
  scenarioResolve(state);
  assert.ok(state.pendingEndures.length > 0, 'decyzja endure czeka');
  assert.ok(engineExecute(state, { type: 'resolve_endure_choice', playerId: 'p2', mode: 'token' }).ok);
  const texts = scenarioTexts(state, registry);
  assert.ok(texts.some((t) => /^Endure \(Kin-Tree Nurturer\): Nieprzyjaciel wybiera — 1× licznik \+1\/\+1 albo token Spirit 1\/1$/.test(t)),
    `brak etykiety wymagania endure: ${texts.filter((t) => t.includes('Endure')).join(' | ')}`);
  assert.ok(texts.some((t) => /^Endure \(Kin-Tree Nurturer\): Nieprzyjaciel wybiera (token Spirit 1\/1|1× licznik \+1\/\+1 na źródle)$/.test(t)),
    'brak etykiety wyboru endure');
});

test('log opisuje cel delirium (Fear of Burning Alive) — obrażenia w stwora', () => {
  const registry = createCardRegistry();
  const state = scenarioState('p1');
  scenarioPut(state, registry, 'foba', 'fear-of-burning-alive', 'p1', 'hand');
  // Delirium: 4 RÓŻNE typy kart we własnym grobie (CR 702.34 intervening-if).
  scenarioPut(state, registry, 'g1', 'highland-game', 'p1', 'graveyard'); // creature
  scenarioPut(state, registry, 'g2', 'bone-splinters', 'p1', 'graveyard'); // sorcery
  scenarioPut(state, registry, 'g3', 'panic-spellbomb', 'p1', 'graveyard'); // artifact
  scenarioPut(state, registry, 'g4', 'basic-mountain', 'p1', 'graveyard'); // land
  scenarioPut(state, registry, 'victim', 'highland-game', 'p2');
  addMana(state, 'p1', 6, { colors: ['R'] });
  const cast = enginePlayerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'foba');
  assert.ok(cast, 'oferta rzutu Fear of Burning Alive');
  assert.ok(engineExecute(state, cast).ok);
  scenarioResolve(state);
  // ETB zadaje 4 niekombatowe obrażenia przeciwnikowi → trigger delirium
  // kolejkuje wybór celu (stwór poszkodowanego gracza).
  assert.ok(state.pendingDeliriumTargets.length > 0, 'decyzja celu delirium czeka');
  assert.ok(engineExecute(state, { type: 'resolve_delirium_target', playerId: 'p1', targetId: 'victim' }).ok);
  const texts = scenarioTexts(state, registry);
  assert.ok(texts.some((t) => /^Delirium \(Fear of Burning Alive\):.+otrzymuje 4 obrażenia$/.test(t)),
    `brak etykiety rozstrzygnięcia delirium: ${texts.filter((t) => t.includes('Delirium')).join(' | ')}`);
});

test('log opisuje wybór kart z grobu na wierzch biblioteki (Forever Young)', () => {
  const registry = createCardRegistry();
  const state = scenarioState('p2');
  scenarioPut(state, registry, 'fy', 'forever-young', 'p2', 'hand');
  scenarioPut(state, registry, 'dead1', 'highland-game', 'p2', 'graveyard');
  scenarioPut(state, registry, 'dead2', 'gorger-wurm', 'p2', 'graveyard');
  scenarioPut(state, registry, 'lib1', 'basic-swamp', 'p2', 'library');
  addMana(state, 'p2', 2, { colors: ['B'] });
  const cast = enginePlayerView(state, 'p2').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'fy');
  assert.ok(cast, 'oferta rzutu Forever Young');
  assert.ok(engineExecute(state, cast).ok);
  scenarioResolve(state);
  assert.ok(state.pendingGraveyardToTop, 'decyzja graveyard-top czeka');
  const pick = enginePlayerView(state, 'p2').legalCommands
    .find((c) => c.type === 'resolve_graveyard_top_choice' && c.targetId);
  assert.ok(pick, 'oferta wyboru karty z grobu');
  assert.ok(engineExecute(state, pick).ok);
  if (state.pendingGraveyardToTop) {
    assert.ok(engineExecute(state, { type: 'resolve_graveyard_top_choice', playerId: 'p2', done: true }).ok);
  }
  const texts = scenarioTexts(state, registry);
  // M213: nazwa karty NADAL jest w logu, ale pochodzi z danych zdarzenia
  // (sourceCardId → srcName), nie z literalu w kodzie — więc prefiks, nie nawias.
  assert.ok(texts.some((t) => /^Forever Young: .*wybiera karty-stwory z grobu na wierzch biblioteki/.test(t)),
    `brak etykiety wymagania graveyard-top: ${texts.filter((t) => t.includes('wierzch')).join(' | ')}`);
  assert.ok(texts.some((t) => /kończy wybieranie kart na wierzch biblioteki/.test(t))
    || texts.some((t) => /wraca z grobu na wierzch biblioteki/.test(t)),
    'brak etykiety rozstrzygnięcia graveyard-top');
});
