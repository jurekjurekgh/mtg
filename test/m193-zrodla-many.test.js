// M193 — zgloszenie wlasciciela A/A1 (2026-08-22):
// A  — Dismal Backwater nie jest traktowana jako zrodlo many kolorowej,
//      wiec czar z pipem {U}/{B} nie ma oferty rzutu (auto-pass konczy ture).
// A1 — log aktywacji pisze zargon symboli „({U}, {B})" zamiast polskiego
//      zdania „1 many niebieskiej lub czarnej".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { getSourceForObject } from '../src/engine/mana-sources.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 193, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

/**
 * Karta katalogu o DOKLADNIE takim koszcie many, nadajaca sie na scenariusz
 * oferty: PERMANENT bez wymaganych celow i bez kosztow dodatkowych. Inaczej
 * test mierzylby cos innego niz zamierza — pierwszy {1}{B} w katalogu to
 * Fake Your Own Death („target creature you control"), ktory bez stwora na
 * stole nie ma oferty NIEZALEZNIE od many.
 */
function cardWithCost(cost) {
  const card = REGISTRY.all().find((c) => MANA_COSTS[c.id] === cost
    && (c.types ?? []).some((t) => ['Creature', 'Artifact', 'Enchantment'].includes(t))
    && !(c.abilities ?? []).some((a) => a?.type === 'triggered' && a?.trigger?.requiresTarget)
    && !c.spell?.targets?.length
    && !c.additionalCost);
  assert.ok(card, `katalog ma permanent bez celu o koszcie ${cost}`);
  return card;
}

function hasCastOffer(state, playerId, objectId) {
  return playerView(state, playerId).legalCommands
    .some((c) => (c.type === 'cast_spell' || c.type === 'cast_permanent') && c.objectId === objectId);
}

// ---- A: kolory zrodel many czytane z Oracle, nie z recznej mapy ----------
// Zgloszenie doslownie: „Karta Dismal Backwater — nie jest traktowana przez
// engine jako zrodlo many (czarnej albo niebieskiej) — mimo, ze mam ja na
// stole i wraz z innym ladem daje mi mozliwosc rzucenia czaru to nie widze
// oferty rzucenia tego czaru w Twoje dzialania."

test('M193/A: Dismal Backwater + Mountain daje ofertę czaru za {1}{U}', () => {
  const state = game('p1');
  const spell = cardWithCost('{1}{U}');
  putCard(state, 'db', 'dismal-backwater', 'p1');
  putCard(state, 'mtn', 'basic-mountain', 'p1');
  putCard(state, 'spell', spell.id, 'p1', 'hand');
  assert.ok(hasCastOffer(state, 'p1', 'spell'),
    `Oracle Dismal Backwater: „{T}: Add {U} or {B}" — pip {U} MUSI dać się opłacić `
    + `(czar ${spell.name}); bez oferty auto-pass oddaje priorytet i kończy turę`);
});

test('M193/A: Dismal Backwater + Mountain daje ofertę czaru za {1}{B}', () => {
  const state = game('p1');
  const spell = cardWithCost('{1}{B}');
  putCard(state, 'db', 'dismal-backwater', 'p1');
  putCard(state, 'mtn', 'basic-mountain', 'p1');
  putCard(state, 'spell', spell.id, 'p1', 'hand');
  assert.ok(hasCastOffer(state, 'p1', 'spell'),
    'drugi kolor tej samej zdolności („or {B}") też musi płacić pip');
});

test('M193/A: kontrola negatywna — Dismal Backwater NIE płaci pipa {R}', () => {
  // Anty-over-fix: naprawa nie może zrobić z każdego landu źródła any-color.
  const state = game('p1');
  const spell = cardWithCost('{1}{R}');
  putCard(state, 'db', 'dismal-backwater', 'p1');
  putCard(state, 'isl', 'basic-island', 'p1');
  putCard(state, 'spell', spell.id, 'p1', 'hand');
  assert.equal(hasCastOffer(state, 'p1', 'spell'), false,
    'Oracle daje wyłącznie {U} albo {B} — {R} nie ma z czego zapłacić');
});

test('M193/A: kontrola — koszt czysto generyczny działał i nadal działa', () => {
  // Wlasciciel: „w kolejnej turze moglem rzucic inny czar, ktory tapnal
  // Dismal Backwater na mane bezkolorowa (artefakt)" — ta sciezka byla OK.
  const state = game('p1');
  const spell = cardWithCost('{2}');
  putCard(state, 'db', 'dismal-backwater', 'p1');
  putCard(state, 'mtn', 'basic-mountain', 'p1');
  putCard(state, 'spell', spell.id, 'p1', 'hand');
  assert.ok(hasCastOffer(state, 'p1', 'spell'), 'koszt generyczny bez pipów');
});

test('M193/A: Balamb Garden (druga karta tej samej klasy) płaci pip {G}', () => {
  const state = game('p1');
  const spell = cardWithCost('{1}{G}');
  putCard(state, 'balamb', 'balamb-garden-seed-academy', 'p1');
  putCard(state, 'mtn', 'basic-mountain', 'p1');
  putCard(state, 'spell', spell.id, 'p1', 'hand');
  assert.ok(hasCastOffer(state, 'p1', 'spell'),
    'Oracle: „{T}: Add {G} or {U}" — to ta sama klasa błędu, nie druga łatka');
});

// ---- A: STRAZNIK katalogu — Oracle vs kolory znane silnikowi -------------

test('M193/A: STRAŻNIK — kolory z Oracle „Add …" zgadzają się z silnikiem', () => {
  // Root cause byl KLASOWY: getSourceForObject czytal reczna mape zamiast
  // deskryptorow karty, wiec kazda nowa karta ze zdolnoscia many po cichu
  // produkowala mane bezbarwna. Straznik czerwienieje w dniu, w ktorym ktos
  // doda kolejna taka karte (L28) — parsuje ORACLE, wiec lapie takze brak
  // zakodowanej zdolnosci (przypadek Fertile Thicket).
  const ANY = ['W', 'U', 'B', 'R', 'G'];
  /**
   * Kolory, ktore karta produkuje ZA SAMO {T} wg Oracle.
   * - reminder text (CR 207.2, tekst w nawiasach) jest nieoperacyjny i opisuje
   *   cudze zdolnosci — „(It's an artifact with \"{T}, Sacrifice this token:
   *   Add one mana of any color.\")" to token Skarbu, nie Marut/Thieves' Tools;
   * - liczy sie KOSZT: „{1}, {T}: Add one mana of any color" (Heap Gate) ani
   *   „{1}: Add {U}, {R}, or {W}" (Jeskai Devotee) nie sa dostepne od reki,
   *   wiec auto-tap ich nie uzywa i silnik slusznie ich nie zna.
   */
  const oracleFreeManaColors = (text) => {
    if (!text) return null;
    const withoutReminder = text.replace(/\([^)]*\)/g, '');
    const out = new Set();
    let found = false;
    for (const line of withoutReminder.split('\n')) {
      const m = line.match(/^(.*?):\s*Add\s+([^.]*)/);
      if (!m) continue;
      const [, cost, produced] = m;
      // koszt musi byc SAMYM {T} — kazdy inny skladnik czyni produkcje platna
      if (cost.replace(/\s/g, '') !== '{T}') continue;
      found = true;
      if (/one mana of any color/i.test(produced)) { ANY.forEach((c) => out.add(c)); continue; }
      // „or one mana of the chosen color" (Manor Gate) — kolor znany dopiero
      // na obiekcie gry (chosenColor), wiec tu go nie wymagamy.
      for (const sym of produced.matchAll(/\{([WUBRGC])\}/g)) if (sym[1] !== 'C') out.add(sym[1]);
    }
    return found ? [...out] : null;
  };
  const rozjazdy = [];
  for (const card of REGISTRY.all()) {
    const oracle = oracleFreeManaColors(card.oracleText);
    if (!oracle || oracle.length === 0) continue;
    const object = {
      id: 'probe', cardId: card.id, controllerId: 'p1', zone: 'battlefield',
      ...gameObjectDataOf(card), types: card.types ?? [], subtypes: card.subtypes ?? [],
    };
    const engine = getSourceForObject(object)?.colors ?? [];
    const brakuje = oracle.filter((c) => !engine.includes(c));
    if (brakuje.length) rozjazdy.push(`${card.name}: Oracle obiecuje {${brakuje.join('}{')}}, silnik zna [${engine.join('') || 'brak'}]`);
  }
  assert.deepEqual(rozjazdy, [],
    `źródła many muszą znać kolory z Oracle (dopisz je do deskryptora zdolności `
    + `karty — NIE do MANA_SOURCE_MAP):\n${rozjazdy.join('\n')}`);
});

test('M193/A: STRAŻNIK sam się sprawdza — wykryłby kartę bez kolorów', () => {
  // Kontrola strazika (L15: straznik, ktory nigdy nie czerwienieje, jest
  // dekoracja). Syntetyczny land z Oracle „{T}: Add {W}" bez deskryptora
  // musi byc widziany jako zrodlo BEZBARWNE — czyli straznik ma czym trafic.
  const engine = getSourceForObject({
    id: 'x', cardId: 'syntetyk', kind: 'land', types: ['Land'], subtypes: [], abilities: [],
  })?.colors ?? [];
  assert.deepEqual(engine, [], 'land bez deskryptora i bez podtypu = bezbarwny');
});

// ---- A: anty-over-fix — koszt zdolnosci decyduje o DARMOWEJ produkcji ----

test('M193/A: zdolność many z kosztem many NIE podnosi darmowej produkcji', () => {
  // Heap Gate: „{T}: Add {C}" (darmowa) + „{1},{T}: Add one mana of any
  // color" (platna). Gdyby oferta liczyla kolory platnej zdolnosci jako
  // dostepne od reki, silnik zaproponowalby czar, ktorego NIE DA sie
  // oplacic — odwrotny bug tej samej klasy (L48: oferta = platnosc).
  const state = game('p1');
  const spell = cardWithCost('{1}{R}');
  putCard(state, 'heap', 'heap-gate', 'p1');
  putCard(state, 'isl', 'basic-island', 'p1');
  putCard(state, 'spell', spell.id, 'p1', 'hand');
  assert.equal(hasCastOffer(state, 'p1', 'spell'), false,
    'kolor z płatnej zdolności ({1},{T}) nie jest dostępny za darmo');
});

test('M193/A: Fertile Thicket ma zakodowaną zdolność many z Oracle', () => {
  // Oracle: „{T}: Add {G}." — bez tej zdolnosci land jest bezbarwnym
  // zrodlem, czyli kolejny wariant zgloszenia A.
  const object = {
    id: 'ft', cardId: 'fertile-thicket', controllerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(REGISTRY.get('fertile-thicket')), types: ['Land'], subtypes: [],
  };
  assert.deepEqual(getSourceForObject(object)?.colors, ['G'],
    'Oracle „{T}: Add {G}" — land produkuje zieloną');
});

// ---- A1: opis produkcji many po polsku ----------------------------------
// Zgloszenie: „Aktywujesz zdolnosc: Dismal Backwater — dodanie many do puli
// ({U}, {B})" powinno brzmiec „dodanie 1 many niebieskiej lub czarnej do puli".

test('M193/A1: log aktywacji nazywa kolory po polsku, nie symbolami', async () => {
  const { manaEffectLabel } = await import('../src/table/session.js');
  const label = manaEffectLabel({ type: 'add_mana', amount: 1, colors: ['U', 'B'] });
  assert.match(label, /niebiesk|czarn/,
    `opis ma nazywać kolory po polsku, a nie „{U}, {B}" (dostałem: „${label}")`);
  assert.doesNotMatch(label, /\{[WUBRG]\}/, 'żargon symboli nie trafia do gracza');
});

test('M193/A1: jedna mana konkretnego koloru — bez listy w nawiasach', async () => {
  const { manaEffectLabel } = await import('../src/table/session.js');
  const label = manaEffectLabel({ type: 'add_mana', amount: 1, colors: ['W'] });
  assert.match(label, /biał/, `„{W}" to mana biała (dostałem: „${label}")`);
});

test('M193/A1: pięć kolorów nadal czyta się jako „dowolnego koloru" (M190/A2)', async () => {
  const { manaEffectLabel } = await import('../src/table/session.js');
  const label = manaEffectLabel({ type: 'add_mana', amount: 1, colors: ['W', 'U', 'B', 'R', 'G'] });
  assert.match(label, /dowolnego koloru/, 'kontrola: naprawa M190/A2 zostaje');
});

test('M193/A1: brak kolorów = mana bezbarwna (kontrola)', async () => {
  const { manaEffectLabel } = await import('../src/table/session.js');
  assert.match(manaEffectLabel({ type: 'add_mana', amount: 1, colors: [] }), /bezbarwn/);
});

test('M193/A1: log NIE dubluje opisu efektu many', async () => {
  // Pulapka znaleziona weryfikacja RECZNA, nie testem: staly napis
  // „dodanie many do puli" (ABILITY_EFFECT_LABELS) sklejal sie z nowym
  // opisem produkcji, dajac „… — dodanie many do puli — dodanie 1 many
  // niebieskiej lub czarnej do puli". Test pilnuje JEDNEGO opisu.
  const { describeGameEvent } = await import('../src/table/session.js');
  const line = String(describeGameEvent({
    type: 'ability_activated', playerId: 'p1', cardId: 'dismal-backwater',
    effectTypes: ['add_mana'], manaColors: ['U', 'B'], manaAmount: 1,
  }, { nameOf: () => 'Dismal Backwater', nameOfObject: () => '?', isPlayer: (id) => id === 'p1' },
  { p1: 'Ty' }));
  assert.equal(line.match(/dodanie/g)?.length, 1,
    `opis efektu ma wystąpić RAZ: ${JSON.stringify(line)}`);
  assert.match(line, /dodanie 1 many niebieskiej lub czarnej do puli/,
    `dokładne brzmienie ze zgłoszenia właściciela: ${JSON.stringify(line)}`);
});

test('M193/A1: dwie many jednego koloru mają poprawną odmianę', async () => {
  // Moonscarred Werewolf „{T}: Add {G}{G}" — „2 many zielonych", nie
  // „2 many zielonej" (druga pulapka z weryfikacji recznej).
  const { manaProducedLabel } = await import('../src/table/session.js');
  assert.equal(manaProducedLabel(2, ['G']), 'dodanie 2 many zielonych do puli');
  assert.equal(manaProducedLabel(1, ['G']), 'dodanie 1 many zielonej do puli');
});
