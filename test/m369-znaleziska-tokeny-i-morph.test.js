// M369 (znaleziska właściciela 2026-09-17c, H i I): grafiki zakrytych kart
// i tokenów.
//
// H: zakryty permanent na POLU BITWY to drukowany token Morph (DTK) — wcześniej
//    kafel brał rewers zwykłej karty. Strefy UKRYTE (ręka przeciwnika, wierzch
//    biblioteki) zostają przy rewersie karty: morpha zakrywa plansza, nie ręka.
// I: token Servo (fabricate) nie miał żadnego wpisu z ilustracją — kafel nie
//    umiał pobrać obrazu. Strażnik pilnuje KAŻDEGO tokenu tworzonego przez
//    silnik: wpis katalogowy z `imageUri` albo mapa TOKEN_IMAGES.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry, TOKEN_IMAGES } from '../src/cards/card-data.js';
import {
  CARD_BACK_URL, MORPH_BACK_URL, tileImageSources, hoverImageSources,
} from '../src/table/card-images.js';
import { cardInfo, renderHoverPreview } from '../src/table/render.js';

/** Minimalny DOM dla renderu hoveru (podgląd tworzy <img> i podpis toru). */
function installFakeDom() {
  const makeEl = (tag) => ({
    tag, children: [], style: {}, textContent: '', className: '',
    appendChild(child) { this.children.push(child); return child; },
    addEventListener() {}, removeEventListener() {}, setAttribute() {},
  });
  globalThis.document = {
    createElement: makeEl,
    createTextNode: (text) => ({ textContent: String(text) }),
  };
  return makeEl;
}

function fakeHost(makeEl = (tag) => ({ tag, children: [], style: {}, textContent: '', className: '', appendChild(c) { this.children.push(c); return c; }, addEventListener() {}, setAttribute() {} })) {
  return makeEl('div');
}

/** Sesja-atrapa: render potrzebuje wyłącznie danych karty i nazw. */
function stubSession(details = {}) {
  return {
    cardDetails: (cardId) => details[cardId] ?? null,
    colorsOf: () => [],
    abilitiesOf: () => [],
    nameOf: (cardId) => details[cardId]?.name ?? String(cardId),
    nameOfObject: () => null,
    nameOrdinalSuffix: () => '',
    cardIdByName: new Map(),
    view: () => ({ zones: { battlefield: [] } }),
  };
}

const ZAKRYTY_PERMANENT = {
  id: 'obj-1', cardId: 'morph-x', zone: 'battlefield', faceDown: true,
  controllerId: 'p2', kind: 'creature', types: ['Creature'], power: 2, toughness: 2,
};

test('I: token Servo ma wpis katalogowy z drukiem Kaladesh Tokens', () => {
  const servo = createCardRegistry().get('token_servo');
  assert.ok(servo, 'wpis token_servo istnieje w katalogu');
  assert.equal(servo.name, 'Servo');
  assert.equal(servo.power, 1);
  assert.equal(servo.toughness, 1);
  assert.match(String(servo.imageUri), /60842b1a-6ae7-4b3b-a23f-0d94a3d89884/,
    'druk tkld/4 z API Scryfalla (nie zgadywany UUID)');
  assert.equal(servo.support.status, 'token', 'token nie jest taliowalny');
});

test('I: każdy token tworzony przez silnik ma ilustrację', () => {
  const sources = [
    'src/engine/effects.js', 'src/engine/game-state.js', 'src/engine/tokens.js',
    'src/engine/resources.js', 'src/cards/card-data.js',
  ];
  const ids = new Set();
  for (const file of sources) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/cardId: '(token_[a-z0-9_]+)'/g)) {
      ids.add(match[1]);
    }
  }
  assert.ok(ids.size >= 30, `sensowna liczba tokenów w silniku (${ids.size})`);
  const registry = createCardRegistry();
  const bezGrafiki = [...ids].filter((id) => !(registry.get(id)?.imageUri || TOKEN_IMAGES[id]));
  assert.deepEqual(bezGrafiki, [], `tokeny bez ilustracji: ${bezGrafiki.join(', ')}`);
});

test('H: zakryty permanent na polu bitwy bierze token Morph, strefy ukryte — rewers karty', () => {
  assert.match(MORPH_BACK_URL, /5f29231c-dd21-4a45-a1f0-464d338128ed/, 'druk tdtk/7 (DTK)');
  assert.notEqual(MORPH_BACK_URL, CARD_BACK_URL, 'to dwa różne obrazy');
  assert.deepEqual(tileImageSources({ faceDown: true, battlefield: true }), [MORPH_BACK_URL]);
  assert.deepEqual(hoverImageSources({ faceDown: true, battlefield: true }), [MORPH_BACK_URL]);
  assert.deepEqual(tileImageSources({ faceDown: true }), [CARD_BACK_URL],
    'karta bez strefy pola bitwy (ręka bota) zostaje przy rewersie karty');
});

test('H: hook — cardInfo niesie strefę, render pokazuje właściwy rewers', () => {
  const makeEl = installFakeDom();
  const session = stubSession({ 'morph-x': { name: 'Wooly Loxodon', imageUri: 'https://example.test/loxodon.jpg' } });
  const info = cardInfo(session, ZAKRYTY_PERMANENT);
  assert.equal(info.faceDown, true, 'permanent jest zakryty');
  assert.equal(info.isBattlefield, true, 'strefa permanentu dociera do info');
  assert.equal(info.imageUri, null, 'tajemnica karty nie wycieka na kafel');

  const host = fakeHost(makeEl);
  renderHoverPreview(host, info);
  const img = host.children.find((child) => child.tag === 'img');
  assert.equal(img?.src, MORPH_BACK_URL, 'podgląd zakrytego permanentu = token Morph');

  // Lustro call-site’u renderEnemyHand (render.js): kafel ręki bota nie ma
  // strefy pola bitwy, więc dalej dostaje rewers karty (CR 402.2).
  const enemyHand = {
    objectId: 'enemy-hand-0', cardId: null, faceDown: true, name: 'Karta przeciwnika',
    colors: [], kind: 'card', types: [],
  };
  const host2 = fakeHost(makeEl);
  renderHoverPreview(host2, enemyHand);
  const img2 = host2.children.find((child) => child.tag === 'img');
  assert.equal(img2?.src, CARD_BACK_URL, 'ręka przeciwnika bez zmian');
});
