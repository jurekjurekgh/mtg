// M202/B — uwaga właściciela 2026-08-24:
//
// „Karta Ghost Warden (i pewnie inne podobne z celowaniem zdolności). Przycisk
// «Podejrzyj kartę» podgląda kartę używającą zdolności, a nie kartę celu
// zdolności. Czyli przy Ghost Warden i 4 celach mogę sobie 4 razy podejrzeć
// Ghost Warden. Nie o to chodziło :)”
//
// Root cause: `cardIdForChoiceOption` (main.js) brał pierwszy identyfikator
// z listy `cardId, objectId, targetId, …` — czyli ŹRÓDŁO (`objectId`) przed
// celem. Opcja wyboru celu dotyczy celu, a karta używająca zdolności jest i tak
// widoczna (ręka/stół). Polityka przeniesiona do czystej funkcji
// `previewCardIdOfOption` (wcześniej żyła w domknięciu `bootstrapTable`, więc
// nie miała żadnego testu — klasa L5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewCardIdOfOption, renderChoiceRequest } from '../src/table/choice-request.js';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

class MiniEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.text = ''; this.listeners = {}; this.style = {}; this.dataset = {}; this.hidden = false; this.type = ''; }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  setAttribute(name, value) { this.dataset[name] = value; }
  createTextNode(v) { return new MiniEl('#text'); }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
}
const doc = { createElement: (tag) => new MiniEl(tag), createTextNode: () => new MiniEl('#text') };
globalThis.document = globalThis.document ?? doc;

/** Tłumacz identyfikatorów na karty — taki sam kontrakt, jaki wstrzykuje main.js. */
function resolverFor(state) {
  return (id) => {
    if (REGISTRY.get(id)) return id;
    const cardId = state.objects.get(id)?.cardId ?? null;
    return cardId && REGISTRY.get(cardId) ? cardId : null;
  };
}

function ghostWardenState() {
  const state = createGameState({ seed: 17, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn('p1'), ...TURN_STEPS[3], stepIndex: 3, activePlayerId: 'p1', priorityPlayerId: 'p1', passes: 0 };
  const add = (id, cardId, controllerId, zone, patch = {}) => {
    const def = REGISTRY.get(cardId);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
      ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
      subtypes: def.subtypes ?? [], spell: def.spell,
    });
    if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  };
  add('warden', 'ghost-warden', 'p1', 'battlefield');
  state.objects.set('warden', Object.freeze({ ...state.objects.get('warden'), summoningSickness: false, tapped: false }));
  add('ally', 'hill-giant', 'p1', 'battlefield');
  add('foe', 'goblin-piker', 'p2', 'battlefield');
  return state;
}

test('M202/B (zgłoszenie): lupa przy celu Ghost Warden podgląda CEL, nie Ghost Warden', () => {
  const state = ghostWardenState();
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'warden');
  assert.ok(offers.length >= 2, 'zdolność ma po jednej ofercie na cel');
  const resolve = resolverFor(state);
  const peeked = offers.map((option) => previewCardIdOfOption(option, resolve));
  for (const [i, option] of offers.entries()) {
    const expected = state.objects.get(option.targets[0]).cardId;
    assert.equal(peeked[i], expected,
      `opcja z celem ${option.targets[0]} ma podglądać kartę celu (${expected})`);
  }
  // Cele inne niż źródło MUSZĄ dawać inną kartę niż Ghost Warden — to jest
  // dokładnie zgłoszenie właściciela (cztery razy ta sama karta).
  const otherTargets = offers.filter((c) => c.targets[0] !== 'warden');
  assert.ok(otherTargets.length >= 2, 'są cele inne niż sam Ghost Warden');
  for (const option of otherTargets) {
    assert.notEqual(previewCardIdOfOption(option, resolve), 'ghost-warden',
      `cel ${option.targets[0]} nie może podglądać karty używającej zdolności`);
  }
});

test('M202/B: cele z `targetIds` (wybór celu triggera) też są podglądalne', () => {
  const state = ghostWardenState();
  const option = { type: 'resolve_trigger_target', playerId: 'p1', targetIds: ['foe'], friendly: false };
  assert.equal(previewCardIdOfOption(option, resolverFor(state)), 'goblin-piker');
});

test('M202/B (anty-over-fix): opcja BEZ celu podgląda kartę, której dotyczy', () => {
  const state = ghostWardenState();
  assert.equal(previewCardIdOfOption({ type: 'cast_permanent', objectId: 'warden' }, resolverFor(state)),
    'ghost-warden', 'rzut/zagranie karty bez celu — lupa pokazuje tę kartę');
  assert.equal(previewCardIdOfOption({ type: 'resolve_reveal_exile_hand', cardId: 'hill-giant' }, resolverFor(state)),
    'hill-giant', 'jawny cardId w komendzie działa jak dotąd');
});

test('M202/B (anty-over-fix): cel-gracz nie psuje lupy (spada na kartę komendy)', () => {
  const state = ghostWardenState();
  const option = { type: 'activate_ability', objectId: 'warden', targets: ['p2'] };
  assert.equal(previewCardIdOfOption(option, resolverFor(state)), 'ghost-warden',
    'gracz nie jest kartą — lupa pokazuje kartę komendy, a nie znika');
});

test('M202/B: lupa w modalu niesie kartę CELU w data-preview-card-id', () => {
  const state = ghostWardenState();
  const resolve = resolverFor(state);
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'warden');
  const host = new MiniEl('div');
  const opened = [];
  renderChoiceRequest(host, {
    type: 'command', title: 'Cel zdolności', options: offers,
  }, {
    labelForOption: (cmd) => `cel: ${cmd.targets[0]}`,
    onOpenCard: (cardId) => opened.push(cardId),
    cardIdOfOption: (option) => previewCardIdOfOption(option, resolve),
    onResponse: () => {},
  });
  const peeks = host.descendants().filter((n) => /choice-request-peek/.test(String(n.className)));
  assert.equal(peeks.length, offers.length, 'jedna lupa na opcję');
  const previewed = peeks.map((n) => n.dataset.previewCardId ?? n.dataset.preview_card_id);
  assert.deepEqual(previewed, offers.map((c) => state.objects.get(c.targets[0]).cardId),
    'przycisk podglądu wskazuje kartę celu');
  for (const peek of peeks) for (const fn of peek.listeners.click ?? []) fn({ stopPropagation: () => {} });
  assert.deepEqual(opened, offers.map((c) => state.objects.get(c.targets[0]).cardId),
    'klik w lupę otwiera kartę celu, nie kartę używającą zdolności');
});
