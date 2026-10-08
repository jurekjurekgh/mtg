// =============================================================================
// Zgłoszenie I (2026-10-08, właściciel) — Wrap in Flames:
//   "Wrap in Flames deals 1 damage to each of up to three target creatures.
//   Those creatures can't block this turn." ({3}{R} Sorcery)
//   "Bot rzuca ją zawsze jak ma manę. Ta karta ma sens tylko wtedy, jeżeli
//   zachodzi jedna z dwóch przesłanek: a. przeciwnik ma przynajmniej jedną
//   kreaturę, dla której 1 dmg stanowi lethal dmg. Im więcej takich kreatur tym
//   lepiej. ALBO b. bot zamierza atakować i dzięki Wrap in Flames wyłącza
//   blockerów przeciwnika. Niestety żadna z tych przesłanek nie zachodziła, bot
//   rzucił ten czar i go całkowicie zmarnował bo dwie kreatury miały >1
//   toughness i nic im się nie stało, a bot nie atakował w ogóle."
//
// Pomiar PRZED (sonda `.arena/probe-i-wrap.mjs`): baza czaru (`spellBase` 50) +
// płaska wartość celu (`12 + 2P` za każdy wrogi cel, 8 za "can't block")
// nosiły czar ponad pass ZAWSZE, gdy na stole stał choć jeden wrogi stwór:
//   | scena | wybór | nota |
//   | wróg 2/4 + 3/3, brak atakujących | cast(wif->f24+f33) | **84,0** |
//   | wróg 2/4 + 3/3, bez własnych stworów | cast(wif->f24+f33) | 84,0 |
//   | postcombat main2 | cast(wif->f24+f33) | 84,0 |
//   | wróg 1/1 (lethal) | cast(wif->f11+f24) | 80,0 |
// Żadna składowa nie pytała o śmiertelność obrażeń ani o to, czy bot
// w ogóle zamierza atakować. Klasa awarii: **L50/L131** (efekt bez wyceny =
// pierwsza oferta z listy) w wariancie "baza niesie czar" — **M146**.
//
// Fix (generycznie po deskryptorze `apply_to_each_target` + typach efektów,
// ADR 0002 — żadnej nazwy karty; wycena wyłącznie z PlayerView, ADR 0017):
// - `wrapTargetsValue`: obrażenia w wrogiego stwora — śmiertelne = usunięcie
//   ciała (TA SAMA formuła co czar/zdolność: `lethalEnemyCreatureValue`, L41),
//   nieśmiertelne = 0 (chip sam w sobie nic nie wart, a "can't block" w tym
//   samym rzucie jedzie za darmo — anty-nad-regulacja L121);
// - "can't block" liczy się OSOBNO od obrażeń (stary `else if` gubił ridera)
//   i MA WARTOŚĆ WYŁĄCZNIE w oknie ataku: `attackWindowAttackerIds` (JEDEN
//   odczyt okna dla payoffu triggera PMSSB-40 i dla wrappera, L41) +
//   `cantBlockRemovalValue` (wartość usunięcia NAJLEPSZEGO bloku, Batch60);
// - czar zapakowany we wrapper "each of up to N targets", którego KAŻDY
//   wewnętrzny efekt jest utylitarny albo obrażeniem o STAŁEJ kwocie, startuje
//   od −1 (M146), nie od bazy 50 — bez tego baza niosłaby go ponad pass;
// - CR 601.2c: "If the spell has a variable number of targets, the player
//   announces how many targets they will choose before they announce those
//   targets." ⇒ liczba celów jest wyborem gracza, więc każdy podzbiór ma
//   własną wycenę.
// - CR 509.1b: "The defending player checks each creature they control to see
//   whether it's affected by any restrictions (effects that say a creature
//   can't block...). If any restrictions are being disobeyed, the declaration
//   of blockers is illegal." ⇒ "can't block" realnie usuwa blokera — ale tylko
//   wtedy, gdy właśnie deklarujemy atak.
// - CR 509.1a: "The chosen creatures must be untapped…" ⇒ tapnięty stwór i tak
//   nie blokuje, więc jego wartość jako celu jest zerowa.
// Cytaty CR: dosłowny tekst z mirroru `nwgarne/mtg-data` (CR effective
// 2026-09-25, SHA-256 `8d860e45…`), ADR 0030.
//
// Dowód mutacyjny (każda mutacja musi wyłączyć konkretne testy):
//   - obrażenia z powrotem płaskie `12 + 2P`: czerwone I/1, I/4,
//   - "can't block" z powrotem płaski +8: czerwone I/1, I/4,
//   - braca `spellBase` 50 zamiast −1: czerwone I/1, I/4 (baza znów niesie czar),
//   - zdjęta bramka okna ataku (`attackWindowAttackerIds` → zawsze zwraca
//     atakujących): czerwone I/4,
//   - bez kary za WŁASNY cel: czerwone I/6.
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

function game(step = 'main1') {
  const s = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, step, 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
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

function creature(s, id, pid, power, toughness, patch = {}) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: pid, ownerId: pid,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 2, abilities: [],
    keywords: [], subtypes: [], types: ['Creature'], colors: [],
  });
  if (Object.keys(patch).length) s.objects.set(id, Object.freeze({ ...s.objects.get(id), ...patch }));
  return s.objects.get(id);
}

/** Scena rzutu (p1 ma Wrap in Flames w ręce i manę na {3}{R}). */
function scena({ step = 'main1', mana = 6, own = [], foe = [] } = {}) {
  const s = game(step);
  put(s, 'wif', 'wrap-in-flames', 'p1', 'hand');
  addMana(s, 'p1', mana);
  // Własne ciała domyślnie chore (nie mogą atakować w tej turze) — żadnego
  // zamiaru ataku, chyba że scena jawnie poda `ready: true`.
  own.forEach(([id, p, t, ready]) => creature(s, id, 'p1', p, t, ready ? {} : { summoningSickness: true }));
  foe.forEach(([id, p, t]) => creature(s, id, 'p2', p, t));
  return s;
}

/** Decyzja bota + noty WSZYSTKICH wariantów rzutu (etykieta śladu nosi cele). */
function decyzja(s, seed = 5) {
  const bot = createHeuristicBot({ seed });
  const cmd = bot.chooseCommand(playerView(s, 'p1'));
  const scores = {};
  for (const o of bot.trace().at(-1)?.options ?? []) scores[o.cmd] = o.score;
  return { cmd, scores };
}
const scoreCast = (scores, targets) => scores[`cast_spell(wif->${targets.join('+')})`];
const passScore = (scores) => scores.pass_priority ?? 0;

/** Rozstrzyga stos do końca (rzut → efekt) pasami obu graczy. */
function resolveAll(s) {
  const picks = [];
  for (let i = 0; i < 12 && s.zones.stack.length > 0; i += 1) {
    const bot = createHeuristicBot({ seed: 5 });
    const pick = bot.chooseCommand(playerView(s, s.turn.priorityPlayerId));
    picks.push(pick);
    assert.ok(execute(s, pick).ok, `krok ${pick.type} legalny`);
  }
  return picks;
}

// =============================================================================
// I/1 — scena ze zgłoszenia: brak lethal i brak zamiaru ataku ⇒ bot NIE rzuca
// =============================================================================

test('I/1: wróg 2/4 + 3/3, bot nie atakuje → pass (przed fixem cast = 84)', () => {
  const s = scena({ foe: [['f24', 2, 4], ['f33', 3, 3]], own: [['o33', 3, 3]] });
  const { cmd, scores } = decyzja(s);
  assert.notEqual(cmd.type, 'cast_spell',
    `bot nie rzuca czaru bez zysku: ${cmd.type} ${JSON.stringify(cmd.targets ?? null)}`);
  // Każdy wariant z celami schodzi PONIŻ passu — bez śmiertelności i bez okna
  // ataku efekt nie wart nic (0 per cel), więc cały czar jest ujemny.
  for (const targets of [['f24'], ['f33'], ['f24', 'f33']]) {
    const v = scoreCast(scores, targets);
    assert.equal(v, -1, `cast(wif->${targets.join('+')}) = ${v} (baza −1, brak zysku)`);
    assert.ok(v < passScore(scores), `cast(wif->${targets.join('+')}) (${v}) < pass (${passScore(scores)})`);
  }
});

test('I/1b: ten sam scenariusz bez własnych stworów → pass', () => {
  const s = scena({ foe: [['f24', 2, 4], ['f33', 3, 3]] });
  const { cmd, scores } = decyzja(s);
  assert.notEqual(cmd.type, 'cast_spell', `pass zamiast rzutu: ${cmd.type}`);
  assert.equal(scoreCast(scores, ['f24', 'f33']), -1);
});

// =============================================================================
// I/2 — przesłanka (a): 1 obrażenia zabijają ⇒ cast (regresja M158/M233)
// =============================================================================

test('I/2: wróg 1/1 (1 dmg = lethal) → cast na niego, ponad pass', () => {
  const s = scena({ foe: [['f11', 1, 1], ['f24', 2, 4]] });
  const { cmd, scores } = decyzja(s);
  assert.equal(cmd.type, 'cast_spell', `bot rzuca, bo zabija: ${cmd.type}`);
  assert.deepEqual(cmd.targets, ['f11'], `cel = ciało śmiertelne dla 1 obrażeń: ${JSON.stringify(cmd.targets)}`);
  assert.ok(scoreCast(scores, ['f11']) > passScore(scores),
    `cast na 1/1 (${scoreCast(scores, ['f11'])}) > pass (${passScore(scores)})`);
  // Sąsiedni wariant NIEśmiertelny (2/4) jest wartościowo pusty — bot wybiera
  // podzbiór, który coś zabiera (CR 601.2c).
  assert.ok(scoreCast(scores, ['f24']) < scoreCast(scores, ['f11']),
    `2/4 (${scoreCast(scores, ['f24'])}) < 1/1 (${scoreCast(scores, ['f11'])})`);
});

test('I/2b: podrany 4/4 (3 obrażenia) też jest celem — śmiertelność liczy się z pozostałego ciała', () => {
  const s = scena({ foe: [['f44', 4, 4]] });
  s.objects.set('f44', Object.freeze({ ...s.objects.get('f44'), damage: 3 }));
  const { cmd, scores } = decyzja(s);
  assert.equal(cmd.type, 'cast_spell', `1 obrażenie dobija podranego 4/4: ${cmd.type}`);
  assert.ok(scoreCast(scores, ['f44']) > passScore(scores), 'dobicie ponad pass');
});

// =============================================================================
// I/3 — przesłanka (b): bot atakuje ⇒ "can't block" wyłącza blokera
// =============================================================================

test('I/3: precombat z atakującym 3/3 i blokerem 2/4 → cast na blokera', () => {
  const s = scena({ foe: [['f24', 2, 4]], own: [['a33', 3, 3, true]] });
  const { cmd, scores } = decyzja(s);
  assert.equal(cmd.type, 'cast_spell', `bot rzuca, bo wyłącza blokera: ${cmd.type}`);
  assert.deepEqual(cmd.targets, ['f24'], `cel = bloker: ${JSON.stringify(cmd.targets)}`);
  assert.ok(scoreCast(scores, ['f24']) > passScore(scores),
    `cast na blokera (${scoreCast(scores, ['f24'])}) > pass (${passScore(scores)})`);
});

test('I/3b: ten sam stół, ale wróg NIE może blokować (już tapnięty) → pass', () => {
  const s = scena({ foe: [['f24', 2, 4]], own: [['a33', 3, 3, true]] });
  s.objects.set('f24', Object.freeze({ ...s.objects.get('f24'), tapped: true }));
  const { cmd, scores } = decyzja(s);
  assert.notEqual(cmd.type, 'cast_spell',
    `tapnięty stwór i tak nie blokuje (CR 509.1a), więc efekt jest jałowy: ${cmd.type}`);
  assert.ok(scoreCast(scores, ['f24']) < passScore(scores), 'wariant jałowy poniżej passu');
});

// =============================================================================
// I/4 — poza oknem ataku (postcombat) "can't block" nie kupuje nic
// =============================================================================

test('I/4: postcombat main2 → pass (efekt wygasa w cleanup, atak już był)', () => {
  const s = scena({ step: 'main2', foe: [['f24', 2, 4], ['f33', 3, 3]], own: [['a33', 3, 3, true]] });
  const { cmd, scores } = decyzja(s);
  assert.notEqual(cmd.type, 'cast_spell', `pass w drugiej głównej: ${cmd.type}`);
  assert.equal(scoreCast(scores, ['f24', 'f33']), -1, 'bez okna ataku każdy cel jest wart 0');
});

// =============================================================================
// I/5 — warianty mają różne noty (klasa L34/L40) i wybór pada na najlepszy podzbiór
// =============================================================================

test('I/5: lethal + bloker → cast na OBA, a jałowy (tapnięty) cel nie jest brany', () => {
  const s = scena({ foe: [['f11', 1, 1], ['f24', 2, 4], ['f55', 5, 5]], own: [['a33', 3, 3, true]] });
  // Trzeci cel jest już tapnięty: i tak nie może blokować (CR 509.1a), więc
  // „can't block" nic nie wykupuje, a 1 obrażenia 5/5 nie zabija.
  s.objects.set('f55', Object.freeze({ ...s.objects.get('f55'), tapped: true }));
  const { cmd, scores } = decyzja(s);
  assert.equal(cmd.type, 'cast_spell', 'bot rzuca — jest co zabrać i kogo wyłączyć');
  assert.ok(cmd.targets.includes('f11'), `zabija 1/1: ${JSON.stringify(cmd.targets)}`);
  assert.ok(cmd.targets.includes('f24'), `wyłącza blokera 2/4: ${JSON.stringify(cmd.targets)}`);
  assert.ok(!cmd.targets.includes('f55'),
    `tapnięte 5/5 nic nie wykupuje: ${JSON.stringify(cmd.targets)}`);
  assert.ok(scoreCast(scores, ['f55']) < scoreCast(scores, ['f11']),
    `jałowy cel (${scoreCast(scores, ['f55'])}) < lethal (${scoreCast(scores, ['f11'])})`);
  // Tapnięty cel jest wartościowo NEUTRALNY, nie ujemny: czar bierze „do trzech"
  // cel\u00f3w, więc dopisanie nic niewarto\u015bciowego celu nic nie kosztuje w grze —
  // wycena ka\u017cdego celu jest osobna (nie sumuje si\u0119 kary za \"sam fakt rzutu\").
  assert.ok(scoreCast(scores, ['f11', 'f24', 'f55']) <= scoreCast(scores, ['f11', 'f24']),
    'dopisanie jałowego celu nie zwi\u0119ksza warto\u015bci wariantu');
});

// =============================================================================
// I/6 — własny cel jest karany (obrażenia wrappera ranią moje ciało)
// =============================================================================

test('I/6: wariant celujący we WŁASNEGO stwora schodzi głęboko poniżej passu', () => {
  const s = scena({ foe: [['f24', 2, 4]], own: [['o33', 3, 3]] });
  const { scores } = decyzja(s);
  assert.ok(scoreCast(scores, ['o33']) < passScore(scores),
    `cast na własne ciało (${scoreCast(scores, ['o33'])}) < pass (${passScore(scores)})`);
  assert.ok(scoreCast(scores, ['o33', 'f24']) < scoreCast(scores, ['f24']),
    'dopisanie własnego celu pogarsza wariant');
});

// =============================================================================
// I/7 — E2E: wybrany wariant faktycznie wykonuje się w silniku
// =============================================================================

test('I/7: E2E — cast zabija 1/1 i zostawia blokadę na 2/4', () => {
  const s = scena({ foe: [['f11', 1, 1], ['f24', 2, 4]], own: [['a33', 3, 3, true]] });
  const bot = createHeuristicBot({ seed: 5 });
  const cmd = bot.chooseCommand(playerView(s, 'p1'));
  assert.equal(cmd.type, 'cast_spell', 'bot rzuca czar');
  assert.ok(execute(s, cmd).ok, 'rzut jest legalny');
  resolveAll(s);
  assert.equal(s.objects.get('f11'), undefined, '1/1 przeciwnika dostaje śmiertelne obrażenia (CR 704.5g)');
  const blocker = s.objects.get('f24');
  assert.ok(blocker, '2/4 zostaje na stole (1 obrażenie go nie zabija)');
  assert.ok(blocker.cantBlock, 'efekt blokady jest ustawiony na celu');
  assert.equal(blocker.damage, 1, 'na celu wisi 1 obrażenie');
});
