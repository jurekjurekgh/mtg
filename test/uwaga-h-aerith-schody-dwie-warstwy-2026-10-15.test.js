// Zgłoszenie H testera (2026-10-15, Aerith Rescue Mission, tryb „Schody”):
// „Tap up to three target creatures. Put a stun counter on one of them.”
// Kreator musi mieć DWIE warstwy wyboru (zgłoszenie właściciela, tura 2):
//  (1) zbiór celów do tapnięcia (do 3, ptaszki),
//  (2) osobny wybór, który z WYBRANYCH celów dostaje stun counter.
// Silnik bez zmian: komendy z legalCommands już niosą `stunTargetId`
// (pary cel × stun); zatwierdzenie oddaje dokładnie tę komendę (L48).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { renderMultiTargetWizard } from '../src/table/choice-request.js';
import * as MT from '../src/table/multi-target.js';
const { multiTargetPlanOf, commandForSelection } = MT;
// Helper z warstwą 2 (eksport dodawany w GREEN) — brak = czerwony test, nie błąd importu.
const stunCandidatesFor = (...args) => MT.stunCandidatesFor(...args);

// Ten sam układ co `.arena/repro-h.mjs`: Rager + dwa insekty u przeciwnika.
function aerithOptions() {
  const REG = createCardRegistry();
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  state.turn.phase = 'precombat_main';
  const put = (id, cardId, controllerId, zone) => {
    const def = REG.get(cardId); const data = gameObjectDataOf(def);
    addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
      ...data, types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], spell: def.spell });
  };
  put('aerith', 'aerith-rescue-mission', 'p1', 'hand');
  put('rager', 'phyrexian-rager', 'p2', 'battlefield');
  put('ins1', 'token_insect', 'p2', 'battlefield');
  put('ins2', 'token_insect', 'p2', 'battlefield');
  put('pl1', 'basic-plains', 'p1', 'battlefield'); put('pl2', 'basic-plains', 'p1', 'battlefield');
  put('isl', 'basic-island', 'p1', 'battlefield'); put('mtn', 'basic-mountain', 'p1', 'battlefield');
  const view = playerView(state, 'p1');
  const options = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'aerith' && c.modeIndex === 1);
  return { view, options };
}

const { view: VIEW, options: CMDS } = aerithOptions();
const SESSION = { nameOf: (id) => id, nameOfObject: (id) => id, cardDetails: () => null };

function withMiniDom(run) {
  class MiniEl {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.listeners = {};
      this.className = ''; this.text = ''; this.dataset = {}; this.disabled = false;
      this.style = {}; this.type = ''; this.checked = false;
      this.classList = { toggle: () => {}, add: () => {}, remove: () => {} };
    }
    set textContent(v) { this.text = String(v); this.children = []; }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
    appendChild(c) { this.children.push(c); return c; }
    replaceChildren(...n) { this.children = n.flat(); }
    addEventListener(t, l) { (this.listeners[t] ??= []).push(l); }
    click() {
      const input = this.tagName === 'input' ? this
        : (this.children ?? []).find((c) => c.tagName === 'input') ?? null;
      if (input && (input.type === 'checkbox' || input.type === 'radio')) {
        if (input.disabled) return;
        input.checked = input.type === 'radio' ? true : !input.checked;
        for (const l of input.listeners.change ?? []) l({});
        return;
      }
      if (this.disabled) return;
      for (const l of this.listeners.click ?? []) l({});
    }
    all() { return [this, ...this.children.flatMap((c) => (c.all ? c.all() : [c]))]; }
    find(pred) { return this.all().find(pred); }
    findAll(pred) { return this.all().filter(pred); }
  }
  globalThis.document = globalThis.document ?? {};
  const old = globalThis.document.createElement;
  globalThis.document.createElement = (tag) => new MiniEl(tag);
  try { return run(new MiniEl('div')); } finally {
    if (old) globalThis.document.createElement = old; else delete globalThis.document.createElement;
  }
}

const sorted = (ids) => [...ids].sort();

test('H/UI plan: tryb „Schody” dostaje wymiar stuna z KOMEND silnika (cele × stun)', () => {
  const plan = multiTargetPlanOf(CMDS);
  assert.ok(plan, 'Aerith (tryb 1) to plan wielowymiarowy');
  assert.equal(plan.stunKey, 'stunTargetId', 'wymiar stuna jest jawny w planie');
  assert.deepEqual(sorted(plan.stunIds), ['ins1', 'ins2', 'rager'], 'kandydaci stuna = wszystkie cele');
  assert.equal(plan.maxTargets, 3, 'do trzech celów (tap)');
  assert.equal(plan.minTargets, 0, 'zero celów jest legalne');
});

test('H/UI plan: plan BEZ stuna (Chocobo-like) nie dostaje wymiaru stuna', () => {
  const kick = (mine, foe) => ({ type: 'cast_spell', playerId: 'p1', objectId: 'k', targets: [mine, foe] });
  const plan = multiTargetPlanOf([kick('m1', 'f1'), kick('m2', 'f1'), kick('m2', 'f2')]);
  assert.ok(plan);
  assert.equal(plan.stunKey, undefined, 'bez stunTargetId w komendach brak warstwy 2');
});

test('H/UI kandydaci: stun dla zbioru celów = stuny wariantów o DOKŁADNIE tym zbiorze', () => {
  assert.deepEqual(sorted(stunCandidatesFor(CMDS, ['rager'])), ['rager']);
  assert.deepEqual(sorted(stunCandidatesFor(CMDS, ['ins1', 'rager'])), ['ins1', 'rager']);
  assert.deepEqual(sorted(stunCandidatesFor(CMDS, ['ins1', 'ins2', 'rager'])), ['ins1', 'ins2', 'rager']);
  assert.deepEqual(stunCandidatesFor(CMDS, []), [], 'zero celów = brak stuna');
});

test('H/UI dopasowanie: commandForSelection z wybranym stunem oddaje wariant z TYM stunem', () => {
  const cmd = commandForSelection(CMDS, { targets: ['rager', 'ins1'], stunTargetId: 'ins1' });
  assert.ok(cmd);
  assert.equal(cmd.stunTargetId, 'ins1');
  assert.deepEqual(sorted(cmd.targets), ['ins1', 'rager']);
  assert.equal(commandForSelection(CMDS, { targets: ['rager', 'ins1'], stunTargetId: 'ins2' }), null,
    'stun spoza zbioru celów = brak komendy (nie zgadujemy)');
});

test('H/UI kreator: warstwa 1 = cele (do 3), warstwa 2 = stun z wybranych; Zatwierdź dopiero po stunie', () => {
  withMiniDom((host) => {
    let done = null;
    const plan = multiTargetPlanOf(CMDS);
    renderMultiTargetWizard(host, {
      view: VIEW, session: SESSION, plan, commands: CMDS,
      sourceName: 'Aerith Rescue Mission',
      onComplete: (cmd) => { done = cmd; },
    });
    const labels = host.findAll((n) => String(n.className).includes('multi-target-slot-label')).map((n) => n.textContent);
    assert.ok(labels.some((l) => /^Cele \(zaznacz 0–3\)/.test(l)), `warstwa 1: cele (${JSON.stringify(labels)})`);
    assert.ok(labels.some((l) => /stun/i.test(l)), `sekcja stuna (${JSON.stringify(labels)})`);

    const targetRows = host.findAll((n) => String(n.className).includes('multi-target-row')
      && !String(n.className).includes('multi-target-slot-row'));
    const stunRows = host.findAll((n) => String(n.className).includes('multi-target-slot-row'));
    assert.equal(targetRows.length, 3, 'trzy wiersze celów');
    assert.equal(stunRows.length, 3, 'trzy wiersze stuna (po jednym na cel)');
    const input = (row) => row.children.find((c) => String(c.tagName).toLowerCase() === 'input');
    const T = plan.targets; // kolejność wierszy = kolejność planu
    const tapRow = (id) => input(targetRows[T.indexOf(id)]);
    const stunInput = (id) => input(stunRows[T.indexOf(id)]);
    const confirm = host.find((n) => String(n.className).includes('multi-target-confirm'));
    const status = () => host.find((n) => String(n.className).includes('multi-target-status'));

    assert.ok(stunRows.every((r) => input(r).disabled), 'bez wybranych celów żaden stun nie jest dostępny');
    assert.ok(!confirm.disabled, 'zero celów to legalny pusty wybór (brak stuna)');

    tapRow('rager').click(); tapRow('ins1').click();
    assert.equal(stunInput('ins2').disabled, true, 'nie-wybrany cel nie może dostać stuna');
    assert.equal(stunInput('rager').disabled, false, 'wybrany cel dostaje wiersz stuna');
    assert.equal(stunInput('ins1').disabled, false, 'wybrany cel dostaje wiersz stuna');
    assert.ok(confirm.disabled, 'dwa cele wybrane, stun nie — Zatwierdź wyłączone');
    assert.match(status().textContent, /stun/i, 'status nazywa brakującą warstwę');
    assert.equal(status().className.includes('is-problem'), true);

    stunInput('ins1').click();
    assert.ok(!confirm.disabled, 'stun wybrany — Zatwierdź odblokowane');
    assert.equal(stunInput('rager').checked, false, 'stun jest tylko na jednym celu');
    confirm.click();
    assert.deepEqual(sorted(done.targets), ['ins1', 'rager']);
    assert.equal(done.stunTargetId, 'ins1', 'zatwierdzona komenda niesie WYBRANY stun');
  });
});

test('H/UI kreator: jeden wybrany cel = stun jest jednoznaczny (bez dodatkowego kliknięcia)', () => {
  withMiniDom((host) => {
    let done = null;
    const plan = multiTargetPlanOf(CMDS);
    renderMultiTargetWizard(host, {
      view: VIEW, session: SESSION, plan, commands: CMDS,
      onComplete: (cmd) => { done = cmd; },
    });
    const targetRows = host.findAll((n) => String(n.className).includes('multi-target-row')
      && !String(n.className).includes('multi-target-slot-row'));
    const input = (row) => row.children.find((c) => String(c.tagName).toLowerCase() === 'input');
    const confirm = host.find((n) => String(n.className).includes('multi-target-confirm'));
    input(targetRows[plan.targets.indexOf('rager')]).click();
    assert.ok(!confirm.disabled, 'jedyny kandydat stuna = wybór bez pytania');
    confirm.click();
    assert.deepEqual([done.targets, done.stunTargetId], [['rager'], 'rager']);
  });
});

test('H/UI kreator: odznaczenie celu, który dostał stun, zdejmuje stun z wyboru (nie zostaje po cichu)', () => {
  withMiniDom((host) => {
    let done = null;
    const plan = multiTargetPlanOf(CMDS);
    renderMultiTargetWizard(host, {
      view: VIEW, session: SESSION, plan, commands: CMDS,
      onComplete: (cmd) => { done = cmd; },
    });
    const targetRows = host.findAll((n) => String(n.className).includes('multi-target-row')
      && !String(n.className).includes('multi-target-slot-row'));
    const stunRows = host.findAll((n) => String(n.className).includes('multi-target-slot-row'));
    const input = (row) => row.children.find((c) => String(c.tagName).toLowerCase() === 'input');
    const T = plan.targets;
    const confirm = host.find((n) => String(n.className).includes('multi-target-confirm'));
    input(targetRows[T.indexOf('rager')]).click();
    input(targetRows[T.indexOf('ins1')]).click();
    input(stunRows[T.indexOf('ins1')]).click();
    input(targetRows[T.indexOf('ins1')]).click(); // zdejmij ins1 z celów
    assert.equal(input(stunRows[T.indexOf('ins1')]).disabled, true, 'stun na odznaczonym celu wyszarzony');
    assert.ok(!confirm.disabled, 'został jeden cel = stun jednoznaczny (rager)');
    confirm.click();
    assert.deepEqual([done.targets, done.stunTargetId], [['rager'], 'rager']);
  });
});
