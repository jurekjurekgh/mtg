// Audyt PR #158 (sesja 2026-10-08c), znalezisko F-1 — STRAŻ KATALOGOWA.
//
// `test/audyt-pr158-kopiowalny-zakaz-blokowania.test.js` pinuje ścieżki
// kopiowania na kartach podanych wprost. Ten plik dokłada warstwę nad katalogiem
// (L52: „nowa karta nie może po cichu ominąć ścieżki"): gdy właściciel doda kartę
// niosącą zakaz blokowania, KAŻDA dostępna dla niej ścieżka kopiowania ma być
// sprawdzona z tą właśnie kartą, a nie z obiektem syntetycznym.
//
// **Korekta F-8 (uwaga właściciela 2026-10-08):** pierwsza wersja tej straży
// brała wyłącznie karty z `cantBlock: true` W DEFINICJI (dziś: Bog Hoodlums) i
// przez to twierdziła, że „jedyny nośnik" w katalogu to jedna karta. Nośników
// jest więcej — zakaz blokowania przychodzi TRZEMA kształtami danych:
//
//   1. druk na karcie          → `def.cantBlock` (Bog Hoodlums),
//   2. stała cecha TOKENU      → `create_token` z `cantBlock: true`
//                                (Goblin Construct z Relic Robber, Phyrexian
//                                Mite z Crawling Chorus),
//   3. zakaz z ZAŁĄCZNIKA      → `aura.cantBlock` (Clawing Torment, Hobble
//                                warunkowo kolorem, Bonds of Faith warunkowo
//                                podtypem) — to efekt, nie druk, więc NIE jest
//                                wartością kopiowalną (CR 707.2: „Other effects
//                                […] are not copied") i ścieżek kopiowania nie
//                                dotyczy; pilnuje go `attachmentRestrictions`
//                                (Batch 48) i `entry.cantBlock` w PlayerView.
//
// Straż poniżej wylicza kształty 1 i 2. Trzeci ma osobny pin (F-1/S8).
//
// Podstawa regułowa (dosłowny tekst, CR effective 2026-09-25, mirror
// nwgarne/mtg-data `rules/cr-raw.txt`, SHA-256 8d860e45…; ADR 0030):
//
//  • CR 707.2: „The copiable values are the values derived from the text printed
//    on the object (that text being name, mana cost, color indicator, card type,
//    subtype, supertype, rules text, power, toughness, and/or loyalty) […].
//    Other effects (including type-changing and text-changing effects), status,
//    counters, and stickers are not copied."
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
import { attachAuraToCreature } from '../src/engine/attachments.js';
import { applyEffect } from '../src/engine/effects.js';

const registry = createCardRegistry();
const KORZEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Efekty karty (pojedynczy albo lista) — definicje trzymają obie formy. */
function efektyZdolnosci(def) {
  const out = [];
  for (const a of def.abilities ?? []) {
    const effs = Array.isArray(a.effect) ? a.effect : [a.effect];
    for (const e of effs) if (e) out.push(e);
    // efekty zagnieżdżone (np. wybór trybu) — płytki przegląd, resztę łapie S7
    if (a.effect && typeof a.effect === 'object') {
      for (const v of Object.values(a.effect)) {
        if (Array.isArray(v)) for (const e of v) if (e && typeof e === 'object') out.push(e);
      }
    }
  }
  return out;
}

/** Kształt 1: wydrukowany zakaz blokowania na samej karcie. */
const kartyZDrukowanymZakazem = () => registry.all()
  .filter((d) => d.cantBlock === true);

/** Kształt 2: karta tworzy token, którego STAŁĄ cechą jest zakaz blokowania. */
const kartyZTokenemZakazu = () => registry.all()
  .filter((d) => efektyZdolnosci(d).some((e) => e.type === 'create_token' && e.cantBlock === true));

/** Konfigi tokenów z zakazem (do odtworzenia tokenu bez odpalania triggerów). */
function konfigiTokenowZakazu(def) {
  return efektyZdolnosci(def)
    .filter((e) => e.type === 'create_token' && e.cantBlock === true);
}

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
  for (const def of kartyZDrukowanymZakazem()) {
    const s = state();
    const o = put(s, 'x', def.id);
    assert.equal(o.cantBlockPrinted, true, `${def.id}: cantBlockPrinted na obiekcie`);
    assert.equal(creatureCantBlock(o, s), true, `${def.id}: CR 509.1b`);
    // PlayerView (ADR 0003/0017): bot czyta ograniczenie z WIDOKU, nie z druku —
    // `entry.cantBlock` stawia `creatureCantBlock(object, state)` (game-state.js:
    // 6775) razem z zakazem z załącznika (Batch 48). Surowe pole `cantBlock` na
    // obiekcie zostaje `false`: przy druku nośnikiem jest `cantBlockPrinted`,
    // a `cantBlock` stawiają tokeny i efekty/załączniki.
    assert.equal(o.cantBlock, false, `${def.id}: druk nie nadpisuje pola efektów`);
    const wpis = playerView(s, 'p1').zones.battlefield.find((e) => e.id === 'x');
    assert.equal(wpis.cantBlock, true, `${def.id}: entry.cantBlock w PlayerView`);
  }
});

test('F-1/S2: enter as a copy — każda karta z drukowanym zakazem daje kopię, która nie blokuje', () => {
  for (const def of kartyZDrukowanymZakazem()) {
    const s = state();
    put(s, 'shape', 'jwari-shapeshifter');
    put(s, 'wzor', def.id);
    replaceObject(s, s.objects.get('shape'), { enteringAsCopy: true });
    s.pendingEnterAsCopy = { playerId: 'p1', sourceId: 'shape', candidateIds: ['wzor'], restorePriorityTo: null };
    const cmd = playerView(s, 'p1').legalCommands
      .find((c) => c.type === 'resolve_enter_as_copy' && c.targetId === 'wzor');
    assert.ok(cmd, `${def.id}: kopia oferowana`);
    assert.ok(execute(s, cmd).ok, `${def.id}: komenda przyjęta (L68)`);
    const copy = s.objects.get('shape');
    assert.equal(copy.cantBlockPrinted, true, `${def.id}: kopiowalny druk (CR 707.2)`);
    assert.equal(creatureCantBlock(copy, s), true, `${def.id}: kopia nie blokuje (CR 509.1b)`);
  }
});

test('F-1/S3: offspring — token-kopia 1/1 karty z drukowanym zakazem nie blokuje', () => {
  for (const def of kartyZDrukowanymZakazem()) {
    const s = state();
    put(s, 'wzor', def.id, { extra: { offspring: { cost: 2, colors: [] } } });
    const before = new Set(s.objects.keys());
    applyEffect(s, { type: 'create_offspring_token' }, s.objects.get('wzor'), []);
    const token = nowi(s, before)[0];
    assert.ok(token, `${def.id}: token powstał`);
    assert.equal(token.power, 1, `${def.id}: offspring jest zawsze 1/1 (CR 702.175a)`);
    assert.equal(token.cantBlockPrinted, true, `${def.id}: dziedziczy druk (CR 707.2)`);
    assert.equal(creatureCantBlock(token, s), true);
  }
});

test('F-1/S4: embalm — token-kopia karty z drukowanym zakazem nie blokuje', () => {
  for (const def of kartyZDrukowanymZakazem()) {
    const s = state();
    const wGrobie = put(s, 'wzor', def.id, { zone: 'exile' });
    const before = new Set(s.objects.keys());
    applyEffect(s, { type: 'create_token_copy_of_source', colors: ['W'], addSubtypes: ['Zombie'] }, wGrobie, []);
    const token = nowi(s, before)[0];
    assert.ok(token, `${def.id}: token powstał`);
    assert.equal(token.cantBlockPrinted, true, `${def.id}: dziedziczy druk (CR 702.128a + 707.2)`);
    assert.equal(creatureCantBlock(token, s), true);
  }
});

test('F-1/S5: Moonlit Meditation — token-kopia permanentu z drukowanym zakazem nie blokuje', () => {
  for (const def of kartyZDrukowanymZakazem()) {
    const s = state();
    put(s, 'wzor', def.id);
    s.pendingMoonlitChoice = {
      playerId: 'p1', enchantedId: 'wzor', effect: { amount: 1 },
      sourceObjectId: 'moon', targets: [], restorePriorityTo: null,
    };
    const before = new Set(s.objects.keys());
    assert.ok(execute(s, { type: 'resolve_moonlit_choice', playerId: 'p1', replace: true }).ok,
      `${def.id}: komenda przyjęta (L68)`);
    const token = nowi(s, before)[0];
    assert.ok(token, `${def.id}: token-kopia powstała`);
    assert.equal(token.cantBlockPrinted, true, `${def.id}: dziedziczy druk (CR 707.2)`);
    assert.equal(creatureCantBlock(token, s), true);
  }
});

test('F-1/S6: create_copy_token — token-kopia z drukowanym zakazem nie blokuje (sztuczna karta)', () => {
  // Katalog nie ma artefaktu z drukowanym zakazem blokowania; ADR 0029 zabrania
  // dodawać kart z własnej głowy, więc ścieżkę pilnuje test jednostkowy
  // (F-1/6) na obiekcie podanym wprost. Tu tylko pin, że gdy taki nośnik
  // kiedyś wejdzie do katalogu, straż katalogowa go obejmie.
  const sztuczne = kartyZDrukowanymZakazem()
    .filter((d) => (d.types ?? []).includes('Artifact'));
  for (const def of sztuczne) {
    const s = state();
    put(s, 'wzor', def.id);
    const before = new Set(s.objects.keys());
    applyEffect(s, { type: 'create_copy_token' },
      { id: 'assembler', cardId: 'cogwork-assembler', controllerId: 'p1' }, ['wzor']);
    const token = nowi(s, before)[0];
    assert.equal(token.cantBlockPrinted, true, `${def.id}: dziedziczy druk (CR 707.2)`);
  }
  assert.ok(true, 'brak artefaktu z drukowanym zakazem w katalogu — pin pusty (OK)');
});

// F-8: tokeny ze STAŁYM zakazem blokowania (kształt 2). Tworzy je
// `createBattlefieldToken`, który z `cantBlock: true` stawia OBA pola
// (`tokens.js:225` — CR 514.2: znacznik kopii nie zdejmuje druku).
test('F-1/S7: tokeny z wydrukowanym zakazem — każda taka karta w katalogu działa', () => {
  const nośniki = kartyZTokenemZakazu();
  assert.ok(nośniki.length >= 1,
    'oczekiwano co najmniej jednego nośnika tokenu z zakazem blokowania '
    + '(Relic Robber / Crawling Chorus) — straż wymaga przeglądu');
  for (const def of nośniki) {
    for (const cfg of konfigiTokenowZakazu(def)) {
      const s = state();
      const before = new Set(s.objects.keys());
      applyEffect(s, cfg, { id: 'zrodlo', cardId: def.id, controllerId: 'p1' }, []);
      const token = nowi(s, before)[0];
      assert.ok(token, `${def.id}/${cfg.name}: token powstał`);
      assert.equal(token.cantBlockPrinted, true,
        `${def.id}/${cfg.name}: stała cecha tokenu (tokens.js:225)`);
      assert.equal(token.cantBlock, true, `${def.id}/${cfg.name}: pole efektu`);
      assert.equal(creatureCantBlock(token, s), true, `${def.id}/${cfg.name}: CR 509.1b`);
      const wpis = playerView(s, 'p1').zones.battlefield.find((e) => e.id === token.id);
      assert.equal(wpis.cantBlock, true, `${def.id}/${cfg.name}: widoczne w PlayerView`);
    }
  }
});

// F-8: token z zakazem jako PIERWOWZÓR kopii — tu F-1 naprawdę się liczy, bo
// Phyrexian Mite jest artefaktem (Moonlit Meditation: „enchant artifact or
// creature"), więc ścieżka token-kopii jest dla niego OSIĄGALNA już dziś.
test('F-1/S8: token z drukowanym zakazem jako pierwowzór token-kopii (Moonlit)', () => {
  for (const def of kartyZTokenemZakazu()) {
    for (const cfg of konfigiTokenowZakazu(def)) {
      const s = state();
      const before = new Set(s.objects.keys());
      applyEffect(s, cfg, { id: 'zrodlo', cardId: def.id, controllerId: 'p1' }, []);
      const token = nowi(s, before)[0];
      assert.ok(token, `${def.id}/${cfg.name}: token powstał`);
      s.pendingMoonlitChoice = {
        playerId: 'p1', enchantedId: token.id, effect: { amount: 1 },
        sourceObjectId: 'moon', targets: [], restorePriorityTo: null,
      };
      const przed = new Set(s.objects.keys());
      assert.ok(execute(s, { type: 'resolve_moonlit_choice', playerId: 'p1', replace: true }).ok,
        `${def.id}/${cfg.name}: komenda przyjęta (L68)`);
      const kopia = nowi(s, przed)[0];
      assert.ok(kopia, `${def.id}/${cfg.name}: token-kopia powstała`);
      assert.equal(kopia.cantBlockPrinted, true,
        `${def.id}/${cfg.name}: kopia tokenu niesie jego druk (CR 707.2 + 707.2a)`);
      assert.equal(creatureCantBlock(kopia, s), true, `${def.id}/${cfg.name}: CR 509.1b`);
    }
  }
});

// F-8: trzeci kształt — zakaz z ZAŁĄCZNIKA. To efekt, nie druk, więc NIE jest
// wartością kopiowalną (CR 707.2: „Other effects […] are not copied"): kopia
// permanentu z aurą Hobble/Clawing Torment/Bonds of Faith blokuje normalnie,
// a sam gospodarz nie. W odróżnieniu od pierwotnego S9 fixture używa deskryptora
// karty i prawdziwego attachAuraToCreature/attachedTo; każda iteracja asertuje.
test('F-1/S9: zakaz z załącznika nie jest kopiowalny — wszystkie cztery aury są przypięte', () => {
  const aury = registry.all().filter((d) => d.aura && d.aura.cantBlock !== undefined
    && d.aura.cantBlock !== false);
  assert.deepEqual(aury.map((d) => d.id).sort(),
    ['bonds-of-faith', 'clawing-torment', 'hobble', 'pacifism'],
    'pokrycie katalogu: Hobble, Clawing Torment, Bonds of Faith i Pacifism');
  for (const aura of aury) {
    const s = state();
    const host = put(s, 'host', 'rotting-legion'); // czarny, nie-Human — spełnia wszystkie trzy warunki
    const auraObject = put(s, 'aura', aura.id);
    assert.deepEqual(auraObject.aura, aura.aura, `${aura.id}: fixture niesie deskryptor aury`);
    const attached = attachAuraToCreature(s, 'aura', 'host');
    assert.equal(attached.attachedTo, 'host', `${aura.id}: aura faktycznie przypięta`);

    const wpis = playerView(s, 'p1').zones.battlefield.find((e) => e.id === 'host');
    assert.equal(host.cantBlockPrinted, false, `${aura.id}: host nie ma druku`);
    assert.equal(creatureCantBlock(host, s), false, `${aura.id}: restrykcja aury nie jest raw cantBlock`);
    assert.equal(wpis?.cantBlock, true, `${aura.id}: zakaz działa na hosta w PlayerView`);

    // Kopia tego permanentu (Moonlit) nie dziedziczy efektu aury.
    s.pendingMoonlitChoice = {
      playerId: 'p1', enchantedId: 'host', effect: { amount: 1 },
      sourceObjectId: 'moon', targets: [], restorePriorityTo: null,
    };
    const przed = new Set(s.objects.keys());
    assert.ok(execute(s, { type: 'resolve_moonlit_choice', playerId: 'p1', replace: true }).ok,
      `${aura.id}: token-kopia przyjęta`);
    const kopia = nowi(s, przed)[0];
    assert.ok(kopia, `${aura.id}: token-kopia powstała`);
    assert.equal(kopia.cantBlockPrinted, false,
      `${aura.id}: kopia nie dziedziczy efektu załącznika (CR 707.2)`);
    assert.equal(creatureCantBlock(kopia, s), false,
      `${aura.id}: token-kopia nie dziedziczy restrykcji gospodarza`);
    const wpisKopii = playerView(s, 'p1').zones.battlefield.find((e) => e.id === kopia.id);
    assert.notEqual(wpisKopii?.cantBlock, true, `${aura.id}: PlayerView kopii bez restrykcji`);
  }
});

// Straż „nowa ścieżka": token-kopie buduje wyłącznie `createBattlefieldToken`
// w `effects.js`/`game-state.js`. Każde takie wywołanie, które JEST kopiowaniem
// (znacznik: `nextCopyNumber(` | `'token_clone'` | `copyManaValueOf(`), musi
// nieść klucz `cantBlock:` — inaczej kolejna kopiowalna cecha zginie po cichu
// tak, jak `entersTapped` (F3), `station`/`saga` (M141-B) i `cantBlockPrinted`
// (F-1).
test('F-1/S10: straż źródła — każda ścieżka token-kopii przenosi `cantBlock`', () => {
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
      const znacznik = blok.includes('nextCopyNumber(')
        || blok.includes("'token_clone'")
        || blok.includes('copyManaValueOf(');
      if (!znacznik) continue;
      sprawdzono += 1;
      // Sprawdzamy KLUCZ (`cantBlock:`), nie sam podłańcuch `cantBlock`: warunek
      // `...(x.cantBlockPrinted ? { … } : {})` sam zawiera `cantBlockPrinted` i
      // słabszy test przeszedłby przy usuniętym kluczu (mutacja mF5 — zielono
      // mimo braku cechy na tokenie).
      assert.ok(blok.includes('cantBlock:'),
        `${plik}: ścieżka token-kopii (createBattlefieldToken + nextCopyNumber) nie przenosi `
        + `kopiowalnego klucza ${ZNAK}cantBlock:${ZNAK} — por. CR 707.2/707.2a `
        + `i znalezisko F-1 audytu PR #158`);
    }
  }
  assert.ok(sprawdzono >= 4,
    `oczekiwano co najmniej 4 ścieżek token-kopii, znaleziono ${sprawdzono} — straż wymaga przeglądu`);
});
