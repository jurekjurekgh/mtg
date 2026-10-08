// =============================================================================
// Zgłoszenie J (2026-10-08, właściciel) — Fledgling Imp:
//   "{B}, Discard a card: This creature gains flying until end of turn."
//   „Bot ma na stole impa. Ja mam wszystkie kreatury tapnięte. Bot używa tej
//   zdolności i nadaje sobie latanie (musi zapłacić manę i odrzucić kartę —
//   wyrzuca Brute Force, którym mógłby sobie pumpować +3/+3 IDIOTA!).
//   Atakuje. Zadaje mi 2 dmg. PO CO SIĘ PYTAM ON AKTYWOWAŁ TO LATANIE???
//   … To latanie to ma sens tylko gdy jest do czegoś potrzebne (np. ja mam
//   blokerów z lataniem albo reach) albo gdy chce tym impem blokować kogoś
//   z lataniem. I warunek konieczny — ma na ręce ZBĘDNĄ kartę — np. taką na
//   którą nie ma many."
//
// Pomiar PRZED (sonda `.arena/probe-j-imp.mjs`; bot = p1 z impem 2/2, 8 lądów
// w tym 3 Mountains, Brute Force w ręce; właściciel = p2):
//   | scena | nota aktywacji | wybór |
//   | wróg 2/4 + 2/3 TAPNIĘTE | **+1** | **activate_ability** ← zgłoszenie |
//   | wróg bez stworów | **+1** | **activate_ability** ← ten sam błąd |
//   | wróg 2/4 nietapnięty | +1 | activate (okno realne — poprawne) |
//   | wróg 2/4 z flying | −5 | pass |
//   | main2 (postcombat) | −13 | pass |
//
// Przyczyna: gałąź `flying` w `keywordGrantWindowValue` pytała WYŁĄCZNIE o
// odpowiedź w powietrzu (`hasUntappedFlyingBlocker`) i nigdy nie pytała, czy
// wróg ma w ogóle NIETAPNIĘTEGO blokera NAZIEMNEGO. Gdy wszystkie kreatury
// wroga są tapnięte (albo wroga nie ma), atak przejdzie i tak — latanie nie
// zmienia NIC, a baza zdolności (+2) − mana (−1) + premia okna (+2 + moc)
// dawało +1, czyli ponad pass. Klasa awarii: **L50/L131** (efekt bez wyceny
// wymiaru „czy efekt cokolwiek zmienia") w wariancie **M146**.
//
// Fix (generycznie po typie efektu `grant_keywords_until_end_of_turn` i stanie
// z PlayerView — ADR 0002/0017; wspólne dla czarów i zdolności, L41):
// - `enemyHasUntappedGroundBlockerFor(view, recipient)` — przeciwnik ma
//   nietapniętego stwora, który bez latania ZABLOKOWAŁBY `recipient`; idzie
//   przez `attackerCanBeBlocked` (menace / ewazja mocowa / cantBlock liczone
//   tą samą regułą co wycena ataku, CR 509.1b + M202/H);
// - premia `2 + moc` za latanie tylko gdy taki bloker ISTNIEJE i wróg nie ma
//   odpowiedzi flying/reach; w przeciwnym razie kara −10 (efekt jałowy), nie
//   zero — baza +2 minus mana muszą zejść poniżej passu (L3);
// - gałąź obronna (blok nadlatującego latającego atakującego) bez zmian: tam
//   latanie realnie odblokowuje blok, nawet gdy blokera naziemnego nie ma.
//
// Cytaty CR (dosłowny tekst z mirroru `nwgarne/mtg-data`, CR effective
// 2026-09-25, SHA-256 `8d860e45…`, ADR 0030):
// - **702.9b**: „A creature with flying can't be blocked except by creatures
//   with flying and/or reach. A creature with flying can block a creature with
//   or without flying."
// - **509.1a**: „The defending player chooses which creatures they control, if
//   any, will block. The chosen creatures must be untapped and they can't also
//   be battles."
// - **509.1b**: „The defending player checks each creature they control to see
//   whether it's affected by any restrictions (effects that say a creature
//   can't block, or that it can't block unless some condition is met). If any
//   restrictions are being disobeyed, the declaration of blockers is illegal."
// - **502.3**: „Third, the active player determines which permanents they
//   control will untap. Then they untap them all simultaneously. … Normally,
//   all of a player's permanents untap, but effects can keep one or more of a
//   player's permanents from untapping."
// - **701.9a**: „To discard a card, move it from its owner's hand to that
//   player's graveyard."
//
// Dowód mutacyjny (każda mutacja musi wyłączyć konkretne testy):
//   - mJ1: usunięty warunek `groundBlocker` (premia za latanie zawsze):
//     czerwone J/1, J/2, J/6;
//   - mJ2: jałowe latanie = 0 zamiast kary: czerwone J/1, J/2;
//   - mJ3: helper ignoruje `tapped`: czerwone J/1;
//   - mJ4: helper ignoruje flying/reach blokera: czerwone J/4;
//   - mJ5: usunięta kara za odpowiedź flying/reach: czerwone J/4.
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

/** Lądy bota (p1): 8 sztuk, w tym 3 Mountains — wystarczy na Brute Force. */
function lands(s) {
  const colors = ['mountain', 'plains', 'swamp'];
  for (let i = 0; i < 8; i += 1) {
    const color = colors[i % colors.length];
    addObject(s, {
      id: `l${i}`, instanceId: `i-l${i}`, cardId: `basic-${color}`,
      controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'land',
      manaSource: { colors: [color], amount: 1 },
      types: ['Basic', 'Land'], subtypes: [color], keywords: [], colors: [],
    });
  }
}

function creature(s, id, pid, power, toughness, patch = {}) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: pid, ownerId: pid,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 2, abilities: [],
    keywords: [], subtypes: [], types: ['Creature'], colors: [],
  });
  if (Object.keys(patch).length) s.objects.set(id, Object.freeze({ ...s.objects.get(id), ...patch }));
  return s.objects.get(id);
}

/** Scena bota (p1): imp na stole, 8 lądów, karty w ręce, stół wroga (p2). */
function scena({ step = 'main1', mana = 8, hand = ['brute-force'], foe = [] } = {}) {
  const s = game(step);
  put(s, 'imp', 'fledgling-imp', 'p1');
  lands(s);
  addMana(s, 'p1', mana);
  hand.forEach((cardId, i) => put(s, `h${i}`, cardId, 'p1', 'hand'));
  foe.forEach(([id, power, toughness, patch]) => creature(s, id, 'p2', power, toughness, patch ?? {}));
  return s;
}

/** Decyzja bota + noty wszystkich wariantów (etykieta śladu nosi źródło). */
function decyzja(s, seed = 5) {
  const bot = createHeuristicBot({ seed });
  const cmd = bot.chooseCommand(playerView(s, 'p1'));
  const scores = {};
  for (const o of bot.trace().at(-1)?.options ?? []) scores[o.cmd] = o.score;
  return { cmd, scores };
}
const impScore = (scores) => scores['activate_ability(imp#0)'];
const passScore = (scores) => scores.pass_priority ?? 0;

// =============================================================================
// J/1 — scena ze zgłoszenia: wszystkie kreatury wroga TAPNIĘTE ⇒ pass
// =============================================================================

test('J/1: wróg 2/4 + 2/3 TAPNIĘTE, Brute Force w ręce → pass (przed fixem +1)', () => {
  const s = scena({ foe: [['e24', 2, 4, { tapped: true }], ['e23', 2, 3, { tapped: true }]] });
  const { cmd, scores } = decyzja(s);
  assert.notEqual(cmd.type, 'activate_ability',
    `latanie nie kupuje nic, gdy wróg nie może blokować: ${cmd.type}`);
  // Nota całkowita = baza 2 − mana 1 − strata karty 4 − kara okna 10. Kara jałowego
  // efektu musi przebijać bazę zdolności, inaczej baza znów niesie wariant (L3).
  assert.ok(impScore(scores) <= -10, `kara okna −1 w notcie: ${impScore(scores)}`);
  assert.ok(impScore(scores) < passScore(scores),
    `aktywacja (${impScore(scores)}) < pass (${passScore(scores)})`);
});

test('J/1b: ta sama scena w beginning_of_combat → pass (stan się nie zmieni)', () => {
  const s = scena({ step: 'beginning_of_combat', foe: [['e24', 2, 4, { tapped: true }]] });
  const { cmd, scores } = decyzja(s);
  assert.notEqual(cmd.type, 'activate_ability', `pass: ${cmd.type}`);
  assert.ok(impScore(scores) < passScore(scores), 'kara poniżej passu');
});

// =============================================================================
// J/2 — wróg bez stworów: atak i tak nieblokowany ⇒ pass
// =============================================================================

test('J/2: wróg bez żadnych stworów → pass (przed fixem +1)', () => {
  const s = scena({ foe: [] });
  const { cmd, scores } = decyzja(s);
  assert.notEqual(cmd.type, 'activate_ability', `brak blokera = brak wartości: ${cmd.type}`);
  assert.ok(impScore(scores) < passScore(scores), 'kara poniżej passu');
});

test('J/2b: wróg ma tylko stwora z zakazem blokowania → pass (CR 509.1b)', () => {
  const s = scena({ foe: [['e24', 2, 4, { cantBlock: true }]] });
  const { cmd, scores } = decyzja(s);
  assert.notEqual(cmd.type, 'activate_ability', `bloker z zakazem nie liczy się: ${cmd.type}`);
  assert.ok(impScore(scores) < passScore(scores), 'kara poniżej passu');
});

// =============================================================================
// J/3 — ANTY-OVER-FIX: realny bloker naziemny ⇒ latanie jest opłacalne
// =============================================================================

test('J/2c: wróg TAPNIĘTY, w ręce karta BEZ koloru many (zbędna) → pass', () => {
  // Warunek konieczny właściciela: aktywacja ma sens tylko ze ZBĘDNĄ kartą w
  // ręce. Tu karta jest zbędna (bot nie ma źródeł {U}, więc strata odrzucenia = 0),
  // a latanie i tak nic nie kupuje — jedyny powód, by nie aktywować, to kara za
  // jałowy efekt. Bez niej baza +2 minus {B} znów niosłaby wariant ponad pass.
  const s = scena({ foe: [['e24', 2, 4, { tapped: true }]], hand: ['enter-the-enigma'] });
  const { cmd, scores } = decyzja(s);
  assert.notEqual(cmd.type, 'activate_ability',
    `zbędna karta nie zmienia faktu, że latanie jest jałowe: ${cmd.type}`);
  assert.ok(impScore(scores) < passScore(scores),
    `aktywacja (${impScore(scores)}) < pass (${passScore(scores)})`);
});

test('J/3: wróg 2/4 NIETAPNIĘTY → activate (latanie omija blokera)', () => {
  const s = scena({ foe: [['e24', 2, 4]] });
  const { cmd, scores } = decyzja(s);
  assert.equal(cmd.type, 'activate_ability', `bot kupuje ewazję: ${cmd.type}`);
  assert.equal(cmd.objectId, 'imp', 'źródłem jest imp');
  assert.ok(impScore(scores) > passScore(scores),
    `aktywacja (${impScore(scores)}) > pass (${passScore(scores)})`);
});

test('J/3b: beginning_of_combat z nietapniętym blokerem → activate', () => {
  const s = scena({ step: 'beginning_of_combat', foe: [['e24', 2, 4]] });
  const { cmd, scores } = decyzja(s);
  assert.equal(cmd.type, 'activate_ability', `okno realne: ${cmd.type}`);
  assert.ok(impScore(scores) > passScore(scores), 'powyżej passu');
});

test('J/3c: imp z MENACE i jednym blokerem → pass (i tak nieblokowalny, CR 509.1b)', () => {
  const s = scena({ foe: [['e24', 2, 4]] });
  s.objects.set('imp', Object.freeze({ ...s.objects.get('imp'), keywords: ['menace'] }));
  const { cmd, scores } = decyzja(s);
  assert.notEqual(cmd.type, 'activate_ability',
    `menace + jeden bloker = latanie jałowe: ${cmd.type}`);
  assert.ok(impScore(scores) < passScore(scores), 'kara poniżej passu');
});

// =============================================================================
// J/4 — odpowiedź w powietrzu: latanie nie czyni atakującego nieblokowalnym
// =============================================================================

test('J/4: wróg 2/4 z flying → pass (CR 702.9b)', () => {
  const s = scena({ foe: [['e24', 2, 4, { keywords: ['flying'] }]] });
  const { cmd, scores } = decyzja(s);
  assert.notEqual(cmd.type, 'activate_ability', `flyer wroga i tak zablokuje: ${cmd.type}`);
  assert.ok(impScore(scores) < passScore(scores), 'kara poniżej passu');
});

test('J/4b: wróg 2/4 naziemny + 2/2 z reach → pass', () => {
  const s = scena({ foe: [['e24', 2, 4], ['e22', 2, 2, { keywords: ['reach'] }]] });
  const { cmd, scores } = decyzja(s);
  assert.notEqual(cmd.type, 'activate_ability', `reach też blokuje latającego: ${cmd.type}`);
  assert.ok(impScore(scores) < passScore(scores), 'kara poniżej passu');
});

// =============================================================================
// J/5 — okno obronne: imp BLOKUJE nadlatującego latającego atakującego
// =============================================================================

test('J/5: tura wroga, atakujący 2/2 z flying → activate (blok z powietrza)', () => {
  const s = game('declare_attackers', 'p2');
  put(s, 'imp', 'fledgling-imp', 'p1');
  lands(s);
  addMana(s, 'p1', 8);
  put(s, 'h0', 'brute-force', 'p1', 'hand');
  creature(s, 'atk', 'p2', 2, 2, { keywords: ['flying'], summoningSickness: false });
  // Wróg deklaruje atakującego z flying; po pasach obu graczy priorytet wraca
  // do bota w kroku deklaracji blokerów (wzorzec testu D).
  assert.ok(execute(s, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['atk'] }).ok);
  execute(s, { type: 'pass_priority', playerId: 'p2' });
  execute(s, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(s.turn.step, 'declare_blockers', 'jesteśmy w kroku blokerów');
  const { cmd, scores } = decyzja(s);
  assert.equal(cmd.type, 'activate_ability',
    `latanie odblokowuje blok latającego atakującego: ${cmd.type}`);
  assert.ok(impScore(scores) > passScore(scores),
    `aktywacja (${impScore(scores)}) > pass (${passScore(scores)})`);
});

// =============================================================================
// J/6 — poza oknem: postcombat i tura przeciwnika bez ataku z powietrza
// =============================================================================

test('J/6: postcombat main2 → pass (efekt wygasa w cleanup, CR 514.2)', () => {
  const s = scena({ step: 'main2', foe: [['e24', 2, 4]] });
  const { cmd, scores } = decyzja(s);
  assert.notEqual(cmd.type, 'activate_ability', `po walce latanie nic nie kupuje: ${cmd.type}`);
  assert.ok(impScore(scores) < passScore(scores), 'kara poniżej passu');
});

// =============================================================================
// J/7 — E2E: wybrana aktywacja faktycznie płaci koszt i nadaje latanie
// =============================================================================

test('J/7: E2E — aktywacja płaci {B}, wyrzuca kartę do grobu i daje flying', () => {
  const s = scena({ foe: [['e24', 2, 4]] });
  const bot = createHeuristicBot({ seed: 5 });
  const cmd = bot.chooseCommand(playerView(s, 'p1'));
  assert.equal(cmd.type, 'activate_ability', 'bot aktywuje zdolność impa');
  const manaBefore = s.players.find((p) => p.id === 'p1').mana;
  assert.ok(execute(s, cmd).ok, 'aktywacja jest legalna');
  resolveAll(s);
  const imp = s.objects.get('imp');
  assert.ok((imp.keywordGrants ?? []).includes('flying'),
    `imp ma flying do końca tury (CR 702.9b): ${JSON.stringify(imp.keywordGrants ?? [])}`);
  // `zones.graveyard` to lista ID — obiekty są w `state.objects`.
  const gy = (s.zones.graveyard ?? []).map((id) => s.objects.get(id))
    .filter((o) => o && o.controllerId === 'p1');
  assert.ok(gy.some((o) => o.cardId === 'brute-force'),
    'karta z kosztu-discard jest w grobie (CR 701.9a)');
  assert.equal(s.players.find((p) => p.id === 'p1').mana, manaBefore - 1,
    'zapłacono {B} z puli');
});

/** Rozstrzyga stos do końca (aktywacja → efekt) pasami obu graczy. */
function resolveAll(s) {
  for (let i = 0; i < 12 && (s.zones.stack ?? []).length > 0; i += 1) {
    const bot = createHeuristicBot({ seed: 5 });
    const pick = bot.chooseCommand(playerView(s, s.turn.priorityPlayerId));
    assert.ok(execute(s, pick).ok, `krok ${pick.type} legalny`);
  }
}
