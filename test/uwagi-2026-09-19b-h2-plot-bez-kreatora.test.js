// =============================================================================
// H2 (zgłoszenie właściciela 2026-09-19b, Sheriff of Safe Passage):
//
//   „jak rzucałem Sheriff of Safe Passage z exile (po wcześniejszym Plocie) to
//    zamiast bezpłatnego rzucania otworzył mi się Mana Wizard i musiałem
//    zapłacić 3 many, żeby czar został rzucony. Nie wiem, może bot miał to za
//    darmo, ale ja na pewno musiałem zapłacić.”
//
// Pomiar (dbg): silnik rozlicza rzut zaplotowanej karty jako darmowy
// (`permanent_cast.manaSpent === 0` — pin H/1 w `-g-h-okna-impuls-plot`), ale
// WARSTWA UI liczyła koszt z `MANA_COSTS` — `paymentDescriptorOf` nie znał
// ani plotu, ani darmowego impulsu, więc kreator płatności otwierał się
// z pełnym kosztem {2}{W}. Gracz tapował 3 lądy („zapłacił”), a silnik i tak
// wydawał 0 many — mana z puli przepadała.
//
// To ta sama klasa, którą P6 (H) naprawił w ETYKIECIE (L102/1: dwie listy
// warunków opisujące tę samą rodzinę — etykieta mówiła „bez kosztu many”,
// a bramka płatności dalej żądała pełnego kosztu). Fix: JEDEN predykat rdzenia
// `castsWithoutPayingMana` (impulse-window.js) dla etykiety i dla bramki
// kreatora (mana-wizard.js → `paymentDescriptorOf` zwraca null).
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { stampImpulseWindow } from '../src/engine/impulse-window.js';
import { commandLabel } from '../src/table/render.js';
import { paymentDescriptorOf } from '../src/table/mana-wizard.js';

const REGISTRY = createCardRegistry();
const SESSION = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? id,
  nameOfObject: (id) => id,
  cardDetails: (id) => REGISTRY.get(id),
  abilitiesOf: (id) => gameObjectDataOf(REGISTRY.get(id)).abilities ?? [],
};

const KARTA = 'sheriff-of-safe-passage';

/**
 * Stół: karta w WYGNANIU (ze stemplem sceny), 3 nietapnięte Plains, tura 2.
 * Stemple kładziemy po `addObject` — bo `addObject` przyjmuje tylko pola
 * kontraktu obiektu (`plotted`, `plot`), a okno impulsu jest stemplem
 * nadawanym w grze przez efekt (`stampImpulseWindow`).
 */
function board(stamp) {
  const state = createGameState({ seed: 21, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.phase = 'precombat_main';
  state.turn.number = 2;

  const def = REGISTRY.get(KARTA);
  const id = `${KARTA}#1`;
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: KARTA, controllerId: 'p1', ownerId: 'p1', zone: 'exile',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, plot: def.plot ?? null,
  });
  if (stamp?.plotted) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), plotted: true, plottedAtTurn: 1 }));
  }
  if (stamp?.untilTurn != null) {
    state.objects.set(id, stampImpulseWindow(state.objects.get(id), {
      untilTurn: stamp.untilTurn, withoutPaying: Boolean(stamp.withoutPaying),
    }));
  }
  for (let i = 0; i < 3; i += 1) {
    const land = REGISTRY.get('basic-plains');
    addObject(state, {
      id: `plains#${i}`, instanceId: `i-p${i}`, cardId: 'basic-plains', controllerId: 'p1',
      ownerId: 'p1', zone: 'battlefield', ...gameObjectDataOf(land), types: ['Land'], subtypes: ['Plains'],
    });
  }
  const view = playerView(state, 'p1');
  const cmd = view.legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === id) ?? null;
  return { state, view, cmd, id };
}

// ---------------------------------------------------------------------------
// H2/1 — scena właściciela: zaplotowana karta NIE otwiera kreatora many
// ---------------------------------------------------------------------------
test('H2/1: rzut zaplotowanej karty nie otwiera kreatora płatności (scena właściciela)', () => {
  const { state, view, cmd, id } = board({ plotted: true });
  assert.ok(cmd, 'silnik oferuje rzut zaplotowanej karty w następnej turze (CR 702.170d)');
  assert.equal(view.zones.exile.find((o) => o.id === id)?.plotted, true, 'widok niesie stempel plotu');
  assert.equal(paymentDescriptorOf(cmd, view), null,
    'deskryptor płatności = null → kreator many się nie otwiera (był: pełny koszt {2}{W})');
  // Etykieta (P6) mówi to samo co bramka płatności.
  const label = commandLabel(cmd, SESSION, view).replace(/<[^>]*>/g, '');
  assert.match(label, /bez kosztu many/, `etykieta oferty: „${label}”`);
  // I sam rzut jest darmowy: żadne lądy nie zostają tapnięte.
  assert.ok(execute(state, cmd).ok, 'rzut wykonalny bez dodawania many');
  assert.ok(state.zones.stack.length > 0, 'karta na stosie');
  const ladowe = [...state.objects.values()].filter((o) => o.zone === 'battlefield' && o.cardId === 'basic-plains');
  assert.equal(ladowe.filter((l) => l.tapped).length, 0, '0 tapniętych lądów — gracz nic nie płaci');
  assert.equal(state.players.find((p) => p.id === 'p1').mana, 0, 'pula many nietknięta');
});

// ---------------------------------------------------------------------------
// H2/2 — darmowy impuls: ta sama reguła
// ---------------------------------------------------------------------------
test('H2/2: darmowy impuls z wygnania też nie otwiera kreatora płatności', () => {
  const { view, cmd } = board({ untilTurn: 5, withoutPaying: true });
  assert.ok(cmd, 'oferta rzutu z okna impulsu');
  assert.equal(paymentDescriptorOf(cmd, view), null, 'darmowy impuls = brak kreatora');
  const label = commandLabel(cmd, SESSION, view).replace(/<[^>]*>/g, '');
  assert.match(label, /bez kosztu many/, `etykieta: „${label}”`);
  assert.match(label, /do końca tury 5/, 'okno impulsu nadal na etykiecie');
});

// ---------------------------------------------------------------------------
// H2/3 — anty-over-fix: PŁATNY impuls zachowuje pełny koszt i kreator
// ---------------------------------------------------------------------------
test('H2/3 (anty-over-fix): płatny impuls zachowuje pełny koszt i kreator płatności', () => {
  const { view, cmd } = board({ untilTurn: 5, withoutPaying: false });
  assert.ok(cmd, 'oferta rzutu z płatnego okna impulsu');
  const descriptor = paymentDescriptorOf(cmd, view);
  assert.ok(descriptor, 'płatny impuls MA deskryptor płatności (pełny koszt {2}{W})');
  assert.equal(descriptor.totalNeeded, 3, `koszt pełny: ${descriptor.totalNeeded}`);
  assert.deepEqual(descriptor.requirements, [['W']], 'pipy kolorów bez zmian');
  const label = commandLabel(cmd, SESSION, view).replace(/<[^>]*>/g, '');
  assert.match(label, /\(koszt /, `etykieta mówi o koszcie: „${label}”`);
  assert.doesNotMatch(label, /bez kosztu many/, 'płatny impuls nie może udawać darmowego');
});

// ---------------------------------------------------------------------------
// H2/4 — anty-over-fix: karta Z RĘKI bez zmian
// ---------------------------------------------------------------------------
test('H2/4 (anty-over-fix): zwykły rzut z ręki ma pełny koszt i kreator', () => {
  const state = createGameState({ seed: 22, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.phase = 'precombat_main';
  const def = REGISTRY.get(KARTA);
  addObject(state, {
    id: 'sheriff#h', instanceId: 'i-sheriff#h', cardId: KARTA, controllerId: 'p1', ownerId: 'p1', zone: 'hand',
    ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [], spell: def.spell,
  });
  for (let i = 0; i < 3; i += 1) {
    const land = REGISTRY.get('basic-plains');
    addObject(state, {
      id: `plains#h${i}`, instanceId: `i-ph${i}`, cardId: 'basic-plains', controllerId: 'p1',
      ownerId: 'p1', zone: 'battlefield', ...gameObjectDataOf(land), types: ['Land'], subtypes: ['Plains'],
    });
  }
  const view = playerView(state, 'p1');
  const cmd = view.legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'sheriff#h');
  assert.ok(cmd, 'oferta rzutu z ręki (3 Plains pokrywają {2}{W})');
  const descriptor = paymentDescriptorOf(cmd, view);
  assert.ok(descriptor, 'karta z ręki: deskryptor zostaje (brak darmowego rzutu)');
  assert.equal(descriptor.totalNeeded, 3);
});

// ---------------------------------------------------------------------------
// H2/5 (klasa, L102/1) — etykieta i bramka płatności to JEDNA reguła
// ---------------------------------------------------------------------------
test('H2/5 (klasa): „bez kosztu many” na etykiecie ⟺ brak kreatora płatności', () => {
  const sceny = [
    ['plot', { plotted: true }],
    ['impuls darmowy', { untilTurn: 5, withoutPaying: true }],
    ['impuls płatny', { untilTurn: 5, withoutPaying: false }],
  ];
  const bad = [];
  for (const [nazwa, stamp] of sceny) {
    const { view, cmd } = board(stamp);
    const label = commandLabel(cmd, SESSION, view).replace(/<[^>]*>/g, '');
    const darmowaEtykieta = /bez kosztu many/.test(label);
    const brakKreatora = paymentDescriptorOf(cmd, view) == null;
    if (darmowaEtykieta !== brakKreatora) {
      bad.push(`${nazwa}: etykieta „darmowa”=${darmowaEtykieta}, kreator zamknięty=${brakKreatora}`);
    }
  }
  assert.deepEqual(bad, [], 'rozjazd etykiety i bramki płatności (klasa L102/1)');
});
