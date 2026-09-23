// Uwaga B1 z gry (właściciel, 2026-09-23c): „up to two" (Azorius Justiciar,
// detain) = modal multiselect (dowolna liczba legalnych celów, »Zatwierdź
// wybór«, walidacja up to two), NIE enumeracja kombinacji — właściciel
// o enumeracji: „TO JEST ZABRONIONE!".
//
// Stan przed (zmierzony sondą): trigger z `requiresTarget: {count: 2, upTo}`
// enumeruje podzbiory celów jako osobne komendy (4 kandydaci → 11 wariantów:
// 2-elementowe, 1-elementowe i pusty) i panel pokazywał z tego ścianę opcji.
//
// Kontrakt po: jeden wpis panelu → kreator z ptaszkami (ten sam co proliferate
// M298/A), walidacja liczby przez legalne komendy silnika, zatwierdzenie
// oddaje komendę z legalCommands (L48). Pusty wybór jest legalny tylko wtedy,
// gdy silnik oferuje wariant pusty („up to").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { buildActionEntries, choiceRequestGroupKey } from '../src/table/render.js';
import { renderMultiTargetWizard } from '../src/table/choice-request.js';
import { upToTargetsPlanOf, commandForTargetIdsSelection } from '../src/table/multi-target.js';

const REGISTRY = createCardRegistry();

function stol({ foes = 4 } = {}) {
  const state = createGameState({ seed: 2309, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  const put = (id, cardId, zone, playerId = 'p1') => {
    const def = REGISTRY.get(cardId);
    assert.ok(def, `${cardId} w rejestrze`);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
      ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
      keywords: def.keywords ?? [], spell: def.spell,
    });
  };
  for (let i = 0; i < 4; i += 1) put(`plains${i}`, 'basic-plains', 'battlefield');
  for (let i = 0; i < foes; i += 1) put(`foe${i}`, 'goblin-piker', 'battlefield', 'p2');
  for (let i = 0; i < 6; i += 1) put(`lib${i}`, 'basic-swamp', 'library');
  put('justiciar', 'azorius-justiciar', 'hand');
  const view = playerView(state, 'p1');
  const session = {
    nameOf: (id) => REGISTRY.get(id)?.name ?? id,
    cardDetails: (id) => REGISTRY.get(id) ?? null,
    state,
  };
  return { state, view, session, put };
}

/** Rzuca Azoriusa i doprowadza do decyzji triggera (jak w batch40-kart). */
function otworzDecyzjeTriggera(s) {
  addMana(s.state, 'p1', 4, { colors: ['W'] });
  const cast = s.view.legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'justiciar');
  assert.ok(cast, 'setup: oferta rzutu Azorius Justiciar');
  execute(s.state, cast);
  for (let i = 0; i < 10 && !s.state.pendingTriggerTargets?.length
    && s.state.zones.stack.length > 0; i += 1) {
    execute(s.state, { type: 'pass_priority', playerId: s.state.turn.priorityPlayerId });
  }
  const view = playerView(s.state, 'p1');
  const session = { ...s.session };
  return { view, session };
}

/** Mini-DOM jak w choice-request-ui.test.js / bug-c1. */
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

function walk(el) { return [el, ...el.children.flatMap(walk)]; }

function uruchomKreator(plan, commands, view, session) {
  const poprzedni = globalThis.document;
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  const host = new MiniEl('div');
  const wynik = { cmd: null };
  try {
    renderMultiTargetWizard(host, {
      view, session, plan, commands, sourceName: 'Azorius Justiciar',
      onComplete: (cmd) => { wynik.cmd = cmd; }, onCancel: () => {},
    });
    return { host, wynik, przywroc: () => { globalThis.document = poprzedni; } };
  } catch (err) {
    if (poprzedni === undefined) delete globalThis.document; else globalThis.document = poprzedni;
    throw err;
  }
}

test('B1/1: trigger „up to two" to JEDEN wpis panelu, nie 11 wariantów kombinacji', () => {
  const s = stol();
  const { view, session } = otworzDecyzjeTriggera(s);
  const warianty = view.legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.equal(warianty.length, 11, `silnik enumeruje podzbiory (2 z 4 + 1 z 4 + pusty): ${warianty.length}`);
  const wpisy = buildActionEntries(view.legalCommands.filter((c) => c.type !== 'concede'), session, view);
  const trigger = wpisy.filter((e) => e.request
    && (e.request.options ?? []).some((c) => c.type === 'resolve_trigger_target'));
  assert.equal(trigger.length, 1, `jedna oferta decyzji (jest ${trigger.length})`);
  assert.equal(trigger[0].request.options.length, 11, 'wszystkie legalne warianty trafiają do modala (L48)');
});

test('B1/2: kreator pokazuje KANDYDATÓW z walidacją liczby (0–2)', () => {
  const s = stol();
  const { view, session } = otworzDecyzjeTriggera(s);
  const wpis = buildActionEntries(view.legalCommands.filter((c) => c.type !== 'concede'), session, view)
    .find((e) => e.request && (e.request.options ?? []).some((c) => c.type === 'resolve_trigger_target'));
  const plan = upToTargetsPlanOf(wpis.request.options);
  assert.ok(plan, 'plan multiselect powstaje z wariantów triggera');
  assert.equal(plan.targets.length, 4, 'czterej kandydaci, nie 11 kombinacji');
  assert.deepEqual([plan.minTargets, plan.maxTargets], [0, 2], 'walidacja: do dwóch celów (upTo → pusto legalne)');
  assert.equal(plan.targetIdsMode, true, 'komendy dopasowuje się zbiorem targetIds');
});

test('B1/3: zaznaczenie dwóch celów aktywuje „Zatwierdź wybór" i oddaje komendę', () => {
  const s = stol();
  const { view, session } = otworzDecyzjeTriggera(s);
  const wpis = buildActionEntries(view.legalCommands.filter((c) => c.type !== 'concede'), session, view)
    .find((e) => e.request && (e.request.options ?? []).some((c) => c.type === 'resolve_trigger_target'));
  const plan = upToTargetsPlanOf(wpis.request.options);
  const { host, wynik, przywroc } = uruchomKreator(plan, wpis.request.options, view, session);
  try {
    assert.match(host.textContent, /zaznacz cele \(0–2\)/, `intro kreatora: ${host.textContent.slice(0, 120)}`);
    const toggles = walk(host).filter((el) => String(el.className).includes('multi-target-toggle'));
    assert.equal(toggles.length, 4, 'wiersz na kandydata (4), nie na kombinację (11)');
    const zatwierdz = walk(host).find((el) => String(el.className).includes('multi-target-confirm'));

    // 3 zaznaczenia = nielegalne (walidacja „up to two").
    toggles[0].checked = true; toggles[0].emit('change');
    toggles[1].checked = true; toggles[1].emit('change');
    toggles[2].checked = true; toggles[2].emit('change');
    assert.equal(zatwierdz.disabled, true, 'trzy cele to wybór niedozwolony');

    toggles[2].checked = false; toggles[2].emit('change');
    assert.equal(zatwierdz.disabled, false, 'dwa cele — wybór legalny');
    zatwierdz.click();
    assert.equal(wynik.cmd?.type, 'resolve_trigger_target');
    assert.equal(wynik.cmd?.targetIds?.length, 2, `komenda niesie dwa cele: ${JSON.stringify(wynik.cmd?.targetIds)}`);
  } finally {
    przywroc();
  }
});

test('B1/4: „up to two" pozwala zatwierdzić też zero celów (wariant pusty silnika)', () => {
  const s = stol();
  const { view, session } = otworzDecyzjeTriggera(s);
  const wpis = buildActionEntries(view.legalCommands.filter((c) => c.type !== 'concede'), session, view)
    .find((e) => e.request && (e.request.options ?? []).some((c) => c.type === 'resolve_trigger_target'));
  const plan = upToTargetsPlanOf(wpis.request.options);
  const pusty = commandForTargetIdsSelection(wpis.request.options, []);
  assert.ok(pusty, 'silnik oferuje wariant bez celów (upTo)');
  assert.deepEqual(pusty.targetIds, []);
  const { host, wynik, przywroc } = uruchomKreator(plan, wpis.request.options, view, session);
  try {
    const zatwierdz = walk(host).find((el) => String(el.className).includes('multi-target-confirm'));
    assert.equal(zatwierdz.disabled, false, 'pusty wybór jest legalny przy „up to"');
    zatwierdz.click();
    assert.deepEqual(wynik.cmd?.targetIds, [], 'komenda oddana z legalCommands ma zero celów');
  } finally {
    przywroc();
  }
});

test('B1/5 (klasa): każda karta z „count > 1" dostaje ten sam kreator multiselect', () => {
  // Przegląd wzorca „up to N": wszystkie karty katalogu z wielocelowym
  // triggerem (requiresTarget.count > 1) — dla każdej syntetyzujemy taką samą
  // enumerację podzbiorów jak silnik (CAP 32) i sprawdzamy, że plan grupuje
  // kandydatów, a nie kombinacje.
  const karty = REGISTRY.all().flatMap((card) => (card.abilities ?? [])
    .filter((a) => Number.isInteger(a?.trigger?.requiresTarget?.count)
      && a.trigger.requiresTarget.count > 1)
    .map((a) => ({ id: card.id, spec: a.trigger.requiresTarget })));
  assert.ok(karty.length >= 4, `wzorzec występuje w katalogu (jest ${karty.length})`);
  for (const { id, spec } of karty) {
    const kandydaci = ['c1', 'c2', 'c3', 'c4'].slice(0, Math.max(spec.count + 1, 3));
    const warianty = [];
    for (let size = spec.count; size >= 1; size -= 1) {
      const combo = (start, acc) => {
        if (acc.length === size) { warianty.push([...acc]); return; }
        for (let i = start; i < kandydaci.length; i += 1) combo(i + 1, [...acc, kandydaci[i]]);
      };
      combo(0, []);
    }
    if (spec.upTo) warianty.push([]);
    const commands = warianty.map((targetIds) => ({ type: 'resolve_trigger_target', playerId: 'p1', targetIds }));
    const plan = upToTargetsPlanOf(commands);
    assert.ok(plan, `${id}: plan multiselect dla count=${spec.count}`);
    assert.equal(plan.maxTargets, spec.count, `${id}: walidacja do ${spec.count} celów`);
    assert.equal(plan.targets.length, kandydaci.length, `${id}: wiersze = kandydaci, nie kombinacje`);
    assert.equal(plan.minTargets, spec.upTo ? 0 : 1, `${id}: minimum z kształtu (upTo → 0)`);
    for (const cmd of commands) {
      assert.equal(choiceRequestGroupKey(cmd), 'resolve_trigger_target', `${id}: warianty w jednej grupie panelu`);
    }
  }
});

test('B1/6: pojedynczy wybór celu (targetId) nie wchodzi w tryb multiselect', () => {
  const commands = [
    { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'a' },
    { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'b' },
  ];
  assert.equal(upToTargetsPlanOf(commands), null, 'inny kształt decyzji — ten plan nie dotyczy');
});
