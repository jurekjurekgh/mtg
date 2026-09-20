// E4 (audyt PR #130, pętla jakości ADR 0021 §4b) — znalezisko z RĘCZNEJ lektury
// transkryptów Żywego Testera (oś narracji, L27): partia tarkir-bg vs ravnica
// (seed 101) pokazała w ręce gracza
//   Hooting Mandrills · 6 · Creature — Ape · Zadeptywanie · 4/4
// — BEZ słowa o Delve, chociaż karta ma `delve: true` (CR 702.66) i przy rzucie
// otwiera się modal „Delve — karty do wygnania z grobu". Gracz nie widział więc
// na karcie mechaniki, która zmienia sposób płacenia kosztu; dowiadywał się
// o niej dopiero z okna decyzji. Klasa M138/#11 (każdy deskryptor karty ma
// opis na kaflu) i M100/E10 (puste pole reguł) — Delve był deskryptorem niemym,
// bo `cardInfo`/`renderCardPreview` nie przenosiły pola, a `rulesText` nie miał
// linii.
//
// Cztery nogi (L5: strażnik mierzy regułę i ścieżkę produkcyjną):
//  1. `rulesText` karty z Delve nazywa mechanikę brzmieniem z Oracle;
//  2. strażnik KLASOWY po katalogu: każda karta z `delve` ma linię (dziś jedna,
//     pin nie może zgasnąć, gdy dojdą następne — Treasure Cruise i reszta KTK);
//  3. ścieżka produkcyjna KAFLA: `cardInfo` niesie pole (ADR 0017 — widok
//     kompletny) i `rulesText(info)` pokazuje Delve;
//  4. ścieżka produkcyjna PODGLĄDU: `renderCardPreview` rysuje Delve w polu
//     reguł (pełny ekran karty).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { rulesText, cardInfo, renderCardPreview } from '../src/table/render.js';

const registry = createCardRegistry();
const mandrills = registry.get('hooting-mandrills');

/** Minimalny element DOM (jak MiniEl w `test/table-ui.test.js`). */
class MiniEl {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.className = '';
    this.attrs = {};
    this.text = '';
    this.html = '';
  }

  set textContent(v) { this.text = String(v); this.children = []; }

  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }

  set innerHTML(v) { this.html = String(v); }

  get innerHTML() { return this.html; }

  appendChild(child) { this.children.push(child); return child; }

  setAttribute(k, v) { this.attrs[k] = String(v); }

  getAttribute(k) { return this.attrs[k] ?? null; }

  addEventListener() {}

  removeEventListener() {}

  querySelector() { return null; }

  querySelectorAll() { return []; }

  closest() { return null; }
}

const documentBackup = globalThis.document;
globalThis.document = { createElement: (tag) => new MiniEl(tag) };
after(() => { globalThis.document = documentBackup; });

/** Sesja-stub: tylko to, czego `cardInfo` potrzebuje do kafla w ręce. */
function stubSession() {
  return {
    cardDetails: (cardId) => registry.get(cardId) ?? null,
    colorsOf: (cardId) => registry.get(cardId)?.colors ?? [],
    nameOf: (cardId) => registry.get(cardId)?.name ?? cardId,
    nameOfObject: () => '',
    nameOrdinalSuffix: () => '',
    view: () => ({ zones: { battlefield: [] } }),
    state: null,
  };
}

test('E4/1: rulesText karty z Delve nazywa mechanikę (Oracle, CR 702.66a)', () => {
  assert.ok(mandrills, 'Hooting Mandrills jest w prawdziwym rejestrze');
  assert.ok(mandrills.delve, 'karta ma deskryptor delve (batch 57/B4)');
  const text = rulesText(mandrills);
  assert.match(text, /Delve/, 'Delve jest treścią karty, nie tylko tytułem modala');
  assert.match(text, /płaci za \{1\}/, 'brzmienie z Oracle: każda wygnana karta płaci za {1}');
  assert.match(text, /Zadeptywanie/, 'pozostałe keywordy bez zmian');
});

test('E4/2: strażnik klasowy — KAŻDA karta z delve ma linię Delve', () => {
  const zDelve = registry.all().filter((def) => def.delve);
  assert.ok(zDelve.length >= 1, 'klasa nie jest pusta (dziś Hooting Mandrills)');
  for (const def of zDelve) {
    assert.match(rulesText(def), /Delve/, `${def.name}: deskryptor delve niemy na kaflu`);
  }
});

test('E4/3: kafel (cardInfo) niesie delve i pokazuje je w polu reguł', () => {
  const object = {
    id: 'mandrills-1', cardId: 'hooting-mandrills', zone: 'hand',
    controllerId: 'p1', ownerId: 'p1', types: ['Creature'], subtypes: ['Ape'],
    keywords: ['trample'], power: 4, toughness: 4,
  };
  const info = cardInfo(stubSession(), object);
  assert.equal(info.delve, true, 'widok kafla niesie deskryptor (ADR 0017)');
  assert.match(rulesText(info), /Delve/, 'kafel w ręce pokazuje Delve');
});

test('E4/4: podgląd karty (renderCardPreview) rysuje Delve w polu reguł', () => {
  const host = new MiniEl('div');
  renderCardPreview(host, mandrills);
  const box = host.children
    .flatMap((c) => [c, ...c.children])
    .find((c) => String(c.className).includes('preview-box'));
  assert.ok(box, 'pole reguł w podglądzie istnieje');
  assert.match(box.textContent, /Delve/, 'pełny ekran karty nazywa Delve');
  assert.match(box.textContent, /płaci za \{1\}/, 'z brzmieniem z Oracle');
});
