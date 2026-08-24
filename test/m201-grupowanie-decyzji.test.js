// M201/C2 + D (zgłoszenia właściciela 2026-08-23):
//
// C2. Dreams of Steel and Oil: „Opcje tej karty są niezgrupowane” — panel
//     „Twoje działania” pokazywał cztery luźne przyciski „wygnaj z ręki: X”
//     zamiast jednego wejścia w modal wyboru. „Karty w modalu powinny być
//     klikalne (img na całą stronę), bo mogę ich nie znać.”
// D.  Mindstab → rozstrzygnięcie suspend: to samo („Rzuć zawieszone …
//     → cel: Nieprzyjaciel / → cel: Ty / Zostaw w wygnaniu”).
//     „Sprawdź inne podobne karty czy nie mają tego samego problemu
//      i zrób guard.”
//
// Klasa jest znana (M163/A): decyzja wielowariantowa BEZ klucza grupowania
// rozsypuje się na przyciski o niemal identycznych etykietach. Lista kluczy
// była przepisywana ręcznie, więc każdy nowy `resolve_*` zaczynał od buga —
// stąd strażnik na końcu pliku (wzorzec L26/L51: whitelist z uzasadnieniem).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { COMMAND_TYPES } from '../src/protocol/types.js';
import { choiceRequestGroupKey } from '../src/table/render.js';
import { renderChoiceRequest } from '../src/table/choice-request.js';

/** Grupy tak, jak liczy je panel akcji: po kluczu `choiceRequestGroupKey`. */
function groupsOf(commands) {
  const byKey = new Map();
  for (const cmd of commands) {
    const key = choiceRequestGroupKey(cmd) ?? `__solo-${byKey.size}`;
    if (!byKey.has(key)) byKey.set(key, { key, commands: [] });
    byKey.get(key).commands.push(cmd);
  }
  return [...byKey.values()];
}

test('M201/C2: warianty „wygnaj z ręki” schodzą do JEDNEJ grupy', () => {
  const cmds = [
    { type: 'resolve_reveal_exile_hand', playerId: 'p1', cardId: 'h1' },
    { type: 'resolve_reveal_exile_hand', playerId: 'p1', cardId: 'h2' },
    { type: 'resolve_reveal_exile_hand', playerId: 'p1', cardId: 'h3' },
    { type: 'resolve_reveal_exile_hand', playerId: 'p1', cardId: 'h4' },
  ];
  const groups = groupsOf(cmds);
  assert.equal(groups.length, 1, `oczekiwana jedna grupa, jest ${groups.length}`);
  assert.equal(groups[0].commands.length, 4, 'wszystkie warianty w środku grupy');
});

test('M201/C2: to samo dla wariantu grobowego', () => {
  const groups = groupsOf([
    { type: 'resolve_reveal_exile_grave', playerId: 'p1', cardId: 'g1' },
    { type: 'resolve_reveal_exile_grave', playerId: 'p1', cardId: 'g2' },
  ]);
  assert.equal(groups.length, 1);
});

test('M201/D: warianty rzutu zawieszonego czaru schodzą do jednej grupy', () => {
  const groups = groupsOf([
    { type: 'resolve_suspend_cast', playerId: 'p1', cast: true, targets: ['p2'] },
    { type: 'resolve_suspend_cast', playerId: 'p1', cast: true, targets: ['p1'] },
    { type: 'resolve_suspend_cast', playerId: 'p1', cast: false },
  ]);
  assert.equal(groups.length, 1, 'rzut + rezygnacja to JEDNA decyzja gracza');
  assert.equal(groups[0].commands.length, 3);
});

test('M201/D: rodzina „darmowy rzut z wygnania” — rebound i madness tak samo', () => {
  for (const type of ['resolve_rebound_cast', 'resolve_madness_cast']) {
    const groups = groupsOf([
      { type, playerId: 'p1', cast: true, targets: ['p2'] },
      { type, playerId: 'p1', cast: true, targets: ['p1'] },
      { type, playerId: 'p1', cast: false },
    ]);
    assert.equal(groups.length, 1, `${type} musi się grupować jak suspend`);
  }
});

/**
 * STRAŻNIK KLASY (zlecenie właściciela: „sprawdź inne podobne karty i zrób
 * guard”). Każdy typ komendy `resolve_*` z protokołu musi mieć klucz
 * grupowania albo świadomy wpis w whiteliście z powodem. Nowy `resolve_*`
 * bez decyzji = czerwony test PRZED scaleniem, a nie luźne przyciski
 * u właściciela po scaleniu.
 */
test('M201/D (strażnik): każdy resolve_* ma grupowanie albo przejrzany wyjątek', () => {
  const source = fs.readFileSync('src/table/render.js', 'utf8');
  const body = source.slice(source.indexOf('function choiceRequestGroupKey'), source.indexOf('function choiceRequestType'));
  const REVIEWED = new Map([
    ['resolve_combat', 'walka ma własny model deklaracji (wizard combat), nie listę wariantów'],
  ]);
  const missing = COMMAND_TYPES
    .filter((type) => type.startsWith('resolve_'))
    .filter((type) => !body.includes(`'${type}'`))
    .filter((type) => !REVIEWED.has(type));
  assert.deepEqual(missing, [],
    'typy decyzji bez klucza grupowania (panel pokaże luźne przyciski):\n' + missing.join('\n'));
});

// --- C2: podgląd karty w modalu ------------------------------------------

class MiniEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.text = ''; this.listeners = {}; this.dataset = {}; this.style = {}; }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(' '); }
  set innerHTML(v) { this.text = String(v); }
  get innerHTML() { return this.text; }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  click() { for (const fn of this.listeners.click ?? []) fn({ stopPropagation() {} }); }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
}
globalThis.document = globalThis.document ?? { createElement: (t) => new MiniEl(t), createTextNode: () => new MiniEl('#text') };

test('M201/C2: opcja wskazująca kartę ma przycisk podglądu (pełny ekran)', () => {
  const host = new MiniEl('div');
  const request = {
    id: 'r1', type: 'target',
    options: [
      { type: 'resolve_reveal_exile_hand', playerId: 'p1', cardId: 'hand-1' },
      { type: 'resolve_reveal_exile_hand', playerId: 'p1', cardId: 'hand-2' },
    ],
  };
  const opened = [];
  renderChoiceRequest(host, request, {
    labelForOption: (o) => `wygnaj: ${o.cardId}`,
    onResponse: () => {},
    onOpenCard: (cardId) => opened.push(cardId),
    cardIdOfOption: (o) => ({ 'hand-1': 'scion-summoner', 'hand-2': 'kor-sanctifiers' }[o.cardId] ?? null),
  });
  const peeks = host.descendants().filter((n) => /choice-request-peek/.test(n.className));
  assert.equal(peeks.length, 2, 'lupa przy każdej karcie, której gracz może nie znać');
  peeks[0].click();
  assert.deepEqual(opened, ['scion-summoner'], 'klik w lupę otwiera pełny ekran TEJ karty');
});

test('M201/C2: klik w samą opcję nadal ZATWIERDZA wybór (lupa go nie przechwytuje)', () => {
  const host = new MiniEl('div');
  const option = { type: 'resolve_reveal_exile_hand', playerId: 'p1', cardId: 'hand-1' };
  const request = { id: 'r2', type: 'target', options: [option] };
  const responses = [];
  renderChoiceRequest(host, request, {
    labelForOption: () => 'wygnaj',
    onResponse: (r) => responses.push(r),
    onOpenCard: () => {},
    cardIdOfOption: () => 'scion-summoner',
  });
  // Uwaga: kontener ma klasę „choice-request-options” — dopasowujemy TOKEN,
  // nie podciąg (inaczej test liczy też div-a i myli się o jeden).
  const buttons = host.descendants().filter((n) => (n.className ?? '').split(/\s+/).includes('choice-request-option'));
  assert.equal(buttons.length, 1);
  buttons[0].click();
  assert.equal(responses.length, 1, 'wybór oddany do silnika');
});

test('M201/C2: opcja bez karty nie dostaje lupy (anty-over-fix)', () => {
  const host = new MiniEl('div');
  const request = { id: 'r3', type: 'command', options: [{ type: 'resolve_suspend_cast', playerId: 'p1', cast: false }] };
  renderChoiceRequest(host, request, {
    labelForOption: () => 'Zostaw w wygnaniu',
    onResponse: () => {},
    onOpenCard: () => {},
    cardIdOfOption: () => null,
  });
  assert.equal(host.descendants().filter((n) => /choice-request-peek/.test(n.className)).length, 0);
});
