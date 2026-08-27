// M96 — audyt Żywym Testerem (rola gracza): 12 partii na 9 taliach.
//
// Osie audytu (docs/setup/TESTER_STOLU.md → „Czego szukać"):
//  1. bezsensowne działania bota,
//  2. kompletność informacji w logu i modalu „Rozgrywka"
//     („wszystko poza szumem powinno tam być"),
//  3. ptaszki wyciszenia auto-pass.
//
// Każdy test odtwarza to, CO WIDZIAŁ GRACZ w transkrypcie.
//
// UWAGA METODYCZNA: część pierwotnych podejrzeń odpadła po sprawdzeniu, czy
// obok „niemego" zdarzenia engine emituje inne, które niesie tę samą treść
// (np. poświęcenie przez exploit opisuje zdarzenie `exploited`, a discover
// bez trafienia — `discover_started`). Zgłaszamy tylko realne luki.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeGameEvent, ZONE_LABELS } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();
const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };

function describe(event) {
  return describeGameEvent(event, {
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
    nameOfObject: () => 'Goblin Piker',
    isPlayer: (id) => ['p1', 'p2'].includes(id),
  }, NAMES);
}

// =============================================================================
// OŚ 2 — kompletność informacji dla gracza
// =============================================================================

test('M96/1: nadanie keywordu (haste) jest widoczne — gracz wie, czemu stwór atakuje', () => {
  // Transkrypt: stwór bota wchodzi i od razu atakuje (Awaken the Sleeper,
  // Cogwork Assembler). Gracz nie ma w logu ANI SŁOWA o nadaniu pośpiechu.
  // Engine emituje `keyword_granted`, ale zdarzenie nie miało opisu.
  const text = describe({
    type: 'keyword_granted', objectId: 'o1', cardId: 'goblin-piker', keywords: ['haste'],
  });
  assert.ok(text, 'nadanie keywordu MUSI być widoczne w logu');
  assert.match(text, /Goblin Piker/, 'opis musi nazywać kartę');
  assert.match(text, /pośpiech/i, 'keyword po polsku — spójnie z resztą UI');
});

test('M96/1b: nadanie kilku keywordów wymienia wszystkie', () => {
  const text = describe({
    type: 'keyword_granted', objectId: 'o1', cardId: 'goblin-piker',
    keywords: ['flying', 'trample'],
  });
  assert.match(text, /latanie/i);
  assert.match(text, /zadeptywanie/i);
});

test('M96/2: proliferate_resolved nie pokazuje surowej nazwy zdarzenia', () => {
  // Gracz widział w logu dosłownie „proliferate_resolved" — przeciek
  // techniczny z protokołu do interfejsu.
  const text = describe({ type: 'proliferate_resolved', playerId: 'p2' });
  assert.doesNotMatch(String(text ?? ''), /proliferate_resolved/,
    'log nie może pokazywać surowego identyfikatora zdarzenia');
});

test('M96/3: modal ruchu bota nie pokazuje angielskich nazw stref', async () => {
  // Transkrypt (co widział gracz):
  //   „Nieprzyjaciel: Segmented Krotiq — library → hand"
  //   „Ty: Bomat Bazaar Barge — battlefield → exile"
  // Reszta UI jest po polsku; to przeciek identyfikatorów stref z engine.
  const fs = await import('node:fs');
  const source = fs.readFileSync('src/table/session.js', 'utf8');
  const start = source.indexOf('function noteBotMove');
  assert.ok(start > 0, 'noteBotMove musi istnieć');
  // M99: wycinek sztywnych 4000 znaków był kruchy — dopisanie komentarzy
  // wypychało `zoneLabel` poza okno i test padał bez zmiany zachowania.
  // Bierzemy ciało funkcji do początku NASTĘPNEJ deklaracji na tym poziomie.
  const rest = source.slice(start + 'function noteBotMove'.length);
  const nextFn = rest.indexOf('\n  function ');
  const body = nextFn > 0 ? rest.slice(0, nextFn) : rest;
  assert.doesNotMatch(body, /\$\{e\.fromZone \?\? '\?'\} → \$\{e\.toZone \?\? '\?'\}/,
    'modal ruchu bota nie może sklejać surowych identyfikatorów stref');
  assert.match(body, /ZONE_LABELS|zoneLabel/,
    'nazwy stref muszą przechodzić przez słownik polskich etykiet');
});

test('M96/3b: słownik stref tłumaczy wszystkie strefy gry', () => {
  for (const zone of ['battlefield', 'hand', 'graveyard', 'exile', 'library', 'stack']) {
    const label = ZONE_LABELS?.[zone];
    assert.ok(label, `brak polskiej etykiety dla strefy ${zone}`);
    assert.notEqual(label, zone, `etykieta strefy ${zone} to surowy identyfikator`);
  }
});

// --- Strażniki: informacje, które JUŻ działają (nie wolno ich zgubić) -------

test('M96 strażnik: poświęcenie przez exploit jest widoczne (zdarzenie `exploited`)', () => {
  const text = describe({ type: 'exploited', exploiterId: 's1', exploitedId: 'o1' });
  assert.match(text, /Goblin Piker/, 'gracz musi widzieć, kogo poświęcono');
});

test('M96 strażnik: discover bez trafienia widać przez `discover_started`', () => {
  const started = describe({ type: 'discover_started', playerId: 'p2', amount: 3 });
  assert.match(started, /discover/i, 'początek discover musi być w logu');
});

test('M96 strażnik: obrót karty widać przez `turned_face_up` / `object_transformed`', () => {
  assert.ok(describe({ type: 'turned_face_up', objectId: 'o1', cardId: 'goblin-piker' }));
  assert.match(
    describe({ type: 'object_transformed', objectId: 'o1', fromCardId: 'goblin-piker', cardId: 'ballista-watcher' }),
    /przemienia się/,
  );
});

// =============================================================================
// OŚ 1 — bezsensowne działania bota
// =============================================================================

test('M96/4: bot NIE mieli własnej biblioteki, gdy może zmielić przeciwnika (Cellar Door)', () => {
  // Transkrypt: „Nieprzyjaciel aktywuje zdolność: Cellar Door → cel:
  // Nieprzyjaciel" — SIEDEM razy w jednej partii. Cellar Door: „Target player
  // mills 1. If it's a creature card, YOU create a 2/2 Zombie" — token dostaje
  // kontroler NIEZALEŻNIE od celu, więc mielenie siebie jest ściśle gorsze
  // (przybliża własny deck-out bez żadnego zysku).
  //
  // Root cause: scoring `activate_ability` w ogóle nie wyceniał efektów
  // mill/damage/lose_life względem CELU — każdy wariant dostawał `score = 2`.
  // Ścieżka `cast_spell` rozróżnia własny/wrogi mill — niespójność.
  const state = createGameState({ seed: 96, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);

  const card = REGISTRY.get('cellar-door');
  addObject(state, {
    id: 'door', instanceId: 'i-door', cardId: 'cellar-door', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'artifact', ...gameObjectDataOf(card),
    types: card.types ?? [], keywords: card.keywords ?? [], subtypes: card.subtypes ?? [],
  });

  const view = playerView(state, 'p2');
  const offered = view.legalCommands.filter((c) => c.type === 'activate_ability' && c.objectId === 'door');
  assert.ok(offered.length >= 2, 'engine oferuje oba cele — wybór należy do bota');

  const choice = createHeuristicBot({ seed: 96 }).chooseCommand(view, {});
  if (choice.type === 'activate_ability' && choice.objectId === 'door') {
    assert.deepEqual(choice.targets, ['p1'],
      `bot mieli WŁASNĄ bibliotekę zamiast biblioteki przeciwnika: ${JSON.stringify(choice)}`);
  }
});

test('M96/4b: bot nie kieruje w siebie zdolności zadającej obrażenia', () => {
  // Ta sama luka wyceny dotyczy „deals N damage to any target" (Ballista
  // Watcher): cel-gracz nie był w ogóle wyceniany.
  const state = createGameState({ seed: 98, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);

  const card = REGISTRY.get('ballista-watcher');
  addObject(state, {
    id: 'bw', instanceId: 'i-bw', cardId: 'ballista-watcher', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', ...gameObjectDataOf(card),
    types: card.types ?? [], keywords: card.keywords ?? [], subtypes: card.subtypes ?? [],
  });
  state.objects.set('bw', Object.freeze({ ...state.objects.get('bw'), summoningSickness: false }));

  const choice = createHeuristicBot({ seed: 98 }).chooseCommand(playerView(state, 'p2'), {});
  if (choice.type === 'activate_ability' && choice.objectId === 'bw') {
    assert.notDeepEqual(choice.targets, ['p2'],
      `bot celuje zdolnością obrażeniową w SIEBIE: ${JSON.stringify(choice)}`);
  }
});

test('M96/5: bot nie pompuje firebreathing w Głównej 1 przed deklaracją ataku', () => {
  // Transkrypt: „Nieprzyjaciel aktywuje zdolność: Shiv's Embrace" — 10× w jednej
  // partii, w Głównej 1, zanim w ogóle zadeklarował atak. Efekt „+1/+0 until
  // end of turn" wygasa w cleanup, więc mana wydana przed combatem przepada,
  // jeśli stwór nie zaatakuje (a gracz i tak zdąży zareagować na powiększonego
  // stwora). Sensowny moment to combat: po deklaracji atakujących/blokujących.
  //
  // Root cause: gałąź wyceny w `activate_ability` obsługiwała tylko
  // `effect.type === 'pump'`; Shiv's Embrace używa `pump_enchanted_creature`,
  // więc zdolność dostawała gołe `score = 2` i wygrywała z passem.
  const state = createGameState({ seed: 99, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);

  const aura = REGISTRY.get('shivs-embrace');
  addObject(state, {
    id: 'creat', instanceId: 'i-creat', cardId: 'goblin-piker', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 1, manaCost: 0,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['R'],
  });
  state.objects.set('creat', Object.freeze({ ...state.objects.get('creat'), summoningSickness: false }));
  addObject(state, {
    id: 'aura', instanceId: 'i-aura', cardId: 'shivs-embrace', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'aura', ...gameObjectDataOf(aura),
    types: aura.types ?? [], keywords: aura.keywords ?? [], subtypes: aura.subtypes ?? [], aura: aura.aura,
  });
  state.objects.set('aura', Object.freeze({ ...state.objects.get('aura'), attachedTo: 'creat' }));

  const choice = createHeuristicBot({ seed: 99 }).chooseCommand(playerView(state, 'p2'), {});
  const pumpsInMain = choice.type === 'activate_ability' && choice.objectId === 'aura';
  assert.ok(!pumpsInMain,
    `bot pompuje firebreathing w Głównej 1 (efekt wygaśnie): ${JSON.stringify(choice)}`);
});

test('M96/5b: firebreathing pozostaje dostępne w combacie (brak nadgorliwej kary)', () => {
  // Kontrola: w kroku obrażeń bojowych pump ma realny sens i engine
  // nadal go oferuje — nie zablokowaliśmy mechaniki, tylko zły timing.
  const state = createGameState({ seed: 100, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);

  const aura = REGISTRY.get('shivs-embrace');
  addObject(state, {
    id: 'creat', instanceId: 'i-creat', cardId: 'goblin-piker', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 1, manaCost: 0,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['R'],
  });
  state.objects.set('creat', Object.freeze({ ...state.objects.get('creat'), summoningSickness: false }));
  addObject(state, {
    id: 'aura', instanceId: 'i-aura', cardId: 'shivs-embrace', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'aura', ...gameObjectDataOf(aura),
    types: aura.types ?? [], keywords: aura.keywords ?? [], subtypes: aura.subtypes ?? [], aura: aura.aura,
  });
  state.objects.set('aura', Object.freeze({ ...state.objects.get('aura'), attachedTo: 'creat' }));

  const offered = playerView(state, 'p2').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'aura');
  assert.ok(offered.length > 0, 'engine musi nadal oferować firebreathing w combacie');
});

// =============================================================================
// M97 — audyt rozbudowanym testerem (profile greedy/random/defensive/explorer)
// =============================================================================

test('M98: modal „Rozgrywka" nie otwiera się z samą nazwą FAZY', async () => {
  // KOREKTA WŁAŚCICIELA (2026-08-14) do znaleziska M97:
  //   „Początek każdej tury to bardzo istotna informacja — chcę ją widzieć,
  //    nawet jeśli nic innego się nie dzieje. Modal nie powinien być pusty,
  //    ale jeśli w środku jest informacja o początku mojej tury i nic więcej,
  //    to nie jest błąd."
  //
  // Czyli: nagłówek TURY jest treścią (modal zostaje), a sama nazwa FAZY
  // („Faza: Główna 1") jest szumem — ma sens tylko jako kontekst zagrania.
  const { createSession, HUMAN_ID, BOT_ID } = await import('../src/table/session.js');
  const { parseDeckText } = await import('../src/cards/deck-text.js');
  const fs = await import('node:fs');

  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/tarkir-bg.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/warhammer-brg.txt', 'utf8'), registry).cardIds],
  ]);
  const session = createSession({ seed: 42, registry, decks, pauseOnBotMoves: true });

  let phaseOnlyPauses = 0;
  let turnHeaderPauses = 0;
  for (let i = 0; i < 400 && session.state.status === 'active'; i += 1) {
    if (session.botPausePending) {
      const moves = session.botMoves ?? [];
      const withoutPhase = moves.filter((m) => !/^Faza:/.test(m.text ?? ''));
      if (moves.length > 0 && withoutPhase.length === 0) phaseOnlyPauses += 1;
      if (withoutPhase.some((m) => m.type === 'turn_started')) turnHeaderPauses += 1;
      session.clearBotMoves();
      session.continueBotPlay();
      continue;
    }
    const view = session.view();
    const cmd = view.legalCommands.find((c) => c.type === 'resolve_mulligan_choice' && c.keep === true)
      ?? view.legalCommands.find((c) => !['pass_priority', 'concede'].includes(c.type))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!cmd) break;
    if (!session.apply(cmd).ok) break;
  }

  assert.equal(phaseOnlyPauses, 0,
    `gra ${phaseOnlyPauses}× zatrzymała gracza modalem zawierającym wyłącznie nazwę fazy`);
  assert.ok(turnHeaderPauses > 0,
    'nagłówki tury MUSZĄ docierać do gracza — to istotna informacja, nie szum');
});

test('M103/D: wygnanie kart za koszt Escape jest WIDOCZNE w logu (oś 2)', () => {
  // Zgłoszenie właściciela: bot uciekł Sweet Oblivion z grobu, a log nie
  // pokazywał wygnanych kart (tylko „Nieprzyjaciel rzuca Sweet Oblivion").
  // object_moved wracało null dla wszystkiego poza bounced — koszt Escape
  // (płatność jak mana) musi mieć opis.
  const text = describe({
    type: 'object_moved', fromId: 'g1', object: { cardId: 'basic-island', controllerId: 'p2' },
    fromZone: 'graveyard', toZone: 'exile', escape: true,
  });
  assert.ok(text, 'koszt Escape widoczny w logu');
  assert.match(text, /wygnane/i);
  assert.match(text, /Escape/i);
  assert.match(text, /Island/);
});
