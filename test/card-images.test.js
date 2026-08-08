import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_BACK_URL, HOVER_MODES, IMAGE_MODE, IMAGE_SIZE, cardImageSources, detectImageMode,
  hasPrintImage, hoverImageSources, hoverModeLabel, hoverPreviewShape, imageFileName, localArtUrl,
  localImagePath, nextHoverMode, scaleScryfallImage, scryfallCardUrl, scryfallImageUrl,
  tileImageSources,
} from '../src/table/card-images.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { defineCard } from '../src/cards/registry.js';

const registry = createCardRegistry();
// Lokalna karta testowa Z setem, ale BEZ druku (imageUri) — zastępuje dawny
// syn-razorback. Nie jest w globalnym rejestrze, więc nie pojawia się w kreatorze.
const noPrint = defineCard({ id: 'test-noprint', name: 'Test No Print', set: 'TEST', types: ['Creature'], support: { status: 'supported' } });
const highlandGame = registry.get('highland-game');
const grizzled = registry.get('grizzled-outcasts');
const krallenhorde = registry.get('krallenhorde-wantons');
const forest = registry.get('basic-forest');
const wolfToken = registry.get('token_wolf');

test('nazwa pliku ilustracji jest stabilnym slugiem', () => {
  assert.equal(imageFileName('Test No Print'), 'test_no_print');
  assert.equal(imageFileName("Jace, the Mind Sculptor"), 'jace_the_mind_sculptor');
  assert.equal(imageFileName('  Fire / Ice  '), 'fire_ice');
  assert.throws(() => imageFileName(''), TypeError);
});

test('ścieżka lokalna uwzględnia zestaw i slug nazwy', () => {
  assert.equal(localImagePath(noPrint), 'img/TEST/test_no_print.jpg');
  assert.throws(() => localImagePath({ name: 'Bez setu' }), TypeError);
});

test('adres Scryfall koduje nazwę i prosi o wersję obrazu', () => {
  const url = scryfallImageUrl(noPrint);
  assert.match(url, /^https:\/\/api\.scryfall\.com\/cards\/named\?exact=/);
  assert.match(url, /exact=Test%20No%20Print/);
  assert.match(url, /format=image&version=normal/);
  assert.match(scryfallImageUrl(noPrint, { version: 'art_crop' }), /version=art_crop/);
});

test('kolejność kandydatów zależy od trybu, ale zawiera te same adresy', () => {
  const local = cardImageSources(noPrint, { mode: IMAGE_MODE.localFirst });
  const remote = cardImageSources(noPrint, { mode: IMAGE_MODE.remoteFirst });
  assert.equal(local[0], 'img/TEST/test_no_print.jpg');
  assert.match(local[1], /^https:\/\/api\.scryfall\.com/);
  assert.deepEqual([...remote].sort(), [...local].sort());
  assert.equal(remote[0], local[1]);
});

test('tryb wykrywany po protokole strony', () => {
  assert.equal(detectImageMode('file:'), IMAGE_MODE.localFirst);
  assert.equal(detectImageMode('https:'), IMAGE_MODE.remoteFirst);
  assert.equal(detectImageMode('http:'), IMAGE_MODE.remoteFirst);
});

test('rozmiar obrazu Scryfall jest przeskalowywalny w obu formach adresu', () => {
  const large = 'https://cards.scryfall.io/large/front/7/f/7fbb10a9.jpg?1783939067';
  assert.equal(scaleScryfallImage(large, 'normal'), 'https://cards.scryfall.io/normal/front/7/f/7fbb10a9.jpg?1783939067');
  assert.equal(scaleScryfallImage(large, 'large'), large);
  const named = 'https://api.scryfall.com/cards/named?exact=Forest&format=image&version=normal';
  assert.match(scaleScryfallImage(named, 'large'), /version=large$/);
  assert.equal(scaleScryfallImage('https://example.test/a.png', 'normal'), 'https://example.test/a.png');
  assert.equal(scaleScryfallImage(null, 'normal'), null);
  assert.throws(() => scaleScryfallImage(large, 'gigantic'), TypeError);
});

test('realna karta ma adres swojego druku, karta bez druku idzie po nazwie', () => {
  assert.ok(hasPrintImage(highlandGame));
  assert.equal(hasPrintImage(noPrint), false);
  assert.match(scryfallCardUrl(highlandGame), /^https:\/\/cards\.scryfall\.io\/normal\/front\//);
  assert.match(scryfallCardUrl(highlandGame, { size: IMAGE_SIZE.zoom }), /cards\.scryfall\.io\/large\/front\//);
  assert.match(scryfallCardUrl(noPrint), /api\.scryfall\.com\/cards\/named\?exact=Test%20No%20Print/);
});

test('kafel na stole bierze obraz druku, a wirtualny land przekierowanie po nazwie', () => {
  const tile = tileImageSources(highlandGame);
  assert.equal(tile[0], scryfallCardUrl(highlandGame, { size: IMAGE_SIZE.tile }));
  assert.match(tile[0], /\/normal\//);

  assert.equal(forest.set, null);
  const landTile = tileImageSources(forest);
  assert.deepEqual(landTile, ['https://api.scryfall.com/cards/named?exact=Forest&format=image&version=normal']);
  assert.match(hoverImageSources(forest)[0], /version=large$/);
  assert.equal(landTile.some((url) => url.startsWith('img/')), false);
});

test('token z imageUri ma własny adres druku (zestaw tokenowy)', () => {
  // Każdy token w rejestrze ma imageUri (B23, „skan zamiast prostokąta"),
  // więc zachowanie jest identyczne jak dla realnej karty — kafel bierze
  // obraz druku, hover daje duży obraz. Osobny tor lokalny (FOT/KON)
  // nadal spada na Scryfall, bo tokeny nie mają artId z arkusza właściciela.
  assert.match(tileImageSources(wolfToken)[0], /^https:\/\/cards\.scryfall\.io\/normal\/front\//);
  assert.match(hoverImageSources(wolfToken)[0], /^https:\/\/cards\.scryfall\.io\/large\/front\//);
});

test('DFC: strona przednia i tylna mają własne adresy druku', () => {
  assert.match(tileImageSources(grizzled)[0], /cards\.scryfall\.io\/normal\/front\/4\/b\//);
  assert.match(tileImageSources(krallenhorde)[0], /cards\.scryfall\.io\/normal\/back\/4\/b\//);
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
  assert.equal(localArtUrl(highlandGame, 'fot'), 'img/509FOT.png', 'realne karty mają artId uzupełnione z arkusza');
  assert.equal(localArtUrl({ artId: 412 }, 'fot'), 'img/412FOT.png');
  assert.equal(localArtUrl({ artId: 412 }, 'kon'), 'img/412KON.png');
  assert.equal(localArtUrl({ name: 'Bez artId' }, 'fot'), null, 'bez artId nie ma czego adresować');
  assert.throws(() => localArtUrl({ artId: 412 }, 'kra'), TypeError);
});

test('hover: tor scryfall daje duży obraz, tory lokalne wchodzą przed nim', () => {
  const scryfall = hoverImageSources(highlandGame, { hoverMode: 'scryfall' });
  assert.match(scryfall[0], /cards\.scryfall\.io\/large\/front\//);

  assert.deepEqual(hoverImageSources(highlandGame, { hoverMode: 'fot' })[0], 'img/509FOT.png');

  const noArt = { ...highlandGame, artId: null };
  assert.deepEqual(hoverImageSources(noArt, { hoverMode: 'fot' }), scryfall);

  const withArt = { ...highlandGame, artId: 77 };
  assert.deepEqual(hoverImageSources(withArt, { hoverMode: 'fot' })[0], 'img/77FOT.png');
  assert.deepEqual(hoverImageSources(withArt, { hoverMode: 'kon' })[0], 'img/77KON.png');
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
