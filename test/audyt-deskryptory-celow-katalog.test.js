// Strażnik klasowy deskryptorów CELU (audyt PR #185, F-3; klasy L21/L48/M82).
//
// Batch 73 wpisał Spring-Loaded Sawblades jako
//   `requiresTarget: { type: 'creature', qualifier: { tapped: true, controller: 'opponent' } }`
// Klucz `qualifier` NIE ISTNIAŁ w języku deskryptorów celu (silnik zna
// `qualifier` wyłącznie dla przeszukiwań biblioteki — `cardMatchesQualifier`),
// więc filtr „tapnięty stwór przeciwnika" był cicho ignorowany: ETB oznaczał
// 5 obrażeń na WŁASNYM, ODKRĘCONYM stworze i nie pytał o cel przy wielu
// kandydatach (CR 115.1, 601.2c, 608.2b). Typ `tapped_creature` istniał przy
// tym w ścieżce czarów (oferta + walidacja) i w renderze, ale NIE w
// `triggerTargetCandidates` — druga połowa tej samej klasy: deskryptor znany
// jednej ścieżce, nieznany drugiej (pułapka M82/L48).
//
// Ten plik pilnuje trzech kierunków naraz:
//   A) każdy TYP celu czaru/zdolności aktywowanej ma gałąź w OFERCIE
//      (`targetCandidatesBySpec`) i w WALIDACJI (`validateTargets`) — oferta
//      nie może proponować czegoś, co execute odrzuci, ani odwrotnie;
//   B) każdy TYP celu triggera (`trigger.requiresTarget`) ma gałąź w
//      `triggerTargetCandidates` (brak = pusta pula = zdolność zdjęta ze stosu
//      po cichu, CR 603.3d);
//   C) każdy KLUCZ deskryptora jest CZYTANY przez silnik jako `spec.<klucz>`
//      (albo jest na jawnej liście wyjątków z powodem — L113: wyjątek
//      z powodem, nie ciche wyciszenie).
// Kotwicy liczności (L13) pilnuje test D; test E dowodzi, że detektor widzi
// podrabiany deskryptor (mutacja kontrolna).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createCardRegistry } from '../src/cards/card-data.js';

const registry = createCardRegistry();

/** Wycinek ciała funkcji: od nagłówka do domykającego nawiasu klamrowego. */
function functionSlice(file, header) {
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf(header);
  assert.ok(start >= 0, `brak nagłówka „${header}" w ${file}`);
  // Nawias klamrowy DOMYŚLNEJ wartości parametru (`extra = {}`) zamknąłby
  // licznik zaraz za sygnaturą — startujemy od `) {` kończącego parametry.
  const body = source.indexOf(') {', start);
  assert.ok(body >= 0, `brak sygnatury po „${header}" w ${file}`);
  let depth = 0;
  for (let i = body; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i);
    }
  }
  throw new Error(`nie domknięto ciała „${header}" w ${file}`);
}

const SPELLS = 'src/engine/spells.js';
const TRIGGERS = 'src/engine/triggers.js';

const oferta = functionSlice(SPELLS, 'function targetCandidatesBySpec(');
const walidacja = functionSlice(SPELLS, 'export function validateTargets(');
const triggery = functionSlice(TRIGGERS, 'export function triggerTargetCandidates(');

const TYPY_OFERTY = new Set([...oferta.matchAll(/case '([A-Za-z_0-9]+)'/g)].map((m) => m[1]));
const TYPY_WALIDACJI = new Set([...walidacja.matchAll(/spec\??\.type === '([A-Za-z_0-9]+)'/g)].map((m) => m[1]));
const TYPY_TRIGGEROW = new Set([...triggery.matchAll(/spec\.type === '([A-Za-z_0-9]+)'/g)].map((m) => m[1]));

/** Wszystkie deskryptory celu z katalogu: czary, tryby, zdolności, triggery. */
function zbierzDeskryptory() {
  const spellTypes = new Set();
  const triggerTypes = new Set();
  const keys = new Set();
  const instances = [];
  const collect = (spec, bucket, origin) => {
    if (!spec || typeof spec !== 'object') return;
    for (const entry of Array.isArray(spec) ? spec : [spec]) {
      if (!entry || typeof entry !== 'object') continue;
      instances.push({ spec: entry, origin });
      for (const key of Object.keys(entry)) keys.add(key);
      if (typeof entry.type === 'string') bucket.add(entry.type);
    }
  };
  for (const definition of registry.all()) {
    for (const ability of definition.abilities ?? []) {
      collect(ability.trigger?.requiresTarget, triggerTypes, `${definition.id}:trigger`);
      collect(ability.targets, spellTypes, `${definition.id}:ability`);
    }
    collect(definition.spell?.targets, spellTypes, `${definition.id}:spell`);
    for (const mode of definition.spell?.modes ?? []) collect(mode.targets, spellTypes, `${definition.id}:mode`);
  }
  return { spellTypes, triggerTypes, keys, instances };
}

const { spellTypes, triggerTypes, keys, instances } = zbierzDeskryptory();

function engineSources(dir = 'src/engine') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) return engineSources(p);
    return entry.name.endsWith('.js') ? [fs.readFileSync(p, 'utf8')] : [];
  });
}

test('DESK-A: każdy typ celu czaru/zdolności ma gałąź w ofercie I w walidacji (L48/M82)', () => {
  const brakWOfercie = [...spellTypes].filter((type) => !TYPY_OFERTY.has(type)).sort();
  const brakWWalidacji = [...spellTypes].filter((type) => !TYPY_WALIDACJI.has(type)).sort();
  assert.deepEqual(brakWOfercie, [],
    'typ bez gałęzi w `targetCandidatesBySpec` = cel nie do wybrania (albo pula wszystkiego)');
  assert.deepEqual(brakWWalidacji, [],
    'typ bez gałęzi w `validateTargets` = oferta rozjeżdża się z execute (pułapka M82)');
});

test('DESK-B: każdy typ celu triggera ma gałąź w triggerTargetCandidates (CR 603.3d)', () => {
  const brak = [...triggerTypes].filter((type) => !TYPY_TRIGGEROW.has(type)).sort();
  assert.deepEqual(brak, [],
    'typ triggera bez gałęzi = pusta pula kandydatów = zdolność zdjęta ze stosu po cichu');
});

test('DESK-C: każdy klucz deskryptora jest czytany w ścieżce CELU (klasa L21)', () => {
  // Klucz musi być czytany jako `spec.<klucz>` w jednej z TRZECH funkcji
  // rozstrzygających cele (oferta czarów, walidacja, pula triggerów). Skan
  // całych `src/engine` daje fałszywe pozytywne: `abilities.discardCostQualifier`
  // czyta `spec.qualifier` z KOSZTU odrzucenia (Batch 71, Vampire Hounds) i to
  // właśnie ten odczyt ukryłby podrabiany klucz celu z Batcha 73.
  const sciezkiCelu = oferta + walidacja + triggery;
  // Wyjątki jawne i z powodem (L113): klucze rozstrzygane poza pulą kandydatów.
  const WYJATKI = new Map([
    ['count', 'cele wielokrotne — `multiSpec`/`autoSpec` w triggers.js i game-state.js'],
    ['onlyIfKicked', 'bramka kicked w ścieżce rzutu (spells.js) i etykieta (render.js)'],
    ['targetWord', 'etykieta słowa „target" w spells.js/render.js'],
    ['upTo', '„up to one/N" — allowNone (`targetSpec`) i `multiSpecOffer`'],
  ]);
  const nieczytane = [...keys]
    .filter((key) => !WYJATKI.has(key))
    .filter((key) => !new RegExp(`spec\\??\\.${key}\\b`).test(sciezkiCelu))
    .sort();
  assert.deepEqual(nieczytane, [],
    'klucz deskryptora celu, którego żadna z trzech ścieżek nie czyta, jest cichym no-opem '
    + '(F-3: `qualifier` udawał filtr „tapnięty stwór przeciwnika", a ETB bił we własnego stwora)');
  // Anty-gnicie listy (L13): wyjątek musi nadal być czytany gdziekolwiek w src/.
  const calySrc = engineSources().join('\n')
    + fs.readFileSync('src/table/render.js', 'utf8')
    + fs.readFileSync('src/table/session.js', 'utf8');
  for (const [key, reason] of WYJATKI) {
    assert.ok(new RegExp(`\\b\\w+\\??\\.${key}\\b`).test(calySrc),
      `wyjątek „${key}" (${reason}) zniknął z kodu — usuń go z listy`);
  }
});

test('DESK-D: kotwice liczności (L13) — język deskryptorów rośnie z batchami', () => {
  // Stan po naprawie F-3 (Batch 73): `qualifier` opuścił katalog (był
  // podrabianym kluczem), `tapped_creature` + `opponentControls` weszły do
  // ścieżki triggerów.
  // Batch 74 (Etap 3): +4 deskryptory celów — Saltfield Recluse (`{type:'creature'}`),
  // Lambholt Harrier (j.w.), Arrow Storm (`any_target`), Mirelurk Queen
  // (`player` z `prefer: 'opponent'`) → 278.
  // Batch 75: +3 — Lightning Spear (`any_target` dla strzału {2}{R}),
  // Coordinated Maneuver (2 tryby: `creature_or_planeswalker` + `enchantment`) → 281.
  assert.equal(instances.length, 281, 'liczba deskryptorów celu w katalogu');
  assert.equal(spellTypes.size, 35, 'typy celów czarów/zdolności aktywowanych');
  assert.equal(triggerTypes.size, 30, 'typy celów triggerów');
  assert.equal(keys.size, 24, 'klucze deskryptorów (bez podrabianego `qualifier`)');
  assert.equal(keys.has('qualifier'), false, 'język celów nie ma klucza `qualifier`');
  assert.equal(keys.has('opponentControls'), true, '„an opponent controls" jest flagą deskryptora');
  assert.ok(TYPY_TRIGGEROW.has('tapped_creature') && TYPY_OFERTY.has('tapped_creature')
    && TYPY_WALIDACJI.has('tapped_creature'),
    '„target tapped creature" jest obsługiwane we wszystkich trzech ścieżkach');
});

test('DESK-E: mutacja — detektor widzi podrabiany deskryptor (dowód działania)', () => {
  // Dokładny kształt z Batcha 73: typ znany silnikowi + klucz, którego nikt nie czyta.
  const podrobiony = { type: 'creature', qualifier: { tapped: true, controller: 'opponent' } };
  const engine = engineSources().join('\n');
  assert.equal(TYPY_OFERTY.has(podrobiony.type), true, 'sam typ jest legalny — dlatego filtr umknął');
  const sciezkiCelu = oferta + walidacja + triggery;
  assert.equal(new RegExp('spec\\??\\.qualifier\\b').test(sciezkiCelu), false,
    'klucz `qualifier` nie jest czytany przez żadną z trzech ścieżek celu');
  // Detektor kluczy z DESK-C musi go wskazać (sam typ `creature` zostaje legalny).
  const nieczytane = Object.keys(podrobiony)
    .filter((key) => !new RegExp(`spec\\??\\.${key}\\b`).test(sciezkiCelu));
  assert.deepEqual(nieczytane, ['qualifier']);
  // Ten sam klucz czytany w KONTEKŚCIE KOSZTU (abilities.discardCostQualifier)
  // nie może usprawiedliwiać deskryptora celu — dlatego DESK-C jest zawężony
  // do trzech funkcji celowania, nie do całego src/.
  assert.ok(/spec\.qualifier/.test(fs.readFileSync('src/engine/abilities.js', 'utf8')),
    'kontekst kosztu nadal czyta `qualifier` (Vampire Hounds) — to nie jest cel');
  void engine;
  // Detektor typów z DESK-B musi wskazać typ spoza ścieżki triggerów.
  assert.equal(TYPY_TRIGGEROW.has('nie_ma_takiego_celu'), false);
});
