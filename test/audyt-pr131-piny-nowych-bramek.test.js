// Audyt PR #131 (ADR 0020 pkt 2) — piny bramek, które PR #131 dodał albo
// przepisał, a żaden test ich nie mierzył. Odkryte mutacjami audytu
// (wyłączenie bramki zostawiało wszystkie ówczesne piny ZIELONE — L13):
//
//  F1. `resolveDelveExile` (spells.js) odrzuca liczbę kart spoza listy
//      opłacalnych wariantów (`affordableCounts`). Bramka pochodzi z PR #130,
//      ale PR #131 przepisywał całą ścieżkę Delve (znalezisko B) i dopisał
//      pin F1 dopiero teraz. Pomiar sondą (`scratch/probe-delve-atomicity.mjs`
//      w sesji audytu): z bramką odrzucona komenda zostawia decyzję
//      `pendingDelveExile` czekającą, bez bramki decyzja jest KONSUMOWANA
//      (zerowana PRZED rzutem, który i tak pada na płatności) — czyli
//      nielegalna komenda mutowała stan (klasa L48 / atomowość CR 601.2h).
//  F2. Decyzja gospodarza aury emituje parę zdarzeń
//      `aura_host_choice_required` → `aura_host_resolved` (protokół, L112;
//      sesja ma osobną gałąź logu dla `aura_host_resolved`). Usunięcie emisji
//      nie czerwieniło żadnego testu — kontrakt nie był mierzony.
//  F3. `resolve_aura_host` przyjmuje wyłącznie gospodarza z `candidateIds`:
//      oferta i walidacja muszą się zgadzać w OBIE strony (L48). Kontrola jest
//      tym istotniejsza, że `isLegalAuraHost` jest predykatem CHWILI — nowy
//      permanent na polu bitwy byłby legalnym gospodarzem, ale nie był
//      opublikowany w ofercie.
//  F4. Pin GRANICY (L158 — „nie naprawiamy świadomie" = pomiar + powód + pin
//      braku pogorszenia). Kontrakt `applyEffect` mówi, że efekt otwierający
//      blokującą decyzję zwraca `true` — wtedy rozstrzyganie czaru czeka na
//      `finishPendingSpell`. Gałąź zwrotu aury (effects.js) zwraca `undefined`,
//      więc kolejne efekty tej samej listy poszłyby PRZED wyborem gospodarza
//      (CR 608.2 — kolejność efektów w rozstrzyganiu). W dzisiejszym katalogu
//      jest to nieosiągalne: zwrot permanentu z grobu jest ZAWSZE ostatnim
//      efektem swojej listy (Zoraline ×2, Unbreakable Bond, Unearth,
//      Annie Flash — sprawdza ten test). Pin pilnuje granicy: pierwsza karta
//      z efektem PO zwrocie czerwienieje i wymusza dokończenie kontynuacji
//      (`resolve_aura_host` musiałby domykać `pendingSpell`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const registry = createCardRegistry();

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 131, players: players.map((id) => ({ id })) });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const playerId of players) for (let i = 0; i < 4; i++) put(state, `lib-${playerId}-${i}`, 'basic-swamp', playerId, 'library');
  return state;
}

function put(state, id, cardId, playerId = 'p1', zone = 'hand') {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w prawdziwym rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  return state.objects.get(id);
}

const commands = (s, p = s.turn.priorityPlayerId) => playerView(s, p).legalCommands;
const find = (s, cardId, zone = 'battlefield') => [...s.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);
const reasonOf = (r) => r?.events?.find((e) => e.type === 'command_rejected')?.reason ?? '';

function run(s, cmd) {
  assert.ok(cmd, 'oferta komendy istnieje');
  const r = execute(s, cmd);
  assert.ok(r.ok, `komenda przyjęta (${reasonOf(r)})`);
  return r;
}

// --- F1 ---------------------------------------------------------------------
test('F1: liczba kart Delve spoza listy opłacalnych nie konsumuje decyzji (L48/CR 601.2h)', () => {
  const s = game();
  put(s, 'mandrills', 'hooting-mandrills');
  addObject(s, {
    id: 'reducer', instanceId: 'i-reducer', cardId: 'x-reducer', controllerId: 'p1', zone: 'battlefield',
    kind: 'artifact', manaCost: 2, keywords: [], subtypes: [], types: ['Artifact'], colors: [], cardName: 'Reduktor',
    abilities: [Object.freeze({ type: 'static', costModifier: Object.freeze({ spellTypes: ['Creature'], amount: 1 }), cost: null, effect: null, trigger: null })],
  });
  for (let i = 0; i < 6; i += 1) put(s, `fodder-${i}`, 'basic-swamp', 'p1', 'graveyard');
  addMana(s, 'p1', 1, { colors: ['G'] }); // opłacalny tylko wariant k=4

  const offer = commands(s).find((c) => c.type === 'cast_permanent' && c.objectId === 'mandrills');
  run(s, offer);
  const pending = s.pendingDelveExile;
  assert.deepEqual(pending.affordableCounts, [4], 'oferta publikuje wyłącznie k=4');

  // k=0 jest poza listą opłacalnych (brak 5 many): odrzucenie REGUŁĄ, nie płatnością.
  const bad = execute(s, { type: 'resolve_delve_exile', playerId: 'p1', exileIds: [] });
  assert.equal(bad.ok, false, 'wariant nieopłacalny jest odrzucany');
  assert.match(reasonOf(bad), /Nieprawidłowy koszt Delve/, 'powód nazywa regułę Delve');
  assert.ok(s.pendingDelveExile, 'ODRZUCONA komenda nie konsumuje decyzji (atomowość komendy)');
  assert.equal(s.objects.get('mandrills').zone, 'hand', 'karta zostaje w ręce');
  assert.equal(s.zones.graveyard.length, 6, 'grób nietknięty');
  assert.equal(s.zones.exile.length, 0, 'nic nie wygnano');
  assert.equal(s.players[0].mana, 1, 'mana nietknięta');

  // Legalny wariant nadal domyka rzut — decyzja nie została „zjedzona".
  run(s, { type: 'resolve_delve_exile', playerId: 'p1', exileIds: ['fodder-0', 'fodder-1', 'fodder-2', 'fodder-3'] });
  assert.equal(s.zones.exile.length, 4, 'k=4 przyjęte po odrzuconym wariancie');
});

// --- F2, F3 -----------------------------------------------------------------
function annieReturnsAura(s, { extraCreatures = 0 } = {}) {
  for (let i = 0; i < extraCreatures; i += 1) put(s, `walker-${i}`, 'lightwalker', 'p1', 'battlefield');
  put(s, 'annie', 'annie-flash-the-veteran');
  put(s, 'gy-membrane', 'containment-membrane', 'p1', 'graveyard');
  addMana(s, 'p1', 6, { colors: ['R', 'G', 'W'] });
  run(s, commands(s).find((c) => c.type === 'cast_permanent' && c.objectId === 'annie'));
  for (let i = 0; i < 24 && s.zones.stack.length > 0 && !s.pendingAuraHost; i += 1) {
    const choices = commands(s);
    const pick = choices.find((c) => c.type === 'resolve_trigger_target') ?? choices.find((c) => c.type === 'pass_priority');
    assert.ok(pick, 'jest czym popchnąć rozstrzygnięcie triggera');
    run(s, pick);
  }
  assert.ok(s.pendingAuraHost, 'decyzja o gospodarzu otwarta');
}

test('F2: decyzja gospodarza aury emituje zdarzenie `aura_host_resolved` (kontrakt decyzji)', () => {
  const s = game();
  annieReturnsAura(s, { extraCreatures: 1 });
  const annieBf = find(s, 'annie-flash-the-veteran', 'battlefield');
  const r = run(s, commands(s).find((c) => c.type === 'resolve_aura_host' && c.auraHostId === annieBf.id));
  const zdarzenia = (r.events ?? []).filter((e) => e.type === 'aura_host_resolved');
  assert.equal(zdarzenia.length, 1, 'dokładnie jedno zdarzenie rozstrzygnięcia decyzji');
  assert.equal(zdarzenia[0].auraHostId, annieBf.id, 'zdarzenie nazywa wybranego gospodarza');
  assert.equal(find(s, 'containment-membrane', 'battlefield')?.attachedTo, annieBf.id, 'wybór wykonany');
  // Decyzja nie wraca — zdarzenie jest domknięciem, nie zapowiedzią.
  assert.equal(s.pendingAuraHost ?? null, null, 'decyzja zdjęta');
});

test('F3: gospodarz spoza oferty jest odrzucany, choć byłby legalny (oferta = walidacja w obie strony)', () => {
  const s = game();
  annieReturnsAura(s, { extraCreatures: 1 });
  const oferta = commands(s).filter((c) => c.type === 'resolve_aura_host').map((c) => c.auraHostId);
  assert.equal(oferta.length, 2, 'dwa warianty w ofercie');

  // Permanent, który pojawił się PO otwarciu decyzji: `isLegalAuraHost` mówi
  // „tak", ale nie był opublikowany w ofercie — silnik nie może go przyjąć.
  put(s, 'walker-nowy', 'lightwalker', 'p1', 'battlefield');
  assert.ok(!oferta.includes('walker-nowy'), 'nowy permanent nie jest w ofercie');

  const r = execute(s, { type: 'resolve_aura_host', playerId: 'p1', auraHostId: 'walker-nowy' });
  assert.equal(r.ok, false, 'gospodarz spoza candidateIds odrzucony');
  assert.match(reasonOf(r), /illegal_aura_host/, 'powód nazywa nielegalnego gospodarza');
  assert.ok(s.pendingAuraHost, 'decyzja czeka — gracz wybiera z oferty');
  assert.equal(find(s, 'containment-membrane', 'battlefield'), undefined, 'aura nie weszła');

  run(s, commands(s).find((c) => c.type === 'resolve_aura_host'));
  assert.ok(find(s, 'containment-membrane', 'battlefield'), 'wariant z oferty domyka decyzję');
});

// --- F4 ---------------------------------------------------------------------
/** Wszystkie listy efektów karty (zaklęcie, cleave, tryby, zdolności). */
function effectListsOf(def) {
  const lists = [];
  const push = (arr) => { if (Array.isArray(arr) && arr.length > 0) lists.push(arr); };
  push(def.spell?.effects);
  push(def.spell?.cleave?.effects);
  for (const mode of def.spell?.modes ?? []) push(mode.effects);
  for (const ability of def.abilities ?? []) push(ability.effect);
  return lists;
}

test('F4: zwrot permanentu z grobu jest ZAWSZE ostatnim efektem listy (granica kontraktu `blocked`)', () => {
  const znalezione = [];
  for (const def of registry.all()) {
    for (const effects of effectListsOf(def)) {
      const index = effects.findIndex((e) => e?.type === 'return_permanent_from_graveyard');
      if (index === -1) continue;
      znalezione.push(`${def.id}[${index}/${effects.length - 1}]`);
      assert.equal(index, effects.length - 1,
        `${def.name}: efekt PO zwrocie permanentu z grobu wymaga dokończenia kontynuacji `
        + `(gałąź aury w effects.js nie zwraca \`blocked\`, więc kolejne efekty poszłyby przed `
        + `wyborem gospodarza, CR 608.2) — zanim karta wejdzie do katalogu, domknij `
        + `\`pendingSpell\` w handlerze \`resolve_aura_host\``);
    }
  }
  assert.ok(znalezione.length >= 3, `pin nie ma przedmiotu (znalezione: ${znalezione.join(', ')})`);
});
