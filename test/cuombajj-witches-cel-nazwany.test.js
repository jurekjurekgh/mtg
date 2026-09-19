// Zgłoszenie właściciela B (2026-09-19): „Cuombajj Witches — aktywacja bota
// pojawia się w «Twoich działaniach» tylko jako «Wybierz: Cel» — bez nazwy
// karty i efektu; przy kilku zdolnościach na stosie nie da się tego
// zidentyfikować. Prompt musi wskazywać kartę/zdolność.”
//
// Root cause: decyzja „1 damage to any target of an opponent's choice” (M116)
// tworzy `pendingOpponentTarget` w silniku, ale PlayerView NIE wystawiał nic
// o tej decyzji, a `choiceGroupTitle` nie miała gałęzi dla
// `resolve_opponent_target` — tytuł grupy spadał na generyczne
// „Wybierz: Cel” (fallback typu `target`).
//
// Naprawa: (1) widok niesie źródło decyzji (`pendingOpponentTarget.
// sourceCardId` — permanent na polu bitwy, informacja publiczna, ADR 0017),
// (2) tytuł grupy czyta nazwę karty + opis efektu z deskryptora zdolności
// (ADR 0002 — zero nazw kart w warstwie opisu), (3) deskryptor fallbacku dla
// samego typu komendy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { choiceGroupTitle, choiceGroupLabel, renderTableView } from '../src/table/render.js';
import { choiceRequest } from '../src/protocol/types.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [],
  });
}

/** Bot (p2) ma Cuombajj Witches; TY (p1) wskazujesz drugi cel obrażeń. */
function stan() {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  put(state, 'witches', 'cuombajj-witches', 'p2', 'battlefield');
  put(state, 'moj-stwor', 'goblin-piker', 'p1', 'battlefield');
  put(state, 'moj-stwor2', 'highland-game', 'p1', 'battlefield');
  put(state, 'wrogi-stwor', 'goblin-piker', 'p2', 'battlefield');
  const cmd = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'witches');
  assert.ok(cmd, 'setup: oferta aktywacji Cuombajj Witches');
  assert.ok(execute(state, cmd).ok, 'setup: aktywacja przyjęta');
  return state;
}

test('B/1: widok decydenta niesie źródło decyzji (karta i aktywujący)', () => {
  const state = stan();
  const view = playerView(state, 'p1');
  assert.ok(view.pendingOpponentTarget, 'decyzja „cel wskazuje przeciwnik” jest widoczna');
  assert.equal(view.pendingOpponentTarget.sourceCardId, 'cuombajj-witches',
    'widok musi nieść kartę-źródło decyzji (ADR 0017)');
  assert.equal(view.pendingOpponentTarget.activatingPlayerId, 'p2');
  const oferty = view.legalCommands.filter((c) => c.type === 'resolve_opponent_target');
  assert.ok(oferty.length >= 2, 'setup: co najmniej dwa legalne cele (realny wybór)');
});

test('B/2: tytuł grupy nazywa kartę i efekt (koniec „Wybierz: Cel”)', () => {
  const state = stan();
  const view = playerView(state, 'p1');
  const request = choiceRequest({
    id: 'choice-test', type: 'target',
    options: view.legalCommands.filter((c) => c.type === 'resolve_opponent_target'),
  });
  const session = {
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
    abilitiesOf: (cardId) => REGISTRY.get(cardId)?.abilities ?? [],
    state,
  };
  const tytul = choiceGroupTitle(request, session, view);
  assert.match(tytul, /Cuombajj Witches/, `tytuł nazywa kartę-źródło: „${tytul}”`);
  assert.match(tytul, /obrażeni/i, `tytuł opisuje skutek z deskryptora: „${tytul}”`);
  assert.match(tytul, /przeciwnik/i, `tytuł mówi, kto wybiera cel: „${tytul}”`);
  assert.notEqual(tytul, 'Wybierz: Cel', 'generyczne „Wybierz: Cel” było zgłoszeniem właściciela');
  assert.equal(choiceGroupLabel(request, session, view), tytul, 'panel i modal mówią jednym źródłem (L41)');
});

test('B/3 (E2E panelu): przycisk „Twoje działania” niesie nazwę karty', () => {
  const state = stan();
  const view = playerView(state, 'p1');

  class MiniEl {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.listeners = {}; this.style = {}; this.dataset = {};
      this.className = ''; this.text = ''; this.html = ''; this.value = ''; this.checked = false;
      this.disabled = false; this.title = ''; this.type = '';
    }

    set textContent(v) { this.text = String(v); this.children = []; }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
    set innerHTML(v) { this.html = String(v); this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
    get innerHTML() { return (this.html || this.text) + this.children.map((c) => c.innerHTML).join(''); }
    appendChild(child) { this.children.push(child); return child; }
    prepend(child) { this.children.unshift(child); return child; }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  }
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };

  const session = {
    view: () => view, log: [], reasoning: [], state,
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
    nameOfObject: (objectId) => state.objects.get(objectId)?.cardName ?? objectId,
    cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
    colorsOf: (cardId) => REGISTRY.get(cardId)?.colors ?? [],
    abilitiesOf: (cardId) => REGISTRY.get(cardId)?.abilities ?? [],
  };
  const els = {};
  for (const key of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn', 'exileZone', 'hand', 'actions', 'log']) {
    els[key] = new MiniEl(`#${key}`);
  }
  renderTableView({
    els, session, play: () => {}, onCardClick: () => {},
    onChoiceRequest: () => {}, ignoredOptionKeys: new Set(), onToggleIgnoredOption: () => {},
  });
  const buttons = els.actions.children.filter((c) => (c.className ?? '').includes('action'));
  const group = buttons.find((b) => (b.className ?? '').includes('choice-request-trigger'));
  assert.ok(group, 'decyzja grupuje się w jeden przycisk panelu');
  assert.match(group.innerHTML, /Cuombajj Witches/,
    `przycisk „Twoje działania” musi nazywać kartę: „${group.innerHTML}”`);
  assert.doesNotMatch(group.innerHTML, />Wybierz: Cel</,
    'gołe „Wybierz: Cel” nie wraca (zgłoszenie właściciela B)');
  assert.ok(group.dataset.optionKey, 'klucz sondy nadal obecny');
});
