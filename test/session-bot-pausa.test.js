import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';

/**
 * Pauza po każdym istotnym zagraniu bota (decyzja właściciela 2026-08-05):
 * gra zatrzymuje się na klik gracza po rzuceniu czaru przez bota, wystawieniu
 * lądu, użyciu zdolności i zmianie strefy karty — nawet gdy gracz nie ma
 * żadnej możliwej odpowiedzi. Wznowienie: session.continueBotPlay (klik
 * „Rozumiem" w modalu „Ruch bota"). Pauzy są czystym tempem UI: nie zmieniają
 * przebiegu partii (test fingerprintów pauzowanej i zwykłej sesji).
 */

const PAUSE_TYPES = new Set([
  'spell_cast', 'permanent_cast', 'aura_spell_cast', 'land_played',
  'ability_activated', 'ability_resolved', 'ability_triggered',
  'object_moved', 'object_exiled', 'permanent_destroyed', 'creature_destroyed',
  'permanent_sacrificed', 'permanent_put_into_graveyard',
  'token_created', 'permanent_entered_battlefield',
  // M146: pauza wywołana przez `ability_triggered` może zostawić w buforze
  // tylko `trigger_target_required` — opis celu triggera DEDUPLIKUJE wpis
  // ability_triggered („Wybór celu już opisuje trigger_target_required"),
  // więc bufor pauzy bywa właśnie taki. To legalny powód pauzy (cel triggera
  // bota to istotna akcja), test musi go znać.
  'trigger_target_required', 'trigger_target_resolved',
]);

function buildDecks() {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/tarkir-bg.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/warhammer-ubr.txt', 'utf8'), registry).cardIds],
  ]);
  return { registry, decks };
}

function humanCommand(view) {
  const first = (type) => view.legalCommands.find((c) => c.type === type);
  const meaningful = view.legalCommands.filter(
    (c) => !['pass_priority', 'concede', 'tap_for_mana', 'resolve_combat'].includes(c.type),
  );
  // Okno z SAMYM obowiązkowym krokiem (np. resolve_combat po deklaracjach):
  // nic „ciekawego" nie ma, ale kliknąć trzeba — bierz pierwszą nie-poddanie.
  return meaningful[0] ?? first('draw_card') ?? first('pass_priority')
    ?? view.legalCommands.find((c) => c.type !== 'concede');
}

/** Rozgrywa partię potwierdzając każdą pauzę; zwraca listę odwiedzonych pauz. */
function playOutAckingPauses(session, { maxMoves = 500 } = {}) {
  const visited = [];
  const boundaryPauseFlags = [];
  for (let i = 0; i < maxMoves && session.state.status === 'active'; i += 1) {
    if (session.botPausePending) {
      // typ|tekst — dobranie kroku dobierania CZŁOWIEKA też jest powodem
      // pauzy (M100/E8; dobranie bota nadal szumem i pauzy nie wywołuje).
      // M261: odnotowujemy też, czy pauza zamyka paczkę na granicy tury.
      boundaryPauseFlags.push(Boolean(session.botPauseAtTurnBoundary));
      visited.push(session.botMoves.map((m) => `${m.type}|${m.text ?? ''}`));
      session.clearBotMoves();
      session.continueBotPlay();
      continue;
    }
    const view = session.view();
    assert.equal(view.turn.priorityPlayerId, HUMAN_ID, 'sesja stanęła poza oknem człowieka bez pauzy');
    const result = session.apply(humanCommand(view));
    assert.ok(result.ok, `komenda odrzucona: ${result.reason}`);
  }
  return { visited, boundaryPauseFlags };
}

test('pauza po każdym istotnym zagraniu bota: rzut, ląd, zdolność, zmiana strefy', () => {
  const { registry, decks } = buildDecks();
  // Seed 2 po Batchu 36 E4 (red +Molten Nursery); seed 3 po Batchu 39 A
  // (green +Knight of the Skyward Eye +4 Plains) — przelosowane hunterem.
  // M178 (talie per plan, tarkir vs warhammer) — hunter: 1, 4, 5, 6, 9…
  const session = createSession({ seed: 1, registry, decks, pauseOnBotMoves: true });
  const { visited, boundaryPauseFlags } = playOutAckingPauses(session);
  assert.equal(session.state.status, 'finished', 'partia nie doszła do końca');
  assert.ok(visited.length > 3, `za mało pauz w pełnej partii: ${visited.length}`);
  // M261: w pełnej partii granica tury przynajmniej raz zamyka paczkę
  // modala (ogon starej tury czeka na „Rozumiem" przed „Tura N — …").
  assert.ok(
    boundaryPauseFlags.some(Boolean),
    'brak pauzy na granicy tury w pełnej partii',
  );
  for (const [i, entries] of visited.entries()) {
    assert.ok(entries.length > 0, 'pauza z pustym buforem ruchów');
    // M100/E8: poza typami „istotnego zagrania" pauzę legalnie wywołuje
    // własne dobranie („Dobierasz: …").
    // M261 (zgłoszenie właściciela 2026-08-31): legalna jest też pauza
    // zamykająca paczkę na GRANICY TURY — ogon starej tury (np. obrażenia
    // z walki) dostaje własny modal, a „Tura N — …" otworzy świeży po
    // „Rozumiem". Zdarzenia samego ogona nie muszą być „istotne".
    if (boundaryPauseFlags[i]) continue;
    const pauseOk = (entry) => {
      const [type, text] = entry.split('|');
      return PAUSE_TYPES.has(type) || (type === 'card_drawn' && /^Dobierasz/.test(text ?? ''));
    };
    assert.ok(
      entries.some(pauseOk),
      `pauza bez istotnego zdarzenia: ${entries.join(', ')}`,
    );
  }
  const all = visited.flat().map((entry) => entry.split('|')[0]);
  assert.ok(all.includes('land_played'), 'brak pauzy po wystawieniu lądu');
  assert.ok(all.includes('permanent_cast') || all.includes('spell_cast') || all.includes('aura_spell_cast'),
    'brak pauzy po rzuceniu karty');
  assert.ok(all.includes('ability_activated'), 'brak pauzy po użyciu zdolności');
  assert.ok(
    all.some((type) => ['object_moved', 'creature_destroyed', 'permanent_destroyed', 'permanent_put_into_graveyard', 'token_created', 'permanent_entered_battlefield'].includes(type)),
    'brak pauzy po zmianie strefy karty',
  );
});

test('bez opcji pauseOnBotMoves sesja zachowuje się jak dotąd (bez pauz)', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 7, registry, decks });
  let pendingSeen = false;
  for (let i = 0; i < 500 && session.state.status === 'active'; i += 1) {
    pendingSeen = pendingSeen || session.botPausePending;
    const result = session.apply(humanCommand(session.view()));
    assert.ok(result.ok, `komenda odrzucona: ${result.reason}`);
    assert.equal(result.botPause, false, 'apply zgłasza pauzę przy wyłączonej opcji');
  }
  assert.equal(session.state.status, 'finished');
  assert.equal(pendingSeen, false, 'flaga botPausePending pojawiła się bez opcji');
});

test('pauzy nie zmieniają przebiegu partii (ten sam seed = ten sam fingerprint)', () => {
  const { registry, decks } = buildDecks();
  const paused = createSession({ seed: 7, registry, decks, pauseOnBotMoves: true });
  playOutAckingPauses(paused);
  const plain = createSession({ seed: 7, registry, decks });
  for (let i = 0; i < 500 && plain.state.status === 'active'; i += 1) {
    const result = plain.apply(humanCommand(plain.view()));
    assert.ok(result.ok);
  }
  assert.equal(paused.state.status, plain.state.status);
  assert.equal(stateFingerprint(paused.state), stateFingerprint(plain.state));
});

test('continueBotPlay bez oczekującej pauzy jest bezpiecznym no-op', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 7, registry, decks, pauseOnBotMoves: true });
  let result = { botPause: true };
  while (result.botPause) result = session.continueBotPlay();
  assert.equal(session.botPausePending, false);
  const before = stateFingerprint(session.state);
  const noop = session.continueBotPlay();
  assert.equal(noop.ok, true);
  assert.equal(noop.botPause, false);
  assert.equal(stateFingerprint(session.state), before, 'no-op zmienił stan gry');
});

// =============================================================================
// Uwaga A (2026-08-12): szukanie w bibliotece nie dubluje komunikatu o
// tasowaniu (search_choice_resolved + library_searched = jeden wpis).
// Uwaga C: modal ruchu bota pokazuje nagłówki „Tura …\"/„Faza: …\".
// =============================================================================
test('A: szukanie nie dubluje „tasuje bibliotekę\" (search + library_searched)', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 1, registry, decks, pauseOnBotMoves: true });
  let dup = 0;
  for (let i = 0; i < 1200 && session.state.status === 'active'; i += 1) {
    if (session.botPausePending) {
      const texts = session.botMoves.map((m) => m.text);
      for (let j = 0; j < texts.length - 1; j += 1) {
        if (texts[j] && texts[j].includes('znajduje kartę') && texts[j + 1] && texts[j + 1].includes('przeszukuje bibliotekę')) {
          dup += 1;
        }
      }
      session.clearBotMoves();
      session.continueBotPlay();
      continue;
    }
    const view = session.view();
    const result = session.apply(humanCommand(view));
    assert.ok(result.ok, `komenda odrzucona: ${result.reason}`);
  }
  assert.equal(dup, 0, 'brak dublowanego komunikatu o tasowaniu');
});

test('C: modal ruchu bota pokazuje nagłówki tury/fazy przy ciągłym ruchu bota', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 1, registry, decks, pauseOnBotMoves: true });
  let turns = 0;
  let phases = 0;
  for (let i = 0; i < 1200 && session.state.status === 'active'; i += 1) {
    if (session.botPausePending) {
      for (const m of session.botMoves) {
        if (m.text.startsWith('Tura ')) turns += 1;
        if (m.text.startsWith('Faza:')) phases += 1;
      }
      session.clearBotMoves();
      session.continueBotPlay();
      continue;
    }
    const view = session.view();
    const result = session.apply(humanCommand(view));
    assert.ok(result.ok, `komenda odrzucona: ${result.reason}`);
  }
  assert.ok(turns >= 2, `co najmniej 2 nagłówki tury (było ${turns})`);
  assert.ok(phases >= 1, `co najmniej 1 nagłówek fazy przy akcji (było ${phases})`);
});

test('M80: „Brak ataku" przeciwnika nie trafia do modala ruchu bota (szum)', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 1, registry, decks, pauseOnBotMoves: true });
  for (let i = 0; i < 1200 && session.state.status === 'active'; i += 1) {
    if (session.botPausePending) {
      for (const m of session.botMoves) {
        assert.ok(!String(m.text).includes('Brak ataku'), `modal pokazuje szum „Brak ataku": ${m.text}`);
      }
      session.clearBotMoves();
      session.continueBotPlay();
      continue;
    }
    const view = session.view();
    const result = session.apply(humanCommand(view));
    assert.ok(result.ok, `komenda odrzucona: ${result.reason}`);
  }
});

test('A: modal nie pokazuje pustych kolejnych nagłówków „Faza:"', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 1, registry, decks, pauseOnBotMoves: true });
  for (let i = 0; i < 1200 && session.state.status === 'active'; i += 1) {
    if (session.botPausePending) {
      const texts = session.botMoves.map((m) => m.text);
      for (let j = 0; j < texts.length - 1; j += 1) {
        const a = texts[j]?.startsWith('Faza:');
        const b = texts[j + 1]?.startsWith('Faza:');
        assert.ok(!(a && b), `kolejne puste fazy: ${texts[j]} / ${texts[j + 1]}`);
      }
      session.clearBotMoves();
      session.continueBotPlay();
      continue;
    }
    const view = session.view();
    const result = session.apply(humanCommand(view));
    assert.ok(result.ok, `komenda odrzucona: ${result.reason}`);
  }
});

// =============================================================================
// M90 — bug B (zgłoszenie właściciela, iPhone 2026-08-14): „Forever Young
// z zaptaszkowanym pomijaniem → ekran z jedyną opcją »Poddaj walkę«;
// w logu »Ruch odrzucony: not_priority«".
//
// Root cause: `session.apply()` kasował `awaitingBotAck` PRZED `execute()`.
// Gdy engine odrzucił komendę (bo priorytet ma bot wstrzymany pauzą), sesja
// gubiła pauzę: `botPausePending` = false, więc UI nie rysowało „▶ Wznów grę
// bota", a legalCommands człowieka to samo `concede` → ekran „Poddaj partię"
// bez drogi wyjścia. Odrzucona komenda NIE MOŻE zmieniać stanu sesji.
// =============================================================================
test('bug B: odrzucona komenda podczas pauzy bota NIE gubi pauzy (droga wznowienia zostaje)', () => {
  const { registry, decks } = buildDecks();
  // M238 (rewizja testów): dawniej ZAMROŻONY SEED wymagający polowania po każdej
  // zmianie talii (moment pierwszej pauzy się przesuwał). Teraz SAMONAPRAWIALNY:
  // szukamy w locie pierwszego seeda, który dojeżdża do pauzy bota — koniec
  // ręcznego huntera. Test integracyjny pętli pauz (celowo emergentny), ale
  // odporny na przesunięcia tasowania.
  let session = null;
  for (let seed = 1; seed <= 80 && session === null; seed += 1) {
    const s = createSession({ seed, registry, decks, pauseOnBotMoves: true });
    let reached = false;
    for (let i = 0; i < 1200 && s.state.status === 'active' && !s.botPausePending; i += 1) {
      const result = s.apply(humanCommand(s.view()));
      if (!result.ok) { reached = false; break; }
      reached = true;
    }
    if (s.botPausePending && s.botMoves.length > 0) session = s;
  }
  assert.ok(session, 'nie znaleziono seeda dojeżdżającego do pauzy bota (1..80)');
  const movesBefore = session.botMoves.length;

  // Gracz klika akcję z nieaktualnego panelu (priorytet ma bot) — engine
  // odrzuca komendę „not_priority".
  const rejected = session.apply({ type: 'pass_priority', playerId: HUMAN_ID });
  assert.equal(rejected.ok, false, 'komenda w cudzym priorytecie musi zostać odrzucona');
  assert.equal(rejected.reason, 'not_priority');

  // KLUCZ: pauza (i jej bufor) przetrwały odrzucenie — gracz nadal ma
  // „▶ Wznów grę bota" i modal ruchu przeciwnika, zamiast samego „Poddaj".
  assert.ok(session.botPausePending, 'odrzucona komenda zgubiła pauzę bota (ekran „Poddaj partię")');
  assert.equal(session.botMoves.length, movesBefore, 'odrzucona komenda wyczyściła bufor modala ruchu bota');

  // I gra da się wznowić normalnie.
  const resumed = session.continueBotPlay();
  assert.ok(resumed.ok, 'wznowienie po odrzuconej komendzie musi działać');
});
