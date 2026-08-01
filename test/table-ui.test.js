import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/**
 * Test stołu „przez kliknięcia": uruchamia src/table/main.js na minimalnym
 * DOM-u w pamięci i prowadzi gracza przez pełną partię, klikając przyciski
 * akcji. Sprawdzamy granicę UI↔protokół: UI nigdy nie mutuje stanu poza
 * komendami, każda akcja przechodzi przez sesję, a ekran kończy partię
 * banerem zwycięzcy. Test jest headless — bez przeglądarki.
 */

class MiniEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.style = {};
    this.dataset = {};
    this.className = '';
    this.text = '';
    this.value = '';
    this.disabled = false;
  }

  set textContent(v) {
    this.text = String(v);
    this.children = [];
  }

  get textContent() {
    return this.text + this.children.map((c) => c.textContent).join('');
  }

  appendChild(child) { this.children.push(child); return child; }

  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }

  click() { for (const fn of this.listeners.click ?? []) fn({}); }
}

function installMiniDom() {
  const ids = ['selftest', 'seed', 'deck-human', 'deck-bot', 'new-game', 'table-note',
    'banner', 'status', 'stack-zone', 'bf-enemy', 'bf-own', 'grave-enemy', 'grave-own',
    'exile-zone', 'hand', 'actions', 'actions-count', 'log', 'card-preview', 'card-preview-body',
    'card-preview-close', 'hover-preview', 'context-menu', 'context-menu-body', 'context-menu-close',
    'export-replay', 'import-replay', 'resume-replay', 'resume-save', 'autosave-info',
    'life-own', 'life-enemy', 'library-own', 'library-enemy',
    'library-menu-btn', 'library-menu-panel', 'library-preview', 'zone-inspector-close',
    'replay-out', 'replay-summary', 'replay-download', 'replay-file', 'image-mode',
    'actions-drawer', 'actions-drawer-close', 'actions-fab', 'actions-fab-count'];
  const registry = new Map(ids.map((id) => [id, new MiniEl(`#${id}`)]));
  registry.get('seed').value = '13';
  globalThis.document = {
    getElementById(id) {
      if (!registry.has(id)) throw new Error(`Mini-DOM: nieznane id ${id}`);
      return registry.get(id);
    },
    createElement: (tag) => new MiniEl(tag),
  };
  globalThis.window = { confirm: () => false };
  return registry;
}

function textOf(root) {
  return root.textContent;
}

/** Polityka klikania jak w teście sesji: rozwój planszy przed passem. */
function pickActionButton(actions) {
  const buttons = actions.children.filter((c) => (c.listeners.click ?? []).length > 0);
  const byPrefix = (prefix) => buttons.filter((b) => b.text.startsWith(prefix));
  const ordered = [
    byPrefix('Dobierz kartę')[0],
    byPrefix('Zagraj ląd')[0],
    byPrefix('Przygotuj manę')[0],
    byPrefix('Zagraj:')[0],
    // Czar: preferuj cel wroga (Bot w nazwie strefy nie jest dostępny, więc heurystyka po treści stała j.w.)
    byPrefix('Rzuć:')[0],
    ...byPrefix('Atak:').sort((a, b) => b.text.length - a.text.length),
    byPrefix('Blok:')[0],
    byPrefix('Bez bloków')[0],
    byPrefix('Rozstrzygnij')[0],
    byPrefix('Bez ataku')[0],
    byPrefix('Dalej (pass)')[0],
  ].filter(Boolean);
  return ordered[0] ?? null;
}

// Jeden wspólny boot na plik: main.js wykonuje bootstrap przy imporcie,
// a kolejne testy restartują partię przyciskiem „Rozpocznij partię"
// (seed wejściowy jest stały, więc każdy restart jest deterministyczny).
const dom = installMiniDom();
globalThis.REPO_DECKS = {
  aggro: fs.readFileSync('decks/synthetic-aggro.txt', 'utf8'),
  growth: fs.readFileSync('decks/synthetic-growth.txt', 'utf8'),
};
await import('../src/table/main.js');

function restart(seed = '13') {
  dom.get('seed').value = seed;
  dom.get('new-game').click();
}

test('strona stołu przechodzi self-test i startuje partię na pierwszej decyzji', () => {
  restart();
  assert.match(textOf(dom.get('selftest')), /✓ Headless engine/, 'self-test nie przeszedł');
  assert.equal(textOf(dom.get('table-note')), '', 'błąd startu partii');
  const first = pickActionButton(dom.get('actions'));
  assert.ok(first, 'brak przycisków akcji po starcie');
  assert.match(textOf(dom.get('status')), /Tura 1/);
  assert.match(textOf(dom.get('status')), /ręka 7/);
  // Ręka gracza rysuje nazwy kart z registry.
  assert.match(textOf(dom.get('hand')), /Synthetic/);
});

test('gracz klika się przez całą partię do baneru końca gry', () => {
  restart();
  const log = dom.get('log');
  for (let i = 0; i < 600; i += 1) {
    if (textOf(dom.get('banner')).includes('Koniec gry')) break;
    const button = pickActionButton(dom.get('actions'));
    assert.ok(button, `brak akcji dla gracza przy kliku ${i}: ${textOf(dom.get('actions'))}`);
    button.click();
  }
  assert.match(textOf(dom.get('banner')), /Koniec gry — wygrywa: (Ty|Bot)/, `brak baneru końca gry: ${textOf(dom.get('banner'))}`);
  assert.match(textOf(log), /Tura gracza/, 'log nie opisuje tur');
  assert.ok(!textOf(dom.get('table-note')), textOf(dom.get('table-note')));
});

test('eksport i import zapisu partii działają przez przyciski strony', () => {
  restart();
  // Kilka kliknięć, żeby zapis nie był pusty.
  for (let i = 0; i < 12; i += 1) {
    const button = pickActionButton(dom.get('actions'));
    if (!button) break;
    button.click();
  }
  dom.get('export-replay').click();
  const out = dom.get('replay-out').value;
  assert.match(out, /^\{"version":1,/);
  dom.get('import-replay').click();
  const summary = textOf(dom.get('replay-summary'));
  assert.match(summary, /Odtworzono \d+ komend/, summary);
  assert.match(summary, /odrzuconych: 0/, summary);
});
