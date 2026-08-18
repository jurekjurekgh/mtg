// =============================================================================
// M131 — zgłoszenie A właściciela (2026-08-17):
//
//   „Gloomfang Mauler — zdolność swampcycling działa tylko na Swamp, więc
//    jaki sens ma modal wyboru celu tej zdolności??"
//
// Racja. Po dedup egzemplarzy z M122 typecycling zostawia w modalu DOKŁADNIE
// dwie pozycje: jedno bagno (wszystkie kopie w bibliotece są nierozróżnialne —
// to strefa ukryta) plus „nie znajduj karty". Modal pyta więc „czy chcesz to,
// o co właśnie poprosiłeś?", choć gracz zapłacił już koszt aktywacji, żeby
// o to poprosić. W katalogu istnieje zresztą tylko jedna karta o podtypie
// Swamp, więc ten modal NIGDY nie niósł wyboru.
//
// NAPRAWA (generyczna, po kształcie decyzji — ADR 0002, nie po nazwie karty):
// jeśli po odjęciu opcji-rezygnacji zostaje dokładnie JEDEN wariant, decyzja
// nie jest wyborem — trafia do panelu jako zwykła akcja („Szukanie: Swamp"),
// a rezygnacja zostaje osobnym przyciskiem. Nie odbieramy legalnego ruchu:
// „fail to find" (CR 701.19b) jest dostępne dalej.
//
// Anty-over-fix: decyzja z DWOMA realnymi wariantami nadal otwiera modal.
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
  // Prawdziwa sesja nazywa karty biblioteki po cardId (sprawdzone empirycznie:
  // session.nameOfObject('p1-library-18') → „Swamp"). Harness robi to samo,
  // żeby test nie mierzył artefaktu atrapy (L33).
  nameOfObject: (id) => REGISTRY.get(String(id).split('#')[0])?.name ?? id,
  cardDetails: (id) => REGISTRY.get(id),
  abilitiesOf: (id) => gameObjectDataOf(REGISTRY.get(id)).abilities ?? [],
  colorsOf: () => [],
};

let counter = 0;

/** Stół z aktywowanym typecyclingiem, dograny do momentu decyzji szukania. */
function searchDecisionBoard({ source = 'gloomfang-mauler', library = [] }) {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.number = 5;
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
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
    return id;
  };
  const sourceId = put(source, 'hand');
  for (let i = 0; i < 4; i += 1) put('basic-swamp', 'battlefield');
  library.forEach((c) => put(c, 'library'));
  const view = playerView(state, 'p1');
  const activate = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === sourceId);
  assert.ok(activate, 'cycling jest oferowany');
  execute(state, activate);
  // Cycling idzie na stos (CR 602.2a) — dogrywamy priorytety do decyzji.
  for (let i = 0; i < 8 && !state.pendingSearchChoice; i += 1) {
    for (const pid of ['p1', 'p2']) {
      const v = playerView(state, pid);
      const pass = v.legalCommands.find((c) => c.type === 'pass_priority');
      if (pass) execute(state, pass);
      if (state.pendingSearchChoice) break;
    }
  }
  assert.ok(state.pendingSearchChoice, 'decyzja szukania powstała');
  return playerView(state, 'p1');
}

/** Podział panelu na modale (grupy) i zwykłe przyciski. */
function panelOf(view) {
  const modals = [];
  const buttons = [];
  for (const entry of buildActionEntries(view.legalCommands, SESSION, view)) {
    if (entry.request) modals.push(entry.request);
    else if (String(entry.command?.type ?? '').startsWith('resolve_')) {
      buttons.push((entry.label ?? commandLabel(entry.command, SESSION, view)).replace(/<[^>]*>/g, ''));
    }
  }
  return { modals, buttons };
}

test('M131/A: swampcycling NIE otwiera modala — jedyny wariant idzie wprost do panelu', () => {
  const view = searchDecisionBoard({ library: ['basic-swamp', 'basic-swamp', 'basic-swamp', 'basic-forest'] });
  const { modals, buttons } = panelOf(view);
  assert.equal(modals.length, 0,
    `decyzja z jednym realnym wariantem nie może otwierać modala: ${JSON.stringify(buttons)}`);
  assert.ok(buttons.some((b) => /Szukanie:\s*Swamp/.test(b)),
    `panel ma pokazać wprost, co się stanie: ${JSON.stringify(buttons)}`);
});

test('M131/A: rezygnacja („fail to find", CR 701.19b) pozostaje dostępna', () => {
  // Anty-over-fix: uproszczenie nie może odebrać legalnego ruchu.
  const view = searchDecisionBoard({ library: ['basic-swamp', 'basic-forest'] });
  const { buttons } = panelOf(view);
  assert.ok(buttons.some((b) => /nie znajduj|rezygn/i.test(b)),
    `gracz musi móc zrezygnować: ${JSON.stringify(buttons)}`);
  assert.equal(buttons.length, 2, `dokładnie dwa przyciski (wykonaj / zrezygnuj): ${JSON.stringify(buttons)}`);
});

test('M131/A: etykieta nazywa kartę, nie surowy identyfikator obiektu', () => {
  // L29: `MAPA[key] ?? key` to cichy wyciek. Tu nazwa idzie przez sesję.
  const view = searchDecisionBoard({ library: ['basic-swamp', 'basic-forest'] });
  const { buttons } = panelOf(view);
  const found = buttons.find((b) => b.startsWith('Szukanie:'));
  assert.ok(found, 'jest przycisk szukania');
  assert.doesNotMatch(found, /#\d|p1-library|basic-swamp/,
    `etykieta ma nazywać kartę po ludzku, nie identyfikatorem: ${found}`);
});

test('M131 (anty-over-fix): dwa RÓŻNE warianty nadal otwierają modal', () => {
  // Kształt decyzji, nie karta: budujemy grupę z dwoma realnymi trafieniami
  // plus rezygnacją. Taka decyzja niesie wybór i MUSI zostać modalem.
  const view = searchDecisionBoard({ library: ['basic-swamp', 'basic-forest'] });
  const real = view.legalCommands.find((c) => c.type === 'resolve_search_choice' && c.found != null);
  const decline = view.legalCommands.find((c) => c.type === 'resolve_search_choice' && c.found == null);
  assert.ok(real && decline, 'mamy obie komendy bazowe');
  const twoRealOptions = [
    decline,
    real,
    { ...real, found: `${real.found}-inny` },
  ];
  const fakeView = { ...view, legalCommands: twoRealOptions };
  const { modals } = panelOf(fakeView);
  assert.equal(modals.length, 1,
    'przy dwóch realnych wariantach modal jest potrzebny — to prawdziwy wybór');
  assert.equal(modals[0].options.length, 3, 'modal niesie wszystkie warianty wraz z rezygnacją');
});

test('M131: reguła jest generyczna — działa po KSZTAŁCIE decyzji, nie po typie komendy', () => {
  // Decyzja innego rodzaju (Springbloom: `skip: true` zamiast `found: null`)
  // z jednym realnym wariantem też nie powinna otwierać modala. Bez tego
  // każda nowa decyzja opcjonalna wracałaby z tym samym błędem (L28).
  const base = { type: 'resolve_springbloom', playerId: 'p1' };
  const view = {
    playerId: 'p1',
    turn: { number: 4, step: 'main', phase: 'precombat_main', activePlayerId: 'p1' },
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
    zones: { hand: [], battlefield: [], stack: [], graveyard: [], exile: [], library: [] },
    legalCommands: [
      { ...base, skip: true },
      { ...base, sacrificeLandId: 'land-1' },
    ],
  };
  const { modals } = panelOf(view);
  assert.equal(modals.length, 0,
    'jeden realny wariant + rezygnacja = brak wyboru, niezależnie od typu decyzji');
});
