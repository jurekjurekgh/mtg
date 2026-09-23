// Uwaga właściciela 2026-09-23 (Q) — kolejność opcji w panelu „Twoje działania”.
//
// „Teraz to się różnie układa i przycisk »Dalej (Pass)« raz jest niżej, raz jest
// wyżej i czasem mam problem z trafieniem w niego.” Żądany układ:
//   (a) „Dalej (Pass)” ZAWSZE pierwsze na górze,
//   (b) „✕ Poddaj partię” — USUNĄĆ z panelu,
//   (c) przyciski systemowe (Wybierz atakujących / Wybierz blokujących /
//       Rozdziel obrażenia) zawsze POD passem,
//   (d) reszta opcji niżej, w dowolnej kolejności.
//
// UWAGA: to ŚWIADOMA REWIZJA reguły M257 r3, w której ten sam właściciel prosił
// o pass i poddanie NA DOLE. Piny M257B zostały zaktualizowane, nie usunięte —
// ich sens („pozycja jest strukturalna, nie z tabeli ACTION_RANK; nowa,
// nierankowana komenda nie może się wcisnąć na złe miejsce”) nadal obowiązuje,
// zmienił się tylko kierunek.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionMenuRank } from '../src/table/render.js';

/** Ten sam porządkownik, którego używa renderTableView. */
const sortMenu = (types) => types.slice().sort((a, b) => actionMenuRank(a) - actionMenuRank(b));

const SYSTEMOWE = ['declare_attackers', 'declare_blockers', 'resolve_combat', 'resolve_damage_assignment'];

test('Q(a): „Dalej (Pass)” jest ZAWSZE pierwszy — niezależnie od zestawu akcji', () => {
  // Sedno zgłoszenia: pozycja nie może zależeć od tego, co akurat jest dostępne.
  const zestawy = [
    ['cast_spell', 'pass_priority', 'play_land'],
    ['pass_priority', 'declare_attackers'],
    ['resolve_scry', 'pass_priority', 'cast_permanent', 'declare_blockers'],
    ['resolve_mulligan_choice', 'pass_priority'],
    ['pass_priority', 'unknown_future_type', 'activate_ability'],
    ['pass_priority', 'resolve_damage_assignment', 'cast_flashback', 'tap_for_mana'],
  ];
  for (const zestaw of zestawy) {
    assert.equal(sortMenu(zestaw)[0], 'pass_priority',
      `pass musi być pierwszy w zestawie: ${zestaw.join(", ")}`);
  }
});

test('Q(a): pass wyprzedza KAŻDY inny typ komendy, także nierankowany', () => {
  const inne = ['cast_spell', 'play_land', 'draw_card', 'resolve_scry', 'resolve_mulligan_choice',
    'activate_ability', 'cast_adventure', 'unknown_future_type', ...SYSTEMOWE];
  for (const type of inne) {
    assert.ok(actionMenuRank('pass_priority') < actionMenuRank(type),
      `pass musi być nad ${type}`);
  }
});

test('Q(c): przyciski systemowe stoją POD passem, ale NAD zwykłymi zagraniami', () => {
  const zwykle = ['cast_spell', 'play_land', 'activate_ability', 'cast_permanent',
    'draw_card', 'tap_for_mana', 'unknown_future_type'];
  for (const sys of SYSTEMOWE) {
    assert.ok(actionMenuRank('pass_priority') < actionMenuRank(sys),
      `${sys} musi być pod passem`);
    for (const zwykly of zwykle) {
      assert.ok(actionMenuRank(sys) < actionMenuRank(zwykly),
        `${sys} musi być nad ${zwykly}`);
    }
  }
});

test('Q(c): pełny układ panelu w oknie walki', () => {
  const sorted = sortMenu([
    'cast_spell', 'play_land', 'declare_attackers', 'pass_priority',
    'activate_ability', 'resolve_damage_assignment',
  ]);
  assert.equal(sorted[0], 'pass_priority', '(a) pass na górze');
  assert.deepEqual(sorted.slice(1, 3), ['declare_attackers', 'resolve_damage_assignment'],
    '(c) systemowe zaraz pod passem');
  assert.deepEqual(sorted.slice(3).sort(), ['activate_ability', 'cast_spell', 'play_land'],
    '(d) reszta niżej');
});

test('Q(a): mulligan i inne decyzje „resolve” nie wypychają passa z góry', () => {
  // Dawniej resolve_mulligan_choice miał rank -3, czyli stał NAD passem — to
  // była jedna z przyczyn „raz wyżej, raz niżej”.
  for (const type of ['resolve_mulligan_choice', 'resolve_mulligan_bottom_choice',
    'resolve_backup', 'resolve_scry', 'resolve_surveil']) {
    assert.ok(actionMenuRank('pass_priority') < actionMenuRank(type),
      `pass musi być nad ${type}`);
  }
});

// ---------------------------------------------------------------------------
// (b) „Poddaj partię” znika z PANELU — ale komenda zostaje legalna w silniku
// ---------------------------------------------------------------------------

test('Q(b): renderTableView nie rysuje przycisku „Poddaj partię”', async () => {
  const { renderTableView } = await import('../src/table/render.js');
  const { createCardRegistry } = await import('../src/cards/card-data.js');
  const registry = createCardRegistry();

  class MiniEl {
    constructor() { this.children = []; this.text = ''; this.className = ''; this.dataset = {}; this.listeners = {}; }
    set textContent(v) { this.text = String(v); this.children = []; }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(' '); }
    set innerHTML(v) { this.text = String(v).replace(/<[^>]*>/g, ''); }
    get innerHTML() { return this.text; }
    appendChild(c) { this.children.push(c); return c; }
    addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); }
    remove() {}
    querySelector() { return null; }
    querySelectorAll() { return []; }
  }
  const prevDoc = globalThis.document;
  globalThis.document = {
    createElement: () => new MiniEl(),
    createTextNode: (t) => ({ isText: true, text: String(t), get textContent() { return this.text; } }),
    addEventListener() {},
  };
  try {
    const view = {
      playerId: 'p1', status: 'active',
      players: [{ id: 'p1', name: 'Ty', life: 20, mana: 0 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20, mana: 0 }],
      zones: { stack: [], hand: [], battlefield: [], graveyard: [], exile: [], library: [] },
      turn: { number: 1, activePlayerId: 'p1', phase: 'precombat_main', step: 'precombat_main' },
      legalCommands: [
        { type: 'pass_priority', playerId: 'p1' },
        { type: 'concede', playerId: 'p1' },
      ],
    };
    const session = {
      view: () => view, log: [], reasoning: [], state: { seed: 13 },
      nameOf: (id) => registry.get(id)?.name ?? id,
      nameOfObject: (id) => id,
      cardDetails: (id) => registry.get(id) ?? null,
      colorsOf: () => [], abilitiesOf: () => [],
    };
    const els = {};
    for (const k of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn', 'exileZone', 'hand', 'actions', 'log']) {
      els[k] = new MiniEl();
    }
    renderTableView({ els, session, play: () => {}, onCardClick: () => {}, onChoiceRequest: () => {} });
    const tekst = els.actions.textContent;
    assert.ok(!/Poddaj/.test(tekst), `panel nie może oferować poddania: ${tekst}`);
    assert.ok(/Dalej|Pass/.test(tekst), `pass musi zostać w panelu: ${tekst}`);
  } finally {
    globalThis.document = prevDoc;
  }
});

test('Q(b): komenda `concede` pozostaje legalna w silniku (usuwamy tylko przycisk)', async () => {
  const { COMMAND_TYPES } = await import('../src/protocol/types.js');
  assert.ok(COMMAND_TYPES.includes('concede'),
    'silnik/bot/benchmark nadal używają concede — znika wyłącznie z panelu gracza');
});
