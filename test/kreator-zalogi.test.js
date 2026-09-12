import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crewPlanOf, crewWizardPlanFor, crewSelectionPower, commandForCrewSelection } from '../src/table/multi-target.js';
import { commandLabel, cardInfo, buildStateOverlay } from '../src/table/render.js';
import { renderMultiTargetWizard } from '../src/table/choice-request.js';
import { createCardRegistry } from '../src/cards/card-data.js';

/**
 * A1/A2/A4 (znaleziska właściciela 2026-09-12, Balamb Garden, Airborne):
 * warstwa stołu dla crew/saddle.
 *
 *  - A1: klik w „Aktywuj: <pojazd>" nie mówił, co robi — etykieta nazywa
 *    czynność po imieniu (Obsadź/Osiodłaj), bo klik otwiera kreator załogi.
 *  - A2: silnik daje JEDNĄ ofertę z domyślnym podzbiorem (E2); człowiek
 *    zmienia wybór w kreatorze (checkboksy + licznik mocy ≥ N). Plan
 *    (crewPlanOf) i komenda z zaznaczenia (commandForCrewSelection) —
 *    kontrakt jak discardMode: UI buduje, silnik waliduje.
 *  - A4: rozstrzygnięte crew (CR 702.122e) widać na kaflu („obsadzony").
 */

const REGISTRY = createCardRegistry();

const NAMES = {
  veh: 'Irontread Crusher', mount: 'Trained Arynx',
  big: 'Woolly Loxodon', helper: 'Ainok Tracker', pup: 'Grizzly Bears',
};

class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {};
    this.className = ''; this.text = ''; this.type = ''; this.checked = false;
    this.disabled = false; this.name = ''; this.dataset = {};
  }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...nodes) { this.children = nodes.flat(); }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  click() { for (const l of this.listeners.click ?? []) l({ preventDefault() {}, stopPropagation() {} }); }
  emit(type) { for (const l of this.listeners[type] ?? []) l({}); }
  all(pred, out = []) { if (pred(this)) out.push(this); for (const c of this.children) c.all(pred, out); return out; }
  byClass(cls) { return this.all((el) => String(el.className).split(/\s+/).includes(cls)); }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
}
globalThis.document = { createElement: (tag) => new MiniEl(tag) };

const SESSION = {
  view: () => viewWith(),
  nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
  nameOfObject: (o) => NAMES[o?.id] ?? o?.cardId ?? '?',
  cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
  colorsOf: () => [],
  abilitiesOf: (cardId) => REGISTRY.get(cardId)?.abilities ?? [],
};

function viewWith() {
  return {
    playerId: 'p1',
    turn: { number: 5, step: 'precombat_main' },
    players: [{ id: 'p1', life: 20 }, { id: 'p2', life: 20 }],
    zones: {
      battlefield: [
        { id: 'veh', cardId: 'irontread-crusher' },
        { id: 'mount', cardId: 'trained-arynx' },
        { id: 'big', cardId: 'woolly-loxodon' },
        { id: 'helper', cardId: 'ainok-tracker' },
      ],
      hand: [], graveyard: [], exile: [], stack: [],
    },
    legalCommands: [],
  };
}

const BASE = { type: 'activate_ability', playerId: 'p1', objectId: 'veh', abilityIndex: 0 };

// --- crewPlanOf -----------------------------------------------------------

test('A2/1: plan niesie kandydatów, moce, próg N i default z oferty', () => {
  const plan = crewPlanOf({
    base: BASE,
    candidates: ['big', 'helper', 'pup'],
    powers: { big: 4, helper: 3, pup: 2 },
    neededPower: 3,
    defaultIds: ['helper'],
  });
  assert.ok(plan?.crewMode);
  assert.deepEqual(plan.targets, ['big', 'helper', 'pup']);
  assert.deepEqual(plan.powers, { big: 4, helper: 3, pup: 2 });
  assert.equal(plan.neededPower, 3);
  assert.deepEqual(plan.defaultIds, ['helper']);
  assert.equal(plan.saddle, false);
  assert.equal(plan.minTargets, 1);
  assert.equal(plan.objectId, 'veh');
});

test('A2/2: default spada do kandydatów (staleness: stwór zniknął)', () => {
  const plan = crewPlanOf({
    base: BASE,
    candidates: ['big'],
    powers: { big: 4 },
    neededPower: 3,
    defaultIds: ['big', 'ghost'],
  });
  assert.deepEqual(plan.defaultIds, ['big']);
});

test('A2/3: saddle niesie własną flagę i etykietę', () => {
  const plan = crewPlanOf({
    base: { ...BASE, objectId: 'mount', abilityIndex: 1 },
    candidates: ['helper'],
    powers: { helper: 3 },
    neededPower: 2,
    defaultIds: ['helper'],
    saddle: true,
  });
  assert.equal(plan.saddle, true);
  assert.match(plan.itemLabel, /osiodła/);
});

test('A2/4: plan odrzuca zły kształt (null zamiast kreatora-widma)', () => {
  const good = {
    base: BASE, candidates: ['big'], powers: { big: 4 }, neededPower: 3, defaultIds: ['big'],
  };
  assert.equal(crewPlanOf({ ...good, base: { ...BASE, type: 'cast_spell' } }), null);
  assert.equal(crewPlanOf({ ...good, base: { ...BASE, objectId: null } }), null);
  assert.equal(crewPlanOf({ ...good, candidates: [] }), null);
  assert.equal(crewPlanOf({ ...good, neededPower: 0 }), null);
  assert.equal(crewPlanOf({ ...good, powers: { big: NaN } }), null);
});

// --- crewSelectionPower / commandForCrewSelection --------------------------

test('A2/5: licznik sumuje moce zaznaczenia', () => {
  const plan = crewPlanOf({
    base: BASE, candidates: ['big', 'pup'], powers: { big: 4, pup: 2 },
    neededPower: 3, defaultIds: [],
  });
  assert.equal(crewSelectionPower(plan, []), 0);
  assert.equal(crewSelectionPower(plan, ['pup']), 2);
  assert.equal(crewSelectionPower(plan, ['big', 'pup']), 6);
});

test('A2/6: komenda z zaznaczenia — kształt oferty silnika, próg N', () => {
  const plan = crewPlanOf({
    base: BASE, candidates: ['big', 'helper'], powers: { big: 4, helper: 3 },
    neededPower: 3, defaultIds: ['helper'],
  });
  assert.deepEqual(commandForCrewSelection(plan, ['big']), {
    type: 'activate_ability', playerId: 'p1', objectId: 'veh', abilityIndex: 0,
    crewCreatureIds: ['big'],
  });
  // Za mało mocy, pusty wybór, dublet i obcy kandydat: brak komendy.
  assert.equal(commandForCrewSelection(plan, []), null);
  assert.equal(commandForCrewSelection(plan, ['big', 'big']), null);
  assert.equal(commandForCrewSelection(plan, ['ghost']), null);
  const needy = crewPlanOf({
    base: BASE, candidates: ['pup'], powers: { pup: 2 },
    neededPower: 3, defaultIds: [],
  });
  assert.equal(commandForCrewSelection(needy, ['pup']), null);
});

// --- A1: czasownik etykiety -------------------------------------------------

test('A1/1: crew nazywa czynność „Obsadź", saddle „Osiodłaj"', () => {
  const view = viewWith();
  const crew = commandLabel(
    { type: 'activate_ability', playerId: 'p1', objectId: 'veh', abilityIndex: 0, crewCreatureIds: ['big'] },
    SESSION, view,
  );
  assert.match(crew, /^Obsadź: Irontread Crusher/);
  assert.match(crew, /tapnij Woolly Loxodon/);
  const saddle = commandLabel(
    { type: 'activate_ability', playerId: 'p1', objectId: 'mount', abilityIndex: 1, crewCreatureIds: ['helper'] },
    SESSION, view,
  );
  assert.match(saddle, /^Osiodłaj: Trained Arynx/);
  assert.match(saddle, /tapnij Ainok Tracker/);
});

test('A1/2: zwykła zdolność zostaje przy „Aktywuj"', () => {
  const view = viewWith();
  const label = commandLabel(
    { type: 'activate_ability', playerId: 'p1', objectId: 'mount', abilityIndex: 0 },
    SESSION, view,
  );
  assert.match(label, /^Aktywuj: Trained Arynx/);
});

// --- A4: badge „obsadzony" ---------------------------------------------------

test('A4/UI1: cardInfo mapuje flagę silnika na crewedNow', () => {
  const info = cardInfo(SESSION, { id: 'veh', cardId: 'irontread-crusher', zone: 'battlefield', crewed: true });
  assert.equal(info.crewedNow, true);
  const plain = cardInfo(SESSION, { id: 'veh', cardId: 'irontread-crusher', zone: 'battlefield' });
  assert.equal(plain.crewedNow, false);
});

test('A4/UI2: badge „obsadzony" tylko przy rozstrzygniętym crew', () => {
  const badgesOf = (info) => {
    const visual = new MiniEl('div');
    buildStateOverlay(visual, { isBattlefield: true, ...info });
    return visual.descendants()
      .filter((el) => String(el.className).includes('ovl-badge'))
      .map((el) => el.textContent);
  };
  assert.ok(badgesOf({ crewedNow: true }).includes('obsadzony'));
  assert.ok(!badgesOf({}).includes('obsadzony'));
});

// --- crewWizardPlanFor (lustro oferty silnika) ------------------------------

const BF = [
  { id: 'veh', controllerId: 'p1', kind: 'artifact', tapped: false, power: 0 },
  { id: 'big', controllerId: 'p1', kind: 'creature', tapped: false, power: 4 },
  { id: 'pup', controllerId: 'p1', kind: 'creature', tapped: false, power: 2 },
  { id: 'sick', controllerId: 'p1', kind: 'creature', tapped: false, power: 3, summoningSickness: true },
  { id: 'tapped', controllerId: 'p1', kind: 'creature', tapped: true, power: 5 },
  { id: 'foe', controllerId: 'p2', kind: 'creature', tapped: false, power: 9 },
];

test('A2/7: filtr kandydatów = lustro silnika (własne, nietapnięte, stwory, bez źródła)', () => {
  const plan = crewWizardPlanFor({
    cmd: { ...BASE, crewCreatureIds: ['big'] },
    playerId: 'p1', neededPower: 3, battlefield: BF,
  });
  // Chory przywoływania MOŻE obsadzać (crew nie atakuje); tapnięty, wrogi
  // i sam pojazd wypadają.
  assert.deepEqual(plan.targets, ['big', 'pup', 'sick']);
  assert.deepEqual(plan.powers, { big: 4, pup: 2, sick: 3 });
  assert.deepEqual(plan.defaultIds, ['big']);
});

test('A2/8: brak kreatora bez realnego wyboru (null → default prosto)', () => {
  const one = [
    { id: 'veh', controllerId: 'p1', kind: 'artifact', tapped: false, power: 0 },
    { id: 'big', controllerId: 'p1', kind: 'creature', tapped: false, power: 4 },
  ];
  assert.equal(crewWizardPlanFor({
    cmd: { ...BASE, crewCreatureIds: ['big'] },
    playerId: 'p1', neededPower: 3, battlefield: one,
  }), null);
  // Obcy gracz i komenda spoza crew też nie otwierają kreatora.
  assert.equal(crewWizardPlanFor({
    cmd: { ...BASE, playerId: 'p2', crewCreatureIds: ['big'] },
    playerId: 'p1', neededPower: 3, battlefield: BF,
  }), null);
  assert.equal(crewWizardPlanFor({
    cmd: { ...BASE },
    playerId: 'p1', neededPower: 3, battlefield: BF,
  }), null);
});

// --- A2/DOM: kreator załogi na żywym rendererze (MiniEl, wzorzec m301) ------

const WIZ_VIEW = {
  playerId: 'p1',
  players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
  zones: {
    battlefield: [
      { id: 'veh', cardId: 'irontread-crusher', controllerId: 'p1' },
      { id: 'big', cardId: 'woolly-loxodon', controllerId: 'p1' },
      { id: 'pup', cardId: 'highland-game', controllerId: 'p1' },
    ],
  },
};
const WIZ_SESSION = { nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId };
const WIZ_BF = [
  { id: 'veh', controllerId: 'p1', kind: 'artifact', tapped: false, power: 0 },
  { id: 'big', controllerId: 'p1', kind: 'creature', tapped: false, power: 4 },
  { id: 'pup', controllerId: 'p1', kind: 'creature', tapped: false, power: 2 },
];

function renderCrew({ defaultIds, neededPower = 3, onComplete = () => {}, onCancel = () => {} }) {
  const plan = crewWizardPlanFor({
    cmd: { ...BASE, crewCreatureIds: defaultIds },
    playerId: 'p1', neededPower, battlefield: WIZ_BF,
  });
  assert.ok(plan, 'plan kreatora');
  const host = new MiniEl('div');
  renderMultiTargetWizard(host, {
    view: WIZ_VIEW, session: WIZ_SESSION, plan, commands: [],
    intro: 'Obsadź: Irontread Crusher — zaznacz załogę do tapnięcia:',
    onOpenCard: () => {}, onComplete, onCancel,
  });
  return host;
}

test('A2/DOM1: wiersze z mocą, default pre-check, bramka progu, Zatwierdź buduje komendę', () => {
  let completed = null;
  const host = renderCrew({ defaultIds: ['pup'], onComplete: (cmd) => { completed = cmd; } });
  // Wiersze nazywają stwory i ich moce (kolejność = plan.targets).
  const text = host.textContent;
  assert.match(text, /Woolly Loxodon.*\(moc 4\)/);
  assert.match(text, /Highland Game.*\(moc 2\)/);
  const toggles = host.byClass('multi-target-toggle');
  assert.equal(toggles.length, 2);
  const status = () => host.byClass('multi-target-status')[0].textContent;
  const confirm = host.byClass('multi-target-confirm')[0];
  // Default (pup, moc 2 < 3) startuje zaznaczony, ale próg nie puszcza.
  assert.equal(toggles[0].checked, false);
  assert.equal(toggles[1].checked, true);
  assert.match(status(), /Moc załogi: 2 \/ ≥ 3 — brakuje 1/);
  assert.equal(confirm.disabled, true);
  // Dołożenie big (4) przekracza próg — licznik i bramka puszczają.
  toggles[0].checked = true; toggles[0].emit('change');
  assert.match(status(), /Moc załogi: 6 \/ ≥ 3 — gotowe/);
  assert.equal(confirm.disabled, false);
  confirm.click();
  assert.deepEqual(completed, {
    type: 'activate_ability', playerId: 'p1', objectId: 'veh', abilityIndex: 0,
    crewCreatureIds: ['pup', 'big'],
  });
});

test('A2/DOM2: pusty start i Anuluj (ścieżka odmowy kreatora)', () => {
  let cancelled = 0;
  const host = renderCrew({ defaultIds: [], onCancel: () => { cancelled += 1; } });
  const toggles = host.byClass('multi-target-toggle');
  assert.ok(toggles.every((t) => t.checked === false));
  assert.match(host.byClass('multi-target-status')[0].textContent, /Wybierz załogę o łącznej mocy ≥ 3/);
  assert.equal(host.byClass('multi-target-confirm')[0].disabled, true);
  host.byClass('multi-target-cancel')[0].click();
  assert.equal(cancelled, 1);
});
