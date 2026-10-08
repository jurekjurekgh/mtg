// Audyt PR #158 (sesja 2026-10-08c), znalezisko F-1 — STRAŻ KATALOGOWA.
//
// `test/audyt-pr158-kopiowalny-zakaz-blokowania.test.js` pinuje pięć ścieżek
// kopiowania na kartach podanych wprost. Ten plik dokłada warstwę nad katalogiem
// (L52: „nowa karta nie może po cichu ominąć ścieżki"): gdy właściciel doda kartę
// z wydrukowanym zakazem blokowania (`cantBlock` w definicji → Bog Hoodlums dziś),
// KAŻDA dostępna dla niej ścieżka kopiowania ma być sprawdzona z tą właśnie
// kartą, a nie z obiektem syntetycznym.
//
// Podstawa regułowa (dosłowny tekst, CR effective 2026-09-25, mirror
// nwgarne/mtg-data `rules/cr-raw.txt`, SHA-256 8d860e45…; ADR 0030):
//
//  • CR 707.2: „The copiable values are the values derived from the text printed
//    on the object (that text being name, mana cost, color indicator, card type,
//    subtype, supertype, rules text, power, toughness, and/or loyalty) […]."
//  • CR 707.2a: „A copy acquires the abilities of the object it's copying because
//    those values are derived from its rules text."
//  • CR 509.1b: „[…] effects that say a creature can't block, or that it can't
//    block unless some condition is met). If any restrictions are being
//    disobeyed, the declaration of blockers is illegal."
//  • CR 702.175a (Offspring): „[…] create a token that's a copy of it, except
//    it's 1/1."
//  • CR 702.128a (Embalm): „Create a token that's a copy of this card, except
//    it's white, it has no mana cost, and it's a Zombie in addition to its other
//    types."
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { replaceObject, creatureCantBlock } from '../src/engine/permanents.js';
import { applyEffect } from '../src/engine/effects.js';

const registry = createCardRegistry();

// Karty z WYDRUKOWANYM zakazem blokowania (nie „can't block unless …", nie
// efekt do EOT) — dziś dokładnie jedna: Bog Hoodlums (batch 64, PR #158).
const kartyZDrukowanymZakazem = () => registry.all()
  .filter((d) => d.cantBlock === true)
  .map((d) => d.id);

const KORZEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function put(s, id, cardId, { zone = 'battlefield', controllerId = 'p1', extra = {} } = {}) {
  const d = registry.get(cardId);
  assert.ok(d, `karta ${cardId} istnieje w rejestrze`);
  addObject(s, {
    ...gameObjectDataOf(d),
    types: d.types, keywords: d.keywords, subtypes: d.subtypes ?? [],
    id, instanceId: `i-${id}`, cardId, ownerId: controllerId, controllerId, zone,
    ...extra,
  });
  return s.objects.get(id);
}

function state() {
  const s = createGameState({ seed: 158, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  return s;
}

const nowi = (s, before) => [...s.objects.values()]
  .filter((o) => !before.has(o.id) && o.zone === 'battlefield');

// Kontrola spójności katalogu z silnikiem (L21): wydruk musi dotrzeć na obiekt —
// bez tego reszta straży mierzyłaby brak danych wejściowych, a nie kopiowanie.
test('F-1/S1: druk `cantBlock` z definicji karty ląduje na obiekcie', () => {
  for (const cardId of kartyZDrukowanymZakazem()) {
    const s = state();
    const o = put(s, 'x', cardId);
    assert.equal(o.cantBlockPrinted, true, `${cardId}: cantBlockPrinted na obiekcie`);
    assert.equal(creatureCantBlock(o, s), true, `${cardId}: CR 509.1b`);
    // PlayerView (ADR 0003/0017): bot czyta ograniczenie z WIDOKU, nie z druku —
    // `entry.cantBlock` stawia `creatureCantBlock(object, state)` (game-state.js:
    // 6775) razem z zakazem z załącznika (Batch 48). Surowe pole `cantBlock` na
    // obiekcie zostaje `false`: przy druku nośnikiem jest `cantBlockPrinted`,
    // a `cantBlock` stawiają tokeny i efekty/załączniki.
    assert.equal(o.cantBlock, false, `${cardId}: druk nie nadpisuje pola efektów`);
    const wpis = playerView(s, 'p1').zones.battlefield.find((e) => e.id === 'x');
    assert.equal(wpis.cantBlock, true, `${cardId}: entry.cantBlock w PlayerView`);
  }
});

test('F-1/S2: enter as a copy — każda karta z drukowanym zakazem daje kopię, która nie blokuje', () => {
  for (const cardId of kartyZDrukowanymZakazem()) {
    const s = state();
    put(s, 'shape', 'jwari-shapeshifter');
    put(s, 'wzor', cardId);
    replaceObject(s, s.objects.get('shape'), { enteringAsCopy: true });
    s.pendingEnterAsCopy = { playerId: 'p1', sourceId: 'shape', candidateIds: ['wzor'], restorePriorityTo: null };
    const cmd = playerView(s, 'p1').legalCommands
      .find((c) => c.type === 'resolve_enter_as_copy' && c.targetId === 'wzor');
    assert.ok(cmd, `${cardId}: kopia oferowana`);
    assert.ok(execute(s, cmd).ok, `${cardId}: komenda przyjęta (L68)`);
    const copy = s.objects.get('shape');
    assert.equal(copy.cantBlockPrinted, true, `${cardId}: kopiowalny druk (CR 707.2)`);
    assert.equal(creatureCantBlock(copy, s), true, `${cardId}: kopia nie blokuje (CR 509.1b)`);
  }
});

test('F-1/S3: offspring — token-kopia 1/1 karty z drukowanym zakazem nie blokuje', () => {
  for (const cardId of kartyZDrukowanymZakazem()) {
    const s = state();
    put(s, 'wzor', cardId, { extra: { offspring: { cost: 2, colors: [] } } });
    const before = new Set(s.objects.keys());
    applyEffect(s, { type: 'create_offspring_token' }, s.objects.get('wzor'), []);
    const token = nowi(s, before)[0];
    assert.ok(token, `${cardId}: token powstał`);
    assert.equal(token.power, 1, `${cardId}: offspring jest zawsze 1/1 (CR 702.175a)`);
    assert.equal(token.cantBlockPrinted, true, `${cardId}: dziedziczy druk (CR 707.2)`);
    assert.equal(creatureCantBlock(token, s), true);
  }
});

test('F-1/S4: embalm — token-kopia karty z drukowanym zakazem nie blokuje', () => {
  for (const cardId of kartyZDrukowanymZakazem()) {
    const s = state();
    const wGrobie = put(s, 'wzor', cardId, { zone: 'exile' });
    const before = new Set(s.objects.keys());
    applyEffect(s, { type: 'create_token_copy_of_source', colors: ['W'], addSubtypes: ['Zombie'] }, wGrobie, []);
    const token = nowi(s, before)[0];
    assert.ok(token, `${cardId}: token powstał`);
    assert.equal(token.cantBlockPrinted, true, `${cardId}: dziedziczy druk (CR 702.128a + 707.2)`);
    assert.equal(creatureCantBlock(token, s), true);
  }
});

test('F-1/S5: Moonlit Meditation — token-kopia permanentu z drukowanym zakazem nie blokuje', () => {
  for (const cardId of kartyZDrukowanymZakazem()) {
    const s = state();
    put(s, 'wzor', cardId);
    s.pendingMoonlitChoice = {
      playerId: 'p1', enchantedId: 'wzor', effect: { amount: 1 },
      sourceObjectId: 'moon', targets: [], restorePriorityTo: null,
    };
    const before = new Set(s.objects.keys());
    assert.ok(execute(s, { type: 'resolve_moonlit_choice', playerId: 'p1', replace: true }).ok,
      `${cardId}: komenda przyjęta (L68)`);
    const token = nowi(s, before)[0];
    assert.ok(token, `${cardId}: token-kopia powstała`);
    assert.equal(token.cantBlockPrinted, true, `${cardId}: dziedziczy druk (CR 707.2)`);
    assert.equal(creatureCantBlock(token, s), true);
  }
});

test('F-1/S6: create_copy_token — token-kopia z drukowanym zakazem nie blokuje (sztuczna karta)', () => {
  // Katalog nie ma artefaktu z drukowanym zakazem blokowania; ADR 0029 zabrania
  // dodawać kart z własnej głowy, więc ścieżkę pilnuje test jednostkowy
  // (F-1/6) na obiekcie podanym wprost. Tu tylko pin, że gdy taki nośnik
  // kiedyś wejdzie do katalogu, straż katalogowa go obejmie.
  const sztuczne = kartyZDrukowanymZakazem().filter((id) => registry.get(id).types?.includes('Artifact'));
  for (const cardId of sztuczne) {
    const s = state();
    put(s, 'wzor', cardId);
    const before = new Set(s.objects.keys());
    applyEffect(s, { type: 'create_copy_token' },
      { id: 'assembler', cardId: 'cogwork-assembler', controllerId: 'p1' }, ['wzor']);
    const token = nowi(s, before)[0];
    assert.equal(token.cantBlockPrinted, true, `${cardId}: dziedziczy druk (CR 707.2)`);
  }
  assert.ok(true, 'brak artefaktu z drukowanym zakazem w katalogu — pin pusty (OK)');
});

// Straż „nowa ścieżka": token-kopie buduje wyłącznie `createBattlefieldToken`
// w `effects.js`/`game-state.js`. Każde takie wywołanie, które JEST kopiowaniem
// (niesie `nextCopyNumber`), musi nieść `cantBlock` — inaczej kolejna kopiowalna
// cecha zginie po cichu tak, jak `entersTapped` (F3), `station`/`saga`
// (M141-B) i `cantBlockPrinted` (F-1).
test('F-1/S7: straż źródła — każda ścieżka token-kopii przenosi `cantBlock`', () => {
  const pliki = ['src/engine/effects.js', 'src/engine/game-state.js'];
  const ZNAK = '`';
  const otwierajace = /^.*createBattlefieldToken\(.*$/gm;
  let sprawdzono = 0;
  for (const plik of pliki) {
    const src = fs.readFileSync(path.join(KORZEN, plik), 'utf8');
    for (let m = otwierajace.exec(src); m; m = otwierajace.exec(src)) {
      // Blok = argumenty wywołania: od `(` po domykający `)` na tym samym
      // poziomie nawiasów (skaner pomija nawiasy w łańcuchach i komentarzach —
      // w środku siedzą callbacki `.filter(a => …)` z własnymi nawiasami).
      const poczatek = m.index + m[0].indexOf('createBattlefieldToken(') + 'createBattlefieldToken'.length;
      let glebia = 0;
      let koniec = -1;
      let i = poczatek;
      let tryb = null;                       // null | "'" | '"' | '`' | '//' | '/*'
      while (i < src.length) {
        const z = src[i];
        const dwa = src.slice(i, i + 2);
        if (tryb === '//') { if (z === '\n') tryb = null; i += 1; continue; }
        if (tryb === '/*') { if (dwa === '*/') { tryb = null; i += 2; continue; } i += 1; continue; }
        if (tryb) {
          if (z === '\\') { i += 2; continue; }
          if (z === tryb) tryb = null;
          i += 1; continue;
        }
        if (dwa === '//') { tryb = '//'; i += 2; continue; }
        if (dwa === '/*') { tryb = '/*'; i += 2; continue; }
        if (z === "'" || z === '"' || z === '`') { tryb = z; i += 1; continue; }
        if (z === '(') glebia += 1;
        else if (z === ')') { glebia -= 1; if (glebia === 0) { koniec = i + 1; break; } }
        i += 1;
      }
      assert.ok(koniec > 0, `${plik}: nie znaleziono końca wywołania createBattlefieldToken`);
      const blok = src.slice(poczatek, koniec);
      // Kopiowanie poznajemy po znacznikach kopiowalnych cech: `nextCopyNumber`
      // (numerowana kopia), `cardId: 'token_clone'` (token-kopia Moonlit) albo
      // `copyManaValueOf` (MV dziedziczone z pierwowzoru, CR 202.3b). Zwykłe
      // tokeny (Skarb, Zombie, 1/1 bez pierwowzoru) ich nie mają — nie
      // dziedziczą druku i `cantBlock` ich nie dotyczy.
      const znacznik = blok.includes('nextCopyNumber(')
        || blok.includes("'token_clone'")
        || blok.includes('copyManaValueOf(');
      if (!znacznik) continue;
      sprawdzono += 1;
      assert.ok(blok.includes('cantBlock'),
        `${plik}: ścieżka token-kopii (createBattlefieldToken + nextCopyNumber) nie przenosi `
        + `kopiowalnego ${ZNAK}cantBlock${ZNAK} — por. CR 707.2/707.2a `
        + `i znalezisko F-1 audytu PR #158`);
    }
  }
  // Dziś: create_copy_token, create_offspring_token, create_token_copy_of_source
  // (effects.js) + token-kopia Moonlit (game-state.js). Jeśli liczba spadnie —
  // ścieżka zniknęła albo zmieniła kształt i straż przestała mierzyć.
  assert.ok(sprawdzono >= 4,
    `oczekiwano co najmniej 4 ścieżek token-kopii, znaleziono ${sprawdzono} — straż wymaga przeglądu`);
});
