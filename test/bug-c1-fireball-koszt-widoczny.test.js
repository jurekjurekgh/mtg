import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { commandLabel } from '../src/table/render.js';
import { renderMultiTargetWizard } from '../src/table/choice-request.js';
import { multiTargetPlanOf } from '../src/table/multi-target.js';

/**
 * Zgłoszenie właściciela C1 (2026-09-10): „Fireball (koszt {X}{R}, wybrałem
 * X=3) przelicytował: miałem 6 nietapniętych lądów i wszystkie zostały
 * tapnięte, choć potrzeba było ok. 4 many.”
 *
 * Rozpoznanie: silnik płaci DOKŁADNIE tyle, ile wynosi koszt wariantu
 * (zweryfikowane: X=3 + 1 cel = 4 tapnięcia; nadmiarowe 6 = wariant
 * 3-celowy: {X}+{R}+{1}×2 dodatkowe cele — Oracle: „This spell costs {1}
 * more to cast for each target beyond the first”). Prawdziwy root cause:
 * kreator celów Fireballa NIGDZIE nie pokazywał łącznego kosztu wariantu —
 * gracz wybierał cele i X nie wiedząc, że każdy cel ponad pierwszy
 * podnosi cenę, więc „nagle” tapowało się więcej lądów, niż oczekiwał.
 *
 * Fix (bez zmiany rozliczeń — te są zgodne z CR): warianty Fireballa niosą
 * `cost` = całkowita mana do zapłacenia (X + koszt bazowy + {1}/dodatkowy
 * cel), a UI pokazuje go w dwóch miejscach: etykieta wariantu („koszt
 * {5}{R}”) i status kreatora celów („koszt: N many” po każdym wyborze).
 */

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 111, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

function fireballState() {
  const state = game('p1');
  const def = REGISTRY.get('fireball');
  addObject(state, {
    id: 'fb', instanceId: 'i-fb', cardId: 'fireball', controllerId: 'p1', ownerId: 'p1', zone: 'hand',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, kind: 'spell',
  });
  for (let i = 0; i < 6; i += 1) putCard(state, `m${i}`, 'basic-mountain', 'p1');
  putCard(state, 'cre1', 'highland-game', 'p2');
  putCard(state, 'cre2', 'highland-game', 'p2');
  return state;
}

test('C1/1: warianty Fireballa niosą łączny koszt (X + {R} + {1}/cel ponad pierwszy)', () => {
  const state = fireballState();
  const casts = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'cast_spell' && c.xValue != null);
  assert.ok(casts.length > 0, 'setup: są oferty rzutu Fireballa');
  assert.ok(casts.some((c) => c.targets.length >= 2), 'setup: są warianty wielocelowe');
  for (const cmd of casts) {
    const expected = cmd.xValue + 1 + Math.max(0, cmd.targets.length - 1);
    assert.equal(cmd.cost, expected,
      `wariant X=${cmd.xValue}, cele=${cmd.targets.length}: cost=${cmd.cost}, oczekiwane ${expected} (CR: {1} za każdy cel ponad pierwszy)`);
  }
});

test('C1/2: etykieta Fireballa pokazuje ŁĄCZNY koszt wariantu, nie tylko druk', () => {
  const state = fireballState();
  const sessionLike = {
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
    cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
    state,
  };
  const view = playerView(state, 'p1');
  const casts = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.xValue != null);
  const multi = casts.find((c) => c.targets.length === 2 && c.xValue === 3);
  assert.ok(multi, 'setup: wariant X=3 z 2 celami');
  const label = commandLabel(multi, sessionLike, view).replace(/<[^>]*>/g, '');
  // X=3, 2 cele → 3 + 1(R) + 1(drugi cel) = 5 many: {4}{R}; ikony many
  // dają po strip-tagów zapis „4R" (bez klamer). Wariantem odróżniającym
  // od starego zachowania jest brak samego druku „XR" jako kosztu.
  assert.match(label, /koszt 4R/,
    `etykieta ma pokazywać łączny koszt wariantu (jest: ${label})`);
  assert.doesNotMatch(label, /koszt XR/,
    `etykieta nie może poprzestawać na drukowanym koszcie (jest: ${label})`);
  assert.match(label, /X=3/, 'wartość X zostaje w etykiecie');
});

test('C1/3: kreator celów pokazuje łączny koszt wybranego wariantu na żywo', () => {
  const state = fireballState();
  const view = playerView(state, 'p1');
  const commands = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.xValue != null);
  const plan = multiTargetPlanOf(commands);
  assert.ok(plan?.hasX, 'setup: plan z licznikiem X');

  // Mini-DOM jak w choice-request-ui.test.js.
  class MiniEl {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.listeners = {};
      this.className = ''; this.text = ''; this.html = '';
      this.type = ''; this.checked = false; this.disabled = false; this.dataset = {};
    }
    set textContent(v) { this.text = String(v); this.html = ''; this.children = []; }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
    set innerHTML(v) { this.html = String(v); this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
    get innerHTML() { return (this.html ? this.html : this.text) + this.children.map((c) => c.innerHTML).join(''); }
    appendChild(c) { this.children.push(c); return c; }
    replaceChildren(...n) { this.children = n.flat(); }
    addEventListener(t, l) { (this.listeners[t] ??= []).push(l); }
    click() { for (const l of this.listeners.click ?? []) l({}); }
    emit(t, v) { for (const l of this.listeners[t] ?? []) l(v ?? {}); }
  }
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  const host = new MiniEl('div');
  let completed = null;
  renderMultiTargetWizard(host, {
    view, session: sessionLike(state), plan, commands, sourceName: 'Fireball',
    onComplete: (cmd) => { completed = cmd; }, onCancel: () => {},
  });

  function sessionLike(st) {
    return {
      nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
      cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
      state: st,
    };
  }

  // Zaznacz pierwszy cel (ptaszek w pickerze) — zdarzenie change jak w DOM.
  const walk = (el) => [el, ...el.children.flatMap(walk)];
  const toggle = walk(host).find((el) => String(el.className).includes('multi-target-toggle'));
  assert.ok(toggle, 'setup: jest ptaszek wyboru celu');
  toggle.checked = true;
  toggle.emit('change');

  const text = host.textContent;
  // 1 cel + X minimalny (1): koszt 1 + 1(R) = 2 many.
  assert.match(text, /koszt:? ?2 many|koszt.*2/,
    `status kreatora ma pokazywać łączny koszt wyboru (jest: ${text.slice(-120)})`);
});
