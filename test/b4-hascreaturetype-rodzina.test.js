import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createGameState } from '../src/engine/game-state.js';
import { createGameObject } from '../src/engine/identity.js';
import {
  hasCreatureType, effectiveSubtypes, effectiveSubtypesOnBattlefield,
  grantBasicLandTypeUntilEndOfTurn,
} from '../src/engine/permanents.js';
import { createCardRegistry } from '../src/cards/card-data.js';

// B4 — obserwacja F7 z audytu PR #113: `hasCreatureType` (permanents.js:778) to
// JEDYNE miejsce w silniku znające changelinga (L41: jedna reguła, jedno
// miejsce), a przechodzi przez nie każde porównanie typu stworów — cel
// „non-Mount", statyki plemienne, „can't be blocked by Vampires or Zombies",
// rabaty kosztu, szukanie w strefach, amass. Pomiar z 2026-09-12: **30 miejsc**
// w 8 modułach (notatka audytu mówiła o 23 — kod urósł) i **zero** plików
// testowych wspominających ten predykat. Czyli reguła o największym promieniu
// rażenia w porównaniach typów nie miała ani jednego testu: mutacja (usunąć
// gałąź changelinga, zdjąć `faceDown`, podmienić `effectiveSubtypes` na surowe
// `object.subtypes`) przechodziła całą paczkę na zielono.
//
// Test jest RODZINOWY (ADR 0002 — nie po jednej karcie): karty changeling i
// porównywane podtypy są wyszukiwane mechanicznie w katalogu, a kontrakt
// „typy niestworowe tędy nie przechodzą" jest sprawdzany skanem źródeł.

const registry = createCardRegistry();
const creatureCards = registry.all().filter((card) => (card.types ?? []).includes('Creature'));
const changelings = creatureCards.filter((card) => (card.keywords ?? []).includes('changeling'));
const creatureSubtypes = [...new Set(creatureCards.flatMap((card) => card.subtypes ?? []))].sort();

const newState = () => createGameState({ seed: 11, players: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }] });

/**
 * Obiekt gry z pól karty — bez dopisywania cech, których karta nie ma.
 * Nadpisania nakładamy PO fabryce: `createGameObject` przyjmuje tylko pola ze
 * swojego kontraktu i resztę gubi po cichu (L21) — `faceDown`/`faceDownCause`
 * ustawiają ścieżki morph/cloak, nie fabryka, więc przekazane do niej zniknęłyby
 * i test zakrycia sprawdzałby odkryty permanent.
 */
const objectFromCard = (card, id, overrides = {}, zone = 'battlefield') => Object.freeze({
  ...createGameObject({
  id,
  instanceId: `${id}#1`,
  cardId: card.id,
  controllerId: 'p1',
  ownerId: 'p1',
  zone,
  kind: zone === 'battlefield' ? 'creature' : 'card',
  types: card.types ?? [],
  subtypes: card.subtypes ?? [],
  keywords: card.keywords ?? [],
  power: card.power ?? null,
  toughness: card.toughness ?? null,
  }),
  ...overrides,
});

test('B4/0: punkt zaczepienia zmierzony, nie przepisany — katalog ma changelingi i podtypy stworów', () => {
  assert.ok(changelings.length >= 1, 'w katalogu nie ma żadnej karty z changeling — test straciłby przedmiot');
  assert.ok(creatureSubtypes.length >= 20, `podtypów stworów podejrzanie mało: ${creatureSubtypes.length}`);
});

test('B4/1: changeling jest KAŻDYM typem stworów (CR 702.73a) — wszystkie podtypy z katalogu', () => {
  const card = changelings[0];
  const object = objectFromCard(card, 'chg');
  const state = newState();
  state.objects.set('chg', object);
  state.zones.battlefield.push('chg');
  const refused = creatureSubtypes.filter((subtype) => !hasCreatureType(object, subtype, state));
  assert.deepEqual(refused, [], `changeling (${card.id}) nie odpowiada na podtypy: ${refused.join(', ')}`);
  // Tak samo bez `state` — predykat ma dwie ścieżki czytania podtypów.
  const refusedNoState = creatureSubtypes.filter((subtype) => !hasCreatureType(object, subtype));
  assert.deepEqual(refusedNoState, [], `ścieżka bez state: ${refusedNoState.join(', ')}`);
});

test('B4/2: stwór bez changelinga odpowiada TYLKO na własne podtypy (cały katalog)', () => {
  const plain = creatureCards.filter((card) => !(card.keywords ?? []).includes('changeling'));
  assert.ok(plain.length > 100, `za mało kart bez changelinga do próby: ${plain.length}`);
  const state = newState();
  const wrong = [];
  for (const card of plain) {
    const object = objectFromCard(card, `c-${card.id}`);
    state.objects.set(object.id, object);
    state.zones.battlefield.push(object.id);
    const own = card.subtypes ?? [];
    for (const subtype of own) {
      if (!hasCreatureType(object, subtype, state)) wrong.push(`${card.id}: własny ${subtype} = false`);
    }
    const foreign = creatureSubtypes.find((subtype) => !own.includes(subtype));
    if (foreign && hasCreatureType(object, foreign, state)) wrong.push(`${card.id}: obcy ${foreign} = true`);
  }
  assert.deepEqual(wrong.slice(0, 10), [], `błędne odpowiedzi predykatu: ${wrong.length}`);
});

test('B4/3: changeling działa w KAŻDEJ strefie (CR 702.73a — CDA karty, nie permanentu)', () => {
  const card = changelings[0];
  const probe = creatureSubtypes.find((subtype) => !(card.subtypes ?? []).includes(subtype));
  assert.ok(probe, 'brak obcego podtypu do próby');
  for (const zone of ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'stack']) {
    const object = objectFromCard(card, `z-${zone}`, {}, zone);
    assert.equal(hasCreatureType(object, probe), true, `strefa ${zone}: changeling nie nadaje ${probe}`);
    assert.equal(hasCreatureType(object, probe, newState()), true, `strefa ${zone} ze state: brak ${probe}`);
  }
});

test('B4/4: permanent zakryty (morph/cloak) nie ma typów — changeling też zakryty (CR 708.2a)', () => {
  const card = changelings[0];
  const state = newState();
  for (const cause of ['morph', 'cloak']) {
    const object = objectFromCard(card, `fd-${cause}`, { faceDown: true, faceDownCause: cause });
    state.objects.set(object.id, object);
    state.zones.battlefield.push(object.id);
    assert.deepEqual(effectiveSubtypes(object), [], 'zakryty stwór ma podtypy w effectiveSubtypes');
    assert.deepEqual(effectiveSubtypesOnBattlefield(state, object), [], 'zakryty stwór ma podtypy w odczycie z state');
    for (const subtype of [...(card.subtypes ?? []), ...creatureSubtypes.slice(0, 12)]) {
      assert.equal(hasCreatureType(object, subtype, state), false, `zakryty (${cause}) odpowiada na ${subtype}`);
      assert.equal(hasCreatureType(object, subtype), false, `zakryty (${cause}) bez state odpowiada na ${subtype}`);
    }
  }
});

test('B4/5: changeling nadany „do końca tury" (keywordGrants) też nadaje typy', () => {
  const plain = creatureCards.find((card) => !(card.keywords ?? []).includes('changeling') && (card.subtypes ?? []).length > 0);
  const object = objectFromCard(plain, 'granted', { keywordGrants: ['changeling'] });
  const state = newState();
  state.objects.set('granted', object);
  state.zones.battlefield.push('granted');
  const foreign = creatureSubtypes.find((subtype) => !(plain.subtypes ?? []).includes(subtype));
  assert.equal(hasCreatureType(object, foreign, state), true, `grant changelinga nie nadaje ${foreign}`);
  // Bez grantu ten sam obiekt odpowiada tylko na własne podtypy.
  const bare = objectFromCard(plain, 'bare');
  state.objects.set('bare', bare);
  state.zones.battlefield.push('bare');
  assert.equal(hasCreatureType(bare, foreign, state), false, 'stwór bez changelinga odpowiedział na obcy typ');
});

test('B4/6: typeGrant (Unstable Frontier) — podstawowe typy lądów zastąpione, reszta zostaje', () => {
  // `typeGrant` to tymczasowa zmiana typu PODSTAWOWEGO landa
  // (grantBasicLandTypeUntilEndOfTurn, permanents.js:1218): `effectiveSubtypes`
  // odrzuca własne podstawowe typy lądów i dokłada nadane, a podtypy
  // nielądowe zostają. Kolory z podtypów podstawowych czytają tę samą funkcję
  // (mana-sources.js:198), więc rozjazd byłby widoczny w produkcji many.
  const basics = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
  const landCard = registry.all().find((card) => (card.subtypes ?? []).some((s) => basics.includes(s)));
  assert.ok(landCard, 'w katalogu nie ma karty z podstawowym typem lądu');
  const own = landCard.subtypes.filter((s) => basics.includes(s))[0];
  const granted = basics.find((s) => s !== own);

  const state = newState();
  const land = objectFromCard(landCard, 'land', { kind: 'land', types: landCard.types ?? ['Land'] });
  state.objects.set('land', land);
  state.zones.battlefield.push('land');
  assert.equal(hasCreatureType(land, own, state), true, 'przed grantem land nie ma własnego typu podstawowego');

  const updated = grantBasicLandTypeUntilEndOfTurn(state, 'land', granted);
  // Własne podtypy NIElądowe zostają (np. Dryad na Forest/Dryad), podstawowy
  // typ lądu jest zastąpiony — zmierzone na prawdziwej karcie z katalogu.
  const keptNonBasic = (landCard.subtypes ?? []).filter((subtype) => !basics.includes(subtype));
  assert.deepEqual(effectiveSubtypes(updated), [...keptNonBasic, granted],
    'grant nie zastąpił podstawowego typu lądu (albo zgubił podtyp nielądowy)');
  assert.equal(hasCreatureType(updated, granted, state), true, 'nadany typ podstawowy nie jest rozpoznawany');
  assert.equal(hasCreatureType(updated, own, state), false, 'stary typ podstawowy przetrwał grant');

  // Podtypy NIElądowe zostają przy grancie (kod: kept = własne bez podstawowych).
  const creatureCard = creatureCards.find((card) => (card.subtypes ?? []).length > 0
    && !(card.subtypes ?? []).some((s) => basics.includes(s))
    && !(card.keywords ?? []).includes('changeling'));
  const mixed = objectFromCard(creatureCard, 'mixed', { typeGrant: { subtypes: [granted] } });
  assert.deepEqual(effectiveSubtypes(mixed), [...(creatureCard.subtypes ?? []), granted],
    'grant nie dokłada się do podtypów nielądowych');
  for (const subtype of creatureCard.subtypes ?? []) {
    assert.equal(hasCreatureType(mixed, subtype), true, `podtyp ${subtype} zginął przy grancie`);
  }
});

test('B4/7: straże — brak obiektu albo brak podtypu to false, nie wyjątek', () => {
  assert.equal(hasCreatureType(null, 'Vampire'), false);
  assert.equal(hasCreatureType(undefined, 'Vampire'), false);
  const object = objectFromCard(changelings[0], 'g');
  assert.equal(hasCreatureType(object, null), false, 'pusty podtyp u changelinga powinien dać false');
  assert.equal(hasCreatureType(object, ''), false);
  assert.equal(hasCreatureType(object, undefined), false);
});

test('B4/8: kontrakt granicy — przez predykat nie przechodzą typy NIESTWOROWE (skan źródeł)', () => {
  // Komentarz przy definicji: „Typy NIESTWOROWE (Gate, Town, Food, Saga, typy
  // podstawowe lądów) tędy NIE przechodzą — changeling ich nie nadaje".
  // Predykat nie broni się przed takim wywołaniem (changeling odpowiedziałby
  // true na 'Gate'), więc granica żyje wyłącznie w miejscach wywołań. Strażnik
  // mechaniczny: każdy LITERAŁOWY drugi argument w src/ musi być typem stworów
  // z katalogu. Bez tego jedna nowa statyka „non-Gate" cicho psułaby changelinga.
  // Ścieżki od pliku testu, nie od cwd (L21: narzędzie ma działać z każdego miejsca).
  const repoRoot = join(fileURLToPath(import.meta.url), '..', '..');
  const roots = [join(repoRoot, 'src')];
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith('.js')) files.push(full);
    }
  };
  for (const root of roots) walk(root);

  /** Drugi argument wywołania (z równoważeniem nawiasów) albo null. */
  const secondArg = (source, from) => {
    let depth = 0;
    let arg = '';
    let args = [];
    for (let i = from; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === '(') { depth += 1; if (depth === 1) continue; }
      if (ch === ')') {
        depth -= 1;
        if (depth === 0) { args.push(arg); return args; }
      }
      if (ch === ',' && depth === 1) { args.push(arg); arg = ''; continue; }
      arg += ch;
    }
    return null;
  };

  const literals = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    let at = source.indexOf('hasCreatureType(');
    while (at >= 0) {
      const args = secondArg(source, at + 'hasCreatureType'.length);
      const second = args && args[1] ? args[1].trim() : null;
      const literal = second && /^'([A-Za-z]+)'$/.exec(second);
      if (literal) literals.push({ file, subtype: literal[1] });
      at = source.indexOf('hasCreatureType(', at + 1);
    }
  }
  assert.ok(literals.length >= 1, 'skan nie znalazł żadnego literałowego podtypu — mechanika strażnika się zepsuła');
  const wrong = literals.filter(({ subtype }) => !creatureSubtypes.includes(subtype));
  assert.deepEqual(wrong, [], 'wywołanie z typem niestworowym (changeling odpowiedziałby true): '
    + wrong.map((w) => `${w.file}:${w.subtype}`).join(', '));
});
