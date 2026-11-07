// Zgłoszenie „J. Undercity” (uwaga właściciela 2026-11-07): kolejne pokoje
// Undercity mają źle opisane efekty — ani w „Twoje działania”, ani w modalach
// wyboru nie było widać, O KTÓRY pokój chodzi ani jaki jest jego efekt
// (przykład dosłowny właściciela: Forge → modal „Wybierz: Cel pokoju
// lochu”). Wymaganie: za każdym razem dokładnie napisane, JAKI to pokój
// i JAKI efekt celujemy — w modalach wyboru i w panelu działań.
//
// Piny (3 warstwy, jak w zgłoszeniu I):
//   J/1 — silnik: jedno źródło tekstu efektów (undercityRoomEffectText
//         wyprowadzany z DANYCH UNDERCITY_ROOMS — L41) opisuje wszystkie
//         pokoje i ma fallback;
//   J/2 — UI: tytuł grupy (modal + „Twoje działania”), wiersz opcji celu
//         i wiersz opcji trasy nazywają pokój i efekt (Forge — cel stwora);
//   J/3 — UI: wariant celu gracza (Trap!) — te same gwarancje;
//   J/4 — UI: oferta trasy (Podziemia — idź do: …) dokleja efekt pokoju
//         docelowego; tytuł grupy trasy pozostaje nazwany (pin M200/A2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { ventureIntoUndercityForTest, undercityRoomEffectText, UNDERCITY_ROOMS } from '../src/engine/effects.js';

// Stub DOM jak w m200 — render.js jest modułem przeglądarkowym (mini-drzewko
// wystarcza: etykiety liczymy czysto, bez rysowania).
class MiniEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.style = {}; this.dataset = {}; this.className = ''; this.text = ''; this.html = ''; this.value = ''; this.disabled = false; this.type = ''; this.checked = false; }
  click() {
    const input = this.tagName === 'input' ? this : (this.children ?? []).find((c) => c.tagName === 'input') ?? null;
    if (input && (input.type === 'checkbox' || input.type === 'radio')) {
      if (input.disabled) return;
      input.checked = input.type === 'radio' ? true : !input.checked;
      for (const fn of input.listeners.change ?? []) fn({});
      return;
    }
    for (const fn of this.listeners.click ?? []) fn({});
  }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.html = String(v); }
  get innerHTML() { return this.html; }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  querySelectorAll(selector) {
    const cls = selector.replace('.', '');
    const out = [];
    const walk = (node) => {
      for (const c of node.children ?? []) {
        if (String(c.className).split(' ').includes(cls)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
}
globalThis.document = {
  createElement: (tag) => new MiniEl(tag),
  createTextNode: (text) => ({ isText: true, text: String(text), get textContent() { return this.text; } }),
};

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 2107, players: [{ id: 'p1' }, { id: 'p2' }] });
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

/** Wchodzi do pokoju `roomName` stojąc w pokoju o indeksie `fromIndex` (1-based). */
function enterRoomFrom(state, playerId, fromIndex, roomName) {
  state.undercityProgress = { [playerId]: fromIndex };
  ventureIntoUndercityForTest(state, playerId);
  const cmd = playerView(state, playerId).legalCommands
    .find((c) => c.type === 'resolve_undercity_route' && c.roomName === roomName);
  assert.ok(cmd, `oferta trasy „${roomName}”`);
  assert.ok(execute(state, cmd).ok, `wybór „${roomName}”`);
}

function sessionStub() {
  return {
    nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
    nameOfObject: (id) => String(id),
    abilitiesOf: (id) => REGISTRY.get(id)?.abilities ?? [],
  };
}

// ---- J/1: silnik — jedno źródło tekstu efektów pokoi -----------------------

test('J/1: undercityRoomEffectText opisuje WSZYSTKIE pokoje (dane → tekst, L41)', () => {
  for (const room of UNDERCITY_ROOMS) {
    const text = undercityRoomEffectText(room.name);
    assert.ok(text.length > 3, `pokój ${room.name} ma opis efektu: „${text}”`);
    assert.ok(!text.includes('_'), `bez surowych typów efektów: „${text}”`);
  }
  assert.match(undercityRoomEffectText('Secret Entrance'), /ląd podstawowy/);
  assert.match(undercityRoomEffectText('Forge'), /liczniki \+1\/\+1 na wybranym stworze/);
  assert.match(undercityRoomEffectText('Lost Well'), /scry 2/);
  assert.match(undercityRoomEffectText('Trap!'), /wybrany gracz traci 5 punktów życia/);
  assert.match(undercityRoomEffectText('Arena'), /goad/);
  assert.match(undercityRoomEffectText('Stash'), /token Treasure/);
  assert.match(undercityRoomEffectText('Archives'), /dobierz 1 kartę/);
  assert.match(undercityRoomEffectText('Catacombs'), /Skeleton 4\/1 z menace/);
  assert.match(undercityRoomEffectText('Throne of the Dead Three'), /hexproof do twojej następnej tury/);
  assert.equal(undercityRoomEffectText('Nie Ma Takiego Pokoju'), 'efekt pokoju lochu',
    'nieznany pokój → fallback, nie pusty string');
});

// ---- J/2: UI — cel stwora (Forge) w modalu i w panelu działań --------------

test('J/2: Forge — tytuł modala, grupa „Twoje działania” i wiersz opcji nazywają pokój i efekt', async () => {
  const { choiceGroupTitle, choiceGroupLabel, commandLabel } = await import('../src/table/render.js');
  const state = game('p1');
  putCard(state, 'foe-creature', 'highland-game', 'p2'); // jedyny stwór — legalny cel Forge
  enterRoomFrom(state, 'p1', 1, 'Forge'); // Secret Entrance → Forge
  assert.equal(state.pendingRoomTargets.length, 1, 'Forge czeka na wybór celu');
  assert.equal(state.pendingRoomTargets[0].roomName, 'Forge');
  const view = playerView(state, 'p1');
  const session = sessionStub();
  const options = view.legalCommands.filter((c) => c.type === 'resolve_room_target');
  assert.ok(options.length > 0, 'oferta wyboru celu');

  // Tytuł grupy = intro modala (main.js: introLabel ← choiceGroupTitle).
  const title = choiceGroupTitle({ type: 'room-target', options }, session, view);
  assert.ok(title.includes('Pokój Forge'), `tytuł nazywa pokój: „${title}”`);
  assert.ok(title.includes(undercityRoomEffectText('Forge')), `tytuł nazywa efekt: „${title}”`);
  assert.ok(title.includes('wybierz cel'), `tytuł nazywa czynność: „${title}”`);
  assert.ok(!title.includes('Cel pokoju lochu'), `bez generycznego „Cel pokoju lochu”: „${title}”`);

  // Grupa w panelu „Twoje działania” (choiceGroupLabel spada na ten sam tytuł).
  const panel = choiceGroupLabel({ type: 'room-target', options }, session, view);
  assert.ok(panel.includes('Pokój Forge'), `grupa panelu nazywa pokój: „${panel}”`);
  assert.ok(panel.includes(undercityRoomEffectText('Forge')), `grupa panelu nazywa efekt: „${panel}”`);

  // Wiersz opcji (przycisk w modalu i wiersz w panelu działań).
  const row = commandLabel(options[0], session, view);
  assert.ok(row.startsWith('Pokój Forge — '), `wiersz nazywa pokój na początku: „${row}”`);
  assert.ok(row.includes(undercityRoomEffectText('Forge')), `wiersz nazywa efekt: „${row}”`);
  assert.ok(row.includes(': wybierz cel — '), `wiersz nazywa czynność: „${row}”`);
  assert.ok(row.includes('Highland Game'), `wiersz nazywa kandydata: „${row}”`);
});

// ---- J/3: UI — cel gracza (Trap!) — te same gwarancje ----------------------

test('J/3: Trap! — cel gracza nazywa pokój i efekt w każdej etykiecie', async () => {
  const { choiceGroupTitle, choiceGroupLabel, commandLabel } = await import('../src/table/render.js');
  const state = game('p1');
  enterRoomFrom(state, 'p1', 2, 'Trap!'); // Forge → Trap!
  assert.equal(state.pendingRoomTargets[0]?.roomName, 'Trap!');
  const view = playerView(state, 'p1');
  const session = sessionStub();
  const options = view.legalCommands.filter((c) => c.type === 'resolve_room_target');
  assert.ok(options.length > 0, 'oferta wyboru celu gracza');

  const title = choiceGroupTitle({ type: 'room-target', options }, session, view);
  assert.ok(title.includes('Pokój Trap!'), `tytuł nazywa pokój: „${title}”`);
  assert.ok(title.includes('wybrany gracz traci 5 punktów życia'), `tytuł nazywa efekt: „${title}”`);
  const panel = choiceGroupLabel({ type: 'room-target', options }, session, view);
  assert.ok(panel.includes('Pokój Trap!') && panel.includes('5 punktów życia'), `grupa panelu: „${panel}”`);
  for (const option of options) {
    const row = commandLabel(option, session, view);
    assert.ok(row.includes('Pokój Trap!'), `wiersz nazywa pokój: „${row}”`);
    assert.ok(row.includes('wybrany gracz traci 5 punktów życia'), `wiersz nazywa efekt: „${row}”`);
    assert.ok(row.includes(': wybierz cel — '), `wiersz nazywa czynność: „${row}”`);
  }
});

// ---- J/4: UI — oferta trasy dokleja efekt pokoju docelowego ----------------

test('J/4: „Podziemia — idź do: …” nazywa pokój docelowy i jego efekt', async () => {
  const { commandLabel, choiceGroupLabel } = await import('../src/table/render.js');
  const state = game('p1');
  state.undercityProgress = { p1: 1 }; // Secret Entrance → Forge albo Lost Well
  ventureIntoUndercityForTest(state, 'p1');
  const view = playerView(state, 'p1');
  const session = sessionStub();
  const routes = view.legalCommands.filter((c) => c.type === 'resolve_undercity_route');
  assert.equal(routes.length, 2, 'dwie ścieżki: Forge, Lost Well');

  const forge = commandLabel(routes.find((r) => r.roomName === 'Forge'), session, view);
  assert.ok(forge.startsWith('Podziemia — idź do: Forge — '), `prefiks trasy z pokojem: „${forge}”`);
  assert.ok(forge.includes(undercityRoomEffectText('Forge')), `trasa nazywa efekt Forge: „${forge}”`);
  const well = commandLabel(routes.find((r) => r.roomName === 'Lost Well'), session, view);
  assert.ok(well.includes('Podziemia — idź do: Lost Well — scry 2'), `trasa nazywa efekt Lost Well: „${well}”`);

  // Tytuł grupy trasy pozostaje nazwany (pin M200/A2 — „Ścieżka w Undercity”).
  const label = choiceGroupLabel({ type: 'undercity-route', options: routes }, session, view);
  assert.ok(label.includes('Ścieżka w Undercity'), `tytuł grupy trasy: „${label}”`);
});
