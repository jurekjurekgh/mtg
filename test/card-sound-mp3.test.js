import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cardSoundUrls, createCardSoundPlayer } from '../src/table/card-sound-player.js';
import { playCastSound } from '../src/table/spell-sounds.js';
import { createArtShowcaseQueue } from '../src/table/art-showcase.js';

const card = { id: 'not-the-filename', artId: 422, types: ['Sorcery'], colors: ['R'] };
function deferred() {
  let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
class Media {
  constructor(action) { this.action = action; this.listeners = new Map(); this.src = ''; this.paused = true; this.pauseCount = 0; }
  addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  emit(name) { for (const fn of [...(this.listeners.get(name) ?? [])]) fn(); }
  play() { this.paused = false; return this.action(this); }
  pause() { this.paused = true; this.pauseCount++; }
  load() {}
  removeAttribute(name) { if (name === 'src') this.src = ''; }
  listenerCount() { return [...this.listeners.values()].reduce((n, s) => n + s.size, 0); }
}
function setup(action = () => Promise.resolve(), options = {}) {
  const sounds = []; const media = [];
  const synth = { enabled: false, setEnabled(v) { this.enabled = !!v; }, resume: () => true,
    play(key) { if (!this.enabled) return 'disabled'; sounds.push(key); return 'played'; } };
  // Domyślnie `baseUrl: ''` = jedna ścieżka względna (1 próba) — testy
  // zachowań nie zależą od liczby lokalizacji. Testy ścieżek podają własny.
  const player = createCardSoundPlayer({ syntheticPlayer: synth, baseUrl: '',
    createAudio: () => { const a = new Media(action); media.push(a); return a; }, timeoutMs: 50, ...options });
  player.setEnabled(true);
  return { player, sounds, media, synth };
}
const missing = () => Promise.reject(new DOMException('Missing or unsupported media', 'NotSupportedError'));
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

test('B/ścieżki: numer kolekcji, nie slug ani numer Scryfall; względny przed absolutnym', () => {
  assert.deepEqual(cardSoundUrls(card.artId, 'https://test.invalid/mtg/index.html?seed=2'),
    ['snd/422.mp3', 'https://test.invalid/mtg/snd/422.mp3']);
  assert.deepEqual(cardSoundUrls('12', 'https://test.invalid/mtg/'),
    ['snd/12.mp3', 'https://test.invalid/mtg/snd/12.mp3']);
});

test('B/ścieżki: dist — względny obok artefaktu, rodzic (repo) i oba absolutne', () => {
  assert.deepEqual(cardSoundUrls(12, 'https://test.invalid/mtg/dist/mtg-table.html'), [
    '../snd/12.mp3', 'snd/12.mp3',
    'https://test.invalid/mtg/snd/12.mp3', 'https://test.invalid/mtg/dist/snd/12.mp3',
  ]);
  assert.deepEqual(cardSoundUrls(12, 'file:///kolekcja/dist/mtg-table.html'), [
    '../snd/12.mp3', 'snd/12.mp3',
    'file:///kolekcja/snd/12.mp3', 'file:///kolekcja/dist/snd/12.mp3',
  ]);
});

test('B/ścieżki: file: poza dist i błędny URL — zawsze ścieżka względna', () => {
  assert.deepEqual(cardSoundUrls(12, 'file:///kolekcja/stol.html'),
    ['snd/12.mp3', 'file:///kolekcja/snd/12.mp3']);
  // Zgłoszenie właściciela 2026-09-28b: przy złym/nieznanym URL-u ścieżka
  // względna zostaje — przeglądarka rozwiąże ją wobec dokumentu.
  assert.deepEqual(cardSoundUrls(12, 'ftp://dysk/snd/'), ['snd/12.mp3']);
  assert.deepEqual(cardSoundUrls(12, 'to-nie-jest-url'), ['snd/12.mp3']);
});

test('B/ścieżki: brak/niepoprawny artId nie staje się dowolnym URL-em', () => {
  for (const id of [null, undefined, '', 0, -1, 1.5, Infinity, '../secret', '12.mp3', 'https://x', '1e2']) {
    assert.deepEqual(cardSoundUrls(id, 'https://test.invalid/mtg/'), []);
  }
});

test('B/fasada: przekazuje pełną kartę adapterowi MP3, zachowuje starszego gracza', async () => {
  const seen = [];
  const player = { playCard: async (c) => { seen.push(c); return 'played-file'; }, play: () => assert.fail('nie omijaj MP3') };
  assert.equal(await playCastSound({ player, card }), 'played-file');
  assert.deepEqual(seen, [card]);
  const legacy = { play: (key) => key };
  assert.equal(playCastSound({ player: legacy, card }), 'sorcery:R');
  assert.equal(playCastSound({ player, card: null }), 'no-card');
});

test('B/sukces: dostępny MP3 jest jedynym dźwiękiem', async () => {
  const { player, media, sounds } = setup();
  assert.equal(await player.playCard(card), 'played-file');
  assert.equal(media.length, 1); assert.ok(media[0].src.endsWith('snd/422.mp3'), media[0].src);
  assert.deepEqual(sounds, []);
  media[0].emit('ended'); assert.equal(media[0].listenerCount(), 0);
});

test('B/404: synteza dokładnie raz, zachowuje typ i kolor', async () => {
  const attempts = [];
  const { player, media, sounds } = setup((a) => { attempts.push(a.src); return missing(); },
    { baseUrl: 'https://test.invalid/mtg/index.html' });
  assert.equal(await player.playCard(card), 'played');
  assert.equal(media.length, 2);
  // `silence()` czyści `src` po nieudanej próbie — mierzymy adresy w play().
  assert.deepEqual(attempts, ['snd/422.mp3', 'https://test.invalid/mtg/snd/422.mp3']);
  assert.deepEqual(sounds, ['sorcery:R']);
  assert.ok(media[0].paused); assert.equal(media[0].listenerCount(), 0);
});

test('B/dist: względny obok artefaktu trafia bez syntezy', async () => {
  const attempts = [];
  const { player, media, sounds } = setup((a) => { attempts.push(a.src); return a.src.endsWith('/snd/12.mp3') && !a.src.endsWith('dist/snd/12.mp3') ? missing() : Promise.resolve(); },
    { baseUrl: 'file:///kolekcja/dist/mtg-table.html' });
  assert.equal(await player.playCard({ ...card, artId: 12 }), 'played-file');
  // Pierwsza próba (`../snd`) pada, druga (`snd/12.mp3`) trafia — zanim
  // dojdzie do adresów absolutnych (Chrome/Safari blokuje file:///).
  assert.deepEqual(attempts, ['../snd/12.mp3', 'snd/12.mp3']);
  assert.deepEqual(sounds, []); assert.equal(media.length, 2);
});

test('B/brak wszystkich lokalizacji dist: 4 próby i jeden fallback', async () => {
  const attempts = [];
  const { player, media, sounds } = setup((a) => { attempts.push(a.src); return missing(); },
    { baseUrl: 'https://test.invalid/mtg/dist/mtg-table.html' });
  assert.equal(await player.playCard(card), 'played'); assert.equal(media.length, 4);
  assert.deepEqual(attempts, [
    '../snd/422.mp3', 'snd/422.mp3',
    'https://test.invalid/mtg/snd/422.mp3', 'https://test.invalid/mtg/dist/snd/422.mp3',
  ]);
  assert.deepEqual(sounds, ['sorcery:R']);
});

test('B/zdarzenie error + późniejszy reject tej samej próby nie grają podwójnie', async () => {
  const d = deferred(); const { player, media, sounds } = setup(() => d.promise);
  const pending = player.playCard(card); await settle();
  assert.equal(media.length, 1); media[0].emit('error');
  d.reject(new Error('late reject'));
  assert.equal(await pending, 'played'); await settle();
  assert.deepEqual(sounds, ['sorcery:R']);
});

test('B/autoplay: NotAllowedError daje syntezę, nie myli się z brakiem pliku', async () => {
  let denied = true;
  const { player, media, sounds } = setup(() => denied ? Promise.reject(new DOMException('Gesture needed', 'NotAllowedError')) : Promise.resolve());
  assert.equal(await player.playCard(card), 'played');
  denied = false;
  assert.equal(await player.playCard(card), 'played-file', 'po kolejnym geście plik nadal dostępny');
  assert.equal(media.length, 2); assert.deepEqual(sounds, ['sorcery:R']);
});

test('B/OFF: bez mediów i dźwięku; brak artId = zwykła synteza bez żądania', async () => {
  const { player, media, sounds } = setup(); player.setEnabled(false);
  assert.equal(await player.playCard(card), 'disabled'); assert.equal(media.length, 0);
  player.setEnabled(true);
  assert.equal(await player.playCard({ types: ['Creature'], colors: ['G'] }), 'played');
  assert.deepEqual(sounds, ['creature:G']); assert.equal(media.length, 0);
});

test('B/wyciszenie podczas odczytu: brak spóźnionego MP3 i fallbacku', async () => {
  const d = deferred(); const { player, media, sounds } = setup(() => d.promise);
  const pending = player.playCard(card); await settle(); assert.equal(media.length, 1);
  player.setEnabled(false); d.resolve();
  assert.equal(await pending, 'cancelled'); await settle();
  assert.ok(media[0].paused); assert.deepEqual(sounds, []);
});

test('B/nowy rzut wygrywa z wolnym starym; późny błąd starego nie wywołuje syntezy', async () => {
  const first = deferred(); let calls = 0;
  const { player, media, sounds } = setup(() => ++calls === 1 ? first.promise : Promise.resolve());
  const old = player.playCard(card); await settle();
  assert.equal(await player.playCard({ ...card, artId: 12 }), 'played-file');
  first.reject(new Error('old request'));
  assert.equal(await old, 'cancelled'); await settle();
  assert.ok(media[0].paused); assert.deepEqual(sounds, []);
});

test('B/stop po zamknięciu warstwy/nowej partii unieważnia odczyt', async () => {
  const d = deferred(); const { player, media, sounds } = setup(() => d.promise);
  const pending = player.playCard(card); await settle(); player.stop(); d.resolve();
  assert.equal(await pending, 'cancelled'); await settle();
  assert.ok(media[0].paused); assert.deepEqual(sounds, []);
});

test('B/OFF przerywa także MP3 już grający', async () => {
  const { player, media, sounds } = setup(); await player.playCard(card);
  assert.equal(media.length, 1); player.setEnabled(false);
  assert.ok(media[0].paused); media[0].emit('error'); assert.deepEqual(sounds, []);
});

test('B/timeout ładowania: gra nie czeka bez końca, późny sukces nie dubluje dźwięku', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const d = deferred(); const { player, media, sounds } = setup(() => d.promise);
  const pending = player.playCard(card); await settle(); t.mock.timers.tick(51);
  assert.equal(await pending, 'played'); d.resolve(); await settle();
  assert.ok(media[0].paused); assert.deepEqual(sounds, ['sorcery:R']);
});

test('B/błąd już grającego pliku: pojedynczy fallback i cleanup', async () => {
  const { player, media, sounds } = setup(); await player.playCard(card);
  assert.equal(media.length, 1); media[0].emit('error'); media[0].emit('error'); await settle();
  assert.deepEqual(sounds, ['sorcery:R']); assert.ok(media[0].paused);
  assert.equal(media[0].listenerCount(), 0);
});

test('B/timeout: domyślnie 4 s — 1500 ms to już środek odczytu, nie koniec', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const d = deferred(); const { player } = setup(() => d.promise, { timeoutMs: undefined });
  const pending = player.playCard(card); await settle();
  t.mock.timers.tick(3999);
  let settled = false; pending.then(() => { settled = true; });
  await settle(); assert.equal(settled, false, 'przed 4 s gra jeszcze czeka na plik');
  t.mock.timers.tick(2);
  assert.equal(await pending, 'played');
  d.resolve(); await settle();
});

test('B/brak API lub wyjątek konstruktora: fallback nie odrzuca Promise', async () => {
  for (const createAudio of [() => null, () => { throw new Error('media unavailable'); }]) {
    const { player, sounds } = setup(undefined, { createAudio });
    assert.equal(await player.playCard(card), 'played'); assert.deepEqual(sounds, ['sorcery:R']);
  }
});

test('B/integracja: main korzysta z adaptera, a ukryty rzut nadal jest odcięty przed audio', () => {
  const main = fs.readFileSync('src/table/main.js', 'utf8');
  assert.ok(main.includes('createCardSoundPlayer('), 'adapter rzeczywiście zamontowany');
  const start = main.indexOf('function onCastShowcase('); const end = main.indexOf('function onTransformShowcase(', start);
  const onCast = main.slice(start, end);
  assert.ok(onCast.indexOf('isCastHiddenFromViewer') < onCast.indexOf('playCastSound('));
  assert.match(main.slice(main.indexOf('function closeArtShowcase()')), /castSoundPlayer\.stop\(\)/);
  assert.match(main.slice(main.indexOf('function startGame()')), /castSoundPlayer\.stop\(\)/);
});

test('B/legacy media bez Promise potwierdza odtwarzanie zdarzeniem playing', async () => {
  const { player, media, sounds } = setup(() => undefined);
  const pending = player.playCard(card); await settle();
  assert.equal(media.length, 1); media[0].emit('playing');
  assert.equal(await pending, 'played-file'); assert.deepEqual(sounds, []);
});

test('B/synchroniczny błąd play daje jeden fallback', async () => {
  const { player, sounds } = setup(() => { throw new Error('decoder failed'); });
  assert.equal(await player.playCard(card), 'played'); assert.deepEqual(sounds, ['sorcery:R']);
});


test('B/kolejka: nowa partia nie odtwarza oczekującej starej karty', () => {
  let open = true; const shown = [];
  const queue = createArtShowcaseQueue({ isOpen: () => open, open: (e) => { shown.push(e); return true; } });
  queue.push({ cardId: 'old', playerId: 'p1' });
  assert.equal(queue.pending, 1);
  queue.clear?.(); open = false;
  assert.equal(queue.pending, 0);
  assert.equal(queue.next(), false); assert.deepEqual(shown, []);
});
