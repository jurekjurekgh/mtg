// M304 — klin w mulliganie londyńskim (znaleziony sesją Żywego Testera,
// 169 partii, 2026-09-03; transkrypt: sweep3/t-theros-random-3.txt):
// gracz zaznacza DOKŁADNIE żądaną liczbę kart, a „Zatwierdź" milczy.
//
// Mechanizm (dwuwarstwowy):
//  1. Silnik deduplikuje kombinacje „odłóż N na spód" po multizbiorze DEFINICJI
//     kart (M119/Z3) i zostawia JEDNEGO reprezentanta z konkretnymi
//     identyfikatorami INSTANCJI. Kreator pokazuje wiersze dla WSZYSTKICH
//     instancji (7 kart = 7 wierszy), a commandForMulliganSelection szuka
//     komendy po DOKŁADNYCH identyfikatorach instancji. Wybór „tego drugiego
//     Swampa" (ta sama definicja, inna instancja niż reprezentant) nie ma
//     komendy → Zatwierdź wyłączone → blokada legalnej decyzji.
//  2. CAP=32 < C(7,4)=35: dla ręki z samych różnych kart oferta jest
//     dziurawa (3 klasy decyzji nie mają ŻADNEJ komendy) — ten sam objaw.
//
// Naprawa: (a) commandForMulliganSelection porównuje multi-zbiory DEFINICJI
// przez opcjonalny tłumacz instancja→definicja (reprezentant jest semantycznie
// tą samą decyzją — tak definiuje ją sam dedup silnika); (b) CAP = 35, bo to
// pełna przestrzeń decyzji dla ręki ≤7 kart (C(7,3)=C(7,4)=35).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { commandForMulliganSelection, mulliganBottomPlanOf } from '../src/table/multi-target.js';

test('M304/1: wybór drugiej kopii tej samej karty mapuje się na reprezentanta (tłumacz definicji)', () => {
  // Ręka [b1, b2, c, d, e] — b1 i b2 to ta sama definicja 'bagno'.
  // Silnik zdeduplikował klasy po definicjach; reprezentanci używają b1.
  const commands = [
    { type: 'resolve_mulligan_bottom_choice', playerId: 'p1', cardIds: ['b1', 'c'] },
    { type: 'resolve_mulligan_bottom_choice', playerId: 'p1', cardIds: ['b1', 'd'] },
    { type: 'resolve_mulligan_bottom_choice', playerId: 'p1', cardIds: ['b1', 'b2'] },
    { type: 'resolve_mulligan_bottom_choice', playerId: 'p1', cardIds: ['c', 'd'] },
  ];
  const defOf = (id) => ({ b1: 'bagno', b2: 'bagno', c: 'las', d: 'góra', e: 'równina' }[id] ?? id);
  // Reprezentant — działa i bez tłumacza (dotychczasowe zachowanie).
  assert.equal(commandForMulliganSelection(commands, ['b1', 'c'])?.cardIds?.[0], 'b1');
  // Druga kopia bagien — bez tłumacza komendy brak (stary kontrakt opcji).
  assert.equal(commandForMulliganSelection(commands, ['b2', 'c']), null);
  // Z tłumaczem: wybór {b2,c} to ta sama DECYZJA co reprezentant {b1,c}.
  const found = commandForMulliganSelection(commands, ['b2', 'c'], defOf);
  assert.ok(found, 'wybór drugiej kopii nie może zostać bez komendy');
  assert.deepEqual([...found.cardIds].sort(), ['b1', 'c'], 'zwrócony reprezentant klasy');
  // Dwie kopie razem — klasa {bagno,bagno} ma jedynego reprezentanta {b1,b2}.
  assert.deepEqual(commandForMulliganSelection(commands, ['b2', 'b1'], defOf)?.cardIds, ['b1', 'b2']);
  // Wybór spoza klas — nadal null (tłumacz nie wymyśla komend).
  assert.equal(commandForMulliganSelection(commands, ['b2', 'e'], defOf), null);
});

test('M304/2: oferta mulligan-bottom pokrywa PEŁNĄ przestrzeń decyzji (CAP ≥ 35)', async () => {
  const { setupCardMatch } = await import('../src/cards/materialize.js');
  const { createCardRegistry } = await import('../src/cards/card-data.js');
  const { parseDeckText } = await import('../src/cards/deck-text.js');
  const { playerView } = await import('../src/engine/game-state.js');
  const registry = createCardRegistry();
  const green = parseDeckText(fs.readFileSync('decks/tarkir-bg.txt', 'utf8'), registry).cardIds;
  const black = parseDeckText(fs.readFileSync('decks/dominaria-brg.txt', 'utf8'), registry).cardIds;
  const state = setupCardMatch({
    seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([['p1', green], ['p2', black]]), registry,
  });
  // Syntetyczny stan odłożenia: 7 kart, każde o INNEJ definicji (najgorszy
  // przypadek dedupa), N = 4 → przestrzeń decyzji = C(7,4) = 35. Obiekty są
  // zamrożone, więc NIE mutujemy cardId — zamiast tego dobieramy 7 id-ów
  // o PARAMI różnych definicjach spośród wszystkich obiektów stanu (enumeracja
  // czyta wyłącznie `pending.handIds` + `objects.get(id).cardId`).
  const distinct = [];
  const seenDefs = new Set();
  for (const [id, obj] of state.objects) {
    const def = obj?.cardId;
    if (!def || seenDefs.has(def)) continue;
    seenDefs.add(def);
    distinct.push(id);
    if (distinct.length === 7) break;
  }
  assert.equal(distinct.length, 7, 'potrzeba 7 parami różnych definicji');
  state.pendingMulligans = [];
  state.pendingMulliganBottom = { playerId: 'p1', count: 4, handIds: [...distinct], restorePriorityTo: 'p1' };
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'resolve_mulligan_bottom_choice');
  assert.equal(offers.length, 35,
    `CAP musi pokrywać pełną przestrzeń C(7,4)=35 — jest ${offers.length}; `
    + 'dziurawa oferta = legalne wybory bez komendy = klin w kreatorze');
  // Każda 4-podzbiór-różnych-definicji ma komendę (reprezentanta).
  const keys = new Set(offers.map((c) => [...c.cardIds].sort().join('|')));
  assert.equal(keys.size, 35, 'bez duplikatów w ofercie');
});

test('M304/3: kreator — Zatwierdź oddaje komendę dla wyboru drugiej kopii (integracja)', async () => {
  class MiniEl {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.listeners = {};
      this.className = ''; this.text = ''; this.type = ''; this.checked = false;
      this.disabled = false; this.dataset = {}; this.innerHTML = ''; this.value = '';
    }
    set textContent(value) { this.text = String(value); }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
    appendChild(child) { this.children.push(child); return child; }
    addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
    emit(type, event = {}) { for (const l of this.listeners[type] ?? []) l(event); }
    click() { this.emit('click', { preventDefault() {}, stopPropagation() {} }); }
    all(pred, out = []) { if (pred(this)) out.push(this); for (const c of this.children) c.all(pred, out); return out; }
  }
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };

  const { renderMultiTargetWizard } = await import('../src/table/choice-request.js');
  // Ręka 5 kart, dwie kopie 'bagno'; odłożenie 2 z 5 (jak w M304/1).
  const defs = new Map([['b1', 'bagno'], ['b2', 'bagno'], ['c', 'las'], ['d', 'góra'], ['e', 'równina']]);
  const commands = [
    { type: 'resolve_mulligan_bottom_choice', playerId: 'p1', cardIds: ['b1', 'c'] },
    { type: 'resolve_mulligan_bottom_choice', playerId: 'p1', cardIds: ['b1', 'd'] },
    { type: 'resolve_mulligan_bottom_choice', playerId: 'p1', cardIds: ['b1', 'b2'] },
    { type: 'resolve_mulligan_bottom_choice', playerId: 'p1', cardIds: ['c', 'd'] },
    { type: 'resolve_mulligan_bottom_choice', playerId: 'p1', cardIds: ['d', 'e'] },
  ];
  const plan = mulliganBottomPlanOf(commands);
  assert.ok(plan, 'plan mulligan-bottom z representative-ów');
  const session = {
    nameOf: (cardId) => `Nazwa:${cardId}`,
    state: { objects: new Map([...defs].map(([id, cardId]) => [id, { id, cardId }])) },
  };
  const view = { players: [{ id: 'p1', name: 'Ty' }], zones: {
    battlefield: [], stack: [], graveyard: [], library: [],
    hand: [...defs.keys()].map((id) => ({ id, cardId: defs.get(id) })),
  } };
  const completed = [];
  const host = new MiniEl('div');
  renderMultiTargetWizard(host, {
    view, session, plan, commands,
    intro: 'Mulligan: zaznacz 2 karty do odłożenia na spód biblioteki:',
    onComplete: (cmd) => completed.push(cmd),
    onCancel: () => {},
  });
  // Zaznaczamy b2 + c (druga kopia bagien — instancja spoza reprezentantów).
  const toggles = host.all((el) => el.tagName === 'input'
    && /(^| )multi-target-toggle( |$)/.test(String(el.className)));
  assert.equal(toggles.length, 5, 'wiersz na każdą instancję');
  // Kolejność wierszy = union z planu (nie kolejność instancji w ręce).
  const rowOrder = plan.cardIds;
  for (const want of ['b2', 'c']) {
    const i = rowOrder.indexOf(want);
    assert.ok(i >= 0, `wiersz dla ${want}`);
    toggles[i].checked = true;
    toggles[i].emit('change');
  }
  const confirm = host.all((el) => el.tagName === 'button'
    && /multi-target-confirm/.test(String(el.className)))[0];
  assert.ok(confirm, 'przycisk Zatwierdź istnieje');
  confirm.click();
  assert.equal(completed.length, 1,
    'Zatwierdź przy wyborze drugiej kopii NIE może milczeć (klin z żywca: t-theros-random-3)');
  assert.deepEqual([...completed[0].cardIds].sort(), ['b1', 'c'], 'poszła komenda-reprezentant z legalCommands');
});
