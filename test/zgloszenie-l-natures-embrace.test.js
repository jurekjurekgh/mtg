import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana, grantManaOnLand } from '../src/engine/resources.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';
import { manaSourcesOf, renderManaWizard, untappedLandSourcesOf } from '../src/table/mana-wizard.js';

// Zgłoszenie L (właściciel, 2026-11-07): Nature's Embrace opętuje ląd —
// „As long as enchanted permanent is a land, it has {T}: Add two mana of
// any one color.” Silnik znał grant od audytu PR #143 (grantManaOnLand +
// tap_for_mana z grantColor + autopay w planGrantManaColors), ale WIDOK i
// KREATOR traktowały ląd jak bazowy: view nie niósł faktu grantu, kreator
// pokazywał i tapował 1 manę pierwotnego koloru (deterministyczny
// tap_for_mana bez grantColor). Piny domykają warstwę UI oferty (L48:
// oferta = walidacja) bez zmian modelu puli silnika.
//
// Model świadomie NIE jest ujednolicony ze zdolnościami add_mana (Skarb:
// jednostki wielokolorowe puli, wybór przy WYDAWANIU): grant lądu to
// „any ONE color” — kolor jest zobowiązany PRZY tapnięciu, więc wybór
// musi nastąpić w kreatorze, a komenda niesie grantColor (ADR 0030).

const registry = createCardRegistry();

function put(state, id, cardId, zone = 'battlefield', playerId = 'p1') {
  const card = registry.get(cardId);
  assert.ok(card, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, zone, ownerId: playerId, controllerId: playerId,
    ...gameObjectDataOf(card), types: card.types ?? [], subtypes: card.subtypes ?? [], keywords: card.keywords ?? [],
  });
  return state.objects.get(id);
}

function game() {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  return state;
}

/** Pełny przepływ zgłoszenia: cast aury na ląd + round() (pass p1 i p2). */
function gameWithEmbracedLand({ landId = 'forest', landCardId = 'basic-forest' } = {}) {
  const state = game();
  put(state, landId, landCardId);
  put(state, 'embrace', 'natures-embrace', 'hand');
  addMana(state, 'p1', 3, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'embrace');
  assert.ok(cast, 'oferta cast_permanent dla aury');
  assert.ok(execute(state, cast).ok, 'cast aury');
  for (const pid of ['p1', 'p2']) {
    const pass = playerView(state, pid).legalCommands.find((c) => c.type === 'pass_priority');
    if (pass) execute(state, pass);
  }
  return state;
}

const battlefieldCardIds = (state) =>
  [...state.objects.values()].filter((o) => o.zone === 'battlefield').map((o) => o.cardId).sort();

// --- L/1: widok pola bitwy niesie grant -----------------------------------

test('L/1: view pola bitwy niesie manaGrant opętanego lasu (fakt publiczny)', () => {
  const state = gameWithEmbracedLand();
  assert.deepEqual(battlefieldCardIds(state), ['basic-forest', 'natures-embrace'],
    'aura po resolvie leży na polu bitwy');
  const view = playerView(state, 'p1');
  const forest = view.zones.battlefield.find((o) => o.cardId === 'basic-forest');
  // Własna zdolność lasu pozostaje opisana (grant jest NAD nią, nie zamiast).
  assert.deepEqual(forest.manaSource.colors, ['G']);
  assert.equal(forest.manaSource.amount, 1);
  // NOWE (L): grant z aury — bez tego kreator nie miał skąd wziąć prawdy.
  assert.equal(forest.manaGrant, 2, 'view musi nieść manaGrant=2 z aury');
  // Anty-over-fix: zwykły ląd bez aury nie dostaje pola na zapas (ADR 0017).
  const plain = game();
  put(plain, 'forest', 'basic-forest');
  const plainView = playerView(plain, 'p1').zones.battlefield.find((o) => o.id === 'forest');
  assert.equal('manaGrant' in plainView, false, 'zwykły las bez pola manaGrant');
});

// --- L/2: kreator pokazuje JEDEN wiersz grantu -----------------------------

test('L/2: kreator many — ląd z grantem ma JEDEN wiersz grantu (2 many dowolnego JEDNEGO koloru)', () => {
  const state = gameWithEmbracedLand();
  const view = playerView(state, 'p1');
  const rows = untappedLandSourcesOf(view, 'p1');
  assert.equal(rows.length, 1, 'jeden wiersz źródła (bez duplikatu własnej zdolności)');
  assert.deepEqual(rows[0], {
    id: 'forest', cardId: 'basic-forest',
    colors: ['W', 'U', 'B', 'R', 'G'], amount: 2, grant: true,
  }, 'wiersz grantu zastępuje wiersz własnej zdolności {T}: Add {G}');
  // Wiersz NIESIE komendę tap_for_mana bez grantColor — kolor dobiera
  // drugi stopień kreatora (patrz L/3), nie deterministyczny auto-tap.
  const wizardRows = manaSourcesOf(view, 'p1', (objectId) => {
    // Mostek abilityInfo opisuje WŁASNĄ produkcję lasu — wiersz grantu
    // musi jej nie przejąć (nadpisanie amount 2→1 to pierwotny objaw).
    assert.equal(objectId, 'forest');
    return { colors: ['G'], amount: 1, manaCost: 0, isLand: true };
  });
  assert.equal(wizardRows.length, 1);
  assert.equal(wizardRows[0].grant, true);
  assert.equal(wizardRows[0].amount, 2, 'mostek abilityInfo NIE nadpisuje amount grantu');
  assert.deepEqual(wizardRows[0].colors, ['W', 'U', 'B', 'R', 'G'], 'kolory grantu pozostają pięciokolorowe');
  assert.deepEqual(wizardRows[0].command, { type: 'tap_for_mana', playerId: 'p1', objectId: 'forest' });
});

// --- L/3: main.js — przechwycenie wiersza grantu przed planem tapu ---------

test('L/3: tap wiersza grantu otwiera wybór koloru, nie deterministyczny tap_for_mana (main.js)', () => {
  const source = readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');
  // Przechwycenie MUSI poprzedzać manaSourceTapPlan — inaczej wiersz grantu
  // odpala własną (dominowaną) zdolność lądu: 1 manę pierwotnego koloru.
  const tapBlock = source.slice(source.indexOf('onTapSource: (objectId'), source.indexOf('onSelectTapCost'));
  const interceptAt = tapBlock.indexOf('src.grant && !selectedCommand?.grantColor');
  const planAt = tapBlock.indexOf('manaSourceTapPlan(src)');
  assert.ok(interceptAt > 0, 'onTapSource przechwytuje wiersz grantu');
  assert.ok(planAt > interceptAt, 'przechwycenie grantu jest PRZED planem tapu');
  // Wybór koloru kończy się komendą z grantColor (silnik: 2 many koloru).
  assert.match(source, /type: 'tap_for_mana', playerId: HUMAN_ID, objectId: latestSource\.id, grantColor: color/);
  // Fail-closed jak onSelectTapCost: wybór ponawiany na aktualnym stanie
  // (ląd mógł zostać tapnięty w międzyczasie), kolor walidowany z listy.
  assert.match(source, /\['W', 'U', 'B', 'R', 'G'\]\.includes\(color\)/);
  // Model selekcji znika razem z deskryptorem przy zamknięciu kreatora
  // (manaWizardDescriptor = null) i wygasa, gdy źródło zniknęło z oferty.
  assert.match(source, /_grantColorSelection = \{ objectId: src\.id \}/);
  assert.match(source, /if \(selectedGrant && !selectedGrantSource\) delete manaWizardDescriptor\._grantColorSelection/);
});

// --- L/4: render drugiego stopnia — wybór koloru grantu --------------------

test('L/4: render — wybór koloru many grantu (5 przycisków z pipami, wróć do źródeł)', () => {
  class MiniEl {
    constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.className = ''; this.textContentValue = ''; }
    set textContent(v) { this.textContentValue = String(v); this.children = []; }
    get textContent() { return this.textContentValue + this.children.map((c) => c.textContent).join(''); }
    set innerHTML(v) { this.textContentValue = String(v); this.children = []; }
    get innerHTML() { return this.textContentValue; }
    appendChild(child) { this.children.push(child); return child; }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
    click() { for (const fn of this.listeners.click ?? []) fn({}); }
  }
  const chosen = [];
  let cancelled = 0;
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  try {
    const host = new MiniEl('div');
    renderManaWizard(host, {
      costStr: '{1}{U}',
      grantColorSelection: { source: { id: 'forest', cardId: 'basic-forest', name: 'Las #1', colors: ['W', 'U', 'B', 'R', 'G'], amount: 2, grant: true } },
      remainingTotal: 3,
      requirements: [{ colors: ['U'], covered: false }],
      untappedSources: [],
    }, {
      onSelectGrantColor: (color) => chosen.push(color),
      onCancelGrantColor: () => { cancelled += 1; },
    });
    assert.match(host.textContent, /Wybierz kolor many — Las #1 \(2 many tego koloru\)/);
    const clickables = (function walk(el, acc = []) {
      for (const c of el.children ?? []) { acc.push(c); walk(c, acc); }
      return acc;
    })(host).filter((el) => (el.listeners.click ?? []).length > 0);
    assert.equal(clickables.length, 6, 'pięć kolorów + Wróć do źródeł');
    for (const color of ['W', 'U', 'B', 'R', 'G']) {
      const row = clickables.find((el) => el.textContent.includes(`ms-${color.toLowerCase()}`) && /dodaj 2 many/.test(el.textContent));
      assert.ok(row, `przycisk koloru ${color} z dwoma pipami i opisem skutku`);
    }
    clickables[1].click();
    assert.deepEqual(chosen, ['U']);
    clickables[5].click();
    assert.equal(cancelled, 1);
  } finally {
    globalThis.document = previousDocument;
  }
});

// --- L/5: autopay silnika płaci {U}{U} grantem ------------------------------

test('L/5: autopay — {U}{U} opłacone tapnięciem opętanego lasu (grantColor z planu)', () => {
  const state = gameWithEmbracedLand();
  put(state, 'newt', 'wormfang-newt', 'hand');
  // Pula pusta, jedyne źródło = opętany las. Pipy {U}{U} wymuszają grant
  // z kolorem U (własna zdolność daje {G} — nie pokrywa pipa).
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'newt');
  assert.ok(cast, 'oferta cast {U}{U} widzi grant w źródłach');
  const result = execute(state, cast);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(state.objects.get('forest').tapped, true, 'autopay tapuje opętany las');
  assert.deepEqual(state.players[0].manaPool, {}, 'pula wyczerpana płatnością');
  // Czar jest na stosie — resolve przez pass p1 i p2 (stos niepusty).
  for (const pid of ['p1', 'p2']) {
    const pass = playerView(state, pid).legalCommands.find((c) => c.type === 'pass_priority');
    if (pass) execute(state, pass);
  }
  assert.ok(battlefieldCardIds(state).includes('wormfang-newt'), 'newt na polu bitwy');
});

// --- L/6: ląd BEZ własnej many z grantem wraca do oferty (domknięcie F5b) --

test('L/6: kreator — ląd bez własnej zdolności many z grantem aury dostaje wiersz (F5b)', () => {
  const state = game();
  put(state, 'forest', 'basic-forest', 'battlefield', 'p1');
  // Syntetycznie (jak pin F5b z #143): katalog nie ma taliowalnego landu
  // bez produkcji. abilitiesStripped zabiera WŁASNĄ zdolność {T}: Add {G}.
  state.objects.set('forest', Object.freeze({ ...state.objects.get('forest'), abilitiesStripped: true, abilitiesStrippedAt: 1 }));
  put(state, 'embrace', 'natures-embrace');
  attachAuraToCreature(state, 'embrace', 'forest');
  assert.equal(grantManaOnLand(state, 'forest'), 2);
  const view = playerView(state, 'p1');
  const forest = view.zones.battlefield.find((o) => o.id === 'forest');
  assert.equal(forest.manaGrant, 2, 'widok niesie grant także po stripie');
  const rows = untappedLandSourcesOf(view, 'p1');
  assert.equal(rows.length, 1, 'isUntappedLandSource akceptuje grant bez własnej produkcji');
  assert.equal(rows[0].grant, true);
  assert.equal(rows[0].amount, 2);
  // Silnik: tap wiersza z grantColor produkuje 2 many (komenda z L/3).
  const result = execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: 'forest', grantColor: 'R' });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(state.players[0].manaPool, { R: 2 });
});
