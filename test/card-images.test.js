import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_BACK_URL, HOVER_MODES, IMAGE_MODE, IMAGE_SIZE, cardImageSources, detectImageMode,
  hasPrintImage, hoverImageSources, hoverModeLabel, hoverPreviewShape, imageFileName, localArtUrl,
  localImagePath, nextHoverMode, scaleScryfallImage, scryfallCardUrl, scryfallImageUrl,
  tileImageSources,
} from '../src/table/card-images.js';
import { createCardRegistry } from '../src/cards/card-data.js';

const registry = createCardRegistry();
const razorback = registry.get('syn-razorback');
const highlandGame = registry.get('highland-game');
const grizzled = registry.get('grizzled-outcasts');
const krallenhorde = registry.get('krallenhorde-wantons');
const forest = registry.get('basic-forest');

test('nazwa pliku ilustracji jest stabilnym slugiem', () => {
  assert.equal(imageFileName('Synthetic Razorback'), 'synthetic_razorback');
  assert.equal(imageFileName("Jace, the Mind Sculptor"), 'jace_the_mind_sculptor');
  assert.equal(imageFileName('  Fire / Ice  '), 'fire_ice');
  assert.throws(() => imageFileName(''), TypeError);
});

test('ścieżka lokalna uwzględnia zestaw i slug nazwy', () => {
  assert.equal(localImagePath(razorback), 'img/SYNTH/synthetic_razorback.jpg');
  assert.throws(() => localImagePath({ name: 'Bez setu' }), TypeError);
});

test('adres Scryfall koduje nazwę i prosi o wersję obrazu', () => {
  const url = scryfallImageUrl(razorback);
  assert.match(url, /^https:\/\/api\.scryfall\.com\/cards\/named\?exact=/);
  assert.match(url, /exact=Synthetic%20Razorback/);
  assert.match(url, /format=image&version=normal/);
  assert.match(scryfallImageUrl(razorback, { version: 'art_crop' }), /version=art_crop/);
});

test('kolejność kandydatów zależy od trybu, ale zawiera te same adresy', () => {
  const local = cardImageSources(razorback, { mode: IMAGE_MODE.localFirst });
  const remote = cardImageSources(razorback, { mode: IMAGE_MODE.remoteFirst });
  assert.equal(local[0], 'img/SYNTH/synthetic_razorback.jpg');
  assert.match(local[1], /^https:\/\/api\.scryfall\.com/);
  assert.deepEqual([...remote].sort(), [...local].sort());
  assert.equal(remote[0], local[1]);
});

test('tryb wykrywany po protokole strony', () => {
  assert.equal(detectImageMode('file:'), IMAGE_MODE.localFirst);
  assert.equal(detectImageMode('https:'), IMAGE_MODE.remoteFirst);
  assert.equal(detectImageMode('http:'), IMAGE_MODE.remoteFirst);
});

// --- Ilustracje realnych kart na kaflu (poz. 10.1) ----------------------

test('rozmiar obrazu Scryfall jest przeskalowywalny w obu formach adresu', () => {
  const large = 'https://cards.scryfall.io/large/front/7/f/7fbb10a9.jpg?1783939067';
  assert.equal(scaleScryfallImage(large, 'normal'), 'https://cards.scryfall.io/normal/front/7/f/7fbb10a9.jpg?1783939067');
  assert.equal(scaleScryfallImage(large, 'large'), large);
  const named = 'https://api.scryfall.com/cards/named?exact=Forest&format=image&version=normal';
  assert.match(scaleScryfallImage(named, 'large'), /version=large$/);
  // Obcy hosting zostaje nietknięty, pusty adres nie wywraca renderu.
  assert.equal(scaleScryfallImage('https://example.test/a.png', 'normal'), 'https://example.test/a.png');
  assert.equal(scaleScryfallImage(null, 'normal'), null);
  assert.throws(() => scaleScryfallImage(large, 'gigantic'), TypeError);
});

test('realna karta ma adres swojego druku, karta bez druku idzie po nazwie', () => {
  assert.ok(hasPrintImage(highlandGame));
  assert.equal(hasPrintImage(razorback), false);
  assert.match(scryfallCardUrl(highlandGame), /^https:\/\/cards\.scryfall\.io\/normal\/front\//);
  assert.match(scryfallCardUrl(highlandGame, { size: IMAGE_SIZE.zoom }), /cards\.scryfall\.io\/large\/front\//);
  assert.match(scryfallCardUrl(razorback), /api\.scryfall\.com\/cards\/named\?exact=Synthetic%20Razorback/);
});

test('kafel na stole bierze obraz druku, a wirtualny land przekierowanie po nazwie', () => {
  const tile = tileImageSources(highlandGame);
  assert.equal(tile[0], scryfallCardUrl(highlandGame, { size: IMAGE_SIZE.tile }));
  assert.match(tile[0], /\/normal\//);

  // Wirtualny land nie ma setu — jego „stały druk" to przekierowanie po nazwie
  // (decyzja właściciela: druk domyślny Scryfalla, jak w legacy HTML).
  assert.equal(forest.set, null);
  const landTile = tileImageSources(forest);
  assert.deepEqual(landTile, ['https://api.scryfall.com/cards/named?exact=Forest&format=image&version=normal']);
  assert.match(hoverImageSources(forest)[0], /version=large$/);
  assert.equal(landTile.some((url) => url.startsWith('img/')), false);
});

test('karta bez realnego druku (syntetyk, token) nie generuje żądania obrazu', () => {
  assert.deepEqual(tileImageSources(razorback), []);
  assert.deepEqual(tileImageSources(registry.get('token_goblin')), []);
  assert.deepEqual(hoverImageSources(razorback), []);
});

test('DFC: strona przednia i tylna mają własne adresy druku', () => {
  assert.match(tileImageSources(grizzled)[0], /cards\.scryfall\.io\/normal\/front\/4\/b\//);
  assert.match(tileImageSources(krallenhorde)[0], /cards\.scryfall\.io\/normal\/back\/4\/b\//);
  // Ten sam druk (to samo id), różne strony — po transformacji kafel pokazuje tył.
  assert.notEqual(tileImageSources(grizzled)[0], tileImageSources(krallenhorde)[0]);
});

test('karta zakryta pokazuje jeden wspólny rewers (bez wycieku tożsamości)', () => {
  assert.deepEqual(tileImageSources({ faceDown: true }), [CARD_BACK_URL]);
  assert.deepEqual(tileImageSources({ faceDown: true, ...highlandGame }), [CARD_BACK_URL]);
  assert.deepEqual(hoverImageSources({ faceDown: true }), [CARD_BACK_URL]);
  assert.match(CARD_BACK_URL, /^https:\/\/backs\.scryfall\.io\//);
});

test('kafel bez danych karty nie generuje żadnego adresu (fallback na twarz)', () => {
  assert.deepEqual(tileImageSources(null), []);
  assert.deepEqual(tileImageSources({}), []);
});

test('lokalne warianty ilustracji wymagają artId z arkusza właściciela', () => {
  assert.equal(localArtUrl(highlandGame, 'fot'), null, 'karty w repo nie mają jeszcze artId');
  assert.equal(localArtUrl({ artId: 412 }, 'fot'), 'img/412FOT.png');
  assert.equal(localArtUrl({ artId: 412 }, 'kon'), 'img/412KON.png');
  assert.throws(() => localArtUrl({ artId: 412 }, 'kra'), TypeError);
});

test('hover: tor scryfall daje duży obraz, tory lokalne wchodzą przed nim', () => {
  const scryfall = hoverImageSources(highlandGame, { hoverMode: 'scryfall' });
  assert.match(scryfall[0], /cards\.scryfall\.io\/large\/front\//);

  // Bez artId tory lokalne są równoważne torowi scryfall (nie ma czego pobrać).
  assert.deepEqual(hoverImageSources(highlandGame, { hoverMode: 'fot' }), scryfall);

  const withArt = { ...highlandGame, artId: 77 };
  assert.deepEqual(hoverImageSources(withArt, { hoverMode: 'fot' })[0], 'img/77FOT.png');
  assert.deepEqual(hoverImageSources(withArt, { hoverMode: 'kon' })[0], 'img/77KON.png');
  // Fallback: po nieudanym pliku lokalnym zostaje pełna karta.
  assert.match(hoverImageSources(withArt, { hoverMode: 'fot' })[1], /cards\.scryfall\.io\/large\//);
});

test('scroll rotuje tory podglądu w obie strony, jak w legacy HTML', () => {
  assert.deepEqual([...HOVER_MODES], ['scryfall', 'fot', 'kon']);
  assert.equal(nextHoverMode('scryfall'), 'fot');
  assert.equal(nextHoverMode('fot'), 'kon');
  assert.equal(nextHoverMode('kon'), 'scryfall');
  assert.equal(nextHoverMode('kon', -1), 'fot');
  assert.equal(nextHoverMode('scryfall', -1), 'kon');
  assert.equal(nextHoverMode('nieznany'), 'fot');
});

test('każdy tor ma własny kształt okna i polską etykietę', () => {
  assert.deepEqual({ ...hoverPreviewShape('scryfall') }, { width: 320, height: 448, fit: 'cover' });
  assert.equal(hoverPreviewShape('fot').width, 900);
  assert.equal(hoverPreviewShape('kon').fit, 'contain');
  assert.match(hoverModeLabel('scryfall'), /Scryfall/);
  assert.match(hoverModeLabel('fot'), /panoramiczna/);
  assert.match(hoverModeLabel('kon'), /bestiariusz/);
});
