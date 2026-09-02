// M291 (tura 11, decyzja (b) właściciela: „pokrycie kreatora celu podnoszą tylko
// NOWE karty wielocelowe”). Raport §13.8 zmierzył, że na 443 wspierane karty tylko
// 7 deklaruje >1 celu, a ADR 0023 trzyma każdą z nich w innej talii — więc żadna
// para talii nie dochodziła do decyzji wielocelowej (4 partie: 0 otwarć pickera).
//
// Ta rodzina testów domyka dwie rzeczy naraz:
//   1. nową kartę (Coordinated Assault, CLU 128) — dane 1:1 ze Scryfalla,
//      docs/cards/scryfall-coordinated-assault.json (ADR 0010 §2a, L26);
//   2. generyczny wzorzec `allTargets` na TORZE CZARU — „up to two target
//      creatures EACH get …” to dla silnika inny kształt niż dwa sloty z
//      różnymi efektami (Diplomatic Relations): ten sam efekt na każdym celu.
//      Fan-out istniał dotąd tylko dla triggerów (applyTriggerEffects, M157
//      F4(a) — Weftblade Enhancer); bez niego czar pompowałby pierwszy cel
//      dwa razy, a drugi wcale.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveKeywords } from '../src/engine/permanents.js';

const REGISTRY = createCardRegistry();
const KARTA = 'coordinated-assault';

function game(playerId = 'p1') {
  const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
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

/** Rzucenie czaru z `targets` (w tej samej kolejności co sloty w deskryptorze). */
function rzuc(state, objectId, targets) {
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === objectId
      && JSON.stringify(c.targets ?? []) === JSON.stringify(targets));
  assert.ok(cast, `oferta rzutu z celami ${JSON.stringify(targets)}: `
    + JSON.stringify(playerView(state, 'p1').legalCommands
      .filter((c) => c.type === 'cast_spell' && c.objectId === objectId)
      .map((c) => c.targets ?? [])));
  assert.ok(execute(state, cast).ok, 'execute rzutu');
  return cast;
}

const stow = (state, id) => state.objects.get(id);

/** Pasywna odpowiedź aż stos zejdzie (brak komendy „resolve_stack" — CR 117.12). */
function resolveStack(state, max = 14) {
  for (let i = 0; i < max && state.zones.stack.length > 0; i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0;
}
const maKeyword = (state, id, kw) => effectiveKeywords(state.objects.get(id), state).includes(kw);

test('M291/1: karta istnieje, jest wspierana i ma pełny Oracle z druku CLU 128', () => {
  const def = REGISTRY.get(KARTA);
  assert.ok(def, 'karta w rejestrze');
  assert.equal(def.name, 'Coordinated Assault');
  assert.equal(def.set, 'CLU');
  assert.equal(def.support?.status, 'supported', 'bez statusu limited — nic tu nie jest umowne');
  assert.equal(def.manaCost, 1, 'cmc {R} = 1');
  assert.deepEqual(def.colors, ['R']);
  assert.equal(def.oracleText,
    'Up to two target creatures each get +1/+0 and gain first strike until end of turn. (They deal combat damage before creatures without first strike.)');
  const snapshot = JSON.parse(fs.readFileSync('docs/cards/scryfall-coordinated-assault.json', 'utf8'));
  assert.equal(snapshot.oracle_text.replace(/\\n/g, '\n'), def.oracleText, 'katalog = wydruk Oracle (L23)');
  assert.equal(snapshot.set + '/' + snapshot.collector_number, 'clu/128', 'wskazany druk');
  assert.match(def.imageUri, /e1741b97-b75f-49a3-a930-e0eefda9d5be/, 'adres ilustracji z UUID druku (M117)');
});

test('M291/2: „each of up to two” — oba cele dostają pompę I first strike', () => {
  const state = game('p1');
  putCard(state, 'spr', KARTA, 'p1', 'hand');
  putCard(state, 'a', 'highland-game', 'p1');   // 2/1
  putCard(state, 'b', 'leafcrown-dryad', 'p1'); // 2/2
  addMana(state, 'p1', 1, { colors: ['R'] });
  rzuc(state, 'spr', ['a', 'b']);
  assert.ok(resolveStack(state));
  assert.equal(effectivePower(stow(state, 'a'), state), 3, 'cel 0: 2+1');
  assert.equal(effectivePower(stow(state, 'b'), state), 3, 'cel 1: 2+1 (bez fan-outu to byłoby 2)');
  assert.ok(maKeyword(state, 'a', 'first_strike'), 'cel 0 ma first strike');
  assert.ok(maKeyword(state, 'b', 'first_strike'), 'cel 1 ma first strike (też efekt wielokrotny)');
});

test('M291/3: „up to” pozwala zatrzymać się na jednym celu', () => {
  const state = game('p1');
  putCard(state, 'spr', KARTA, 'p1', 'hand');
  putCard(state, 'a', 'highland-game', 'p1');
  putCard(state, 'b', 'leafcrown-dryad', 'p1');
  addMana(state, 'p1', 1, { colors: ['R'] });
  rzuc(state, 'spr', ['a', null]);
  assert.ok(resolveStack(state));
  assert.equal(effectivePower(stow(state, 'a'), state), 3, 'wybrany cel dostaje pompę');
  assert.equal(effectivePower(stow(state, 'b'), state), 2, 'niewybrany slot nie pompuje nikogo');
  assert.equal(maKeyword(state, 'b', 'first_strike'), false, 'ani keyworda');
});

test('M291/4: wariant bez żadnego celu jest legalny (CR 601.2c — „up to” znosi wymóg)', () => {
  const state = game('p1');
  putCard(state, 'spr', KARTA, 'p1', 'hand');
  putCard(state, 'a', 'highland-game', 'p1');
  addMana(state, 'p1', 1, { colors: ['R'] });
  const warianty = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'spr')
    .map((c) => c.targets ?? []);
  assert.ok(warianty.some((t) => t.every((x) => x == null)),
    `musi istnieć wariant bez celów, jest: ${JSON.stringify(warianty)}`);
  rzuc(state, 'spr', [null, null]);
  assert.ok(resolveStack(state));
  assert.equal(effectivePower(stow(state, 'a'), state), 2, 'nikt nie jest pumpowany');
  const wGrobie = [...state.objects.values()].find((o) => o.cardId === KARTA && o.zone === 'graveyard');
  assert.ok(wGrobie, 'czar idzie do grobu, nie jest countered (CR 608.2 — brak celów ≠ kontr)');
});

test('M291/5: „any creature” = także stwór przeciwnika; dwa sloty mogą wskazać tego samego… nie, muszą być różne', () => {
  const state = game('p1');
  putCard(state, 'spr', KARTA, 'p1', 'hand');
  putCard(state, 'moj', 'highland-game', 'p1');
  putCard(state, 'ich', 'alaborn-trooper', 'p2');
  addMana(state, 'p1', 1, { colors: ['R'] });
  rzuc(state, 'spr', ['ich', 'moj']);
  assert.ok(resolveStack(state));
  assert.equal(effectivePower(stow(state, 'ich'), state), 3, 'wróg też jest prawnym celem (brak „you control”)');
  assert.equal(effectivePower(stow(state, 'moj'), state), 3);
  // Ten sam obiekt w dwóch slotach: „each of up to two target creatures” to DWA
  // różne cele (CR 114.5 — ten sam obiekt nie może być wybranym celem dwa razy
  // w jednej liście), więc oferta taka nie powstaje.
  const duplikat = playerView(state, 'p1').legalCommands
    .some((c) => c.type === 'cast_spell' && c.objectId === 'spr'
      && (c.targets ?? []).length === 2 && c.targets[0] === c.targets[1]);
  assert.equal(duplikat, false, 'brak wariantu z tym samym celem dwa razy');
});

test('M291/6: first strike z czaru realnie zmienia kolejność obrażeń w walce', () => {
  // Highland Game 2/1 (+1/+0 = 3/1, first strike) blokowany przez 3/3 bez
  // first strike'a: najpierw cios atakującego, obrońca ginie i NIE uderza.
  const state = game('p1');
  putCard(state, 'spr', KARTA, 'p1', 'hand');
  putCard(state, 'atak', 'highland-game', 'p1', 'battlefield', { summoningSickness: false });
  putCard(state, 'blok', 'leafcrown-dryad', 'p2'); // 2/2 → za dużo do przeżycia? 3 obrażenia na 2 toughness = śmierć
  addMana(state, 'p1', 1, { colors: ['R'] });
  rzuc(state, 'spr', ['atak', null]);
  assert.ok(resolveStack(state));
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  assert.ok(execute(state, {
    type: 'declare_attackers', playerId: 'p1', attackerIds: ['atak'],
  }).ok, 'deklaracja ataku');
  assert.ok(execute(state, {
    type: 'declare_blockers', playerId: 'p2', assignments: { atak: ['blok'] },
  }).ok, 'blok');
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok);
  // Pole bitwy opuszcza się przez NOWY obiekt w grobie (id się zmienia), więc
  // sprawdzamy po cardId, nie po id z helpera.
  const wGrobie = [...state.objects.values()]
    .some((o) => o.cardId === 'leafcrown-dryad' && o.zone === 'graveyard');
  assert.ok(wGrobie, 'first strike zabija blokera w pierwszym kroku obrażeń');
  const atak = state.objects.get('atak');
  assert.ok(atak && atak.zone === 'battlefield',
    'a atakujący przeżywa — bez first strike’a dostałby 2 obrażenia na 1 toughness');
});


test('M291/7: fan-out `allTargets` nie jest wdrażany „na kartach” — jest deskryptorem', () => {
  const zrodlo = fs.readFileSync('src/engine/spells.js', 'utf8');
  const start = zrodlo.indexOf('if (effects[i].allTargets === true)');
  assert.ok(start > 0, 'gałąź allTargets istnieje w torze czaru');
  const blok = zrodlo.slice(start, start + 520);
  assert.equal(/coordinated|assault/i.test(blok), false, 'silnik nie zna nazw kart (ADR 0002)');
  assert.match(blok, /if \(targetId == null\) continue;/, 'pominięty cel opcjonalny nie kosztuje efektu');
  assert.match(blok, /continue;/, 'efekt allTargets nie wchodzi w ścieżkę blokującą pendingSpell');
  // Strażnik kombinacji: efekt blokujący decyzją (scry/surveil → pendingSpell)
  // nie może być jednocześnie allTargets — finishPendingSpell dokańcza listę z
  // PEŁNĄ listą celów i zgubiłby per-celowość.
  const dane = fs.readFileSync('src/cards/card-data.js', 'utf8');
  const blokujace = new Set(['scry', 'surveil', 'choose_a_number', 'reveal_hand_choose_discard',
    'resolve_modal_choice', 'gain_life_choice']);
  for (const match of dane.matchAll(/\{([^{}]*allTargets: true[^{}]*)\}/g)) {
    const typ = /type: '([a-z_]+)'/.exec(match[1])?.[1];
    assert.ok(typ && !blokujace.has(typ), `efekt ${typ} nie może mieć allTargets (blokuje decyzją)`);
  }
});

test('M291/8: karta trafiła do dokładnie jednej talii i realnie gra z niej (ADR 0023)', () => {
  const wpisane = fs.readdirSync('decks').filter((plik) => {
    if (!plik.endsWith('.txt')) return false;
    return /^\d+x Coordinated Assault$/m.test(fs.readFileSync(`decks/${plik}`, 'utf8'));
  });
  assert.deepEqual(wpisane, ['ravnica.txt'],
    `karta planu „Ravnica” musi trafić do talii ravnica — generator dał: ${wpisane.join(', ')}`);
  // Nazwa w tekście talii = nazwa druku (inakij strażnik round-tripu by milczał).
  const talia = fs.readFileSync('decks/ravnica.txt', 'utf8');
  assert.match(talia, /^1x Coordinated Assault$/m, 'singleton, jedna kopia');
  const gorskie = (talia.match(/^(\d+)x Mountain$/m) ?? [null, '0'])[1];
  assert.ok(Number(gorskie) >= 2, `nowy pikol {R} musial dołożyć góry (jest ${gorskie})`);
});

// -----------------------------------------------------------------------------
// Dual Shot (SOI 153) — DRUGI kształt wielocelowości na tym samym deskryptorze.
// Karta wpada tu nie dlatego, że „też ma dwa cele\", ale dlatego, że rodzina
// `allTargets` musi być zmierzona na dwóch różnych efektach: pump+grant (wyżej)
// oraz czyste obrażenia (niżej). Ruling WotC dla tego druku (2017-09-29):
//   „You can’t target the same creature twice to have Dual Shot deal 2 damage to it.\"
// — sprawdzamy go w M291/D5, bo to jedyny sposób, w jaki ta karta mogłaby zostać
// nadużyta (2 obrażenia w jeden cel = „Zapłać {R}, zabij 2/1\").
// -----------------------------------------------------------------------------

test('M291/D1: Dual Shot istnieje, a katalog = druk SOI 153 (bez domieszki z pamięci)', () => {
  const def = REGISTRY.get('dual-shot');
  assert.ok(def, 'karta w rejestrze');
  assert.equal(def.name, 'Dual Shot');
  assert.equal(def.set, 'SOI');
  assert.equal(def.manaCost, 1);
  assert.equal(def.oracleText, 'Dual Shot deals 1 damage to each of up to two target creatures.');
  const snapshot = JSON.parse(fs.readFileSync('docs/cards/scryfall-dual-shot.json', 'utf8'));
  assert.equal(snapshot.oracle_text, def.oracleText, 'tekst reguł 1:1 ze źródłem (L23)');
  assert.equal(snapshot.set + '/' + snapshot.collector_number, 'soi/153');
  assert.equal(snapshot.legalities.modern, 'legal', 'talia benchmarkowa gra Modernem');
  assert.match(def.imageUri, /b7ac4fa4-4a03-41a9-b7e4-c3a6da89472f/, 'ilustracja z UUID druku (M117)');
  assert.equal(snapshot.rulings.length, 1, 'ruling pobrany i zapisany w snapshocie');
});

test('M291/D2: obrażenia lecą na KAŻDY wskazany cel (nie dwa razy na pierwszy)', () => {
  const state = game('p1');
  putCard(state, 'dual', 'dual-shot', 'p1', 'hand');
  putCard(state, 'slaby', 'highland-game', 'p1');   // 2/1 — 1 obrażenia zabijają
  putCard(state, 'mocny', 'leafcrown-dryad', 'p2'); // 2/2 — przeżywa z 1
  addMana(state, 'p1', 1, { colors: ['R'] });
  rzuc(state, 'dual', ['slaby', 'mocny']);
  assert.ok(resolveStack(state));
  // Pole bitwy opuszcza NOWY obiekt w grobie (id znika), więc zabitego celu
  // szukamy po cardId — żywego po id.
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'highland-game' && o.zone === 'graveyard'),
    'cel 0: 2/1 ginie od 1 obrażenia');
  assert.equal(state.objects.get('mocny').damage, 1, 'cel 1: dokładnie 1 obrażenia (bez fan-outu byłoby 0)');
});

test('M291/D3: „up to\" — jeden cel wystarczy, drugi slot może zostać pusty', () => {
  const state = game('p1');
  putCard(state, 'dual', 'dual-shot', 'p1', 'hand');
  putCard(state, 'a', 'highland-game', 'p1');   // 2/1 — nie wskazany, ma przeżyć
  putCard(state, 'b', 'leafcrown-dryad', 'p1'); // 2/2 — wskazywany, przeżyje z 1
  addMana(state, 'p1', 1, { colors: ['R'] });
  rzuc(state, 'dual', [null, 'b']);
  assert.ok(resolveStack(state));
  assert.equal(state.objects.get('b').damage, 1, 'obrażenia idą do wskazanego slotu 1');
  assert.equal(state.objects.get('a').damage ?? 0, 0, 'cel niewskazany nie dostaje nic');
});

test('M291/D4: wariant bez celów jest legalny i rozstrzyga się bez efektu', () => {
  const state = game('p1');
  putCard(state, 'dual', 'dual-shot', 'p1', 'hand');
  putCard(state, 'a', 'leafcrown-dryad', 'p1');
  addMana(state, 'p1', 1, { colors: ['R'] });
  rzuc(state, 'dual', [null, null]);
  assert.ok(resolveStack(state));
  assert.equal(state.objects.get('a').damage ?? 0, 0, 'nikt nie oberwał');
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'dual-shot' && o.zone === 'graveyard'),
    'czar trafił do grobu (nie został skontrowany)');
});

test('M291/D5: ruling WotC — tego samego stworzenia nie można wskazać dwa razy', () => {
  const state = game('p1');
  putCard(state, 'dual', 'dual-shot', 'p1', 'hand');
  putCard(state, 'ofic', 'leafcrown-dryad', 'p1');
  addMana(state, 'p1', 1, { colors: ['R'] });
  const warianty = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'dual')
    .map((c) => c.targets ?? []);
  assert.ok(warianty.length > 0, 'czar jest rzucalny');
  assert.equal(warianty.some((t) => t.length === 2 && t[0] != null && t[0] === t[1]), false,
    `brak wariantu z dublowanym celem (CR 114.5 + ruling 2017-09-29): ${JSON.stringify(warianty)}`);
});

test('M291/D6: Dual Shot gra z talii — dokładnie jednej, innistradowej (M178/ADR 0023)', () => {
  const wpisane = fs.readdirSync('decks').filter((plik) => plik.endsWith('.txt')
    && /^\d+x Dual Shot$/m.test(fs.readFileSync(`decks/${plik}`, 'utf8')));
  assert.deepEqual(wpisane, ['innistrad-brg.txt'],
    `plan 'Innistrad' + czerwony piksel → połowa BRG; generator dał: ${wpisane.join(', ')}`);
});
