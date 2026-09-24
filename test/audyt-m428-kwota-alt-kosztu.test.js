import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { costSymbols } from '../src/table/mana-icons.js';
import { choiceGroupTitle, commandLabel } from '../src/table/render.js';

/**
 * M428 — Żywy Tester na kartach batcha 59 (sesja 2026-09-24d).
 *
 * Audyt celowany (8 partii na `decks/audyt-batch59.txt`, transkrypty
 * `/tmp/zb-*.txt`) pokazał DWA błędy tej samej klasy, oba w deskryptorach
 * kosztów ALTERNATYWNYCH:
 *
 *   F1 `join-the-dance`  Oracle „Flashback {3}{G}{W}" → def. `cost: 4`
 *      (silnik brał o {1} mniej; oferta szła już przy 4 manie).
 *   F3 `boulder-salvo`   Oracle „Surge {1}{R}"       → def. `cost: 3`
 *      (karta brała o {1} WIĘCEJ niż druk; znalezisko z tego samego skanu,
 *      karta z batcha 58 — klasa nie zna granic batcha).
 *
 * Przyczyna wspólna: `cost` czytano jako CZĘŚĆ GENERYCZNĄ kosztu, a to SUMA
 * symboli — `costSymbols(amount, colors)` liczy `generic = amount − pipy`
 * (dowód: bestow Leafcrown Dryad „{3}{G}" = 4, escape Sweet Oblivion
 * „{3}{U}" = 4, flashback Dream Twist „{1}{U}" = 2). Strażnik M268 porównywał
 * z Oracle tylko PIPY (`colors`), więc kwota mogła się rozjechać niezauważona,
 * a testy batchy powtarzały błędne twierdzenie w tytule („{3}{G}{W} = 4 many",
 * „surge {1}{R} = 3 many") — dowód, że strażnik musi czytać CAŁY napis.
 *
 * Ten skan jest rozszerzeniem M268 o kwotę: buduje napis kosztu z definicji
 * i porównuje go ZNAK PO ZNAKU z napisem przy słowie-kluczu w Oracle.
 */

const REGISTRY = createCardRegistry();

/**
 * Rodzina kosztów alternatywnych: słowo z Oracle → getter deskryptora.
 * `amount` wskazuje pole z KWOTĄ (sumą symboli); `cleave` trzyma ją
 * w `manaCost` (M267/C), morph jest poza rodziną — ma DWA koszty
 * (`cost` = rzut zakryty, `morphCost` = odkrycie, L104/1).
 */
const FAMILY = [
  ['Bestow', (c) => c.bestow, 'cost'],
  ['Plot', (c) => c.plot, 'cost'],
  ['Suspend', (c) => c.suspend, 'cost'],
  ['Madness', (c) => c.madness, 'cost'],
  ['Warp', (c) => c.warp, 'cost'],
  ['Surge', (c) => c.surge, 'cost'],
  ['Kicker', (c) => c.kicker, 'cost'],
  ['Flashback', (c) => c.spell?.flashback, 'cost'],
  ['Buyback', (c) => c.spell?.buyback, 'cost'],
  ['Escape', (c) => c.spell?.escape, 'cost'],
  ['Cleave', (c) => c.spell?.cleave, 'manaCost'],
  ['Adventure', (c) => c.adventure, 'cost'],
];

/**
 * Wyjątki skanu — KAŻDY z powodem (inaczej to wygaszanie detektora, L5).
 * `adventure`: Scryfall nie pisze kosztu przy słowie „Adventure" (druga część
 * karty jest osobnym czarem, „Nazwa — {koszt}" albo „//"), więc skan symboli
 * nie ma czego sparować — kwotę przygody pilnują piny batchy + M268 (pipy).
 */
const ORACLE_SKIP = new Map([['Adventure', 'koszt w drugiej części karty, nie przy słowie-kluczu']]);

/**
 * Napis symboli przy słowie-kluczu Oracle (albo null, gdy brak/nieparowalny).
 * `ambiguous` = słowo-klucz z kosztem występuje w Oracle WIELOKROTNIE (kicker
 * może mieć kilka kosztów) — wtedy parowanie 1:1 nie jest pewne i karta MUSI
 * wypaść z automatu, a nie przejść po cichu na pierwszym trafieniu.
 */
function oracleCostSymbols(text, keyword) {
  // `Suspend 4—{B}`: między słowem a napisem może stać LICZNIK czasu.
  const re = new RegExp(`${keyword}\\s*\\d*\\s*(?:—|-|\\u2014)?\\s*((?:\\{[^}]+\\}\\s*)+)`, 'gi');
  const matches = [...String(text ?? '').matchAll(re)];
  if (matches.length !== 1) return null;
  return [...matches[0][1].matchAll(/\{([^}]+)\}/g)].map((m) => `{${m[1]}}`).join('');
}

/** Zwraca listę rozjazdów „definicja vs Oracle" dla podanych kart. */
function scanAmounts(cards) {
  const offenders = [];
  const unparsed = [];
  for (const card of cards) {
    for (const [keyword, get, amountField] of FAMILY) {
      const descriptor = get(card);
      if (!descriptor) continue;
      if (ORACLE_SKIP.has(keyword)) continue;
      const oracle = oracleCostSymbols(card.oracleText, keyword);
      if (oracle == null) { unparsed.push(`${card.id}[${keyword}]`); continue; }
      const built = costSymbols(descriptor[amountField], descriptor.colors ?? []);
      if (built !== oracle) {
        offenders.push(`${card.id} [${keyword}] oracle=${oracle} def=${built} (cost=${descriptor[amountField]}, colors=${JSON.stringify(descriptor.colors ?? [])})`);
      }
    }
  }
  return { offenders, unparsed };
}

test('M428 (klasa): kwota alt-kosztu w definicji == napis Oracle (nie tylko pipy)', () => {
  const { offenders } = scanAmounts(REGISTRY.all());
  assert.deepEqual(offenders, [], 'alt-koszty, których kwota rozjeżdża się z Oracle');
});

test('M428 (klasa): karty pominięte przez skan są WYMIENIONE wprost', () => {
  // Skan nie może „przemilczeć" karty: każdy pominięty przypadek ląduje na tej
  // liście, więc nowy wyjątek wymaga świadomej decyzji (wzorzec L5/L165).
  const skipped = [];
  for (const card of REGISTRY.all()) {
    for (const [keyword, get] of FAMILY) if (ORACLE_SKIP.has(keyword) && get(card)) skipped.push(`${card.id}[${keyword}]`);
  }
  assert.deepEqual(skipped.sort(), ['ettercap[Adventure]', 'gray-slaad[Adventure]'],
    'lista wyjątków skanu — nowa karta tutaj wymaga powodu w ORACLE_SKIP');

  const { unparsed } = scanAmounts(REGISTRY.all());
  assert.deepEqual(unparsed, [],
    'deskryptor bez parowania z Oracle — dopisz powód do ORACLE_SKIP albo popraw dane');
});

test('M428: dowód RED — skan łapie oba znalezione rozjazdy', () => {
  const wrong = {
    id: 'syntetyk',
    oracleText: 'Flashback {3}{G}{W} (You may cast this card from your graveyard for its flashback cost.)',
    spell: { flashback: { cost: 4, colors: ['G', 'W'] } },
  };
  const surgeWrong = {
    id: 'syntetyk-2',
    oracleText: 'Surge {1}{R} (You may cast this spell for its surge cost.)',
    surge: { cost: 3, colors: ['R'] },
  };
  const { offenders } = scanAmounts([wrong, surgeWrong]);
  assert.equal(offenders.length, 2, `skan przepuścił rozjazd: ${offenders.join(' | ')}`);
  assert.match(offenders[0], /oracle=\{3\}\{G\}\{W\} def=\{2\}\{G\}\{W\}/);
  assert.match(offenders[1], /oracle=\{1\}\{R\} def=\{2\}\{R\}/);

  // Kontrola negatywna: te same karty z poprawną kwotą przechodzą.
  const fixed = scanAmounts([
    { ...wrong, spell: { flashback: { cost: 5, colors: ['G', 'W'] } } },
    { ...surgeWrong, surge: { cost: 2, colors: ['R'] } },
  ]);
  assert.deepEqual(fixed.offenders, []);
});

test('M428: F1 Join the Dance — flashback {3}{G}{W} = 5 many', () => {
  const def = REGISTRY.get('join-the-dance');
  assert.deepEqual(def.spell.flashback, { cost: 5, colors: ['G', 'W'] });
  assert.equal(costSymbols(def.spell.flashback.cost, def.spell.flashback.colors), '{3}{G}{W}');
  assert.match(def.oracleText, /Flashback \{3\}\{G\}\{W\}/, 'deskryptor zgadza się z Oracle obok');
});

test('M428: F3 Boulder Salvo — surge {1}{R} = 2 many', () => {
  const def = REGISTRY.get('boulder-salvo');
  assert.deepEqual(def.surge, { cost: 2, colors: ['R'] });
  assert.equal(costSymbols(def.surge.cost, def.surge.colors), '{1}{R}');
  assert.match(def.oracleText, /Surge \{1\}\{R\}/, 'deskryptor zgadza się z Oracle obok');
});

// --- F2: etykieta flashbacku (render.js) -------------------------------------

const LABEL_VIEW = (objects) => ({
  zones: { hand: objects, battlefield: objects, stack: [], graveyard: objects, library: [], exile: [] },
  players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
});
const labelSession = (names) => ({
  nameOf: (id) => names[id] ?? String(id),
  cardDetails: (cardId) => REGISTRY.get(cardId),
  state: { objects: new Map() },
});

/** Tytuł grupy flashbacku w kanale TEKSTOWYM (bez HTML-a ikon). */
function flashbackGroupTitle(cardId, objectId = 'o1') {
  const view = LABEL_VIEW([{ id: objectId, cardId, zone: 'graveyard' }]);
  const session = labelSession({ [objectId]: cardId });
  return choiceGroupTitle({
    options: [{ type: 'cast_flashback', objectId }, { type: 'cast_flashback', objectId }],
  }, session, view);
}

test('M428: F2 etykieta flashbacku pokazuje PIPY, nie gołą kwotę', () => {
  // Dowód z transkryptów audytu: „>> Flashback: Memory's Journey (koszt 1)"
  // (druk: {G}) i „>> Flashback: Join the Dance (koszt 4)" (druk: {3}{G}{W}).
  const memory = flashbackGroupTitle('memory-s-journey');
  assert.match(memory, /\(\koszt \{G\}\)/, `pip {G} w etykiecie: ${memory}`);
  assert.doesNotMatch(memory, /\(\koszt 1\)/, 'gołe „1" to cena generyczna, której nie ma w koszcie');

  const dance = flashbackGroupTitle('join-the-dance');
  assert.match(dance, /\(\koszt \{3\}\{G\}\{W\}\)/, `pełny koszt {3}{G}{W}: ${dance}`);
});

test('M428 (klasa): każda etykieta flashbacku niesie symbole z Oracle', () => {
  const cards = REGISTRY.all().filter((c) => c.spell?.flashback);
  assert.ok(cards.length >= 3, `rodzina flashbacku: ${cards.length} kart`);
  const offenders = [];
  for (const card of cards) {
    const oracle = oracleCostSymbols(card.oracleText, 'Flashback');
    const label = flashbackGroupTitle(card.id, `o-${card.id}`);
    for (const symbol of oracle.matchAll(/\{[^}]+\}/g)) {
      if (!label.includes(symbol[0])) offenders.push(`${card.id}: brak ${symbol[0]} w „${label}"`);
    }
    if (/\(\koszt \d+\)/.test(label)) offenders.push(`${card.id}: goła kwota w „${label}"`);
  }
  assert.deepEqual(offenders, [], 'etykiety flashbacku bez symboli z Oracle');
});

test('M428: etykiety pojedynczej komendy (panel działań) też niosą pipy', () => {
  // `commandLabel` to drugie miejsce z tym samym kosztem (A/M268: dwie kopie
  // składanki kosztu rozjeżdżają się — dlatego oba czytają `costSymbols`).
  for (const [cardId, shape] of [['memory-s-journey', /ms-g/], ['join-the-dance', /ms-c.*ms-g.*ms-w/s]]) {
    const objectId = `o-${cardId}`;
    const view = LABEL_VIEW([{ id: objectId, cardId, zone: 'graveyard' }]);
    const label = commandLabel(
      { type: 'cast_flashback', objectId, targets: [], playerId: 'p1' },
      labelSession({ [objectId]: cardId }), view,
    );
    assert.match(label, shape, `pip w etykiecie komendy (${cardId}): ${label}`);
  }
});
