// Obiekty wsparcia poza rejestrem kart: loch Undercity i znacznik Day // Night.
//
// Dlaczego ten test istnieje (pomiar 2026-09-12e, zlecenie właściciela):
//  1. Snapshot `docs/cards/scryfall-undercity-dungeon.json` był raportowany jako
//     „sierota" — plik bez karty w rejestrze. Pomiar pokazał, że to NIE jest
//     ani błąd, ani plik do skasowania: karta jest w grze (panel specjalny po
//     „Take the initiative", `src/table/render.js` → `UNDERCITY_DUNGEON.imageUri`),
//     a snapshot jest prowieniencją tego adresu (`legacy_image_uri` identyczne)
//     i JEDYNYM zapisem Oracle obu twarzy, z którego ręcznie zakodowano
//     `UNDERCITY_ROOMS` w `src/engine/effects.js`.
//  2. Przyczyna źródłowa „sieroctwa": model przeglądu zakładał, że każdy snapshot
//     odpowiada karcie Z REJESTRU, a obiekty wsparcia są eksportami tego samego
//     modułu (`card-data.js`) poza rejestrem — i nazwa pliku nie była równa id
//     obiektu (`undercity-dungeon` vs `undercity`), więc dopasowanie było
//     niemożliwe. Plik przeniesiony na `scryfall-undercity.json` (ta sama
//     konwencja co karty), a narzędzie dostało kategorię obiektów wsparcia
//     WYPROWADZONĄ z modułu gry (zero nazw wpisanych na sztywno — F7/L41).
//  3. Do rejestru kart NIE dopisujemy: `undercity` nie ma wiersza w arkuszu
//     kolekcji (`tools/collection-art-ids.csv`), a ADR 0029 mówi, że katalog
//     rośnie wyłącznie z kolekcji właściciela.
//
// Test pilnuje: wyprowadzenia listy, braku wpisu w rejestrze/arkuszu, potwierdzenia
// druku offline (set+numer z adresu panelu, UUID z `source`), zgodności Oracle
// z komnatami w silniku, odnotowania braku snapshotu dla Day // Night, braku
// sierot w `docs/cards/` oraz przypadków ujemnych (mutacja set/numer/UUID).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createCardRegistry, UNDERCITY_DUNGEON, DAY_NIGHT_TOKEN,
} from '../src/cards/card-data.js';
import { UNDERCITY_ROOMS } from '../src/engine/effects.js';
import { artIdsBySetFromRows, parseCSV } from '../tools/fetch-art-ids.mjs';
import {
  obiektyWsparcia, adresDruku, przegladObiektowWsparcia, snapshotOfPlik,
  uuidObrazuSnapshotu, sourceUuid, twarzeSnapshotu,
} from '../tools/check-card-printings.mjs';

const REGISTRY = createCardRegistry();
const ARKUSZ = artIdsBySetFromRows(parseCSV(fs.readFileSync('tools/collection-art-ids.csv', 'utf8')));
const snapshot = (id) => snapshotOfPlik(id);
const przeglad = () => przegladObiektowWsparcia({ obiekty: obiektyWsparcia(), snapshotOf: snapshot });
const wpis = (id) => przeglad().wpisy.find((w) => w.id === id);

test('OW/1 lista obiektów wsparcia jest WYPROWADZONA z card-data.js, nie wpisana na sztywno', () => {
  const lista = obiektyWsparcia();
  assert.deepEqual(lista.map((o) => o.id), ['undercity', 'day-night'],
    'dokładnie te dwa obiekty wsparcia istnieją w card-data.js (pomiar 2026-09-12e); nowy obiekt musi tu świadomie trafić');
  assert.equal(lista[0].name, UNDERCITY_DUNGEON.name);
  assert.ok(lista[0].obrazy.includes(UNDERCITY_DUNGEON.imageUri), 'adres obrazu panelu jest w przeglądzie');
  assert.ok(lista[1].obrazy.includes(DAY_NIGHT_TOKEN.imageUriDay)
    && lista[1].obrazy.includes(DAY_NIGHT_TOKEN.imageUriNight),
    'znacznik dnia/nocy ma dwa adresy (front i back) i oba są brane pod uwagę');

  // Zero nazw na sztywno: narzędzie importuje te same eksporty, których używa gra.
  const zrodlo = fs.readFileSync('tools/check-card-printings.mjs', 'utf8');
  assert.match(zrodlo, /import \{[^}]*UNDERCITY_DUNGEON[^}]*DAY_NIGHT_TOKEN[^}]*\} from '\.\.\/src\/cards\/card-data\.js'/s,
    'lista obiektów wsparcia pochodzi z modułu gry (dryf dwóch implementacji: F7/L41)');
});

test('OW/2 obiekt wsparcia NIE jest kartą rejestru ani pozycją arkusza (ADR 0029)', () => {
  assert.equal(REGISTRY.get('undercity'), undefined, 'lochu nie ma w rejestrze kart');
  assert.equal(REGISTRY.get('day-night'), undefined, 'znacznika dnia/nocy nie ma w rejestrze kart');
  for (const nazwa of ['the undercity', 'undercity', 'undercity // the initiative', 'day // night']) {
    assert.equal(ARKUSZ.has(nazwa), false, `arkusz kolekcji nie ma pozycji „${nazwa}”`);
  }
  const csv = fs.readFileSync('tools/collection-art-ids.csv', 'utf8').toLowerCase();
  assert.ok(!csv.includes('undercity') && !csv.includes('tclb'),
    'w arkuszu nie ma ani nazwy lochu, ani kodu setu tclb — więc dopisanie do katalogu złamałoby ADR 0029');
});

test('OW/3 snapshot lochu potwierdza druk offline i jest prowieniencją adresu, którego używa panel', () => {
  const u = wpis('undercity');
  assert.equal(u.klasa, 'W-potwierdzony-offline', `zmierzona klasa: ${u.klasa} (${u.powod ?? ''})`);
  assert.equal(u.set, 'tclb');
  assert.equal(u.numer, '20');
  assert.equal(u.layout, 'double_faced_token');

  const s = snapshot('undercity');
  assert.deepEqual(adresDruku(UNDERCITY_DUNGEON.imageUri), { rodzaj: 'set-numer', set: 'tclb', numer: '20' },
    'adres w card-data.js (ten sam, który pokazuje panel) niesie parę set/numer');
  assert.equal(s.legacy_image_uri, UNDERCITY_DUNGEON.imageUri,
    'snapshot jest prowieniencją zaszytego adresu obrazu — dlatego NIE wolno go kasować');
  assert.equal(sourceUuid(s.source), uuidObrazuSnapshotu(s), 'source niesie UUID obrazu snapshotu');
  assert.equal(u.uuid, uuidObrazuSnapshotu(s));
  assert.deepEqual(u.twarze, ['undercity', 'the initiative'], 'obie twarze są w snapshotcie');
  assert.deepEqual(twarzeSnapshotu(s), u.twarze);

  // Sprzężenie z panelem: obraz lochu na stole bierze się z card-data.js, nie z pliku.
  const render = fs.readFileSync('src/table/render.js', 'utf8');
  assert.ok(render.includes('UNDERCITY_DUNGEON.imageUri'),
    'panel używa adresu z card-data.js (snapshot jest jego prowieniencją, nie źródłem w runtime)');
});

test('OW/4 Oracle z snapshotu zgadza się z komnatami zakodowanymi w silniku', () => {
  const s = snapshot('undercity');
  const twarz = s.card_faces.find((f) => f.name === 'Undercity');
  assert.ok(twarz, 'snapshot ma twarz „Undercity”');
  const tekst = twarz.oracle_text;

  assert.equal(UNDERCITY_ROOMS.length, 9, 'dziewięć komnat (pomiar)');
  for (const komnata of UNDERCITY_ROOMS) {
    assert.ok(tekst.includes(komnata.name), `komnata „${komnata.name}” jest w Oracle snapshotu`);
    if (komnata.leadsTo.length === 0) {
      const maWyjscie = new RegExp(`^${komnata.name} —.*\\(Leads to:`, 'm');
      assert.ok(!maWyjscie.test(tekst),
        `„${komnata.name}” jest ostatnią komnatą (leadsTo puste) — Oracle nie podaje dla niej „(Leads to: …)”`);
      continue;
    }
    const linia = tekst.split('\n').find((l) => l.startsWith(`${komnata.name} —`));
    assert.ok(linia, `Oracle ma wiersz komnaty „${komnata.name}”`);
    const leads = linia.match(/\(Leads to: ([^)]+)\)/)?.[1]?.split(',').map((x) => x.trim()) ?? [];
    assert.deepEqual(leads, [...komnata.leadsTo],
      `przejścia „${komnata.name}” w silniku są dosłownie z Oracle snapshotu`);
  }

  const inicjatywa = s.card_faces.find((f) => f.name === 'The Initiative');
  assert.ok(inicjatywa?.oracle_text.includes('takes the initiative')
    && inicjatywa.oracle_text.includes('venture into Undercity'),
    'druga twarz (znacznik inicjatywy) też ma Oracle — stąd mechanika w src/engine/triggers.js');
});

test('OW/5 brak snapshotu dla Day // Night jest ODNOTOWANY, nie cichy', () => {
  const d = wpis('day-night');
  assert.equal(d.klasa, 'W-bez-snapshotu', 'asymetria historyczna jest widoczna w przeglądzie');
  assert.match(d.powod, /sieci/, 'powód mówi, że pobranie wymaga sieci (w tym środowisku niedostępnej)');
  assert.equal(snapshot('day-night'), null, 'snapshotu znacznika nie ma w docs/cards');
  const adres = adresDruku(DAY_NIGHT_TOKEN.imageUriDay);
  assert.equal(adres.rodzaj, 'uuid', 'adres znacznika niesie UUID obrazu, nie parę set/numer');
  assert.match(DAY_NIGHT_TOKEN.imageUriDay, /\/large\/front\//);
  assert.match(DAY_NIGHT_TOKEN.imageUriNight, /\/large\/back\//);
  assert.equal(adres.uuid, uuidObrazuSnapshotu({ image_uris: { large: DAY_NIGHT_TOKEN.imageUriDay } }),
    'ten sam UUID czytają oba helpery');
});

test('OW/6 w docs/cards NIE ma sierot: każdy snapshot to karta rejestru albo obiekt wsparcia', () => {
  const pliki = fs.readdirSync('docs/cards')
    .filter((f) => f.startsWith('scryfall-') && f.endsWith('.json'))
    .map((f) => f.slice('scryfall-'.length, -'.json'.length));
  const dozwolone = new Set([...REGISTRY.all().map((d) => d.id), ...obiektyWsparcia().map((o) => o.id)]);
  assert.deepEqual(pliki.filter((id) => !dozwolone.has(id)), [],
    'każda nazwa pliku odpowiada id karty z rejestru albo id obiektu wsparcia — inaczej narzędzie jej nie czyta');
  assert.deepEqual(pliki.filter((id) => id === 'undercity' || id === 'day-night'), ['undercity'],
    'dokładnie jeden snapshot obiektu wsparcia (pomiar 2026-09-12e)');
  assert.equal(snapshot('undercity-dungeon'), null, 'stara nazwa pliku (niezgodna z id) już nie istnieje');
});

test('OW/7 przypadki ujemne: inny set, inny numer albo obcy UUID w source → brak potwierdzenia', () => {
  const s = snapshot('undercity');
  const z = (mutacja) => przegladObiektowWsparcia({
    obiekty: obiektyWsparcia(),
    snapshotOf: (id) => (id === 'undercity' ? mutacja(structuredClone(s)) : snapshot(id)),
  }).wpisy.find((w) => w.id === 'undercity');

  const innyNumer = z((x) => ({ ...x, collector_number: '21' }));
  assert.equal(innyNumer.klasa, 'W-snapshot-bez-zgodnosci', 'numer inny niż w adresie panelu = brak dowodu');
  assert.match(innyNumer.powod, /adres obrazu nie zgadza się/);

  const innySet = z((x) => ({ ...x, set: 'clb' }));
  assert.equal(innySet.klasa, 'W-snapshot-bez-zgodnosci');

  const obcySource = z((x) => ({ ...x, source: 'https://api.scryfall.com/cards/00000000-0000-4000-8000-000000000000' }));
  assert.equal(obcySource.klasa, 'W-snapshot-bez-zgodnosci');
  assert.match(obcySource.powod, /source nie niesie UUID obrazu snapshotu/);

  const bezSnapshotu = przegladObiektowWsparcia({ obiekty: obiektyWsparcia(), snapshotOf: () => null });
  assert.deepEqual(bezSnapshotu.wpisy.map((w) => w.klasa), ['W-bez-snapshotu', 'W-bez-snapshotu'],
    'bez snapshotów żaden obiekt nie jest „potwierdzony" — check nie jest pusty');
  assert.equal(bezSnapshotu.potwierdzone, 0);
});

test('OW/8 adresDruku: trzy postaci adresu obrazu (para set/numer, UUID, brak dowodu)', () => {
  assert.deepEqual(adresDruku('https://api.scryfall.com/cards/tclb/20?format=image'),
    { rodzaj: 'set-numer', set: 'tclb', numer: '20' });
  assert.deepEqual(adresDruku('https://api.scryfall.com/cards/2xm/40?format=image'),
    { rodzaj: 'set-numer', set: '2xm', numer: '40' }, 'para z cyfrowym kodem setu');
  assert.equal(adresDruku(DAY_NIGHT_TOKEN.imageUriNight).rodzaj, 'uuid');
  assert.deepEqual(adresDruku('https://api.scryfall.com/cards/named?exact=Plains&format=image&version=normal'),
    { rodzaj: 'brak', uuid: null, set: null, numer: null },
    'przekierowanie po nazwie (ziemie podstawowe) nie niesie dowodu konkretnego druku');
  assert.deepEqual(adresDruku(null), { rodzaj: 'brak', uuid: null, set: null, numer: null });
});
