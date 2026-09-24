// =============================================================================
// A (zgłoszenie właściciela 2026-09-19b) — Cloudbound Moogle, Plainscycling:
//
//   „Po wybraniu zdolności dostaję takie opcje w Twoje działania: »Szukanie:
//    Plains«, »Szukanie — nie znajduj karty (rezygnuję)«. Skoro wybieram
//    Plainscycling, to wybieram. […] Ewentualnie jeśli wykorzystam ją,
//    a nie mam w talii żadnego Plains, to czar się wykonuje, tylko nic nie
//    trafia do mojej ręki.”
//   KOREKTA właściciela (ta sama sesja): „Mogę nie wybrać żadnego plainsa
//    mimo, że one tam są. Czyli automatycznie powinno być tylko wtedy, jeśli
//    nie ma żadnego plainsa w talii. Gdy jest przynajmniej 1, to dostaję MODAL
//    wyboru (a NIE OPCJE w »Twoje działania«). W modalu mam tyle opcji, ile mam
//    Plainsów w talii + opcja »nie znajdujesz«, która jest legalna nawet jeśli
//    mam je w talii.”
//
// Kontrakt więc:
//   1. 0 kandydatów („szukaj karty, której nie ma”) → zdolność rozstrzyga się
//      SAMA (przeszukanie + tasowanie, CR 701.24a „fail to find”), bez decyzji;
//   2. ≥1 kandydatów → decyzja (modal) z wariantami: każdy kandydat ORAZ
//      „nie znajduj karty” — odmowa jest legalna ZAWSZE (CR 701.23b), nie
//      tylko przy braku kandydatów;
//   3. decyzja nie kolapsuje się do panelu „Twoje działania” (odwrócenie M131
//      dla szukania — patrz test/m131-modal-bez-wyboru.test.js).
//
// Zakres: CAŁA rodzina cyclingów (zwykły cycling dobiera, typecycling szuka) —
// strażnik rodzinowy niżej, bo objaw dotyczył jednej karty, a reguła jest
// generyczna (ADR 0002).
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { buildActionEntries, commandLabel } from '../src/table/render.js';

const REGISTRY = createCardRegistry();
const SESSION = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? id,
  nameOfObject: (id) => REGISTRY.get(String(id).split('#')[0])?.name ?? id,
  cardDetails: (id) => REGISTRY.get(id),
  abilitiesOf: (id) => gameObjectDataOf(REGISTRY.get(id)).abilities ?? [],
  colorsOf: () => [],
};

let counter = 0;

/** Stół z ręką p1, biblioteką i dogranym cyclingiem do decyzji szukania. */
function cyclingBoard({ source = 'cloudbound-moogle', library = [] } = {}) {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  const put = (cardId, zone) => {
    const def = REGISTRY.get(cardId);
    assert.ok(def, `karta ${cardId} istnieje`);
    const data = gameObjectDataOf(def);
    const id = `${cardId}#${counter += 1}`;
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone,
      kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
      abilities: data.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
      types: def.types ?? [], colors: data.colors ?? [], cardName: def.name, spell: def.spell,
    });
    return id;
  };
  put('basic-plains', 'battlefield');
  put('basic-plains', 'battlefield');
  put('basic-plains', 'battlefield');
  const sourceId = put(source, 'hand');
  library.forEach((c) => put(c, 'library'));
  return { state, sourceId };
}

/** Aktywuje cycling źródła i dogrywa priorytety (CR 602.2a). */
function activateCycling(state, sourceId) {
  const view = playerView(state, 'p1');
  const activate = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === sourceId);
  assert.ok(activate, 'cycling jest oferowany');
  execute(state, activate);
  for (let i = 0; i < 8 && !state.pendingSearchChoice && state.zones.stack.length > 0; i += 1) {
    for (const pid of ['p1', 'p2']) {
      const pass = playerView(state, pid).legalCommands.find((c) => c.type === 'pass_priority');
      if (pass) execute(state, pass);
      if (state.pendingSearchChoice || state.zones.stack.length === 0) break;
    }
  }
}

test('A/1: typecycling BEZ kandydata w bibliotece rozstrzyga się SAM (fail to find)', () => {
  const { state, sourceId } = cyclingBoard({ library: ['basic-forest', 'basic-island'] });
  activateCycling(state, sourceId);
  assert.equal(state.pendingSearchChoice, null,
    'brak Plainsa w bibliotece = brak wyboru; zdolność domyka się sama');
  const searched = state.events.filter((e) => e.type === 'library_searched');
  assert.equal(searched.length, 1, 'przeszukanie + tasowanie odbyło się (CR 701.24a)');
  assert.equal(searched[0].foundCardId, null, 'nic nie trafiło do ręki');
  assert.equal(searched[0].shuffled, true, 'biblioteka została potasowana');
  assert.equal(state.zones.stack.length, 0, 'stos pusty — zdolność rozstrzygnięta');
});

test('A/2: typecycling Z kandydatami otwiera decyzję z odmową (CR 701.23b)', () => {
  const { state, sourceId } = cyclingBoard({ library: ['basic-plains', 'basic-forest'] });
  activateCycling(state, sourceId);
  assert.ok(state.pendingSearchChoice, 'wybór karty ma być decyzją gracza');
  assert.equal(state.pendingSearchChoice.mandatory, false,
    '„nie znajduj karty” jest legalne ZAWSZE (nie tylko bez kandydatów)');
  const commands = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_search_choice');
  assert.ok(commands.some((c) => c.found == null), 'jest wariant odmowy');
  assert.ok(commands.some((c) => c.found != null), 'jest wariant znalezienia');
});

test('A/3: odmowa przy dostępnym Plainsie jest PRZYJMOWANA (nie tylko oferowana)', () => {
  const { state, sourceId } = cyclingBoard({ library: ['basic-plains', 'basic-forest'] });
  activateCycling(state, sourceId);
  const decline = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_search_choice' && c.found == null);
  assert.ok(decline, 'oferta odmowy');
  const result = execute(state, decline);
  assert.ok(result.ok, `odmowa musi być legalna: ${JSON.stringify(result.events?.[0] ?? {})}`);
  assert.equal(state.zones.hand.filter((id) => state.objects.get(id)?.cardId === 'basic-plains').length, 0,
    'odmowa nie bierze karty do ręki');
});

test('A/4: decyzja szukania idzie MODALEM, a nie przyciskami panelu', () => {
  const { state, sourceId } = cyclingBoard({ library: ['basic-plains', 'basic-forest'] });
  activateCycling(state, sourceId);
  const view = playerView(state, 'p1');
  const modals = [];
  const searchButtons = [];
  for (const entry of buildActionEntries(view.legalCommands, SESSION, view)) {
    if (entry.request) modals.push(entry.request);
    else if (entry.command?.type === 'resolve_search_choice') searchButtons.push(commandLabel(entry.command, SESSION, view));
  }
  assert.equal(searchButtons.length, 0,
    `warianty szukania nie mogą być przyciskami panelu: ${JSON.stringify(searchButtons)}`);
  assert.equal(modals.length, 1, 'jest jeden modal wyboru karty');
  const labels = modals[0].options.map((c) => commandLabel(c, SESSION, view));
  assert.ok(labels.some((l) => /nie znajduj/i.test(l)), `modal niesie odmowę: ${JSON.stringify(labels)}`);
});

test('A/5 (strażnik rodzinowy): każdy typecycling przechodzi tę samą ścieżką', () => {
  const typecycling = REGISTRY.all().filter((def) => (def.abilities ?? [])
    .some((a) => a?.cycling && (a.cycling.subtypes ?? []).length > 0));
  assert.ok(typecycling.length >= 3,
    `katalog ma sensownie wiele typecyclingów (jest ${typecycling.length})`);
  for (const def of typecycling) {
    const { state, sourceId } = cyclingBoard({ source: def.id, library: ['basic-forest'] });
    activateCycling(state, sourceId);
    // Brak kandydata na podtyp tej karty → automat (bez wyjątków per karta).
    assert.equal(state.pendingSearchChoice, null,
      `${def.id}: brak kandydata ma się rozstrzygać sam (objaw A nie może wrócić)`);
  }
});
