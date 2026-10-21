// Audyt PR #171 (2026-10-21d) — zgłoszenie właściciela „aura Chronic
// Flooding psuje rzut czaru w Mana Wizardzie". Test jest GENERYCZNY —
// nie ma w nim żadnej logiki specyficznej dla Chronic Flooding ani
// Kuldothy. Każdy trigger \"przy tapnięciu lądu\" z auto-tapu kreatora
// many zachowuje się tak samo.
//
// Scenariusz (RED):
//   1. Na polu bitwy leży Island z aury Chronic Flooding + karta do
//      rzucenia (tutaj Kuldotha {4}{R}) w ręce + 5 many R w puli.
//   2. Kreator many MANUALNIE tapnie Island (kolor U, ale kreator zawsze
//      oferuje dostępne źródła).
//   3. Trigger Chronic Flooding „whenever enchanted land becomes tapped"
//      ląduje na stosie (object_tapped → ability_triggered).
//   4. Kreator many commit-uje `cast_permanent`.
//   5. Silnik odrzuca komendę z `illegal_cast:Zagranie przy niepustym stosie`
//      (reguła CR 307.1/117.1a: sorcery-speed spell wymaga pustego stosu).
//   6. UI w main.js czyta `stillLegal === false` z `legalCommands` i drukuje
//      „Płatność zebrana, ale zagranie nie jest już dostępne — mana
//      została w puli". Gracz musi ponowić klik po rozstrzygnięciu triggera.
//
// Po fixie (GREEN): kreator many powinien wykryć, że został zablokowany
// przez triggery \"z własnego auto-tapu\" i ponowić commit po ich
// rozstrzygnięciu (pełen cykl pasów obu graczy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';

const registry = createCardRegistry();

function game() {
  const state = createGameState({ seed: 67, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function put(state, id, cardId, zone, patch = {}) {
  const def = registry.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1',
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes,
    keywords: def.keywords ?? [], ...patch,
  });
  return state.objects.get(id);
}

function land(state, id, sub) {
  return put(state, id, `basic-${sub.toLowerCase()}`, 'battlefield', {
    kind: 'land', types: ['Land'], colors: [],
    abilities: [{ type: 'mana', produces: [sub[0]], text: '{T}: dodaj 1 manę' }],
  });
}

// KRYTYCZNY test — przepisuję to wersję po fixie. Obecny silnik: cast odrzuca.
// Po fixie kreator many ma wykryć ten wzorzec (\"trigger na stosie z auto-tapu
// płatności tego samego czaru\") i ponowić commit. Testujemy kontrakt
// wysokopoziomowo: trigger Chronic Flooding MUSI być w finalnym stosie (jako
// część tej samej operacji płatności) i karta MUSI być rzucona poprawnie.
test('PR171/A ⭐ reprodukcja zgłoszenia: tap Island z aury + commit czaru — oba MUSZĄ być na stosie (po fixie)', () => {
  const s = game();
  put(s, 'kul', 'kuldotha-ringleader', 'hand');
  land(s, 'isl', 'Island');
  land(s, 'mtn', 'Mountain');
  put(s, 'aura', 'chronic-flooding', 'battlefield');
  attachAuraToCreature(s, 'aura', 'isl');
  for (let i = 0; i < 12; i += 1) put(s, 'lib' + i, 'basic-forest', 'library');
  addMana(s, 'p1', 5, { colors: ['R', 'R', 'R', 'R', 'R'] });

  // KROK 1: gracz w kreatorze many MANUALNIE tapnie Island (symulujemy \"Zatwierdź wybór lądu")
  const tap = execute(s, { type: 'tap_for_mana', playerId: 'p1', objectId: 'isl' });
  assert.equal(tap.ok, true, 'tap Island z aury MUSI przejść (mana ability)');
  assert.ok(s.zones.stack.some((id) => s.objects.get(id)?.cardId === 'chronic-flooding'),
    'trigger Chronic Flooding MUSI wylądować na stosie (object_tapped → ability_triggered)');
  assert.equal(s.players.find((p) => p.id === 'p1').mana, 6,
    'mana p1 po tap powinna wzrosnąć o {U} do 6 (5R + 1U)');

  // KROK 2: kreator many commit-uje cast_permanent. Tu jest różnica między
  // OBECNYM a POŻĄDANYM zachowaniem: obecny silnik odrzuca, celem fixu jest
  // ponowienie commitu tak, by czar i trigger znalazły się w stosie.
  const r = execute(s, { type: 'cast_permanent', playerId: 'p1', objectId: 'kul', targets: [] });
  console.log('  cast (1. klik po tap) →', { ok: r.ok, reason: r.reason });
  console.log('  STOS:', s.zones.stack.map((id) => s.objects.get(id)?.cardId).join(','));
  console.log('  legalCommands „cast_...":', playerView(s, 'p1').legalCommands.filter((c) => String(c.type).startsWith('cast_')).length);

  // POŽĄDANE zachowanie (po fixie):
  //   czar MUSI przejść (lub kreator many MUSI ponowić commit po
  //   rozstrzygnięciu triggera) tak, że finalnie stos ma chronic-flooding
  //   i kuldotha-ringleader, a legalCommands nie ma żadnych cast_ ofert.
  assert.ok(r.ok === true,
    'PO FIXIE: cast_permanent musi przejść mimo triggera na stosie — kreator many '
    + 'ma obowiązek ponowienia lub wyprzedzenia w tej samej operacji');
  const stackIds = s.zones.stack.map((id) => s.objects.get(id)?.cardId);
  assert.ok(stackIds.includes('chronic-flooding'),
    'trigger Chronic Flooding MUSI siedzieć na stosie (auto-tap lądu z aury)');
  assert.ok(stackIds.includes('kuldotha-ringleader'),
    'Kuldotha MUSI być rzucony (mana zapłacona z puli)');
});

// Anty-regresja: BEZ aury kreator many tapnia Island, commit natychmiastowy.
// NIE chcemy fixu, który łamie ten przypadek.
test('PR171/B GREEN: bez aury — tap Island, commit cast_permanent — czar natychmiast, triggerów nie ma', () => {
  const s = game();
  put(s, 'kul', 'kuldotha-ringleader', 'hand');
  land(s, 'isl', 'Island');
  land(s, 'mtn', 'Mountain');
  for (let i = 0; i < 12; i += 1) put(s, 'lib' + i, 'basic-forest', 'library');
  addMana(s, 'p1', 5, { colors: ['R', 'R', 'R', 'R', 'R'] });

  // tap manualny (bez aury — czyste Island)
  const tap = execute(s, { type: 'tap_for_mana', playerId: 'p1', objectId: 'isl' });
  assert.equal(tap.ok, true, 'tap Island MUSI przejść');
  assert.equal(s.zones.stack.length, 0, 'bez aury — brak triggera, stos pusty');

  // commit natychmiastowy — czar musi przejść
  const r = execute(s, { type: 'cast_permanent', playerId: 'p1', objectId: 'kul', targets: [] });
  assert.equal(r.ok, true, 'bez aury — czar przechodzi (stos pusty)');
  assert.ok(s.zones.stack.some((id) => s.objects.get(id)?.cardId === 'kuldotha-ringleader'),
    'Kuldotha MUSI wylądować na stosie');
  assert.equal(s.zones.stack.length, 1, 'na stosie ma być TYLKO Kuldotha (bez triggera)');
});