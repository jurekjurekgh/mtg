// Batch 62 / T5 — kreator rzutu Chocobo Kick: trzeci wymiar „ląd do zwrotu"
// (koszt niemanowy kickera, CR 702.33a). Plan z KSZTAŁTU komend silnika
// (ADR 0002), zatwierdzenie zwraca komendę z legalCommands (L48).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMultiTargetWizard } from '../src/table/choice-request.js';
import { multiTargetPlanOf } from '../src/table/multi-target.js';
import { commandOptionKey } from '../src/table/session.js';

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
    /**
     * Klik z natywną AKTYWACJĄ (jak w jsdomie Żywego Testera): klik w
     * `<input type=checkbox|radio>` przełącza zaznaczenie i ogłasza `change`;
     * klik w `<label>` trafia w jego ptaszek. M288/A — kreator wielocelowy
     * używa ptaszków `<input>` (takich samych jak wizard walki), więc klik
     * w wiersz MUSI coś znaczyć, inaczej test mierzy pustkę.
     */
    click() {
      const input = this.tagName === 'input' ? this
        : (this.children ?? []).find((c) => c.tagName === 'input') ?? null;
      if (input && (input.type === 'checkbox' || input.type === 'radio')) {
        if (input.disabled) return;
        input.checked = input.type === 'radio' ? true : !input.checked;
        for (const l of input.listeners.change ?? []) l({});
        return;
      }
      for (const l of this.listeners.click ?? []) l({});
    }
    fire(type, e = {}) { for (const l of this.listeners[type] ?? []) l(e); }
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


const kick = (mine, foe, land) => ({ type: 'cast_spell', playerId: 'p1', objectId: 'k', targets: [mine, foe], kicked: true, kickerLandId: land });
const CMDS = [kick('m1', 'f1', 'forest'), kick('m1', 'f1', 'island'), kick('m1', 'f2', 'forest'), kick('m1', 'f2', 'island'),
  kick('m2', 'f1', 'forest'), kick('m2', 'f1', 'island'), kick('m2', 'f2', 'forest'), kick('m2', 'f2', 'island')];
const VIEW = { players: [{ id: 'p1' }, { id: 'p2' }], zones: { battlefield: [] } };
const SESSION = { nameOf: (id) => id, nameOfObject: (id) => id, cardDetails: () => null };

test('B62/176 UI: plan wielocelowy dostaje wymiar kosztu z lądami z komend silnika', () => {
  const plan = multiTargetPlanOf(CMDS);
  assert.equal(plan.costKey, 'kickerLandId');
  assert.deepEqual(plan.costs, ['forest', 'island']);
  assert.match(plan.costLabel, /Zwrot lądu/);
  assert.equal(plan.slots.length, 2, 'dwie pozycje celu zostają');
  // Jeden ląd w całej grupie = brak wyboru, brak wymiaru.
  assert.equal(multiTargetPlanOf(CMDS.filter((c) => c.kickerLandId === 'forest')).costKey, undefined);
});

test('B62/176 UI: kreator wymaga wyboru lądu i oddaje komendę z DOKŁADNIE tym lądem', () => {
  withMiniDom((host) => {
    let done = null;
    renderMultiTargetWizard(host, {
      view: VIEW, session: SESSION, plan: multiTargetPlanOf(CMDS), commands: CMDS,
      sourceName: 'Chocobo Kick', slotLabels: ['twój stwór', 'stwór przeciwnika'],
      onComplete: (cmd) => { done = cmd; },
    });
    const labels = host.findAll((n) => String(n.className).includes('multi-target-slot-label')).map((n) => n.textContent);
    assert.ok(labels.some((l) => l.includes('Zwrot lądu')), `sekcja kosztu (${JSON.stringify(labels)})`);
    const confirm = host.find((n) => String(n.className).includes('multi-target-confirm'));
    const pick = (text, nth = 0) => host.findAll((n) => String(n.className).includes('multi-target-row'))
      .filter((row) => row.textContent.includes(text))[nth]
      .children.find((c) => String(c.tagName).toLowerCase() === 'input');
    pick('m2').click(); pick('f1').click();
    assert.ok(confirm.disabled, 'cele wybrane, ląd NIE — dalej wyłączone (nie wolno wybrać lądu za gracza)');
    const status = host.find((n) => String(n.className).includes('multi-target-status')).textContent;
    assert.match(status, /Zwrot lądu/);
    pick('island').click();
    assert.ok(!confirm.disabled, 'komplet wyborów odblokowuje Zatwierdź');
    confirm.click();
    assert.deepEqual([done.targets, done.kickerLandId], [['m2', 'f1'], 'island']);
  });
});

test('B62/176 UI: klucz opcji komendy rozróżnia wariant kicked i ląd (ptaszek wyciszenia, sonda)', () => {
  const keys = new Set([...CMDS, { ...CMDS[0], kicked: undefined, kickerLandId: undefined }].map(commandOptionKey));
  assert.equal(keys.size, 9, 'osiem wariantów kicked + zwykły rzut mają osobne klucze');
});
