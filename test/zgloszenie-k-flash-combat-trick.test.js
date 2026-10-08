// =============================================================================
// Zgłoszenie K (2026-10-08, właściciel) — Village Bell-Ringer:
//   "Flash (You may cast this spell any time you could cast an instant.)
//    When this creature enters, untap all creatures you control."
//   „Karty z flash mają być promowane przez scoring jako COMBAT TRICK:
//    1) w własnej turze bota, gdy jest mana na kreaturę z flash — bot ŚWIADOMIE
//       jej nie rzuca; lądy zostają NIEZATAPIANE (mana trzymana);
//    2) w turze przeciwnika, PO deklaracji atakujących — taka kreatura wchodzi
//       (bot nic nie traci, mana się nie marnuje) i ma szansę ZASKOCZYĆ
//       przeciwnika blokiem, mimo że przeciwnik myślał, że przejdzie;
//    3) ETB Bell-Ringera (odtapowanie własnych stworów) ma być częścią
//       wartości tej gry;
//    4) jeśli przeciwnik NIE zaatakował — kreatura wchodzi w GŁÓWNEJ 2
//       przeciwnika, żeby nie zmarnować zostawionej na nią many."
//
// Pomiar PRZED (sonda `.arena/probe-k-bellringer.mjs`; bot = p1 z Bell-Ringerem
// w ręce, 4 lądy + 3 many w puli, właściciel = p2):
//   | scena                                        | wybór PRZED | nota cast |
//   | main1 bota, wróg 2/4 nietapnięty             | cast        | +67,5     |
//   | main1 bota, wróg 4/4 + 3/3 (duże zagrożenie) | cast        | +67,5     |
//   | tura wroga, beginning_of_combat              | cast        | +71,1     |
//   | tura wroga, declare_attackers (atak 2/4)     | cast        | +71,1     |
//   | tura wroga, declare_blockers (atak 2/4)      | cast        | +71,1     |
//   | tura wroga, main2 (wróg nie atakował)        | cast        | +71,1     |
//   | main1 bota + własny 3/3 do ataku             | cast        | +67,5     |
// Bot nigdy nie trzymał many na zaskoczenie i rzucał natychmiast w KAŻDYM
// kroku. Rozkład noty: ciało 70 + P 2 + T 4 − mana 4 + ETB (płaskie 3) = 75,
// × waga rodziny `permanent` 0,9 = 67,5, + parytet stworów 4 × 0,9 = 71,1.
//
// Przyczyna: baza ciała (~70) była na tyle duża, że znosiła KAŻDY wariant
// rzutu — w tym rzut po deklaracji blokujących, gdzie kreatura wchodząca na
// stół NIE jest zadeklarowanym blokerem (CR 509.1a) i nie zaskoczy już nikogo.
// Klasa awarii: **L50/L131** (efekt bez wyceny wymiaru „czy efekt cokolwiek
// zmienia w DANYM OKNIE") + **L48** (wariant sztuczki bojowej rozstrzygany
// liczbą, nie oknem). ETB „odkręć wszystkie twoje stwory" było płaskie 3 —
// wartość bez wymiaru (ten sam błąd, co w rodzinie okien M235/M257).
//
// Fix (generycznie po deskryptorach `flash` + `Creature`, ADR 0002; cała
// wycena z `PlayerView`, ADR 0017; wspólne dla każdej kreatury z flash, L41):
// - `flashCreatureCastTooEarly(view, def, card)` — kreatura z flash bez haste
//   jest „za wcześnie" w KAŻDYM kroku własnej tury (brak haste = brak ataku
//   w tej turze, CR 302.6) oraz w turze przeciwnika przed `declare_attackers`
//   (wróg dopiero wybiera, z czym atakować — odsłonięcie karty marnuje
//   zaskoczenie) i po `declare_blockers` (okno zaskoczenia minęło). Jedyny
//   okno obronne = `declare_attackers` i tylko gdy kreatura realnie może
//   zablokować któregoś atakującego (`attackerCanBeBlocked` — flying/reach/
//   menace tą samą regułą co wycena ataku, CR 509.1b + M202/H); razem z
//   post-combatem (`main2`/`end`/`cleanup`), gdzie mana by wyparowała
//   (CR 500.5);
// - kara okna: `score = Math.min(score, 0) - P.flashCreatureEarlyWindowPenalty`
//   — wycena karty (ciało + ETB + parytet) jest WYZEROWANA, więc nawet bardzo
//   silne ETB nie wróci ponad pass (L3), a epsilon nadal różnicuje karty
//   z flash (L41/L48 — żadnego remisu rozstrzyganego kolejnością ofert);
// - `untapAllCreaturesValue(view)` — ETB „untap all creatures you control"
//   liczone PO KREATURZE zamiast płaskich 3: odkręcenie się liczy tylko tam,
//   gdzie odkręcony stwór od razu zyskuje akcję — blok w cudzej turze
//   (odkręca tylko WŁAŚCICIEL w swoim kroku odkręcenia, CR 502.3, więc stwory
//   bota po jego ataku są nadal tapnięte) i atak we własnym `precombat_main`/
//   `combat`; poza tymi oknami 0 (stwór odkręciłby się i tak).
//   Wyjątki od kary: haste (kreatura realnie atakuje w tej turze),
//   `entersWithCountersIf` (warunek wejścia zależy od STANU tury) oraz brak
//   możliwości opłacenia kosztu z nietapniętych lądów później (mana
//   jednorazowa — skarb/tap ciała nie przeżyje odroczenia).
//
// Cytaty CR (dosłowny tekst z mirroru `nwgarne/mtg-data`, CR effective
// 2026-09-25, SHA-256 `8d860e45…`, ADR 0030):
// - **302.6**: „A creature's activated ability with the tap symbol or the
//   untap symbol in its activation cost can't be activated unless the creature
//   has been under its controller's control continuously since their most
//   recent turn began. … A creature can't attack unless it has been under its
//   controller's control continuously since their most recent turn began."
// - **509.1a**: „The defending player chooses which creatures they control, if
//   any, will block. The chosen creatures must be untapped and they can't also
//   be battles."
// - **502.3**: „Third, the active player determines which permanents they
//   control will untap. Then they untap them all simultaneously. This
//   turn-based action doesn't use the stack. Normally, all of a player's
//   permanents untap, but effects can keep one or more of a player's
//   permanents from untapping.”
// - **500.5**: „As a step or phase ends, if there are effects that last until
//   the end of that step or phase, those effects expire. Then any unspent mana
//   left in a player's mana pool empties. This is a turn-based action that
//   doesn't use the stack (see rule 703.4q).”
//   mana pool empties."
//
// Dowód mutacyjny (każda mutacja musi wyłączyć konkretne testy):
//   - mK1: usunięta kara okna (cast wraca do bazy): czerwone K/1, K/2, K/3,
//     K/5, K/6;
//   - mK2: kara nie wyzerowała wyceny (tylko −10 do noty): czerwone K/1, K/2;
//   - mK3: `flashCreatureCastTooEarly` nie pyta o blokowalność atakujących:
//     czerwone K/5;
//   - mK4: okno obronne rozszerzone na `declare_blockers`: czerwone K/6;
//   - mK5: okno obronne rozszerzone na własną turę: czerwone K/1;
//   - mK6: `untapAllCreaturesValue` płaskie (3): czerwone K/8;
//   - mK7: `untapAllCreaturesValue` ignoruje `cantBlock`: czerwone K/8b;
//   - mK8: `untapAllCreaturesValue` liczy poza oknem: czerwone K/9;
//   - mK9: reguła dotyka też nie-kreatury (artefakt bez celu, gałąź ciała): czerwone K/13;
//   - mK10: reguła dotyka kreatur bez flash: czerwone K/11 (vanilla w kolorze,
//     który bot może zapłacić z nietapniętych lądów później — inaczej test
//     sprawdzałby wyjątek „brak many na później”, nie izolację rodziny).
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();
const BOT_SEED = 5;

function game(step = 'main1', active = 'p1') {
  const s = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, step, active);
  s.turn.activePlayerId = active;
  s.turn.priorityPlayerId = active;
  for (const p of ['p1', 'p2']) {
    for (let i = 0; i < 10; i += 1) {
      addObject(s, {
        id: `lib-${p}-${i}`, instanceId: `i-lib-${p}-${i}`, cardId: 'basic-plains',
        controllerId: p, ownerId: p, zone: 'library', kind: 'spell', manaCost: 0,
      });
    }
  }
  return s;
}

function put(s, id, cardId, playerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(s, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) s.objects.set(id, Object.freeze({ ...s.objects.get(id), ...patch }));
  return s.objects.get(id);
}

/**
 * Lądy bota (p1): 4 sztuki — koszt Bell-Ringera to 3, więc „później” da się
 * zapłacić. `color` decyduje o tym, czy koszt danej karty da się później opłacić z
 * nietapniętych lądów (wyjątek „brak many na później” w regule okna, ADR 0002).
 */
function lands(s, n = 4, color = 'white') {
  const nazwa = { white: 'plains', blue: 'island', red: 'mountain', green: 'forest', black: 'swamp' }[color];
  const litera = { white: 'W', blue: 'U', red: 'R', green: 'G', black: 'B' }[color];
  for (let i = 0; i < n; i += 1) {
    addObject(s, {
      id: `l${i}`, instanceId: `i-l${i}`, cardId: `basic-${nazwa}`,
      controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'land',
      manaSource: { colors: [litera], amount: 1 },
      types: ['Basic', 'Land'], subtypes: [nazwa], keywords: [], colors: [litera],
    });
  }
}

function creature(s, id, pid, power, toughness, patch = {}) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: pid, ownerId: pid,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 2, abilities: [],
    keywords: [], subtypes: [], types: ['Creature'], colors: [], summoningSickness: false,
  });
  if (Object.keys(patch).length) s.objects.set(id, Object.freeze({ ...s.objects.get(id), ...patch }));
  return s.objects.get(id);
}

/** Scena bota (p1): Bell-Ringer w ręce, 4 lądy + 3 many w puli. */
function scena({ step = 'main1', active = 'p1', cardId = 'village-bell-ringer', mana = 3, foe = [], mine = [], landColor = 'white' } = {}) {
  const s = game(step, active);
  lands(s, 4, landColor);
  addMana(s, 'p1', mana);
  put(s, 'h0', cardId, 'p1', 'hand');
  foe.forEach(([id, power, toughness, patch]) => creature(s, id, 'p2', power, toughness, patch ?? {}));
  mine.forEach(([id, power, toughness, patch]) => creature(s, id, 'p1', power, toughness, patch ?? {}));
  return s;
}

/** Wróg (p2) deklaruje atakujących i oddaje priorytet — priorytet wraca do bota. */
function atakWroga(s, attackerIds, step = 'declare_attackers') {
  s.turn = jumpToStep(s.turn, step, 'p2');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p2';
  assert.ok(execute(s, { type: 'declare_attackers', playerId: 'p2', attackerIds }).ok,
    'deklaracja atakujących');
  assert.ok(execute(s, { type: 'pass_priority', playerId: 'p2' }).ok, 'wróg pasuje');
}

/** Decyzja bota + noty wszystkich wariantów. */
function decyzja(s, playerId = 'p1', seed = BOT_SEED) {
  const bot = createHeuristicBot({ seed });
  const cmd = bot.chooseCommand(playerView(s, playerId));
  const scores = {};
  for (const o of bot.trace().at(-1)?.options ?? []) scores[o.cmd] = o.score;
  return { cmd, scores };
}
const castScore = (scores) => scores['cast_permanent(h0)'];
const passScore = (scores) => scores.pass_priority ?? 0;
/** Kara okna = wyzerowana wycena (0) minus margines, × waga rodziny `permanent` 0,9. */
// Tolerancja 0,01 na epsilon gęstości (0,001 × waluta karty — kroki wyceny są ≥ 0,1,
// więc epsilon nigdy nie odwraca realnej różnicy; pin: „Grzechotka remisów”).
const KARA = -10 * 0.9;

// =============================================================================
// K/1 — własna tura bota: MANA TRZYMANA, lądy nietknięte
// =============================================================================

test('K/1: main1 bota z Bell-Ringerem w ręce → pass (przed fixem cast +67,5)', () => {
  const s = scena({ foe: [['e24', 2, 4]] });
  const { cmd, scores } = decyzja(s);
  assert.equal(cmd.type, 'pass_priority', `bot trzyma manę na zaskoczenie: ${cmd.type}`);
  assert.ok(castScore(scores) <= KARA + 0.01, `wycena wyzerowana i obniżona: ${castScore(scores)}`);
  assert.ok(castScore(scores) < passScore(scores),
    `cast (${castScore(scores)}) < pass (${passScore(scores)})`);
  // Mana TRZYMANA: żadne ląd nie został zatapiony, pula bez zmian (CR 500.5
  // działa dopiero na końcu kroku — odroczenie jest darmowe).
  const tapped = [...s.objects.values()].filter((o) => o.zone === 'battlefield' && o.tapped);
  assert.deepEqual(tapped.map((o) => o.id), [], 'lądy nietknięte');
  assert.equal(s.players.find((p) => p.id === 'p1').mana, 3, 'mana zostaje w puli');
});

test('K/1b: ta sama scena w main2 bota → pass (etap końca własnej tury)', () => {
  const s = scena({ step: 'main2', foe: [['e24', 2, 4]] });
  const { cmd, scores } = decyzja(s);
  assert.equal(cmd.type, 'pass_priority', `pass: ${cmd.type}`);
  assert.ok(castScore(scores) < passScore(scores), 'kara poniżej passu');
});

test('K/2: duże zagrożenie wroga (4/4 + 3/3) nie uzasadnia wcześniejszego rzutu', () => {
  const s = scena({ foe: [['e44', 4, 4], ['e33', 3, 3]] });
  const { cmd, scores } = decyzja(s);
  assert.equal(cmd.type, 'pass_priority',
    `zagrożenie wroga nie jest powodem odsłaniaia sztuczki: ${cmd.type}`);
  assert.ok(castScore(scores) <= KARA + 0.01, `wycena wyzerowana: ${castScore(scores)}`);
});

// =============================================================================
// K/3 — tura przeciwnika PRZED deklaracją atakujących: nie odsłaniamy karty
// =============================================================================

test('K/3: beginning_of_combat wroga → pass (wróg dopiero wybiera atakujących)', () => {
  const s = scena({ step: 'beginning_of_combat', active: 'p2', foe: [['e24', 2, 4]] });
  assert.ok(execute(s, { type: 'pass_priority', playerId: 'p2' }).ok, 'wróg pasuje');
  const { cmd, scores } = decyzja(s);
  assert.equal(cmd.type, 'pass_priority', `pass: ${cmd.type}`);
  assert.ok(castScore(scores) < passScore(scores), 'kara poniżej passu');
});

// =============================================================================
// K/4 — okno zaskoczenia: PO deklaracji atakujących, gdy kreatura realnie
//       może zablokować (punkt 2 zlecenia)
// =============================================================================

test('K/4: tura wroga, atak 2/4 naziemnym → cast (zaskoczenie blokiem)', () => {
  const s = scena({ foe: [['e24', 2, 4]] });
  atakWroga(s, ['e24']);
  const { cmd, scores } = decyzja(s);
  assert.equal(cmd.type, 'cast_permanent', `zaskoczenie blokiem: ${cmd.type}`);
  assert.ok(castScore(scores) > passScore(scores),
    `cast (${castScore(scores)}) > pass (${passScore(scores)})`);
});

test('K/4b: atak 2/4 + tapnięty własny 3/3 → cast (ETB oddaje blokera)', () => {
  const s = scena({ foe: [['e24', 2, 4]], mine: [['m33', 3, 3, { tapped: true }]] });
  atakWroga(s, ['e24']);
  const { cmd, scores } = decyzja(s);
  assert.equal(cmd.type, 'cast_permanent', `cast: ${cmd.type}`);
  assert.ok(castScore(scores) > passScore(scores), 'cast > pass');
});

test('K/5: atak LATAJĄCYM 3/3 → pass (Bell-Ringer go nie zablokuje)', () => {
  const s = scena({ foe: [['fly33', 3, 3, { keywords: ['flying'] }]] });
  atakWroga(s, ['fly33']);
  const { cmd, scores } = decyzja(s);
  assert.equal(cmd.type, 'pass_priority',
    `brak reakcji na latającego = brak wartości w tym oknie: ${cmd.type}`);
  assert.ok(castScore(scores) < passScore(scores), 'kara poniżej passu');
});

// =============================================================================
// K/6 — PO deklaracji blokujących: okno zaskoczenia minęło (CR 509.1a)
// =============================================================================

test('K/6: tura wroga, declare_blockers → cast poniżej passu (za późno)', () => {
  const s = scena({ foe: [['e24', 2, 4]] });
  atakWroga(s, ['e24']);
  assert.ok(execute(s, { type: 'pass_priority', playerId: 'p1' }).ok, 'bot pasuje');
  assert.equal(s.turn.step, 'declare_blockers', 'krok blokerów');
  const { cmd, scores } = decyzja(s);
  assert.ok(castScore(scores) <= KARA + 0.01, `wycena wyzerowana: ${castScore(scores)}`);
  assert.ok(castScore(scores) < passScore(scores),
    `cast (${castScore(scores)}) < pass (${passScore(scores)}) — wchodzący stwór nie jest blokerem`);
  assert.notEqual(cmd.type, 'cast_permanent', `nie rzuca: ${cmd.type}`);
});

// =============================================================================
// K/7 — przeciwnik NIE zaatakował: rzut w Głównej 2 przeciwnika (punkt 4)
// =============================================================================

test('K/7: main2 wroga bez ataku → cast (mana by wyparowała, CR 500.5)', () => {
  const s = scena({ step: 'main2', active: 'p2', foe: [['e24', 2, 4]] });
  assert.ok(execute(s, { type: 'pass_priority', playerId: 'p2' }).ok, 'wróg pasuje');
  const { cmd, scores } = decyzja(s);
  assert.equal(cmd.type, 'cast_permanent', `cast: ${cmd.type}`);
  assert.ok(castScore(scores) > passScore(scores),
    `cast (${castScore(scores)}) > pass (${passScore(scores)})`);
});

// =============================================================================
// K/8 — ETB „odkręć wszystkie twoje stwory" liczone PO KREATURZE (punkt 3)
// =============================================================================

test('K/8: tapnięty własny 2/2 = ETB 8 + 2×moc (+12, ×0,9 = +10,8)', () => {
  const s = scena({ foe: [['e24', 2, 4]], mine: [['m22', 2, 2, { tapped: true }]] });
  atakWroga(s, ['e24']);
  const tapped = decyzja(s).scores;
  const s2 = scena({ foe: [['e24', 2, 4]], mine: [['u22', 2, 2]] });
  atakWroga(s2, ['e24']);
  const untapped = decyzja(s2).scores;
  const delta = castScore(tapped) - castScore(untapped);
  assert.ok(Math.abs(delta - 10.8) < 1e-6,
    `różnica to dokładnie wartość odkręcenia (8 + 2×2) × 0,9: ${delta}`);
});

test('K/8b: tapnięty własny 3/3 z zakazem blokowania = ETB 0 (CR 509.1b)', () => {
  const s = scena({ foe: [['e24', 2, 4]], mine: [['m33c', 3, 3, { tapped: true, cantBlock: true }]] });
  atakWroga(s, ['e24']);
  const cant = decyzja(s).scores;
  const s2 = scena({ foe: [['e24', 2, 4]], mine: [['u33', 3, 3]] });
  atakWroga(s2, ['e24']);
  const plain = decyzja(s2).scores;
  assert.ok(Math.abs(castScore(cant) - castScore(plain)) < 1e-6,
    'stwór, który i tak nie blokuje, nie wnosi wartości do odkręcenia');
});

test('K/9: ETB poza oknem (krok `end` tury wroga) = 0 (stwór odkręciłby się i tak)', () => {
  // Okno, w którym rzut jest dozwolony (mana by wyparowała), ale odkręcenie nie
  // daje ŻADNEJ nowej akcji — stwór odświeży się we własnym kroku odkręcenia
  // (CR 502.3), więc ETB jest jałowe. Gdyby helper liczył poza oknami, tapnięty
  // 2/2 dodałby 8 + 2×2 = 12 do noty.
  const s = scena({ step: 'end', active: 'p2', mine: [['m22', 2, 2, { tapped: true }]] });
  assert.ok(execute(s, { type: 'pass_priority', playerId: 'p2' }).ok, 'wróg pasuje');
  const withTapped = decyzja(s).scores;
  const s2 = scena({ step: 'end', active: 'p2' });
  assert.ok(execute(s2, { type: 'pass_priority', playerId: 'p2' }).ok, 'wróg pasuje');
  const without = decyzja(s2).scores;
  assert.ok(Math.abs(castScore(withTapped) - castScore(without)) < 1e-6,
    'poza oknem odkręcenie nic nie zmienia — efekt jałowy');
  assert.ok(castScore(withTapped) > passScore(without),
    `w kroku \`end\` rzut jest dozwolony (mana by wyparowała): ${castScore(withTapped)}`);
});

// =============================================================================
// K/10 — E2E: bot trzyma kartę, rzuca w oknie i BLOKUJE nią (punkty 1 + 2 + 3)
// =============================================================================

test('K/10: E2E — hold w main1 → rzut w declare_attackers → blok → 0 obrażeń', () => {
  const s = scena({ foe: [['e24', 2, 4]] });
  // 1) Własna tura: bot trzyma manę (lądy nietknięte, pula bez zmian).
  const k1 = decyzja(s);
  assert.equal(k1.cmd.type, 'pass_priority', `main1: pass (${k1.cmd.type})`);
  assert.deepEqual([...s.objects.values()].filter((o) => o.zone === 'battlefield' && o.tapped).map((o) => o.id), []);
  // 2) Tura przeciwnika: wróg atakuje 2/4, bot wystawia Bell-Ringera.
  atakWroga(s, ['e24']);
  const k2 = decyzja(s);
  assert.equal(k2.cmd.type, 'cast_permanent', `declare_attackers: cast (${k2.cmd.type})`);
  assert.ok(execute(s, k2.cmd).ok, 'rzut Bell-Ringera');
  // 3) Stos się rozstrzyga, obaj gracze pasują — priorytet wraca do bota w kroku
  //    deklaracji blokerów i bot deklaruje Bell-Ringera blokerem atakującego 2/4.
  let straznik = 0;
  while (s.turn.step !== 'declare_blockers' && straznik < 8) {
    assert.ok(execute(s, { type: 'pass_priority', playerId: s.turn.priorityPlayerId }).ok, 'pas');
    straznik += 1;
  }
  assert.equal(s.turn.step, 'declare_blockers', 'krok blokerów');
  assert.equal(s.turn.priorityPlayerId, 'p1', 'priorytet u bota');
  const k3 = decyzja(s);
  assert.equal(k3.cmd.type, 'declare_blockers', `blok Bell-Ringerem (${k3.cmd.type})`);
  assert.deepEqual(Object.keys(k3.cmd.assignments ?? {}), ['e24'], 'Bell-Ringer blokuje 2/4');
  const bloker = k3.cmd.assignments?.e24 ?? [];
  assert.equal(s.objects.get(bloker[0])?.cardId, 'village-bell-ringer', 'bloker to Bell-Ringer');
  assert.ok(execute(s, k3.cmd).ok, 'deklaracja bloków');
  // 4) Walka: obrażenia wchłonięte przez blok — życie bota bez zmian.
  assert.ok(execute(s, { type: 'pass_priority', playerId: 'p1' }).ok, 'bot pasuje');
  const k4 = decyzja(s, 'p2');
  assert.equal(k4.cmd.type, 'resolve_combat', `obrażenia (${k4.cmd.type})`);
  assert.ok(execute(s, k4.cmd).ok, 'rozstrzygnięcie walki');
  assert.equal(s.players.find((p) => p.id === 'p1').life, 20, 'żadnych obrażeń w bota');
  const atakujacy = [...s.objects.values()].find((o) => o.id === 'e24');
  const dzwon = [...s.objects.values()].find((o) => o.cardId === 'village-bell-ringer');
  assert.equal(atakujacy?.zone, 'battlefield', 'atakujący przeżył (2/4 vs 1/4)');
  assert.equal(dzwon?.zone, 'battlefield', 'Bell-Ringer na stole');
  assert.equal(dzwon?.controllerId, 'p1', 'Bell-Ringer należy do bota');
});

// =============================================================================
// K/11 — izolacja rodziny: reguła dotyczy WYŁĄCZNIE kreatur z flash
// =============================================================================

test('K/11: vanilla 2/3 bez flash w main1 → cast (reguła nie obejmuje go)', () => {
  const s = scena({ cardId: 'alaborn-trooper' });
  const { cmd, scores } = decyzja(s);
  assert.equal(cmd.type, 'cast_permanent',
    `zwykła kreatura i tak wchodzi w main1: ${cmd.type}`);
  assert.ok(castScore(scores) > passScore(scores),
    `cast (${castScore(scores)}) > pass (${passScore(scores)})`);
});

test('K/12: flash-aura ochronna (nie-kreatura) trzyma swoją regułę okna (M235)', () => {
  // Rodzina aury/bestow ma WŁASNĄ regułę okna (M235: ochrona w main1 z gotowym
  // atakującym jest dozwolona). Kara kreatur z flash nie może jej dotknąć —
  // inaczej aura ochronna zszedłaby poniżej passu w oknie, w którym M235
  // uznała ją zawartą. Scena z M235: gospodarz + wielokolorowy wróg.
  const s = scena({ cardId: 'benevolent-blessing', mana: 10 });
  put(s, 'mine', 'chained-throatseeker', 'p1');
  put(s, 'foe', 'trostani-discordant', 'p2', 'battlefield', { tapped: true });
  const { cmd, scores } = decyzja(s);
  const aura = scores['cast_permanent(h0->mine)'];
  assert.equal(cmd.type, 'cast_permanent', `aura w main1: ${cmd.type}`);
  assert.ok(aura > passScore(scores),
    `aura ochronna (${aura}) > pass (${passScore(scores)}) — reguła kreatur jej nie tyka`);
  assert.ok(aura > KARA + 0.01, `nota nie jest karą kreatury: ${aura}`);
});

test('K/13: flash-artefakt bez celu (nie-kreatura) zachowuje pełną wycenę', () => {
  // Ten przypadek FAKTYCZNIE przechodzi przez gałąź ciała (artefakt bez celu nie
  // odchodzi w gałąź aury), więc pokazuje, że kara kreatur z flash go nie tyka:
  // reguła jest po deskryptorze `flash` + `Creature` (ADR 0002), nie po samym
  // słowie kluczowym. Lodestone Needle (2 many, flash, ETB tapnięcie) w main1
  // bota jest warty tyle, ile wynika z jego własnej wyceny.
  const s = scena({ cardId: 'lodestone-needle', mana: 4, landColor: 'blue' });
  const { cmd, scores } = decyzja(s);
  assert.equal(cmd.type, 'cast_permanent', `artefakt w main1: ${cmd.type}`);
  assert.ok(castScore(scores) > passScore(scores),
    `cast (${castScore(scores)}) > pass (${passScore(scores)})`);
  assert.ok(castScore(scores) > KARA + 0.01, `nota nie jest karą kreatury: ${castScore(scores)}`);
});
