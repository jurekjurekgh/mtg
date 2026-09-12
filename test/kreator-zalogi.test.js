import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crewPlanOf, crewWizardPlanFor, crewSelectionPower, commandForCrewSelection } from '../src/table/multi-target.js';
import { commandLabel, cardInfo, buildStateOverlay } from '../src/table/render.js';
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
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.text = ''; }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(child) { this.children.push(child); return child; }
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
