import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep, initialTurn } from '../src/engine/turn.js';
import { describeGameEvent, createSession, HUMAN_ID, BOT_ID, FACE_DOWN_LABEL } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';

// =============================================================================
// M100 / E1.5 — BUG A (zgłoszenie właściciela 2026-08-15 z testów na telefonie):
// modal „Rozgrywka" pokazał „Nieprzyjaciel zagrywa Segmented Krotiq twarzą
// w dół (2/2)", a później „atakuje mnie zakryta kreatura Segmented Krotiq".
//
// Obiekt LEŻĄCY na stole twarzą w dół jest dla przeciwnika bezimiennym stworem
// 2/2 (CR 708.2). Żadna powierzchnia (modal, log, atak/blok, podział obrażeń,
// celowanie) nie może ujawnić nazwy zakrytej karty PRZECIWNIKA. Fixy M66/M74
// („LKI cardId zamiast ?") zrobiły to zbyt gorliwie: nazywają po cardId także
// wtedy, gdy obiekt wciąż leży zakryty na stole.
//
// Zasada (root fix): nazwa z żywego obiektu ma pierwszeństwo — face-down
// ⇒ „morph"; LKI (cardId) wolno użyć dopiero, gdy obiektu już NIE MA w stanie
// (odsłonięcie przy zmianie strefy jest legalne: CR 708.8/708.9 — dlatego
// „Segmented Krotiq ginie" jest poprawne, a „atakuje Segmented Krotiq" nie).
// =============================================================================

const REGISTRY = createCardRegistry();
const nameOf = (cardId) => REGISTRY.get(cardId)?.name ?? String(cardId ?? '?');
const PLAYER_NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };

/** helpers jak z sesji: nameOfObject honorujące faceDown (→ „morph"). */
function helpersWith(objects) {
  return {
    nameOf,
    nameOfObject: (id) => {
      if (id === 'p1' || id === 'p2') return PLAYER_NAMES[id];
      const object = objects.get(id);
      if (!object) return '?';
      if (object.faceDown) return FACE_DOWN_LABEL;
      return nameOf(object.cardId);
    },
    isPlayer: (id) => id === 'p1' || id === 'p2',
  };
}

const KROTIQ = 'segmented-krotiq';

// ---------------------------------------------------------------------------
// Część 1: warstwa opisu zdarzeń (log + linie modala „Rozgrywka")
// ---------------------------------------------------------------------------

test('BUG A: bot zagrywa kartę twarzą w dół — bez nazwy (FoW, CR 708.2)', () => {
  const e = { type: 'permanent_cast', playerId: 'p2', faceDown: true, object: { cardId: KROTIQ } };
  const text = describeGameEvent(e, helpersWith(new Map()), PLAYER_NAMES);
  assert.equal(text, `Nieprzyjaciel zagrywa ${FACE_DOWN_LABEL} twarzą w dół (2/2)`);
});

test('BUG A: moja karta zagrana twarzą w dół — nazwa widoczna (moja wiedza)', () => {
  const e = { type: 'permanent_cast', playerId: 'p1', faceDown: true, object: { cardId: KROTIQ } };
  const text = describeGameEvent(e, helpersWith(new Map()), PLAYER_NAMES);
  assert.match(text, /Segmented Krotiq/, 'własny morph może być nazwany');
  assert.match(text, /twarzą w dół/);
});

test('BUG A: zakryty stwór bota atakuje — „morph", nie nazwa karty', () => {
  const objects = new Map([['m1', { cardId: KROTIQ, faceDown: true }]]);
  const e = { type: 'attackers_declared', playerId: 'p2', attackerIds: ['m1'], attackerCardIds: [KROTIQ] };
  const text = describeGameEvent(e, helpersWith(objects), PLAYER_NAMES);
  assert.ok(text.includes(FACE_DOWN_LABEL), `atakujący face-down ma być „${FACE_DOWN_LABEL}", jest: ${text}`);
  assert.ok(!text.includes('Segmented Krotiq'), `wyciek nazwy: ${text}`);
});

test('BUG A: zakryty stwór bota blokuje i w podziale obrażeń — „morph"', () => {
  const objects = new Map([
    ['m1', { cardId: KROTIQ, faceDown: true }],
    ['h1', { cardId: 'highland-game', faceDown: false }],
  ]);
  const e = {
    type: 'blockers_declared', playerId: 'p2',
    assignments: { h1: ['m1'] }, cards: { h1: 'highland-game', m1: KROTIQ },
  };
  const text = describeGameEvent(e, helpersWith(objects), PLAYER_NAMES);
  assert.ok(!text.includes('Segmented Krotiq'), `wyciek nazwy: ${text}`);
  assert.ok(text.includes(FACE_DOWN_LABEL), `bloker face-down ma być „${FACE_DOWN_LABEL}", jest: ${text}`);
});

test('BUG A: obrażenia od/do zakrytego stwora — bez nazwy', () => {
  const objects = new Map([
    ['m1', { cardId: KROTIQ, faceDown: true }],
    ['h1', { cardId: 'highland-game', faceDown: false }],
  ]);
  const fromMorph = describeGameEvent(
    { type: 'damage_dealt', source: 'm1', sourceCardId: KROTIQ, target: 'p1', amount: 2, combat: true },
    helpersWith(objects), PLAYER_NAMES);
  assert.ok(fromMorph.includes(FACE_DOWN_LABEL), `źródło face-down: ${fromMorph}`);
  assert.ok(!fromMorph.includes('Segmented Krotiq'), `wyciek: ${fromMorph}`);
  const toMorph = describeGameEvent(
    { type: 'damage_dealt', source: 'h1', sourceCardId: 'highland-game', target: 'm1', targetCardId: KROTIQ, amount: 2, combat: true },
    helpersWith(objects), PLAYER_NAMES);
  assert.ok(toMorph.includes(FACE_DOWN_LABEL), `cel face-down: ${toMorph}`);
  assert.ok(!toMorph.includes('Segmented Krotiq'), `wyciek: ${toMorph}`);
});

test('BUG A: czar celujący w zakrytą kartę bota — „cel: morph"', () => {
  const objects = new Map([['m1', { cardId: KROTIQ, faceDown: true }]]);
  const e = { type: 'spell_cast', playerId: 'p1', cardId: 'expunge', targets: ['m1'], targetCardIds: [KROTIQ] };
  const text = describeGameEvent(e, helpersWith(objects), PLAYER_NAMES);
  assert.ok(!text.includes('Segmented Krotiq'), `wyciek nazwy celu: ${text}`);
  assert.ok(text.includes(`cel: ${FACE_DOWN_LABEL}`), `cel face-down ma być „${FACE_DOWN_LABEL}", jest: ${text}`);
});

test('BUG A: zakryty permanent wchodzi na pole bitwy — „morph wchodzi…"', () => {
  const objects = new Map([['m1', { cardId: KROTIQ, faceDown: true }]]);
  const e = { type: 'permanent_entered_battlefield', objectId: 'm1', cardId: KROTIQ };
  const text = describeGameEvent(e, helpersWith(objects), PLAYER_NAMES);
  assert.ok(!text.includes('Segmented Krotiq'), `wyciek: ${text}`);
  assert.ok(text.includes(`${FACE_DOWN_LABEL} wchodzi na pole bitwy`), text);
});

test('BUG A (reguła graniczna): LKI po ODEJŚCIU ze stołu jest legalne — nazwa wolno pojawić się po śmierci/odsłonięciu (CR 708.8)', () => {
  // Obiektu nie ma już w stanie (zginął) — zdarzenia niosą cardId i wolno
  // nimi nazywać. To pilnuje, żeby fix nie przesadził i nie wróciło „? ginie".
  const e = { type: 'creature_destroyed', fromId: 'grave-7', cardId: KROTIQ };
  const text = describeGameEvent(e, helpersWith(new Map()), PLAYER_NAMES);
  assert.equal(text, 'Segmented Krotiq ginie');
  // …i atakujący, którego już nie ma w state.objects (np. LKI po SBA):
  const attack = describeGameEvent(
    { type: 'attackers_declared', playerId: 'p2', attackerIds: ['gone1'], attackerCardIds: [KROTIQ] },
    helpersWith(new Map()), PLAYER_NAMES);
  assert.match(attack, /Segmented Krotiq/, `po zniknięciu obiektu LKI nazywa: ${attack}`);
});

// ---------------------------------------------------------------------------
// Część 2: widok decyzji podziału obrażeń (wizard) — cardId face-down celi
// nie może wyciekać do PlayerView (ADR 0017 + CR 708.2)
// ---------------------------------------------------------------------------

function game() {
  return createGameState({ seed: 1, players: [{ id: 'att' }, { id: 'def' }] });
}

function addCreature(state, id, controller, power, toughness, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `card-${id}`, controllerId: controller,
    zone: 'battlefield', kind: 'creature', power, toughness,
    keywords: [], ...extra,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  // addObject normalizuje obiekty do stałego (mrożonego) schematu z
  // faceDown: false — flagę podmieniamy wzorzec audit-batch26-fixes.test.js.
  if (extra.faceDown) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), faceDown: true }));
  }
}

test('BUG A: widok podziału obrażeń nie zdradza cardId zakrytych blokerów', () => {
  const state = game();
  addCreature(state, 'a', 'att', 5, 4, { keywords: ['trample'] });
  addCreature(state, 'm1', 'def', 2, 2, { faceDown: true, cardId: KROTIQ });
  addCreature(state, 'm2', 'def', 2, 2, { faceDown: true, cardId: KROTIQ });
  state.turn = jumpToStep({ ...initialTurn('att') }, 'declare_attackers', 'att');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'att', attackerIds: ['a'] }).ok);
  state.turn.priorityPlayerId = 'def';
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'def', assignments: { a: ['m1', 'm2'] } }).ok);
  state.turn.priorityPlayerId = 'att';
  const r = execute(state, { type: 'resolve_combat', playerId: 'att', defendingPlayerId: 'def' });
  assert.ok(r.ok, r.events?.[0]?.reason);
  assert.ok(state.pendingDamageAssignment, 'multi-block z trample wymaga decyzji atakującego');

  const mine = playerView(state, 'att').pendingDamageAssignment;
  assert.ok(mine, 'attacker widzi decyzję podziału');
  const entry = mine.entries[0];
  assert.equal(entry.attackerCardId, 'card-a', 'własny atakujący z nazwą');
  for (const blocker of entry.blockers) {
    assert.equal(blocker.cardId, null, `cardId zakrytego blokera wycieka do widoku atakującego (${blocker.cardId})`);
  }
  // Właściciel morphów nadal widzi ich dane (jego karty — jego wiedza).
  const theirs = playerView(state, 'def').pendingDamageAssignment;
  assert.equal(theirs?.entries[0]?.blockers?.[0]?.cardId, KROTIQ, 'kontroler widzi swoją zakrytą kartę');
});

test('BUG A: wizard podziału obrażeń pokazuje „morph" (i dalej P/T), nie nazwę', async () => {
  const { renderDamageWizard } = await import('../src/table/choice-request.js');
  class MiniEl {
    constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.className = ''; this.text = ''; this.html = ''; this.type = ''; this.checked = false; this.disabled = false; }
    set textContent(value) { this.text = String(value); this.html = ''; this.children = []; }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
    set innerHTML(value) { this.html = String(value); this.text = String(value).replace(/<[^>]*>/g, ''); this.children = []; }
    get innerHTML() { return (this.html ? this.html : this.text) + this.children.map((c) => c.innerHTML).join(''); }
    appendChild(child) { this.children.push(child); return child; }
    addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
    click() { for (const l of this.listeners.click ?? []) l({}); }
  }
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  const view = {
    playerId: 'p1',
    zones: {
      battlefield: [
        { id: 'atk', cardId: 'card-atk', controllerId: 'p1' },
        { id: 'm1', cardId: null, faceDown: true, controllerId: 'p2' },
        { id: 'm2', cardId: null, faceDown: true, controllerId: 'p2' },
      ],
      hand: [], stack: [], graveyard: [], library: [],
    },
  };
  const session = {
    nameOf: (cardId) => ({ [KROTIQ]: 'Segmented Krotiq', 'card-atk': 'Atakujący' })[cardId] ?? String(cardId),
    nameOfObject: () => '?',
  };
  const pending = {
    playerId: 'p1',
    entries: [{
      attackerId: 'atk', attackerCardId: 'card-atk', power: 5, trample: false,
      blockers: [
        { id: 'm1', cardId: null, toughness: 2, damage: 0, lethal: 2 },
        { id: 'm2', cardId: null, toughness: 2, damage: 0, lethal: 2 },
      ],
    }],
  };
  const host = new MiniEl('div');
  renderDamageWizard(host, { view, session, pending, defaultCommand: { type: 'resolve_damage_assignment', playerId: 'p1', assignments: {} }, onComplete: () => {} });
  assert.ok(host.textContent.includes(FACE_DOWN_LABEL), `zakryty bloker ma być „${FACE_DOWN_LABEL}", jest: ${host.textContent}`);
  assert.ok(!host.textContent.includes('Segmented Krotiq'), 'wyciek nazwy w wizardzie');
  assert.ok(!host.textContent.includes('null'), 'żadne „null" w etykiecie (brak cardId → Morph)');
  assert.match(host.textContent, /wytrz\. 2/, 'P/T zakrytego blokera zostają (informacja publiczna)');
});

// ---------------------------------------------------------------------------
// Część 3: pełna sesja — modal „Rozgrywka" nie nazywa face-down zagrań bota
// (ani tekstem, ani skanem karty)
// ---------------------------------------------------------------------------

function makeMorphSession(seed) {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/innistrad.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText('# Talia morphu (test BUG A)\n15x Segmented Krotiq\n25x Forest', registry).cardIds],
  ]);
  return createSession({ registry, decks, seed, pauseOnBotMoves: true });
}

/** Zbiera bloki modala (jak klikałby gracz) do spełnienia warunku stopu. */
function collectModalBlocks(session, { stop, maxMoves = 400 } = {}) {
  const blocks = [];
  for (let i = 0; i < maxMoves && session.state.status === 'active'; i += 1) {
    if (session.botPausePending) {
      blocks.push(session.botMoves.map((m) => ({ text: m.text, cardId: m.cardId })));
      const done = stop(blocks[blocks.length - 1], blocks);
      session.clearBotMoves();
      session.continueBotPlay();
      if (done) return blocks;
      continue;
    }
    const view = session.view();
    const cmd = view.legalCommands.find((c) => !['pass_priority', 'concede'].includes(c.type))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!cmd) break;
    const played = session.apply(cmd);
    if (!played.ok) break;
    if (played.botPause && session.botMoves.length > 0) {
      blocks.push(session.botMoves.map((m) => ({ text: m.text, cardId: m.cardId })));
      const done = stop(blocks[blocks.length - 1], blocks);
      session.clearBotMoves();
      session.continueBotPlay();
      if (done) return blocks;
    }
  }
  return blocks;
}

test('BUG A: sesja end-to-end — bot zagrywa morph: modal mówi „morph", bez nazwy i bez skanu karty', () => {
  let session = null;
  let blocks = [];
  // Szukamy seeda z zakrytym rzutem bota (deterministycznie powtarzalne).
  for (const seed of [1, 2, 3, 4, 5]) {
    session = makeMorphSession(seed);
    blocks = collectModalBlocks(session, {
      stop: (block) => block.some((m) => /twarzą w dół/.test(m.text ?? '')),
    });
    if (blocks.some((b) => b.some((m) => /twarzą w dół/.test(m.text ?? '')))) break;
  }
  const flat = blocks.flat();
  const castLine = flat.find((m) => /twarzą w dół/.test(m.text ?? ''));
  assert.ok(castLine, 'bot w ogóle zagrał coś twarzą w dół w zebranych blokach');
  assert.ok(castLine.text.includes(`zagrywa ${FACE_DOWN_LABEL} twarzą w dół`), `linia: ${castLine.text}`);
  // Nazwa „Segmented Krotiq" wolno pojawić się TYLKO w kontekstach legalnie
  // jawnych: karty idące do grobu (grób = strefa publiczna, mill), śmierć/
  // zniszczenie/wygnanie/kontra (odsłonięcie przy zmianie strefy — CR 708.8/
  // 708.9). Nigdy jako tożsamość zakrytego obiektu na stosie/stole.
  const LEGAL_REVEAL = /do grobu|\bginie\b|zostaje zniszczony|zostaje skontrowany|zostaje wygnany|odsłania/;
  const named = flat.map((m) => m.text ?? '').filter((l) => l.includes('Segmented Krotiq'));
  for (const line of named) {
    assert.match(line, LEGAL_REVEAL, `linia nazywa zakrytą kartę (wyciek): ${line}`);
  }
  assert.equal(castLine.cardId ?? null, null, 'zakryty rzut bota nie może pokazywać skanu karty');
});
