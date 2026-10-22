import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createRegistry } from '../src/cards/registry.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { triggerTargetPowerPumpOf } from '../src/engine/effect-intent.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

/**
 * B (znalezisko właściciela 2026-09-12, Battle-Rattle Shaman): trigger
 * „na początku combatu możesz dać stworowi +2/+0" bot celował w NAJWIĘKSZY
 * własny stwór — także z chorobą przywoływania, który atakować NIE MOŻE.
 * +2/+0 do końca tury na nie-atakującym wygasa bez skutku (trigger odpala
 * się PRZED deklaracją ataku, więc bonus M167/A za atakujących nie działa).
 *
 * Reguła generyczna (ADR 0002): silnik niesie w ofercie `pump` (dodatni
 * pump SIŁY z deskryptora — bliźniak `debuff`), a bot przy pumpie siły
 * na WŁASNEJ turze premiuje stwora zdolnego do ataku (proxy zamiaru ataku:
 * odkręcony, bez choroby / z haste) i karze niezdolnego (-60, skala
 * zabójstwa — przy planszy samych chorych wygrywa odmowa).
 */

const REGISTRY = createCardRegistry();

function newState(step = 'beginning_of_combat', active = 'p1') {
  const state = createGameState({ seed: 1209, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  return state;
}

function put(state, id, cardId, controllerId = 'p1', over = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone: 'battlefield',
    kind: over.kind ?? data.kind, power: over.power ?? data.power,
    toughness: over.toughness ?? data.toughness, manaCost: over.manaCost ?? data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: over.keywords ?? def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
    cardName: def.name,
  });
  state.objects.set(id, Object.freeze({
    ...state.objects.get(id),
    summoningSickness: over.summoningSickness ?? false,
    tapped: over.tapped ?? false,
  }));
  return state.objects.get(id);
}

/** Oczekująca decyzja celu PRAWDZIWEGO triggera Shamana (jak bot-quality-m150). */
function pendShaman(state, candidates) {
  const shamanDef = REGISTRY.get('battle-rattle-shaman');
  const shaman = state.objects.get('shaman');
  state.pendingTriggerTargets.push({
    playerId: 'p1',
    sourceId: shaman.id,
    cardId: shaman.cardId,
    ability: shamanDef.abilities[0],
    candidates: [...candidates],
    allowNone: true,
    fixedTargetIds: [],
    extra: {},
    restorePriorityTo: 'p1',
  });
}

function botPick(state) {
  const bot = createHeuristicBot({ seed: 1209 });
  return bot.chooseCommand(playerView(state, 'p1'));
}

test('B/1: oferta niesie sygnał pumpu siły (+2/+0 Shamana)', () => {
  const state = newState();
  put(state, 'shaman', 'battle-rattle-shaman', 'p1');
  put(state, 'brute', 'highland-game', 'p1', { power: 5, toughness: 5, summoningSickness: true });
  put(state, 'scout', 'highland-game', 'p1', { power: 2, toughness: 2 });
  pendShaman(state, ['brute', 'scout']);
  const offers = playerView(state, 'p1').legalCommands
    .filter((cmd) => cmd.type === 'resolve_trigger_target');
  assert.ok(offers.length >= 2, 'cele + odmowa');
  assert.ok(offers.every((cmd) => cmd.friendly === true), 'friendly jak w M150');
  assert.deepEqual(offers[0].pump, { power: 2, toughness: 0 });
});

test('B/2: sygnał pumpu tylko dla dodatniej SIŁY (toughness-only i debuff poza)', () => {
  assert.deepEqual(
    triggerTargetPowerPumpOf({ effect: { type: 'pump', power: 2, toughness: 0 } }),
    { power: 2, toughness: 0 });
  assert.deepEqual(
    triggerTargetPowerPumpOf({ effect: { type: 'buff_creature_until_end_of_turn', power: 1, toughness: 1 } }),
    { power: 1, toughness: 1 });
  // +0/+3: chory stwór nadal blokuje — brak sygnału „musi atakować".
  assert.equal(triggerTargetPowerPumpOf({ effect: { type: 'pump', power: 0, toughness: 3 } }), null);
  // Ujemny pump to debuff (gałąź wroga), nie cel ataku.
  assert.equal(triggerTargetPowerPumpOf({ effect: { type: 'pump', power: -1, toughness: -1 } }), null);
  assert.equal(triggerTargetPowerPumpOf({ effect: { type: 'add_counter', counter: '+1/+1' } }), null);
  assert.equal(triggerTargetPowerPumpOf({}), null);
});

test('B/3: bot buffuje zdrowego małego, NIE chorego olbrzyma (sedno zgłoszenia)', () => {
  const state = newState();
  // Sam Shaman tapnięty (nie atakuje) — jedyny słuszny cel to zdrowy scout.
  put(state, 'shaman', 'battle-rattle-shaman', 'p1', { tapped: true });
  put(state, 'brute', 'highland-game', 'p1', { power: 5, toughness: 5, summoningSickness: true });
  put(state, 'scout', 'highland-game', 'p1', { power: 2, toughness: 2 });
  pendShaman(state, ['brute', 'scout']);
  const chosen = botPick(state);
  assert.equal(chosen.type, 'resolve_trigger_target');
  assert.equal(chosen.targetId, 'scout',
    `+2/+0 ma iść na stwora zdolnego do ataku: ${JSON.stringify(chosen)}`);
});

test('B/4: chory z haste MOŻE atakować — wraca do gry (większy wygrywa)', () => {
  const state = newState();
  put(state, 'shaman', 'battle-rattle-shaman', 'p1');
  put(state, 'brute', 'highland-game', 'p1', { power: 5, toughness: 5, summoningSickness: true, keywords: ['haste'] });
  put(state, 'scout', 'highland-game', 'p1', { power: 2, toughness: 2 });
  pendShaman(state, ['brute', 'scout']);
  const chosen = botPick(state);
  assert.equal(chosen.targetId, 'brute',
    `haste znosi chorobę — 5/5 bije 2/2: ${JSON.stringify(chosen)}`);
});

test('B/5: plansza samych chorych — bot ODMÓWIA (jałowy buff gorszy niż brak)', () => {
  const state = newState();
  put(state, 'shaman', 'battle-rattle-shaman', 'p1', { tapped: true });
  put(state, 'brute', 'highland-game', 'p1', { power: 2, toughness: 2, summoningSickness: true });
  pendShaman(state, ['brute']);
  const chosen = botPick(state);
  assert.equal(chosen.type, 'resolve_trigger_target');
  assert.equal(chosen.targetId, null,
    `nikt nie atakuje — „you may" zostaje niewybrane: ${JSON.stringify(chosen)}`);
});

test('B/6: cudza tura — pump siły wspiera BLOK, wraca stara polityka (największy)', () => {
  const state = newState('main', 'p2');
  put(state, 'shaman', 'battle-rattle-shaman', 'p1');
  put(state, 'brute', 'highland-game', 'p1', { power: 5, toughness: 5, summoningSickness: true });
  put(state, 'scout', 'highland-game', 'p1', { power: 2, toughness: 2 });
  pendShaman(state, ['brute', 'scout']);
  const chosen = botPick(state);
  assert.equal(chosen.targetId, 'brute',
    `w cudzej turze chory 5/5 blokuje najlepiej: ${JSON.stringify(chosen)}`);
});

// ============================================================================
// Strażnik fałszywego alarmu (audyt zasięgu PMSSB-60, 2026-10-10).
//
// Podczas skanu rejestru pod kątem wpisu `pump` w `ETB_EFFECT_BONUS` wyszło,
// że Shaman dostaje +1,8 za trigger IDENTYCZNIE przy 0, 1 i 3 własnych
// stworach. Wyglądało to na brak bramki „mam komu dać buffa" (wpis
// `buff_creature_until_end_of_turn` taką bramkę ma) — i powstał fix, który
// ją dokładał. Fix był BŁĘDNY i cofnięty:
//
//   • Battle-Rattle Shaman to stworzenie 2/2, a jego trigger ma
//     `requiresTarget: {type:'creature'}` BEZ wykluczenia źródła (brak
//     „other"/„creature you control other than ~"), więc MOŻE wzmocnić
//     SAM SIEBIE — przy pustym polu wejdzie jako 2/2 i spumpuje się do 4/2;
//   • bramka liczyłaby `myCreatures` w chwili RZUTU (karta jeszcze w ręce),
//     a trigger rozstrzyga się po wejściu źródła — czyli w złym momencie.
//
// Płaskie +1,8 jest więc POPRAWNE i jest celowo przypięte już w
// `test/pmssb10-ogon-wave-b2.test.js` („may-pump +1.8 (65.70)"), które ten
// fix wywalał. Ta pinezka domyka przypadki 1 i 3 stworów i zapisuje powód,
// żeby nikt nie „naprawił" tego ponownie.
// ============================================================================

const SHAMAN_BEZ_TRIGGERA = createRegistry(REGISTRY.all().map((c) => (
  c.id === 'battle-rattle-shaman'
    ? { ...c, abilities: (c.abilities ?? []).filter((a) => a.type !== 'triggered') }
    : c)));

/** Shaman w ręce + `innych` własnych stworów 2/2; `rejestr` = wariant karty. */
function shamanCastScene(innych, rejestr) {
  const state = createGameState({ seed: 1209, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 14);
  for (let i = 0; i < 30; i++) addObject(state, { id: `lb${i}`, instanceId: `i-lb${i}`, cardId: 'x',
    controllerId: 'p1', zone: 'library', kind: 'sorcery', power: 0, toughness: 0, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: [], cardName: 'lb' });
  for (let i = 0; i < innych; i++) addObject(state, { id: `v${i}`, instanceId: `i-v${i}`, cardId: 'x',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2,
    manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['R'], cardName: 'v' });
  addObject(state, { id: 'c1', instanceId: 'i-c1', cardId: 'battle-rattle-shaman', controllerId: 'p1',
    ownerId: 'p1', zone: 'hand', ...gameObjectDataOf(rejestr.get('battle-rattle-shaman')) });
  return state;
}

function shamanCastScore(innych, rejestr) {
  const bot = createHeuristicBot({ seed: 1210, registry: rejestr });
  bot.chooseCommand(playerView(shamanCastScene(innych, rejestr), 'p1'));
  const traf = (bot.trace().at(-1)?.options ?? []).filter((o) => o.cmd.includes('(c1'));
  assert.ok(traf.length, 'oferta rzutu Shamana istnieje');
  return traf[0].score;
}

test('Shaman: +1,8 za trigger niezależnie od INNYCH własnych stworów — może celować w siebie', () => {
  for (const innych of [0, 1, 3]) {
    const delta = shamanCastScore(innych, REGISTRY) - shamanCastScore(innych, SHAMAN_BEZ_TRIGGERA);
    assert.ok(Math.abs(delta - 1.8) < 1e-9,
      `inne własne stwory=${innych}: delta ${delta}, oczekiwano 1,8 (trigger może wzmocnić samego Shamana)`);
  }
  // Wartość bezwzględna przy pustym polu — spójna z PMSSB10-B2 (65,70).
  assert.ok(Math.abs(shamanCastScore(0, REGISTRY) - 65.7009) < 1e-9,
    `oczekiwano 65.7009, jest ${shamanCastScore(0, REGISTRY)}`);
});

// ---------------------------------------------------------------------------
// A (zgłoszenie właściciela 2026-10-21e, Battle-Rattle Shaman):
// bot buffuje stwora, którym NIE zamierza atakować.
//
// Log właściciela (początek walki):
//   Battle-Rattle Shaman — trigger (początek walki)
//   Battle-Rattle Shaman — cel: Kozilek's Shrieker
//   Kozilek's Shrieker dostaje +2/+0
//   Atak: Warden of Geometries
//
// ISTNIEJĄCY fix B (bot-shaman-atakujacy B/3–B/6) rozwiązał wariant
// „choroba przywołania": premiuje stwora ZDOLNEGO do ataku. To za
// słabe, gdy WSZYSTKIE stwory są zdolne do ataku — wtedy zostaje czysta
// wartość 2P+T i bot wybiera największego, a deklaruje atak innym.
// +2/+0 wygasa z końcem tury bez skutku (CR 514.2), więc buff na
// nie-atakującym to zmarnowana decyzja.
//
// Reguła generyczna (ADR 0002, pin H/4): przy dodatnim pumpie siły na
// WŁASNEJ turze bot ma pytać POLITYKĄ ATAKU (`attackIntendsCreature` —
// ta sama funkcja, którą zastosuje w `declare_attackers`), nie tylko
// „czy stwór może atakować". To nie jest spec-case dla Shamana: ten sam
// predykat obsługuje każdy „you may have target creature get +N/+M".
// ---------------------------------------------------------------------------

test('A/1 ⭐ RED: bot buffuje stwora, którym NIE zamierza atakować (sedno zgłoszenia)', () => {
  // Odtworzenie logu właściciela 1:1:
  //   Kozilek's Shrieker 3/2, Warden of Geometries 2/3, wróg 2/2.
  // Bot zamierza atakować WARDENA (2/3 wytrzymuje blok, 3/2 ginie),
  // a +2/+0 daje KOZILEKOWI — największemu wg 2P+T (8 vs 7).
  // Policzone z tej samej planszy, więc to nie heurystyka testu, tylko
  // realna polityka ataku bota.
  const plansza = (step) => {
    const s = newState(step, 'p1');
    put(s, 'shrieker', 'kozileks-shrieker', 'p1');   // 3/2 — 2P+T = 8
    put(s, 'warden', 'warden-of-geometries', 'p1');   // 2/3 — 2P+T = 7
    put(s, 'foe', 'highland-game', 'p2', { power: 2, toughness: 2 });
    return s;
  };

  // 1) Intencja ataku bota (krok deklaracji, bez pendingu).
  const atakCmd = createHeuristicBot({ seed: 1209 })
    .chooseCommand(playerView(plansza('declare_attackers'), 'p1'));
  assert.equal(atakCmd.type, 'declare_attackers', `sanity: ${atakCmd.type}`);
  const attacks = atakCmd.attackerIds ?? [];
  console.log('  intencja ataku bota:', JSON.stringify(attacks));
  assert.ok(attacks.includes('warden') && !attacks.includes('shrieker'),
    `sanity: bot zamierza atakować WARDENA, nie Shrikera (${JSON.stringify(attacks)})`);

  // 2) Ta sama plansza na początku walki, z oczekującym triggerem Shaman.
  const state = plansza('beginning_of_combat');
  put(state, 'shaman', 'battle-rattle-shaman', 'p2', { power: 2, toughness: 2 });
  pendShaman(state, ['shrieker', 'warden']);
  const chosen = createHeuristicBot({ seed: 1209 })
    .chooseCommand(playerView(state, 'p1'));
  console.log('  cel bufora:', chosen.targetId);

  assert.equal(chosen.type, 'resolve_trigger_target');
  // +2/+0 wygasa z końcem tury (CR 514.2) — buff na nie-atakującym to
  // zmarnowana decyzja. Powinien iść na stwora, którym bot naprawdę atakuje.
  assert.equal(chosen.targetId, 'warden',
    `+2/+0 ma iść na stwora, którym bot ATakuje, nie na największego 2P+T: `
    + `${JSON.stringify(chosen)}`);
});
