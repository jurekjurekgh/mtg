// F3 (sesja arena/01a07711, audyt PR #101 + pętla jakości) — POZYCJA CELU
// OPCJONALNA w kreatorze wielocelowym (tryb „wskaż po jednym celu dla każdej
// pozycji", M207).
//
// Zgłoszenie: Żywy Tester (worek-mroczny|theros, seed 13, profil hoarder)
// przerwał partię na „Assert Perfection — wskaż po jednym celu dla każdej
// pozycji": 5 prób, „nie złożono legalnego wyboru (zaznaczonych 1/4)". Silnik
// jest POPRAWNY od Batch 45 (B45/9): pozycja `optional: true` („up to one
// target") enumeruje też wariant z `null` na tej pozycji. Luka jest w UI:
// tryb pozycyjny wymagał zaznaczenia WSZYSTKICH slotów (`commandForSlots`
// odrzucał jakikolwiek null), więc wariant 1-celowy był niemożliwy do zagrania
// z panelu, a przy zerze wrogich stworów czar w ogóle nie dał się rzucić —
// odchyłka od Oracle (ADR 0022) w warstwie prezentacji.
//
// Reguła: pusta pozycja OPCJONALNA = `null` w komendzie (wariant silnika
// „bez celu na tej pozycji"); pusta pozycja OBOWIĄZKOWA = wybór niekompletny.
// Deskryptor `optional` czytany z KOMEND silnika (gdzie indziej niż karta —
// bez przypadków specjalnych po nazwie, ADR 0002).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { multiTargetPlanOf } from '../src/table/multi-target.js';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

/** Warianty jak u Assert Perfection: pozycja 1 obowiązkowa, pozycja 2 opcjonalna (null w silniku). */
function slotOptionalCommands() {
  return [
    { type: 'cast_spell', playerId: 'p1', objectId: 'assert', targets: ['c0', null] },
    { type: 'cast_spell', playerId: 'p1', objectId: 'assert', targets: ['c0', 'p2'] },
  ];
}

test('F3/1: plan pozycyjny zna opcjonalność pozycji (deskryptor z komend, nie z karty)', () => {
  const plan = multiTargetPlanOf(slotOptionalCommands());
  assert.ok(plan, 'warianty o równej długości celów mają plan pozycyjny');
  assert.equal(plan.slots?.length, 2, 'dwie pozycje celu');
  assert.deepEqual(plan.slotOptional, [false, true],
    'pozycja 2 bywa null w komendach silnika = opcjonalna');
  assert.deepEqual(plan.slots[0], ['c0'], 'null nie jest kandydatem pozycji');
  assert.deepEqual(plan.slots[1], ['p2']);
});

test('F3/2: Knockout-kształt (wszystkie pozycje obowiązkowe) ma slotOptional [false, false]', () => {
  const cmds = [
    { type: 'cast_spell', playerId: 'p1', objectId: 'ko', targets: ['c0', 'p2'] },
    { type: 'cast_spell', playerId: 'p1', objectId: 'ko', targets: ['c1', 'p2'] },
  ];
  const plan = multiTargetPlanOf(cmds);
  assert.ok(plan?.slots, 'plan pozycyjny');
  assert.deepEqual(plan.slotOptional, [false, false], 'żadna pozycja nie bywa null');
});

test('F3/3 (UI): własny stwór + PUSTA pozycja opcjonalna = legalna komenda „pump bez ugryzienia"', async () => {
  const { renderMultiTargetWizard } = await import('../src/table/choice-request.js');
  const commands = slotOptionalCommands();
  const plan = multiTargetPlanOf(commands);
  const { host, completed } = await kreatorZPrzechwytem({ plan, commands });
  // Zaznacz TYLKO pozycję 1 (własny stwór); pozycja 2 (opcjonalna) zostaje pusta.
  const wierszWlasny = host.findAll((n) => String(n.className).includes('multi-target-toggle'))
    .find((n) => String(n.name ?? '').includes('multi-target-slot-0'));
  assert.ok(wierszWlasny, 'pozycja 1 ma wiersz wyboru');
  wierszWlasny.click();
  const confirm = host.findAll((n) => String(n.className).includes('multi-target-confirm'))[0];
  assert.ok(confirm && !confirm.disabled,
    'Zatwierdź aktywny bez zaznaczania pozycji opcjonalnej (B45/9: wariant [c0, null] jest legalny)');
  confirm.click();
  assert.ok(completed.cmd, 'zatwierdzenie oddaje komendę');
  assert.deepEqual(completed.cmd.targets, ['c0', null], 'pusta pozycja opcjonalna = null (wariant silnika)');
  assert.ok(commands.includes(completed.cmd), 'komenda pochodzi z legalCommands — silnik ją zna (L48)');
});

test('F3/4 (UI): pozycja obowiązkowa bez zaznaczenia dalej blokuje Zatwierdź (anty-over-fix)', async () => {
  const { renderMultiTargetWizard } = await import('../src/table/choice-request.js');
  const commands = [
    { type: 'cast_spell', playerId: 'p1', objectId: 'ko', targets: ['c0', 'p2'] },
    { type: 'cast_spell', playerId: 'p1', objectId: 'ko', targets: ['c1', 'p2'] },
  ];
  const plan = multiTargetPlanOf(commands);
  const { host } = await kreatorZPrzechwytem({ plan, commands });
  const status = () => host.findAll((n) => String(n.className).includes('multi-target-status'))[0]?.text ?? '';
  assert.match(status(), /Brakuje: /, 'status wymienia brakujące pozycje obowiązkowe');
  // Zaznacz tylko pozycję 1 — pozycja 2 jest OBOWIĄZKOWA, Zatwierdź ma zostać wyłączony.
  const slot0 = host.findAll((n) => String(n.className).includes('multi-target-toggle'))
    .find((n) => String(n.name ?? '').includes('multi-target-slot-0'));
  slot0.click();
  const confirm = host.findAll((n) => String(n.className).includes('multi-target-confirm'))[0];
  assert.ok(confirm.disabled, 'obowiązkowa pozycja 2 pusta → bez zatwierdzenia');
  assert.match(status(), /Brakuje: /, 'status mówi, czego brakuje (M200)');
});

test('F3/5 (UI): wybór na pozycji opcjonalnej daje wariant z ugryzieniem', async () => {
  const { renderMultiTargetWizard } = await import('../src/table/choice-request.js');
  const commands = slotOptionalCommands();
  const plan = multiTargetPlanOf(commands);
  const { host, completed } = await kreatorZPrzechwytem({ plan, commands });
  const toggles = host.findAll((n) => String(n.className).includes('multi-target-toggle'));
  toggles.find((n) => String(n.name ?? '').includes('multi-target-slot-0')).click();
  toggles.find((n) => String(n.name ?? '').includes('multi-target-slot-1')).click();
  host.findAll((n) => String(n.className).includes('multi-target-confirm'))[0].click();
  assert.deepEqual(completed.cmd?.targets, ['c0', 'p2'], 'pełny wybór = wariant z ugryzieniem');
});

test('F3/6 (pin przez realną ścieżkę, L21/3): legalCommands silnika → kreator → komenda', () => {
  // Ten sam kształt, co B45/9, ale przez renderMultiTargetWizard: Assert Perfection
  // z prawdziwego rejestru, rzut legalny, zatwierdzenie pochodzi z oferty silnika.
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  wlozKarte(state, 'assert', 'assert-perfection', 'p1', 'hand');
  wlozKarte(state, 'mine', 'highland-game', 'p1');
  wlozKarte(state, 'theirs', 'alaborn-trooper', 'p2');
  addMana(state, 'p1', 2, { colors: ['G'] });
  const commands = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'assert');
  assert.ok(commands.some((c) => (c.targets ?? [])[1] == null), 'silnik: wariant bez ugryzienia (B45/9)');
  const plan = multiTargetPlanOf(commands);
  assert.ok(plan?.slots, 'warianty Assert Perfection tworzą plan pozycyjny');
  assert.deepEqual(plan.slotOptional, [false, true]);
  const bezUgryzienia = commands.find((c) => (c.targets ?? [])[1] == null);
  assert.equal(plan.slots[0].includes('mine'), true, 'pozycja 1: własne stwory');
  assert.equal(plan.slots[1].includes('theirs'), true, 'pozycja 2: stwor wroga');
  assert.ok(commands.includes(bezUgryzienia));
});

function wlozKarte(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

/** Mini-DOM (wzorzec m195/m172) — render jest czysty, bez prawdziwego DOM. */
async function kreatorZPrzechwytem({ plan, commands }) {
  const { renderMultiTargetWizard } = await import('../src/table/choice-request.js');
  return withMiniDom((host) => {
    const completed = { cmd: null };
    renderMultiTargetWizard(host, {
      view: VIEW, session: SESSION, plan, commands, sourceName: 'Assert Perfection',
      onComplete: (cmd) => { completed.cmd = cmd; },
      onCancel: () => {},
    });
    return { host, completed };
  });
}

const VIEW = {
  playerId: 'p1',
  players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
  zones: { battlefield: [
    { id: 'c0', cardId: 'hill-giant', controllerId: 'p1' },
    { id: 'c1', cardId: 'hill-giant', controllerId: 'p2' },
    { id: 'p2', name: 'Nieprzyjaciel', controllerId: 'p2' },
  ] },
};
const SESSION = { nameOf: (id) => id ?? '?', nameOfObject: (id) => id ?? '?', faceDownName: () => 'morph' };

function withMiniDom(run) {
  class MiniEl {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.listeners = {};
      this.className = ''; this.text = ''; this.dataset = {}; this.disabled = false;
      this.type = ''; this.checked = false; this.name = '';
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
        for (const l of input.listeners.change ?? []) l({ stopPropagation() {}, preventDefault() {} });
        return;
      }
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
