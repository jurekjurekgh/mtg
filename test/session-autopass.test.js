import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOT_ID, HUMAN_ID, createSession, commandOptionKey } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject, playerView, execute } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';

/**
 * Auto-pass okien bez realnej decyzji (M7c):
 * - sam pass / samo tapnięcie lądu NIE jest decyzją — sesja przewija tury
 *   przeciwnika i puste fazy bez klikania;
 * - tapowanie landów w ogóle zniknęło z oferty (auto-tap przy płatności):
 *   zagranie wykonalne po manie produkowalnej jest oferowane od razu;
 * - puste deklaracje ataku/bloków i rozstrzygnięcie walki bez odpowiedzi
 *   też przechodzą automatycznie.
 */

function buildDecks(humanCards, botCards) {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, humanCards],
    [BOT_ID, botCards],
  ]);
  return { registry, decks };
}

/** Gra człowiekiem według prostej polityki i zbiera okna, które zobaczył. */
function collectWindows(session, { maxMoves = 40 } = {}) {
  const windows = [];
  for (let i = 0; i < maxMoves; i += 1) {
    if (session.state.status !== 'active') break;
    const view = session.view();
    assert.equal(view.turn.priorityPlayerId, HUMAN_ID, 'sesja zatrzymała się poza oknem człowieka');
    windows.push({
      phase: view.turn.phase,
      step: view.turn.step,
      commands: view.legalCommands.map((cmd) => cmd.type),
    });
    const meaningful = view.legalCommands.filter(
      (cmd) => !['pass_priority', 'concede', 'tap_for_mana', 'resolve_combat'].includes(cmd.type),
    );
    const cmd = meaningful[0]
      ?? view.legalCommands.find((c) => c.type === 'draw_card')
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    assert.ok(cmd, `brak komendy w oknie: ${view.legalCommands.map((c) => c.type).join(',')}`);
    const result = session.apply(cmd);
    assert.ok(result.ok, `komenda odrzucona: ${result.reason}`);
  }
  return windows;
}

const LANDS = Array.from({ length: 8 }, () => 'basic-mountain');
const BOT_AGGRO = ['basic-mountain', 'basic-mountain', 'basic-mountain', 'basic-mountain', 'highland-game', 'highland-game', 'goblin-piker', 'goblin-piker'];

test('gracz bez wykonalnych kart nie widzi okien z samym tapowaniem ani deklaracji walki', () => {
  const { registry, decks } = buildDecks(LANDS, BOT_AGGRO);
  const session = createSession({ seed: 9, registry, decks });
  const windows = collectWindows(session);
  assert.ok(windows.length > 0, 'gracz nie zobaczył żadnego okna');
  for (const window of windows) {
    const nonPass = window.commands.filter((c) => !['pass_priority', 'concede'].includes(c));
    const onlyTap = nonPass.every((c) => c === 'tap_for_mana');
    if (onlyTap) {
      // Jedyny dozwolony przypadek: main phase, gdzie po tapie coś się da zagrać.
      assert.ok(
        window.phase === 'precombat_main' || window.phase === 'postcombat_main',
        `tap-only okno poza main: ${window.phase}/${window.step}`,
      );
    }
    // Puste deklaracje i rozstrzyganie walki nigdy nie trafiają do człowieka.
    assert.ok(!window.commands.includes('declare_attackers'), 'pusta deklaracja ataku nie powinna zostać u człowieka');
    assert.ok(!window.commands.includes('declare_blockers'), 'pusta deklaracja bloków nie powinna zostać u człowieka');
    assert.ok(!window.commands.includes('resolve_combat'), 'resolve_combat bez odpowiedzi nie powinien zostać u człowieka');
  }
});

test('po zagraniu ostatniego lądu bez kart do zagrania sesja przewija do następnego dobierania', () => {
  const { registry, decks } = buildDecks(LANDS, BOT_AGGRO);
  const session = createSession({ seed: 9, registry, decks });
  // T4 (mulligan): zatrzymaj rękę otwarcia.
  assert.ok(session.apply(session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice')).ok);
  // Tura 1 nie dobiera (CR 103.7a) — zagraj landy z ręki startowej (7 z 8).
  for (let i = 0; i < 10; i += 1) {
    const view = session.view();
    const land = view.legalCommands.find((c) => c.type === 'play_land');
    if (!land) break;
    assert.equal(session.apply(land).ok, true);
  }
  // Ręka pusta, 7 landów na stole: sesja przewija resztę tury do następnego
  // dobierania (tura 2) — tam dobierz ósmego landa i zagraj.
  const view = session.view();
  assert.equal(view.turn.step, 'draw', `oczekiwano następnego dobierania, jest ${view.turn.phase}/${view.turn.step}`);
  assert.ok(view.legalCommands.some((c) => c.type === 'draw_card'));
  assert.equal(session.apply(view.legalCommands.find((c) => c.type === 'draw_card')).ok, true);
  const land2 = session.view().legalCommands.find((c) => c.type === 'play_land');
  if (land2) assert.equal(session.apply(land2).ok, true);
});

test('main phase: zagranie jest oferowane od razu — płatność sama tapuje land (auto-tap)', () => {
  const human = [...LANDS.slice(0, 4), 'forge-devil', 'forge-devil', 'forge-devil', 'forge-devil'];
  const { registry, decks } = buildDecks(human, BOT_AGGRO);
  const session = createSession({ seed: 3, registry, decks });
  // T4 (mulligan): zatrzymaj rękę otwarcia.
  assert.ok(session.apply(session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice')).ok);
  // Tura 1 nie dobiera (CR 103.7a) — zagraj landa z ręki startowej.
  assert.equal(session.apply(session.view().legalCommands.find((c) => c.type === 'play_land')).ok, true);
  // Main phase: 0 many w puli, 1 nietapnięty land, w ręce Forge Devil za 1.
  // Okno musi zostać u człowieka, a cast_permanent jest oferowany OD RAZU —
  // koszt pokrywa mana produkowalna; zebranie many dzieje się przy płatności.
  const view = session.view();
  assert.ok(['precombat_main', 'postcombat_main'].includes(view.turn.phase), `oczekiwano main, jest ${view.turn.phase}/${view.turn.step}`);
  const types = view.legalCommands.map((c) => c.type);
  assert.ok(!types.includes('tap_for_mana'), 'tap_for_mana zniknął z oferty (auto-tap przy płatności)');
  assert.ok(types.includes('cast_permanent'), 'zagranie powinno być oferowane mimo pustej puli');
  // Wykonanie zagrania: engine sam zatapuje land na koszt (zdarzenie
  // mana_produced człowieka — jedyny sposób opłacenia kosztu przy pustej
  // puli; sesja po ruchu przewija puste okna, więc sprawdzamy strumień
  // zdarzeń, nie bieżący planszetę).
  const cast = view.legalCommands.find((c) => c.type === 'cast_permanent');
  assert.equal(session.apply(cast).ok, true, 'zagranie z pustą pulą odrzucone');
  assert.ok(
    session.state.events.some((e) => e.type === 'mana_produced' && e.playerId === HUMAN_ID),
    'płatność automatycznie zatapnęła land (brak mana_produced w strumieniu)',
  );
});

test('auto-pass zachowuje determinizm (ten sam seed = ta sama partia)', () => {
  const { registry, decks } = buildDecks(LANDS, BOT_AGGRO);
  const a = createSession({ seed: 11, registry, decks });
  const b = createSession({ seed: 11, registry, decks });
  const moves = [];
  for (let i = 0; i < 20 && a.state.status === 'active'; i += 1) {
    const view = a.view();
    const meaningful = view.legalCommands.filter(
      (cmd) => !['pass_priority', 'concede', 'tap_for_mana', 'resolve_combat'].includes(cmd.type),
    );
    const cmd = meaningful[0]
      ?? view.legalCommands.find((c) => c.type === 'draw_card')
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    assert.ok(cmd);
    assert.equal(a.apply(cmd).ok, true);
    moves.push(cmd);
  }
  for (const cmd of moves) assert.equal(b.apply(cmd).ok, true, `rozbieżność przy ${cmd.type}`);
  assert.equal(b.exportReplayText(), a.exportReplayText());
});

// Regresja 2026-08-07 (zgłoszenie D przed scaleniem PR #32): sesja potrafiła
// zatrzymać się w oknach z SAMYM passem — heurystyka „potencjału\" liczyła
// manę za nietapnięte landy BEZ kolorów, więc biała karta w ręce przy samych
// górach (pip {W} niespłacalny) zostawiała okno, w którym gracz nie miał
// żadnej legalnej akcji. Źródłem prawdy są wyłącznie legalCommands engine.
test('gracz z kartą niespłacalną kolorystycznie nie widzi okien z samym passem', () => {
  // 8 gór (mana tylko czerwona) + białe karty {W} — engine nie oferuje rzutu.
  const human = [...LANDS, 'soulmender', 'soulmender', 'soulmender', 'soulmender'];
  const { registry, decks } = buildDecks(human, BOT_AGGRO);
  const session = createSession({ seed: 5, registry, decks });
  const windows = collectWindows(session);
  assert.ok(windows.length > 0, 'gracz nie zobaczył żadnego okna');
  for (const window of windows) {
    const real = window.commands.filter((c) => !['pass_priority', 'concede', 'tap_for_mana', 'resolve_combat'].includes(c));
    // Każde okno ma realną akcję (dobranie, zagranie lądu) — nigdy sam pass.
    assert.ok(real.length > 0, `okno z samym passem: ${window.phase}/${window.step} (${window.commands.join(',')})`);
    // Biały czar nie może być oferowany bez białego źródła (kolorowa pula M41).
    assert.ok(!window.commands.includes('cast_spell'), 'rzut niespłacalny kolorystycznie nie powinien być oferowany');
  }
});

// --- Feature 2026-08-11: wyciszone opcje nie przerywają auto-passu -----------

test('Feature: wyciszona opcja nie przerywa auto-passu; odznaczona znów przerywa', () => {
  const registry = createCardRegistry();
  // Talie: człowiek — same lądy (scenę budujemy ręcznie), bot — same góry.
  const decks = new Map([
    [HUMAN_ID, Array.from({ length: 8 }, () => 'basic-plains')],
    [BOT_ID, Array.from({ length: 8 }, () => 'basic-mountain')],
  ]);
  const ignored = new Set();
  const session = createSession({ seed: 42, registry, decks, ignoredOptionKeys: ignored });
  // Rozstrzygnij mulligan (zatrzymaj rękę), zanim zbudujemy scenę.
  const mull = session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice');
  assert.ok(mull, 'mulligan do rozstrzygnięcia');
  assert.ok(session.apply({ ...mull, keep: true }).ok, 'keep po mulliganie');
  const state = session.state;
  // Scena: tura człowieka, main phase, priorytet u człowieka.
  state.turn = jumpToStep(state.turn, 'main', HUMAN_ID);
  state.turn.activePlayerId = HUMAN_ID;
  state.turn.priorityPlayerId = HUMAN_ID;
  // Opróżnij rękę człowieka — żeby play_land nie psuł okna (jedyna sensowna
  // komenda to aktywacja zdolności).
  for (const id of [...state.zones.hand]) {
    if (state.objects.get(id)?.controllerId !== HUMAN_ID) continue;
    state.zones.hand = state.zones.hand.filter((x) => x !== id);
    const gid = `grave-${state.objectSequence++}`;
    state.zones.graveyard.push(gid);
    const o = state.objects.get(id);
    state.objects.delete(id);
    state.objects.set(gid, Object.freeze({ ...o, id: gid, zone: 'graveyard' }));
  }
  // Permanent ze zdolnością aktywowaną (Seer's Lantern {2},{T}: Scry 1).
  const card = registry.get('seers-lantern');
  const data = gameObjectDataOf(card);
  addObject(state, {
    id: 'lantern', instanceId: 'i-lantern', cardId: 'seers-lantern',
    controllerId: HUMAN_ID, ownerId: HUMAN_ID, zone: 'battlefield',
    ...data, types: card.types ?? [], keywords: card.keywords ?? [], subtypes: card.subtypes ?? [],
  });
  addMana(state, HUMAN_ID, 2);

  const view = session.view();
  assert.equal(view.turn.priorityPlayerId, HUMAN_ID, 'okno człowieka');
  const acts = view.legalCommands.filter((c) => c.type === 'activate_ability' && c.objectId === 'lantern');
  assert.ok(acts.length > 0, 'zdolności Lantern oferowane (jedyna sensowna komenda)');
  // Lantern ma DWA aktywowane (scry 1 + mana) — wyciszamy obie.
  const keys = acts.map((c) => commandOptionKey(c));

  // 1. Bez wyciszenia recheckAutoPass NIE przewija — okno jest realne.
  session.recheckAutoPass();
  assert.equal(session.view().turn.priorityPlayerId, HUMAN_ID, 'okno wciąż u człowieka (bez wyciszenia)');
  assert.equal(state.turn.number, 1, 'tura bez zmian');

  // 2. Wycisz opcje — auto-pass przechodzi przez okno (aż do kolejnego
  //    realnego okna człowieka: dobrany ląd w turze 3 → play_land).
  for (const k of keys) ignored.add(k);
  session.recheckAutoPass();
  assert.ok(state.turn.number >= 2, `auto-pass opuścił turę 1 (jest ${state.turn.number})`);

  // 3. Odznaczenie przywraca przerywanie: w oknie z samą wyciszoną opcją
  //    auto-pass znów staje (sprawdzamy na nowej scenie).
  for (const k of keys) ignored.delete(k);
  const state2 = session.state;
  state2.turn = jumpToStep(state2.turn, 'main', HUMAN_ID);
  state2.turn.activePlayerId = HUMAN_ID;
  state2.turn.priorityPlayerId = HUMAN_ID;
  addMana(state2, HUMAN_ID, 2);
  const view2 = session.view();
  const act2 = view2.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'lantern');
  assert.ok(act2, 'zdolność nadal oferowana po odznaczeniu');
  session.recheckAutoPass();
  assert.equal(session.view().turn.priorityPlayerId, HUMAN_ID, 'odznaczona opcja znów przerywa auto-pass');
});

// --- Audyt (B10): rzucający zachowuje priorytet (CR 117.3c) — sesja ----------

function b10Session(registry, decks, ignored) {
  const session = createSession({ seed: 7, registry, decks, ignoredOptionKeys: ignored, pauseOnBotMoves: false });
  const state = session.state;
  for (let i = 0; i < 10; i += 1) {
    const v = playerView(state, state.turn.priorityPlayerId);
    const mull = v.legalCommands.find((c) => c.type === 'resolve_mulligan_choice');
    if (!mull) break;
    execute(state, { ...mull, keep: true });
  }
  state.turn = jumpToStep(state.turn, 'main', HUMAN_ID);
  state.turn.activePlayerId = HUMAN_ID; state.turn.priorityPlayerId = HUMAN_ID;
  for (const id of [...state.zones.hand]) {
    if (state.objects.get(id)?.controllerId !== HUMAN_ID) continue;
    state.zones.hand = state.zones.hand.filter((x) => x !== id);
    const gid = `grave-${state.objectSequence++}`;
    state.zones.graveyard.push(gid);
    const o = state.objects.get(id);
    state.objects.delete(id);
    state.objects.set(gid, Object.freeze({ ...o, id: gid, zone: 'graveyard' }));
  }
  const addRealCard = (id, cardId, playerId, zone) => {
    const card = registry.get(cardId);
    const data = gameObjectDataOf(card);
    data.types = card.types ?? []; data.keywords = card.keywords ?? []; data.subtypes = card.subtypes ?? [];
    return addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone, ...data });
  };
  return { session, state, addRealCard };
}

test('B10: po rzucie czaru sesja ZATRZYMUJE się u rzucającego — może odpowiedzieć własnym instanitem (CR 117.3c)', () => {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, ['basic-plains', 'basic-plains', 'basic-island', 'basic-island', 'basic-swamp', 'basic-swamp', 'highland-game', 'highland-game']],
    [BOT_ID, Array.from({ length: 8 }, () => 'basic-mountain')],
  ]);
  const { session, state, addRealCard } = b10Session(registry, decks, new Set());
  addRealCard('sorc', 'spread-the-sickness', HUMAN_ID, 'hand');
  addRealCard('instant', 'curate', HUMAN_ID, 'hand');
  addRealCard('victim', 'highland-game', BOT_ID, 'battlefield');
  addMana(state, HUMAN_ID, 10, { colors: ['B', 'U'] });
  // Gracz rzuca sorcery (klik → session.apply).
  const v0 = session.view();
  const sorcCmd = v0.legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'sorc');
  assert.ok(sorcCmd, 'sorcery w ofercie');
  assert.ok(session.apply({ ...sorcCmd, targets: ['victim'] }).ok, 'apply sorcery');
  // Sesja ZATRZYMUJE się u gracza — ma priorytet (CR 117.3c) i instanta.
  const v1 = session.view();
  assert.equal(v1.turn.priorityPlayerId, HUMAN_ID, 'rzucający zachowuje priorytet (CR 117.3c)');
  const instCmd = v1.legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'instant');
  assert.ok(instCmd, 'rzucający ma w ofercie własnego instanta (niezaptaszkowanego)');
  // Rzuca instanta na wierzch stosu.
  assert.ok(session.apply(instCmd).ok, 'apply instant');
  assert.deepEqual(state.zones.stack.map((id) => state.objects.get(id).cardId),
    ['spread-the-sickness', 'curate'], 'instant na wierzchu (LIFO)');
});

test('B10: zaptaszkowany instant — okno odpowiedzi NIE zatrzymuje auto-passu (CR 117.3c + feature)', () => {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, ['basic-plains', 'basic-plains', 'basic-island', 'basic-island', 'basic-swamp', 'basic-swamp', 'highland-game', 'highland-game']],
    [BOT_ID, Array.from({ length: 8 }, () => 'basic-mountain')],
  ]);
  const ignored = new Set();
  const { session, state, addRealCard } = b10Session(registry, decks, ignored);
  addRealCard('sorc', 'spread-the-sickness', HUMAN_ID, 'hand');
  addRealCard('instant', 'curate', HUMAN_ID, 'hand');
  addRealCard('victim', 'highland-game', BOT_ID, 'battlefield');
  addMana(state, HUMAN_ID, 10, { colors: ['B', 'U'] });
  const v0 = session.view();
  const sorcCmd = v0.legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'sorc');
  const instCmd = v0.legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'instant');
  // Zaptaszkuj instanta PRZED rzutem.
  ignored.add(commandOptionKey(instCmd));
  assert.ok(session.apply({ ...sorcCmd, targets: ['victim'] }).ok, 'apply sorcery');
  // Okno odpowiedzi (priorytet u rzucającego, czar na stosie) z samą wyciszoną
  // opcją NIE zatrzymuje sesji — auto-pass idzie dalej (do bota / następnej
  // realnej decyzji człowieka).
  const v1 = session.view();
  const responseWindow = v1.turn.priorityPlayerId === HUMAN_ID
    && state.zones.stack.some((id) => state.objects.get(id)?.cardId === 'spread-the-sickness');
  assert.ok(!responseWindow || !v1.legalCommands.some((c) => c.type === 'cast_spell' && c.objectId === 'instant'),
    'zaptaszkowany instant nie otwiera okna odpowiedzi u rzucającego');
});
