import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { rulesText, describeSpellEffects, renderTableView } from '../src/table/render.js';

/**
 * Klasowy strażnik surowych slugów (snake_case) w tekstach prezentowanych
 * graczowi — CAŁY rejestr, nie jedna karta.
 *
 * Klasy i geneza (L27/L112 — klasa znaleziona ręcznie dostaje detektor;
 * M122/#5 „surowy slug zamiast treści"): Żywy Tester wykrył 2026-11-21, że
 * kafel „Blitz of the Thunder-Raptor" drukował surowy slug
 * `instants_and_sorceries_in_your_graveyard` zamiast frazy — brak wpisu w
 * `DYNAMIC_AMOUNT_NOUNS` (naprawiony w PR #188 testem jednokartowym).
 * Istniejące strażniki pilują `ef.type` (D2.8), keywordy (m179), eventy
 * triggerów (m202/C) i etykiety pól — NIE pilowały rodziny `amount:` na
 * poziomie całego katalogu, dlatego defekt przeżył do testera.
 *
 * Ten test zamyka klasę: dla KAŻDEJ karty rejestru (także tokenów — ich kafle
 * też renderuje stół) skanowane są obie powierzchnie:
 *   A) czyste funkcje opisu: `rulesText` (linie kafla) + `describeSpellEffects`
 *      (czary, efekty zdolności, tryby modalne);
 *   B) realny kafelek: `renderTableView` z kartą w RĘCE i na POLU BITWY
 *      (wzorzec MiniEl-harness z `test/audyt-pr187-raw-slug-blitz.test.js`).
 *
 * Weryfikacja mutacyjna (L13, przy tworzeniu 2026-11-21): usunięcie wpisu
 * `instants_and_sorceries_in_your_graveyard` z `DYNAMIC_AMOUNT_NOUNS` daje
 * RED na obu warstwach (trafienie `blitz-of-the-thunder-raptor:rulesText`
 * i `blitz-of-the-thunder-raptor:hand`), przywrócenie → GREEN.
 * Dodatkowo test „detectProof" pilnuje, by sam regex detektora był w stanie
 * czerwienieć (bez tego strażnik mógłby spać — L27: zero zgłoszeń to pomiar
 * narzędzia).
 *
 * Regex celowo łapie slug ≥2 segmentów z podkreślnikiem; polski tekst
 * interfejsu i nazwy kart podkreślników nie zawierają, więc trafienie =
 * wyciek identyfikatora danych do gracza.
 */

const REGISTRY = createCardRegistry();
const SLUG_RE = /[a-z][a-z0-9]*_[a-z0-9_]+/g;

function collectHits(where, text, hits) {
  if (typeof text !== 'string' || text.length === 0) return;
  for (const slug of text.match(SLUG_RE) ?? []) {
    if (!hits.has(slug)) hits.set(slug, []);
    if (hits.get(slug).length < 5) hits.get(slug).push(where);
  }
}

function report(hits) {
  return [...hits.entries()]
    .map(([slug, where]) => `${slug} <- ${where.join(', ')}`)
    .join(' | ');
}

test('slugProof: sam detektor potrafi czerwienieć (L27 — pomiar narzędzia)', () => {
  assert.match('zada tyle, ile_some_slug_obrażeń', SLUG_RE,
    'regex przestał łapać slugi — strażnik jest ślepy');
  assert.equal('zada 5 obrażeń'.match(SLUG_RE), null,
    'fałszywy alarm na zwykłym tekście');
});

test('A: rulesText i describeSpellEffects całej katalogu bez surowych slugów', () => {
  const hits = new Map();
  for (const def of REGISTRY.all()) {
    let text = '';
    try {
      text += rulesText({
        cardId: def.id, controllerId: 'p1',
        abilities: def.abilities ?? [], keywords: def.keywords ?? [],
        spell: def.spell ?? null, equipment: def.equipment ?? null,
        plot: def.plot ?? null, saga: def.saga ?? null,
        entersWithCounters: def.entersWithCounters ?? null, aura: def.aura ?? null,
      });
      if (def.spell?.effects) {
        text += ' ' + describeSpellEffects(def.spell);
      }
      for (const ab of def.abilities ?? []) {
        const effects = Array.isArray(ab.effect) ? ab.effect : ab.effect ? [ab.effect] : [];
        if (effects.length) text += ' ' + describeSpellEffects({ effects });
        for (const mode of ab.trigger?.modes ?? []) {
          if (mode.effects) text += ' ' + describeSpellEffects({ effects: mode.effects });
        }
      }
      if (Array.isArray(def.spell?.modes)) {
        for (const mode of def.spell.modes) {
          if (mode.effects) text += ' ' + describeSpellEffects({ effects: mode.effects });
        }
      }
    } catch (err) {
      assert.fail(`opis karty ${def.id} rzucił wyjątek: ${err.message}`);
    }
    collectHits(`${def.id}:rulesText`, text, hits);
  }
  assert.equal(hits.size, 0,
    `surowe slugi w opisach kart: ${report(hits)}`);
});

// --- Harness DOM (wzorzec: test/audyt-pr187-raw-slug-blitz.test.js) ---------
class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {};
    this.style = {}; this.dataset = {}; this.className = ''; this.text = ''; this.html = '';
  }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.html = String(v); this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
  get innerHTML() { return (this.html ? this.html : this.text) + this.children.map((c) => c.innerHTML).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  prepend(child) { this.children.unshift(child); return child; }
  addEventListener() {}
  click() {}
}
const _els = new Map();
function _el(id) {
  if (!_els.has(id)) _els.set(id, new MiniEl(id));
  return _els.get(id);
}
globalThis.document = {
  createElement: (tag) => new MiniEl(tag),
  getElementById: (id) => _el(id),
  addEventListener() {},
};
globalThis.window = { confirm: () => false };
globalThis.localStorage = {
  getItem: () => null, setItem() {}, removeItem() {}, clear() {},
};

function miniview(hand, battlefield) {
  return {
    status: 'active', winnerId: null, playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20 }],
    zones: {
      stack: [], graveyard: [], exile: [], library: [],
      hand: hand ?? [], battlefield: battlefield ?? [],
    },
    turn: { number: 1, activePlayerId: 'p1', phase: 'precombat_main', step: 'precombat_main' },
    legalCommands: [],
  };
}
function minisession(view) {
  return {
    view: () => view, log: [], reasoning: [], state: { seed: 13 },
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId ?? '?',
    nameOfObject: (objectId) => objectId,
    cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
    colorsOf: (cardId) => REGISTRY.get(cardId)?.colors ?? [],
    abilitiesOf: (cardId) => REGISTRY.get(cardId)?.abilities ?? [],
  };
}
function miniels() {
  const els = {};
  for (const key of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn',
    'graveEnemy', 'graveOwn', 'exileZone', 'hand', 'actions', 'log']) {
    els[key] = new MiniEl(`#${key}`);
  }
  return els;
}
function renderTileText(hand, battlefield) {
  const els = miniels();
  renderTableView({
    els, session: minisession(miniview(hand, battlefield)),
    play: () => {}, onCardClick: () => {},
  });
  return els.hand.textContent + ' | ' + els.bfOwn.textContent
    + ' | ' + els.actions.textContent + ' | ' + els.log.textContent;
}

test('B: kafelek (RĘKA + POLE BITWY) całej katalogu bez surowych slugów', () => {
  const hits = new Map();
  for (const def of REGISTRY.all()) {
    try {
      const handObj = {
        id: `h-${def.id}`, cardId: def.id, controllerId: 'p1', zone: 'hand',
        kind: def.spell?.timing ?? (def.types?.includes('Land') ? 'land' : 'artifact'),
      };
      collectHits(`${def.id}:hand`, renderTileText([handObj], []), hits);
      const bfObj = { id: `b-${def.id}`, cardId: def.id, controllerId: 'p1', zone: 'battlefield' };
      collectHits(`${def.id}:bf`, renderTileText([], [bfObj]), hits);
    } catch (err) {
      assert.fail(`render kafla karty ${def.id} rzucił wyjątek: ${err.message}`);
    }
  }
  assert.equal(hits.size, 0,
    `surowe slugi na kaflach: ${report(hits)}`);
});
