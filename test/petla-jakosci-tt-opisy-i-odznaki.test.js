/**
 * Pętla jakości (2026-10-23, ADR 0021) — 4 usterki opisów i odznak kart
 * wykryte ręcznym czytaniem transkryptów Żywego Testera Stołu (`tt-2`, `tt-6`, `tt-7`):
 *
 *   LT-1 (`Ruinous Rampage`, `tt-7`): `exile_all` drukował zaślepkę
 *        `„wygnij wszystkie (filtr)”` zamiast realnego filtra typów i MV (`L29`).
 *   LT-2 (`Tackle Artist` / `Tellah, Great Sage` / `wasGifted`, `tt-7`):
 *        `add_counter` ignorował `amount > 1`, a `describeEffect` pomijał warunki
 *        `manaSpentBelow`, `manaSpentAtLeast` oraz `wasGifted` — kafel drukował
 *        `„połóż licznik +1/+1, połóż licznik +1/+1.”` (`ADR 0017`, `L11`).
 *   LT-3 (`Kabira Vindicator`, `tt-2`): `describeStatic` zwijał liczbowe `+1/+1`
 *        i `+2/+2` do gołego `+1` / `+2` (`„inne twoje stwory: +1”`), bo omijał
 *        wspólny helper `ptPair` z M255/D (`L41`).
 *   LT-4 (`Tah-Crop Skirmisher` + `Shiv's Embrace`, `tt-6`): tymczasowy bonus
 *        `powerMod=2, toughMod=0` drukował odznakę `+2/0` bez znaku przy zerze,
 *        wbrew regule M188/A stosowanej 12 linii niżej dla `grantedPower` (`+2/+0`).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createSession, BOT_ID, HUMAN_ID } from '../src/table/session.js';
import { cardInfo, buildStateOverlay, describeSpellEffects, rulesText } from '../src/table/render.js';

class MiniEl {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.className = '';
    this.textContent = '';
    this.dataset = {};
    this.style = { setProperty() {} };
    this.children = [];
    this._attrs = new Map();
  }
  appendChild(c) { this.children.push(c); return c; }
  append(...ns) { for (const n of ns) this.children.push(n); }
  setAttribute(k, v) { this._attrs.set(k, String(v)); }
  getAttribute(k) { return this._attrs.get(k) ?? null; }
  querySelectorAll() { return []; }
}

function withFakeDom(fn) {
  const prev = globalThis.document;
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  try { return fn(); } finally { globalThis.document = prev; }
}

function collectTexts(el, out = []) {
  if (!el || typeof el !== 'object') return out;
  if (el.textContent) out.push(el.textContent);
  for (const ch of el.children ?? []) collectTexts(ch, out);
  return out;
}

const REGISTRY = createCardRegistry();

function infoForCardOnBattlefield(cardId, runtime = {}) {
  const session = createSession({
    seed: 1,
    registry: REGISTRY,
    decks: new Map([
      [HUMAN_ID, Array(40).fill('basic-plains')],
      [BOT_ID, Array(40).fill('basic-island')],
    ]),
  });
  const state = session.state;
  state.pendingMulligans = [];
  state.step = 'main';
  addObject(state, {
    ...gameObjectDataOf(REGISTRY.get(cardId)),
    id: 'obj-1', instanceId: 'inst-1', cardId, ownerId: HUMAN_ID, controllerId: HUMAN_ID, zone: 'battlefield',
  });
  if (Object.keys(runtime).length > 0) {
    state.objects.set('obj-1', Object.freeze({ ...state.objects.get('obj-1'), ...runtime }));
  }
  const viewObj = playerView(state, HUMAN_ID).zones.battlefield.find((o) => o.id === 'obj-1');
  return cardInfo(session, viewObj);
}

test('LT-1 (Ruinous Rampage, L29): exile_all opisuje filtr typów i MV zamiast zaślepki „(filtr)"', () => {
  const ruinous = REGISTRY.get('ruinous-rampage');
  const desc = describeSpellEffects(ruinous.spell);
  assert.ok(!desc.includes('(filtr)'), `zaślepka „(filtr)" nie może wyciekać na kafel: ${desc}`);
  assert.ok(desc.includes('wygnij wszystkie artefakty o MV ≤3'), `oczekiwano pełnego filtra artefaktów MV ≤3, mam: ${desc}`);

  const atLeast = describeSpellEffects({
    effects: [{ type: 'exile_all', filter: { types: ['Creature'], manaValueAtLeast: 4 } }],
  });
  assert.equal(atLeast, 'wygnij wszystkie stwory o MV ≥4');
});

test('LT-2 (Tackle Artist / Tellah / Gift, ADR 0017): add_counter pokazuje liczbę >1 oraz progi wydanej many i Gift', () => {
  const tackleInfo = infoForCardOnBattlefield('tackle-artist');
  const tackleText = rulesText(tackleInfo);
  assert.ok(
    !tackleText.includes('połóż licznik +1/+1, połóż licznik +1/+1'),
    `Opus nie może drukować dwóch identycznych połówek bez warunku i liczby: ${tackleText}`,
  );
  assert.ok(tackleText.includes('2 liczniki +1/+1'), `Opus musi mówić o 2 licznikach +1/+1: ${tackleText}`);
  assert.ok(tackleText.includes('5+ many'), `Opus musi podać próg 5+ wydanej many: ${tackleText}`);

  const tellahInfo = infoForCardOnBattlefield('tellah-great-sage');
  const tellahText = rulesText(tellahInfo);
  assert.ok(tellahText.includes('4+ many'), `Tellah musi podać próg 4+ wydanej many: ${tellahText}`);
  assert.ok(tellahText.includes('8+ many'), `Tellah musi podać próg 8+ wydanej many: ${tellahText}`);

  const gifted = describeSpellEffects({
    effects: [
      { type: 'pump', power: 2, toughness: 2 },
      { type: 'grant_keywords_until_end_of_turn', keywords: ['indestructible'], condition: { wasGifted: true } },
    ],
  });
  assert.ok(gifted.includes('jeśli obiecano dar') || gifted.includes('Gift'), `warunek wasGifted musi być widoczny na kaflu: ${gifted}`);
});

test('LT-3 (Kabira Vindicator, L41): describeStatic pokazuje pełne +1/+1 i +2/+2 zamiast gołego +1 i +2', () => {
  const kabiraInfo = infoForCardOnBattlefield('kabira-vindicator');
  const kabiraText = rulesText(kabiraInfo);
  assert.ok(kabiraText.includes('inne twoje stwory: +1/+1'), `oczekiwano „inne twoje stwory: +1/+1", mam: ${kabiraText}`);
  assert.ok(kabiraText.includes('inne twoje stwory: +2/+2'), `oczekiwano „inne twoje stwory: +2/+2", mam: ${kabiraText}`);
});

test('LT-4 (Shiv\'s Embrace / M188/A): tymczasowy modyfikator P/T drukuje znak przy zerze (+2/+0 zamiast +2/0)', () => {
  const info = infoForCardOnBattlefield('tah-crop-skirmisher', { powerModifier: 2, toughnessModifier: 0 });
  const texts = withFakeDom(() => {
    const visual = new MiniEl('div');
    buildStateOverlay(visual, { ...info, isBattlefield: true });
    return collectTexts(visual);
  });
  assert.ok(texts.includes('+2/+0'), `oczekiwano odznaki „+2/+0", mam: ${JSON.stringify(texts)}`);
  assert.ok(!texts.includes('+2/0'), `nie może się pojawić ułamek „+2/0": ${JSON.stringify(texts)}`);
});
