// Druki kart: UUID obrazu karty dwustronnej + pokrycie drugiej strony snapshotem.
//
// Dlaczego ten test istnieje (pomiar 2026-09-12):
//  1. `tools/check-card-printings.mjs` czytał UUID obrazu TYLKO z `image_uris.large`,
//     a Scryfall dla kart dwustronnych (layout `transform`) nie oddaje `image_uris`
//     na wierzchu — obrazy wiszą przy `card_faces`. Skutek: 3 snapshoty transform
//     (scorned-villager, grizzled-outcasts, jill-shivas-dominant) nie potwierdzały
//     druku offline, a po zacieśnieniu `source` do `/cards/<id>` narzędzie zgłosiło
//     FAŁSZYWY rozjazd „source wskazuje inną kartę niż obraz”.
//  2. Siedem kart z arkusza kolekcji to DRUGIE TWARZE kart dwustronnych
//     (krallenhorde-wantons ← grizzled-outcasts itd.). Wpadały na listę „DO POBRANIA”
//     jakby brakowało im prowieniencji, choć Scryfall opisuje transform jako JEDEN
//     obiekt karty — snapshot przedniej twarzy zawiera obie twarze.
//
// Test pilnuje obu napraw na PRAWDZIWYCH danych repozytorium i ma przypadki
// ujemne z rzeczywistych danych (`token_rat` dzieli UUID z `lab-rats`, ale twarzą tej karty
// NIE jest — samo współdzielenie UUID nie może wystarczać) oraz syntetyczną
// mutację (snapshot „brata” bez `card_faces` → pokrycie musi odpaść).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { artIdsBySetFromRows, parseCSV } from '../tools/fetch-art-ids.mjs';
import {
  uuidOf, sourceUuid, sourceSet, uuidObrazuSnapshotu, twarzeSnapshotu,
  pokrycieDrugiejStrony, przegladDrukow, snapshotOfPlik, RAW_FIELDS,
} from '../tools/check-card-printings.mjs';

const REGISTRY = createCardRegistry();
const ARKUSZ = artIdsBySetFromRows(parseCSV(fs.readFileSync('tools/collection-art-ids.csv', 'utf8')));
const snapshot = (id) => snapshotOfPlik(id);
const def = (id) => REGISTRY.get(id);

// Pary zmierzone 2026-09-12: druga twarz ← karta ze snapshotem (ten sam UUID obrazu).
const PARY = [
  ['krallenhorde-wantons', 'grizzled-outcasts'],
  ['guidestone-compass', 'lodestone-needle'],
  ['shiva-warden-of-ice', 'jill-shivas-dominant'],
  ['homicidal-brute', 'civilized-scholar'],
  ['ballista-wielder', 'ballista-watcher'],
  ['dire-strain-brawler', 'tireless-hauler'],
  ['balamb-garden-airborne', 'balamb-garden-seed-academy'],
];

test('D/1 uuidObrazuSnapshotu: zwykła karta — UUID z image_uris.large', () => {
  const snap = snapshot('apprentice-wizard');
  assert.ok(snap, 'snapshot istnieje');
  assert.equal(uuidObrazuSnapshotu(snap), uuidOf(snap.image_uris.large));
  assert.equal(uuidObrazuSnapshotu(snap), uuidOf(def('apprentice-wizard').imageUri),
    'UUID obrazu snapshotu == imageUri katalogu (ten sam druk)');
});

test('D/2 uuidObrazuSnapshotu: karta dwustronna bez image_uris na wierzchu — UUID z card_faces[0]', () => {
  const snap = snapshot('scorned-villager');
  assert.ok(snap, 'snapshot istnieje');
  assert.equal(snap.image_uris?.large, undefined, 'założenie: transform nie ma image_uris.large');
  assert.ok(Array.isArray(snap.card_faces) && snap.card_faces.length === 2, 'dwie twarze');
  const uuid = uuidObrazuSnapshotu(snap);
  assert.match(String(uuid), /^[0-9a-f-]{36}$/, 'zwrócony UUID');
  assert.equal(uuid, uuidOf(snap.card_faces[0].image_uris.large), 'z twarzy przedniej');
  assert.equal(uuid, uuidOf(def('scorned-villager').imageUri), 'równy imageUri katalogu (front)');
  assert.equal(uuid, uuidOf(def('moonscarred-werewolf').imageUri),
    'twarz tylna dzieli ten sam UUID — to JEDEN obiekt karty w Scryfall');
});

test('D/3 uuidObrazuSnapshotu: puste i uszkodzone wejście nie rzuca', () => {
  assert.equal(uuidObrazuSnapshotu(null), null);
  assert.equal(uuidObrazuSnapshotu({}), null);
  assert.equal(uuidObrazuSnapshotu({ image_uris: {}, card_faces: [{}] }), null);
  assert.equal(uuidObrazuSnapshotu({ image_uris: { large: 'to-nie-uuid' } }), null);
});

test('D/4 twarzeSnapshotu: nazwy twarzy małą literą, brak twarzy = pusta lista', () => {
  assert.deepEqual(twarzeSnapshotu(snapshot('grizzled-outcasts')),
    ['grizzled outcasts', 'krallenhorde wantons']);
  assert.deepEqual(twarzeSnapshotu(snapshot('apprentice-wizard')), [], 'zwykła karta nie ma card_faces');
  assert.deepEqual(twarzeSnapshotu(null), []);
});

test('D/5 pokrycieDrugiejStrony: wszystkie 7 drugich twarzy wskazuje snapshot przedniej', () => {
  for (const [tyl, przod] of PARY) {
    const d = def(tyl);
    assert.ok(d, `${tyl} jest w katalogu`);
    assert.equal(snapshot(tyl), null, `${tyl} NIE ma własnego snapshotu (założenie pomiaru)`);
    const wynik = pokrycieDrugiejStrony(d, { registry: REGISTRY, snapshotOf: snapshot });
    assert.equal(wynik.covered, true, `${tyl} pokryty snapshotem ${przod}`);
    assert.equal(wynik.frontId, przod, 'wskazany snapshot przedniej twarzy');
    assert.equal(wynik.layout, 'transform', 'layout karty dwustronnej');
    assert.equal(uuidOf(d.imageUri), wynik.uuid, 'UUID z katalogu == UUID pokrycia');
    assert.ok(twarzeSnapshotu(snapshot(przod)).includes(String(d.name).toLowerCase()),
      'nazwa tylnej twarzy naprawdę jest w card_faces snapshotu');
  }
});

test('D/6 pokrycieDrugiejStrony: samo współdzielenie UUID NIE wystarcza (token_rat vs lab-rats)', () => {
  const d = def('token_rat');
  assert.ok(d, 'token_rat jest w katalogu');
  assert.equal(uuidOf(d.imageUri), uuidOf(def('lab-rats').imageUri),
    'założenie pomiaru: token dzieli UUID obrazu z kartą, która ma snapshot');
  const wynik = pokrycieDrugiejStrony(d, { registry: REGISTRY, snapshotOf: snapshot });
  assert.equal(wynik.covered, false, 'token NIE jest twarzą karty — nie wolno go uznać za pokryty');
  assert.match(wynik.powod, /nie jest twarzą/, 'powód odmowy mówi o twarzy, nie o UUID');
});

test('D/7 pokrycieDrugiejStrony: mutacja — snapshot „brata” bez card_faces nie pokrywa', () => {
  const d = def('krallenhorde-wantons');
  const fakeRegistry = { all: () => [d, def('grizzled-outcasts')] };
  const bezTwarzy = (id) => (id === 'grizzled-outcasts' ? { layout: 'transform', name: 'Grizzled Outcasts' } : null);
  const wynik = pokrycieDrugiejStrony(d, { registry: fakeRegistry, snapshotOf: bezTwarzy });
  assert.equal(wynik.covered, false, 'bez nazwy w card_faces pokrycie musi odpaść');
  const pusty = (id) => (id === 'grizzled-outcasts' ? { layout: 'transform', card_faces: [{ name: 'Coś Innego' }] } : null);
  assert.equal(pokrycieDrugiejStrony(d, { registry: fakeRegistry, snapshotOf: pusty }).covered, false,
    'inna nazwa twarzy też nie pokrywa');
});

test('D/8 pokrycieDrugiejStrony: brak UUID w katalogu i brak nazwy — odmowa z powodem', () => {
  assert.equal(pokrycieDrugiejStrony({ id: 'x', name: 'X', imageUri: null },
    { registry: REGISTRY, snapshotOf: snapshot }).covered, false);
  assert.match(pokrycieDrugiejStrony({ id: 'x', imageUri: def('lab-rats').imageUri },
    { registry: REGISTRY, snapshotOf: snapshot }).powod, /brak nazwy/);
});

test('D/9 przegląd: drugie twarze w klasie B2, a nie na liście DO POBRANIA', () => {
  const w = przegladDrukow({ registry: REGISTRY, arkusz: ARKUSZ, snapshotOf: snapshot });
  const b2 = w.grupy.get('B2-druga-strona-pokryta-snapshotem') ?? [];
  assert.deepEqual(b2.map((x) => x.id).sort(), PARY.map((p) => p[0]).sort(),
    'dokładnie siedem zmierzonych drugich twarzy');
  for (const x of b2) assert.equal(w.doSieci.some((s) => s.id === x.id), false,
    `${x.id} nie może być na liście DO POBRANIA`);
  assert.equal(w.doSieci.length, 0, 'nic nie wymaga sieci: prowieniencja całej kolekcji jest offline');
});

test('D/10 przegląd: klasy problemowe C/D/E/F są puste (zapadnia nie wraca)', () => {
  const w = przegladDrukow({ registry: REGISTRY, arkusz: ARKUSZ, snapshotOf: snapshot });
  for (const klasa of ['C-bez-source-surowa-odpowiedz', 'D-bez-source-reczny',
    'E-source-wyszukiwanie', 'F-source-bez-set', 'B-source-uuid-ROZJAZD']) {
    assert.equal((w.grupy.get(klasa) ?? []).length, 0, `${klasa} musi pozostać pusta`);
  }
  assert.ok((w.grupy.get('A-source-set-aware') ?? []).length > 0, 'A nadal liczone');
  assert.ok((w.grupy.get('B-source-uuid-spójny') ?? []).length > 0, 'B nadal liczone');
  assert.equal(w.nieuwaga.length, 0, 'żaden rozjazd bez udokumentowania polem `uwaga`');
  assert.deepEqual(w.rozjazdy, ['ethersworn-shieldmage: arkusz 536CON vs katalog ARB'],
    'jedyny rozjazd to udokumentowany skrót płaszczyzny Alara (druk ARB potwierdził właściciel)');
});

test('D/11 przegląd: każdy snapshot karty z rejestru dowodzi druku (set= albo /cards/<id>)', () => {
  const w = przegladDrukow({ registry: REGISTRY, arkusz: ARKUSZ, snapshotOf: snapshot });
  const suma = [...w.grupy.values()].reduce((a, v) => a + v.length, 0);
  assert.equal(suma, w.kart, 'każda karta katalogu jest w dokładnie jednej klasie');
  const bezDowodu = [];
  for (const d of REGISTRY.all()) {
    const snap = snapshot(d.id);
    if (!snap) continue;
    const src = snap.source ?? '';
    if (!src) { bezDowodu.push(`${d.id}: brak source`); continue; }
    if (!sourceSet(src) && sourceUuid(src) !== uuidObrazuSnapshotu(snap)) {
      bezDowodu.push(`${d.id}: ${src.slice(0, 70)}`);
    }
  }
  assert.deepEqual(bezDowodu, [], 'żaden snapshot karty z rejestru nie ma source bez dowodu druku');
});

test('D/12 karty dwustronne: UUID obrazu z card_faces, a gdy twarzy bez obrazów — dowód z set=', () => {
  // Zmierzone: scorned-villager i jill-shivas-dominant mają obrazy przy twarzach.
  for (const id of ['scorned-villager', 'jill-shivas-dominant']) {
    const snap = snapshot(id);
    assert.equal(uuidObrazuSnapshotu(snap), uuidOf(def(id).imageUri), `${id}: UUID z card_faces == katalog`);
  }
  // grizzled-outcasts ma card_faces BEZ obrazów — jego dowodem druku jest parametr set=.
  const g = snapshot('grizzled-outcasts');
  assert.equal(uuidObrazuSnapshotu(g), null, 'założenie pomiaru: brak obrazów przy twarzach');
  assert.equal(sourceSet(g.source), 'isd', 'source ma set=');
  assert.equal(String(def('grizzled-outcasts').set).toLowerCase(), 'isd', 'set katalogu zgodny');
  // Niezmiennik: żaden snapshot karty z rejestru nie jest pozbawiony OBU dowodów.
  const bezObu = REGISTRY.all().filter((d) => {
    const s = snapshot(d.id);
    return s && !uuidObrazuSnapshotu(s) && !sourceSet(s.source ?? '');
  }).map((d) => d.id);
  assert.deepEqual(bezObu, [], 'każdy snapshot ma UUID obrazu albo set w source');
  const w = przegladDrukow({ registry: REGISTRY, arkusz: ARKUSZ, snapshotOf: snapshot });
  assert.ok(w.obrazPotwierdzony >= 458, `potwierdzonych offline co najmniej 458 (zmierzono ${w.obrazPotwierdzony})`);
});

test('D/14 nazwy snapshotów: konwencja scryfall-<id>.json i jedna udokumentowana sierota', () => {
  const pliki = fs.readdirSync('docs/cards')
    .filter((f) => f.startsWith('scryfall-') && f.endsWith('.json'))
    .map((f) => f.slice('scryfall-'.length, -'.json'.length));
  const idy = new Set(REGISTRY.all().map((d) => d.id));
  const sieroty = pliki.filter((id) => !idy.has(id));
  // `undercity-dungeon` to dane dungeonu (karta spoza rejestru kart — silnik tworzy ją
  // dynamicznie jako `undercity` w src/engine/effects.js), jej source jest kanoniczne.
  assert.deepEqual(sieroty, ['undercity-dungeon'],
    'jedyna sierota to dungeon poza rejestrem; reszta nazw odpowiada id kart (inaczej narzędzie ich nie czyta)');
  const s = JSON.parse(fs.readFileSync('docs/cards/scryfall-undercity-dungeon.json', 'utf8'));
  assert.ok(sourceUuid(s.source), 'sierota ma kanoniczne source');
  // Regresja po rename: token Tarmogoyf był zapisany jako `token-tarmogoyf` (myślnik) i przez to
  // niewidoczny dla przeglądu — teraz id i nazwa pliku są zgodne.
  assert.ok(snapshot('token_tarmogoyf'), 'token_tarmogoyf ma snapshot pod nazwą zgodną z id');
});

test('D/15 rozjazdy: set=null w katalogu (tokeny/ziemie) nie jest rozjazdem, różnica setów jest', () => {
  const w = przegladDrukow({ registry: REGISTRY, arkusz: ARKUSZ, snapshotOf: snapshot });
  assert.deepEqual(w.rozjazdy, ['ethersworn-shieldmage: arkusz 536CON vs katalog ARB'],
    'jedyny rozjazd to udokumentowany skrót płaszczyzny Alara');
  assert.equal(w.nieuwaga.length, 0, 'brak rozjazdów bez `uwaga`');
  assert.ok(REGISTRY.all().filter((d) => d.set == null).length >= 44,
    'założenie: tokeny i ziemie podstawowe mają w katalogu set=null');
  // Syntetyczna mutacja: gdy obie strony mają set i są różne — rozjazd MUSI być zgłoszony.
  const fakeRegistry = { all: () => [{ id: 'x', name: 'X', set: 'ISD', artId: null, imageUri: null }] };
  const fakeSnapshot = () => ({ set: 'jmp', source: 'https://api.scryfall.com/cards/named?exact=X&set=jmp' });
  const w2 = przegladDrukow({ registry: fakeRegistry, arkusz: new Map(), snapshotOf: fakeSnapshot });
  assert.ok(w2.rozjazdy.some((r) => r.includes('snapshot set=jmp vs katalog set=ISD')),
    'różnica setów przy obu obecnych nadal jest rozjazdem');
  const fakeBezSetu = { all: () => [{ id: 'y', name: 'Y', set: null, artId: null, imageUri: null }] };
  const w3 = przegladDrukow({ registry: fakeBezSetu, arkusz: new Map(), snapshotOf: fakeSnapshot });
  assert.deepEqual(w3.rozjazdy.filter((r) => r.startsWith('y:')), [],
    'katalog bez setu (token) nie daje rozjazdu z setem Scryfalla');
});

test('D/13 RAW_FIELDS i predykaty źródła: kontrakt bez zmian', () => {
  assert.ok(RAW_FIELDS.includes('oracle_id') && RAW_FIELDS.length >= 10, 'lista pól surowej odpowiedzi');
  assert.equal(sourceUuid('https://api.scryfall.com/cards/2264b760-c527-470d-bad0-d8baaf543631'),
    '2264b760-c527-470d-bad0-d8baaf543631');
  assert.equal(sourceUuid('https://api.scryfall.com/cards/named?exact=Negate'), null);
  assert.equal(sourceSet('https://api.scryfall.com/cards/named?exact=Negate&set=m20'), 'm20');
  assert.equal(sourceSet('https://api.scryfall.com/cards/search?q=!%22Negate%22+e%3Am20'), null,
    'e%3A nie jest parametrem set= — dlatego klasa E była słabszym dowodem');
});
